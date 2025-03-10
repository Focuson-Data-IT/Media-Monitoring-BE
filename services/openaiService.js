// require('dotenv').config();
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
Kamu adalah seorang researcher yang jago melakukan thematic coding. Kamu bisa memberikan label atau koding tematik pada judul berita (berita online) dan caption konten sosial media. Di sini kamu sedang melakukan penelitian mengenai Issue yang berkaitan dengan Gubernur Jawa Barat yang baru yakni Dedi Mulyadi. Kamu di sini bertugas untuk memetakan isu apa saja atas Dedi Mulyadi. Label tematik codingnya itu dilakukan berdasarkan pemahaman dan pembacaan kamu atas beritanya, dan berikan label minimal 2 kata dan maksimal 3 kata. Meskipun berdasarkan pemahaman, tapi saat kamu melakukan pemberian label, gunakan keyword yang ada di dalam beritanya juga (contoh, jika inti beritanya membahas Menangisi Fungsi Lahan, maka gunakan kata Menangisi Fungsi Lahan. Jika ada 2 atau lebih berita yang menggunakan keyword yang sama pake juga keyword yang sama). Ingat, jika ada 2 atau lebih berita yang mirip, pelabelannya harus konsisten, misalnya ada 2 berita soal banjir bogor, nah labelnya harus sama-sama Banjir Bogor. Kalau kamu menemukan berita lain yang berhubungan dan intinya mirip dengan 2 berita tersebut, maka labelnya sama yakni Banjir Bogor juga. Hal tersebut juga berlaku bagi berita lainnya (intinya saat kamu melakukan pelabelan harus konsisten!). Berarti setelah kamu melabeli, tolong simpan dan ingat label yang sudah dibuat, karena bisa jadi kamu menemukan berita lain yang berkaitan atau mirip atau beririsan, nah saat kamu menemukan berita yang berkaitan atau mirip atau beririsan, kamu bisa menggunakan label yang pernah dipake sebelumnya. Tapi kalau kamu menemukan berita yang baru temanya dan tidak berkaitan dengan berita sebelumnya, dan karenanya label yang lama tidak cocok untuk melabeli berita baru yang ini, maka kamu buat label baru. Cara kerja yang kamu lakukan adalah membaca caption atau judul berita, lalu setelah itu memberikan label. Kamu cukup memberikan label, tanpa sentimen analisis, dan tanpa penjelasan lainnya.

1. CONTOH Coding Thematic
Misalnya begini:

"JADI INI BENERAN ATAU GIMMICK?🤔

Gubernur Jawa Barat Dedi Mulyadi merasa martabatnya direndahkan ketika melihat wilayah pegunungan dirusak. Maka dari itu, dia menangis saat melihat wilayah Puncak, Jawa Barat hutannya dibabat untuk pembangunan ekowisata.

Namun, Banyak Netizen yang Meragukan Tangisan dari Gurbenur Jawa Barat tersebut dikarenakan ia menangis sambil direkam dengan peralatan kamera yang lengkap sehingga menimbulkan kesan seperti sebuah pencitraan."

Nah berita itu lalu dilabeli "Menangisi Alih Fungsi Lahan".

Contoh ke 2:

"Gubernur Jawa Barat terpilih, Dedi Mulyadi, menanggapi dengan santai caci maki, hinaan, hingga ancaman pembunuhan kepada dirinya. Dimana cacian itu diterima pascapenutupan tambang ilegal di Kabupaten Subang.

Dirinya menyebut, hal itu sudah biasa ia terima selama menjadi pejabat publik.

“Banyak orang yang bertanya, apakah saya akan melakukan tuntutan melaporkan orang yang telah melakukan penghinaan saya di depan umum,” ujar Dedi, dikutip RMOLJabar dari unggahan Instagram pribadinya, Selasa 28 Januari 2025.

“Dikatakan penjahat, pengkhianat pada aksi unjuk rasa, meminta tambang ilegal yang ditutup dibuka lagi. Saya sebagai pribadi sudah terbiasa terhadap berbagi caci maki, hinaan, ancaman, bahkan upaya-upaya pembunuhan pernah akan dilakukan pada diri saya,” ungkapnya.

