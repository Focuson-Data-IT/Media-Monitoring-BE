const express = require('express');
const router = express.Router();
const saveData = require('../controllers/saveData');
const fairScoreDaily = require('../controllers/fairScoreDaily');
const fairScoreMonthly = require('../controllers/fairScoreMonthly');
const connection = require('../models/db');
const moment = require('moment');

const PLATFORMS = ['Instagram', 'TikTok'];

// Endpoint untuk memasukan data dari listAkun ke dalam tabel dailyFairScores
router.post('/addDataUser', async (req, res) => {
    try {
        console.info('Starting to add user data to dailyFairScores...');
        await saveData.saveDataUser();
        res.json({ success: true, message: 'Data user berhasil disimpan ke dailyFairScores.' });
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
        let categories = kategori ? [kategori] : await getCategoriesFromListAkun();
        console.info(`Processing categories: ${categories.join(', ')}`);

        // Jika platform tidak diberikan, gunakan default ['Instagram', 'TikTok']
        let platforms = platform ? [platform] : PLATFORMS;
        console.info(`Processing platforms: ${platforms.join(', ')}`);

        // Jalankan semua kombinasi kategori & platform secara paralel
        const tasks = [];
        for (const cat of categories) {
            for (const plat of platforms) {
                tasks.push(fairScoreDaily.processData(start_date, end_date, cat, plat));
                tasks.push(fairScoreMonthly.processData(start_date, end_date, cat, plat));
            }
        }

        await Promise.all(tasks);

        res.json({ success: true, message: `Data berhasil diproses untuk kategori: ${categories.join(', ')}, platform: ${platforms.join(', ')}.` });
    } catch (error) {
        console.error('Error processing data:', error.message);
        res.status(500).json({ success: false, message: 'Gagal menyimpan data user ke dailyFairScores.', error: error.message });
    }
});

// Fungsi untuk membagi array menjadi chunk
const chunkArray = (array, chunkSize) => {
    return Array.from({ length: Math.ceil(array.length / chunkSize) }, (_, i) =>
        array.slice(i * chunkSize, i * chunkSize + chunkSize)
    );
};

router.post("/update-followers", async (req, res) => {
    try {
        // 1️⃣ Ambil data username dan followers dari tabel users (hanya yang followers > 3000)
        const [usersData] = await connection.query(
            `SELECT username, followers FROM users WHERE followers > 3000 and platform = 'TikTok'`
        );

        if (usersData.length === 0) {
            return res.status(400).json({ message: "Tidak ada pengguna dengan followers > 3000." });
        }

        console.info(`[INFO] Ditemukan ${usersData.length} pengguna untuk diproses.`);

        // 2️⃣ Tentukan rentang tanggal dari hari ini ke 1 Februari
        const today = moment().format("YYYY-MM-DD");
        const startDate = "2025-03-01";
        const dates = [];

        let tempDate = moment(today);
        while (tempDate.isSameOrAfter(startDate)) {
            dates.push(tempDate.format("YYYY-MM-DD"));
            tempDate.subtract(1, "days");
        }

        console.info(`[INFO] Proses update dari ${today} ke ${startDate} (${dates.length} hari)`);

        // Fungsi untuk menghasilkan angka acak dalam rentang tertentu
        const getRandomInRange = (min, max) => Math.random() * (max - min) + min;

        // Fungsi untuk menghasilkan noise yang tidak berpola
        const getRandomDecreaseRate = (dayIndex) => {
            let baseRate = getRandomInRange(0.00005, 0.0005); // 0.05% - 0.3%
            let noise = Math.sin(dayIndex * 0.003) * getRandomInRange(0.00005, 0.0005);
            let isIncrease = Math.random() < 0.05; // 5% chance naik
            let finalRate = isIncrease ? -baseRate : baseRate + noise;
            return Math.min(Math.max(finalRate, -0.01), 0.0005);
        };

        // 3️⃣ Gunakan batch `UPDATE` untuk mempercepat proses update followers
        const userChunks = chunkArray(usersData, 50);
        for (const chunk of userChunks) {
            console.info(`[INFO] Memproses batch ${chunk.length} username...`);

            for (const user of chunk) {
                const { username, followers } = user;
                let currentFollowers = followers;

                // Buat batch query untuk update followers
                let updateQuery = `UPDATE posts SET followers = CASE`;
                let updateConditions = [];
                let updateValues = [];

                for (let i = 0; i < dates.length; i++) {
                    const date = dates[i];
                    const decreaseRate = getRandomDecreaseRate(i);
                    const newFollowers = Math.floor(currentFollowers * (1 - decreaseRate));

                    updateQuery += ` WHEN username = ? AND created_at = ? THEN ?`;
                    updateValues.push(username, date, newFollowers);

                    currentFollowers = newFollowers;
                }

                updateQuery += ` ELSE followers END WHERE username IN (?) AND created_at BETWEEN ? AND ?`;
                updateValues.push(chunk.map(u => u.username), startDate, today);

                await connection.query(updateQuery, updateValues);
                console.info(`[BATCH UPDATED] ${username} selesai diproses`);
            }
        }

        console.info(`[SUCCESS] Update followers selesai.`);
        res.json({ message: "Update followers selesai untuk semua pengguna." });

    } catch (error) {
        console.error("[ERROR] Gagal mengupdate followers:", error);
        res.status(500).json({ message: "Terjadi kesalahan saat update followers.", error: error.message });
    }
});

module.exports = router;