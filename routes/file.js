const express = require('express');
const db = require('../models/db');
const ExcelJS = require('exceljs');
const moment = require('moment-timezone');

const router = express.Router();

router.post('/exportPosts', async (req, res) => {
    try {
        const { kategori, platform, start_date, end_date, username } = req.body;

        if (!kategori || !platform || !start_date || !end_date) {
            return res.status(400).json({ message: "Kategori, platform, start_date, dan end_date wajib diisi." });
        }

        console.info("Received Export Request: ", { kategori, platform, start_date, end_date, username });

        // 1️⃣ **Hitung total data**
        const countQuery = `
            SELECT COUNT(*) AS total
            FROM posts
            WHERE FIND_IN_SET(?, kategori)
                AND platform = ?
                AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)
                ${username ? "AND username = ?" : ""}
        `;

        const queryParams = [kategori, platform, start_date, end_date];
        if (username) queryParams.push(username); // Tambahkan username jika ada

        const [countRows] = await db.query(countQuery, queryParams);
        const total = countRows[0].total;

        if (total === 0) {
            return res.status(404).json({ message: "No data found for export." });
        }

        // 2️⃣ **Hitung Persentil 10% & 90%**
        const percentileQuery = `
            WITH ordered AS (
                SELECT performa_konten,
                    ROW_NUMBER() OVER (ORDER BY performa_konten) AS row_num,
                    COUNT(*) OVER () AS total_rows
                FROM posts
                WHERE FIND_IN_SET(?, kategori)
                    AND platform = ?
                    AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)
                    ${username ? "AND username = ?" : ""}
            ),
            positions AS (
                SELECT 
                    ((0.1 * (total_rows + 1))) AS pos_10,
                    ((0.9 * (total_rows + 1))) AS pos_90
                FROM ordered
                LIMIT 1
            ),
            percentile_10_calc AS (
                SELECT performa_konten AS percentile_10
                FROM ordered, positions
                WHERE row_num = FLOOR(pos_10)
                LIMIT 1
            ),
            percentile_90_calc AS (
                SELECT performa_konten AS percentile_90
                FROM ordered, positions
                WHERE row_num = FLOOR(pos_90)
                LIMIT 1
            )
            SELECT p10.percentile_10, p90.percentile_90
            FROM percentile_10_calc p10
            CROSS JOIN percentile_90_calc p90;
        `;

        const [percentileRows] = await db.query(percentileQuery, queryParams);
        const percentile10 = percentileRows[0]?.percentile_10 || 0;
        const percentile90 = percentileRows[0]?.percentile_90 || 0;

        console.info(`Calculated Percentiles: 10% = ${percentile10}, 90% = ${percentile90}`);

        // 3️⃣ **Ambil Semua Data dari Database**
        const dataQuery = `
            SELECT * 
            FROM posts
            WHERE FIND_IN_SET(?, kategori)
                AND platform = ?
                AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)
                ${username ? "AND username = ?" : ""}
        `;

        const [dataRows] = await db.query(dataQuery, queryParams);

        // 4️⃣ **Buat File Excel**
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Posts Data");

        // **Header Kolom**
        worksheet.columns = [
            { header: "Username", key: "username", width: 20 },
            { header: "Created At", key: "created_at", width: 15 },
            { header: "Link", key: "link", width: 15 },
            { header: "Title", key: "title", width: 20 },
            { header: "Caption", key: "caption", width: 20 },
            { header: "Followers", key: "followers", width: 10 },
            { header: "Following", key: "following", width: 10 },
            { header: "Likes", key: "likes", width: 10 },
            { header: "Comments", key: "comments", width: 10 },
            { header: "Play Count", key: "playCount", width: 10 },
            { header: "Share Count", key: "shareCount", width: 10 },
            { header: "Collect Count", key: "collectCount", width: 10 },
            { header: "Download Count", key: "downloadCount", width: 10 },
            { header: "Content Type", key: "media_name", width: 10 },
            { header: "Performance Score", key: "performa_konten", width: 15 },
            { header: "Percentile 10%", key: "percentile_10", width: 15 },
            { header: "Percentile 90%", key: "percentile_90", width: 15 }
        ];

        // **Masukkan Data ke dalam Excel**
        dataRows.forEach(row => {
            let platformLink = "";
        
            // Cek platform dan buat link sesuai format masing-masing
            switch (row.platform) {
                case "TikTok":
                    platformLink = `https://www.tiktok.com/@${row.username}/video/${row.unique_id_post}`;
                    break;
                case "Instagram":
                    if (row.media_name === "reel") {
                        platformLink = `https://www.instagram.com/reel/${row.post_code}`;
                    } else {
                        platformLink = `https://www.instagram.com/p/${row.post_code}`;
                    }
                    break;
                case "Facebook":
                    platformLink = `https://www.facebook.com/${row.username}/posts/${row.unique_id_post}`;
                    break;
                case "Youtube":
                    platformLink = `https://www.youtube.com/watch?v=${row.unique_id_post}`;
                    break;
                default:
                    platformLink = ""; // Jika platform tidak dikenali, kosongkan link
            }
        
            // Tambahkan data ke worksheet
            worksheet.addRow({
                platform: row.platform, // Tambahkan platform sebagai kolom
                username: row.username,
                created_at: moment(row.created_at).tz("Asia/Jakarta").format("YYYY-MM-DD"),
                link: platformLink,  // Gunakan link yang sudah diformat sesuai platform
                title: row.title,
                caption: row.caption,
                followers: row.followers,
                following: row.following,
                likes: row.likes,
                comments: row.comments,
                playCount: row.playCount,
                shareCount: row.shareCount,
                collectCount: row.collectCount,
                downloadCount: row.downloadCount,
                media_name: row.media_name,
                performa_konten: row.performa_konten,
                percentile_10: percentile10, // Kolom tambahan
                percentile_90: percentile90  // Kolom tambahan
            });
        });        

        // **Gaya Header**
        worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
        worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F81BD" } };
        worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

        const filename = username && username.trim()
            ? `posts_data_${username}_on_${kategori}_${platform}_${start_date}_to_${end_date}.xlsx`
            : `posts_data_${kategori}_${platform}_${start_date}_to_${end_date}.xlsx`;

        // 5️⃣ **Kirim File Excel ke User**
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);

        await workbook.xlsx.write(res);
        res.end();

        console.info("Excel file successfully generated and sent.");
    } catch (error) {
        console.error("Error exporting posts:", error);
        res.status(500).json({ code: 500, status: "ERROR", message: "Failed to export posts" });
    }
});

