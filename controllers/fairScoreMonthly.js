const connection = require('../models/db');

// **Fungsi untuk mendapatkan jumlah hari dalam bulan tertentu**
const getDaysInMonth = (date) => {
    const year = new Date(date).getFullYear();
    const month = new Date(date).getMonth() + 1;
    return new Date(year, month, 0).getDate();
};

// **Fungsi untuk mendapatkan daftar tanggal dalam rentang tertentu**
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

// **Proses Data untuk Rentang Tanggal**
const processData = async (startDate, endDate, kategori, platform) => {
    console.info(`[INFO] Starting batch processing from ${startDate} to ${endDate} for kategori: ${kategori}...`);

    const dates = getDatesInRange(startDate, endDate);

    for (const date of dates) {
        try {
            await processBatchForDate(date, kategori, platform);
        } catch (error) {
            console.error(`[ERROR] Failed to process batch for date ${date} in kategori ${kategori}:`, error);
        }
    }

    console.info(`[INFO] Data processing completed for range ${startDate} to ${endDate} in kategori ${kategori}`);
};

// **Ambil Data yang Perlu Diperbarui**
const getDataForBatchProcessing = async (date, kategori, platform) => {
    console.info(`[INFO] Fetching data for batch processing on: ${date}`);
    const daysInMonth = getDaysInMonth(date);

    const query = `
                SELECT fsm.list_id, fsm.client_account, fsm.kategori, fsm.platform, fsm.username, fsm.date,
        
            -- Followers dengan filter platform
            (
                SELECT COALESCE(
                    (SELECT followers 
                     FROM posts p
                     WHERE p.username = fsm.username 
                     AND p.platform = ?
                     AND DATE(p.created_at) <= fsm.date
                     ORDER BY p.created_at DESC
                     LIMIT 1),
                    (SELECT u.followers
                     FROM users u
                     WHERE u.username = fsm.username
                     AND u.platform = ?
                     LIMIT 1) -- Ambil dari tabel users jika tidak ditemukan di posts
                )
            ) AS followers,
        
            -- Activities (rata-rata posting per hari)
            (
                SELECT COUNT(*) 
                FROM posts p
                WHERE p.client_account = fsm.client_account 
                  AND FIND_IN_SET(?, p.kategori)
                  AND p.platform = ?
                  AND p.username = fsm.username 
                  AND DATE(p.created_at) BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND ?
            ) / ? AS activities,
        
            -- Nilai Aktivitas (jumlah posting di tanggal tertentu)
            (
                SELECT COUNT(*) 
                FROM posts p
                WHERE p.client_account = fsm.client_account
                  AND FIND_IN_SET(?, p.kategori)
                  AND p.platform = ?
                  AND p.username = fsm.username  
                  AND DATE(p.created_at) = fsm.date
            ) AS nilai_aktifitas,
        
            -- Interactions (rata-rata likes per postingan)
            (
                SELECT SUM(likes) 
                FROM posts p
                WHERE p.client_account = fsm.client_account 
                  AND FIND_IN_SET(?, p.kategori)
                  AND p.platform = ?
                  AND p.username = fsm.username 
                  AND DATE(p.created_at) BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND ?
            ) /
            (
                SELECT COUNT(*) 
                FROM posts p
                WHERE p.client_account = fsm.client_account 
                  AND FIND_IN_SET(?, p.kategori)
                  AND p.platform = ?
                  AND p.username = fsm.username 
                  AND DATE(p.created_at) BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND ?
            ) AS interactions,
        
            -- Responsiveness dengan filter platform
            (
                SELECT 
                    COALESCE(reply_count, 0) / NULLIF(COALESCE(incoming_count, 1), 0) * 100
                FROM (
                    -- Hitung total komentar masuk (mainComments + childComments) dari user lain
                    SELECT 
                        COUNT(DISTINCT mc.comment_unique_id) + COUNT(DISTINCT cc.child_comment_unique_id) AS incoming_count,

                        -- Hitung total balasan dari akun ini (baik di mainComments maupun childComments)
                        (
                            SELECT COUNT(*)
                            FROM mainComments mc_reply
                            WHERE mc_reply.commenter_username = fsm.username
                              AND mc_reply.unique_id_post = p.unique_id_post
                        ) +
                        (
                            SELECT COUNT(*)
                            FROM childComments cc_reply
                            WHERE cc_reply.child_commenter_username = fsm.username
                              AND cc_reply.unique_id_post = p.unique_id_post
                        ) AS reply_count
                    FROM posts p
                    LEFT JOIN mainComments mc ON mc.unique_id_post = p.unique_id_post
                    LEFT JOIN childComments cc ON cc.unique_id_post = p.unique_id_post
                    WHERE p.client_account = fsm.client_account 
                      AND FIND_IN_SET(?, p.kategori)
                      AND p.platform = ?
                      AND p.username = fsm.username
                      AND DATE(p.created_at) BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND ?
                ) AS comment_summary
            ) AS responsiveness

        FROM fairScoresMonthly fsm
        WHERE fsm.date = ? AND fsm.kategori = ? AND fsm.platform = ?
        
    `;

    const [data] = await connection.query(query, [
        platform, platform,
        kategori, platform, date, date, daysInMonth,
        kategori, platform,
        kategori, platform, date, date,
        kategori, platform, date, date,
        kategori, platform, date, date,
        date, kategori, platform,
    ]);

    // console.info(`[INFO] Retrieved ${data.length} rows for date: ${date}`);
    // if (data.length > 0) console.table(data);
    return data;
};

