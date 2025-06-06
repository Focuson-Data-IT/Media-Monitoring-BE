const express = require('express');
const router = express.Router();
const db = require('../models/db');
const cliProgress = require('cli-progress');
const { generateFairSummary } = require('../services/fairSummaryService');

router.post('/prosesPerformaKonten', async (req, res) => {
    try {
        console.info("🔄 Memulai proses update performa konten...");
        console.info("📅 Rentang tanggal:", req.body.startDate, "sampai", req.body.endDate);

        const { startDate, endDate } = req.body;

        // 1️⃣ Hitung total data yang akan diperbarui
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM posts
            WHERE DATE(created_at) BETWEEN ? AND ?
        `;
        const [countResult] = await db.query(countQuery, [startDate, endDate]);
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

        // 2️⃣ Ambil semua data yang akan diupdate
        const selectQuery = `
            SELECT 
                post_id,
                platform,
                kategori,
                media_name,
                likes,
                comments,
                playCount,
                shareCount,
                collectCount
            FROM posts
            WHERE DATE(created_at) BETWEEN ? AND ?
        `;
        const [posts] = await db.query(selectQuery, [startDate, endDate]);

        console.info(`📊 Menghitung performa untuk ${posts.length} postingan...`);

        // **Inisialisasi Progress Bar**
        const progressBar = new cliProgress.SingleBar({
            format: '📊 Progress [{bar}] {percentage}% | {value}/{total} posts processed',
        }, cliProgress.Presets.shades_classic);

        progressBar.start(totalRows, 0);

        // 3️⃣ Hitung performa konten untuk semua post
        let updateCases = [];
        let postIds = [];

        for (const post of posts) {
            const { post_id, platform, media_name, likes = 0, comments = 0, playCount = 0, shareCount = 0, collectCount = 0 } = post;
            let performa = 0;

            if (platform === 'Instagram') {
                if (['post', 'album'].includes(media_name)) {
                    performa = ((likes / 24) * 2) + ((comments / 24) * 1);
                } else if (media_name === 'reel') {
                    performa = ((playCount / 24) * 2.5) +
                        ((likes / 24) * 2) +
                        ((comments / 24) * 1.5) +
                        ((shareCount / 24) * 1);
                }
            } else if (platform === 'TikTok') {
                performa = ((playCount / 24) * 4) +
                    ((likes / 24) * 2.5) +
                    ((comments / 24) * 1.5) +
                    ((shareCount / 24) * 1.5) +
                    ((collectCount / 24) * 0.5);
            }

            // Simpan data untuk batch update
            updateCases.push(`WHEN post_id = ${post_id} THEN ${performa}`);
            postIds.push(post_id);

            // Update progress bar setiap iterasi
            progressBar.increment();
        }

        // 4️⃣ Buat batch update query
        if (updateCases.length > 0) {
            const updateQuery = `
                UPDATE posts 
                SET performa_konten = CASE 
                    ${updateCases.join(" ")}
                END
                WHERE post_id IN (${postIds.join(",")})
            `;

            console.info("⏳ Menjalankan batch update performa...");
            await db.query(updateQuery);
        }

        // **Hentikan Progress Bar setelah selesai**
        progressBar.stop();
        console.info(`✅ Semua data (${totalRows} postingan) berhasil diperbarui.`);

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

router.get('/getFollowers', async (req, res) => {
    try {
        const query = `
            SELECT
                username,
                client_account,
                followers AS value,
                platform,
                platform,
            MAX(followers) OVER () AS max_value
            FROM (
                SELECT
                username,
                client_account,
                followers,
                platform,
                platform,
                ROW_NUMBER() OVER (PARTITION BY username, client_account ORDER BY DATE(date) DESC) AS row_num
                FROM
                fairScoresDaily
                fairScoresDaily
                WHERE
                kategori = ?
                AND platform = ?
                kategori = ?
                AND platform = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
                ) AS ranked
            WHERE
                row_num = 1
            ORDER BY value DESC;
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
        console.error('Error fetching dates:', error);
        res.status(500).send('Failed to fetch dates');
    }
});

