const axios = require("axios");
const { DateTime } = require("luxon");

const kategoriMap = {
    "opdbekasikab": ["instagram"],
    "prokopim_bekasikab": ["instagram"],
    "disparbud": ["instagram", "tiktok"],
    "disparbud_competitor2": ["instagram", "tiktok"],
    "disparbud_ambassador": ["instagram", "tiktok"],
    "opdbandung": ["instagram"],
    "parfum": ["tiktok"]
};

const portPool = [7771];
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

const addDataUser = async (kategori, platform, startDate, endDate) =>
    runWithPort(async (port) => {
        console.info('startDate', startDate);
        console.info('endDate', endDate);

        await axios.post(`http://localhost:${port}/fair/addDataUser`, {
            kategori, platform, startDate, endDate
        });
        log(`${kategori} ${platform} - addDataUser`, port);
    });

const processData = async (kategori, platform, startDate, endDate) =>
    runWithPort(async (port) => {
        console.info('startDate', startDate);
        console.info('endDate', endDate);

        await axios.post(`http://localhost:${port}/fair/processData`, {
            kategori, platform, start_date: startDate, end_date: endDate
        });
        log(`${kategori} ${platform} - processData (${startDate} to ${endDate})`, port);
    });

const prosesPerformaKonten = async (startDate, endDate) =>
    runWithPort(async (port) => {
        await axios.post(`http://localhost:${port}/api/ProsesPerformaKonten`, {
            startDate,
            endDate
        });
        log(`${startDate} to ${endDate} - ProsesPerformaKonten`, port);
    });

const runKategori = async (kategori, platforms) => {
    const t0 = Date.now();

    const now = DateTime.now().setZone("Asia/Jakarta");
    const startDate = now.minus({ days: 2 }).toISODate();
    const endDate = now.minus({ days: 1 }).toISODate();

    for (const platform of platforms) {
        await addDataUser(kategori, platform, startDate, endDate);
        await delay(1000);
        await processData(kategori, platform, startDate, endDate);
        await delay(1000);
    }

    await prosesPerformaKonten(startDate, endDate);

    const t1 = Date.now();
    console.log(`✅ ${kategori} selesai (process fair) dalam ${(t1 - t0) / 1000}s`);
};

const runAll = async () => {
    const entries = Object.entries(kategoriMap);

    console.log("\n🚀 Memulai semua kategori secara paralel...\n");

    await Promise.all(
        entries.map(([kategori, platforms]) => runKategori(kategori, platforms))
    );

    console.log("\n🎉 Semua kategori selesai (processFair)!");
};

runAll();