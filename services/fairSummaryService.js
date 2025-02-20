require('dotenv').config();
const axios = require('axios');
const { getFairScoreSummary } = require('./geminiService'); // 🔥 Menggunakan Gemini Service

/**
 * Ambil data performa dari API getFairDataInsights dan hasilkan summary menggunakan Gemini.
 * @param {string} username - Username akun yang diminta.
 * @param {string} month - Bulan dalam format YYYY-MM (contoh: "2025-01").
 * @param {string} kategori - Kategori akun (default: 'disparbud').
 * @param {string} platform - Platform akun (Instagram/TikTok) (default: 'Instagram').
 * @returns {Promise<string>} - Ringkasan performa dari Gemini.
 */
const generateFairSummary = async (username, month, kategori = 'disparbud', platform = 'Instagram') => {
    try {
        // 🔥 Ambil data performa dari API
        const { data } = await axios.get('http://localhost:7770/insights/getFairDataInsights', {
            params: { kategori, platform, username, month }
        });

        const performanceData = data.data;
        if (!performanceData || !performanceData.length) {
            throw new Error('Data tidak ditemukan untuk username yang diminta.');
        }

        // 🔥 Temukan akun yang diminta dari response
        const requestedUser = performanceData.find((acc) => acc.username === username);
        if (!requestedUser) throw new Error(`Akun ${username} tidak ditemukan dalam data.`);

        // 🔥 Ambil top 3 akun dari data
        const top3 = performanceData.slice(0, 3); // Data selalu diurutkan berdasarkan FAIR Score

        // 🔥 Buat prompt untuk Gemini
        const prompt = `
Kamu adalah Artificial Intelligence yang mampu memberi rekomendasi atas performa sosial media di Instagram dan TikTok. 

Aku telah mengembangkan alat ukur performa akun sosial media bernama **FAIR** yang terdiri dari:
- **Follower (F)**: Jumlah pengikut.
- **Activity (A)**: Rata-rata jumlah postingan per hari.
- **Interaction (I)**: Rata-rata jumlah likes per konten.
- **Responsiveness (R)**: Persentase komentar yang dibalas oleh admin akun.

**Bobot FAIR**:
- Follower (F): 2
- Activity (A): 2
- Interaction (I): 3
- Responsiveness (R): 1

### Cara Menghitung FAIR Score:
1. Tentukan skor tiap elemen dengan membagi nilai elemen akun tertentu dengan nilai elemen tertinggi dari seluruh akun yang dibandingkan.
2. Kalikan skor elemen tersebut dengan bobotnya.
3. Jumlahkan semua bobot elemen.
4. Hasilnya dibagi 8 dan dikalikan 100 untuk mendapatkan FAIR Score akhir.

---

### **Data Performa Bulan ${month}:**

🔝 **Top 3 Akun:**
${top3.map((acc, i) => `${i + 1}. Username: ${acc.username}\n   - Rank: ${acc.rank}\n   - Follower: ${acc.followers}\n   - Activity: ${acc.activities}\n   - Interaction: ${acc.interactions}\n   - Responsiveness: ${acc.responsiveness}\n   - FAIR Score: ${acc.fair_score.toFixed(2)}\n`).join('')}

👤 **Akun Diminta (${requestedUser.username}):**
- Rank: ${requestedUser.rank}
- Follower: ${requestedUser.followers}
- Activity: ${requestedUser.activities}
- Interaction: ${requestedUser.interactions}
- Responsiveness: ${requestedUser.responsiveness}
- FAIR Score: ${requestedUser.fair_score.toFixed(2)}

---

### **Instruksi untuk AI:**

1. Jelaskan akun **${requestedUser.username}** berada di **peringkat ${requestedUser.rank}**.  
   - Jika berada di **top 3**, sebutkan performanya lumayan baik dibandingkan akun lain.  
   - Jika **peringkat 1**, sebutkan performanya sudah baik dan harus dipertahankan.  
   - Jika **di luar top 3**, jelaskan bahwa akun ini berada di luar 3 besar dan performanya masih rendah.  

2. Jelaskan detail performa akun ini:  
   - Follower: ${requestedUser.followers}  
   - Activity: ${requestedUser.activities}  
   - Interaction: ${requestedUser.interactions}  
   - Responsiveness: ${requestedUser.responsiveness}  

3. Jika akun berada **di luar top 3**:  
   - Identifikasi elemen (F, A, I, R) mana yang paling lemah dibandingkan top 3.  
   - Jelaskan selisihnya dibandingkan akun peringkat 1 untuk F, A, I, R.  

4. Berikan **rekomendasi spesifik** untuk meningkatkan elemen terlemah dengan opsi berikut:  
   - **Ads** (meningkatkan like)  
   - **Konten viral** (meningkatkan like, follower)  
   - **Kolaborasi dengan media** (meningkatkan like, follower)  
   - **Giveaway** (meningkatkan like, follower)  
   - **Rajin membuat konten** (meningkatkan activity)  
   - **Mengikuti isu terkini** (meningkatkan like, activity, follower)  

👉 Fokuskan rekomendasi pada elemen terlemah terlebih dahulu.

---

### **Format jawaban yang diharapkan:**

1. **Peringkat akun ${requestedUser.username}:**  
   - Jelaskan posisi ranking akun.  
   - Sebutkan apakah termasuk top 3 atau di luar top 3.  

2. **Detail performa akun:**  
   - Follower: ...  
   - Activity: ...  
   - Interaction: ...  
   - Responsiveness: ...  

3. **Analisis perbandingan dengan akun peringkat 1:**  
   - Perbedaan F: ...  
   - Perbedaan A: ...  
   - Perbedaan I: ...  
   - Perbedaan R: ...  

4. **Rekomendasi:**  
   - Fokus pada elemen yang paling lemah.  
   - Berikan rekomendasi yang relevan dan actionable.  
`;

        console.info('✅ Generated prompt for Gemini:', prompt);

        // 🔥 Dapatkan ringkasan dari Gemini
        const summary = await getFairScoreSummary(prompt);
        return summary;

    } catch (error) {
        console.error('❌ Error generating FAIR summary:', error.message);
        throw new Error('Gagal menghasilkan ringkasan.');
    }
};

module.exports = { generateFairSummary };
