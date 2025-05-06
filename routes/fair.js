const express = require('express');
const router = express.Router();
const saveData = require('../controllers/saveData');
const fairScoreDaily = require('../controllers/fairScoreDaily');
const fairScoreMonthly = require('../controllers/fairScoreMonthly');
const fairScores = require('../controllers/fairScores');
const connection = require('../models/db');
const moment = require('moment');

const PLATFORMS = ['Instagram', 'TikTok'];

// Endpoint untuk memasukan data dari listAkun ke dalam tabel dailyFairScores
router.post('/addDataUser', async (req, res) => {
    const { kategori, platform } = req.body;
    try {
        console.info('Starting to add user data to dailyFairScores...');
        await saveData.saveDataUser(kategori, platform);
        res.json({ success: true, message: `Data user berdasarkan kategori ${kategori} dan platform ${platform} berhasil disimpan ke dailyFairScores.` });
    } catch (error) {
        console.error("Error saving user data to dailyFairScores:", error.message);
        res.status(500).json({ success: false, message: 'Gagal menyimpan data user ke dailyFairScores.', error: error.message });
    }
});

// Fungsi untuk mengambil kategori unik dari listAkun
const getCategoriesFromListAkun = async () => {
    const query = `SELECT DISTINCT kategori FROM listAkun`;
    const [rows] = await connection.query(query);
    return rows.map(row => row.kategori);
};

router.post('/processDataFair', async (req, res) => {
    try {
        let { start_date, end_date, kategori, platform } = req.body;

        const today = new Date().toISOString().split('T')[0];
        start_date = start_date || today;
        end_date = end_date || today;

        console.info(`Processing data from ${start_date} to ${end_date}...`);

        let categories = kategori ? [kategori] : await getCategoriesFromListAkun();
        console.info(`Processing categories: ${categories.join(', ')}`);

        let platforms = platform ? [platform] : PLATFORMS;
        console.info(`Processing platforms: ${platforms.join(', ')}`);

        const allResults = [];

        // Jalankan proses secara paralel per kombinasi kategori+platform
        const tasks = [];

        for (const cat of categories) {
            for (const plat of platforms) {
                tasks.push(
                    fairScores.processDataFair(start_date, end_date, cat, plat)
                        .then(data => {
                            allResults.push({
                                kategori: cat,
                                platform: plat,
                                data
                            });
                        })
                );
            }
        }

        await Promise.all(tasks);

        res.json({
            success: true,
            message: `Data berhasil diproses untuk kategori: ${categories.join(', ')}, platform: ${platforms.join(', ')}.`,
            result: allResults
        });

    } catch (error) {
        console.error('Error processing data:', error.message);
        res.status(500).json({
            success: false,
            message: 'Gagal memproses data FAIR Score.',
            error: error.message
        });
    }
});

// Endpoint untuk memasukkan data mentah, memproses, dan menyimpan ke tabel dailyFairScores
router.post('/processData', async (req, res) => {
    try {
        let { start_date, end_date, kategori, platform } = req.body;

        // Jika start_date atau end_date tidak diberikan, gunakan hari ini
        const today = new Date().toISOString().split('T')[0];
        start_date = start_date || today;
        end_date = end_date || today;

        console.info(`Processing data from ${start_date} to ${end_date}...`);

        // Jika kategori tidak diberikan, ambil dari listAkun
        const categories = kategori ? [kategori] : await getCategoriesFromListAkun();
        console.info(`Processing categories: ${categories.join(', ')}`);

        // Jika platform tidak diberikan, gunakan default ['Instagram', 'TikTok']
        const platforms = platform ? [platform] : PLATFORMS;
        console.info(`Processing platforms: ${platforms.join(', ')}`);

        // 1️⃣ Proses Monthly Data dulu
        const monthlyTasks = [];
        for (const cat of categories) {
            for (const plat of platforms) {
                monthlyTasks.push(fairScoreMonthly.processData(start_date, end_date, cat, plat));
            }
        }

        console.info(`[INFO] Starting Monthly FAIR Score for ${kategori} on ${platform}...`);
        await Promise.all(monthlyTasks);
        console.info(`[SUCCESS] Monthly FAIR Score for ${kategori} on ${platform} completed.`);

        // 2️⃣ Setelah Monthly selesai, lanjut ke Daily Data
        const dailyTasks = [];
        for (const cat of categories) {
            for (const plat of platforms) {
                dailyTasks.push(fairScoreDaily.processData(start_date, end_date, cat, plat));
            }
        }

        console.info(`[INFO] Starting Daily FAIR Score for ${kategori} on ${platform}...`);
        await Promise.all(dailyTasks);
        console.info(`[SUCCESS] Daily FAIR Score for ${kategori} on ${platform} completed.`);

        res.json({
            success: true,
            message: `Data berhasil diproses untuk kategori: ${categories.join(', ')}, platform: ${platforms.join(', ')}.`
        });
    } catch (error) {
        console.error('Error processing data:', error.message);
        res.status(500).json({
            success: false,
            message: 'Gagal menyimpan data user ke dailyFairScores.',
            error: error.message
        });
    }
});

