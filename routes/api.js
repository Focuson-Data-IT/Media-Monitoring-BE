const express = require('express');
const router = express.Router();
const db = require('../models/db');
const connection = require("../models/db"); // Pastikan ini diatur sesuai koneksi database Anda

router.post('/prosesPerformaKonten', async (req, res) => {
    try {
        const query = `
            UPDATE posts
            SET performa_konten = (
                CASE
                    WHEN platform = 'instagram' THEN
                        CASE
                            WHEN media_name IN ('post', 'album') THEN
                                (playCount / 24 * 0) +
                                (likes / 24 * 2) +
                                (comments / 24 * 1) +
                                (shareCount / 24 * 0)
                            WHEN media_name = 'reel' THEN
                                (playCount / 24 * 2.5) +
                                (likes / 24 * 2) +
                                (comments / 24 * 1.5) +
                                (shareCount / 24 * 1)
                            END
                    WHEN platform = 'TikTok' THEN
                        (playCount / 24 * 4) +
                        (likes / 24 * 2.5) +
                        (comments / 24 * 1.5) +
                        (shareCount / 24 * 1.5) +
                        (collectCount / 24 * 0.5)
                    ELSE
                        NULL
                    END
                )
            WHERE DATE(created_at) BETWEEN ? AND ?
        `;

        const queryParams = [
            req.body.startDate,
            req.body.endDate
        ];

        const [rows] = await db.query(query, queryParams);

        if (rows.length > 0) {
            res.json({
                code: 200,
                status: 'OK',
                data: rows[0],
                errors: null
            });
        }
    } catch (error) {
        console.error('Error logging in:', error);
        res.json({
            code: 401,
            status: 'Unauthorized',
            data: null,
            errors: error
        });
    }
})

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
                platform,
            MAX(followers) OVER () AS max_value
            FROM (
                SELECT
                username,
                client_account,
                followers,
                platform,
                ROW_NUMBER() OVER (PARTITION BY username, client_account ORDER BY DATE(date) DESC) AS row_num
                FROM
                dailyFairScores
                WHERE
                kategori = ?
                AND platform = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
                ) AS ranked
            WHERE
                row_num = 1
            ORDER BY
                max_value DESC
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
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
                platform,
            MAX(activities) OVER () AS max_value
            FROM (
                SELECT
                username,
                client_account,
                activities,
                platform,
                ROW_NUMBER() OVER (PARTITION BY username, client_account ORDER BY DATE(date) DESC) AS row_num
                FROM
                dailyFairScores
                WHERE
                kategori = ?
                AND platform = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
                ) AS ranked
            WHERE
                row_num = 1
            ORDER BY
                max_value DESC
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
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
                platform,
            MAX(interactions) OVER () AS max_value
            FROM (
                SELECT
                username,
                client_account,
                interactions,
                platform,
                ROW_NUMBER() OVER (PARTITION BY username, client_account ORDER BY DATE(date) DESC) AS row_num
                FROM
                dailyFairScores
                WHERE
                kategori = ?
                AND platform = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
                ) AS ranked
            WHERE
                row_num = 1
            ORDER BY
                max_value DESC
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
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
                platform,
            MAX(responsiveness) OVER () AS max_value
            FROM (
                SELECT
                username,
                client_account,
                responsiveness,
                platform,
                ROW_NUMBER() OVER (PARTITION BY username, client_account ORDER BY DATE(date) DESC) AS row_num
                FROM
                dailyFairScores
                WHERE
                kategori = ?
                AND platform = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
                ) AS ranked
            WHERE
                row_num = 1
            ORDER BY
                max_value DESC
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
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
                date,
                platform
            FROM dailyFairScores
            WHERE
                kategori = ?
                AND platform = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
                AND is_render = 1
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
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
                SUM(fair_score) AS avg_value,
                platform
            FROM dailyFairScores
            WHERE
                kategori = ?
                AND platform = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
            GROUP BY client_account, username, platform
            ORDER BY max_value DESC
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
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
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM posts
            WHERE kategori = ?
              AND platform = ?
              AND DATE (created_at) BETWEEN DATE (?)
              AND DATE (?)
        `;

        const dataQuery = `
            SELECT *
            FROM posts
            WHERE kategori = ?
              AND platform = ?
              AND DATE (created_at) BETWEEN DATE (?)
              AND DATE (?)
            ORDER BY created_at DESC
                LIMIT ?
            OFFSET ?
        `;

        const perPage = parseInt(req.query['perPage']) || 10;
        const page = parseInt(req.query['page']) || 1;
        const offset = (page - 1) * perPage;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
            req.query['start_date'],
            req.query['end_date']
        ];

        const [countRows] = await db.query(countQuery, queryParams);
        const total = countRows[0].total;
        const totalPages = Math.ceil(total / perPage);

        const [dataRows] = await db.query(dataQuery, [...queryParams, perPage, offset]);

        res.json({
            code: 200,
            status: 'OK',
            data: dataRows,
            totalRows: total,
            totalPages: totalPages,
            errors: null
        });
    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).send('Failed to fetch posts');
    }
});

module.exports = router;