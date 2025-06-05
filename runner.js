const { exec } = require('child_process');

function runCommand(command, retries = 0) {
    return new Promise((resolve, reject) => {
        console.log(`▶️ Running: ${command} (retry ${retries})`);
        exec(command, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
            if (error) {
                console.error(`❌ Error in ${command}:`, error.message);
                return reject(error);
            }
            if (stderr) console.warn(`⚠️ ${command} stderr:\n`, stderr);
            console.log(`✅ Success: ${command}`);
            resolve(stdout);
        });
    });
}

async function tryWithRetry(command, maxRetry = 2) {
    for (let i = 0; i <= maxRetry; i++) {
        try {
            return await runCommand(command, i);
        } catch (e) {
            if (i < maxRetry) {
                console.log(`🔁 Retry ${command}... (${i + 1})`);
            } else {
                throw new Error(`❌ ${command} failed after ${maxRetry + 1} attempts`);
            }
        }
    }
}

(async () => {
    console.log(`=== [${new Date().toLocaleString()}] Starting runner ===`);

    try {
        await tryWithRetry('node getData.js');
        await tryWithRetry('node getRes.js');
        await tryWithRetry('node addDataUser.js');
        // await tryWithRetry('node getFair.js');
        await tryWithRetry('node getFairDaily.js');
        await tryWithRetry('node getFairMonthly.js');
        console.log('✅ All scripts completed successfully.');
        process.exit(0);
    } catch (err) {
        console.error('🚨 Final failure:', err.message);
        process.exit(1);
    }
})();