// router.post('/exportFair', async (req, res) => {
//     try {
//         const { kategori, platform, start_date, end_date, username } = req.body;

//         if (!kategori || !platform || !start_date || !end_date) {
//             return res.status(400).json({ message: "Kategori, platform, start_date, dan end_date wajib diisi." });
//         }

//         console.info("[INFO] Received Export Request: ", { kategori, platform, start_date, end_date, username });

//         // 1️⃣ **Hitung total data**
//         const countQuery = `
//             SELECT COUNT(*) AS total
//             FROM fairScoresMonthly
//             WHERE kategori = ?
//                 AND platform = ?
//                 AND DATE(date) BETWEEN DATE(?) AND DATE(?)
//                 ${username ? "AND username = ?" : ""}
//         `;

//         const queryParams = [kategori, platform, start_date, end_date];
//         if (username) queryParams.push(username);

//         const [countRows] = await db.query(countQuery, queryParams);
//         const total = countRows[0].total || 0;

//         if (total === 0) {
//             console.warn(`[WARN] No data found for kategori: ${kategori}, platform: ${platform}, date range: ${start_date} to ${end_date}`);
//             return res.status(404).json({ message: "No data found for export." });
//         }

//         console.info(`[INFO] Found ${total} records for export.`);

//         // 2️⃣ **Ambil Semua Data dari Database**
//         const dataQuery = `
//             SELECT * 
//             FROM fairScoresMonthly
//             WHERE kategori = ?
//                 AND platform = ?
//                 AND DATE(date) BETWEEN DATE(?) AND DATE(?)
//                 ${username ? "AND username = ?" : ""}
//         `;

