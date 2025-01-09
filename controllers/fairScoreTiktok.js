const connection = require('../models/db');

// Ambil semua data yang diperlukan dalam satu batch query
const getDataForBatchProcessing = async (date) => {
    const [data] = await connection.query(`
        SELECT 
            dfs.list_id, dfs.client_account, dfs.kategori, dfs.platform, dfs.username, dfs.date,
            u.followers,
            (
                SELECT COUNT(*) 
                FROM posts p 
                WHERE p.client_account = dfs.client_account 
                    AND p.kategori = dfs.kategori 
                    AND p.platform = dfs.platform 
                    AND p.username = dfs.username 
                    AND DATE(p.created_at) = dfs.date
            ) AS activities,
            (
                SELECT AVG(p.likes) 
                FROM posts p 
                WHERE p.client_account = dfs.client_account 
                    AND p.kategori = dfs.kategori 
                    AND p.platform = dfs.platform 
                    AND p.username = dfs.username 
                    AND DATE(p.created_at) = dfs.date
            ) AS interactions,
            (
                SELECT CASE 
                    WHEN COALESCE(SUM(
                        (SELECT COUNT(*) FROM mainComments mc WHERE mc.unique_id_post = p.unique_id_post) +
                        (SELECT COUNT(*) FROM childComments cc WHERE cc.unique_id_post = p.unique_id_post)
                    ), 0) - COALESCE(SUM(
                        (SELECT COUNT(*) FROM mainComments mc WHERE mc.commenter_username = dfs.username AND mc.unique_id_post = p.unique_id_post) +
                        (SELECT COUNT(*) FROM childComments cc WHERE cc.child_commenter_username = dfs.username AND cc.unique_id_post = p.unique_id_post)
                    ), 0) > 0
                    THEN COALESCE(SUM(
                        (SELECT COUNT(*) FROM mainComments mc WHERE mc.commenter_username = dfs.username AND mc.unique_id_post = p.unique_id_post) +
                        (SELECT COUNT(*) FROM childComments cc WHERE cc.child_commenter_username = dfs.username AND cc.unique_id_post = p.unique_id_post)
                    ), 0) / (
                        COALESCE(SUM(
                            (SELECT COUNT(*) FROM mainComments mc WHERE mc.unique_id_post = p.unique_id_post) +
                            (SELECT COUNT(*) FROM childComments cc WHERE cc.unique_id_post = p.unique_id_post)
                        ), 0) - COALESCE(SUM(
                            (SELECT COUNT(*) FROM mainComments mc WHERE mc.commenter_username = dfs.username AND mc.unique_id_post = p.unique_id_post) +
                            (SELECT COUNT(*) FROM childComments cc WHERE cc.child_commenter_username = dfs.username AND cc.unique_id_post = p.unique_id_post)
                        ), 0)
                    )
                    ELSE 0
                END 
                FROM posts p 
                WHERE p.client_account = dfs.client_account 
                    AND p.kategori = dfs.kategori 
                    AND p.platform = dfs.platform 
                    AND p.username = dfs.username 
                    AND DATE(p.created_at) = dfs.date
            ) AS responsiveness
        FROM dailyFairScores dfs
        LEFT JOIN users u ON u.username = dfs.username
        WHERE dfs.date = ?
    `, [date]);
    return data;
};

