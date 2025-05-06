const express = require('express');
const router = express.Router();
const getDataIg = require('../controllers/getDataIg');
const db = require('../models/db'); // Pastikan ini diatur sesuai koneksi database Anda
const platform = "Instagram";

router.get('/update-followers', async (req, res) => {
    const { kategori, platform } = req.query;

    try {
        const result = await getDataIg.getDataFollowers(kategori, platform);
        res.send(result); // ✅ Response hanya dikirim dari sini
    } catch (error) {
        console.error('Error executing update:', error.message);
        res.status(500).send(`Error executing update: ${error.message}`);
    }
});

// Eksekusi getData berdasarkan kategori dari query parameter
router.get('/getData', async (req, res) => {
    const { kategori } = req.query;

    if (!kategori) {
        return res.status(400).send('❌ Error: kategori parameter is required.');
    }

    try {
        console.info(`🔍 Starting data fetching for category: ${kategori}`);

        // Langsung panggil getDataUser tanpa looping tambahan
        await getDataIg.getDataUser(kategori, "Instagram");

        res.send(`✅ Data ${platform} for category "${kategori}" has been fetched and saved.`);
    } catch (error) {
        console.error('❌ Error executing getData:', error.message);
        res.status(500).send(`❌ Error executing getData: ${error.message}`);
    }
});


// API untuk mengambil data post berdasarkan kategori
router.get('/getPost', async (req, res) => {
    const { kategori } = req.query;

    if (!kategori) {
        return res.status(400).send('❌ Error: kategori parameter is required.');
    }

    try {
        console.info(`🔍 Starting post fetching for category: ${kategori}`);

        // Langsung panggil getDataPost tanpa looping tambahan
        await getDataIg.getDataPost(kategori, "Instagram");

        res.send(`✅ Data ${platform} posts for category "${kategori}" have been fetched and saved.`);
    } catch (error) {
        console.error('❌ Error executing getPost:', error.message);
        res.status(500).send(`❌ Error executing getPost: ${error.message}`);
    }
});

// Fungsi untuk mengambil startDate dan endDate dari tabel `settings`
const getDateRange = async () => {
    try {
        const [rows] = await db.query('SELECT startDate, endDate FROM settings WHERE id = 1');
        if (rows.length === 0) throw new Error('❌ Data setting tidak ditemukan.');

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
    const { kategori } = req.query;

    if (!kategori) {
        return res.status(400).json({ message: '❌ kategori parameter is required.' });
    }

    try {
        console.info(`🔍 Fetching comments for category: ${kategori}`);

        // Ambil tanggal dari database
        // const dateRange = await getDateRange();
        // if (!dateRange) {
        //     return res.status(500).json({ message: '❌ Gagal mendapatkan rentang tanggal dari database.' });
        // }

        // const { startDate, endDate } = dateRange; // Destructuring tanggal

        // Step 1: Fetch Main Comments
        console.log('🚀 Fetching main comments...');
        await getDataIg.getDataComment(kategori, "Instagram");
        console.log('✅ Main comments processing completed.');

        // Step 2: Fetch Child Comments
        console.log('🚀 Fetching child comments...');
        await getDataIg.getDataChildComment(kategori, "Instagram");
        console.log('✅ Child comments processing completed.');

        res.send(`✅ Comments and child comments ${platform} for category "${kategori}" have been fetched and saved.`);
    } catch (error) {
        console.error('❌ Error executing getComment and getChildComment:', error.message);
        res.status(500).json({
            message: '❌ Error fetching comments.',
            error: error.message,
        });
    }
});

router.get('/getCommentByCode', async (req, res) => {
    const { kategori, url } = req.query;

    if (!kategori) {
        return res.status(400).json({ message: '❌ kategori parameter is required.' });
    }

    try {
        console.info(`🔍 Fetching comments for category: ${kategori}`);

        // Ambil tanggal dari database
        // const dateRange = await getDateRange();
        // if (!dateRange) {
        //     return res.status(500).json({ message: '❌ Gagal mendapatkan rentang tanggal dari database.' });
        // }

        // const { startDate, endDate } = dateRange; // Destructuring tanggal

        // Step 1: Fetch Main Comments
        console.log('🚀 Fetching main comments...');
        await getDataIg.getDataCommentByUrl(url, kategori, "Instagram");
        console.log('✅ Main comments processing completed.');

        // Step 2: Fetch Child Comments
        console.log('🚀 Fetching child comments...');
        await getDataIg.getChildCommentByUrl(url, kategori, "Instagram");
        console.log('✅ Child comments processing completed.');

        res.send(`✅ Comments and child comments ${platform} for category "${kategori}" have been fetched and saved.`);
    } catch (error) {
        console.error('❌ Error executing getComment and getChildComment:', error.message);
        res.status(500).json({
            message: '❌ Error fetching comments.',
            error: error.message,
        });
    }
});

// Eksekusi getLikes count
router.get('/getLikes', async (req, res) => {
    try {
        let query = 'SELECT * FROM posts WHERE platform = "Instagram"';

        const [rows] = await db.query(query);

        (rows, async (row) => {
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

        res.send(`Data getLikes ${platform} for all users have been fetched and saved.`);
    } catch (error) {
        console.error('Error executing getLikes:', error.message);
        res.status(500).send(`Error executing getLikes: ${error.message}`);
    }
});

router.get('/getDataPostByKeywords', async (req, res) => {
    const { kategori } = req.query;
    // Fetch data for TikTok
    try {
        const [rows] = await db.query(`
            SELECT * FROM listKeywords 
            WHERE 
            platform = "Instagram" 
            AND FIND_IN_SET(?, kategori) 
            `, [kategori]);

        await Promise.all(rows.map(async (row) => {
            console.info(`Fetching posts for keyword: ${row.keyword}...`);
            await getDataIg.getDataPostByKeyword(
                row.kategori,
                row.platform,
                row.client_account,
                row.keyword
            );
            console.info(`Posts for keyword ${row.keyword} have been fetched and saved.`);
        }));            

        res.send(`Data ${platform} getDataPostByKeywords for all users have been fetched and saved.`);
    } catch (error) {
        console.error('Error executing getDataPostByKeywords:', error.message);
        res.status(500).send(`Error executing getDataPostByKeywords: ${error.message}`);
    }
});

router.post('/getPostDataByCode', async (req, res) => {
    const { kategori, post_code, client_account, platform } = req.body;

    try {
        console.info(`Kategori: ${kategori}`);
        console.info(`Post Codes: ${post_code}`);
        console.info(`Client Account: ${client_account}`);
        console.info(`Platform: ${platform}`);

        // Fungsi untuk memproses post_code
        const processPostCode = async (code) => {
            await getDataIg.getDataPostByCode(
                code,
                client_account,
                kategori,
                platform
            );
        };

        // Periksa apakah post_code adalah array atau satuan
        if (Array.isArray(post_code)) {
            for (const code of post_code) {
                await processPostCode(code);
            }
        } else {
            await processPostCode(post_code);
        }

        res.send(`Data ${platform} getDataPostByCode for all specified post codes have been fetched and saved.`);
    } catch (error) {
        console.error("❌ Error in /getPostDataByCode route:", error.message);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;