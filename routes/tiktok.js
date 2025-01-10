const express = require('express');
const router = express.Router();
const getDataTiktok = require('../controllers/getDataTiktok');
const db = require('../models/db'); // Pastikan ini diatur sesuai koneksi database Anda
const async = require('async');

let requestCount = 0;
const maxRequestsPerMinute = 240;
const threadRequestLimit = 10;
const threadRestTime = 300; // Dalam ms
const totalThreads = 20;
const delay = 60000 / maxRequestsPerMinute;

const trackRequests = async () => {
    requestCount++;
    console.log(`Global request count: ${requestCount}`);
    if (requestCount >= maxRequestsPerMinute) {
        console.log(`Reached ${maxRequestsPerMinute} requests. Resting globally for ${delay / 1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        requestCount = 0;
    }
};

const processQueue = async (items, processFunction) => {
    let activeThreads = 0; // Untuk melacak jumlah thread aktif

    const queue = async.queue(async (item, callback) => {
        try {
            activeThreads++;
            let threadRequestCount = 0; // Reset untuk setiap thread

            // Proses item
            await processFunction(item);
            threadRequestCount++;

            // Lacak permintaan global
            await trackRequests();

            // Jika thread mencapai batas, istirahatkan
            if (threadRequestCount >= threadRequestLimit) {
                console.log(`Thread reached ${threadRequestLimit} requests. Resting thread for ${threadRestTime / 1000} seconds...`);
                await new Promise(resolve => setTimeout(resolve, threadRestTime));
                threadRequestCount = 0; // Reset untuk thread
            }
        } catch (error) {
            console.error(`Error processing item: ${error.message}`);
        } finally {
            activeThreads--;
            // Tunggu sebelum memproses permintaan berikutnya
            setTimeout(callback, delay);
        }
    }, totalThreads);

    // Tambahkan item ke antrian
    queue.push(items);

    // Tunggu hingga semua tugas selesai
    await queue.drain();

    console.log('All items in the queue have been processed.');
};

// Eksekusi getData berdasarkan semua username di listAkun
router.get('/getData', async (req, res) => {
    // Fetch data for Tiktok
    try {
        const [rows] = await db.query('SELECT * FROM listAkun WHERE platform = "tiktok"');

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

router.get('/getComment', async (req, res) => {
    const { fromStart } = req.query;
    const processFromStart = fromStart === 'true';

    try {
        // Step 1: Proses Main Comments
        console.log('Starting to fetch main comments...');
        let query = 'SELECT unique_id_post FROM posts WHERE platform = "tiktok"';
        
        if (!processFromStart) {
            query = `
                SELECT p.unique_id_post
                FROM posts p
                LEFT JOIN mainComments mc ON p.unique_id_post = mc.unique_id_post
                WHERE mc.unique_id_post IS NULL AND p.platform = "tiktok"
            `;
        }

        const [rows] = await db.query(query);
        console.log(`Found ${rows.length} posts to process for main comments.`);

        await processQueue(rows, async (row) => {
            const unique_id_post = row.unique_id_post;
            console.log(`Fetching comments for post: ${unique_id_post}...`);

            const userQuery = `
                SELECT user_id, username, comments, client_account, kategori, platform
                FROM posts 
                WHERE unique_id_post = ? AND platform = "tiktok"
            `;
            const [userRows] = await db.query(userQuery, [unique_id_post]);

            if (userRows.length === 0) {
                console.log(`Post ${unique_id_post} not found in database.`);
                return;
            }

            const { user_id, username, comments, client_account, kategori, platform } = userRows[0];

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

        console.log('Main comments processing completed.');

        // Step 2: Proses Child Comments
        console.log('Starting to fetch child comments...');
        let queryChild = 'SELECT comment_unique_id FROM mainComments WHERE platform = "tiktok"';

        if (!processFromStart) {
            queryChild = `
                SELECT p.comment_unique_id 
                FROM mainComments p
                LEFT JOIN childComments mc ON p.comment_unique_id = mc.comment_unique_id
                WHERE mc.comment_unique_id IS NULL AND p.platform = "tiktok"
            `;
        }

        const [childs] = await db.query(queryChild);
        console.log(`Found ${childs.length} child comments to process.`);

        await processQueue(childs, async (child) => {
            const comment_unique_id = child.comment_unique_id;
            console.log(`Fetching child comments for comment: ${comment_unique_id}...`);

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

        console.log('Child comments processing completed.');

        res.send('Data getComment and getChildComment for all users have been fetched and saved.');
    } catch (error) {
        console.error('Error executing getComment:', error.message);
        res.status(500).json({ message: 'Terjadi kesalahan saat menjalankan proses getComment.', error: error.message });
    }
});

module.exports = router;