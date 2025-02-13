const express = require('express');
const router = express.Router();
const db = require('../models/db');
const cliProgress = require('cli-progress');

router.post('/prosesPerformaKonten', async (req, res) => {
    try {
        console.info("🔄 Memulai proses update performa konten...");
        console.info("📅 Rentang tanggal:", req.body.startDate, "sampai", req.body.endDate);

        // Ambil jumlah total baris yang akan diperbarui
        const countQuery = `
            SELECT COUNT(*) AS total FROM posts WHERE DATE(created_at) BETWEEN ? AND ?
        `;
        const [countResult] = await db.query(countQuery, [req.body.startDate, req.body.endDate]);
        const totalRows = countResult[0].total;

        if (totalRows === 0) {
            console.warn("⚠️ Tidak ada data yang diperbarui dalam rentang tanggal tersebut.");
            return res.json({
                code: 200,
                status: 'OK',
                message: "Tidak ada data yang diperbarui",
                data: null,
                errors: null
            });
        }

        // Inisialisasi Progress Bar
        const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
        progressBar.start(totalRows, 0);

        // Update per baris menggunakan iterasi manual
        const updateQuery = `
            UPDATE posts
            SET performa_konten = (
                CASE
                    WHEN platform = 'Instagram' THEN
                        CASE
                            WHEN media_name IN ('post', 'album') THEN
                                COALESCE((IFNULL(likes, 0) / 24 * 2) +
                                         (IFNULL(comments, 0) / 24 * 1), 0)
                            WHEN media_name = 'reel' THEN
                                COALESCE((IFNULL(playCount, 0) / 24 * 2.5) +
                                         (IFNULL(likes, 0) / 24 * 2) +
                                         (IFNULL(comments, 0) / 24 * 1.5) +
                                         (IFNULL(shareCount, 0) / 24 * 1), 0)
                        END
                    WHEN platform = 'TikTok' THEN
                        COALESCE((IFNULL(playCount, 0) / 24 * 4) +
                                 (IFNULL(likes, 0) / 24 * 2.5) +
                                 (IFNULL(comments, 0) / 24 * 1.5) +
                                 (IFNULL(shareCount, 0) / 24 * 1.5) +
                                 (IFNULL(collectCount, 0) / 24 * 0.5), 0)
                    ELSE 0
                END
            )
            WHERE post_id = ?
        `;

        // Ambil semua ID postingan yang perlu diperbarui
        const selectQuery = `SELECT post_id FROM posts WHERE DATE(created_at) BETWEEN ? AND ?`;
        const [rows] = await db.query(selectQuery, [req.body.startDate, req.body.endDate]);

        for (const row of rows) {
            console.info(row.post_id)
            await db.query(updateQuery, [row.post_id]);
            progressBar.increment(); // Update progress bar setiap 1 record selesai
        }

        progressBar.stop(); // Hentikan progress bar setelah semua selesai

        console.info("✅ Semua data berhasil diperbarui.");

        res.json({
            code: 200,
            status: 'OK',
            message: "Performa konten berhasil diperbarui",
            data: { updatedRows: totalRows },
            errors: null
        });
    } catch (error) {
        console.error("❌ Terjadi kesalahan:", error);
        res.status(500).json({
            code: 500,
            status: 'Internal Server Error',
            data: null,
            errors: error.message
        });
    }
});

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

router.get('/getDailyFollowers', async (req, res) => {
    try {
        const query = `
            SELECT
                username,
                client_account,
                followers AS value,
                platform,
                date
            FROM dailyFairScores
            WHERE
                kategori = ?
                AND platform = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
            ORDER BY
                date ASC
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
        console.error('Error fetching daily followers:', error);
        res.status(500).send('Failed to fetch daily followers');
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

router.get('/getDailyActivities', async (req, res) => {
    try {
        const query = `
            SELECT
                username,
                client_account,
                activities AS value,
                platform,
                date
            FROM dailyFairScores
            WHERE
                kategori = ?
                AND platform = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
            ORDER BY
                date ASC
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
        console.error('Error fetching daily followers:', error);
        res.status(500).send('Failed to fetch daily followers');
    }
});

router.get('/getActivities', async (req, res) => {
    try {
        const query = `
        SELECT
            username,
            client_account,
            SUM(activities) / NULLIF(DATEDIFF(?, ?) + 1, 0) AS value,
            platform,
            MAX(SUM(activities) / NULLIF(DATEDIFF(?, ?) + 1, 0)) OVER () AS max_value
        FROM dailyFairScores
        WHERE
            kategori = ?
            AND platform = ?
            AND DATE(date) BETWEEN DATE(?) AND DATE(?)
        GROUP BY username, client_account, platform
        ORDER BY activities DESC;
        `;

        const queryParams = [
            req.query['end_date'],
            req.query['start_date'],
            req.query['end_date'],
            req.query['start_date'],
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

router.get('/getDailyInteractions', async (req, res) => {
    try {
        const query = `
            SELECT
                username,
                client_account,
                interactions AS value,
                platform,
                date
            FROM dailyFairScores
            WHERE
                kategori = ?
                AND platform = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
            ORDER BY
                date ASC
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
        console.error('Error fetching daily followers:', error);
        res.status(500).send('Failed to fetch daily followers');
    }
});

router.get('/getInteractions', async (req, res) => {
    try {
        const query = `
        SELECT
            username,
            client_account,
            CASE 
                WHEN SUM(activities) = 0 THEN 0 -- Menghindari pembagian dengan nol
                ELSE SUM(interactions) / SUM(activities) 
            END AS value, -- Membagi total interactions dengan total activities per user
            platform,
            MAX(
                CASE 
                    WHEN SUM(activities) = 0 THEN 0
                    ELSE SUM(interactions) / SUM(activities) 
                END
            ) OVER () AS max_value -- Mengambil nilai terbesar dari perhitungan di atas
        FROM dailyFairScores
        WHERE
            kategori = ?
            AND platform = ?
            AND DATE(date) BETWEEN DATE(?) AND DATE(?)
        GROUP BY username, client_account, platform -- Pastikan data dikelompokkan per user
        ORDER BY value DESC;
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

router.get('/getDailyResponsiveness', async (req, res) => {
    try {
        const query = `
            SELECT
                username,
                client_account,
                responsiveness AS value,
                platform,
                date
            FROM dailyFairScores
            WHERE
                kategori = ?
                AND platform = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
            ORDER BY
                date ASC
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
        console.error('Error fetching daily followers:', error);
        res.status(500).send('Failed to fetch daily followers');
    }
});

router.get('/getResponsiveness', async (req, res) => {
    try {
        const query = `
        SELECT
            username,
            client_account,
            SUM(responsiveness) AS value, -- Menjumlahkan semua responsiveness per user
            platform,
            MAX(SUM(responsiveness)) OVER () AS max_value -- Mengambil nilai SUM tertinggi dari semua user
        FROM dailyFairScores
        WHERE
            kategori = ?
            AND platform = ?
            AND DATE(date) BETWEEN DATE(?) AND DATE(?)
        GROUP BY username, client_account, platform -- Pastikan data dikelompokkan per user
        ORDER BY value DESC;
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
            ORDER BY ? ?
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
            req.query['end_date'],
            req.query['orderBy'],
            req.query['direction'],
            perPage,
            offset
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

router.get('/getAllUsers', async (req, res) => {
    try {
        const query = `
            SELECT *
            FROM users
            WHERE
                kategori = ?
                AND platform = ?
                AND username = ?
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
            req.query['username']
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