require('dotenv').config(); // Load environment variables from .env file
const axios = require('axios');
const save = require('./saveDataNews');


// Fungsi helper untuk melakukan permintaan API dengan retry
const apiRequestWithRetry = async (config, maxRetries = 5) => {
    let attempts = 0;
    while (attempts < maxRetries) {
        try {
            const response = await axios.request(config);
            return response; // Jika berhasil, langsung return response
        } catch (error) {
            attempts++;
            console.error(`Error fetching data (Attempt ${attempts} of ${maxRetries}):`, error.message);
            if (attempts === maxRetries) throw new Error('Max retries reached. Stopping.');
        }
    }
};


// Fungsi untuk mendapatkan data News dari API
const getDataNews = async (query = null) => {
    try {
        const getNews = {
            method: 'GET',
            url: 'https://real-time-news-data.p.rapidapi.com/search',
            params: {
                query: query,
                limit: '500',
                time_published: '1d',
                country: 'ID',
                lang: 'id'

            },
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_NEWS_KEY,
                'X-RapidAPI-Host': process.env.RAPIDAPI_NEWS_HOST
            }
        };

        const response = await apiRequestWithRetry(getNews);

        if (!response.data || !response.data.data) {
            throw new Error('Response does not contain user data');
        }

        const userNews = response.data.data;

        for (const item of userNews) {

            const news = {
                query: query,
                title: item.title,
                link: item.link,
                snippet: item.snippet,
                photo_url: item.photo_url,
                thumbnail_url: item.thumbnail_url,
                published_datetime_utc : new Date(item.published_datetime_utc).toISOString().slice(0, 19).replace('T', ' '),
                source_url: item.source_url,
                source_name: item.source_name,
                source_logo_url: item.source_logo_url,
                source_favicon_url: item.source_favicon_url,
                source_publication_id: item.source_publication_id

            };

            await save.saveNews(news);
        }
    } catch (error) {
        console.error(`Error fetching data for news ${query}:`, error.message);
    }
};

module.exports = {
    getDataNews
};
