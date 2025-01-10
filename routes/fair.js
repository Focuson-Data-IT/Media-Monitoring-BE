const express = require('express');
const router = express.Router();
const saveData = require('../controllers/saveData');
const fairScore = require('../controllers/fairScore');

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

// Endpoint untuk memasukan data mentah, memproses dan memasukan data matang ke dalam tabel dailyFairScores
router.post('/processData', async (req, res) => {
    try {
        console.info('Starting to process data...');
        await fairScore.processData(req, res);
        res.json({ success: true, message: 'Data berhasil diproses dan disimpan ke dailyFairScores.' });
    } catch (error) {
        console.error('Error processing data:', error.message);
        res.status(500).json({ success: false, message: 'Gagal menyimpan data user ke dailyFairScores.', error: error.message });
    }
});

module.exports = router;