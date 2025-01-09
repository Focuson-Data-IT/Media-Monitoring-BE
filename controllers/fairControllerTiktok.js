const db = require('../models/db'); // Database connection
require('dotenv').config(); // Load environment variables from .env file

// Fungsi untuk mengambil data followers dari database
async function fetchFollowersData() {
    const [rows] = await db.query(`
        SELECT 
            la.list_id,
            la.platform,
            la.kategori, 
            u.username, 
            u.followers
        FROM listAkun la
        JOIN users u ON la.username = u.username
    `);
    return rows;
}

// Fungsi untuk mendapatkan data followers dan mengirimkan respons HTTP
async function getFollowersTiktok(req, res) {
    try {
        const rows = await fetchFollowersData();
        res.json(rows);
    } catch (error) {
        console.error("Error fetching followers data:", error);
        res.status(500).send("Failed to fetch followers data");
    }
}

// Fungsi untuk mengambil data activities dari database
async function fetchActivitiesData(start_date, end_date) {
    const [rows] = await db.query(`
        SELECT 
            la.list_id,
            la.platform,
            la.kategori, 
            u.username, 
            (COUNT(p.post_id) / DATEDIFF(?, ?)) AS activities
        FROM listAkun la
        JOIN users u ON la.username = u.username
        LEFT JOIN posts p ON p.username = u.username AND p.created_at BETWEEN ? AND ?
        GROUP BY u.username
    `, [end_date, start_date, start_date, end_date]);
    return rows;
}

