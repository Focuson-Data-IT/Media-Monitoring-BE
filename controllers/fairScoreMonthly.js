// fairScoreMonthlyRefactored.js

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

const getDaysInMonth = (date) => {
    const year = new Date(date).getFullYear();
    const month = new Date(date).getMonth() + 1;
    return new Date(year, month, 0).getDate();
};

const processData = async (startDate, endDate, kategori, platform) => {
    const dates = getDatesInRange(startDate, endDate);
    const chunkSize = 15;

    // console.info(`[INFO] Monthly Starting processing for ${dates.length} dates with chunk size ${chunkSize}`);

    for (let i = 0; i < dates.length; i += chunkSize) {
        const chunk = dates.slice(i, i + chunkSize);
        // console.info(`[INFO] Monthly Processing date chunk: ${chunk.join(', ')}`);

        // Jalankan 5 tanggal paralel sekaligus
        await Promise.all(
            chunk.map(date => processSingleDate(date, kategori, platform))
        );

        // console.info(`[SUCCESS] Monthly Completed chunk: ${chunk.join(', ')}`);
    }

    console.info(`[DONE] Monthly All dates processed.`);
};

const processSingleDate = async (date, kategori, platform) => {
    // console.info(`\n[INFO] Monthly Processing ${date} for kategori: ${kategori}, platform: ${platform}`);
    await processMonthlyFollowers(date, kategori, platform);
    await processMonthlyActivities(date, kategori, platform);
    await processMonthlyInteractions(date, kategori, platform);
    await processMonthlyResponsiveness(date, kategori, platform);
    await processMonthlyFairScore(date, kategori, platform);
};

const processMonthlyFollowers = async (date, kategori, platform) => {
    // console.info(`[INFO] Monthly Processing followers for ${date}`);
    const [rows] = await connection.query(`
        SELECT fsm.list_id, fsm.username,
            (SELECT followers FROM posts p 
             WHERE p.username = fsm.username AND p.platform = ?
               AND DATE(p.created_at) <= fsm.date
             ORDER BY p.created_at DESC LIMIT 1) AS followers
        FROM fairScoresMonthly fsm
        WHERE fsm.date = ? AND fsm.kategori = ? AND fsm.platform = ?
    `, [platform, date, kategori, platform]);

    const updates = rows.map(row => [row.followers || 0, row.list_id, date, kategori, platform]);

    if (updates.length) {
        await Promise.all(updates.map(update =>
            connection.query(`
                UPDATE fairScoresMonthly 
                SET followers = ? 
                WHERE list_id = ? AND date = ? AND kategori = ? AND platform = ?
            `, update)
        ));
        // console.info(`[SUCCESS] Monthly Updated followers for ${updates.length} rows.`);
    } else {
        console.warn('[WARN] Monthly No rows found to update followers.');
    }
};

const processMonthlyActivities = async (date, kategori, platform) => {
    // console.info(`[INFO] Monthly Processing activities for ${date}`);
    const daysInMonth = getDaysInMonth(date);

    const [rows] = await connection.query(`
        SELECT fsm.list_id, fsm.username,
            (SELECT COUNT(*) FROM posts p 
             WHERE FIND_IN_SET(?, p.kategori)
               AND p.platform = ?
               AND p.username = fsm.username
               AND DATE(p.created_at) BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND ?
            ) / ? AS activities
        FROM fairScoresMonthly fsm
        WHERE fsm.date = ? AND fsm.kategori = ? AND fsm.platform = ?
    `, [kategori, platform, date, date, daysInMonth, date, kategori, platform]);

    const updates = rows.map(row => [row.activities || 0, row.list_id, date, kategori, platform]);

    if (updates.length) {
        await Promise.all(updates.map(update =>
            connection.query(`
                UPDATE fairScoresMonthly 
                SET activities = ? 
                WHERE list_id = ? AND date = ? AND kategori = ? AND platform = ?
            `, update)
        ));
        // console.info(`[SUCCESS] Monthly Updated activities for ${updates.length} rows.`);
    } else {
        console.warn('[WARN] Monthly No rows found to update activities.');
    }
};

