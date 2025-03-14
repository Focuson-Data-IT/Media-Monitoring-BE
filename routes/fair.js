const express = require('express');
const router = express.Router();
const saveData = require('../controllers/saveData');
const fairScoreDaily = require('../controllers/fairScoreDaily');
const fairScoreMonthly = require('../controllers/fairScoreMonthly');
const connection = require('../models/db');

const PLATFORMS = ['Instagram', 'TikTok'];

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

// Fungsi untuk mengambil kategori unik dari listAkun
const getCategoriesFromListAkun = async () => {
    const query = `SELECT DISTINCT kategori FROM listAkun`;
    const [rows] = await connection.query(query);
    return rows.map(row => row.kategori);
};

// Endpoint untuk memasukkan data mentah, memproses, dan menyimpan ke tabel dailyFairScores
router.post('/processData', async (req, res) => {
    try {
        let { start_date, end_date, kategori, platform } = req.body;

        // Jika start_date atau end_date tidak diberikan, gunakan hari ini
        const today = new Date().toISOString().split('T')[0];
        start_date = start_date || today;
        end_date = end_date || today;

        console.info(`Processing data from ${start_date} to ${end_date}...`);

        // Jika kategori tidak diberikan, ambil dari listAkun
        let categories = kategori ? [kategori] : await getCategoriesFromListAkun();
        console.info(`Processing categories: ${categories.join(', ')}`);

        // Jika platform tidak diberikan, gunakan default ['Instagram', 'TikTok']
        let platforms = platform ? [platform] : PLATFORMS;
        console.info(`Processing platforms: ${platforms.join(', ')}`);

        // Jalankan semua kombinasi kategori & platform secara paralel
        const tasks = [];
        for (const cat of categories) {
            for (const plat of platforms) {
                tasks.push(fairScoreDaily.processData(start_date, end_date, cat, plat));
                tasks.push(fairScoreMonthly.processData(start_date, end_date, cat, plat));
            }
        }

        await Promise.all(tasks);

        res.json({ success: true, message: `Data berhasil diproses untuk kategori: ${categories.join(', ')} dan semua platform.` });
    } catch (error) {
        console.error('Error processing data:', error.message);
        res.status(500).json({ success: false, message: 'Gagal menyimpan data user ke dailyFairScores.', error: error.message });
    }
});

module.exports = router;