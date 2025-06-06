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
const totalThreads = 1;
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

const chunkArray = (array, size) => {
    const chunkedArr = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArr.push(array.slice(i, i + size));
    }
    return chunkedArr;
};

router.get('/update-followers-kdm', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM posts WHERE FIND_IN_SET("kdm", kategori) AND platform = "Youtube"');

        if (!rows.length) {
            return res.send('No users found in the database.');
        }

        const batchSize = 5; // Jumlah row yang diproses per batch
        const rowBatches = chunkArray(rows, batchSize);

        for (const batch of rowBatches) {
            console.info(`Processing batch of ${batch.length} users...`);

            await Promise.all(batch.map(async (row) => {
                try {
                    console.info('Fetching data for user: ' + row.username);

                    const getUser = {
                        method: 'GET',
                        url: 'https://youtube-v311.p.rapidapi.com/channels/',
                        params: {
                            part: 'snippet,statistics',
                            id: row.user_id,
                            maxResults: '50'
                        },
                        headers: {
                            'x-rapidapi-key': process.env.RAPIDAPI_YT_KEY,
                            'x-rapidapi-host': process.env.RAPIDAPI_YT_HOST
                        }
                    };

                    const response = await axios.request(getUser);

                    if (response.data?.data) {
                        const userData = response.data.items || null ;

                        const follower = userData.statistics.subscriberCount;

                        console.info(`Updating ${row.username}: followers=${follower}, following=${following}`);

                        const updateQuery = `UPDATE posts SET followers = ?, following = ? WHERE post_id = ?`;
                        await db.query(updateQuery, [follower, following, row.post_id]);
                    }
                } catch (error) {
                    console.error(`Error fetching/updating data for ${row.username}:`, error.message);
                }
            }));

            // Tambahkan delay opsional jika ingin menghindari rate limit API
            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1 detik antara batch
        }

        res.send('Data followers & following berhasil diperbarui untuk semua pengguna.');
    } catch (error) {
        console.error('Error executing update:', error.message);
        res.status(500).send(`Error executing update: ${error.message}`);
    }
});

