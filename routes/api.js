const express = require('express');
const router = express.Router();
const getDataIg = require('../controllers/getDataIg');
const fairControllerIg = require('../controllers/fairControllerIg');
const fairScoreIg = require('../controllers/fairScoreIg');
const saveData = require('../controllers/saveData');
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

// Endpoint untuk mengambil tanggal dari database
router.get('/getDates', async (req, res) => {
    try {
        // Query untuk mengambil data tanggal dari database
        const [rows] = await db.query('SELECT * FROM settings WHERE id = 1'); // Pastikan query sesuai dengan struktur tabel kamu
        const { startDate, endDate } = rows[0]; // Ambil tanggal yang pertama (asumsi hanya ada 1 data)
        
        // Kirim tanggal dalam format JSON ke frontend
        res.json({
            startDate: startDate,
            endDate: endDate
        });
    } catch (error) {
        console.error('Error fetching dates:', error);
        res.status(500).send('Failed to fetch dates');
    }
});

// Endpoint untuk memperbarui tanggal
router.post('/updateDates', async (req, res) => {
    const { startDate, endDate } = req.body;

    try {
        // Konversi tanggal ke format yyyy-mm-dd (untuk DATE) atau yyyy-mm-dd HH:MM:SS (untuk DATETIME)
        const formattedStartDate = new Date(startDate).toISOString().split('T')[0]; // Format DATE
        const formattedEndDate = new Date(endDate).toISOString().split('T')[0];     // Format DATE

        // Update tanggal di database
        await db.query('UPDATE settings SET startDate = ?, endDate = ? WHERE id = 1', [formattedStartDate, formattedEndDate]);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Error updating dates:', error);
        res.status(500).json({ success: false, message: 'Failed to update dates' });
    }
});

// Endpoint untuk memasukan data dari listAkun ke dalam tabel dailyFairScores
router.post('/addDataUser', async (req, res) => {
    try {
        console.info('Starting to add user data to dailyFairScores...');
        await saveData.saveDataUser();
        res.json({ success: true, message: 'Data user berhasil disimpan ke dailyFairScores.' });
    } catch (error) {
        console.error("Error saving user data to dailyFairScores:", error.message);
        res.status(500).json({ success: false, message: 'Gagal menyimpan data user ke dailyFairScores.', error: error.message });
    }
});

// Instagram Api Methods ----------------------------------------------------------------

// Route Eksekusi server
// Endpoint untuk menampilkan semua list akun
router.get('/listAkun', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM listAkun');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching listAkun:', error.message);
        res.status(500).json({ message: 'Gagal mengambil list akun.', error: error.message });
    }
});

// Endpoint untuk menambahkan list akun
router.post('/addListAkun', async (req, res) => {
    const { client_account, platform, kategori, username } = req.body;

    try {
        await saveData.saveListAkun({ client_account, platform, kategori, username });
        res.json({ success: true, message: 'List akun berhasil disimpan.' });
    } catch (error) {
        console.error('Error saving listAkun:', error.message);
        res.status(500).json({ success: false, message: 'Gagal menyimpan list akun.', error: error.message });
    }
});

// Endpoint untuk menghapus list akun
router.delete('/deleteListAkun/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const sql = 'DELETE FROM listAkun WHERE list_id = ?';
        await db.query(sql, [id]);
        res.json({ success: true, message: 'List akun berhasil dihapus.' });
    } catch (error) {
        console.error('Error deleting listAkun:', error.message);
        res.status(500).json({ success: false, message: 'Gagal menghapus list akun.', error: error.message });
    }
});

// Endpoint untuk mengedit list akun
router.put('/editListAkun/:id', async (req, res) => {
    const { id } = req.params;
    const { client_account, platform, kategori, username } = req.body;

    try {
        const sql = `
            UPDATE listAkun
            SET client_account = ?, platform = ?, kategori = ?, username = ?
            WHERE list_id = ?
        `;
        await db.query(sql, [client_account, platform, kategori, username, id]);
        res.json({ success: true, message: 'List akun berhasil diperbarui.' });
    } catch (error) {
        console.error('Error updating listAkun:', error.message);
        res.status(500).json({ success: false, message: 'Gagal memperbarui list akun.', error: error.message });
    }
});


// Eksekusi getData berdasarkan semua username di listAkun
router.get('/execute/getData', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT client_account, kategori, platform, username FROM listAkun WHERE platform = "instagram"');

        await processQueue(rows, async (row) => {
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
        });        

        res.send('Data getData for all users have been fetched and saved.');
    } catch (error) {
        console.error('Error executing getData:', error.message);
        res.status(500).send(`Error executing getData: ${error.message}`);
    }
});

