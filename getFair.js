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

const portPool = [7771, 7772, 7773, 7774];
const portStatus = portPool.map(() => false);

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

const addDataUser = async (kategori, platform) =>
    runWithPort(async (port) => {
        await axios.post(`http://localhost:${port}/fair/addDataUser`, { kategori, platform });
        log(`${kategori} ${platform} - addDataUser`, port);
    });

const processData = async (kategori, platform) =>
    runWithPort(async (port) => {
        const now = new Date();
        const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
        const endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString().slice(0, 10);

        await axios.post(`http://localhost:${port}/fair/processData`, {
            kategori,
            platform,
            start_date: startDate,
            end_date: endDate
        });

        log(`${kategori} ${platform} - processData (${startDate} to ${endDate})`, port);
    });

const runKategori = async (kategori, platforms) => {
    const t0 = Date.now();

    await Promise.all(platforms.map(async (platform) => {
        await addDataUser(kategori, platform);
        await processData(kategori, platform);
    }));

    const t1 = Date.now();
    console.log(`✅ ${kategori} selesai (process fair) dalam ${(t1 - t0) / 1000}s`);
};

const runAll = async () => {
    const entries = Object.entries(kategoriMap);

    console.log("\n🚀 Memulai semua kategori secara paralel...");

    await Promise.all(
        entries.map(([kategori, platforms]) => runKategori(kategori, platforms))
    );

    console.log("\n🎉 Semua kategori selesai (processFair)!");
};

runAll();