const processMonthlyInteractions = async (date, kategori, platform) => {
    // console.info(`[INFO] Monthly Processing interactions for ${date}`);
    const [rows] = await connection.query(`
        SELECT fsm.list_id, fsm.username,
            (SELECT SUM(likes) FROM posts p 
             WHERE FIND_IN_SET(?, p.kategori)
               AND p.platform = ? AND p.username = fsm.username
               AND DATE(p.created_at) BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND ?) /
            (SELECT COUNT(*) FROM posts p 
             WHERE FIND_IN_SET(?, p.kategori)
               AND p.platform = ? AND p.username = fsm.username
               AND DATE(p.created_at) BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND ?) AS interactions
        FROM fairScoresMonthly fsm
        WHERE fsm.date = ? AND fsm.kategori = ? AND fsm.platform = ?
    `, [
        kategori, platform, date, date,
        kategori, platform, date, date,
        date, kategori, platform
    ]);

    const updates = rows.map(row => [row.interactions || 0, row.list_id, date, kategori, platform]);

    if (updates.length) {
        await Promise.all(updates.map(update =>
            connection.query(`
                UPDATE fairScoresMonthly 
                SET interactions = ? 
                WHERE list_id = ? AND date = ? AND kategori = ? AND platform = ?
            `, update)
        ));
        // console.info(`[SUCCESS] Monthly Updated interactions for ${updates.length} rows.`);
    } else {
        console.warn('[WARN] Monthly No rows found to update interactions.');
    }
};

const processMonthlyResponsiveness = async (date, kategori, platform) => {
    // console.info(`[INFO] Monthly Processing responsiveness (from posts.responsiveness_post) for ${date}`);
    const [rows] = await connection.query(`
        SELECT fsm.list_id, fsm.username,
            (
                SELECT AVG(p.responsiveness_post)
                FROM posts p
                WHERE FIND_IN_SET(?, p.kategori)
                  AND p.platform = ?
                  AND p.username = fsm.username
                  AND DATE(p.created_at) BETWEEN DATE_FORMAT(?, '%Y-%m-01') AND ?
                  AND p.responsiveness_post IS NOT NULL
            ) AS responsiveness
        FROM fairScoresMonthly fsm
        WHERE fsm.date = ? AND fsm.kategori = ? AND fsm.platform = ?
    `, [kategori, platform, date, date, date, kategori, platform]);

    const updates = rows.map(row => [
        row.responsiveness || 0,
        row.list_id, date, kategori, platform
    ]);

    if (updates.length) {
        await Promise.all(updates.map(update =>
            connection.query(`
                UPDATE fairScoresMonthly 
                SET responsiveness = ? 
                WHERE list_id = ? AND date = ? AND kategori = ? AND platform = ?
            `, update)
        ));
        // console.info(`[SUCCESS] Monthly responsiveness updated from posts.responsiveness_post for ${updates.length} rows.`);
    } else {
        console.warn('[WARN] No rows found to update monthly responsiveness.');
    }
};

const processMonthlyFairScore = async (date, kategori, platform) => {
    // console.info(`[INFO] Monthly Calculating final FAIR score for ${date}`);
    const [maxValues] = await connection.query(`
        SELECT MAX(followers) AS max_followers,
               MAX(activities) AS max_activities,
               MAX(interactions) AS max_interactions,
               MAX(responsiveness) AS max_responsiveness
        FROM fairScoresMonthly
        WHERE date = ? AND kategori = ? AND platform = ?
    `, [date, kategori, platform]);

    const max = maxValues[0];

    if (!max || Object.values(max).every(v => v === null)) {
        console.warn('[WARN] Monthly No max values found for FAIR score calculation.');
        return;
    }

    const [rows] = await connection.query(`
        SELECT list_id, followers, activities, interactions, responsiveness
        FROM fairScoresMonthly
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
                UPDATE fairScoresMonthly
                SET 
                    followers_score = ?, followers_bobot = ?,
                    activities_score = ?, activities_bobot = ?,
                    interactions_score = ?, interactions_bobot = ?,
                    responsiveness_score = ?, responsiveness_bobot = ?,
                    fair_score = ?
                WHERE list_id = ? AND date = ? AND kategori = ? AND platform = ?
            `, update)
        ));
        // console.info(`[SUCCESS] Monthly Final FAIR scores updated for ${kategori} on platform ${platform}.`);
    } else {
        console.warn('[WARN] Monthly No rows found for final FAIR score update.');
    }
};

module.exports = { processData };
