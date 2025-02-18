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
                CONVERT_TZ(date, '+00:00', '+07:00') AS date
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

router.get('/getDailyActivities', async (req, res) => {
    try {
        console.info(req.query);
        const query = `
            SELECT
                username,
                client_account,
                nilai_aktifitas AS value,
                platform,
                CONVERT_TZ(date, '+00:00', '+07:00') AS date
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
            activities AS value, -- Langsung ambil nilai activities dari tanggal terbaru
            platform,
            MAX(activities) OVER () AS max_value -- Mengambil nilai activities tertinggi dari tanggal terbaru
        FROM dailyFairScores
        WHERE kategori = ?
            AND platform = ?
            AND DATE(date) = (
                SELECT MAX(date) 
                FROM dailyFairScores 
                WHERE kategori = ? 
                AND platform = ? 
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
        )
        ORDER BY value DESC;
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
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
        console.error('Error fetching activities:', error);
        res.status(500).send('Failed to fetch activities');
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
                CONVERT_TZ(date, '+00:00', '+07:00') AS date
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
            interactions AS value, -- Langsung ambil nilai interactions dari tanggal terbaru
            platform,
            MAX(interactions) OVER () AS max_value -- Mengambil nilai interactions tertinggi dari tanggal terbaru
        FROM dailyFairScores
        WHERE kategori = ?
            AND platform = ?
            AND DATE(date) = (
                SELECT MAX(date) 
                FROM dailyFairScores 
                WHERE kategori = ? 
                AND platform = ? 
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
        )
        ORDER BY value DESC;
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
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
        console.error('Error fetching interactions:', error);
        res.status(500).send('Failed to fetch interactions');
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
                CONVERT_TZ(date, '+00:00', '+07:00') AS date
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
            responsiveness AS value, -- Langsung ambil nilai responsiveness dari tanggal terbaru
            platform,
            MAX(responsiveness) OVER () AS max_value -- Mengambil nilai responsiveness tertinggi dari tanggal terbaru
        FROM dailyFairScores
        WHERE kategori = ?
            AND platform = ?
            AND DATE(date) = (
                SELECT MAX(date) 
                FROM dailyFairScores 
                WHERE kategori = ? 
                AND platform = ? 
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
        )
        ORDER BY value DESC;
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
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
        console.error('Error fetching responsiveness:', error);
        res.status(500).send('Failed to fetch responsiveness');
    }
});

router.get('/getFairScores', async (req, res) => {
    try {
        const query = `
            SELECT
                client_account,
                username,
                fair_score AS value,
                CONVERT_TZ(date, '+00:00', '+07:00') AS date,
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
                fair_score,
                platform
            FROM dailyFairScores
            WHERE kategori = ?
                AND platform = ?
                AND date = (
                    SELECT MAX(date) 
                    FROM dailyFairScores 
                    WHERE kategori = ? 
                        AND platform = ? 
                        AND DATE(date) BETWEEN DATE(?) AND DATE(?)
                )
            ORDER BY fair_score DESC;
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
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
        const allowedOrderByFields = ["created_at", "likes", "comments", "playCount", "shareCount", "collectCount", "downloadCount", "performa_konten"];
        const orderBy = allowedOrderByFields.includes(req.query['orderBy']) ? req.query['orderBy'] : "created_at";
        const direction = req.query['direction'] === "asc" ? "ASC" : "DESC";

        const countQuery = `
            SELECT COUNT(*) AS total
            FROM posts
            WHERE kategori = ?
                AND platform = ?
                AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)
        `;

        const dataQuery = `
            SELECT *, 
                (CASE 
                    WHEN performa_konten <= ? THEN 'red'
                    WHEN performa_konten >= ? THEN 'green'
                    ELSE 'yellow'
                END) AS performa_color
            FROM posts
            WHERE kategori = ?
                AND platform = ?
                AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)
            ORDER BY ${orderBy} ${direction}
            LIMIT ?
            OFFSET ?
        `;

        const percentileQuery = `
            WITH ranked AS (
                SELECT 
                    performa_konten,
                    PERCENT_RANK() OVER (ORDER BY performa_konten) AS percentile
                FROM posts
                WHERE kategori = ?
                    AND platform = ?
                    AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)
            )
            SELECT 
                MAX(CASE WHEN percentile <= 0.1 THEN performa_konten END) AS percentile_10,
                MAX(CASE WHEN percentile >= 0.9 THEN performa_konten END) AS percentile_90
            FROM ranked;
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

        console.info("Received Request: ", {
            page: page,
            perPage: perPage,
            offset: offset,
            kategori: req.query['kategori'],
            platform: req.query['platform'],
            start_date: req.query['start_date'],
            end_date: req.query['end_date']
        });

        // Hitung total data
        const [countRows] = await db.query(countQuery, queryParams);
        const total = countRows[0].total;
        const totalPages = Math.ceil(total / perPage);
        const hasMore = offset + perPage < total;

        // Hitung persentil 10% dan 90%
        const [percentileRows] = await db.query(percentileQuery, queryParams);
        const percentile10 = percentileRows[0].percentile_10 || 0;
        const percentile90 = percentileRows[0].percentile_90 || 0;

        console.info("Executing Query:", dataQuery);
        console.info("Query Params:", [...queryParams, perPage, offset]);

        // Fetch data + Tambahkan indikator warna performa
        const [dataRows] = await db.query(dataQuery, [percentile10, percentile90, ...queryParams, perPage, offset]);

        res.json({
            code: 200,
            status: 'OK',
            data: dataRows,
            totalRows: total,
            totalPages: totalPages,
            hasMore: hasMore,
            percentile10: percentile10,
            percentile90: percentile90,
            errors: null
        });

    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ code: 500, status: 'ERROR', message: 'Failed to fetch posts' });
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

router.get('/getAllUsername', async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT username
            FROM users
            WHERE kategori = ?
                AND platform = ?
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform']
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
}
);

router.get('/getPictureData', async (req, res) => {
    try{
        const query = `
        SElECT *
        from users
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
    }
    catch (error) {
        console.error('Error fetching dates:', error);
        res.status(500).send('Failed to fetch dates');
    }
}
);


module.exports = router;