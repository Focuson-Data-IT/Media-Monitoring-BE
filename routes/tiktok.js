const express = require('express');
const router = express.Router();
const getDataTiktok = require('../controllers/getDataTiktok');
const db = require('../models/db'); // Pastikan ini diatur sesuai koneksi database Anda
const async = require('async');

let requestCount = 0;
const maxRequestsPerMinute = 240;
const threadRequestLimit = 10;
const threadRestTime = 60000; // Dalam ms
const totalThreads = 20;
const delay = 60000;

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
    const { kategori } = req.query;
    // Fetch data for TikTok
    try {
        const [rows] = await db.query('SELECT * FROM listAkun WHERE platform = "TikTok"', [kategori]);

        await processQueue(rows, async (row) => {
            try {
                console.info('Fetching data for user:' + row.username);
        
                // Panggil fungsi getDataUser
                await getDataTiktok.getDataUser(
                    row.client_account,
                    row.kategori,
                    row.platform,
                    row.username
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
router.get('/getPost', async (req, res) => {
    const { kategori } = req.query;
    // Fetch data for TikTok
    try {
        const [rows] = await db.query('SELECT * FROM users WHERE platform = "TikTok"', [kategori]);

        await processQueue(rows, async (row) => {
            console.log(`Fetching posts for user: ${row.username}...`);
            await getDataTiktok.getDataPost(
                row.client_account,
                row.kategori,
                row.platform,
                row.username,
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

// 🔹 Fungsi untuk mengambil startDate dan endDate dari tabel `setting`
const getDateRange = async () => {
    try {
        const [rows] = await db.query('SELECT startDate, endDate FROM settings WHERE id = 1');
        if (rows.length === 0) throw new Error('Data setting tidak ditemukan.');

        return {
            startDate: new Date(rows[0].startDate).toISOString().split('T')[0],
            endDate: new Date(rows[0].endDate).toISOString().split('T')[0]
        };
    } catch (error) {
        console.error('❌ Error fetching date range from database:', error.message);
        return null;
    }
};

// 🔹 Endpoint untuk eksekusi getComment
router.get('/getComment', async (req, res) => {
    const { fromStart } = req.query;
    const processFromStart = fromStart === 'false';

    try {
        const dateRange = await getDateRange();
        if (!dateRange) {
            return res.status(500).json({ message: 'Gagal mendapatkan rentang tanggal dari database.' });
        }

        const { startDate, endDate } = dateRange;

        console.log('Starting to fetch main comments...');
        let query = `
            SELECT unique_id_post, created_at 
            FROM posts 
            WHERE platform = "TikTok"
            AND DATE(created_at) BETWEEN ? AND ?
        `;

        if (!processFromStart) {
            query = `
                SELECT p.unique_id_post, p.created_at
                FROM posts p
                LEFT JOIN mainComments mc ON p.unique_id_post = mc.unique_id_post
                WHERE mc.unique_id_post IS NULL 
                AND p.platform = "TikTok"
                AND DATE(p.created_at) BETWEEN ? AND ?
            `;
        }

        const [rows] = await db.query(query, [startDate, endDate]);
        console.log(`📌 Found ${rows.length} posts to process for main comments.`);

        await processQueue(rows, async (row) => {
            const { unique_id_post } = row;
            console.log(`🔍 Fetching comments for post: ${unique_id_post}...`);

            const userQuery = `
                SELECT user_id, username, comments, client_account, kategori, platform
                FROM posts 
                WHERE unique_id_post = ? AND platform = "TikTok"
            `;
            const [userRows] = await db.query(userQuery, [unique_id_post]);

            if (userRows.length === 0) {
                console.log(`🚫 Post ${unique_id_post} not found in database.`);
                return;
            }

            const { user_id, username, comments, client_account, kategori, platform } = userRows[0];

            if (comments > 0) {
                try {
                    await getDataTiktok.getDataComment(unique_id_post, user_id, username, client_account, kategori, platform);
                    console.log(`✅ Comments for post ${unique_id_post} have been fetched and saved.`);
                } catch (err) {
                    console.error(`❌ Error fetching comments for post ${unique_id_post}:`, err.message);
                }
            } else {
                console.log(`ℹ️ No comments for post ${unique_id_post}.`);
            }
        });

        console.log('✅ Main comments processing completed.');

        // 🔹 Step 2: Proses Child Comments
        console.log('Starting to fetch child comments...');
        let queryChild = `
            SELECT mc.comment_unique_id, mc.unique_id_post, mc.created_at 
            FROM mainComments mc
            JOIN posts p ON mc.unique_id_post = p.unique_id_post
            WHERE mc.platform = "TikTok"
            AND DATE(p.created_at) BETWEEN ? AND ?
        `;

        if (!processFromStart) {
            queryChild = `
                SELECT mc.comment_unique_id, mc.unique_id_post, mc.created_at
                FROM mainComments mc
                JOIN posts p ON mc.unique_id_post = p.unique_id_post
                WHERE mc.platform = "TikTok"
                AND mc.comment_unique_id NOT IN (SELECT comment_unique_id FROM childComments)
                AND DATE(p.created_at) BETWEEN ? AND ?
            `;
        }

        const [childs] = await db.query(queryChild, [startDate, endDate]);
        console.log(`📌 Found ${childs.length} child comments to process.`);

        await processQueue(childs, async (child) => {
            const { comment_unique_id, unique_id_post } = child;
            console.log(`🔍 Fetching child comments for comment: ${comment_unique_id} on post: ${unique_id_post}...`);

            const userQuery = `
                SELECT unique_id_post, user_id, username, comment_unique_id, child_comment_count, client_account, kategori, platform
                FROM mainComments 
                WHERE comment_unique_id = ? AND platform = "TikTok"
            `;
            const [userChild] = await db.query(userQuery, [comment_unique_id]);

            if (userChild.length === 0) {
                console.log(`🚫 Comment ${comment_unique_id} not found in database.`);
                return;
            }

            const { user_id, username, client_account, child_comment_count, kategori, platform } = userChild[0];

            if (child_comment_count > 0) {
                try {
                    await getDataTiktok.getDataChildComment(
                        unique_id_post, 
                        user_id, 
                        username, 
                        comment_unique_id, 
                        client_account, 
                        kategori, 
                        platform
                    );
                    console.log(`✅ Child comments for comment ${comment_unique_id} have been fetched and saved.`);
                } catch (err) {
                    console.error(`❌ Error fetching child comments for comment ${comment_unique_id}:`, err.message);
                }
            } else {
                console.log(`ℹ️ No child comments to fetch for comment ${comment_unique_id}.`);
            }
        });

        console.log('✅ Child comments processing completed.');

        res.send('✅ Data getComment and getChildComment for all users have been fetched and saved.');
    } catch (error) {
        console.error('❌ Error executing getComment:', error.message);
        res.status(500).json({ message: 'Terjadi kesalahan saat menjalankan proses getComment.', error: error.message });
    }
});

module.exports = router;