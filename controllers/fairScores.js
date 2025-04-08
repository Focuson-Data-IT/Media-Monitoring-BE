const connection = require('../models/db');

const getDaysDiff = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
};

const processDataFair = async (startDate, endDate, kategori, platform) => {
    console.info(`[INFO] Processing FAIR Score as JSON from ${startDate} to ${endDate} for kategori "${kategori}" & platform "${platform}"`);

    const totalDays = getDaysDiff(startDate, endDate);
    const finalDate = new Date(endDate).toISOString().split('T')[0];

    const rows = await getCombinedMonthlyData(startDate, endDate, totalDays, kategori, platform);
    if (rows.length === 0) {
        console.warn(`[WARN] No data found in that period.`);
        return [];
    }

    const max = {
        followers: Math.max(...rows.map(r => r.followers || 0)),
        activities: Math.max(...rows.map(r => r.activities || 0)),
        interactions: Math.max(...rows.map(r => r.interactions || 0)),
        responsiveness: Math.max(...rows.map(r => r.responsiveness || 0)),
    };

    const result = rows.map(row => {
        const followers_score = (row.followers / (max.followers || 1)) || 0;
        const activities_score = (row.activities / (max.activities || 1)) || 0;
        const interactions_score = (row.interactions / (max.interactions || 1)) || 0;
        const responsiveness_score = (row.responsiveness / (max.responsiveness || 1)) || 0;

        const fair_score = ((followers_score * 2 + activities_score * 2 + interactions_score * 3 + responsiveness_score * 1) / 8) * 100;

        return {
            list_id: row.list_id,
            client_account: row.client_account,
            kategori: row.kategori,
            platform: row.platform,
            username: row.username,
            date: finalDate,

            followers: row.followers || 0,
            activities: row.activities || 0,
            nilai_aktifitas: row.nilai_aktifitas || 0,
            interactions: row.interactions || 0,
            responsiveness: row.responsiveness || 0,

            followers_score,
            followers_bobot: followers_score * 2,
            activities_score,
            activities_bobot: activities_score * 2,
            interactions_score,
            interactions_bobot: interactions_score * 3,
            responsiveness_score,
            responsiveness_bobot: responsiveness_score * 1,

            fair_score: parseFloat(fair_score.toFixed(2))
        };
    });

    return result;
};

const getCombinedMonthlyData = async (startDate, endDate, totalDays, kategori, platform) => {
    const query = `
        SELECT 
            la.list_id, la.client_account, la.kategori, la.platform, la.username,

            (
                SELECT followers
                FROM posts p
                WHERE p.username = la.username
                  AND p.platform = la.platform
                  AND DATE(p.created_at) <= ?
                ORDER BY p.created_at DESC
                LIMIT 1
            ) AS followers,

            (
                SELECT COUNT(*)
                FROM posts p
                WHERE FIND_IN_SET(?, p.kategori)
                  AND p.platform = la.platform
                  AND p.username = la.username
                  AND DATE(p.created_at) BETWEEN ? AND ?
            ) / ? AS activities,

            (
                SELECT COUNT(*)
                FROM posts p
                WHERE FIND_IN_SET(?, p.kategori)
                  AND p.platform = la.platform
                  AND p.username = la.username
                  AND DATE(p.created_at) BETWEEN ? AND ?
            ) AS nilai_aktifitas,

            (
                SELECT SUM(likes)
                FROM posts p
                WHERE FIND_IN_SET(?, p.kategori)
                  AND p.platform = la.platform
                  AND p.username = la.username
                  AND DATE(p.created_at) BETWEEN ? AND ?
            ) /
            (
                SELECT COUNT(*)
                FROM posts p
                WHERE FIND_IN_SET(?, p.kategori)
                  AND p.platform = la.platform
                  AND p.username = la.username
                  AND DATE(p.created_at) BETWEEN ? AND ?
            ) AS interactions,

            (
                SELECT 
                    COALESCE(reply_count, 0) / NULLIF(COALESCE(incoming_count, 1), 0) * 100
                FROM (
                    SELECT 
                        COUNT(DISTINCT mc.comment_unique_id) + COUNT(DISTINCT cc.child_comment_unique_id) AS incoming_count,

                        (
                            SELECT COUNT(*)
                            FROM mainComments mc_reply
                            WHERE mc_reply.commenter_username = la.username
                        ) +
                        (
                            SELECT COUNT(*)
                            FROM childComments cc_reply
                            WHERE cc_reply.child_commenter_username = la.username
                        ) AS reply_count
                    FROM posts p
                    LEFT JOIN mainComments mc ON mc.unique_id_post = p.unique_id_post
                    LEFT JOIN childComments cc ON cc.unique_id_post = p.unique_id_post
                    WHERE FIND_IN_SET(?, p.kategori)
                      AND p.platform = la.platform
                      AND p.username = la.username
                      AND DATE(p.created_at) BETWEEN ? AND ?
                ) AS comment_summary
            ) AS responsiveness

        FROM listAkun la
        WHERE la.kategori = ? AND la.platform = ?
    `;

    const [data] = await connection.query(query, [
        endDate,
        kategori, startDate, endDate, totalDays,
        kategori, startDate, endDate,
        kategori, startDate, endDate,
        kategori, startDate, endDate,
        kategori, startDate, endDate,
        kategori, platform
    ]);

    return data;
};

module.exports = { processDataFair };