// Fungsi untuk mendapatkan data activities dan mengirimkan respons HTTP
async function getActivitiesTiktok(req, res) {
    try {
        const response = await fetch(`http://localhost:${process.env.PORT}/api/getDates`);
        const data = await response.json();
        const start_date = new Date(data.startDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
        const end_date = new Date(data.endDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

        const rows = await fetchActivitiesData(start_date, end_date);
        res.json(rows);
    } catch (error) {
        console.error("Error fetching activities data:", error);
        res.status(500).send("Failed to fetch activities data");
    }
}

// Fungsi untuk mengambil data interaction dari database
async function fetchInteractionData(start_date, end_date) {
    const [rows] = await db.query(`
        SELECT 
            la.list_id,
            la.platform,
            la.kategori, 
            u.username, 
            AVG(p.likes) AS interaction
        FROM listAkun la
        JOIN users u ON la.username = u.username
        LEFT JOIN posts p ON p.username = u.username
        WHERE p.created_at BETWEEN ? AND ?
        GROUP BY u.username
    `, [start_date, end_date]);
    return rows;
}

// Fungsi untuk mendapatkan data interaction dan mengirimkan respons HTTP
async function getInteractionTiktok(req, res) {
    try {
        const response = await fetch(`http://localhost:${process.env.PORT}/api/getDates`);
        const data = await response.json();
        const start_date = new Date(data.startDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
        const end_date = new Date(data.endDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

        const rows = await fetchInteractionData(start_date, end_date);
        res.json(rows);
    } catch (error) {
        console.error("Error fetching interaction data:", error);
        res.status(500).send("Failed to fetch interaction data");
    }
}

// Fungsi untuk mengambil data responsiveness dari database
async function fetchResponsivenessData(start_date, end_date) {
    const [rows] = await db.query(`
        SELECT 
            la.list_id,
            la.platform,
            la.kategori,
            u.username,
            COALESCE(SUM(
                (SELECT COUNT(*) FROM mainComments mc WHERE mc.unique_id_post = p.unique_id_post) +
                (SELECT COUNT(*) FROM childComments cc WHERE cc.unique_id_post = p.unique_id_post)
            ), 0) AS total_comments,
            COALESCE(SUM(
                (SELECT COUNT(*) FROM mainComments mc WHERE mc.commenter_username = u.username AND mc.unique_id_post = p.unique_id_post) +
                (SELECT COUNT(*) FROM childComments cc WHERE cc.child_commenter_username = u.username AND cc.unique_id_post = p.unique_id_post)
            ), 0) AS total_comments_by_username
        FROM listAkun la
        JOIN users u ON la.username = u.username
        LEFT JOIN posts p ON p.username = u.username
        WHERE p.created_at BETWEEN ? AND ?
        GROUP BY u.username
    `, [start_date, end_date]);

    return rows.map(row => ({
        ...row,
        responsiveness: (row.total_comments_by_username / (row.total_comments - row.total_comments_by_username)) * 100
    }));
}

// Fungsi untuk mendapatkan data responsiveness dan mengirimkan respons HTTP
async function getResponsivenessTiktok(req, res) {
    try {
        const response = await fetch(`http://localhost:${process.env.PORT}/api/getDates`);
        const data = await response.json();
        const start_date = new Date(data.startDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
        const end_date = new Date(data.endDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

        const rows = await fetchResponsivenessData(start_date, end_date);
        res.json(rows);
    } catch (error) {
        console.error("Error fetching responsiveness data:", error);
        res.status(500).send("Failed to fetch responsiveness data");
    }
}

// Fungsi untuk mengambil data likes user dari database
async function fetchLikesUserData(start_date, end_date) {
    const [rows] = await db.query(`
        SELECT 
            u.username, 
            COUNT(DISTINCT l.post_code) AS total_likes
        FROM likes u
        LEFT JOIN likes l ON l.username = u.username
        WHERE l.created_at BETWEEN ? AND ?
        GROUP BY u.username
        ORDER BY total_likes DESC
    `, [start_date, end_date]);
    return rows;
}

// Fungsi untuk mendapatkan data likes user dan mengirimkan respons HTTP
async function getLikesUserTiktok(req, res) {
    try {
        const response = await fetch(`http://localhost:${process.env.PORT}/api/getDates`);
        const data = await response.json();
        const start_date = new Date(data.startDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
        const end_date = new Date(data.endDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

        const rows = await fetchLikesUserData(start_date, end_date);
        res.json(rows);
    } catch (error) {
        console.error("Error fetching likes data:", error);
        res.status(500).send("Failed to fetch likes data");
    }
}

// Fungsi untuk mengambil semua data postingan dari database
async function fetchAllDataPost(start_date, end_date) {
    const [rows] = await db.query(`
        SELECT * FROM posts WHERE created_at BETWEEN ? AND ?
    `, [start_date, end_date]);
    return rows;
}

// Fungsi untuk mendapatkan semua data postingan dan mengirimkan respons HTTP
async function getAllDataPostTiktok(req, res) {
    try {
        const response = await fetch(`http://localhost:${process.env.PORT}/api/getDates`);
        const data = await response.json();
        const start_date = new Date(data.startDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
        const end_date = new Date(data.endDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

        const rows = await fetchAllDataPost(start_date, end_date);
        res.json(rows);
    } catch (error) {
        console.error("Error fetching posts data:", error);
        res.status(500).send("Failed to fetch posts data");
    }
}

// Fungsi untuk menghitung FAIR score harian dan menyimpannya ke database
async function calculateFairScoreTiktok(req, res) {
    try {
        const response = await fetch(`http://localhost:${process.env.PORT}/api/getDates`);
        const data = await response.json();
        const start_date = new Date(data.startDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });
        const end_date = new Date(data.endDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' });

        let currentDate = new Date(start_date);
        const endDate = new Date(end_date);

        while (currentDate <= endDate) {
            const day = currentDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).split('T')[0];

            // Ambil data followers, activities, interaction, dan responsiveness perhari
            const followersData = await fetchFollowersData();
            const activitiesData = await fetchActivitiesData(day, day);
            const interactionData = await fetchInteractionData(day, day);
            const responsivenessData = await fetchResponsivenessData(day, day);

            // Hitung nilai maksimum untuk masing-masing metrik
            const maxFollowers = Math.max(...followersData.map(d => d.followers));
            const maxActivities = Math.max(...activitiesData.map(d => d.activities));
            const maxInteraction = Math.max(...interactionData.map(d => d.interaction));
            const maxResponsiveness = Math.max(...responsivenessData.map(d => d.responsiveness));

            // Hitung score untuk masing-masing metrik dan bobotnya
            const scores = followersData.map(user => {
                const activities = activitiesData.find(a => a.username === user.username)?.activities || 0;
                const interaction = interactionData.find(i => i.username === user.username)?.interaction || 0;
                const responsiveness = responsivenessData.find(r => r.username === user.username)?.responsiveness || 0;

                const followersScore = (user.followers / maxFollowers) * 2;
                const activitiesScore = (activities / maxActivities) * 2;
                const interactionScore = (interaction / maxInteraction) * 3;
                const responsivenessScore = (responsiveness / maxResponsiveness) * 1;

                const totalScore = ((followersScore + activitiesScore + interactionScore + responsivenessScore) / 8) * 100;

                return {
                    list_id: user.list_id, // Pastikan list_id ada di data user
                    username: user.username,
                    platform: user.platform,
                    day: day, // Tanggal hari ini
                    followers_score: followersScore,
                    activities_score: activitiesScore,
                    interaction_score: interactionScore,
                    responsiveness_score: responsivenessScore,
                    total_score: totalScore
                };
            });

            // Simpan hasil ke database
            for (const score of scores) {
                await db.query(`
                    INSERT INTO dailyFairScores (list_id, username, platform, day, followers_score, activities_score, interaction_score, responsiveness_score, total_score)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `, [score.list_id, score.username, score.platform, score.day, score.followers_score, score.activities_score, score.interaction_score, score.responsiveness_score, score.total_score]);
            }

            // Tambahkan satu hari ke currentDate
            currentDate.setDate(currentDate.getDate() + 1);
        }

        res.json({ result: "FAIR scores calculated and saved for the date range." });
    } catch (error) {
        console.error("Error calculating FAIR score:", error);
        res.status(500).send("Failed to calculate FAIR score");
    }
}

// Fungsi untuk mengambil data FAIR score berdasarkan periode waktu
async function getFairScoresTiktok(req, res) {
    const { startDate, endDate, period } = req.query;

    try {
        let query = '';
        let params = [startDate, endDate];

        if (period === 'daily') {
            query = 'SELECT * FROM dailyFairScores WHERE day BETWEEN ? AND ?';
        } else if (period === 'weekly') {
            query = `
                SELECT 
                    list_id, 
                    username,
                    platform, 
                    DATE_FORMAT(day, '%Y-%u') AS week, 
                    AVG(followers_score) AS followers_score, 
                    AVG(activities_score) AS activities_score, 
                    AVG(interaction_score) AS interaction_score, 
                    AVG(responsiveness_score) AS responsiveness_score, 
                    AVG(total_score) AS total_score
                FROM dailyFairScores 
                WHERE day BETWEEN ? AND ? 
                GROUP BY list_id, username, platform, week
            `;
        } else if (period === 'monthly') {
            query = `
                SELECT 
                    list_id, 
                    username,
                    platform, 
                    DATE_FORMAT(day, '%Y-%m') AS month, 
                    AVG(followers_score) AS followers_score, 
                    AVG(activities_score) AS activities_score, 
                    AVG(interaction_score) AS interaction_score, 
                    AVG(responsiveness_score) AS responsiveness_score, 
                    AVG(total_score) AS total_score
                FROM dailyFairScores 
                WHERE day BETWEEN ? AND ? 
                GROUP BY list_id, username, platform, month
            `;
        }

        const [rows] = await db.query(query, params);
        res.json(rows);
    } catch (error) {
        console.error("Error fetching FAIR scores:", error);
        res.status(500).send("Failed to fetch FAIR scores");
    }
}

module.exports = { getFollowersTiktok, getActivitiesTiktok, getInteractionTiktok, getResponsivenessTiktok, getLikesUserTiktok, getAllDataPostTiktok, calculateFairScoreTiktok, getFairScoresTiktok };