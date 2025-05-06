require('dotenv').config(); // Load environment variables from .env file
const axios = require('axios');
const save = require('./saveDataNews');


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

        const response = await axios.request(getNews);

        const userNews = response?.data?.data;

        if (!Array.isArray(userNews)) {
            throw new Error('Response format invalid: data is not array');
        }

        for (const item of userNews) {
            const news = {
                query: query,
                title: item?.title || "",
                link: item?.link || "",
                snippet: item?.snippet || "",
                photo_url: item?.photo_url || "",
                thumbnail_url: item?.thumbnail_url || "",
                published_datetime_utc: item?.published_datetime_utc
                    ? new Date(item.published_datetime_utc).toISOString().slice(0, 19).replace('T', ' ')
                    : null,
                source_url: item?.source_url || "",
                source_name: item?.source_name || "",
                source_favicon_url: item?.source_favicon_url || ""
            };

            await save.saveNews(news);
        }

    } catch (error) {
        console.error(`❌ Error fetching data for news "${query}":`, error.message);
    }
};

module.exports = {
    getDataNews
};
