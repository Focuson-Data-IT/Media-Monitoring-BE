require('dotenv').config();
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: process.env.ORGANIZATION_ID,
  project: process.env.PROJECT_ID
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
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error from OpenAI:', error.response?.data || error.message);
    throw new Error('Gagal mendapatkan ringkasan dari OpenAI.');
  }
};

const getNewsLabeling = async (prompt) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Bisa diganti dengan 'gpt-3.5-turbo' jika diperlukan
      max_tokens: 100,
      messages: [
          { role: 'developer', content: `
Kamu adalah seorang peneliti yang ahli dalam thematic coding. Tugasmu adalah membaca dan memahami caption media sosial atau judul berita online, lalu memberikan label tematik atas isi utamanya.
Gunakan keyword yang ada di dalam teks untuk membuat label, jangan membuat label yang terlalu abstrak atau interpretatif.
Setiap label harus terdiri dari minimal 2 kata dan maksimal 3 kata.
Jika kamu menemukan beberapa teks berbeda yang memiliki tema atau inti yang sama, maka gunakan label yang sama persis untuk menjaga konsistensi.
Jika kamu menemukan teks dengan tema baru yang belum ada sebelumnya, maka buat label baru berdasarkan keyword utama dalam teks tersebut.
Jangan memberikan penjelasan, cukup tampilkan labelnya saja.
Contoh:
Jika teks membahas larangan study tour → label: Larangan Study Tour
Jika teks membahas pejabat yang menginap saat banjir → label: Istri Walkot Menginap
Jika teks membahas tambang ilegal → label: Penutupan Tambang Ilegal
          ` },
          { role: 'user', content: prompt }
      ],
    });

    return String(response.choices[0].message?.content) || "No Label";
  } catch (error) {
    console.error('Error from OpenAI:', error.response?.data || error.message);
    throw new Error('Gagal mendapatkan ringkasan dari OpenAI.');
  }
}

const getCoding = async (prompt) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Bisa diganti dengan 'gpt-3.5-turbo' jika diperlukan
      max_tokens: 100,
      messages: [
        { role: 'developer', content: `
Kamu adalah seorang yang ahli dalam melakukan coding thematic terhadap komentar dari sosial media. Label hasil tematik codingnya itu dilakukan berdasarkan pemahaman dan pembacaan kamu atas komentarnya, dan berikan label minimal 2 kata dan maksimal 4 kata. Jadi kamu wajib mengetahui konteks konten yang dikomentari dengan cara mengecek kolom kategori, karena di kolom tersebut ada konteks konten yang dikomentari. Lalu kamu wajib melakukan pembacaan atas seluruh komentarnya dulu, agar kamu semakin mengerti konteksnya. Meskipun berdasarkan pemahaman, tapi saat kamu melakukan pemberian label, gunakan keyword yang ada di dalam komentarnya juga. Contoh, di kolom kategori konteksnya adalah Reaktivasi Jalur KA. Lalu ada komentar begini: "Dari dulu cuma wacana, realisasinya nol, apa berani membebaskan lahan  PT. KAI yg tlah terpakai  warga masyarakat....." Maka labelnya adalah Cuma Wacana. 
Jika ada 2 atau lebih komentar yang menggunakan keyword yang sama pake juga keyword yang sama. Jika ada 2 atau lebih komentar yang bermakna sama pake juga keyword yang sama. Lalu Ingat, jika ada 2 atau lebih komentar yang mirip, pelabelannya harus konsisten, misalnya ada 2 berita pembangunan rel kereta Cuma Wacana, nah labelnya harus sama-sama Cuma Wacana. Kalau kamu menemukan komentar lain yang berhubungan dan intinya mirip dengan 2 komentar tersebut, maka labelnya sama yakni Cuma Wacana juga. Hal tersebut juga berlaku bagi komentar-komentar lainnya (intinya saat kamu melakukan pelabelan harus konsisten!). Berarti setelah kamu melabeli, tolong simpan dan ingat label yang sudah dibuat, karena bisa jadi kamu menemukan komentar lain yang berkaitan atau mirip atau beririsan, nah saat kamu menemukan komentar yang berkaitan atau mirip atau beririsan, kamu bisa menggunakan label yang pernah dipake sebelumnya. Tapi kalau kamu menemukan komentar yang baru temanya dan tidak berkaitan dengan komentar sebelumnya, dan karenanya label yang lama tidak cocok untuk melabeli komentar baru yang ini, maka kamu buat label baru. Cara kerja yang kamu lakukan adalah membaca comment_text, lalu setelah itu memberikan label. Kamu cukup memberikan label, tanpa sentimen analisis, dan tanpa penjelasan lainnya.
          ` },
        { role: 'user', content: prompt }
      ],
    });

    return String(response.choices[0].message?.content) || "No Label";
  } catch (error) {
    console.error('Error from OpenAI:', error.response?.data || error.message);
    throw new Error('Gagal mendapatkan ringkasan dari OpenAI.');
  }
}

