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

// Potong komentar kalau kepanjangan
const shortenComment = (text, maxLength = 300) => {
    if (!text) return ''; // Tambahin anti null
    if (text.length > maxLength) {
        return text.substring(0, maxLength) + '...';
    }
    return text;
};

const getCoding = async (prompt) => {
    try {
        const response = await openai.chat.completions.create({
            model: 'gpt-4o', // Atau gpt-3.5-turbo buat lebih hemat
            max_tokens: 500, // Sesuaikan aja
            messages: [
                {
                    role: 'developer', content: `
Lakukan thematic coding komentar sosial media.
Gunakan konteks kategori yang sudah disebutkan.

Format balasan:
- 1 label (2-4 kata) per komentar.
- Jika komentar mirip, gunakan label yang sama.
- Jawab hanya daftar label, tanpa penjelasan tambahan, tanpa nomor.
                    `
                },
                { role: 'user', content: prompt }
            ],
        });

        return String(response.choices[0].message?.content) || "No Label";
    } catch (error) {
        console.error('Error from OpenAI:', error.response?.data || error.message);
        throw new Error('Gagal mendapatkan label dari OpenAI.');
    }
};

const chunkArray = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
);

// Parse hasil labeling, bersihkan angka di depan
const getNewsLabelingBatch = async (prompts) => {
    try {
        const response = await getCoding(prompts);

        return response
            .split("\n")
            .map(line => line
                .replace(/^[-–]\s*/, '')   // Buang tanda - atau –
                .replace(/^\d+\.\s*/, '')  // Buang angka dan titik di depan
                .trim()
            )
            .filter(line => line !== "");
    } catch (error) {
        console.error("OpenAI API Error:", error);
        return [];
    }
};

router.get('/v2/comments-coding', async (req, res) => {
    try {
        const query = `
      SELECT main_comment_id, comment_text, kategori
      FROM mainComments 
      WHERE label IS NULL 
      AND kategori IN (
        'Hapus Hibah Pesantren'
      )`;

        const [result] = await db.query(query);

        if (result.length === 0) {
            return res.status(200).json({ message: "No news to process" });
        }

        const newsChunks = chunkArray(result, 5);

        for (const chunk of newsChunks) {
            // Gabungkan kategori
            const uniqueCategories = [...new Set(chunk.map(v => v.kategori))].join(", ");

            // Buat prompt minimalis
            const prompts = `Kategori: ${uniqueCategories}\n\nKomentar:\n` +
                chunk.map((v, i) => `${i + 1}. "${shortenComment(v.comment_text)}"`).join("\n");

            const labels = await getNewsLabelingBatch(prompts);

            console.info('Label hasil:', labels);

            await Promise.all(chunk.map(async (v, idx) => {
                let label = labels[idx] || "No Label";

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

        res.status(200).json({ message: "Labeling completed" });

    } catch (error) {
        console.error("Batch processing error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
});

module.exports = router;