// Fungsi untuk membagi array menjadi chunk
const chunkArray = (array, chunkSize) => {
    return Array.from({ length: Math.ceil(array.length / chunkSize) }, (_, i) =>
        array.slice(i * chunkSize, i * chunkSize + chunkSize)
    );
};

const getGrowthImpactRate = (posts) => {
    let totalImpact = 0;

    for (const post of posts) {
        const { likes = 0, comments = 0, playCount = 0 } = post;
        const engagement = (likes + comments) / (playCount || 1);
        const baseImpact = playCount / 10000;

        if (engagement > 0.5) totalImpact += baseImpact * 0.3;
        else if (engagement > 0.3) totalImpact += baseImpact * 0.1;
        else if (engagement > 0.1) totalImpact += baseImpact * 0.01;
        else totalImpact += baseImpact * 0.001;
    }

    return Math.min(Math.max(totalImpact, 0.00001), 0.01); // batasi
};

router.post("/update-followers", async (req, res) => {
    const { platform } = req.query;

    try {
        const [usersData] = await connection.query(
            `SELECT username, followers, following FROM users WHERE platform = ?`,
            [platform]
        );

        if (usersData.length === 0) {
            return res.status(404).json({ message: "Tidak ada pengguna ditemukan." });
        }

        const today = moment().startOf('day');
        const startDate = moment("2024-12-01");
        const daysRange = today.diff(startDate, 'days');

        // Buat map cache untuk currentFollowers/following per user
        const userState = {};
        usersData.forEach(user => {
            userState[user.username] = {
                followers: user.followers
            };
        });

        for (let i = 0; i <= daysRange; i++) {
            const date = moment(today).subtract(i, 'days').format("YYYY-MM-DD");

            const [postsData] = await connection.query(
                `SELECT username, likes, comments, playCount FROM posts WHERE platform = ? AND DATE(created_at) = ?`,
                [platform, date]
            );

            const postsByUser = {};
            for (const post of postsData) {
                if (!postsByUser[post.username]) postsByUser[post.username] = [];
                postsByUser[post.username].push(post);
            }

            let updateFollowersCase = 'followers = CASE';
            let usernames = [];
            let values = [];

            for (const [username, posts] of Object.entries(postsByUser)) {
                const growthRate = getGrowthImpactRate(posts);

                const curr = userState[username];
                if (!curr) continue;

                const newFollowers = Math.max(0, Math.floor(curr.followers * (1 - growthRate)));

                // Update state
                userState[username].followers = newFollowers;

                updateFollowersCase += ` WHEN username = ? AND platform = ? THEN ?`;

                values.push(username, platform, newFollowers);

                usernames.push(username);
            }

            updateFollowersCase += ' ELSE followers END';

            if (usernames.length > 0) {
                const updateQuery = `
                    UPDATE posts
                    SET ${updateFollowersCase}
                    WHERE platform = ? AND DATE(created_at) = ? AND username IN (?)
                `;

                await connection.query(updateQuery, [...values, platform, date, usernames]);
                console.info(`[OK] ${date} (${usernames.length} akun diproses)`);
            } else {
                console.info(`[SKIP] ${date} (tidak ada post)`);
            }
        }

        res.json({ message: "Selesai update followers berdasarkan performa postingan." });

    } catch (err) {
        console.error("Update gagal:", err);
        res.status(500).json({ message: "Gagal update data postingan.", error: err.message });
    }
});

module.exports = router;