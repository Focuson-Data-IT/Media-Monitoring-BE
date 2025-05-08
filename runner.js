const { exec } = require('child_process');

exec('node getData.js', (err) => {
    if (err) return console.error('getData.js error:', err); // STOP di sini kalau error
    exec('node getRes.js', (err2) => {
        if (err2) return console.error('getRes.js error:', err2); // STOP di sini
        exec('node getFair.js', (err3) => {
            if (err3) return console.error('getFair.js error:', err3); // STOP di sini
            console.log('All done!');
        });
    });
});
