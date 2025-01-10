const express = require('express');
const router = express.Router();
const db = require('../models/db'); // Pastikan ini diatur sesuai koneksi database Anda

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

module.exports = router;