// Eksekusi getPost berdasarkan semua username di listAkun
router.get('/execute/getPost', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT client_account, kategori, platform, username FROM listAkun WHERE platform = "instagram"');

        await processQueue(rows, async (row) => {
            console.log(`Fetching posts for user: ${row.username}...`);
            await getDataIg.getDataPost(
                row.username,
                row.client_account,
                row.kategori,
                row.platform
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
router.get('/execute/getComment', async (req, res) => {
    const { fromStart } = req.query; // Parameter untuk menentukan apakah proses dimulai dari awal
    const processFromStart = fromStart === 'true';

    try {
        let query = 'SELECT unique_id_post FROM posts WHERE platform = "instagram"';
        
        // Jika proses tidak dimulai dari awal, hanya ambil data yang belum diproses
        if (!processFromStart) {
            query = `
                SELECT p.unique_id_post
                FROM posts p
                LEFT JOIN mainComments mc ON p.unique_id_post = mc.unique_id_post
                WHERE mc.unique_id_post IS NULL AND p.platform = "instagram"
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
                WHERE unique_id_post = ? AND platform = "instagram"
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
                    await getDataIg.getDataComment(unique_id_post, user_id, username, client_account, kategori, platform);
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
});

// Endpoint untuk eksekusi getChildComment
router.get('/execute/getChildComment', async (req, res) => {
    const { fromStart } = req.query; // Parameter untuk menentukan apakah proses dimulai dari awal
    const processFromStart = fromStart === 'true';

    try {
        let queryChild = 'SELECT comment_unique_id FROM mainComments WHERE platform = "instagram"';
        
        // Jika proses tidak dimulai dari awal, hanya ambil data yang belum diproses
        if (!processFromStart) {
            queryChild = `
                SELECT p.comment_unique_id 
                FROM mainComments p
                LEFT JOIN childComments mc ON p.comment_unique_id = mc.comment_unique_id
                WHERE mc.comment_unique_id IS NULL AND p.platform = "instagram"
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
                WHERE comment_unique_id = ? AND platform = "instagram"
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
                    await getDataIg.getDataChildComment(unique_id_post, user_id, username, comment_unique_id, client_account, kategori, platform);
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

// Eksekusi getLikes count
router.get('/execute/getLikes', async (req, res) => {
    try {
        let query = 'SELECT * FROM posts WHERE platform = "instagram"';

        const [rows] = await db.query(query);

        await processQueue(rows, async (row) => {
            const post_code = row.post_code;
            const userQuery = `
                SELECT created_at
                FROM posts
                WHERE post_code = ? AND platform = "instagram"
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

let isProcessingFollowers = false;
let isProcessingActivities = false;
let isProcessingInteraction = false;
let isProcessingResponsiveness = false;
let isProcessingLikesUser = false;
let isProcessingAllPosts = false;
let isProcessingCalculateFairScore = false;
let isProcessingFairScores = false;

router.get('/data/followersIg', async (req, res) => {
    if (isProcessingFollowers) {
        return res.status(202).send("Data is being processed");
    }

    isProcessingFollowers = true;
    try {
        await fairControllerIg.getFollowersIg(req, res);
    } finally {
        isProcessingFollowers = false;
    }
});

router.get('/data/activitiesIg', async (req, res) => {
    if (isProcessingActivities) {
        return res.status(202).send("Data is being processed");
    }

    isProcessingActivities = true;
    try {
        await fairControllerIg.getActivitiesIg(req, res);
    } finally {
        isProcessingActivities = false;
    }
});

router.get('/data/interactionIg', async (req, res) => {
    if (isProcessingInteraction) {
        return res.status(202).send("Data is being processed");
    }

    isProcessingInteraction = true;
    try {
        await fairControllerIg.getInteractionIg(req, res);
    } finally {
        isProcessingInteraction = false;
    }
});

router.get('/data/responsivenessIg', async (req, res) => {
    if (isProcessingResponsiveness) {
        return res.status(202).send("Data is being processed");
    }

    isProcessingResponsiveness = true;
    try {
        await fairControllerIg.getResponsivenessIg(req, res);
    } finally {
        isProcessingResponsiveness = false;
    }
});

router.get('/data/likesUserIg', async (req, res) => {
    if (isProcessingLikesUser) {
        return res.status(202).send("Data is being processed");
    }

    isProcessingLikesUser = true;
    try {
        await fairControllerIg.getLikesUserIg(req, res);
    } finally {
        isProcessingLikesUser = false;
    }
});

router.get('/data/allPostsIg', async (req, res) => {
    if (isProcessingAllPosts) {
        return res.status(202).send("Data is being processed");
    }

    isProcessingAllPosts = true;
    try {
        await fairControllerIg.getAllDataPostIg(req, res);
    } finally {
        isProcessingAllPosts = false;
    }
});

router.post('/data/processData', async (req, res) => {
    if (isProcessingCalculateFairScore) {
        return res.status(202).send("Data is being processed");
    }

    isProcessingCalculateFairScore = true;
    try {
        await fairScoreIg.processData(req, res);
    } finally {
        isProcessingCalculateFairScore = false;
    }
});

router.get('/data/fairScores', async (req, res) => {
    if (isProcessingFairScores) {
        return res.status(202).send("Data is being processed");
    }

    isProcessingFairScores = true;
    try {
        await fairScoreIg.getFairScores(req, res);
    } finally {
        isProcessingFairScores = false;
    }
});

router.get('/data/status', (req, res) => {
    res.json({
        isProcessingFollowers,
        isProcessingActivities,
        isProcessingInteraction,
        isProcessingResponsiveness,
        isProcessingLikesUser,
        isProcessingAllPosts,
        isProcessingCalculateFairScore,
        isProcessingFairScores
    });
});

module.exports = router;