// Proses batch untuk satu tanggal
const processBatchForDate = async (date) => {
    const rows = await getDataForBatchProcessing(date);
    console.log(`Processing ${rows.length} rows for date ${date}`);

    const updates = [];

    // Hitung nilai berdasarkan data dalam grup yang sama
    const groupedData = rows.reduce((acc, row) => {
        const key = `${row.client_account}-${row.kategori}-${row.platform}-${row.date}`;
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(row);
        return acc;
    }, {});

    for (const groupKey in groupedData) {
        const groupRows = groupedData[groupKey];
        const maxFollowers = Math.max(...groupRows.map(r => r.followers || 1));
        const maxActivities = Math.max(...groupRows.map(r => r.activities || 1));
        const maxInteractions = Math.max(...groupRows.map(r => r.interactions || 1));
        const maxResponsiveness = Math.max(...groupRows.map(r => r.responsiveness || 1));

        for (const row of groupRows) {
            const { list_id, client_account, kategori, platform, username } = row;

            // Perhitungan followers
            const followers = row.followers || 0;
            const followers_score = maxFollowers > 0 ? followers / maxFollowers : 0;
            const followers_bobot = followers_score * 2;

            // Perhitungan activities
            const activities = row.activities || 0;
            const activities_score = maxActivities > 0 ? activities / maxActivities : 0;
            const activities_bobot = activities_score * 2;

            // Perhitungan interaction
            const interactions = row.interactions || 0;
            const interactions_score = maxInteractions > 0 ? interactions / maxInteractions : 0;
            const interactions_bobot = interactions_score * 3;

            // Perhitungan responsiveness
            const responsiveness = row.responsiveness || 0;
            const responsiveness_score = maxResponsiveness > 0 ? responsiveness / maxResponsiveness : 0;
            const responsiveness_bobot = responsiveness_score * 1;

            // Perhitungan fair_score
            const fair_score = ((followers_bobot + activities_bobot + interactions_bobot + responsiveness_bobot) / 8) * 100;

            // Simpan hasil ke dalam batch update
            updates.push([
                followers, followers_score, followers_bobot,
                activities, activities_score, activities_bobot,
                interactions, interactions_score, interactions_bobot,
                responsiveness, responsiveness_score, responsiveness_bobot,
                fair_score,
                list_id, client_account, kategori, platform, username, date
            ]);
        }
    }

    // Lakukan batch update
    await batchUpdateDailyFairScores(updates);
};

// Batch update ke database
const batchUpdateDailyFairScores = async (updates) => {
    const updateSql = `
        INSERT INTO dailyFairScores (
            followers, followers_score, followers_bobot,
            activities, activities_score, activities_bobot,
            interactions, interactions_score, interactions_bobot,
            responsiveness, responsiveness_score, responsiveness_bobot,
            fair_score,
            list_id, client_account, kategori, platform, username, date
        ) VALUES ?
        ON DUPLICATE KEY UPDATE
            followers = IFNULL(VALUES(followers), followers),
            followers_score = IFNULL(VALUES(followers_score), followers_score),
            followers_bobot = IFNULL(VALUES(followers_bobot), followers_bobot),
            activities = IFNULL(VALUES(activities), activities),
            activities_score = IFNULL(VALUES(activities_score), activities_score),
            activities_bobot = IFNULL(VALUES(activities_bobot), activities_bobot),
            interactions = IFNULL(VALUES(interactions), interactions),
            interactions_score = IFNULL(VALUES(interactions_score), interactions_score),
            interactions_bobot = IFNULL(VALUES(interactions_bobot), interactions_bobot),
            responsiveness = IFNULL(VALUES(responsiveness), responsiveness),
            responsiveness_score = IFNULL(VALUES(responsiveness_score), responsiveness_score),
            responsiveness_bobot = IFNULL(VALUES(responsiveness_bobot), responsiveness_bobot),
            fair_score = IFNULL(VALUES(fair_score), fair_score)
    `;
    await connection.query(updateSql, [updates]);
    console.log(`Batch updated ${updates.length} rows.`);
};

// Proses data untuk semua tanggal
const processData = async () => {
    try {
        const [dates] = await connection.query(`
            SELECT DISTINCT date
            FROM dailyFairScores
            ORDER BY date
        `);

        console.log(`Found ${dates.length} unique dates to process.`);

        for (const { date } of dates) {
            await processBatchForDate(date);
        }

        console.log('All data processed successfully.');
    } catch (error) {
        console.error("Error processing data:", error.message);
    }
};

module.exports = {
    processData,
};