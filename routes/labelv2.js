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

// Bagi array jadi chunk isi 5
const chunkArray = (arr, size) =>
    Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
        arr.slice(i * size, i * size + size)
    );

// Prompt generator per 5 komentar atau caption
const generatePrompt = (items, kategori = "", isPost = false) => {
    const jenis = isPost ? "caption" : "komentar";
    let prompt = `Berikut adalah ${items.length} ${jenis} yang berhubungan dengan kategori: ${kategori}.\n` +
        `Lakukan *thematic coding* dan beri label 2–4 kata untuk setiap ${jenis}.\n` +
        `⚠️ Tampilkan **tepat 1 label per ${jenis}**, dengan format:\n1. label satu\n2. label dua\n...\n\n` +
        `Daftar ${jenis}:\n`;

    prompt += items
        .map((v, i) => `${i + 1}. "${shortenComment(v.comment_text)}"`)
        .join('\n');

    return prompt;
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
                    content: `Kamu adalah asisten peneliti ahli dalam melakukan thematic coding di media sosial.`
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

// Ambil label dari hasil OpenAI dalam format 1. label
const extractNumberedLabels = (response, expectedCount) => {
    const regex = /^\d+\.\s*(.+)$/gm;
    const matches = [...response.matchAll(regex)].map(m => m[1].trim());

    const labels = matches.map(l => l
        .replace(/["'“”‘’,.:;!?]/g, '')
        .toLowerCase()
        .slice(0, 50)
        .trim()
    );

    return labels.length === expectedCount ? labels : [];
};

// Get valid labels with retry if mismatch
const getValidLabels = async (prompt, expectedCount) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
        const raw = await getCoding(prompt);
        const labels = extractNumberedLabels(raw, expectedCount);
        if (labels.length === expectedCount) return labels;
        console.warn(`⚠️ Attempt ${attempt} mismatch: ${labels.length} / ${expectedCount}`);
        await delay(500);
    }
    return [];
};

// Reusable labeling route handler
const labelingHandler = (tableName, idField, textField, isPost = false) => {
    return async (req, res) => {
        const kategori = req.query.kategori;
        if (!kategori) return res.status(400).json({ error: "Kategori is required" });

        try {
            const query = `
                SELECT ${idField}, ${textField} AS comment_text, kategori
                FROM ${tableName}
                WHERE label IS NULL AND kategori = ?
                ORDER BY ${idField} ASC
            `;
            const [result] = await db.query(query, [kategori]);

            if (result.length === 0) {
                return res.status(200).json({ message: `✅ No unlabeled ${isPost ? 'posts' : 'comments'} found` });
            }

            const chunks = chunkArray(result, 5);
            let processed = 0;
            const failedChunks = [];

            for (let i = 0; i < chunks.length; i++) {
                const chunk = chunks[i];
                console.log(`🔄 Processing chunk ${i + 1} of ${chunks.length}`);

                const prompt = generatePrompt(chunk, kategori, isPost);
                const labels = await getValidLabels(prompt, chunk.length);

                if (labels.length !== chunk.length) {
                    console.warn(`⚠️ Skipping chunk: ${labels.length} labels for ${chunk.length} items.`);
                    failedChunks.push(chunk);
                    continue;
                }

                await Promise.all(chunk.map(async (item, idx) => {
                    let label = labels[idx] || "no label";
                    label = labelMemory[label] || (labelMemory[label] = label);

                    const updateQuery = `UPDATE ${tableName} SET label = ? WHERE ${idField} = ?`;
                    await db.query(updateQuery, [label, item[idField]]);
                    processed++;

                    console.info(`✅ ID ${item[idField]} → ${label}`);
                }));

                await delay(500);
            }

            res.status(200).json({
                message: `✅ Labeling ${isPost ? 'posts' : 'comments'} completed`,
                total_processed: processed,
                failed_chunks: failedChunks.length
            });

        } catch (error) {
            console.error(`❌ ${isPost ? 'Post' : 'Comment'} labeling error:`, error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    };
};

// ROUTES
router.get('/v2/comments-coding', labelingHandler("mainComments", "main_comment_id", "comment_text", false));
router.get('/v2/post-labeling', labelingHandler("posts", "post_id", "caption", true));

module.exports = router;