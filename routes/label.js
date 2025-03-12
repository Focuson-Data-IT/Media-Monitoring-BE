const express = require('express');
const router = express.Router();
const db = require('../models/db');
const { getNewsLabeling, getCoding, getSentiment } = require('../services/openaiService');

router.get('/v1/labeling', async(req, res) => {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const chunkArray = (arr, size) => {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, i * size + size)
        );
    };

    const getNewsLabelingBatch = async (prompts) => {
        try {
            const response = await getNewsLabeling(prompts);

            return response?.split("\n").map(line => line.replace(/^-\s*/, ''));
        } catch (error) {
            console.error("OpenAI API Error:", error);
            return [];
        }
    };

    try {
        const query = `SELECT * FROM news WHERE label IS NULL AND FIND_IN_SET("kdm", kategori)`;
        const [result] = await db.query(query);

        if (result.length === 0) {
            return res.status(200).json({ message: "No news to process" });
        }

        const newsChunks = chunkArray(result, 5); // Proses 5 berita sekaligus

        for (const chunk of newsChunks) {
            const prompts = chunk.map(v => `- ${v.title}`).join("\n");

            const labels = await getNewsLabelingBatch(prompts);

            // Simpan hasil ke database menggunakan Promise.all
            if (labels != "" && labels != null && labels != "No Label") {
                await Promise.all(chunk.map((v, i) => {
                    const updateQuery = `UPDATE news SET label = ? WHERE id = ?`;
                    return db.query(updateQuery, [labels[i] || labels[0] || "No Label", v.id]);
                }));
            }

            await new Promise(resolve => setTimeout(resolve, 5000)); // Delay untuk menghindari rate limit
        }

        res.status(200).json({ message: "Labeling completed" });

    } catch (error) {
        console.error("Batch processing error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
})

router.get('/v1/post-labeling', async(req, res) => {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const chunkArray = (arr, size) => {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, i * size + size)
        );
    };

    const getNewsLabelingBatch = async (prompts) => {
        try {
            const response = await getNewsLabeling(prompts);

            return response?.split("\n").map(line => line.replace(/^-\s*/, ''));
        } catch (error) {
            console.error("OpenAI API Error:", error);
            return [];
        }
    };

    try {
        const query = `SELECT * FROM posts WHERE label IS NULL AND FIND_IN_SET("kdm", kategori) ORDER BY post_id DESC`;
        const [result] = await db.query(query);

        if (result.length === 0) {
            return res.status(200).json({ message: "No news to process" });
        }

        const newsChunks = chunkArray(result, 5); // Proses 5 berita sekaligus

        for (const chunk of newsChunks) {
            const prompts = chunk.map(v => `- ${v.caption}`).join("\n");

            const labels = await getNewsLabelingBatch(prompts);

            // Simpan hasil ke database menggunakan Promise.all
            if (labels != "" && labels != null && labels != "No Label") {
                await Promise.all(chunk.map((v, i) => {
                    const updateQuery = `UPDATE posts SET label = ? WHERE post_id = ?`;
                    console.info(labels)
                    console.info(labels[i])
                    return db.query(updateQuery, [labels[i] || labels[0] || "No Label", v.post_id]);
                }));
            }

            await new Promise(resolve => setTimeout(resolve, 5000)); // Delay untuk menghindari rate limit
        }

        res.status(200).json({ message: "Labeling completed" });

    } catch (error) {
        console.error("Batch processing error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
})

router.get('/v1/comments-coding', async(req, res) => {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const chunkArray = (arr, size) => {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, i * size + size)
        );
    };

    const getNewsLabelingBatch = async (prompts) => {
        try {
            const response = await getCoding(prompts);

            console.info(response);
            return response?.split("\n")
                .map(line => line.replace(/^-\s*/, ''))
                .filter(line => line.trim() !== "");
        } catch (error) {
            console.error("OpenAI API Error:", error);
            return [];
        }
    };

    try {
        const query = `SELECT * FROM mainComments WHERE label IS NULL AND FIND_IN_SET("kdm", kategori) ORDER BY main_comment_id ASC`;
        const [result] = await db.query(query);

        if (result.length === 0) {
            return res.status(200).json({ message: "No news to process" });
        }

        const newsChunks = chunkArray(result, 5); // Proses 5 berita sekaligus

        for (const chunk of newsChunks) {
            const prompts = chunk.map(v => `- ${v.comment_text}`).join("\n");

            const labels = await getNewsLabelingBatch(prompts);
            // console.info(typeof labels)
            console.info(labels)

            // Simpan hasil ke database menggunakan Promise.all
            if (labels != "" && labels != null) {
                await Promise.all(chunk.map((v, i) => {
                    const updateQuery = `UPDATE mainComments SET label = ? WHERE main_comment_id = ?`;
                    // return null;
                    return db.query(updateQuery, [labels[i] || "No Label", v.main_comment_id]);
                }));
            }

            await new Promise(resolve => setTimeout(resolve, 5000)); // Delay untuk menghindari rate limit
        }

        res.status(200).json({ message: "Labeling completed" });

    } catch (error) {
        console.error("Batch processing error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
})

