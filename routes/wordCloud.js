const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const db = require('../models/db');
const xlsx = require('xlsx');

router.get('/generateWordcloud/:kategori', async (req, res) => {
    const kategori = req.params.kategori;

    const boost = req.query.boost ? req.query.boost.split(',').map(s => s.trim()) : [];
    const downgrade = req.query.downgrade ? req.query.downgrade.split(',').map(s => s.trim()) : [];

    try {
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

        // Buat timestamp yang aman untuk nama file
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-');

        // Bangun nama file
        const filenameParts = [`wordcloud`, kategori];
        if (boost.length) filenameParts.push(`boost_${boost.join('-')}`);
        if (downgrade.length) filenameParts.push(`downgrade_${downgrade.join('-')}`);
        filenameParts.push(timestamp);

        const filename = `${filenameParts.join('-')}.png`;

        const pythonPath = path.join(__dirname, '../env/bin/python3');
        const scriptPath = path.join(__dirname, '../python/generate_wordcloud.py');

        const py = spawn(pythonPath, [scriptPath]);

        py.stdin.write(JSON.stringify({
            text: allComments,
            filename,
            boost,
            downgrade
        }));

        py.stdin.end();

        py.stdout.on('data', (data) => {
            if (data.toString().includes('done')) {
                const imgPath = path.join(__dirname, `../${filename}`);
                const img = fs.readFileSync(imgPath);
                res.setHeader('Content-Type', 'image/png');
                res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
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

router.get('/generateWordcloudFromExcel', async (req, res) => {
    try {
        // 1. Baca file Excel
        const workbook = xlsx.readFile(path.join(__dirname, '../data/data.xlsx'));
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = xlsx.utils.sheet_to_json(sheet);

        // 2. Path Python dan script
        const pythonPath = path.join(__dirname, '../env/bin/python3'); // sesuaikan
        const scriptPath = path.join(__dirname, '../python/generate_wordcloud.py');

        // 3. Ambil komentar berdasarkan Sentiment
        const positif = data
            .filter(row => row.Sentiment == 1 && row.Snipet)
            .map(row => row.Snipet)
            .join(' ');

        const negatif = data
            .filter(row => row.Sentiment == 2 && row.Snipet)
            .map(row => row.Snipet)
            .join(' ');

        // 4. Fungsi generate wordcloud dari Python
        const generate = (text, filename) => new Promise((resolve, reject) => {
            const py = spawn(pythonPath, [scriptPath]);

            py.stdin.write(JSON.stringify({ text, filename }));
            py.stdin.end();

            py.stdout.on('data', (data) => {
                if (data.toString().includes('done')) {
                    const outputPath = path.join(__dirname, `../${filename}`);
                    if (fs.existsSync(outputPath)) {
                        const img = fs.readFileSync(outputPath);
                        resolve({ filename, img });
                    } else {
                        reject(new Error(`File ${filename} not found.`));
                    }
                }
            });

            py.stderr.on('data', (err) => {
                console.error('🐍 Python Error:', err.toString());
            });

            py.on('error', reject);
        });

        // 5. Jalankan generate untuk positif dan negatif
        const [imgPositif, imgNegatif] = await Promise.all([
            generate(positif, 'wordcloud_positif.png'),
            generate(negatif, 'wordcloud_negatif.png')
        ]);

        // 6. Respon hasilnya (JSON bisa, atau kirim base64 jika mau langsung pratinjau)
        res.json({
            message: 'Sukses generate wordcloud dari Excel',
            files: [
                { name: imgPositif.filename, url: `/static/${imgPositif.filename}` },
                { name: imgNegatif.filename, url: `/static/${imgNegatif.filename}` }
            ]
        });

    } catch (err) {
        console.error('❌ Error:', err);
        res.status(500).json({ message: 'Gagal generate WordCloud dari Excel', error: err.message });
    }
});

module.exports = router;
