const express = require('express');
const axios = require('axios');

var cors = require('cors')
require('dotenv').config();

const app = express();

const api = require('./routes/api');
const fair = require('./routes/fair');
const accounts = require('./routes/accounts');
const data = require('./routes/data');
const instagram = require('./routes/instagram');
const tiktok = require('./routes/tiktok');
const youtube = require('./routes/youtube');
const facebook = require('./routes/facebook');
const insights = require('./routes/insights');
const file = require('./routes/file');
const label = require('./routes/label');

// Middleware untuk parsing JSON dan URL-encoded form data
app.use(cors())
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function logMiddleware(req, res, next) {
    console.log = function (message) {
        process.stdout.write(message + '\n');
        // sendLogToClients(message);
    };
    next();
}

// Routes
app.use('/api', logMiddleware, api);
app.use('/fair', logMiddleware, fair);
app.use('/accounts', logMiddleware, accounts);
app.use('/data', logMiddleware, data);
app.use('/instagram', logMiddleware, instagram);
app.use('/tiktok', logMiddleware, tiktok);
app.use('/youtube', logMiddleware, youtube);
app.use('/facebook', logMiddleware, facebook);
app.use('/insights', logMiddleware, insights);
app.use('/api/file', logMiddleware, file);
app.use('/label', logMiddleware, label);

app.get('/proxy-image', async (req, res) => {
    try {
        const imageUrl = req.query.url;
        const response = await axios.get(imageUrl, {responseType: 'arraybuffer', timeout: 30000});
        res.set('Content-Type', 'image/jpeg');
        res.send(response.data);
    } catch (error) {
        res.status(500).send(error);
    }
});

// Jalankan server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server berjalan di http://localhost:${port}`);
});
