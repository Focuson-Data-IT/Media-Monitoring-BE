const express = require('express');
const router = express.Router();
const db = require('../models/db'); // Pastikan ini diatur sesuai koneksi database Anda

router.get('/getFollowers', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT list_id, client_account, kategori, platform, username, date, followers, followers_score, followers_bobot FROM dailyFairScores');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching dates:', error);
        res.status(500).send('Failed to fetch dates');
    }
});

router.get('/getActivities', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT list_id, client_account, kategori, platform, username, date, activities, activities_score, activities_bobot FROM dailyFairScores');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching dates:', error);
        res.status(500).send('Failed to fetch dates');
    }
});

router.get('/getInteractions', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT list_id, client_account, kategori, platform, username, date, interaction, interaction_score, interaction_bobot FROM dailyFairScores');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching dates:', error);
        res.status(500).send('Failed to fetch dates');
    }
});

router.get('/getResponsiveness', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT list_id, client_account, kategori, platform, username, date, responsiveness, responsiveness_score, responsiveness_bobot FROM dailyFairScores');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching dates:', error);
        res.status(500).send('Failed to fetch dates');
    }
});

router.get('/getFairScores', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT list_id, client_account, kategori, platform, username, date, fair_score FROM dailyFairScores');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching dates:', error);
        res.status(500).send('Failed to fetch dates');
    }
});

// Endpoint untuk mengambil data dari tabel dailyFairScores
router.get('/getAllData', async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM dailyFairScores');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching data:', error.message);
        res.status(500).json({ message: 'Gagal mengambil data.', error: error.message });
    }
});

module.exports = router;