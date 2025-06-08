const axios = require("axios");

const kategoriMap = {
    "perbankan": ["TikTok"]
};

// Global port pool (tidak dibagi per platform)
const portPool = [7774];
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
            await getComment(kategori, platform);
        })
    );

    const t1 = Date.now();
    console.log(`✅ ${kategori} selesai (get data) dalam ${(t1 - t0) / 1000}s`);
};

const runAll = async () => {
    const entries = Object.entries(kategoriMap);

    console.log("\n🚀 Memulai semua kategori satu per satu...\n");

    for (const [kategori, platforms] of entries) {
        await runKategori(kategori, platforms);
    }

    console.log("\n🎉 Semua kategori selesai (processFair)!");
};


runAll();