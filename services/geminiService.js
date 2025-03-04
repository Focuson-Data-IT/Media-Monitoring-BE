require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); // Pastikan .env berisi GEMINI_API_KEY

/**
 * Fungsi untuk mengirim prompt ke Gemini dan mendapatkan responsenya.
 * @param {string} prompt - Prompt yang dikirim ke Gemini.
 * @returns {Promise<string>} - Ringkasan dari Gemini.
 */
const getFairScoreSummary = async (prompt) => {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" }); // Gunakan model terbaru Gemini
        const result = await model.generateContent(prompt);
        const response = result.response;
        return response.text().trim();
    } catch (error) {
        console.error('Error from Gemini:', error.response?.data || error.message);
        throw new Error('Gagal mendapatkan ringkasan dari Gemini.');
    }
};

module.exports = { getFairScoreSummary };
