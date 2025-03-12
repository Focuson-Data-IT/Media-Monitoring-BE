// routes/getFairDataInsights.js
const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { generateFairSummary } = require('../services/fairSummaryService');

router.get('/getFairSummary', async (req, res) => {
  try {
    const { username, month, kategori, platform } = req.query;

    if (!username || !month) {
      return res.status(400).json({ code: 400, status: 'ERROR', message: 'username dan month wajib diisi.' });
    }

    const summary = await generateFairSummary(username, month, kategori, platform);
    res.json({ code: 200, status: 'OK', summary });
  } catch (error) {
    res.status(500).json({ code: 500, status: 'ERROR', message: error.message });
  }
});

router.get('/getFairDataInsights', async (req, res) => {
    try {
        const { kategori, platform, username, month } = req.query;

        if (!username || !month) {
            return res.status(400).json({ code: 400, status: 'ERROR', message: 'Parameter username dan month wajib diisi.' });
        }

        const startDate = `${month}-01`;
        const endDate = `${month}-${new Date(month + '-01').getDate()}`;

        // 🔹 **Cari MAX(date)** dalam rentang tanggal
        const [maxDateResult] = await db.query(
            `SELECT MAX(date) as maxDate 
             FROM dailyFairScores 
             WHERE FIND_IN_SET(?, kategori) AND LOWER(platform) = LOWER(?) 
             AND DATE(date) BETWEEN DATE(?) AND DATE(?)`,
            [kategori, platform, startDate, endDate]
        );

        const maxDate = maxDateResult[0]?.maxDate;
        if (!maxDate) {
            return res.json({ code: 200, status: 'OK', data: [], errors: 'No data found' });
        }

        // 🔹 **Ambil semua data untuk tanggal MAX tersebut**
        const [allRows] = await db.query(
            `SELECT *, CONVERT_TZ(date, '+00:00', '+07:00') AS local_date
             FROM dailyFairScores
             WHERE FIND_IN_SET(?, kategori) AND LOWER(platform) = LOWER(?) AND DATE(date) = ?`,
            [kategori, platform, maxDate]
        );

        if (!allRows.length) {
            return res.json({ code: 200, status: 'OK', data: [], errors: 'No data found' });
        }

        // 🔹 **Urutkan data berdasarkan FAIR Score (DESC)** dan beri ranking
        const sortedRows = allRows.sort((a, b) => b.fair_score - a.fair_score);
        const rankedData = sortedRows.map((row, index) => ({
            rank: index + 1,
            platform: row.platform,
            username: row.username,
            date: row.local_date,
            followers: row.followers,
            activities: row.activities,
            interactions: row.interactions,
            responsiveness: row.responsiveness,
            fair_score: row.fair_score
        }));

        // 🔹 **Ambil top 3 akun**
        const top3 = rankedData.slice(0, 3);

        // 🔹 **Cari akun yang diminta**
        const requestedUser = rankedData.find(row => row.username === username);

        // 🔹 **Buat response:** Top 3 + requested user (jika tidak ada di top 3)
        const responseData = top3.some(user => user.username === username)
            ? top3 // Jika requested user sudah di top 3
            : [...top3, requestedUser]; // Jika tidak, tambahkan requested user

        res.json({ code: 200, status: 'OK', data: responseData, errors: null });

    } catch (error) {
        console.error('Error fetching fair data insights:', error);
        res.status(500).send('Failed to fetch fair data insights.');
    }
});


module.exports = router;
