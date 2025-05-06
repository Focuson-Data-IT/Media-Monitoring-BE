const express = require('express');
const router = express.Router();
const getDataIg = require('../controllers/getDataIg');
const db = require('../models/db');

const PLATFORM = "Instagram";

// ✅ Update followers berdasarkan kategori
router.get('/update-followers', async (req, res) => {
    const { kategori } = req.query;
    if (!kategori) return res.status(400).send('❌ kategori parameter is required.');

    try {
        const result = await getDataIg.getDataFollowers(kategori, PLATFORM);
        res.send(result);
    } catch (error) {
        console.error('❌ Error executing update:', error.message);
        res.status(500).send(`Error executing update: ${error.message}`);
    }
});

// ✅ Ambil data user berdasarkan kategori
router.get('/getData', async (req, res) => {
    const { kategori } = req.query;
    if (!kategori) return res.status(400).send('❌ kategori parameter is required.');

    try {
        await getDataIg.getDataUser(kategori, PLATFORM);
        res.send(`✅ Data ${PLATFORM} for category "${kategori}" has been fetched and saved.`);
    } catch (error) {
        console.error('❌ Error executing getData:', error.message);
        res.status(500).send(`❌ Error executing getData: ${error.message}`);
    }
});

// ✅ Ambil post berdasarkan kategori
router.get('/getPost', async (req, res) => {
    const { kategori } = req.query;
    if (!kategori) return res.status(400).send('❌ kategori parameter is required.');

    try {
        await getDataIg.getDataPost(kategori, PLATFORM);
        res.send(`✅ Posts ${PLATFORM} for category "${kategori}" have been fetched and saved.`);
    } catch (error) {
        console.error('❌ Error executing getPost:', error.message);
        res.status(500).send(`❌ Error executing getPost: ${error.message}`);
    }
});

// ✅ Ambil komentar + child comments berdasarkan kategori
router.get('/getComment', async (req, res) => {
    const { kategori } = req.query;
    if (!kategori) return res.status(400).json({ message: '❌ kategori parameter is required.' });

    try {
        await getDataIg.getDataComment(kategori, PLATFORM);
        await getDataIg.getDataChildComment(kategori, PLATFORM);
        res.send(`✅ Comments and child comments ${PLATFORM} for category "${kategori}" have been fetched and saved.`);
    } catch (error) {
        console.error('❌ Error executing getComment:', error.message);
        res.status(500).json({ message: '❌ Error fetching comments.', error: error.message });
    }
});

// ✅ Ambil komentar + child comments dari URL spesifik
router.get('/getCommentByCode', async (req, res) => {
    const { kategori, url } = req.query;
    if (!kategori || !url) return res.status(400).json({ message: '❌ kategori and url parameter are required.' });

    try {
        await getDataIg.getDataCommentByUrl(url, kategori, PLATFORM);
        await getDataIg.getChildCommentByUrl(url, kategori, PLATFORM);
        res.send(`✅ Comments and child comments ${PLATFORM} for category "${kategori}" have been fetched and saved.`);
    } catch (error) {
        console.error('❌ Error executing getCommentByCode:', error.message);
        res.status(500).json({ message: '❌ Error fetching comments by code.', error: error.message });
    }
});

// ✅ Ambil likes semua post di platform Instagram
router.get('/getLikes', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM posts WHERE platform = ?', [PLATFORM]);

        for (const row of rows) {
            const { post_code, created_at } = row;
            try {
                await getDataIg.getDataLikes(post_code, created_at);
                console.log(`✅ Likes for post ${post_code} fetched.`);
            } catch (err) {
                console.error(`❌ Error fetching likes for post ${post_code}:`, err.message);
            }
        }

        res.send(`✅ Likes ${PLATFORM} fetched and saved.`);
    } catch (error) {
        console.error('❌ Error executing getLikes:', error.message);
        res.status(500).send(`❌ Error executing getLikes: ${error.message}`);
    }
});

// ✅ Ambil data post berdasarkan keyword dari listKeywords
router.get('/getDataPostByKeywords', async (req, res) => {
    const { kategori } = req.query;
    if (!kategori) return res.status(400).send('❌ kategori parameter is required.');

    try {
        const [rows] = await db.query(`
            SELECT * FROM listKeywords 
            WHERE platform = ? AND FIND_IN_SET(?, kategori)
        `, [PLATFORM, kategori]);

        await Promise.all(rows.map(row =>
            getDataIg.getDataPostByKeyword(row.kategori, PLATFORM, row.client_account, row.keyword)
        ));

        res.send(`✅ Data post ${PLATFORM} by keywords fetched for category ${kategori}.`);
    } catch (error) {
        console.error('❌ Error executing getDataPostByKeywords:', error.message);
        res.status(500).send(`❌ Error executing getDataPostByKeywords: ${error.message}`);
    }
});

// ✅ Ambil post berdasarkan kode post manual
router.post('/getPostDataByCode', async (req, res) => {
    const { kategori, post_code, client_account, platform } = req.body;

    if (!kategori || !post_code || !client_account || !platform) {
        return res.status(400).send('❌ All parameters are required.');
    }

    const processCode = async (code) => {
        await getDataIg.getDataPostByCode(code, client_account, kategori, platform);
    };

    try {
        if (Array.isArray(post_code)) {
            for (const code of post_code) await processCode(code);
        } else {
            await processCode(post_code);
        }

        res.send(`✅ Posts by code fetched and saved for platform ${platform}.`);
    } catch (error) {
        console.error('❌ Error in /getPostDataByCode:', error.message);
        res.status(500).json({ error: '❌ Internal Server Error' });
    }
});

module.exports = router;