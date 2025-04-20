const connection = require('../models/db');

const getDatesInRange = (startDate, endDate) => {
    const dates = [];
    let currentDate = new Date(startDate);
    while (currentDate <= new Date(endDate)) {
        dates.push(new Date(currentDate).toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
    }
    return dates;
};

const processData = async (startDate, endDate, kategori, platform) => {
    const dates = getDatesInRange(startDate, endDate);
    const chunkSize = 15;

    // console.info(`[INFO] Starting Daily processing for ${dates.length} dates with chunk size ${chunkSize}`);

    for (let i = 0; i < dates.length; i += chunkSize) {
        const chunk = dates.slice(i, i + chunkSize);
        // console.info(`[INFO] Processing date chunk: ${chunk.join(', ')}`);

        // Jalankan 5 tanggal paralel sekaligus
        await Promise.all(
            chunk.map(date => processSingleDate(date, kategori, platform))
        );

        // console.info(`[SUCCESS] Daily Completed chunk: ${chunk.join(', ')}`);
    }

    console.info(`[DONE] Daily All dates processed.`);
};

const processSingleDate = async (date, kategori, platform) => {
    // console.info(`\n[INFO] Daily Processing ${date} for kategori: ${kategori}, platform: ${platform}`);
    await processFollowers(date, kategori, platform);
    await processActivities(date, kategori, platform);
    await processInteractions(date, kategori, platform);
    await processResponsiveness(date, kategori, platform);
    await processFinalFairScore(date, kategori, platform);
};

const processFollowers = async (date, kategori, platform) => {
    // console.info(`[INFO] Daily Processing followers for ${date}`);
    const [rows] = await connection.query(`
        SELECT fsd.list_id, fsd.username, fsd.date,
            (SELECT followers FROM posts p 
             WHERE p.username = fsd.username 
               AND p.platform = ?
               AND DATE(p.created_at) <= fsd.date
             ORDER BY p.created_at DESC LIMIT 1) AS followers
        FROM fairScoresDaily fsd
        WHERE fsd.date = ? AND fsd.kategori = ? AND fsd.platform = ?
    `, [platform, date, kategori, platform]);

    const updates = rows.map(row => [row.followers || 0, row.list_id, date, kategori, platform]);
    if (updates.length) {
        await Promise.all(updates.map(update =>
            connection.query(`
                UPDATE fairScoresDaily 
                SET followers = ? 
                WHERE list_id = ? AND date = ? AND kategori = ? AND platform = ?
            `, update)
        ));
        // console.info(`[SUCCESS] Daily Updated followers for ${updates.length} rows.`);
    } else {
        console.warn('[WARN] Daily No rows found to update followers.');
    }
};

const processActivities = async (date, kategori, platform) => {
    // console.info(`[INFO] Daily Processing activities for ${date}`);
    const [rows] = await connection.query(`
        SELECT fsd.list_id, fsd.username,
            (SELECT COUNT(*) FROM posts p 
             WHERE FIND_IN_SET(?, p.kategori)
               AND p.platform = ?
               AND p.username = fsd.username
               AND DATE(p.created_at) = fsd.date) AS activities
        FROM fairScoresDaily fsd
        WHERE fsd.date = ? AND fsd.kategori = ? AND fsd.platform = ?
    `, [kategori, platform, date, kategori, platform]);

    const updates = rows.map(row => [row.activities || 0, row.list_id, date, kategori, platform]);
    if (updates.length) {
        await Promise.all(updates.map(update =>
            connection.query(`
                UPDATE fairScoresDaily 
                SET activities = ? 
                WHERE list_id = ? AND date = ? AND kategori = ? AND platform = ?
            `, update)
        ));
        // console.info(`[SUCCESS] Daily Updated activities for ${updates.length} rows.`);
    } else {
        console.warn('[WARN] Daily No rows found to update activities.');
    }
};

const processInteractions = async (date, kategori, platform) => {
    // console.info(`[INFO] Daily Processing interactions for ${date}`);
    const [rows] = await connection.query(`
        SELECT fsd.list_id, fsd.username,
            (SELECT SUM(likes) FROM posts p 
             WHERE FIND_IN_SET(?, p.kategori)
               AND p.platform = ?
               AND p.username = fsd.username
               AND DATE(p.created_at) = fsd.date) / COALESCE(
            (SELECT COUNT(*) FROM posts p 
             WHERE FIND_IN_SET(?, p.kategori)
               AND p.platform = ?
               AND p.username = fsd.username
               AND DATE(p.created_at) = fsd.date), 1) AS interactions
        FROM fairScoresDaily fsd
        WHERE fsd.date = ? AND fsd.kategori = ? AND fsd.platform = ?
    `, [kategori, platform, kategori, platform, date, kategori, platform]);

    const updates = rows.map(row => [row.interactions || 0, row.list_id, date, kategori, platform]);
    if (updates.length) {
        await Promise.all(updates.map(update =>
            connection.query(`
                UPDATE fairScoresDaily 
                SET interactions = ? 
                WHERE list_id = ? AND date = ? AND kategori = ? AND platform = ?
            `, update)
        ));
        // console.info(`[SUCCESS] Daily Updated interactions for ${updates.length} rows.`);
    } else {
        console.warn('[WARN] Daily No rows found to update interactions.');
    }
};

const processResponsiveness = async (date, kategori, platform) => {
    // console.info(`[INFO] Daily Processing responsiveness (from posts.responsiveness_post) for ${date}`);
    const [rows] = await connection.query(`
        SELECT fsd.list_id, fsd.username,
            (
                SELECT AVG(p.responsiveness_post)
                FROM posts p
                WHERE FIND_IN_SET(?, p.kategori)
                  AND p.platform = ?
                  AND p.username = fsd.username
                  AND DATE(p.created_at) = fsd.date
                  AND p.responsiveness_post IS NOT NULL
            ) AS responsiveness
        FROM fairScoresDaily fsd
        WHERE fsd.date = ? AND fsd.kategori = ? AND fsd.platform = ?
    `, [kategori, platform, date, kategori, platform]);

    const updates = rows.map(row => [
        row.responsiveness || 0,
        row.list_id, date, kategori, platform
    ]);

    if (updates.length) {
        await Promise.all(updates.map(update =>
            connection.query(`
                UPDATE fairScoresDaily 
                SET responsiveness = ? 
                WHERE list_id = ? AND date = ? AND kategori = ? AND platform = ?
            `, update)
        ));
        // console.info(`[SUCCESS] Daily responsiveness updated from posts.responsiveness_post for ${updates.length} rows.`);
    } else {
        console.warn('[WARN] No rows found to update responsiveness.');
    }
};

const processFinalFairScore = async (date, kategori, platform) => {
    // console.info(`[INFO] Daily Calculating final FAIR score for ${date}`);
    const [maxValues] = await connection.query(`
        SELECT MAX(followers) AS max_followers,
               MAX(activities) AS max_activities,
               MAX(interactions) AS max_interactions,
               MAX(responsiveness) AS max_responsiveness
        FROM fairScoresDaily
        WHERE date = ? AND kategori = ? AND platform = ?
    `, [date, kategori, platform]);

    const max = maxValues[0];
    if (!max || Object.values(max).every(v => v === null)) {
        console.warn('[WARN] Daily No max values found for FAIR score calculation.');
        return;
    }

    const [rows] = await connection.query(`
        SELECT list_id, followers, activities, interactions, responsiveness
        FROM fairScoresDaily
        WHERE date = ? AND kategori = ? AND platform = ?
    `, [date, kategori, platform]);

    const updates = rows.map(row => {
        const followers_score = (row.followers / (max.max_followers || 1));
        const activities_score = (row.activities / (max.max_activities || 1));
        const interactions_score = (row.interactions / (max.max_interactions || 1));
        const responsiveness_score = (row.responsiveness / (max.max_responsiveness || 1));

        const followers_bobot = followers_score * 2;
        const activities_bobot = activities_score * 2;
        const interactions_bobot = interactions_score * 3;
        const responsiveness_bobot = responsiveness_score * 1;

        const fair_score = ((followers_bobot + activities_bobot + interactions_bobot + responsiveness_bobot) / 8) * 100;

        return [
            followers_score, followers_bobot,
            activities_score, activities_bobot,
            interactions_score, interactions_bobot,
            responsiveness_score, responsiveness_bobot,
            fair_score,
            row.list_id, date, kategori, platform
        ];
    });

    if (updates.length) {
        await Promise.all(updates.map(update =>
            connection.query(`
                UPDATE fairScoresDaily
                SET 
                    followers_score = ?, followers_bobot = ?,
                    activities_score = ?, activities_bobot = ?,
                    interactions_score = ?, interactions_bobot = ?,
                    responsiveness_score = ?, responsiveness_bobot = ?,
                    fair_score = ?
                WHERE list_id = ? AND date = ? AND kategori = ? AND platform = ?
            `, update)
        ));
        // console.info(`[SUCCESS] Daily Final FAIR scores updated for ${kategori} on platform ${platform}.`);
    } else {
        console.warn('[WARN] Daily No rows found for final FAIR score update.');
    }
};

module.exports = { processData };
