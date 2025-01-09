const db = require('../models/db'); // Database connection
require('dotenv').config(); // Load environment variables from .env file

// Saving User Data per Hari ke dalam tabel dailyFairScores
async function addUserDataToDailyFairScores() {
    try {
        
    } catch (error) {
        console.error("Error saving user data to dailyFairScores:", error);
    }
};

// Fungsi untuk mengambil data followers dari tabel users dan menyimpan ke dalam tabel dailyFairScores
async function fetchFollowersData() {
    // Fetching Followers Data
    try {
        const [rows] = await db.query(`
            SELECT 
                la.client_account,
                la.kategori,
                la.platform,
                la.username,
                u.username, 
                u.followers,
                u.following,
                u.mediaCount
            FROM listAkun la
            JOIN users u ON la.username = u.username
        `);
        return rows;
    } catch (error) {
        console.error("Error fetching followers data:", error);
    }

    // Saving Followers Data
    try {

        return
    } catch (error) {
        console.error("Error saving followers data:", error);
    }

}

// Fungsi untuk mendapatkan data followers dan mengirimkan respons HTTP
async function getFollowersIg(req, res) {
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
async function getActivitiesIg(req, res) {
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
async function getInteractionIg(req, res) {
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
async function getResponsivenessIg(req, res) {
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
async function getLikesUserIg(req, res) {
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
async function getAllDataPostIg(req, res) {
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

module.exports = { getFollowersIg, getActivitiesIg, getInteractionIg, getResponsivenessIg, getLikesUserIg, getAllDataPostIg };