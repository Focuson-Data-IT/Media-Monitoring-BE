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
        dates.push(new Date(currentDate).toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
    }

    console.info(`[INFO] Dates generated in range: ${dates.join(', ')}`);
    return dates;
};

// 🔹 **Proses Data untuk Rentang Tanggal**
const processData = async (startDate, endDate) => {
    console.info(`[INFO] Starting batch processing from ${startDate} to ${endDate}...`);

    const dates = getDatesInRange(startDate, endDate);

    for (const date of dates) {
        try {
            await processBatchForDate(date);
        } catch (error) {
            console.error(`[ERROR] Failed to process batch for date ${date}:`, error);
        }
    }

    console.info(`[INFO] Data processing completed for range ${startDate} to ${endDate}`);
};

// 🔹 **Ambil Data yang Perlu Diperbarui**
const getDataForBatchProcessing = async (date) => {
    console.info(`[INFO] Fetching data for batch processing on: ${date}`);
    const daysInMonth = getDaysInMonth(date);

    const query = `
                SELECT dfs.list_id, dfs.client_account, dfs.kategori, dfs.platform, dfs.username, dfs.date,
        
            -- ✅ Followers dengan filter platform
            (SELECT followers FROM users WHERE users.username = dfs.username AND users.platform = dfs.platform LIMIT 1) AS followers,
        
            -- ✅ Activities (rata-rata posting per hari)
            (
                SELECT COUNT(*) 
                FROM posts 
                WHERE client_account = dfs.client_account 
                  AND kategori = dfs.kategori 
                  AND platform = dfs.platform  -- ✅ Tambah filter platform
                  AND username = dfs.username 
                  AND DATE(created_at) BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND ?
            ) / ? AS activities,
        
            -- ✅ Nilai Aktivitas (jumlah posting di tanggal tertentu)
            (
                SELECT COUNT(*) 
                FROM posts
                WHERE client_account = dfs.client_account
                  AND kategori = dfs.kategori 
                  AND platform = dfs.platform  -- ✅ Tambah filter platform
                  AND username = dfs.username  
                  AND DATE(created_at) = dfs.date
            ) AS nilai_aktifitas,
        
            -- ✅ Interactions (rata-rata likes per postingan)
            (
                SELECT SUM(likes) 
                FROM posts 
                WHERE client_account = dfs.client_account 
                  AND kategori = dfs.kategori 
                  AND platform = dfs.platform  -- ✅ Tambah filter platform
                  AND username = dfs.username 
                  AND DATE(created_at) BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND ?
            ) /
            (
                SELECT COUNT(*) 
                FROM posts 
                WHERE client_account = dfs.client_account 
                  AND kategori = dfs.kategori 
                  AND platform = dfs.platform  -- ✅ Tambah filter platform
                  AND username = dfs.username 
                  AND DATE(created_at) BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND ?
            ) AS interactions,
        
            -- ✅ Responsiveness dengan filter platform
            (
                SELECT 
                    COALESCE(reply_count, 0) / NULLIF(COALESCE(incoming_count, 1), 0) * 100
                FROM (
                    -- 🔹 Hitung total komentar masuk (mainComments + childComments) dari user lain
                    SELECT 
                        COUNT(DISTINCT mc.comment_unique_id) + COUNT(DISTINCT cc.child_comment_unique_id) AS incoming_count,

                        -- 🔹 Hitung total balasan dari akun ini (baik di mainComments maupun childComments)
                        (
                            SELECT COUNT(*)
                            FROM mainComments mc_reply
                            WHERE mc_reply.commenter_username = dfs.username
                              AND mc_reply.unique_id_post = p.unique_id_post
                        ) +
                        (
                            SELECT COUNT(*)
                            FROM childComments cc_reply
                            WHERE cc_reply.child_commenter_username = dfs.username
                              AND cc_reply.unique_id_post = p.unique_id_post
                        ) AS reply_count
                    FROM posts p
                    LEFT JOIN mainComments mc ON mc.unique_id_post = p.unique_id_post
                    LEFT JOIN childComments cc ON cc.unique_id_post = p.unique_id_post
                    WHERE p.client_account = dfs.client_account 
                      AND p.kategori = dfs.kategori 
                      AND p.platform = dfs.platform
                      AND p.username = dfs.username
                      AND DATE(p.created_at) BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND ?
                ) AS comment_summary
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

    console.info(`[INFO] Retrieved ${data.length} rows for date: ${date}`);
    if (data.length > 0) console.table(data);
    return data;
};

// 🔹 **Proses Batch untuk Tanggal**
const processBatchForDate = async (date) => {
    console.info(`[INFO] Processing batch for date: ${date}`);
    const rows = await getDataForBatchProcessing(date);

    if (rows.length === 0) {
        console.warn(`[WARN] No data found for date: ${date}`);
        return;
    }

    const updates = rows.map(row => {
        const update = [
            row.followers || 0,
            row.activities || 0,
            row.nilai_aktifitas || 0,
            row.interactions || 0,
            row.responsiveness || 0,
            row.list_id, row.client_account, row.kategori, row.platform, row.username, row.date
        ];

        console.info(`[INFO] Prepared update:`, update);
        return update;
    });

    await batchUpdateFairScores(updates);
    await processScoresForDate(date);
};

// 🔹 **Batch Update Data Dasar**
const batchUpdateFairScores = async (updates) => {
    if (!updates.length) {
        console.warn('[WARN] No updates to perform.');
        return;
    }

    console.info(`[INFO] Updating ${updates.length} rows in dailyFairScores...`);
    const updateSql = `
        INSERT INTO dailyFairScores (
            followers, activities, nilai_aktifitas, interactions, responsiveness,
            list_id, client_account, kategori, platform, username, date
        ) VALUES ?
        ON DUPLICATE KEY UPDATE
            followers = VALUES(followers),
            activities = VALUES(activities),
            nilai_aktifitas = VALUES(nilai_aktifitas),
            interactions = VALUES(interactions),
            responsiveness = VALUES(responsiveness);
    `;

    try {
        await connection.query(updateSql, [updates]);
        console.info(`[SUCCESS] Batch update completed for ${updates.length} rows.`);
    } catch (error) {
        console.error('[ERROR] Failed to update fair scores:', error);
    }
};

// 🔹 **Hitung Skor & Bobot Per Kategori dan Platform**
const processScoresForDate = async (date) => {
    console.info(`[INFO] Processing scores and weights for date: ${date}`);

    const query = `
        SELECT kategori, platform, 
               MAX(followers) AS max_followers, 
               MAX(activities) AS max_activities,
               MAX(interactions) AS max_interactions, 
               MAX(responsiveness) AS max_responsiveness
        FROM dailyFairScores
        WHERE date = ?
        GROUP BY kategori, platform;
    `;

    const [maxValues] = await connection.query(query, [date]);
    console.info('[INFO] Max values per kategori and platform:', maxValues);

    if (maxValues.length === 0) {
        console.warn(`[WARN] No max values found for date: ${date}`);
        return;
    }

    const updates = [];

    for (const { kategori, platform, max_followers, max_activities, max_interactions, max_responsiveness } of maxValues) {
        const [rows] = await connection.query(`
            SELECT list_id, followers, activities, interactions, responsiveness
            FROM dailyFairScores
            WHERE kategori = ? AND platform = ? AND date = ?
        `, [kategori, platform, date]);

        console.info(`[INFO] Processing kategori: ${kategori}, platform: ${platform}, found ${rows.length} rows.`);

        rows.forEach(row => {
            // 🔥 Hitung skor
            const followers_score = (row.followers / (max_followers || 1)) || 0;
            const activities_score = (row.activities / (max_activities || 1)) || 0;
            const interactions_score = (row.interactions / (max_interactions || 1)) || 0;
            const responsiveness_score = (row.responsiveness / (max_responsiveness || 1)) || 0;

            // 🔥 Hitung bobot
            const followers_bobot = followers_score * 2;
            const activities_bobot = activities_score * 2;
            const interactions_bobot = interactions_score * 3;
            const responsiveness_bobot = responsiveness_score * 1;

            // 🔥 Hitung FAIR Score
            const fair_score = ((followers_bobot + activities_bobot + interactions_bobot + responsiveness_bobot) / 8) * 100;

            console.info(`[INFO] Calculated fair_score for list_id: ${row.list_id} => ${fair_score.toFixed(2)}%`);

            updates.push([
                followers_score, followers_bobot,
                activities_score, activities_bobot,
                interactions_score, interactions_bobot,
                responsiveness_score, responsiveness_bobot,
                fair_score, row.list_id, date
            ]);
        });
    }

    await batchUpdateScores(updates);
};

// 🔹 **Update Skor, Bobot, dan FAIR Score**
const batchUpdateScores = async (updates) => {
    if (!updates.length) {
        console.warn('[WARN] No fair score updates to apply.');
        return;
    }

    console.info(`[INFO] Updating fair scores, scores, and weights for ${updates.length} rows...`);

    const updateSql = `
        UPDATE dailyFairScores
        SET 
            followers_score = ?, followers_bobot = ?,
            activities_score = ?, activities_bobot = ?,
            interactions_score = ?, interactions_bobot = ?,
            responsiveness_score = ?, responsiveness_bobot = ?,
            fair_score = ?
        WHERE list_id = ? AND date = ?;
    `;

    try {
        await Promise.all(updates.map(update => connection.query(updateSql, update)));
        console.info(`[SUCCESS] Updated scores and weights for ${updates.length} rows.`);
    } catch (error) {
        console.error('[ERROR] Failed to update fair scores:', error);
    }
};

module.exports = { processData };