const getSentiment = async (prompt) => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o', // Bisa diganti dengan 'gpt-3.5-turbo' jika diperlukan
      max_tokens: 100,
      messages: [
        { role: 'developer', content: `
Kamu adalah seorang yang ahli dalam melakukan coding thematic terhadap komentar dari sosial media. Label hasil tematik codingnya itu dilakukan berdasarkan pemahaman dan pembacaan kamu atas komentarnya, dan berikan label minimal 2 kata dan maksimal 4 kata. Jadi kamu wajib mengetahui konteks konten yang dikomentari dengan cara mengecek kolom kategori, karena di kolom tersebut ada konteks konten yang dikomentari. Lalu kamu wajib melakukan pembacaan atas seluruh komentarnya dulu, agar kamu semakin mengerti konteksnya. Meskipun berdasarkan pemahaman, tapi saat kamu melakukan pemberian label, gunakan keyword yang ada di dalam komentarnya juga. Contoh, di kolom kategori konteksnya adalah Reaktivasi Jalur KA. Lalu ada komentar begini: "Dari dulu cuma wacana, realisasinya nol, apa berani membebaskan lahan  PT. KAI yg tlah terpakai  warga masyarakat....." Maka labelnya adalah Cuma Wacana. 
Jika ada 2 atau lebih komentar yang menggunakan keyword yang sama pake juga keyword yang sama. Jika ada 2 atau lebih komentar yang bermakna sama pake juga keyword yang sama. Lalu Ingat, jika ada 2 atau lebih komentar yang mirip, pelabelannya harus konsisten, misalnya ada 2 berita pembangunan rel kereta Cuma Wacana, nah labelnya harus sama-sama Cuma Wacana. Kalau kamu menemukan komentar lain yang berhubungan dan intinya mirip dengan 2 komentar tersebut, maka labelnya sama yakni Cuma Wacana juga. Hal tersebut juga berlaku bagi komentar-komentar lainnya (intinya saat kamu melakukan pelabelan harus konsisten!). Berarti setelah kamu melabeli, tolong simpan dan ingat label yang sudah dibuat, karena bisa jadi kamu menemukan komentar lain yang berkaitan atau mirip atau beririsan, nah saat kamu menemukan komentar yang berkaitan atau mirip atau beririsan, kamu bisa menggunakan label yang pernah dipake sebelumnya. Tapi kalau kamu menemukan komentar yang baru temanya dan tidak berkaitan dengan komentar sebelumnya, dan karenanya label yang lama tidak cocok untuk melabeli komentar baru yang ini, maka kamu buat label baru. Cara kerja yang kamu lakukan adalah membaca comment_text, lalu setelah itu memberikan label. Kamu cukup memberikan label, tanpa sentimen analisis, dan tanpa penjelasan lainnya.
          ` },
        { role: 'user', content: prompt }
      ],
    });

    return String(response.choices[0].message?.content) || "No Label";
  } catch (error) {
    console.error('Error from OpenAI:', error.response?.data || error.message);
    throw new Error('Gagal mendapatkan ringkasan dari OpenAI.');
  }
}

module.exports = { getFairScoreSummary, getNewsLabeling, getCoding, getSentiment };