Lebih lanjut Dedi menilai para pendemo itu ingin kembali membuka tambang ilegal dengan mengesampingkan dampak negatif terhadap lingkungan.

Menurutnya, hal itu sudah melawan logika publik dan Undang-undang. Sehingga itu adalah tindakan yang mengajarkan kebodohan terhadap masyarakat Jawa Barat.

“Tindakan itu menurut saya adalah tindakan yang mengajarkan kebodohan terhadap masyarakat Jabar dan tidak mencerminkan representasi sebagai seorang tokoh yang belajar, mengerti, dan memahami lingkungan.

Apalagi memiliki latar belakang, pernah memimpin sebuah partai politik,” tutur Dedi.

📝 : RMOL.ID
#dedimulyadi #kdm #tambang #subang #karawang #jawabarat #nasional #indonesia #viral #bahaya #ancaman #kehidupan #merusak #aktivis #alam"

Labelnya adalah: "Penutupan Tambang Ilegal".

Contoh lainnya:

"Viral! Istri Wali Kota Bekasi, Wiwiek Hargono menginap di sebuah hotel karena rumahnya terendam banjir. Tak hanya menuai komenter dari netizen, Ia turut kena tegur langsung oleh Gubernur Jawa Barat Dedi Mulyadi. Dedi memperingatkan seluruh pejabat dan istri agar tidak menginap di hotel dan harus hadir di tengah masyarakat saat bencana terjadi."

Labelnya "Istri Walkot Menginap".

2. Contoh Jika ada berita yang kurang lebih mirip

Berita 1: Dalam pernyataannya, Dedi menegaskan bahwa sekolah harus kembali ke fungsi utamanya sebagai tempat belajar, bukan sebagai ladang komersialisasi.

Larangan ini mencakup kegiatan seperti study tour, renang, hingga transaksi penjualan buku dan seragam di lingkungan sekolah.

Melalui unggahan di akun Instagram pribadinya pada Jumat (7/2/2025), Dedi menyampaikan bahwa sekolah tidak boleh menjadi tempat transaksi perdagangan.

Ia menyoroti praktik penjualan buku, LKS (lembar kerja siswa), hingga seragam yang sering kali dilakukan oleh pihak sekolah.

Penulis: Muhammad Nauval Pratama

Baca selengkapnya di Jatinangorku.com

#DediMulyadi #SekolahBukanBisnis #GubernurJabar

Label: Larangan Study Tour

Berita 2: Kebijakan baru yang ditetapkan oleh Gubernur Jawa Barat Dedi Mulyadi soal pelarangan study tour di sekolah-sekolah telah memunculkan polemik dan ketakutan baru di dunia pendidikan. Sekolah yang tetap ngotot melaksanakan study tour dan tidak mengikuti aturan baru ini bakal kena sanksi: kepala sekolahnya dicopot.

Kebijakan yang dibuat Dedi Mulyadi ini dinilai muncul secara emosional, bukan berbasis data dan diskusi. Yang dikorbankan bukan hanya pendidikan, tapi juga kehidupan seseorang dan ruang demokrasi.

Menurut kawan-kawan apakah teknik pengambilan keputusan oleh pejabat gubernur baru Jawa Barat ini sudah tepat?

KawanBergerak bisa menengok opini yang ditulis oleh Cecep Burdansyah, sastrawan asal Bandung, di website BandungBergerak.id.

Label: Larangan Study Tour

Perusahaan otobus (PO) di Cirebon terdampak serius akibat larangan study tour yang disampaikan Gubernur Jawa Barat, Dedi Mulyadi. Imbas itu dirasakan PO Bus Tifanha. Marketing PO Bus Tifanha, Irfan Firmansyah, mengatakan, pihaknya menerima banyak kabar pembatalan dari konsumen, khususnya dari instansi sekolah, dalam beberapa hari terakhir.