router.get('/getDailyActivities', async (req, res) => {
    try {
        console.info(req.query);
        console.info(req.query);
        const query = `
            SELECT
                username,
                client_account,
                nilai_aktifitas AS value,
                platform,
                CONVERT_TZ(date, '+00:00', '+07:00') AS date
            FROM fairScoresDaily
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
        FROM fairScoresDaily
        WHERE FIND_IN_SET(?, kategori)
            AND platform = ?
            AND DATE(date) = (
                SELECT MAX(date) 
                FROM fairScoresDaily 
                WHERE 
                kategori = ? 
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
            FROM fairScoresDaily
            WHERE
                kategori = ?
                AND platform = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
            ORDER BY
                date ASC
                date ASC
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
        console.error('Error fetching daily followers:', error);
        res.status(500).send('Failed to fetch daily followers');
        console.error('Error fetching daily followers:', error);
        res.status(500).send('Failed to fetch daily followers');
    }
});

router.get('/getInteractions', async (req, res) => {
    try {
        const query = `
        SELECT 
            fsd.username,
            fsd.client_account,
            fsd.interactions AS value,
            fsd.platform,
            MAX(fsd.interactions) OVER () AS max_value,
            u.profile_pic_url
        FROM fairScoresDaily fsd
        LEFT JOIN users u ON fsd.username = u.username
        WHERE 
            fsd.kategori = ?
            AND fsd.platform = ?
            AND DATE(fsd.date) = (
                SELECT MAX(date) 
                FROM fairScoresDaily 
                WHERE
                    kategori = ?
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
            FROM fairScoresDaily
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
        FROM fairScoresDaily
        WHERE FIND_IN_SET(?, kategori)
            AND platform = ?
            AND DATE(date) = (
                SELECT MAX(date) 
                FROM fairScoresDaily 
                WHERE 
                kategori = ?
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
                username,
                username AS akun,
                fair_score AS value,
                followers AS fairF,
                activities AS fairA,
                interactions AS fairI,
                responsiveness AS fairR,
                CONVERT_TZ(date, '+00:00', '+07:00') AS date,
                platform,
                RANK() OVER (PARTITION BY kategori, DATE(date) ORDER BY fair_score DESC) AS ranking
            FROM fairScoresDaily
            WHERE 
                kategori = ?
                AND platform = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
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
        const { kategori, platform, start_date, end_date } = req.query;

        // Query untuk mendapatkan tanggal terbaru (max_date) dan tanggal sebelumnya (prev_date)
        const [dateRows] = await db.query(`
        SELECT 
          MAX(date) AS max_date,
          DATE_SUB(MAX(date), INTERVAL 1 DAY) AS prev_date
        FROM fairScoresMonthly
        WHERE 
        kategori = ?
          AND platform = ?
          AND DATE(date) BETWEEN DATE(?) AND DATE(?);
      `, [kategori, platform, start_date, end_date]);

        const { max_date, prev_date } = dateRows[0];

        if (!max_date) {
            return res.status(404).json({ code: 404, status: 'Not Found', data: [], errors: 'No data found in the specified date range.' });
        }

        // Query untuk mendapatkan ranking di tanggal terbaru (max_date)
        const [latestRows] = await db.query(`
        SELECT 
          client_account,
          username,
          fair_score AS value,
          platform
        FROM fairScoresMonthly
        WHERE 
        kategori = ?
          AND platform = ? 
          AND DATE(date) = DATE(?)
        ORDER BY fair_score DESC;
      `, [kategori, platform, max_date]);

        // Query untuk mendapatkan ranking di tanggal sebelumnya (prev_date)
        const [prevRows] = await db.query(`
        SELECT 
          client_account,
          username,
          fair_score AS value,
          platform
        FROM fairScoresMonthly
        WHERE 
        kategori = ?
          AND platform = ? 
          AND DATE(date) = DATE(?)
        ORDER BY fair_score DESC;
      `, [kategori, platform, prev_date]);

        // Helper function untuk mendapatkan peringkat berdasarkan username
        const getRank = (username, rows) => {
            const rank = rows.findIndex(item => item.username === username);
            return rank !== -1 ? rank + 1 : null; // +1 karena array dimulai dari 0
        };

        // Gabungkan data: tambahkan ranking saat ini & ranking sebelumnya
        const mergedData = latestRows.map((item, index) => ({
            ...item,
            ranking: index + 1,
            previous_rank: getRank(item.username, prevRows)
        }));

        res.json({
            code: 200,
            status: 'OK',
            data: mergedData,
            errors: null
        });
    } catch (error) {
        console.error('Error fetching fair ranking:', error);
        res.status(500).send('Failed to fetch fair ranking');
    }
});

router.get('/getFollowersRanking', async (req, res) => {
    try {
        const { kategori, platform, start_date, end_date } = req.query; // tetap dipakai meskipun ga digunakan di query

        // Ambil semua user dengan kategori dan platform sesuai
        const [users] = await db.query(`
            SELECT 
                client_account,
                username,
                followers AS value,
                platform,
                profile_pic_url
            FROM users
            WHERE 
                FIND_IN_SET(?, kategori)
                AND platform = ?
            ORDER BY followers DESC;
        `, [kategori, platform]);

        // Kalau tidak ada data, return kosong
        if (!users.length) {
            return res.status(404).json({
                code: 404,
                status: 'Not Found',
                data: [],
                errors: 'No user data found for the specified category and platform.'
            });
        }

        // Helper untuk ranking sebelumnya (dummy logic: sama dengan sekarang karena tidak ada snapshot)
        const getRank = (username, rows) => {
            const rank = rows.findIndex(item => item.username === username);
            return rank !== -1 ? rank + 1 : null;
        };

        const mergedData = users.map((item, index) => ({
            ...item,
            ranking: index + 1,
            previous_rank: getRank(item.username, users),
            profile_pic_url: item.profile_pic_url || null
        }));

        res.json({
            code: 200,
            status: 'OK',
            data: mergedData,
            errors: null
        });

    } catch (error) {
        console.error('Error fetching followers ranking:', error);
        res.status(500).json({
            code: 500,
            status: 'ERROR',
            message: 'Failed to fetch followers ranking'
        });
    }
});

router.get('/getActivitiesRanking', async (req, res) => {
    try {
        const { kategori, platform, start_date, end_date } = req.query;

        // Query untuk mendapatkan tanggal terbaru (max_date) dan tanggal sebelumnya (prev_date)
        const [dateRows] = await db.query(`
        SELECT 
          MAX(date) AS max_date,
          DATE_SUB(MAX(date), INTERVAL 1 DAY) AS prev_date
        FROM fairScoresMonthly
        WHERE 
        kategori = ?
          AND platform = ?
          AND DATE(date) BETWEEN DATE(?) AND DATE(?);
      `, [kategori, platform, start_date, end_date]);

        const { max_date, prev_date } = dateRows[0];

        if (!max_date) {
            return res.status(404).json({ code: 404, status: 'Not Found', data: [], errors: 'No data found in the specified date range.' });
        }

        // Query untuk mendapatkan ranking di tanggal terbaru (max_date)
        const [latestRows] = await db.query(`
        SELECT 
          client_account,
          username,
          COALESCE(activities, 0) AS value,
          platform
        FROM fairScoresMonthly
        WHERE 
        kategori = ?
          AND platform = ? 
          AND DATE(date) = DATE(?)
        ORDER BY activities DESC;
      `, [kategori, platform, max_date]);

        console.info(max_date)

        // Query untuk mendapatkan ranking di tanggal sebelumnya (prev_date)
        const [prevRows] = await db.query(`
        SELECT 
          client_account,
          username,
          COALESCE(activities, 0) AS value,
          platform
        FROM fairScoresMonthly
        WHERE 
        kategori = ?
          AND platform = ? 
          AND DATE(date) = DATE(?)
        ORDER BY activities DESC;
      `, [kategori, platform, prev_date]);

        console.info(prev_date)

        // Helper function untuk mendapatkan peringkat berdasarkan username
        const getRank = (username, rows) => {
            const rank = rows.findIndex(item => item.username === username);
            return rank !== -1 ? rank + 1 : null; // +1 karena array dimulai dari 0
        };

        // Gabungkan data: tambahkan ranking saat ini & ranking sebelumnya
        const mergedData = latestRows.map((item, index) => ({
            ...item,
            ranking: index + 1,
            previous_rank: getRank(item.username, prevRows)
        }));

        res.json({
            code: 200,
            status: 'OK',
            data: mergedData,
            errors: null
        });
    } catch (error) {
        console.error('Error fetching fair ranking:', error);
        res.status(500).send('Failed to fetch fair ranking');
    }
});

router.get('/getInteractionsRanking', async (req, res) => {
    try {
        const { kategori, platform, start_date, end_date } = req.query;

        // 🔹 Query untuk mendapatkan tanggal terbaru (max_date) dan tanggal sebelumnya (prev_date)
        const [dateRows] = await db.query(`
            SELECT 
                MAX(date) AS max_date,
                DATE_SUB(MAX(date), INTERVAL 1 DAY) AS prev_date
            FROM fairScoresMonthly
            WHERE 
                kategori = ?
                AND platform = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
        `, [kategori, platform, start_date, end_date]);

        const { max_date, prev_date } = dateRows[0];

        if (!max_date) {
            return res.status(404).json({
                code: 404,
                status: 'Not Found',
                data: [],
                errors: 'No data found in the specified date range.'
            });
        }

        // 🔹 Query untuk mendapatkan ranking di tanggal terbaru (max_date)
        const [latestRows] = await db.query(`
            SELECT 
                client_account,
                username,
                COALESCE(interactions, 0) AS value,
                platform
            FROM fairScoresMonthly
            WHERE 
                kategori = ?
                AND platform = ? 
                AND DATE(date) = DATE(?)
            ORDER BY interactions DESC;
        `, [kategori, platform, max_date]);

        // Jika tidak ada data di tanggal terbaru, kirimkan respons kosong
        if (!latestRows.length) {
            return res.json({
                code: 200,
                status: 'OK',
                data: [],
                errors: null
            });
        }

        // 🔹 Query untuk mendapatkan ranking di tanggal sebelumnya (prev_date)
        const [prevRows] = await db.query(`
            SELECT 
                client_account,
                username,
                COALESCE(interactions, 0) AS value,
                platform
            FROM fairScoresMonthly
            WHERE 
                kategori = ?
                AND platform = ? 
                AND DATE(date) = DATE(?)
            ORDER BY interactions DESC;
        `, [kategori, platform, prev_date]);

        // 🔹 Ambil daftar username untuk ambil profile_pic_url
        const usernames = latestRows.map(row => row.username);

        // 🔹 Ambil profile picture dari tabel users
        let profileMap = {};
        if (usernames.length) {
            const [profiles] = await db.query(`
                SELECT username, profile_pic_url
                FROM users
                WHERE username IN (?)
            `, [usernames]);

            profileMap = profiles.reduce((map, user) => {
                map[user.username] = user.profile_pic_url;
                return map;
            }, {});
        }

        // 🔹 Helper function untuk mendapatkan peringkat sebelumnya
        const getRank = (username, rows) => {
            const rank = rows.findIndex(item => item.username === username);
            return rank !== -1 ? rank + 1 : null;
        };

        // 🔹 Gabungkan data
        const mergedData = latestRows.map((item, index) => ({
            ...item,
            ranking: index + 1,
            previous_rank: getRank(item.username, prevRows),
            profile_pic_url: profileMap[item.username] || null
        }));

        res.json({
            code: 200,
            status: 'OK',
            data: mergedData,
            errors: null
        });

    } catch (error) {
        console.error('Error fetching interactions ranking:', error);
        res.status(500).json({ code: 500, status: 'ERROR', message: 'Failed to fetch interactions ranking' });
    }
});

router.get('/getResponsivenessRanking', async (req, res) => {
    try {
        const { kategori, platform, start_date, end_date } = req.query;

        // Query untuk mendapatkan tanggal terbaru (max_date) dan tanggal sebelumnya (prev_date)
        const [dateRows] = await db.query(`
        SELECT 
          MAX(date) AS max_date,
          DATE_SUB(MAX(date), INTERVAL 1 DAY) AS prev_date
        FROM fairScoresMonthly
        WHERE 
            kategori = ?
            AND platform = ?
            AND DATE(date) BETWEEN DATE(?) AND DATE(?)
      `, [kategori, platform, start_date, end_date]);

        const { max_date, prev_date } = dateRows[0];

        if (!max_date) {
            return res.status(404).json({ code: 404, status: 'Not Found', data: [], errors: 'No data found in the specified date range.' });
        }

        // Query untuk mendapatkan ranking di tanggal terbaru (max_date)
        const [latestRows] = await db.query(`
        SELECT 
          client_account,
          username,
          COALESCE(responsiveness, 0) AS value,
          platform
        FROM fairScoresMonthly
        WHERE 
        kategori = ?
          AND platform = ? 
          AND DATE(date) = DATE(?)
        ORDER BY responsiveness DESC;
      `, [kategori, platform, max_date]);

        // Jika tidak ada data di tanggal terbaru, kirimkan respons kosong
        if (!latestRows.length) {
            return res.json({
                code: 200,
                status: 'OK',
                data: [],
                errors: null
            });
        }

        // Query untuk mendapatkan ranking di tanggal sebelumnya (prev_date)
        const [prevRows] = await db.query(`
        SELECT 
          client_account,
          username,
          COALESCE(responsiveness, 0) AS value,
          platform
        FROM fairScoresMonthly
        WHERE 
        kategori = ?
          AND platform = ? 
          AND DATE(date) = DATE(?)
        ORDER BY responsiveness DESC;
      `, [kategori, platform, prev_date]);

        // 🔹 Ambil daftar username untuk ambil profile_pic_url
        const usernames = latestRows.map(row => row.username);

        // 🔹 Ambil profile picture dari tabel users
        let profileMap = {};
        if (usernames.length) {
            const [profiles] = await db.query(`
              SELECT username, profile_pic_url
              FROM users
              WHERE username IN (?)
          `, [usernames]);

            profileMap = profiles.reduce((map, user) => {
                map[user.username] = user.profile_pic_url;
                return map;
            }, {});
        }

        // Helper function untuk mendapatkan peringkat berdasarkan username
        const getRank = (username, rows) => {
            const rank = rows.findIndex(item => item.username === username);
            return rank !== -1 ? rank + 1 : null; // +1 karena array dimulai dari 0
        };

        // Gabungkan data: tambahkan ranking saat ini & ranking sebelumnya
        const mergedData = latestRows.map((item, index) => ({
            ...item,
            ranking: index + 1,
            previous_rank: getRank(item.username, prevRows),
            profile_pic_url: profileMap[item.username] || null
        }));

        res.json({
            code: 200,
            status: 'OK',
            data: mergedData,
            errors: null
        });
    } catch (error) {
        console.error('Error fetching fair ranking:', error);
        res.status(500).send('Failed to fetch fair ranking');
    }
});

// Endpoint untuk mengambil data dari tabel fairScoresMonthly
router.get('/getAllData', async (req, res) => {
    try {
        const query = `
            SELECT *
            FROM fairScoresMonthly
            WHERE
                kategori = ?
                AND DATE(date) BETWEEN DATE(?) AND DATE(?)
            ORDER BY DATE(date) DESC
        `;

        const queryParams = [
            req.query['kategori'],
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
        const allowedOrderByFields = [
            "created_at", "likes", "comments", "playCount",
            "shareCount", "collectCount", "downloadCount", "performa_konten"
        ];
        const orderBy = allowedOrderByFields.includes(req.query['orderBy']) ? req.query['orderBy'] : "performa_konten";
        const direction = req.query['direction'] === "asc" ? "ASC" : "DESC";

        const perPage = parseInt(req.query['perPage']) || 15;
        const page = parseInt(req.query['page']) || 1;
        const offset = (page - 1) * perPage;

        const { kategori, platform, start_date, end_date, username, media_name } = req.query;

        const queryParams = [kategori, platform, start_date, end_date, username, media_name];

        console.info("Received Request: ", { page, perPage, offset, kategori, platform, start_date, end_date, media_name });

        // 1️⃣ Hitung total data
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM posts
            WHERE 
            kategori = ?
              AND platform = ?
              AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)
              AND username LIKE CONCAT('%', ?, '%')
              AND (media_name = ? OR ? IS NULL) -- Filter media_name jika tersedia
        `;
        const [countRows] = await db.query(countQuery, [kategori, platform, start_date, end_date, username, media_name, media_name]);
        const total = countRows[0].total;
        const totalPages = Math.ceil(total / perPage);
        const hasMore = offset + perPage < total;

        if (total === 0) {
            return res.json({
                code: 200,
                status: 'OK',
                percentile_10: 0,
                percentile_90: 0,
                totalRows: 0,
                totalPages: 0,
                hasMore: false,
                data: [],
                errors: null
            });
        }

        // 2️⃣ Hitung persentil 10% & 90% dengan grup yang diminta
        const percentileQuery = `
            WITH ordered AS (
                SELECT 
                    performa_konten,
                    ROW_NUMBER() OVER (
                        PARTITION BY 
                            platform,
                            kategori,
                            CASE 
                                WHEN platform = 'Instagram' THEN 
                                    CASE 
                                        WHEN media_name IN ('post') THEN 'Single Post'
                                        WHEN media_name IN ('album') THEN 'Carousel'
                                        WHEN media_name = 'reel' THEN 'Reel'
                                        ELSE 'other'
                                    END
                                ELSE 'TikTok'
                            END
                        ORDER BY performa_konten
                    ) AS row_num,
                    COUNT(*) OVER (
                        PARTITION BY 
                            platform,
                            kategori,
                            CASE 
                                WHEN platform = 'Instagram' THEN 
                                    CASE 
                                        WHEN media_name IN ('post') THEN 'Single Post'
                                        WHEN media_name IN ('album') THEN 'Carousel'
                                        WHEN media_name = 'reel' THEN 'Reel'
                                        ELSE 'other'
                                    END
                                ELSE 'TikTok'
                            END
                    ) AS total_rows
                FROM posts
                WHERE FIND_IN_SET(?, kategori)
                  AND platform = ?
                  AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)
                  AND username LIKE CONCAT('%', ?, '%')
                  AND (media_name = ? OR ? IS NULL)
            ),
            positions AS (
                SELECT
                    ((0.1 * (total_rows + 1))) AS pos_10,
                    ((0.9 * (total_rows + 1))) AS pos_90
                FROM ordered
                LIMIT 1
            ),
            percentile_10_calc AS (
                SELECT performa_konten AS percentile_10
                FROM ordered, positions
                WHERE row_num = FLOOR(pos_10)
                ORDER BY row_num
                LIMIT 1
            ),
            percentile_90_calc AS (
                SELECT performa_konten AS percentile_90
                FROM ordered, positions
                WHERE row_num = FLOOR(pos_90)
                ORDER BY row_num
                LIMIT 1
            )
            SELECT 
                p10.percentile_10,
                p90.percentile_90
            FROM percentile_10_calc p10
            CROSS JOIN percentile_90_calc p90;
        `;

        const [percentileRows] = await db.query(percentileQuery, [kategori, platform, start_date, end_date, username, media_name, media_name]);
        const percentile10 = percentileRows[0]?.percentile_10 || 0;
        const percentile90 = percentileRows[0]?.percentile_90 || 0;

        console.info(`Calculated Percentiles (Grouped): 10% = ${percentile10}, 90% = ${percentile90}`);

        // 3️⃣ Ambil data dengan filtering media_name
        const dataQuery = `
            WITH all_data AS (
                SELECT 
                    *,
                    (CASE 
                        WHEN platform = 'TikTok' AND (media_name IS NULL OR media_name = '') THEN 'Video'
                        WHEN media_name = 'reel' THEN 'Reel'
                        WHEN media_name IN ('post') THEN 'Single Post'
                        WHEN media_name IN ('album') THEN 'Carousel'
                        ELSE media_name
                    END) AS formatted_media_name,
                    (CASE 
                        WHEN performa_konten <= ? THEN 'red'
                        WHEN performa_konten >= ? THEN 'green'
                        ELSE 'yellow'
                    END) AS performa_color
                FROM posts
                WHERE FIND_IN_SET(?, kategori)
                    AND platform = ?
                    AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)
                    AND username LIKE CONCAT('%', ?, '%')
                    AND (media_name = ? OR ? IS NULL) -- Filter media_name jika tersedia
            )
            SELECT all_data.*, formatted_media_name AS media_name
            FROM all_data
            ORDER BY ${orderBy} ${direction}
            LIMIT ?
            OFFSET ?;
        `;

        console.info([percentile10, percentile90, kategori, platform, username, media_name, perPage, offset]);
        const [dataRows] = await db.query(dataQuery, [percentile10, percentile90, kategori, platform, start_date, end_date, username, media_name, media_name, perPage, offset]);

        // 4️⃣ Kirim respons ke frontend
        res.json({
            code: 200,
            status: 'OK',
            percentile_10: percentile10,
            percentile_90: percentile90,
            totalRows: total,
            totalPages,
            hasMore,
            data: dataRows,
            errors: null
        });

    } catch (error) {
        console.error('Error fetching posts:', error);
        res.status(500).json({ code: 500, status: 'ERROR', message: 'Failed to fetch posts' });
    }
});

router.get('/getPost', async (req, res) => {
    try {
        const query = `
            SELECT 
            CONVERT_TZ(created_at, '+00:00', '+07:00') AS created_at,
            followers as Followers,
            comments as Comments,
            likes as Likes,
            playCount as Views,
            shareCount as Shares,
            downloadCount as Downloads,
            collectCount as Saves,
            media_name
            FROM posts
            WHERE
                FIND_IN_SET(?, kategori)
                AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)
                AND username = ?
                AND platform = ?
                ORDER BY created_at ASC
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['start_date'],
            req.query['end_date'],
            req.query['username'],
            req.query['platform'],
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
})

