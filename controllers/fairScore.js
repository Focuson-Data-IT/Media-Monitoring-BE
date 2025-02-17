const connection = require('../models/db');

// 🔹 **Fungsi untuk mendapatkan jumlah hari dalam bulan tertentu**
const getDaysInMonth = (date) => {
    const year = new Date(date).getFullYear();
    const month = new Date(date).getMonth() + 1;
    return new Date(year, month, 0).getDate();
};

// 🔹 **Fungsi untuk mendapatkan daftar tanggal dalam rentang tertentu**
const getDatesInRange = (startDate, endDate) => {
    const dates = [];
    let currentDate = new Date(startDate);

    while (currentDate <= new Date(endDate)) {
        dates.push(new Date(currentDate).toISOString().split('T')[0]); // Format YYYY-MM-DD
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return dates;
};

// 🔹 **Proses Data untuk Rentang Tanggal**
const processData = async (startDate, endDate) => {
    console.log(`[DEBUG] Starting batch processing from ${startDate} to ${endDate}...`);

    const dates = getDatesInRange(startDate, endDate);
    
    for (const date of dates) {
        await processBatchForDate(date);
    }

    console.log(`[DEBUG] Data processed successfully for range ${startDate} to ${endDate}`);
};

// 🔹 **Ambil Data yang Perlu Diperbarui**
const getDataForBatchProcessing = async (date) => {
    console.log(`[DEBUG] Fetching data for batch processing on: ${date}`);

    const daysInMonth = getDaysInMonth(date);

    const query = `
        SELECT dfs.list_id, dfs.client_account, dfs.kategori, dfs.platform, dfs.username, dfs.date,
            (SELECT followers FROM users WHERE users.username = dfs.username LIMIT 1) AS followers,
            (
                SELECT COUNT(*) 
                FROM posts 
                WHERE client_account = dfs.client_account 
                AND kategori = dfs.kategori 
                AND platform = dfs.platform 
                AND username = dfs.username 
                AND DATE(created_at) BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND ?
            ) / ? AS activities,
            (
                SELECT COUNT(*) 
                FROM posts
                WHERE client_account = dfs.client_account
                    AND kategori = dfs.kategori 
                    AND platform = dfs.platform 
                    AND username = dfs.username  
                    AND DATE(created_at) = dfs.date
            ) AS nilai_aktifitas,  /* ✅ Ditambahkan tapi tidak dihitung dalam skor */
            (
                SELECT SUM(likes) 
                FROM posts 
                WHERE client_account = dfs.client_account 
                AND kategori = dfs.kategori 
                AND platform = dfs.platform 
                AND username = dfs.username 
                AND DATE(created_at) BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND ?
            ) /
            (
                SELECT COUNT(*) 
                FROM posts 
                WHERE client_account = dfs.client_account 
                AND kategori = dfs.kategori 
                AND platform = dfs.platform 
                AND username = dfs.username 
                AND DATE(created_at) BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND ?
            ) AS interactions,
            (
                SELECT 
                    COALESCE(SUM(mc_count), 0) / NULLIF(COALESCE(SUM(cc_count), 1), 0) * 100
                FROM (
                    SELECT 
                        p.unique_id_post,
                        COUNT(DISTINCT mc.comment_unique_id) AS mc_count,
                        COUNT(DISTINCT cc.child_comment_unique_id) AS cc_count
                    FROM posts p
                    LEFT JOIN mainComments mc ON mc.unique_id_post = p.unique_id_post
                    LEFT JOIN childComments cc ON cc.unique_id_post = p.unique_id_post
                    WHERE p.client_account = dfs.client_account 
                        AND p.kategori = dfs.kategori 
                        AND p.platform = dfs.platform 
                        AND p.username = dfs.username 
                        AND DATE(p.created_at) BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND ?
                    GROUP BY p.unique_id_post
                ) AS comment_counts
            ) AS responsiveness
        FROM dailyFairScores dfs
        WHERE dfs.date = ?
    `;

    const [data] = await connection.query(query, [
        date, date, daysInMonth, 
        date, date, date, date,
        date, date, date, date, 
        date, date
    ]);
    
    console.log(`[DEBUG] Retrieved ${data.length} rows for date: ${date}`);
    return data;
};

// 🔹 **Proses Batch untuk Tanggal**
const processBatchForDate = async (date) => {
    const rows = await getDataForBatchProcessing(date);
    
    if (rows.length === 0) {
        console.warn(`[DEBUG] No data found for date: ${date}`);
        return;
    }

    const updates = rows.map(row => ([
        row.followers || 0,
        row.activities || 0,
        row.nilai_aktifitas || 0,  // ✅ Ditambahkan tapi tidak dihitung skor
        row.interactions || 0,
        row.responsiveness || 0,
        row.list_id, row.client_account, row.kategori, row.platform, row.username, row.date
    ]));

    await batchUpdateFairScores(updates);
    await processScoresForDate(date);
};

// 🔹 **Batch Update Data Dasar**
const batchUpdateFairScores = async (updates) => {
    console.log(`[DEBUG] Updating ${updates.length} rows...`);

    const updateSql = `
        INSERT INTO dailyFairScores (
            followers, activities, nilai_aktifitas, interactions, responsiveness,  /* ✅ nilai_aktifitas hanya dimasukkan */
            list_id, client_account, kategori, platform, username, date
        ) VALUES ?
        ON DUPLICATE KEY UPDATE
            followers = VALUES(followers),
            activities = VALUES(activities),
            nilai_aktifitas = VALUES(nilai_aktifitas),  /* ✅ Tidak ikut dalam skor */
            interactions = VALUES(interactions),
            responsiveness = VALUES(responsiveness);
    `;

    await connection.query(updateSql, [updates]);
    console.log(`[DEBUG] Batch update for ${updates.length} rows completed.`);
};

// 🔹 **Batch Update Score & Fair Score**
const batchUpdateScores = async (updates) => {
    console.log(`[DEBUG] Updating scores for ${updates.length} rows...`);

    const updateSql = `
        UPDATE dailyFairScores
        SET 
            followers_score = VALUES(followers_score), 
            activities_score = VALUES(activities_score), 
            interactions_score = VALUES(interactions_score), 
            responsiveness_score = VALUES(responsiveness_score), 
            fair_score = VALUES(fair_score)
        WHERE 
            list_id = VALUES(list_id) AND date = VALUES(date);
    `;

    await Promise.all(updates.map(update => connection.query(updateSql, update)));

    console.log(`[DEBUG] Scores updated for ${updates.length} rows.`);
};

// 🔹 **Hitung Skor & Bobot Per Kategori (Tanpa nilai_aktifitas)**
const processScoresForDate = async (date) => {
    console.log(`[DEBUG] Processing scores for date: ${date}`);

    const query = `
        SELECT kategori, MAX(followers) AS max_followers, MAX(activities) AS max_activities,
               MAX(interactions) AS max_interactions, MAX(responsiveness) AS max_responsiveness
        FROM dailyFairScores
        WHERE date = ?
        GROUP BY kategori;
    `;

    const [maxValues] = await connection.query(query, [date]);
    
    if (maxValues.length === 0) {
        console.warn(`[DEBUG] No max values found for date: ${date}. Skipping score processing.`);
        return;
    }

    const updates = [];

    for (const { kategori, max_followers, max_activities, max_interactions, max_responsiveness } of maxValues) {
        const [rows] = await connection.query(`
            SELECT list_id, followers, activities, interactions, responsiveness
            FROM dailyFairScores
            WHERE kategori = ? AND date = ?
        `, [kategori, date]);

        for (const row of rows) {
            const fair_score = ((row.followers / max_followers * 2) + (row.activities / max_activities * 2) + 
                               (row.interactions / max_interactions * 3) + (row.responsiveness / max_responsiveness * 1)) / 8 * 100; // ✅ Tanpa nilai_aktifitas

            updates.push([fair_score, row.list_id, date]);
        }
    }

    await batchUpdateScores(updates);
};

module.exports = {
    processData,
};
