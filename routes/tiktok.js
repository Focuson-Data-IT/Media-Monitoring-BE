const express = require('express');
const router = express.Router();
const getDataTiktok = require('../controllers/getDataTiktok');
const db = require('../models/db'); // Pastikan ini diatur sesuai koneksi database Anda
const platform = "TikTok";

router.get('/update-followers', async (req, res) => {
    const { kategori, platform } = req.body;

    try {
        
        await getDataTiktok.getDataFollowers(
            kategori,
            platform
        )

        res.send('Data followers & following berhasil diperbarui untuk semua pengguna.');
    } catch (error) {
        console.error('Error executing update:', error.message);
        res.status(500).send(`Error executing update: ${error.message}`);
    }
});

// Eksekusi getData berdasarkan semua username di listAkun
router.get('/getData', async (req, res) => {
    const { kategori } = req.query;

    if (!kategori) {
        return res.status(400).send('❌ Error: kategori parameter is required.');
    }

    try {
        console.info(`🔍 Starting data fetching for category: ${kategori}`);

        // Langsung panggil getDataUser tanpa looping tambahan
        await getDataTiktok.getDataUser(kategori, "TikTok");

        res.send(`✅ Data ${platform} for category "${kategori}" has been fetched and saved.`);
    } catch (error) {
        console.error('❌ Error executing getData:', error.message);
        res.status(500).send(`❌ Error executing getData: ${error.message}`);
    }
});

// Eksekusi getPost berdasarkan semua username di listAkun
router.get('/getPost', async (req, res) => {
    const { kategori } = req.query;

    if (!kategori) {
        return res.status(400).send('❌ Error: kategori parameter is required.');
    }

    try {
        console.info(`🔍 Starting post fetching for category: ${kategori}`);

        // Langsung panggil getDataPost tanpa looping tambahan
        await getDataTiktok.getDataPost(kategori, "TikTok");

        res.send(`✅ Data ${platform} posts for category "${kategori}" have been fetched and saved.`);
    } catch (error) {
        console.error('❌ Error executing getPost:', error.message);
        res.status(500).send(`❌ Error executing getPost: ${error.message}`);
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
    const { kategori } = req.query;

    if (!kategori) {
        return res.status(400).json({ message: '❌ kategori parameter is required.' });
    }

    try {
        console.info(`🔍 Fetching comments for category: ${kategori}`);

        // Ambil tanggal dari database
        const dateRange = await getDateRange();
        if (!dateRange) {
            return res.status(500).json({ message: '❌ Gagal mendapatkan rentang tanggal dari database.' });
        }

        const { startDate, endDate } = dateRange; // Destructuring tanggal

        // Step 1: Fetch Main Comments
        console.log('🚀 Fetching main comments...');
        await getDataTiktok.getDataComment(kategori, "TikTok", startDate, endDate);
        console.log('✅ Main comments processing completed.');

        // Step 2: Fetch Child Comments
        console.log('🚀 Fetching child comments...');
        await getDataTiktok.getDataChildComment(kategori, "TikTok", startDate, endDate);
        console.log('✅ Child comments processing completed.');

        res.send(`✅ Comments and child ${platform} comments for category "${kategori}" have been fetched and saved.`);
    } catch (error) {
        console.error('❌ Error executing getComment and getChildComment:', error.message);
        res.status(500).json({
            message: '❌ Error fetching comments.',
            error: error.message,
        });
    }
});

router.get('/getDataPostByKeywords', async (req, res) => {
    const { kategori } = req.query;
    // Fetch data for TikTok
    try {
        const [rows] = await db.query(`
            SELECT * FROM listKeywords 
            WHERE 
            platform = "TikTok" 
            AND FIND_IN_SET(?, kategori) 
            `, [kategori]);

        (rows, async (row) => {
            console.log(`Fetching posts for keyword: ${row.keyword}...`);
            await getDataTiktok.getDataPostByKeyword(
                row.client_account,
                row.kategori,
                row.platform,
                row.keyword
            );
            console.log(`Posts for keywords ${row.keyword} have been fetched and saved.`);
        });

        res.send(`Data ${platform} getDataPostByKeywords for all users have been fetched and saved.`);
    } catch (error) {
        console.error('Error executing getDataPostByKeywords:', error.message);
        res.status(500).send(`Error executing getDataPostByKeywords: ${error.message}`);
    }
});

module.exports = router;