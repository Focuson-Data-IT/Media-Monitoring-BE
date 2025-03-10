const express = require('express');
const router = express.Router();
const getDataYoutube = require('../controllers/getDataYoutube');
const db = require('../models/db'); // Pastikan ini diatur sesuai koneksi database Anda
const async = require('async');
const axios = require("axios");

let requestCount = 0;
const maxRequestsPerMinute = 200;
const threadRequestLimit = 10;
const threadRestTime = 60000; // Dalam ms
const totalThreads = 50;
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
    // Fetch data for Youtube
    try {
        const [rows] = await db.query('SELECT * FROM listAkun WHERE platform = "Youtube" AND kategori = ?', [kategori]);

        await processQueue(rows, async (row) => {
            try {
                console.info('Fetching data for user:' + row.username);
        
                // Panggil fungsi getDataUser
                await getDataYoutube.getDataUser(
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
router.get('/getPost', async (req, res) => {
    const { kategori } = req.query;
    // Fetch data for Youtube
    try {
        const [rows] = await db.query('SELECT * FROM users WHERE platform = "Youtube" AND kategori = ?', [kategori]);

        await processQueue(rows, async (row) => {
            console.log(`Fetching posts for user: ${row.username}...`);
            await getDataYoutube.getDataPost(
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

// 🔹 Endpoint untuk eksekusi getComment & getChildComment sekaligus
router.get('/getComment', async (req, res) => {
    const { kategori, fromStart } = req.query;
    const processFromStart = fromStart ? fromStart === 'true' : false;

    console.info(kategori)
    console.info(fromStart)
    console.info(processFromStart)

    try {
        const dateRange = await getDateRange();
        if (!dateRange) {
            return res.status(500).json({ message: 'Gagal mendapatkan rentang tanggal dari database.' });
        }

        console.info(fromStart)
        console.info(processFromStart)
        console.info(dateRange)

        const { startDate, endDate } = dateRange;

        // ================================
        // 🔹 Step 1: Proses Main Comments
        // ================================
        console.log('🚀 Starting to fetch main comments...');

        let mainCommentQuery = `
            SELECT unique_id_post, created_at
            FROM posts 
            WHERE platform = "Youtube" 
            AND kategori = ?
            AND DATE(created_at) BETWEEN ? AND ?
        `;

        if (!processFromStart) {
            mainCommentQuery = `
                SELECT p.unique_id_post, p.created_at
                FROM posts p
                LEFT JOIN mainComments mc ON p.unique_id_post = mc.unique_id_post
                WHERE mc.unique_id_post IS NULL
                AND p.platform = "Youtube"
                AND p.kategori = ?
                AND DATE(p.created_at) BETWEEN ? AND ?
            `;
        }

        const [mainComments] = await db.query(mainCommentQuery, [kategori, startDate, endDate]);
        console.log(`📌 Found ${mainComments.length} posts to process.`);

        await processQueue(mainComments, async ({ unique_id_post }) => {
            console.log(`🔍 Fetching comments for post: ${unique_id_post}...`);

            const [userRows] = await db.query(
                `SELECT user_id, username, comments, client_account, kategori, platform FROM posts WHERE unique_id_post = ? AND platform = "Youtube" AND kategori = ?`,
                [unique_id_post, kategori]
            );

            if (userRows.length === 0) {
                console.log(`🚫 Post ${unique_id_post} not found in database.`);
                return;
            }

            const { user_id, username, comments, client_account, platform } = userRows[0];

            if (comments > 0) {
                try {
                    await getDataYoutube.getDataComment(unique_id_post, user_id, username, client_account, platform);
                    console.log(`✅ Comments for post ${unique_id_post} have been fetched and saved.`);
                } catch (err) {
                    console.error(`❌ Error fetching comments for post ${unique_id_post}:`, err.message);
                }
            } else {
                console.log(`ℹ️ No comments for post ${unique_id_post}.`);
            }
        });

        console.log('✅ Main comments processing completed.');

        // ================================
        // 🔹 Step 2: Proses Child Comments
        // ================================
        console.log('🚀 Starting to fetch child comments...');

        let childCommentQuery = `
            SELECT mc.comment_unique_id, mc.unique_id_post, mc.user_id, mc.username, mc.platform,
            mc.child_comment_count, mc.client_account, mc.kategori, p.created_at
            FROM mainComments mc
            JOIN posts p ON mc.unique_id_post = p.unique_id_post
            WHERE mc.platform = "Youtube"
            AND mc.kategori = ?
            AND DATE(p.created_at) BETWEEN ? AND ?
        `;

        if (!processFromStart) {
            childCommentQuery = `
                SELECT mc.comment_unique_id, mc.unique_id_post, mc.user_id, mc.username, mc.platform,
                mc.child_comment_count, mc.client_account, mc.kategori, p.created_at
                FROM mainComments mc
                JOIN posts p ON mc.unique_id_post = p.unique_id_post
                WHERE mc.platform = "Youtube"
                AND mc.kategori = ?
                AND mc.comment_unique_id NOT IN (SELECT comment_unique_id FROM childComments)
                AND DATE(p.created_at) BETWEEN ? AND ?
            `;
        }

        const [childComments] = await db.query(childCommentQuery, [kategori, startDate, endDate]);
        console.log(`📌 Found ${childComments.length} child comments to process.`);

        await processQueue(childComments, async ({
            comment_unique_id, unique_id_post, user_id, username, child_comment_count, platform, client_account
        }) => {
            console.log(`🔍 Fetching child comments for comment ID: ${comment_unique_id} on post: ${unique_id_post}...`);

            if (child_comment_count > 0) {
                try {
                    await getDataYoutube.getDataChildComment(
                        unique_id_post, 
                        user_id, 
                        username, 
                        comment_unique_id, 
                        client_account, 
                        kategori, 
                        platform
                    );
                    console.log(`✅ Child comments for comment ID ${comment_unique_id} on post ${unique_id_post} have been fetched and saved.`);
                } catch (err) {
                    console.error(`❌ Error fetching child comments for comment ID ${comment_unique_id}:`, err.message);
                }
            } else {
                console.log(`ℹ️ No child comments for comment ID ${comment_unique_id}.`);
            }
        });

        console.log('✅ Child comments processing completed.');

        res.send('✅ Data getComment and getChildComment for all users have been fetched and saved.');

    } catch (error) {
        console.error('❌ Error executing getComment and getChildComment:', error.message);
        res.status(500).json({
            message: 'Terjadi kesalahan saat menjalankan proses getComment dan getChildComment.',
            error: error.message,
        });
    }
});

// Eksekusi getLikes count
router.get('/getLikes', async (req, res) => {
    try {
        let query = 'SELECT * FROM posts WHERE platform = "Youtube"';

        const [rows] = await db.query(query);

        await processQueue(rows, async (row) => {
            const post_code = row.post_code;
            const userQuery = `
                SELECT created_at
                FROM posts
                WHERE post_code = ? AND platform = "Youtube"
            `;
            const [userRows] = await db.query(userQuery, [post_code]);
            const { created_at } = userRows[0];
            try {
                console.log(`Fetching likes for post: ${post_code}...`);
                await getDataYoutube.getDataLikes(post_code, created_at);
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

router.get('/getDataPostByKeywords', async (req, res) => {
    const { kategori, start_date, end_date } = req.query;
    // Fetch data for TikTok
    try {
        const [rows] = await db.query(`
            SELECT * FROM listKeywords 
            WHERE 
            platform = "Youtube" 
            AND kategori = ? 
            `, [kategori]);

        await processQueue(rows, async (row) => {
            console.log(`Fetching posts for keyword: ${row.keyword}...`);
            await getDataYoutube.getDataPostByKeyword(
                row.client_account,
                row.kategori,
                row.platform,
                row.keyword,
                start_date,
                end_date
            );
            console.log(`Posts for keywords ${row.keyword} have been fetched and saved.`);
        });

        res.send('Data getDataPostByKeywords for all users have been fetched and saved.');
    } catch (error) {
        console.error('Error executing getDataPostByKeywords:', error.message);
        res.status(500).send(`Error executing getDataPostByKeywords: ${error.message}`);
    }
});

module.exports = router;