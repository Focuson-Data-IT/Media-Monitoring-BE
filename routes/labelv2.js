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

// Shorten comment if too long
const shortenComment = (text, maxLength = 500) => {
    if (!text) return '[Kosong]';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
};

// Split array into chunks
const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
);

// Prompt generator
const generatePrompt = (comments, kategori = "") => {
    const promptHeader = `Berikut ini adalah komentar di media sosial yang berhubungan dengan kategori: ${kategori}.\n` +
        `Lakukan *thematic coding* pada setiap komentar dengan memberikan label 2–4 kata yang mewakili tema/isi komentar.\n` +
        `Label harus konsisten jika temanya sama. Contoh label: "aroma segar", "testimoni positif", "kritik layanan", dll.\n\n` +
        `Komentar:\n`;

    const commentList = comments
        .map((v, i) => `${i + 1}. "${shortenComment(v.comment_text)}"`)
        .join('\n');

    return `${promptHeader}${commentList}`;
};

// Get response from OpenAI
const getCoding = async (prompt) => {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            max_tokens: 100,
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
        console.error('Error from OpenAI:', error.response?.data || error.message);
        throw new Error('Gagal mendapatkan label dari OpenAI.');
    }
};

// Clean and split labels from OpenAI
const getNewsLabelingBatch = async (prompts) => {
    try {
        const response = await getCoding(prompts);
        return response
            .split("\n")
            .map(line => line
                .replace(/^[-–]\s*/, '')
                .replace(/^\d+\.\s*/, '')
                .trim()
            )
            .filter(line => line !== "");
    } catch (error) {
        console.error("OpenAI API Error:", error);
        return [];
    }
};

// Main route
router.get('/v2/comments-coding', async (req, res) => {
    try {
        const kategoriList = ['politik', 'olahraga', 'hiburan', 'parfum'];
        const placeholders = kategoriList.map(() => '?').join(', ');

        const query = `
            SELECT main_comment_id, comment_text, kategori
            FROM mainComments 
            WHERE label IS NULL 
            AND kategori IN (${placeholders})
        `;

        const [result] = await db.query(query, kategoriList);

        if (result.length === 0) {
            return res.status(200).json({ message: "✅ No unlabeled comments found" });
        }

        const newsChunks = chunkArray(result, 5);
        const total = result.length;
        const failedChunks = [];

        for (const chunk of newsChunks) {
            const uniqueCategories = [...new Set(chunk.map(v => v.kategori))].join(", ");
            const prompt = generatePrompt(chunk, uniqueCategories);
            const labels = await getNewsLabelingBatch(prompt);

            console.info('🧾 Prompt:\n' + prompt);
            console.info('🏷️ Label hasil:', labels);

            if (labels.length !== chunk.length) {
                console.warn(`⚠️ Mismatch: ${labels.length} labels untuk ${chunk.length} komentar. Lewatkan chunk ini.`);
                failedChunks.push(chunk);
                continue;
            }

            await Promise.all(chunk.map(async (v, idx) => {
                let label = labels[idx]?.trim() || "No Label";

                if (label.length > 50) {
                    label = label.slice(0, 50).trim();
                }

                if (labelMemory[label]) {
                    label = labelMemory[label];
                } else {
                    labelMemory[label] = label;
                }

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

module.exports = router;