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

// Shorten text if too long
const shortenComment = (text, maxLength = 500) => {
    if (!text) return '[Kosong]';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
};

// Split array into chunks
const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
);

// Prompt generator (support caption or comment)
const generatePrompt = (items, kategori = "", isPost = false) => {
    const jenis = isPost ? "caption pada postingan" : "komentar";
    const promptHeader = `Berikut ini adalah ${jenis} di media sosial yang berhubungan dengan kategori: ${kategori}.\n` +
        `Lakukan *thematic coding* dengan memberikan label 2–4 kata yang mewakili isi ${jenis}.\n` +
        `Gunakan label yang konsisten jika temanya sama. Contoh label: "aroma segar", "testimoni positif", "kritik layanan", dll.\n\n` +
        `${jenis.charAt(0).toUpperCase() + jenis.slice(1)}:\n`;

    const itemList = items
        .map((v, i) => `${i + 1}. "${shortenComment(v.comment_text)}"`)
        .join('\n');

    return `${promptHeader}${itemList}`;
};

// Kirim prompt ke OpenAI
const getCoding = async (prompt, maxTokens = 300) => {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            max_tokens: maxTokens,
            messages: [
                {
                    role: 'system',
                    content: `Kamu adalah asisten peneliti yang ahli dalam melakukan thematic coding di media sosial.`
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

// Proses hasil dari OpenAI
const getNewsLabelingBatch = async (prompt) => {
    try {
        const response = await getCoding(prompt);
        return response
            .split("\n")
            .map(line => line
                .replace(/^[-–]\s*/, '')
                .replace(/^\d+\.\s*/, '')
                .trim()
            )
            .filter(line => line !== "");
    } catch (error) {
        console.error("⚠️ OpenAI API Error:", error);
        return [];
    }
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

        const chunks = chunkArray(result, 5);
        const total = result.length;
        const failedChunks = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            console.log(`🔄 Processing comment chunk ${i + 1} of ${chunks.length}`);
            const prompt = generatePrompt(chunk, kategori, false);
            const labels = await getNewsLabelingBatch(prompt);

            console.info('🧾 Prompt:\n' + prompt);
            console.info('🏷️ Labels:', labels);

            if (labels.length !== chunk.length) {
                console.warn(`⚠️ Mismatch: ${labels.length} labels untuk ${chunk.length} komentar. Skip.`);
                failedChunks.push(chunk);
                continue;
            }

            await Promise.all(chunk.map(async (v, idx) => {
                let label = labels[idx]?.trim() || "No Label";
                if (label.length > 50) label = label.slice(0, 50).trim();

                label = labelMemory[label] || (labelMemory[label] = label);

                const updateQuery = `UPDATE mainComments SET label = ? WHERE main_comment_id = ?`;
                await db.query(updateQuery, [label, v.main_comment_id]);
            }));

            await delay(500);
        }

        res.status(200).json({
            message: "✅ Labeling completed",
            total_processed: total,
            failed_chunks: failedChunks.length
        });

    } catch (error) {
        console.error("❌ Batch processing error:", error);
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

        const chunks = chunkArray(result, 5);
        const total = result.length;
        const failedChunks = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            console.log(`🔄 Processing post chunk ${i + 1} of ${chunks.length}`);
            const prompt = generatePrompt(chunk, kategori, true);
            const labels = await getNewsLabelingBatch(prompt);

            console.info('🧾 Prompt:\n' + prompt);
            console.info('🏷️ Labels:', labels);

            if (labels.length !== chunk.length) {
                console.warn(`⚠️ Mismatch: ${labels.length} labels untuk ${chunk.length} caption. Skip.`);
                failedChunks.push(chunk);
                continue;
            }

            await Promise.all(chunk.map(async (v, idx) => {
                let label = labels[idx]?.trim() || "No Label";
                if (label.length > 50) label = label.slice(0, 50).trim();

                label = labelMemory[label] || (labelMemory[label] = label);

                const updateQuery = `UPDATE posts SET label = ? WHERE post_id = ?`;
                await db.query(updateQuery, [label, v.post_id]);
            }));

            await delay(500);
        }

        res.status(200).json({
            message: "✅ Post labeling completed",
            total_processed: total,
            failed_chunks: failedChunks.length
        });

    } catch (error) {
        console.error("❌ Post labeling error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;