const express = require('express');
const router = express.Router();
const getDataIg = require('../controllers/getDataIg');
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
    const { kategori } = req.query;
    // Fetch data for Instagram
    try {
        const [rows] = await db.query('SELECT * FROM listAkun WHERE platform = "Instagram" AND kategori = ?', [kategori]);

        for (const row of rows) {
            try {
                console.info('Fetching data for user:' + row.username);
        
                // Panggil fungsi getDataUser
                await getDataIg.getDataUser(
                    row.username,
                    row.client_account,
                    row.kategori,
                    row.platform
                );
        
                console.log(`Data for user ${row.username} has been fetched and saved.`);
            } catch (error) {
                console.error(`Error fetching data for user ${row.username}:`, error.message);
            }
        }

        res.send('Data getData for all users have been fetched and saved.');
    } catch (error) {
        console.error('Error executing getData:', error.message);
        res.status(500).send(`Error executing getData: ${error.message}`);
    }
});

// Eksekusi getPost berdasarkan semua username di listAkun
router.get('/getPost', async (req, res) => {
    const { kategori } = req.query;
    // Fetch data for Instagram
    try {
        const [rows] = await db.query('SELECT * FROM users WHERE platform = "Instagram" AND kategori = ?', [kategori]);

        await processQueue(rows, async (row) => {
            console.log(`Fetching posts for user: ${row.username}...`);
            await getDataIg.getDataPost(
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

// 🔹 Fungsi untuk mengambil startDate dan endDate dari tabel `setting`
const getDateRange = async () => {
    const { kategori } = req.query;
    try {
        const [rows] = await db.query('SELECT startDate, endDate FROM settings WHERE id = 1 AND kategori = ?', [kategori]);
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

        let query = `
            SELECT unique_id_post, created_at
            FROM posts 
            WHERE platform = "Instagram" 
            AND DATE(created_at) BETWEEN ? AND ?
            AND kategori = ? 
        `;

        if (!processFromStart) {
            query = `
                SELECT p.unique_id_post, p.created_at
                FROM posts p
                LEFT JOIN mainComments mc ON p.unique_id_post = mc.unique_id_post
                WHERE mc.unique_id_post IS NULL 
                AND p.platform = "Instagram"
                AND DATE(p.created_at) BETWEEN ? AND ?
            `;
        }

        const [rows] = await db.query(query, [startDate, endDate]);
        console.log(`📌 Found ${rows.length} posts to process.`);

        await processQueue(rows, async (row) => {
            const { unique_id_post } = row;
            console.log(`🔍 Fetching comments for post: ${unique_id_post}...`);

            const userQuery = `
                SELECT user_id, username, comments, client_account, kategori, platform
                FROM posts 
                WHERE unique_id_post = ? AND platform = "Instagram"
            `;
            const [userRows] = await db.query(userQuery, [unique_id_post]);

            if (userRows.length === 0) {
                console.log(`🚫 Post ${unique_id_post} not found in database.`);
                return;
            }

            const { user_id, username, comments, client_account, kategori, platform } = userRows[0];

            if (comments > 0) {
                try {
                    await getDataIg.getDataComment(unique_id_post, user_id, username, client_account, kategori, platform);
                    console.log(`✅ Comments for post ${unique_id_post} have been fetched and saved.`);
                } catch (err) {
                    console.error(`❌ Error fetching comments for post ${unique_id_post}:`, err.message);
                }
            } else {
                console.log(`ℹ️ No comments for post ${unique_id_post}.`);
            }
        });

        res.send('✅ Data getComment for all users have been fetched and saved.');
    } catch (error) {
        console.error('❌ Error executing getComment:', error.message);
        res.status(500).json({ message: 'Terjadi kesalahan saat menjalankan proses getComment.', error: error.message });
    }
});

// 🔹 Endpoint untuk eksekusi getChildComment
router.get('/getChildComment', async (req, res) => {
    const { fromStart } = req.query;
    const processFromStart = fromStart === 'false';

    try {
        const dateRange = await getDateRange();
        if (!dateRange) {
            return res.status(500).json({ message: 'Gagal mendapatkan rentang tanggal dari database.' });
        }

        const { startDate, endDate } = dateRange;

        let query = `
            SELECT mc.comment_unique_id, mc.unique_id_post, mc.user_id, mc.username, mc.platform, 
            mc.child_comment_count, mc.client_account, mc.kategori, p.created_at
            FROM mainComments mc
            JOIN posts p ON mc.unique_id_post = p.unique_id_post
            WHERE mc.platform = "Instagram"
            AND DATE(p.created_at) BETWEEN ? AND ?
        `;

        if (!processFromStart) {
            query = `
                SELECT mc.comment_unique_id, mc.unique_id_post, mc.user_id, mc.username, mc.platform, 
                mc.child_comment_count, mc.client_account, mc.kategori, p.created_at
                FROM mainComments mc
                JOIN posts p ON mc.unique_id_post = p.unique_id_post
                WHERE mc.platform = "Instagram"
                AND mc.comment_unique_id NOT IN (SELECT comment_unique_id FROM childComments)
                AND DATE(p.created_at) BETWEEN ? AND ?
            `;
        }

        const [rows] = await db.query(query, [startDate, endDate]);
        console.log(`📌 Found ${rows.length} comments to process.`);

        await processQueue(rows, async (row) => {
            const { comment_unique_id, unique_id_post, user_id, username, child_comment_count, platform, client_account, kategori } = row;
            console.log(`🔍 Fetching child comments for comment ID: ${comment_unique_id} on post: ${unique_id_post}...`);

            if (child_comment_count > 0) {
                try {
                    await getDataIg.getDataChildComment(unique_id_post, comment_unique_id, client_account, kategori, user_id, username, platform);
                    console.log(`✅ Child comments for comment ID ${comment_unique_id} on post ${unique_id_post} have been fetched and saved.`);
                } catch (err) {
                    console.error(`❌ Error fetching child comments for comment ID ${comment_unique_id} on post ${unique_id_post}:`, err.message);
                }
            } else {
                console.log(`ℹ️ No child comments for comment ID ${comment_unique_id} on post ${unique_id_post}.`);
            }
        });

        res.send('✅ Data getChildComment for all users have been fetched and saved.');
    } catch (error) {
        console.error('❌ Error executing getChildComment:', error.message);
        res.status(500).json({ message: 'Terjadi kesalahan saat menjalankan proses getChildComment.', error: error.message });
    }
});

// Eksekusi getLikes count
router.get('/getLikes', async (req, res) => {
    try {
        let query = 'SELECT * FROM posts WHERE platform = "Instagram"';

        const [rows] = await db.query(query);

        await processQueue(rows, async (row) => {
            const post_code = row.post_code;
            const userQuery = `
                SELECT created_at
                FROM posts
                WHERE post_code = ? AND platform = "Instagram"
            `;
            const [userRows] = await db.query(userQuery, [post_code]);
            const { created_at } = userRows[0];
            try {
                console.log(`Fetching likes for post: ${post_code}...`);
                await getDataIg.getDataLikes(post_code, created_at);
                console.log(`Likes for post ${post_code} have been fetched and saved.`);
            } catch (err) {
                console.error(`Error fetching likes for post ${post_code}:`, err.message);
            }
        });

        res.send('Data getLikes for all users have been fetched and saved.');
    } catch (error) {
        console.error('Error executing getLikes:', error.message);
        res.status(500).send(`Error executing getLikes: ${error.message}`);
    }
});

module.exports = router;