router.get('/getAllUsers', async (req, res) => {
    try {
        const query = `
            SELECT *
            FROM users
            WHERE
                FIND_IN_SET(?, kategori)
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
            WHERE FIND_IN_SET(?, kategori)
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

router.get('/getAllSearchUsername', async (req, res) => {
    try {
        const query = `
            SELECT DISTINCT username
            FROM users
            WHERE FIND_IN_SET(?, kategori)
                AND platform = ?
            AND username LIKE CONCAT('%', ?, '%')
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
            req.query['search'],
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

router.get('/getTotalPost', async (req, res) => {
    try {
        const query = `
            SELECT username, 
            COUNT(post_id) AS totalPosts
            FROM posts
            WHERE FIND_IN_SET(?, kategori)
                AND platform = ?
                AND created_at BETWEEN ? AND ?
                AND (media_name = ? OR ? IS NULL) -- Filter media_name jika tersedia
                AND username LIKE CONCAT('%', ?, '%')
            GROUP BY username
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
            req.query['start_date'], // Rentang awal
            req.query['end_date'],   // Rentang akhir
            req.query['media_name'],
            req.query['media_name'],
            req.query['search']
        ];

        console.info(queryParams)

        const [rows] = await db.query(query, queryParams);

        res.json({
            code: 200,
            status: 'OK',
            data: rows,
            errors: null
        });
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).send('Failed to fetch data');
    }
});

router.get('/getPictureData', async (req, res) => {
    try {
        const query = `
        SElECT *
        from users
        WHERE
        FIND_IN_SET(?, kategori)
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

// Daily Data Api || Growth Metrics

router.get('/getDailyFollowers', async (req, res) => {
    try {
        const query = `
        SELECT
            username,
            client_account,
            followers AS value,
            platform,
            date
        FROM fairScoresDaily
        WHERE
            FIND_IN_SET(?, kategori)
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

router.get('/getDailyLikes', async (req, res) => {
    try {
        const query = `
        SELECT
            p.username,
            p.client_account,
            SUM(p.likes) AS value, -- Total likes per hari
            p.platform,
            created_at AS date
        FROM posts p
        WHERE
            FIND_IN_SET(?, p.kategori)
            AND p.platform = ?
            AND DATE(p.created_at) BETWEEN DATE(?) AND DATE(?)
        GROUP BY p.username, p.client_account, p.platform, date
        ORDER BY date ASC;
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
            req.query['start_date'],
            req.query['end_date'],
        ];

        const [rows] = await db.query(query, queryParams);

        res.json({
            code: 200,
            status: 'OK',
            data: rows,
            errors: null,
        });
    } catch (error) {
        console.error('Error fetching daily likes:', error);
        res.status(500).send('Failed to fetch daily likes');
    }
});


router.get('/getDailyViews', async (req, res) => {
    try {
        const query = `
        SELECT
            p.username,
            p.client_account,
            SUM(p.playCount) AS value, -- Total likes per hari
            p.platform,
            created_at AS date
        FROM posts p
        WHERE
            FIND_IN_SET(?, p.kategori)
            AND p.platform = ?
            AND DATE(p.created_at) BETWEEN DATE(?) AND DATE(?)
        GROUP BY p.username, p.client_account, p.platform, date
        ORDER BY date ASC;
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
            req.query['start_date'],
            req.query['end_date'],
        ];

        const [rows] = await db.query(query, queryParams);

        res.json({
            code: 200,
            status: 'OK',
            data: rows,
            errors: null,
        });
    } catch (error) {
        console.error('Error fetching daily likes:', error);
        res.status(500).send('Failed to fetch daily likes');
    }
});

router.get('/getDailyComments', async (req, res) => {
    try {
        const query = `
        SELECT
            p.username,
            p.client_account,
            SUM(p.comments) AS value, -- Total likes per hari
            p.platform,
            created_at AS date
        FROM posts p
        WHERE
            FIND_IN_SET(?, p.kategori)
            AND p.platform = ?
            AND DATE(p.created_at) BETWEEN DATE(?) AND DATE(?)
        GROUP BY p.username, p.client_account, p.platform, date
        ORDER BY date ASC;
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
            req.query['start_date'],
            req.query['end_date'],
        ];

        const [rows] = await db.query(query, queryParams);

        res.json({
            code: 200,
            status: 'OK',
            data: rows,
            errors: null,
        });
    } catch (error) {
        console.error('Error fetching daily likes:', error);
        res.status(500).send('Failed to fetch daily likes');
    }
});

router.get('/getDailySaves', async (req, res) => {
    try {
        const query = `
        SELECT
            p.username,
            p.client_account,
            SUM(p.collectCount) AS value, -- Total likes per hari
            p.platform,
            created_at AS date
        FROM posts p
        WHERE
            FIND_IN_SET(?, p.kategori)
            AND p.platform = ?
            AND DATE(p.created_at) BETWEEN DATE(?) AND DATE(?)
        GROUP BY p.username, p.client_account, p.platform, date
        ORDER BY date ASC;
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
            req.query['start_date'],
            req.query['end_date'],
        ];

        const [rows] = await db.query(query, queryParams);

        res.json({
            code: 200,
            status: 'OK',
            data: rows,
            errors: null,
        });
    } catch (error) {
        console.error('Error fetching daily likes:', error);
        res.status(500).send('Failed to fetch daily likes');
    }
});

router.get('/getDailyShares', async (req, res) => {
    try {
        const query = `
        SELECT
            p.username,
            p.client_account,
            SUM(p.shareCount) AS value, -- Total likes per hari
            p.platform,
            created_at AS date
        FROM posts p
        WHERE
            FIND_IN_SET(?, p.kategori)
            AND p.platform = ?
            AND DATE(p.created_at) BETWEEN DATE(?) AND DATE(?)
        GROUP BY p.username, p.client_account, p.platform, date
        ORDER BY date ASC;
        `;

        const queryParams = [
            req.query['kategori'],
            req.query['platform'],
            req.query['start_date'],
            req.query['end_date'],
        ];

        const [rows] = await db.query(query, queryParams);

        res.json({
            code: 200,
            status: 'OK',
            data: rows,
            errors: null,
        });
    } catch (error) {
        console.error('Error fetching daily likes:', error);
        res.status(500).send('Failed to fetch daily likes');
    }
});

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

// 🔔 Fungsi untuk mengonversi tanggal ke zona waktu Jakarta (UTC+7)
const toJakartaDateString = (date) => {
    const jakartaOffset = 7 * 60; // 7 jam dalam menit
    const localDate = new Date(date.getTime() + jakartaOffset * 60 * 1000);
    return localDate.toISOString().split('T')[0]; // Format YYYY-MM-DD
};

router.get('/getFairDataInsights', async (req, res) => {
    try {
        const { kategori, platform, username, month } = req.query;

        if (!username || !month) {
            return res.status(400).json({ code: 400, status: 'ERROR', message: 'Parameter username dan month wajib diisi.' });
        }

        const today = new Date(); // Tanggal saat ini (UTC)
        const selectedMonth = new Date(`${month}-01`); // Awal bulan yang dipilih

        let endDate;
        if (today.getFullYear() === selectedMonth.getFullYear() && today.getMonth() === selectedMonth.getMonth()) {
            endDate = toJakartaDateString(today); // Jika bulan ini, gunakan tanggal hari ini dengan offset Jakarta
        } else {
            const lastDayOfMonth = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0);
            endDate = toJakartaDateString(lastDayOfMonth); // Akhir bulan dengan offset Jakarta
        }

        const startDate = `${month}-01`; // Awal bulan

        console.info('Start Date:', startDate);
        console.info('End Date:', endDate);

        // 🔍 Cari MAX(date) dengan konversi ke UTC+7
        const [maxDateResult] = await db.query(
            `SELECT MAX((CONVERT_TZ(date, '+00:00', '+07:00'))) AS maxDate
             FROM fairScoresMonthly 
             WHERE kategori = ?
             AND LOWER(platform) = LOWER(?) 
             AND DATE(CONVERT_TZ(date, '+00:00', '+07:00')) BETWEEN DATE(?) AND DATE(?)`,
            [kategori, platform, startDate, endDate]
        );

        const maxDate = maxDateResult[0]?.maxDate;
        console.info('Max Date from DB:', maxDate);

        if (!maxDate) {
            return res.json({ code: 200, status: 'OK', data: [], errors: 'No data found' });
        }

        // 🔍 Ambil semua data untuk tanggal MAX dengan konversi timezone
        const [allRows] = await db.query(
            `SELECT *, CONVERT_TZ(date, '+00:00', '+07:00') AS local_date
             FROM fairScoresMonthly
             WHERE kategori = ?
             AND LOWER(platform) = LOWER(?) AND CONVERT_TZ(date, '+00:00', '+07:00') = ?`,
            [kategori, platform, maxDate]
        );

        if (!allRows.length) {
            return res.json({ code: 200, status: 'OK', data: [], errors: 'No data found' });
        }

        // 🔹 Urutkan berdasarkan fair_score (DESC) dan beri ranking
        const sortedRows = allRows.sort((a, b) => b.fair_score - a.fair_score);
        const rankedData = sortedRows.map((row, index) => ({
            rank: index + 1,
            platform: row.platform,
            username: row.username,
            date: row.local_date, // Sudah sesuai waktu Jakarta
            followers: row.followers,
            activities: row.activities,
            interactions: row.interactions,
            responsiveness: row.responsiveness,
            fair_score: row.fair_score
        }));

        const top3 = rankedData.slice(0, 3); // Ambil top 3 akun
        const requestedUser = rankedData.find(row => row.username === username); // Akun yang diminta
        const responseData = top3.some(user => user.username === username) ? top3 : [...top3, requestedUser];

        res.json({ code: 200, status: 'OK', data: responseData, errors: null });

    } catch (error) {
        console.error('Error fetching fair data insights:', error);
        res.status(500).send('Failed to fetch fair data insights.');
    }
});

router.get('/getGrowthData', async (req, res) => {
    const { username, platform, start_date, end_date } = req.query;

    if (!username || !platform || !start_date || !end_date) {
        return res.status(400).json({
            message: 'username, platform, start_date, and end_date are required.'
        });
    }

    try {
        const connection = await db.getConnection();

        // Followers (from fairScoresDaily)
        const [followersResult] = await connection.query(
            `
            SELECT CONVERT_TZ(date, '+00:00', '+07:00') AS date, followers
            FROM fairScoresMonthly
            WHERE username = ? AND platform = ? AND DATE(date) BETWEEN DATE(?) AND DATE(?)
            ORDER BY date ASC;
            `,
            [username, platform, start_date, end_date]
        );

        // Posts (from fairScoresDaily)
        const [postsResult] = await connection.query(
            `
            SELECT CONVERT_TZ(date, '+00:00', '+07:00') AS date, activities AS posts
            FROM fairScoresDaily
            WHERE username = ? AND platform = ? AND DATE(date) BETWEEN DATE(?) AND DATE(?)
            ORDER BY date ASC;
            `,
            [username, platform, start_date, end_date]
        );

        // Engagement (from posts)
        const [engagementResult] = await connection.query(
            `
            SELECT 
                DATE(created_at) AS date,
                SUM(likes) AS likes,
                SUM(playCount) AS views,
                SUM(comments) AS comments,
                SUM(collectCount) AS saves,
                SUM(shareCount) AS shares
            FROM posts
            WHERE username = ? AND platform = ? AND created_at BETWEEN ? AND ?
            GROUP BY DATE(created_at)
            ORDER BY DATE(created_at) ASC;
            `,
            [username, platform, start_date, end_date]
        );

        connection.release();

        // Gabung hasil
        const dataMap = {};
        const mergeData = (result, keys) => {
            result.forEach(item => {
                const date = item.date;
                if (!dataMap[date]) {
                    dataMap[date] = { date, followers: 0, posts: 0, likes: 0, views: 0, comments: 0, saves: 0, shares: 0 };
                }
                if (Array.isArray(keys)) {
                    keys.forEach(k => {
                        dataMap[date][k] = item[k] ?? 0;
                    });
                } else {
                    dataMap[date][keys] = item[keys] ?? 0;
                }
            });
        };

        mergeData(followersResult, 'followers');
        mergeData(postsResult, 'posts');
        mergeData(engagementResult, ['likes', 'views', 'comments', 'saves', 'shares']);

        const combinedData = Object.values(dataMap).sort((a, b) => new Date(a.date) - new Date(b.date));

        res.status(200).json({
            username,
            platform,
            start_date,
            end_date,
            data: combinedData
        });

    } catch (error) {
        console.error('Error fetching growth data:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

module.exports = router;