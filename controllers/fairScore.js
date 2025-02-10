const connection = require('../models/db');

// Ambil semua data yang diperlukan dalam satu batch query
const getDataForBatchProcessing = async (date) => {
    const query = `
        SELECT 
            dfs.list_id, dfs.client_account, dfs.kategori, dfs.platform, dfs.username, dfs.date,
            COALESCE(u.followers, 0) AS followers, dfs.is_render,
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
                SELECT AVG(COALESCE(p.likes, 0)) 
                FROM posts p 
                WHERE p.client_account = dfs.client_account 
                    AND p.kategori = dfs.kategori 
                    AND p.platform = dfs.platform 
                    AND p.username = dfs.username 
                    AND DATE(p.created_at) = dfs.date
            ) AS interactions,
            (
                SELECT 
                    CASE 
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
    `;

    const [data] = await connection.query(query, [date]);
    return data;
};

// Proses batch untuk satu tanggal
const processBatchForDate = async (date) => {
    const rows = await getDataForBatchProcessing(date);
    console.log(`Processing ${rows.length} rows for date ${date}`);

    const updates = [];

    // Group data berdasarkan client_account, kategori, platform, dan date
    const groupedData = rows.reduce((acc, row) => {
        const key = `${row.client_account}-${row.kategori}-${row.platform}-${row.date}`;
        if (!acc[key]) acc[key] = [];
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

            const followers_score = maxFollowers > 0 ? (row.followers || 0) / maxFollowers : 0;
            const activities_score = maxActivities > 0 ? (row.activities || 0) / maxActivities : 0;
            const interactions_score = maxInteractions > 0 ? (row.interactions || 0) / maxInteractions : 0;
            const responsiveness_score = maxResponsiveness > 0 ? (row.responsiveness || 0) / maxResponsiveness : 0;

            // Perhitungan fair_score
            const fair_score = ((followers_score * 2) + (activities_score * 2) + (interactions_score * 3) + (responsiveness_score * 1)) / 8 * 100;

            const isRender = row.activities !== 0 && row.interactions !== 0 && row.responsiveness !== 0;

            updates.push([
                row.followers, followers_score, followers_score * 2,
                row.activities, activities_score, activities_score * 2,
                row.interactions, interactions_score, interactions_score * 3,
                row.responsiveness, responsiveness_score, responsiveness_score * 1,
                fair_score,
                list_id, client_account, kategori, platform, username, date, isRender
            ]);
        }
    }

    // Lakukan batch update
    await batchUpdateDailyFairScores(updates);
};

// Batch update ke database dengan progres log
const batchUpdateDailyFairScores = async (updates) => {
    const updateSql = `
        INSERT INTO dailyFairScores (
            followers, followers_score, followers_bobot,
            activities, activities_score, activities_bobot,
            interactions, interactions_score, interactions_bobot,
            responsiveness, responsiveness_score, responsiveness_bobot,
            fair_score,
            list_id, client_account, kategori, platform, username, date, is_render
        ) VALUES ?
        ON DUPLICATE KEY UPDATE
            followers = VALUES(followers),
            followers_score = VALUES(followers_score),
            followers_bobot = VALUES(followers_bobot),
            activities = VALUES(activities),
            activities_score = VALUES(activities_score),
            activities_bobot = VALUES(activities_bobot),
            interactions = VALUES(interactions),
            interactions_score = VALUES(interactions_score),
            interactions_bobot = VALUES(interactions_bobot),
            responsiveness = VALUES(responsiveness),
            responsiveness_score = VALUES(responsiveness_score),
            responsiveness_bobot = VALUES(responsiveness_bobot),
            fair_score = VALUES(fair_score),
            is_render = VALUES(is_render);
    `;

    await connection.query(updateSql, [updates]);
    console.log(`Batch updated ${updates.length} rows.`);
};

// Proses data untuk semua tanggal
const processData = async () => {
    try {
        const [dates] = await connection.query(`
            SELECT DISTINCT date FROM dailyFairScores ORDER BY date
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
