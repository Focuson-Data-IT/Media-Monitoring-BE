const express = require('express');
const router = express.Router();
const db = require('../models/db'); // Pastikan ini diatur sesuai koneksi database Anda

router.get('/getFollowers', async (req, res) => {
    try {
        const query = `
            SELECT
                username,
                client_account,
                followers AS value,
            MAX(followers) OVER () AS max_value
            FROM (
                SELECT
                username,
                client_account,
                followers,
                ROW_NUMBER() OVER (PARTITION BY username, client_account ORDER BY DATE(date) DESC) AS row_num
                FROM
                dailyFairScores
                WHERE
                client_account = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
                ) AS ranked
            WHERE
                row_num = 1
            ORDER BY
                max_value DESC
        `;

        const queryParams = [
            req.query['customer_username'],
            req.query['start_date'],
            req.query['end_date']
        ];

        const [rows] = await db.query(query, queryParams);

        res.json({
            code: 200,
            status: 'OK',
            data: rows,
            errors: null
        });
    } catch (error) {
        console.error('Error fetching dates:', error);
        res.status(500).send('Failed to fetch dates');
    }
});

router.get('/getActivities', async (req, res) => {
    try {
        const query = `
            SELECT
                username,
                client_account,
                activities AS value,
            MAX(activities) OVER () AS max_value
            FROM (
                SELECT
                username,
                client_account,
                activities,
                ROW_NUMBER() OVER (PARTITION BY username, client_account ORDER BY DATE(date) DESC) AS row_num
                FROM
                dailyFairScores
                WHERE
                client_account = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
                ) AS ranked
            WHERE
                row_num = 1
            ORDER BY
                max_value DESC
        `;

        const queryParams = [
            req.query['customer_username'],
            req.query['start_date'],
            req.query['end_date']
        ];

        const [rows] = await db.query(query, queryParams);

        res.json({
            code: 200,
            status: 'OK',
            data: rows,
            errors: null
        });
    } catch (error) {
        console.error('Error fetching dates:', error);
        res.status(500).send('Failed to fetch dates');
    }
});

router.get('/getInteractions', async (req, res) => {
    try {
        const query = `
            SELECT
                username,
                client_account,
                interaction AS value,
            MAX(interaction) OVER () AS max_value
            FROM (
                SELECT
                username,
                client_account,
                interaction,
                ROW_NUMBER() OVER (PARTITION BY username, client_account ORDER BY DATE(date) DESC) AS row_num
                FROM
                dailyFairScores
                WHERE
                client_account = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
                ) AS ranked
            WHERE
                row_num = 1
            ORDER BY
                max_value DESC
        `;

        const queryParams = [
            req.query['customer_username'],
            req.query['start_date'],
            req.query['end_date']
        ];

        const [rows] = await db.query(query, queryParams);

        res.json({
            code: 200,
            status: 'OK',
            data: rows,
            errors: null
        });
    } catch (error) {
        console.error('Error fetching dates:', error);
        res.status(500).send('Failed to fetch dates');
    }
});

router.get('/getResponsiveness', async (req, res) => {
    try {
        const query = `
            SELECT
                username,
                client_account,
                responsiveness AS value,
            MAX(responsiveness) OVER () AS max_value
            FROM (
                SELECT
                username,
                client_account,
                responsiveness,
                ROW_NUMBER() OVER (PARTITION BY username, client_account ORDER BY DATE(date) DESC) AS row_num
                FROM
                dailyFairScores
                WHERE
                client_account = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
                ) AS ranked
            WHERE
                row_num = 1
            ORDER BY
                max_value DESC
        `;

        const queryParams = [
            req.query['customer_username'],
            req.query['start_date'],
            req.query['end_date']
        ];

        const [rows] = await db.query(query, queryParams);

        res.json({
            code: 200,
            status: 'OK',
            data: rows,
            errors: null
        });
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