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

// Shorten overly long text for safety
const shortenComment = (text, maxLength = 500) => {
    if (!text) return '[Kosong]';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
};

// Split array into chunks
const chunkArray = (arr, size) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
    );

// Generate labeling prompt
const generatePrompt = (items, kategori = "", isPost = false) => {
    const jenis = isPost ? "caption" : "komentar";
    const promptHeader = `Beri label 2–4 kata untuk setiap ${jenis} berikut yang berhubungan dengan kategori: ${kategori}.\n` +
        `Label harus singkat, konsisten, tanpa tanda baca, dan tidak mengulang.\n\n`;

    const itemList = items
        .map((v, i) => `${i + 1}. "${shortenComment(v.comment_text)}"`)
        .join('\n');

    return `${promptHeader}${itemList}`;
};

// Send prompt to OpenAI and get raw response
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

// Clean and normalize labels from OpenAI response
const getNewsLabelingBatch = async (prompt, expectedCount = 5) => {
    try {
        const response = await getCoding(prompt);
        let lines = response
            .split("\n")
            .map(line => line.trim())
            .filter(line =>
                line !== "" &&
                !/^hasil thematic coding/i.test(line) &&
                !/^berikut ini/i.test(line) &&
                !/^caption:/i.test(line) &&
                !/^komentar:/i.test(line)
            );

        lines = lines.map(line => {
            line = line.replace(/^[-–•\d.]+/, ''); // remove bullet or numbering
            line = line.replace(/["'“”‘’,.:;!?]/g, ''); // remove punctuation
            line = line.toLowerCase().trim(); // lowercase & clean
            return line;
        });

        // Limit to expected count if extra lines exist
        if (lines.length > expectedCount) {
            lines = lines.slice(-expectedCount);
        }

        return lines;
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
            const labels = await getNewsLabelingBatch(prompt, chunk.length);

            console.info('🏷️ Labels:', labels);

            if (labels.length !== chunk.length) {
                console.warn(`⚠️ Mismatch: ${labels.length} labels untuk ${chunk.length} komentar. Skip.`);
                failedChunks.push(chunk);
                continue;
            }

            await Promise.all(chunk.map(async (v, idx) => {
                let label = labels[idx]?.trim() || "no label";
                if (label.length > 50) label = label.slice(0, 50).trim();
                label = labelMemory[label] || (labelMemory[label] = label);

                const updateQuery = `UPDATE mainComments SET label = ? WHERE main_comment_id = ?`;
                await db.query(updateQuery, [label, v.main_comment_id]);
            }));

            await delay(500);
        }

        res.status(200).json({
            message: "✅ Labeling comments completed",
            total_processed: total,
            failed_chunks: failedChunks.length
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

        const chunks = chunkArray(result, 5);
        const total = result.length;
        const failedChunks = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            console.log(`🔄 Processing post chunk ${i + 1} of ${chunks.length}`);
            const prompt = generatePrompt(chunk, kategori, true);
            const labels = await getNewsLabelingBatch(prompt, chunk.length);

            console.info('🏷️ Labels:', labels);

            if (labels.length !== chunk.length) {
                console.warn(`⚠️ Mismatch: ${labels.length} labels untuk ${chunk.length} caption. Skip.`);
                failedChunks.push(chunk);
                continue;
            }

            await Promise.all(chunk.map(async (v, idx) => {
                let label = labels[idx]?.trim() || "no label";
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