const axios = require("axios");

const kategoriMap = {
    "opdbekasikab": ["instagram"],
    "prokopim_bekasikab": ["instagram"],
    "disparbud": ["instagram", "tiktok"],
    "disparbud_competitor": ["instagram", "tiktok"],
    "disparbud_ambassador": ["instagram", "tiktok"],
    "opdjabar": ["instagram", "tiktok"],
    "gubernur_jabar": ["instagram", "tiktok"],
    "opdbandung": ["instagram"],
    "parfum": ["tiktok"]
};

// Global port pool (tidak dibagi per platform)
const portPool = [7771, 7772, 7773, 7774];
const portStatus = Array(portPool.length).fill(false);

const delay = (ms) => new Promise(res => setTimeout(res, ms));

const waitForPort = async () => {
    while (true) {
        const index = portStatus.findIndex(status => !status);
        if (index !== -1) {
            portStatus[index] = true;
            return portPool[index];
        } else {
            process.stdout.write(`⏳ Menunggu port kosong...\r`);
        }
        await delay(200);
    }
};

const releasePort = (port) => {
    const index = portPool.indexOf(port);
    if (index !== -1) portStatus[index] = false;
};

const runWithPort = async (fn) => {
    const port = await waitForPort();
    try {
        return await fn(port);
    } catch (err) {
        console.error(`❌ Error @${port}:`, err.message || err);
    } finally {
        releasePort(port);
    }
};

const log = (msg, port) => console.log(`✅ ${msg} @${port}`);

const getPost = async (kategori, platform) =>
    runWithPort(async (port) => {
        const res = await axios.get(`http://localhost:${port}/${platform}/getPost?kategori=${kategori}`);
        if (res.status === 200) {
            log(`${kategori} ${platform} - getPost`, port);
        } else {
            throw new Error(`${kategori} ${platform} - getPost gagal dengan status ${res.status}`);
        }
    });

const getComment = async (kategori, platform) =>
    runWithPort(async (port) => {
        const res = await axios.get(`http://localhost:${port}/${platform}/getComment?kategori=${kategori}`);
        if (res.status === 200) {
            log(`${kategori} ${platform} - getComment`, port);
        } else {
            throw new Error(`${kategori} ${platform} - getComment gagal dengan status ${res.status}`);
        }
    });

const runKategori = async (kategori, platforms) => {
    const t0 = Date.now();

    await Promise.all(
        platforms.map(async (platform) => {
            await getPost(kategori, platform);
            await getComment(kategori, platform);
        })
    );

    const t1 = Date.now();
    console.log(`✅ ${kategori} selesai (get data) dalam ${(t1 - t0) / 1000}s`);
};

const runAll = async () => {
    const entries = Object.entries(kategoriMap);

    console.log("\n🚀 Memulai semua kategori secara paralel...");

    await Promise.all(
        entries.map(([kategori, platforms]) => runKategori(kategori, platforms))
    );

    console.log("\n🎉 Semua kategori selesai (get data)!");
};

runAll();