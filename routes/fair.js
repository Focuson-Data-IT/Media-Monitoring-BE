const express = require('express');
const router = express.Router();
const saveData = require('../controllers/saveData');
const fairScoreDaily = require('../controllers/fairScoreDaily');
const fairScoreMonthly = require('../controllers/fairScoreMonthly');


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
// router.post('/processData', async (req, res) => {
//     try {
//         const { kategori, platform } = req.body; // Ambil kategori dari request body

//         if (!kategori) {
//             return res.status(400).json({ success: false, message: 'Kategori harus disertakan dalam request.' });
//         }

//         console.info(`Starting to process data for kategori: ${kategori}...`);
//         // await fairScoreDaily.processData('2025-01-01', new Date().toISOString().split('T')[0], kategori, platform);
//         await fairScoreDaily.processData('2025-01-01', '2025-01-31', kategori, platform);
//         // await fairScoreMonthly.processData('2025-01-01', new Date().toISOString().split('T')[0], kategori, platform);
//         await fairScoreMonthly.processData('2025-01-01', '2025-01-31', kategori, platform);

//         res.json({ success: true, message: `Data berhasil diproses untuk kategori: ${kategori} dan disimpan ke dailyFairScores.` });
//     } catch (error) {
//         console.error('Error processing data:', error.message);
//         res.status(500).json({ success: false, message: 'Gagal menyimpan data user ke dailyFairScores.', error: error.message });
//     }
// });

// Endpoint untuk memasukan data mentah, memproses, dan memasukkan data matang ke dalam tabel dailyFairScores
router.post('/processData', async (req, res) => {
    try {
        const { kategori, platform } = req.body; // Ambil kategori dari request body

        if (!kategori) {
            return res.status(400).json({ success: false, message: 'Kategori harus disertakan dalam request.' });
        }

        console.info(`Starting to process data for kategori: ${kategori}...`);

        // Jalankan fairScoreDaily dan fairScoreMonthly secara paralel menggunakan Promise.all()
        await Promise.all([
            // fairScoreDaily.processData('2025-01-01', new Date().toISOString().split('T')[0], kategori, platform),
            fairScoreDaily.processData('2025-01-01', '2025-01-31', kategori, platform),
            // fairScoreMonthly.processData('2025-01-01', new Date().toISOString().split('T')[0], kategori, platform)
            fairScoreMonthly.processData('2025-01-01', '2025-01-31', kategori, platform)
        ]);

        res.json({ success: true, message: `Data berhasil diproses untuk kategori: ${kategori} dan disimpan ke dailyFairScores.` });
    } catch (error) {
        console.error('Error processing data:', error.message);
        res.status(500).json({ success: false, message: 'Gagal menyimpan data user ke dailyFairScores.', error: error.message });
    }
});

module.exports = router;