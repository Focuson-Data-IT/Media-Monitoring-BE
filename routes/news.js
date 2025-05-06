const express = require('express');
const router = express.Router();
const getDataNews = require('../controllers/getDataNews');
const db = require('../models/db'); // Pastikan koneksi database kamu benar

// API untuk mengambil dan proses semua query dari listNews
router.get('/getNews', async (req, res) => {
    try {
        // 1. Ambil list query dari database
        const [rows] = await db.query('SELECT query FROM listNews');

        if (rows.length === 0) {
            return res.status(404).send('❌ Tidak ada query yang ditemukan di tabel listNews.');
        }

        // 2. Loop satu-satu dan panggil getDataNews
        for (let i = 0; i < rows.length; i++) {
            const query = rows[i].query;
            console.info(`🔍 [${i + 1}/${rows.length}] Fetching data for query: "${query}"`);
            await getDataNews.getDataNews(query);
        }

        res.send(`✅ Semua data berhasil diproses (${rows.length} query).`);
    } catch (error) {
        console.error('❌ Error saat mengambil data listNews:', error.message);
        res.status(500).send(`❌ Error saat mengambil data listNews: ${error.message}`);
    }
});

module.exports = router;