// Eksekusi getData berdasarkan semua username di listAkun
router.get('/getData', async (req, res) => {
    const { kategori } = req.query;
    // Fetch data for Youtube
    try {
        const [rows] = await db.query('SELECT * FROM listAkun WHERE platform = "Youtube" AND FIND_IN_SET(?, kategori)', [kategori]);

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
        const [rows] = await db.query('SELECT * FROM users WHERE platform = "Youtube" AND FIND_IN_SET(?, kategori)', [kategori]);

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
    const { kategori, fromStart, unique_id_post } = req.query;
    const processFromStart = fromStart ? fromStart === 'true' : false;

    try {
        console.info(fromStart)
        console.info(processFromStart)

        // ================================
        // 🔹 Step 1: Proses Main Comments
        // ================================

        console.log('🚀 Starting to fetch main comments...');

        let mainCommentQuery = `
            SELECT unique_id_post, created_at
            FROM posts 
            WHERE platform = "Youtube" 
            AND FIND_IN_SET(?, kategori)
            AND unique_id_post = ?
        `;

        if (!processFromStart) {
            mainCommentQuery = `
                SELECT p.unique_id_post, p.created_at
                FROM posts p
                LEFT JOIN mainComments mc ON p.unique_id_post = mc.unique_id_post
                WHERE mc.unique_id_post IS NULL
                AND p.platform = "Youtube"
                AND FIND_IN_SET(?, p.kategori)
                AND p.unique_id_post = ?
            `;
        }

        const [mainComments] = await db.query(mainCommentQuery, [kategori, unique_id_post]);
        console.log(`📌 Found ${mainComments.length} posts to process.`);

        await processQueue(mainComments, async ({ unique_id_post }) => {
            console.log(`🔍 Fetching comments for post: ${unique_id_post}...`);

            const [userRows] = await db.query(
                `SELECT user_id, username, comments, client_account, kategori, platform FROM posts WHERE unique_id_post = ? AND platform = "Youtube" AND FIND_IN_SET(?, kategori)`,
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
    // Fetch data for Youtube
    try {
        const [rows] = await db.query(`
            SELECT * FROM listKeywords 
            WHERE 
            platform = "Youtube" 
            AND FIND_IN_SET(?, kategori) 
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

// 🔹 Endpoint untuk eksekusi getComment & getChildComment sekaligus
router.post('/getCommentv2', async (req, res) => {
    try {
        const { kategori, fromStart, unique_id_post } = req.body;
        const processFromStart = fromStart ? fromStart === 'true' : false;

        console.info(`Kategori: ${kategori}`);
        console.info(`Post Codes: ${unique_id_post}`);
        console.info(`Process From Start: ${processFromStart}`);

        if (!Array.isArray(unique_id_post) || unique_id_post.length === 0) {
            return res.status(400).json({ error: "Invalid unique_id_post format. It should be a non-empty list." });
        }

        console.log(`🚀 Starting to fetch main comments for ${unique_id_post.length} posts...`);

        // ================================
        // 🔹 Step 1: Proses Main Comments
        // ================================
        for (const code of unique_id_post) {
            console.log(`🔍 Processing unique_id_post: ${code}`);

            let mainCommentQuery = `
                SELECT unique_id_post, created_at, kategori
                FROM posts 
                WHERE platform = "Youtube" 
                AND FIND_IN_SET(?, kategori)
                AND unique_id_post = ?
            `;

            if (!processFromStart) {
                mainCommentQuery = `
                    SELECT p.unique_id_post, p.created_at, p.kategori
                    FROM posts p
                    LEFT JOIN mainComments mc ON p.unique_id_post = mc.unique_id_post
                    WHERE mc.unique_id_post IS NULL
                    AND p.platform = "Youtube"
                    AND FIND_IN_SET(?, p.kategori)
                    AND p.unique_id_post = ?
                `;
            }

            const [mainComments] = await db.query(mainCommentQuery, [kategori, code]);

            console.log(`📌 Found ${mainComments.length} posts to process.`);

            await processQueue(mainComments, async ({ unique_id_post, kategori }) => {
                console.log(`🔍 Fetching comments for post: ${unique_id_post}...`);

                const [userRows] = await db.query(
                    `SELECT user_id, username, comments, client_account, platform 
                        FROM posts 
                        WHERE unique_id_post = ? 
                        AND platform = "Youtube" 
                        AND FIND_IN_SET(?, kategori)`,
                    [unique_id_post, kategori]
                );

                if (userRows.length === 0) {
                    console.log(`🚫 Post ${unique_id_post} not found in database.`);
                    return;
                }

                const { user_id, username, comments, client_account, platform } = userRows[0];

                if (comments > 0) {
                    try {
                        await getDataYoutube.getDataComment2(
                            unique_id_post, 
                            user_id, 
                            username, 
                            client_account, 
                            kategori, 
                            platform
                        );
                        console.log(`✅ Comments for post ${unique_id_post} have been fetched and saved.`);
                    } catch (err) {
                        console.error(`❌ Error fetching comments for post ${unique_id_post}:`, err.message);
                    }
                } else {
                    console.log(`ℹ️ No comments for post ${unique_id_post}.`);
                }
            });
        }

        console.log('✅ Main comments processing completed.');

        res.status(200).json({ message: "✅ Data getComment and getChildComment processed successfully." });

    } catch (error) {
        console.error("❌ Error in /getCommentv2 route:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

router.post('/getCommentv3', async (req, res) => {
    try {
        const { kategori, unique_id_post, client_account, platform } = req.body;

        console.info(`Kategori: ${kategori}`);
        console.info(`Post Codes: ${unique_id_post}`);

        if (!Array.isArray(unique_id_post) || unique_id_post.length === 0) {
            return res.status(400).json({ error: "Invalid unique_id_post format. It should be a non-empty list." });
        }

        console.log(`🚀 Starting to fetch comments for ${unique_id_post.length} posts...`);

        for (const code of unique_id_post) {
            console.log(`🔍 Fetching comments for post: ${code}...`);
            try {
                await getDataYoutube.getDataComment2(
                    code,
                    null,
                    null,
                    client_account,
                    kategori, 
                    platform // platform
                );
                console.log(`✅ Comments for post ${code} have been fetched and saved.`);
            } catch (err) {
                console.error(`❌ Error fetching comments for post ${code}:`, err.message);
            }
        }

        console.log('✅ Comments fetching process completed.');
        res.status(200).json({ message: "✅ Comments fetched successfully." });
    } catch (error) {
        console.error("❌ Error in /getCommentv3 route:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;