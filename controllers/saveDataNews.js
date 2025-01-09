const connection = require('../models/db');

// fungsi untuk menyimpan data news ke database
const saveNews = async (news) => {
    const sql = `
    INSERT INTO news (query, title, link, snippet, photo_url, thumbnail_url, published_datetime_utc, source_url, source_name, source_logo_url, source_favicon_url, source_publication_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
        query = VALUES(query),
        title = VALUES(title),
        link = VALUES(link),
        snippet = VALUES(snippet),
        photo_url = VALUES(photo_url),
        thumbnail_url = VALUES(thumbnail_url),
        published_datetime_utc = VALUES(published_datetime_utc),
        source_url = VALUES(source_url),
        source_name = VALUES(source_name),
        source_logo_url = VALUES(source_logo_url),
        source_favicon_url = VALUES(source_favicon_url),
        source_publication_id = VALUES(source_publication_id)
    `;
    connection.query(sql, [
        news.query, news.title, news.link, news.snippet, news.photo_url, news.thumbnail_url, news.published_datetime_utc, news.source_url, news.source_name, news.source_logo_url, news.source_favicon_url, news.source_publication_id
    ],
        (err, result) => {
            if (err) {
                console.error(`Error saving post ${likes.post_code} to database:`, err.message);
            } else {
                console.log(`Saved post ${likes.post_code} to database`);
            }
        }
    );
};

module.exports = {
    saveNews
};