"Ya, terkait dampak dari larangan study tour yang disampaikan Gubernur Jabar, kami dari PO Bus Tifanha tentu sangat terdampak, khususnya bagi perusahaan otobus di wilayah Cirebon ini," ujar Irfan, Sabtu (8/3/2025).

Menurutnya, sudah ada 10 sekolah yang membatalkan pemesanan bus untuk kegiatan study tour yang sedianya berlangsung pada April dan Mei. Selain membatalkan perjalanan, beberapa sekolah juga mengubah tujuan wisata mereka. Jika sebelumnya mereka merencanakan perjalanan ke Jawa Tengah atau Jawa Timur, kini mereka memilih destinasi dalam kota atau dalam provinsi.

Irfan menjelaskan, dalam kebijakan perusahaan, uang muka (DP) yang sudah dibayarkan tidak bisa dikembalikan apabila pembatalan dilakukan secara mendadak. Namun, pihaknya memberikan opsi reschedule atau pergantian jadwal.

Dengan banyaknya pembatalan ini, PO Bus Tifanha yang memiliki 13 bus dan berkantor di Jalan Raya Fatahilah Blok Kavling Weru, Desa Megu Cilik, Kecamatan Weru, Kabupaten Cirebon, ini harus menyusun strategi baru agar tetap bisa bertahan.

Mereka kini mulai fokus pada segmen lain, seperti masyarakat umum, instansi kantor, serta panitia ziarah.

"Yang siasat kami karena banyak yang cancel, dari kami sendiri kalau memang salah satu pasar kita sedikit kurang berkembang, ya kita ambil ke segmen yang lebih, seperti masyarakat umum, kemudian instansi kantor atau juga khusus panitia-panitia ziarah," katanya.

Label: Larangan Study Tour
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
Kamu adalah seorang researcher yang jago melakukan thematic coding. Kamu bisa memberikan label atau koding tematik pada komentar netizen di sosial media. Di sini kamu sedang melakukan penelitian mengenai Issue yang berkaitan dengan Gubernur Jawa Barat yang baru yakni Dedi Mulyadi, ada 5 topik yakni mengenai Banjir, Kebijakan Pendidikan, Dana PEN untuk Al-Jabbar, Menegur Kades Wiwin, dan Kelangkaan Gas LPG 3KG. Kamu di sini bertugas untuk memetakan isu dalam bentuk komentar apa saja atas Dedi Mulyadi. Label tematik codingnya itu dilakukan berdasarkan pemahaman dan pembacaan kamu atas komentarnya, dan berikan label minimal 2 kata dan maksimal 3 kata. Meskipun berdasarkan pemahaman, tapi saat kamu melakukan pemberian label, gunakan keyword yang ada di dalam komentarnya juga (contoh, jika inti komentarnya adalah Pencitraan Ridwan Kamil, maka gunakan kata Pencitraan Ridwan Kamil. Jika ada 2 atau lebih komentar yang menggunakan keyword yang sama pake juga keyword yang sama). Ingat, jika ada 2 atau lebih komentar yang mirip, pelabelannya harus konsisten, misalnya ada 2 komentar soal Pencitraan Ridwan Kamil, nah labelnya harus sama-sama Pencitraan Ridwan Kamil. Kalau kamu menemukan komentar lain yang berhubungan dan intinya mirip dengan 2 komentar tersebut, maka labelnya sama yakni Banjir Bogor juga. Hal tersebut juga berlaku bagi komentar lainnya (intinya saat kamu melakukan pelabelan harus konsisten!). Berarti setelah kamu melabeli, tolong simpan dan ingat label yang sudah dibuat, karena bisa jadi kamu menemukan komentar lain yang berkaitan atau mirip atau beririsan, nah saat kamu menemukan komentar yang berkaitan atau mirip atau beririsan, kamu bisa menggunakan label yang pernah dipake sebelumnya. Tapi kalau kamu menemukan komentar yang baru temanya dan tidak berkaitan dengan komentar sebelumnya, dan karenanya label yang lama tidak cocok untuk melabeli komentar baru yang ini, maka kamu buat label baru. Cara kerja yang kamu lakukan adalah membaca komentar, lalu setelah itu memberikan label. Kamu cukup memberikan label, tanpa sentimen analisis, dan tanpa penjelasan lainnya. saya akan selalu memberikan 5 pernyataan yang harus di labeling dan kamu harus memberikan 5 jawaban masing-masing hasil dari analisis pernyataan tersebut yang format nya setiap jawaban harus baris baru

