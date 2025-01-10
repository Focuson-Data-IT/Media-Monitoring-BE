const express = require('express');
const router = express.Router();
const saveData = require('../controllers/saveData');
const db = require('../models/db'); // Pastikan ini diatur sesuai koneksi database Anda

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

module.exports = router;