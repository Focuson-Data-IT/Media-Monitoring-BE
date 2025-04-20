const express = require('express');
const db = require('../models/db');
const ExcelJS = require('exceljs');
const moment = require('moment-timezone');
const { calculateResponsivenessPerPost } = require('../controllers/calculateResponsivenessPerPost');
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

router.post("/exportAllComments", async (req, res) => {
    try {
        const { kategori, platform, start_date, end_date, username } = req.body;

        if (!kategori || !platform || !start_date || !end_date) {
            return res.status(400).json({ message: "Kategori, platform, start_date, dan end_date wajib diisi." });
        }

        const filters = [kategori, platform, start_date, end_date];
        let usernameClause = "";
        if (username && username.trim()) {
            filters.push(username);
            usernameClause = "AND username = ?";
        }

        // 🚀 Query mainComments
        const [mainRows] = await db.query(`
            SELECT * FROM mainComments
            WHERE FIND_IN_SET(?, kategori)
              AND platform = ?
              AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)
              ${usernameClause}
        `, filters);

        // 🚀 Query childComments
        const [childRows] = await db.query(`
            SELECT * FROM childComments
            WHERE FIND_IN_SET(?, kategori)
              AND platform = ?
              AND DATE(created_at) BETWEEN DATE(?) AND DATE(?)
              ${usernameClause}
        `, filters);

        if (mainRows.length === 0 && childRows.length === 0) {
            return res.status(404).json({ message: "No comments found to export." });
        }

        const workbook = new ExcelJS.Workbook();

        // 📄 Worksheet 1: Main Comments
        const mainSheet = workbook.addWorksheet("Main Comments");
        mainSheet.columns = [
            { header: "Platform", key: "platform", width: 10 },
            { header: "Username", key: "username", width: 20 },
            { header: "Link", key: "link", width: 50 },
            { header: "Commenter", key: "commenter_username", width: 20 },
            { header: "Comment Text", key: "comment_text", width: 40 },
            { header: "Likes", key: "comment_like_count", width: 10 },
            { header: "Date", key: "created_at", width: 20 },
            { header: "Kategori", key: "kategori", width: 15 },
            { header: "Label", key: "label", width: 10 },
            { header: "Sentiment", key: "sentiment", width: 10 },
        ];

        mainRows.forEach(row => {
            let platformLink = "";
            switch (row.platform) {
                case "TikTok":
                    platformLink = `https://www.tiktok.com/@${row.username}/video/${row.unique_id_post}`;
                    break;
                case "Instagram":
                    platformLink = `https://www.instagram.com/p/${row.comment_unique_id}`;
                    break;
                case "Facebook":
                    platformLink = `https://www.facebook.com/${row.username}/posts/${row.unique_id_post}`;
                    break;
                case "Youtube":
                    platformLink = `https://www.youtube.com/watch?v=${row.unique_id_post}`;
                    break;
                default:
                    platformLink = "";
            }

            mainSheet.addRow({
                platform: row.platform,
                username: row.username,
                link: platformLink,
                commenter_username: row.commenter_username,
                comment_text: row.comment_text,
                comment_like_count: row.comment_like_count,
                created_at: moment(row.created_at).tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss"),
                kategori: row.kategori,
                label: row.label,
                sentiment: row.sentiment,
            });
        });

        // 📄 Worksheet 2: Child Comments
        const childSheet = workbook.addWorksheet("Child Comments");
        childSheet.columns = [
            { header: "Platform", key: "platform", width: 10 },
            { header: "Username", key: "username", width: 20 },
            { header: "Link", key: "link", width: 50 },
            { header: "Child Commenter", key: "child_commenter_username", width: 20 },
            { header: "Child Text", key: "child_comment_text", width: 40 },
            { header: "Likes", key: "child_comment_like_count", width: 10 },
            { header: "Date", key: "created_at", width: 20 },
            { header: "Kategori", key: "kategori", width: 15 },
            { header: "Label", key: "label", width: 10 },
            { header: "Sentiment", key: "sentiment", width: 10 },
        ];

        childRows.forEach(row => {
            let platformLink = "";
            switch (row.platform) {
                case "TikTok":
                    platformLink = `https://www.tiktok.com/@${row.username}/video/${row.unique_id_post}`;
                    break;
                case "Instagram":
                    platformLink = `https://www.instagram.com/p/${row.comment_unique_id}`;
                    break;
                case "Facebook":
                    platformLink = `https://www.facebook.com/${row.username}/posts/${row.unique_id_post}`;
                    break;
                case "Youtube":
                    platformLink = `https://www.youtube.com/watch?v=${row.unique_id_post}`;
                    break;
                default:
                    platformLink = "";
            }

            childSheet.addRow({
                platform: row.platform,
                username: row.username,
                link: platformLink,
                child_commenter_username: row.child_commenter_username,
                child_comment_text: row.child_comment_text,
                child_comment_like_count: row.child_comment_like_count,
                created_at: moment(row.created_at).tz("Asia/Jakarta").format("YYYY-MM-DD HH:mm:ss"),
                kategori: row.kategori,
                label: row.label,
                sentiment: row.sentiment,
            });
        });

        // 💾 Save and Send
        const filename = `comments_${kategori}_${platform}_${start_date}_to_${end_date}${username ? `_for_${username}` : ""}.xlsx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
        await workbook.xlsx.write(res);
        res.end();

        console.info("✅ Export berhasil dikirim.");
    } catch (err) {
        console.error("❌ Export error:", err);
        res.status(500).json({ message: "Gagal export komentar." });
    }
});

router.get('/exportFair', async (req, res) => {
    try {
        const { kategori, platform, start_date, end_date } = req.query;

        if (!kategori || !platform || !start_date || !end_date) {
            return res.status(400).json({ message: "Kategori, platform, start_date, dan end_date wajib diisi." });
        }

        console.info("[INFO] Received Export Request: ", { kategori, platform, start_date, end_date });

        // Step 1: Ambil tanggal terakhir dalam rentang tanggal yang dikirim
        const maxDateQuery = `
            SELECT MAX(date) as latest_date
            FROM fairScoresMonthly
            WHERE kategori = ? AND platform = ?
              AND date BETWEEN ? AND ?
        `;

        const [maxDateResult] = await db.query(maxDateQuery, [kategori, platform, start_date, end_date]);

        const latestDate = maxDateResult[0]?.latest_date;

        if (!latestDate) {
            return res.status(404).json({ message: "Tidak ada data yang ditemukan dalam rentang tanggal tersebut." });
        }

        console.info(`[INFO] Latest available date in range: ${latestDate}`);

        // Step 2: Ambil data per username di tanggal tersebut
        const dataQuery = `
            SELECT f.*
            FROM fairScoresMonthly f
            INNER JOIN (
                SELECT username, MAX(date) as latest_date
                FROM fairScoresMonthly
                WHERE kategori = ? AND platform = ? AND date = ?
                GROUP BY username
            ) latest ON f.username = latest.username AND f.date = latest.latest_date
            WHERE f.kategori = ? AND f.platform = ? AND f.date = ?
        `;

        const queryParams = [kategori, platform, latestDate, kategori, platform, latestDate];
        const [dataRows] = await db.query(dataQuery, queryParams);

        if (dataRows.length === 0) {
            return res.status(404).json({ message: "Tidak ada data yang ditemukan untuk export." });
        }

        console.info(`[INFO] Found ${dataRows.length} records for export.`);

        // Format tanggal ke local (Asia/Jakarta) dalam format YYYY-MM-DD
        const formattedDate = new Date(latestDate).toLocaleDateString('en-CA', {
            timeZone: 'Asia/Jakarta'
        });

        const formattedData = dataRows.map(row => ({
            ...row,
            date: new Date(row.date).toLocaleDateString('en-CA', {
                timeZone: 'Asia/Jakarta'
            })
        }));

        return res.json({
            status: "success",
            total: formattedData.length,
            latest_date: formattedDate,
            data: formattedData,
        });

    } catch (error) {
        console.error("[ERROR] Failed to export fair:", error);
        res.status(500).json({
            code: 500,
            status: "ERROR",
            message: "Gagal melakukan export fair.",
            error: error.message
        });
    }
});

// POST /api/responsiveness
router.post('/calculateResponsiveness', async (req, res) => {
    try {
        const { kategori } = req.body;

        if (!kategori) {
            return res.status(400).json({
                success: false,
                message: 'kategori dan platform harus diisi.',
            });
        }

        await calculateResponsivenessPerPost(kategori);

        res.json({
            success: true,
            message: `Proses responsiveness per post selesai untuk kategori: ${kategori}.`,
        });
    } catch (error) {
        console.error('[ERROR] Failed to process responsiveness:', error.message);
        res.status(500).json({
            success: false,
            message: 'Gagal memproses responsiveness.',
            error: error.message,
        });
    }
});

module.exports = router;
