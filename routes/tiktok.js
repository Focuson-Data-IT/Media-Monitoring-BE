const express = require('express');
const router = express.Router();
const getDataTiktok = require('../controllers/getDataTiktok');
const db = require('../models/db'); // Pastikan ini diatur sesuai koneksi database Anda
const async = require('async');

let requestCount = 0;
const maxRequestsPerMinute = 240;
const threadRequestLimit = 10; // Sesuaikan dengan jumlah maksimum per thread sebelum istirahat
const threadRestTime = 300; // Waktu istirahat (dalam ms)
const totalThreads = 20; // Jumlah thread paralel
const delay = 60000 / maxRequestsPerMinute;

const trackRequests = async () => {
    requestCount++;
    console.log(`Request count: ${requestCount}`);
    if (requestCount >= maxRequestsPerMinute) {
        console.log(`Reached ${maxRequestsPerMinute} requests. Resting for ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        requestCount = 0; // Reset request count
    }
};

const processQueue = async (items, processFunction) => {
    let threadRequestCount = 0; // Melacak jumlah permintaan per thread

    const queue = async.queue(async (item, callback) => {
        try {
            // Eksekusi fungsi pemrosesan
            await processFunction(item);
            threadRequestCount++;

            // Lacak jumlah permintaan global
            await trackRequests();

            // Periksa apakah thread mencapai batas permintaan
            if (threadRequestCount >= threadRequestLimit) {
                console.log(`Thread reached ${threadRequestLimit} requests. Resting for ${threadRestTime / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, threadRestTime));
                threadRequestCount = 0; // Reset hitungan permintaan per thread
            }
        } catch (error) {
            console.error(`Error processing item: ${error.message}`);
        } finally {
            // Tunggu sesuai delay sebelum memproses permintaan berikutnya
            setTimeout(callback, delay);
        }
    }, totalThreads);

    // Tambahkan item ke antrian
    queue.push(items);

    // Tunggu hingga semua tugas selesai
    await queue.drain();
};

// Eksekusi getData berdasarkan semua username di listAkun
router.get('/getData', async (req, res) => {
    // Fetch data for Tiktok
    try {
        const [rows] = await db.query('SELECT client_account, kategori, platform, username FROM listAkun WHERE platform = "tiktok"');

        await processQueue(rows, async (row) => {
            try {
                console.info('Fetching data for user:' + row.username);
        
                // Panggil fungsi getDataUser
                await getDataTiktok.getDataUser(
                    row.username,
                    row.client_account,
                    row.kategori,
                    row.platform
                );
        
                console.log(`Data for user ${row.username} has been fetched and saved.`);
            } catch (error) {
                console.error(`Error fetching data for user ${row.username}:`, error.message);
            }
        });        

        res.send('Data getData for all users have been fetched and saved.');
    } catch (error) {
        console.error('Error executing getData:', error.message);
        res.status(500).send(`Error executing getData: ${error.message}`);
    }
});

// Eksekusi getPost berdasarkan semua username di listAkun
router.post('/getPost', async (req, res) => {
    // Fetch data for Tiktok
    try {
        const [rows] = await db.query('SELECT * FROM users WHERE platform = "tiktok"');

        await processQueue(rows, async (row) => {
            console.log(`Fetching posts for user: ${row.username}...`);
            await getDataTiktok.getDataPost(
                row.username,
                row.client_account,
                row.kategori,
                row.platform,
                row.followers,
                row.following
            );
            console.log(`Posts for user ${row.username} have been fetched and saved.`);
        });

        res.send('Data getPost for all users have been fetched and saved.');
    } catch (error) {
        console.error('Error executing getPost:', error.message);
        res.status(500).send(`Error executing getPost: ${error.message}`);
    }
});