//         const [dataRows] = await db.query(dataQuery, queryParams);

//         // 3️⃣ **Buat File Excel**
//         const workbook = new ExcelJS.Workbook();
//         const worksheet = workbook.addWorksheet("Fair Scores");

//         // **Header Kolom**
//         worksheet.columns = [
//             { header: "Username", key: "username", width: 20 },
//             { header: "Date", key: "date", width: 15 },
//             { header: "Followers", key: "followers", width: 10 },
//             { header: "Followers Score", key: "followers_score", width: 10 },
//             { header: "Activities", key: "activities", width: 10 },
//             { header: "Activities Score", key: "activities_score", width: 10 },
//             { header: "Interactions", key: "interactions", width: 10 },
//             { header: "Interactions Score", key: "interactions_score", width: 10 },
//             { header: "Responsiveness", key: "responsiveness", width: 10 },
//             { header: "Responsiveness Score", key: "responsiveness_score", width: 10 },
//             { header: "Fair Score", key: "fair_score", width: 10 }
//         ];

//         // **Masukkan Data ke dalam Excel**
//         dataRows.forEach(row => {
//             worksheet.addRow({
//                 username: row.username,
//                 date: moment(row.date).tz("Asia/Jakarta").format("YYYY-MM-DD"),
//                 followers: row.followers,
//                 followers_score: row.followers_score,
//                 activities: row.activities,
//                 activities_score: row.activities_score,
//                 interactions: row.interactions,
//                 interactions_score: row.interactions_score,
//                 responsiveness: row.responsiveness,
//                 responsiveness_score: row.responsiveness_score,
//                 fair_score: row.fair_score
//             });
//         });

//         console.info(`[INFO] Inserted ${dataRows.length} rows into Excel file.`);

//         // **Gaya Header**
//         worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
//         worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F81BD" } };
//         worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

//         // **Buat Nama File Dinamis**
//         const filename = username && username.trim()
//             ? `fair_data_${username}_on_${kategori}_${platform}_${start_date}_to_${end_date}.xlsx`
//             : `fair_data_${kategori}_${platform}_${start_date}_to_${end_date}.xlsx`;

//         console.info(`[INFO] Generating file: ${filename}`);

//         // 4️⃣ **Kirim File Excel ke User**
//         res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
//         res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
//         res.setHeader("Access-Control-Expose-Headers", "Content-Disposition");

//         await workbook.xlsx.write(res);
//         res.end();

//         console.info(`[SUCCESS] Excel file for kategori ${kategori} successfully generated and sent.`);
//     } catch (error) {
//         console.error("[ERROR] Failed to export fair:", error);
//         res.status(500).json({ code: 500, status: "ERROR", message: "Failed to export fair", error: error.message });
//     }
// });

router.post('/exportFair', async (req, res) => {
    try {
        const { kategori, platform, start_date, end_date, username } = req.body;

        if (!kategori || !platform || !start_date || !end_date) {
            return res.status(400).json({ message: "Kategori, platform, start_date, dan end_date wajib diisi." });
        }

        console.info("[INFO] Received Export Request: ", { kategori, platform, start_date, end_date, username });

        // **Ambil Semua Data dari Database**
        const dataQuery = `
            SELECT * 
            FROM fairScoresMonthly
            WHERE kategori = ?
                AND platform = ?
                AND date = ?
                ${username ? "AND username = ?" : ""}
        `;

        const queryParams = [kategori, platform, end_date];
        if (username) queryParams.push(username);

        const [dataRows] = await db.query(dataQuery, queryParams);

        if (dataRows.length === 0) {
            return res.status(404).json({ message: "No data found for export." });
        }

        console.info(`[INFO] Found ${dataRows.length} records for export.`);

        // Kirim data dalam format JSON ke frontend
        return res.json({
            status: "success",
            total: dataRows.length,
            data: dataRows,
        });

    } catch (error) {
        console.error("[ERROR] Failed to export fair:", error);
        res.status(500).json({ code: 500, status: "ERROR", message: "Failed to export fair", error: error.message });
    }
});

module.exports = router;
