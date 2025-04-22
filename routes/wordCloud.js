const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('../models/db');

router.get('/generateWordcloud/:kategori', async (req, res) => {
    const kategori = req.params.kategori;

    try {
        // Ambil komentar dari DB
        const [mainRows] = await db.query(
            'SELECT comment_text FROM mainComments WHERE kategori = ?', [kategori]
        );
        const [childRows] = await db.query(
            'SELECT child_comment_text FROM childComments WHERE kategori = ?', [kategori]
        );

        const allComments = [
            ...mainRows.map(row => row.comment_text),
            ...childRows.map(row => row.child_comment_text)
        ].join(' ');

        if (!allComments || allComments.length < 5) {
            return res.status(404).json({ message: 'Komentar tidak ditemukan atau terlalu pendek' });
        }

        // Panggil Python
        const pythonPath = path.join(__dirname, '../env/bin/python3'); // Sesuaikan jika venv kamu beda
        const scriptPath = path.join(__dirname, '../python/generate_wordcloud.py');

        const py = spawn(pythonPath, [scriptPath]);
        py.stdin.write(JSON.stringify({ text: allComments }));
        py.stdin.end();

        py.stdout.on('data', (data) => {
            if (data.toString().includes('done')) {
                const imgPath = path.join(__dirname, '../wordcloud.png');
                const img = fs.readFileSync(imgPath);
                res.setHeader('Content-Type', 'image/png');
                res.send(img);
            }
        });

        py.stderr.on('data', (err) => {
            console.error('🐍 Python Error:', err.toString());
        });

    } catch (err) {
        console.error('❌ Error:', err);
        res.status(500).json({ message: 'Gagal generate WordCloud' });
    }
});

module.exports = router;
