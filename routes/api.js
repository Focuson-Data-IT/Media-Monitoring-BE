const express = require('express');
const router = express.Router();
const db = require('../models/db'); // Pastikan ini diatur sesuai koneksi database Anda

router.post('/auth/login', async (req, res) => {
    try {
        const query = `
            SELECT * FROM mitra
            WHERE email = ?
            AND password = ?
        `;

        const queryParams = [
            req.body.email,
            req.body.password
        ];

        const [rows] = await db.query(query, queryParams);

        if (rows.length > 0) {
            res.json({
                code: 200,
                status: 'OK',
                data: rows[0],
                errors: null
            });
        } else {
            res.json({
                code: 401,
                status: 'Unauthorized',
                data: null,
                errors: ['Invalid username or password']
            });
        }
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).send('Failed to log in');
    }
});

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
                interactions AS value,
            MAX(interactions) OVER () AS max_value
            FROM (
                SELECT
                username,
                client_account,
                interactions,
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
        const query = `
            SELECT
                client_account,
                username,
                fair_score AS value,
                date
            FROM dailyFairScores
            WHERE
                client_account = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
            
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

router.get('/getFairRanking', async (req, res) => {
    try {
        const query = `
            SELECT
                client_account,
                username,
                MAX(fair_score) AS max_value,
                SUM(fair_score) AS avg_value
            FROM dailyFairScores
            WHERE
                client_account = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
            GROUP BY client_account, username
            ORDER BY max_value DESC
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
        console.error('Error fetching fair ranking:', error);
        res.status(500).send('Failed to fetch fair ranking');
    }
});

// Endpoint untuk mengambil data dari tabel dailyFairScores
router.get('/getAllData', async (req, res) => {
    try {
        const query = `
            SELECT *
            FROM dailyFairScores
            WHERE
                kategori = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
            ORDER BY DATE(date) DESC
        `;

        const queryParams = [
            req.query['kategori'],
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
        console.error('Error fetching data:', error.message);
        res.status(500).json({ message: 'Gagal mengambil data.', error: error.message });
    }
});

router.get('/getAllPost', async (req, res) => {
    try {
        const query = `
            SELECT *
            FROM posts
            WHERE
                client_account = ?
                AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)
            ORDER BY created_at DESC
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

module.exports = router;