router.get('/v1/reply-coding', async(req, res) => {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const chunkArray = (arr, size) => {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, i * size + size)
        );
    };

    const getNewsLabelingBatch = async (prompts) => {
        try {
            const response = await getCoding(prompts);

            console.info(response);
            return response?.split("\n")
                .map(line => line.replace(/^-\s*/, ''))
                .filter(line => line.trim() !== "");
        } catch (error) {
            console.error("OpenAI API Error:", error);
            return [];
        }
    };

    try {
        const query = `SELECT * FROM childComments WHERE label IS NULL AND FIND_IN_SET("kdm", kategori)`;
        const [result] = await db.query(query);

        if (result.length === 0) {
            return res.status(200).json({ message: "No news to process" });
        }

        const newsChunks = chunkArray(result, 5); // Proses 5 berita sekaligus

        for (const chunk of newsChunks) {
            const prompts = chunk.map(v => `- ${v.child_comment_text}`).join("\n");

            const labels = await getNewsLabelingBatch(prompts);
            // console.info(typeof labels)
            console.info(labels)

            // Simpan hasil ke database menggunakan Promise.all
            if (labels != "" && labels != null) {
                await Promise.all(chunk.map((v, i) => {
                    const updateQuery = `UPDATE childComments SET label = ? WHERE child_comment_id = ?`;
                    // return null;
                    return db.query(updateQuery, [labels[i] || "No Label", v.child_comment_id]);
                }));
            }

            await new Promise(resolve => setTimeout(resolve, 5000)); // Delay untuk menghindari rate limit
        }

        res.status(200).json({ message: "Labeling completed" });

    } catch (error) {
        console.error("Batch processing error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
})

router.get('/v1/comments-sentiment', async(req, res) => {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const chunkArray = (arr, size) => {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, i * size + size)
        );
    };

    const getNewsLabelingBatch = async (prompts) => {
        try {
            const response = await getSentiment(prompts);

            console.info(response);
            return response?.split("\n")
                .map(line => line.replace(/^-\s*/, ''))
                .filter(line => line.trim() !== "");
        } catch (error) {
            console.error("OpenAI API Error:", error);
            return [];
        }
    };

    try {
        const query = `SELECT * FROM mainComments WHERE sentiment IS NULL AND FIND_IN_SET("kdm", kategori)`;
        const [result] = await db.query(query);

        if (result.length === 0) {
            return res.status(200).json({ message: "No news to process" });
        }

        const newsChunks = chunkArray(result, 5); // Proses 5 berita sekaligus

        for (const chunk of newsChunks) {
            const prompts = chunk.map(v => `- ${v.comment_text}`).join("\n");

            const labels = await getNewsLabelingBatch(prompts);
            // console.info(typeof labels)
            console.info(labels)

            // Simpan hasil ke database menggunakan Promise.all
            if (labels != "" && labels != null) {
                await Promise.all(chunk.map((v, i) => {
                    const updateQuery = `UPDATE mainComments SET sentiment = ? WHERE main_comment_id = ?`;
                    // return null;
                    return db.query(updateQuery, [labels[i] || "No Label", v.main_comment_id]);
                }));
            }

            await new Promise(resolve => setTimeout(resolve, 5000)); // Delay untuk menghindari rate limit
        }

        res.status(200).json({ message: "Labeling completed" });

    } catch (error) {
        console.error("Batch processing error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
})

router.get('/v1/reply-sentiment', async(req, res) => {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const chunkArray = (arr, size) => {
        return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
            arr.slice(i * size, i * size + size)
        );
    };

    const getNewsLabelingBatch = async (prompts) => {
        try {
            const response = await getSentiment(prompts);

            console.info(response);
            return response?.split("\n")
                .map(line => line.replace(/^-\s*/, ''))
                .filter(line => line.trim() !== "");
        } catch (error) {
            console.error("OpenAI API Error:", error);
            return [];
        }
    };

    try {
        const query = `SELECT * FROM childComments WHERE sentiment IS NULL AND FIND_IN_SET("kdm", kategori) ORDER BY child_comment_id DESC`;
        const [result] = await db.query(query);

        if (result.length === 0) {
            return res.status(200).json({ message: "No news to process" });
        }

        const newsChunks = chunkArray(result, 5); // Proses 5 berita sekaligus

        for (const chunk of newsChunks) {
            const prompts = chunk.map(v => `- ${v.child_comment_text}`).join("\n");

            const labels = await getNewsLabelingBatch(prompts);
            // console.info(typeof labels)
            console.info(labels)

            // Simpan hasil ke database menggunakan Promise.all
            if (labels != "" && labels != null) {
                await Promise.all(chunk.map((v, i) => {
                    const updateQuery = `UPDATE childComments SET sentiment = ? WHERE child_comment_id = ?`;
                    // return null;
                    return db.query(updateQuery, [labels[i] || "No Label", v.child_comment_id]);
                }));
            }

            await new Promise(resolve => setTimeout(resolve, 5000)); // Delay untuk menghindari rate limit
        }

        res.status(200).json({ message: "Labeling completed" });

    } catch (error) {
        console.error("Batch processing error:", error);
        res.status(500).json({ error: "Internal Server Error" });
    }
})

module.exports = router;