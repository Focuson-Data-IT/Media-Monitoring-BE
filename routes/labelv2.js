const express = require('express');
require('dotenv').config();
const router = express.Router();
const db = require('../models/db');
const OpenAI = require('openai');

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    organization: process.env.ORGANIZATION_ID,
    project: process.env.PROJECT_ID
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
let labelMemory = {};

// Pendekkan jika komentar terlalu panjang
const shortenComment = (text, maxLength = 500) => {
    if (!text) return '[Kosong]';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
};

// Buat prompt untuk 1 komentar atau caption
const generatePrompt = (item, kategori = "", isPost = false) => {
    const jenis = isPost ? "caption" : "komentar";
    return `Beri 1 label (2–4 kata) untuk ${jenis} berikut yang berhubungan dengan kategori: ${kategori}.\n` +
        `Label harus singkat, konsisten, tanpa tanda baca, dan tanpa penjelasan apapun. Cukup 1 baris saja.\n\n` +
        `"${shortenComment(item.comment_text)}"`;
};

// Kirim prompt ke OpenAI
const getCoding = async (prompt) => {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            max_tokens: 50,
            messages: [
                {
                    role: 'system',
                    content: `Kamu adalah asisten peneliti ahli dalam labeling komentar media sosial.`
                },
                { role: 'user', content: prompt }
            ]
        });

        return String(response.choices[0].message?.content || '').trim();
    } catch (error) {
        console.error('❌ Error from OpenAI:', error.response?.data || error.message);
        throw new Error('Gagal mendapatkan label dari OpenAI.');
    }
};

// Bersihkan label dari noise, simbol, tanda baca
const normalizeLabel = (text) => {
    return text
        .replace(/^[-–•\d.]+/, '') // hapus nomor di depan
        .replace(/["'“”‘’,.:;!?]/g, '') // hapus tanda baca
        .toLowerCase()
        .trim();
};

// ROUTE: Label Komentar
router.get('/v2/comments-coding', async (req, res) => {
    const kategori = req.query.kategori;
    if (!kategori) return res.status(400).json({ error: "Kategori is required" });

    try {
        const query = `
            SELECT main_comment_id, comment_text, kategori
            FROM mainComments 
            WHERE label IS NULL 
            AND kategori = ?
        `;
        const [result] = await db.query(query, [kategori]);

        if (result.length === 0) {
            return res.status(200).json({ message: "✅ No unlabeled comments found" });
        }

        let processed = 0;
        const failed = [];

        for (const item of result) {
            const prompt = generatePrompt(item, kategori, false);
            const rawLabel = await getCoding(prompt);
            let label = normalizeLabel(rawLabel);

            if (!label) {
                console.warn(`⚠️ Empty label for comment ID ${item.main_comment_id}`);
                failed.push(item.main_comment_id);
                continue;
            }

            if (label.length > 50) label = label.slice(0, 50).trim();
            label = labelMemory[label] || (labelMemory[label] = label);

            const updateQuery = `UPDATE mainComments SET label = ? WHERE main_comment_id = ?`;
            await db.query(updateQuery, [label, item.main_comment_id]);
            processed++;

            console.info(`✅ ID ${item.main_comment_id} → ${label}`);
            await delay(500);
        }

        res.status(200).json({
            message: "✅ Labeling comments completed",
            total_processed: processed,
            failed: failed.length
        });

    } catch (error) {
        console.error("❌ Comments labeling error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

// ROUTE: Label Caption Postingan
router.get('/v2/post-labeling', async (req, res) => {
    const kategori = req.query.kategori;
    if (!kategori) return res.status(400).json({ error: "Kategori is required" });

    try {
        const query = `
            SELECT post_id, caption AS comment_text, kategori
            FROM posts 
            WHERE label IS NULL 
            AND kategori = ?
            ORDER BY post_id DESC
        `;
        const [result] = await db.query(query, [kategori]);

        if (result.length === 0) {
            return res.status(200).json({ message: "✅ No unlabeled posts found" });
        }

        let processed = 0;
        const failed = [];

        for (const item of result) {
            const prompt = generatePrompt(item, kategori, true);
            const rawLabel = await getCoding(prompt);
            let label = normalizeLabel(rawLabel);

            if (!label) {
                console.warn(`⚠️ Empty label for post ID ${item.post_id}`);
                failed.push(item.post_id);
                continue;
            }

            if (label.length > 50) label = label.slice(0, 50).trim();
            label = labelMemory[label] || (labelMemory[label] = label);

            const updateQuery = `UPDATE posts SET label = ? WHERE post_id = ?`;
            await db.query(updateQuery, [label, item.post_id]);
            processed++;

            console.info(`✅ ID ${item.post_id} → ${label}`);
            await delay(500);
        }

        res.status(200).json({
            message: "✅ Post labeling completed",
            total_processed: processed,
            failed: failed.length
        });

    } catch (error) {
        console.error("❌ Post labeling error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;
