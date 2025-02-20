require('dotenv').config();
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY // Pastikan .env berisi OPENAI_API_KEY
});

/**
 * Fungsi untuk mengirim prompt ke OpenAI dan mendapatkan responsenya.
 * @param {string} prompt - Prompt yang dikirim ke OpenAI.
 * @returns {Promise<string>} - Respons ringkasan dari OpenAI.
 */
const getFairScoreSummary = async (prompt) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Bisa diganti dengan 'gpt-3.5-turbo' jika diperlukan
      messages: [{ role: 'user', content: prompt }],
    //   temperature: 0.7,
    //   max_tokens: 600
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error from OpenAI:', error.response?.data || error.message);
    throw new Error('Gagal mendapatkan ringkasan dari OpenAI.');
  }
};

module.exports = { getFairScoreSummary };