// Endpoint untuk eksekusi getComment
router.get('/getComment', async (req, res) => {
    const { fromStart } = req.query; // Parameter untuk menentukan apakah proses dimulai dari awal
    const processFromStart = fromStart === 'true';

    // Fetch Main Comment for Tiktok
    try {
        let query = 'SELECT unique_id_post FROM posts WHERE platform = "tiktok"';
        
        // Jika proses tidak dimulai dari awal, hanya ambil data yang belum diproses
        if (!processFromStart) {
            query = `
                SELECT p.unique_id_post
                FROM posts p
                LEFT JOIN mainComments mc ON p.unique_id_post = mc.unique_id_post
                WHERE mc.unique_id_post IS NULL AND p.platform = "tiktok"
            `;
        }

        // Ambil data post
        const [rows] = await db.query(query);
        console.log(`Found ${rows.length} posts to process.`);

        await processQueue(rows, async (row) => {
            const unique_id_post = row.unique_id_post;
            console.log(`Fetching comments for post: ${unique_id_post}...`);

            // Ambil user_id, username, client_account, kategori, dan platform dari database berdasarkan unique_id_post
            const userQuery = `
                SELECT user_id, username, comments, client_account, kategori, platform
                FROM posts 
                WHERE unique_id_post = ? AND platform = "tiktok"
            `;
            const [userRows] = await db.query(userQuery, [unique_id_post]);

            if (userRows.length === 0) {
                console.log(`Post ${unique_id_post} not found in database.`);
                return; // Lanjutkan ke post berikutnya jika tidak ditemukan
            }

            const { user_id, username, comments, client_account, kategori, platform } = userRows[0];

            // Proses komentar jika jumlah komentar lebih dari 0
            if (comments > 0) {
                try {
                    await getDataTiktok.getDataComment(unique_id_post, user_id, username, client_account, kategori, platform);
                    console.log(`Comments for post ${unique_id_post} have been fetched and saved.`);
                } catch (err) {
                    console.error(`Error fetching comments for post ${unique_id_post}:`, err.message);
                }
            } else {
                console.log(`No comments for post ${unique_id_post}.`);
            }
        });

        res.send('Data getComment for all users have been fetched and saved.');
    } catch (error) {
        console.error('Error executing getComment:', error.message);
        res.status(500).json({ message: 'Terjadi kesalahan saat menjalankan proses getComment.', error: error.message });
    }

    // Fetch Child Comment for Tiktok
    try {
        let queryChild = 'SELECT comment_unique_id FROM mainComments WHERE platform = "tiktok"';
        
        // Jika proses tidak dimulai dari awal, hanya ambil data yang belum diproses
        if (!processFromStart) {
            queryChild = `
                SELECT p.comment_unique_id 
                FROM mainComments p
                LEFT JOIN childComments mc ON p.comment_unique_id = mc.comment_unique_id
                WHERE mc.comment_unique_id IS NULL AND p.platform = "tiktok"
            `;
        }

        // Ambil komentar anak
        const [childs] = await db.query(queryChild);
        console.log(`Found ${childs.length} child comments to process.`);

        await processQueue(childs, async (child) => {
            const comment_unique_id = child.comment_unique_id;
            console.log(`Fetching child comments for comment: ${comment_unique_id}...`);

            // Ambil user_id, username, unique_id_post, dan child_comment_count dari database
            const userQuery = `
                SELECT unique_id_post, user_id, username, comment_unique_id, child_comment_count, client_account, kategori, platform
                FROM mainComments 
                WHERE comment_unique_id = ? AND platform = "tiktok"
            `;
            const [userChild] = await db.query(userQuery, [comment_unique_id]);

            if (userChild.length === 0) {
                console.log(`Comment ${comment_unique_id} not found in database.`);
                return;
            }

            const { unique_id_post, user_id, username, client_account, child_comment_count, kategori, platform } = userChild[0];

            // Proses komentar anak jika jumlah komentar lebih dari 0
            if (child_comment_count > 0) {
                try {
                    await getDataTiktok.getDataChildComment(unique_id_post, user_id, username, comment_unique_id, client_account, kategori, platform);
                    console.log(`Child comments for comment ${comment_unique_id} have been fetched and saved.`);
                } catch (err) {
                    console.error(`Error fetching child comments for comment ${comment_unique_id}:`, err.message);
                }
            } else {
                console.log(`No child comments to fetch for comment ${comment_unique_id}.`);
            }
        });

        res.send('Data getChildComment for all users have been fetched and saved.');
    } catch (error) {
        console.error('Error executing getChildComment:', error.message);
        res.status(500).json({ message: 'Terjadi kesalahan saat menjalankan proses getChildComment.', error: error.message });
    }
});

module.exports = router;