// **Proses Batch untuk Tanggal**
const processBatchForDate = async (date, kategori, platform) => {
    console.info(`[INFO] Processing batch for date: ${date} in kategori: ${kategori} for platform ${platform}`);
    const rows = await getDataForBatchProcessing(date, kategori, platform);

    if (rows.length === 0) {
        console.warn(`[WARN] No data found for date: ${date} in kategori: ${kategori}`);
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

        console.info(`[INFO] Prepared update for kategori: ${kategori}`, update);
        return update;
    });

    await batchUpdateFairScores(updates);
    await processScoresForDate(date, kategori, platform);
};


// **Batch Update Data Dasar**
const batchUpdateFairScores = async (updates) => {
    if (!updates.length) {
        console.warn('[WARN] No updates to perform.');
        return;
    }

    console.info(`[INFO] Updating ${updates.length} rows in fairScoresMonthly...`);
    const updateSql = `
        INSERT INTO fairScoresMonthly (
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

// **Hitung Skor & Bobot Per Kategori dan Platform**
const processScoresForDate = async (date, kategori, platform) => {
    console.info(`[INFO] Processing scores and weights for date: ${date}`);

    const query = `
        SELECT kategori, platform, 
               MAX(followers) AS max_followers, 
               MAX(activities) AS max_activities,
               MAX(interactions) AS max_interactions, 
               MAX(responsiveness) AS max_responsiveness
        FROM fairScoresMonthly
        WHERE date = ?
        AND kategori = ?
        AND platform = ?
    `;

    const [maxValues] = await connection.query(query, [date, kategori, platform]);
    console.info('[INFO] Max values per kategori and platform:', maxValues);

    if (maxValues.length === 0) {
        console.warn(`[WARN] No max values found for date: ${date}`);
        return;
    }

    const updates = [];

    for (const { platform, max_followers, max_activities, max_interactions, max_responsiveness } of maxValues) {
        const [rows] = await connection.query(`
            SELECT list_id, followers, activities, interactions, responsiveness
            FROM fairScoresMonthly
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

            // console.info(`[INFO] Calculated fair_score for list_id: ${row.list_id} => ${fair_score.toFixed(2)}%`);

            updates.push([
                followers_score, followers_bobot,
                activities_score, activities_bobot,
                interactions_score, interactions_bobot,
                responsiveness_score, responsiveness_bobot,
                fair_score, 
                row.list_id, date, kategori, platform
            ]);
        });
    }

    await batchUpdateScores(updates);
};

// **Update Skor, Bobot, dan FAIR Score**
const batchUpdateScores = async (updates) => {
    if (!updates.length) {
        console.warn('[WARN] No fair score updates to apply.');
        return;
    }

    console.info(`[INFO] Updating fair scores, scores, and weights for ${updates.length} rows...`);

    const updateSql = `
        UPDATE fairScoresMonthly
        SET 
            followers_score = ?, followers_bobot = ?,
            activities_score = ?, activities_bobot = ?,
            interactions_score = ?, interactions_bobot = ?,
            responsiveness_score = ?, responsiveness_bobot = ?,
            fair_score = ?
        WHERE list_id = ? AND date = ? AND kategori = ? AND platform = ?;
    `;

    try {
        await Promise.all(updates.map(update => connection.query(updateSql, update)));
        console.info(`[SUCCESS] Updated scores and weights for ${updates.length} rows.`);
    } catch (error) {
        console.error('[ERROR] Failed to update fair scores:', error);
    }
};

module.exports = { processData };