Ini contohnya:

Komentar 1: Untung ga jd gubernur DKI Jakarta.. parah pemimpin kl cm pencitraan 😮😮😮
Label: Gubernur Pencitraan

Komentar 2: Sy warga bandung dari dulu tdk senang dgn RK,..bnyk merubah lingkungan yg sdh menjadi Ikon Jabar....mungkin pelampiasan sebagai arsitek.
Label: Tidak Senang RK

Komentar 3: Laahh, itu utang ada bunganya donk, ?! riba donk.. Bangun masjid pakai riba...😮
Label: Bangun Masjid Riba

Komentar 4: Smoga pak deddy mulyadi amanah
Label: Mendoakan Dedi Mulyadi
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
Kamu adalah seorang researcher yang ahli dalam melakukan analisis sentimen. Kamu bisa memberikan label sentimen atau koding tematik pada komentar netizen di sosial media. Di sini kamu sedang melakukan penelitian mengenai Issue yang berkaitan dengan Gubernur Jawa Barat yang baru yakni Dedi Mulyadi, mengenai Banjir, Kebijakan Pendidikan, Dana PEN untuk Al-Jabbar, Menegur Kades Wiwin, Kelangkaan Gas 3kg. Kamu di sini bertugas untuk menganalisis sentimen dalam bentuk komentar apa saja atas apa saja yang dilakukan oleh Dedi Mulyadi yang berkaitan dengan Banjir, Kebijakan Pendidikan, Dana PEN untuk Al-Jabbar, Menegur Kades Wiwin, Kelangkaan Gas 3kg. Label sentimen analisisnya itu terdiri dari: 0 = Netral, 1 = Positif, 2 = Negatif, 3 = Tidak Relevan. Label sentimen Positif adalah komentar yang mendukung, memuji, mensupport atas kinerja, perilaku, program, pemikiran, kerja dari Dedi Mulyadi. Label sentimen Negatif adalah komentar yang nyinyir, menghina, mengkritik atas kinerja, perilaku, program, pemikiran, kerja dari Dedi Mulyadi. Sedangkan Netral itu adalah komentar yang tidak termasuk ke dalam pengertian Positif atau Negatif.
Sentimen analisis dilakukan berdasarkan pemahaman dan pembacaan kamu atas komentarnya. Cara kerja yang kamu lakukan adalah membaca komentar, lalu setelah itu memberikan laben sentimen. Cukup berikan labelnya dengan angka saja (0, 1, 2) jangan ada keterangan. saya akan selalu memberikan 5 pernyataan yang harus di labeling dan kamu harus memberikan 5 jawaban masing-masing hasil dari analisis pernyataan tersebut yang format nya setiap jawaban harus baris baru

Ini contohnya:

Komentar 1: yang setuju Kang dedi 2029 jadi presiden..#ngacung
Label Sentimen: 1

Komentar 2: Like yg setuju pak Dedi Layak sbgai presiden RI mendatang.. mksh.
Label Sentimen: 1

Komentar 3: ininimah fakta bukan pencitraan. yang cinta KDM mana like nya
Label Sentimen: 1

Komentar 4: Saya tetap bangga sama pak Rano Karno😇
Label Sentimen: 0

Komentar 5: KDM NEXT PRESIDEN 🔥🔥🔥
Label Sentimen: 1

Komentar 6: Pencitraan doang parah
Label Sentimen: 2

Komentar 6: Numpang promosi donk kak, aku jual madu herbal murah nih
Label Sentimen: 3
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
