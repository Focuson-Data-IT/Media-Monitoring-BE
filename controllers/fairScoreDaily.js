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
    console.info(`[INFO] Starting batch processing from ${startDate} to ${endDate} for kategori: ${kategori} for platform ${platform} ...`);

    const dates = getDatesInRange(startDate, endDate);

    for (const date of dates) {
        try {
            await processBatchForDate(date, kategori, platform);
        } catch (error) {
            console.error(`[ERROR] Failed to process batch for date ${date} in kategori ${kategori} for platform ${platform} :`, error);
        }
    }

    console.info(`[INFO] Data processing completed for range ${startDate} to ${endDate} in kategori ${kategori} for platform ${platform}`);
};

// **Ambil Data yang Perlu Diperbarui**
const getDataForBatchProcessing = async (date, kategori, platform) => {
    console.info(`[INFO] Fetching data for batch processing on: ${date}`);
    const daysInMonth = getDaysInMonth(date);

    const query = `
            SELECT fsd.list_id, fsd.client_account, fsd.kategori, fsd.platform, fsd.username, fsd.date,
        
            -- Followers dengan filter platform
            (
                SELECT COALESCE(
                    (SELECT followers 
                     FROM posts p
                     WHERE p.username = fsd.username 
                     AND p.platform = ?
                     AND DATE(p.created_at) <= fsd.date
                     ORDER BY p.created_at DESC
                     LIMIT 1)
                )
            ) AS followers,
        
            -- Activities (rata-rata posting per hari)
            (
                SELECT COUNT(*) 
                FROM posts p 
                WHERE FIND_IN_SET(?, p.kategori)
                  AND p.platform = ?
                  AND p.username = fsd.username 
                  AND DATE(p.created_at) = fsd.date
            ) AS activities,
        
            -- Nilai Aktivitas (jumlah posting di tanggal tertentu)
            (
                SELECT COUNT(*) 
                FROM posts p
                WHERE FIND_IN_SET(?, p.kategori)
                  AND p.platform = ?
                  AND p.username = fsd.username  
                  AND DATE(p.created_at) = fsd.date
            ) AS nilai_aktifitas,
        
            -- Interactions (rata-rata likes per postingan)
            (
                SELECT SUM(likes) 
                FROM posts p
                WHERE FIND_IN_SET(?, p.kategori)
                  AND p.platform = ?
                  AND p.username = fsd.username  
                  AND DATE(p.created_at) = fsd.date
            ) / COALESCE(
                (SELECT COUNT(*) 
                 FROM posts p
                 WHERE FIND_IN_SET(?, p.kategori)
                   AND p.platform = ?  
                   AND p.username = fsd.username  
                   AND DATE(p.created_at) = fsd.date), 1
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
                            WHERE mc_reply.commenter_username = fsd.username
                              AND mc_reply.unique_id_post = p.unique_id_post
                        ) +
                        (
                            SELECT COUNT(*)
                            FROM childComments cc_reply
                            WHERE cc_reply.child_commenter_username = fsd.username
                              AND cc_reply.unique_id_post = p.unique_id_post
                        ) AS reply_count
                    FROM posts p
                    LEFT JOIN mainComments mc ON mc.unique_id_post = p.unique_id_post
                    LEFT JOIN childComments cc ON cc.unique_id_post = p.unique_id_post
                    WHERE FIND_IN_SET(?, p.kategori)
                      AND p.platform = ?
                      AND p.username = fsd.username
                      AND DATE(p.created_at) = fsd.date
                ) AS comment_summary
            ) AS responsiveness

        FROM fairScoresDaily fsd
        WHERE fsd.date = ? AND fsd.kategori = ? AND fsd.platform = ?
        
    `;

    const [data] = await connection.query(query, [
        platform,
        kategori, platform,
        kategori, platform,
        kategori, platform,
        kategori, platform,
        kategori, platform,
        date, kategori, platform
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

    console.info(`[INFO] Updating ${updates.length} rows in fairScoresDaily...`);
    const updateSql = `
        INSERT INTO fairScoresDaily (
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
        FROM fairScoresDaily
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

    for (const { max_followers, max_activities, max_interactions, max_responsiveness } of maxValues) {
        const [rows] = await connection.query(`
            SELECT list_id, followers, activities, interactions, responsiveness
            FROM fairScoresDaily
            WHERE kategori = ? AND platform = ? AND date = ?
        `, [kategori, platform, date]);

        console.info(`[INFO] Processing kategori: ${kategori}, platform: ${platform}, found ${rows.length} rows.`);

        rows.forEach(row => {
            // Hitung skor
            const followers_score = (row.followers / (max_followers || 1)) || 0;
            const activities_score = (row.activities / (max_activities || 1)) || 0;
            const interactions_score = (row.interactions / (max_interactions || 1)) || 0;
            const responsiveness_score = (row.responsiveness / (max_responsiveness || 1)) || 0;

            // Hitung bobot
            const followers_bobot = followers_score * 2;
            const activities_bobot = activities_score * 2;
            const interactions_bobot = interactions_score * 3;
            const responsiveness_bobot = responsiveness_score * 1;

            // Hitung FAIR Score
            const fair_score = ((followers_bobot + activities_bobot + interactions_bobot + responsiveness_bobot) / 8) * 100;

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
        UPDATE fairScoresDaily
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
