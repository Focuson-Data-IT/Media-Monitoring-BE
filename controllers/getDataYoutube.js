require('dotenv').config(); // Load environment variables from .env file
const axios = require('axios');
const save = require('./saveDataYoutube');
const db = require('../models/db'); // Database connection
const { text } = require('express');

// Fungsi untuk mengambil data followers dan following dari database
async function fetchUserData(username) {
    const [rows] = await db.query(`
        SELECT followers, following 
        FROM users 
        WHERE username = ?
    `, [username]);
    return rows[0];
}

// Fungsi helper untuk melakukan permintaan API dengan retry
const apiRequestWithRetry = async (config, maxRetries = 2) => {
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
}

// Fungsi untuk mendapatkan data User dari API
const getDataUser = async (username = null, client_account = null, kategori = null, platform = null) => {
    try {
        const getUser = {
            method: 'GET',
            url: 'https://instagram-scraper-api2.p.rapidapi.com/v1/info',
            params: {
                username_or_id_or_url: username, // ✅ Gunakan langsung tanpa template literal jika sudah string
                include_about: 'true',
                url_embed_safe: 'true'
            },
            headers: {
                'x-rapidapi-key': process.env.RAPIDAPI_YT_KEY, 
                'x-rapidapi-host': process.env.RAPIDAPI_YT_HOST
            }
        };

        console.log('Request details:', getUser); // Debugging

        const response = await axios.request(getUser);

        // console.info('Response:', response.data);

        if (!response.data) {
            throw new Error('Response does not contain user data');
        }

        const userData = response.data.data;

        const user = {
            client_account: client_account,
            kategori: kategori,
            platform: platform,
            username: username,
            user_id: userData.id,
            followers: userData.follower_count || 0,
            following: userData.following_count || 0,
            mediaCount: userData.media_count || 0,
            profile_pic_url: userData.profile_pic_url,
        };

        await save.saveUser(user);
    } catch (error) {
        if (error.response) {
            console.error('API Error:', error.response.status, error.response.data);
        } else {
            console.error('Request failed:', error.message);
        }
    }
};

// Fungsi untuk mendapatkan data Post dari API
const getDataPost = async (username = null, client_account = null, kategori = null, platform = null, followers = null, following = null) => {
    try {
        // Ambil startDate dari server
        const response = await fetch(`http://localhost:${process.env.PORT}/data/getDates`);
        const data = await response.json();
        const endDate = new Date(data.startDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).split('T')[0];

        let paginationToken = null;
        let morePosts = true;
        const endDateObj = new Date(endDate).getTime();

        while (morePosts) {
            const getPost = {
                method: 'GET',
                url: 'https://instagram-scraper-api2.p.rapidapi.com/v1/posts',
                params: {
                    username_or_id_or_url: username,
                    url_embed_safe: 'true',
                    ...(paginationToken && { pagination_token: paginationToken })
                },
                headers: {
                    'X-RapidAPI-Key': process.env.RAPIDAPI_YT_KEY,
                    'X-RapidAPI-Host': process.env.RAPIDAPI_YT_HOST
                }
            };

            const response = await apiRequestWithRetry(getPost);

            if (!response || !response.data) {
                throw new Error('Response does not contain user data');
            }

            const userPosts = response.data.data.items;
            const userData = response.data.data.user;

            for (const item of userPosts) {
                const isPinned = item.is_pinned ? 1 : 0;
                const postDate = new Date(item.taken_at * 1000).getTime();
                const captionText = item.caption || "No Caption";

                if (isPinned) {
                    const post = {
                        client_account: client_account,
                        kategori: kategori,
                        platform: platform,
                        user_id: userData.id,
                        unique_id_post: item.id,
                        username: username,
                        created_at: new Date(postDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                        thumbnail_url: item.thumbnail_url,
                        caption: captionText.text || "No Caption",
                        post_code: item.code,
                        comments: item.comment_count,
                        likes: item.like_count,
                        media_name: item.media_name,
                        product_type: item.product_type,
                        tagged_users: item.tagged_users?.in?.map(tag => tag.user.username).join(', ') || '',
                        is_pinned: isPinned,
                        followers: followers || 0, // Ambil dari database
                        following: following || 0,  // Ambil dari database
                        playCount: item.play_count || 0,
                        shareCount: item.share_count || 0,
                    };

                    await save.savePost(post);
                    continue;
                }

                if (postDate < endDateObj) {
                    return;
                }

                const post = {
                    client_account: client_account,
                    kategori: kategori,
                    platform: platform,
                    user_id: userData.id,
                    unique_id_post: item.id,
                    username: username,
                    created_at: new Date(postDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                    thumbnail_url: item.thumbnail_url,
                    caption: captionText.text || "No Caption",
                    post_code: item.code,
                    comments: item.comment_count,
                    likes: item.like_count,
                    media_name: item.media_name,
                    product_type: item.product_type,
                    tagged_users: item.tagged_users?.in?.map(tag => tag.user.username).join(', ') || '',
                    is_pinned: isPinned,
                    followers: followers || 0, // Ambil dari database
                    following: following || 0,  // Ambil dari database
                    playCount: item.play_count || 0,
                    shareCount: item.share_count || 0,
                };

                await save.savePost(post);
            }

            paginationToken = response.data.pagination_token;
            if (!paginationToken) morePosts = false;
        }
    } catch (error) {
        console.error(`Error fetching data for user ${username}:`, error.message);
    }
};

const getDataComment = async (unique_id_post = null, user_id = null, username = null, client_account = null, kategori = null, platform = null) => {
    try {
        console.info(unique_id_post, user_id, username, client_account, kategori, platform);

        let nextPageToken = null;
        let moreComments = true;
        let pageCount = 0;
        const limitPage = 20;

        while (moreComments && pageCount < limitPage) {
            const getComment = {
                method: 'GET',
                url: 'https://youtube-v311.p.rapidapi.com/commentThreads/',
                params: {
                    part: 'snippet,replies',
                    videoId: unique_id_post,
                    maxResults: '100',
                    order: 'relevance',
                    textFormat: 'plainText',
                    ...(nextPageToken && { pageToken: nextPageToken }) // 🔹 Perbaikan dari `nextPageToken` ke `pageToken`
                },
                headers: {
                    'X-RapidAPI-Key': process.env.RAPIDAPI_YT_KEY,
                    'X-RapidAPI-Host': process.env.RAPIDAPI_YT_HOST
                }
            };

            const response = await apiRequestWithRetry(getComment);

            if (!response.data || !response.data.items || response.data.items.length === 0) {
                moreComments = false;
                break;
            }

            const userComment = response.data.items;
            let mainCommentsBatch = [];
            let childCommentsBatch = [];

            for (const item of userComment) {
                const data = item.snippet.topLevelComment;
                const itemsChild = item.replies?.comments || []; // 🔹 Perbaikan: Jika `item.replies` undefined, return array kosong
                const snippet = data.snippet;

                // 🔹 Simpan data main comment
                mainCommentsBatch.push({
                    client_account: client_account,
                    kategori: kategori,
                    platform: platform,
                    user_id: user_id,
                    username: username,
                    unique_id_post: unique_id_post,
                    comment_unique_id: data.id,
                    created_at: new Date(snippet.publishedAt).toISOString().slice(0, 19).replace('T', ' '),
                    commenter_username: snippet.authorDisplayName,
                    commenter_userid: snippet.authorChannelId?.value || "Unknown", // 🔹 Gunakan `?.` untuk menghindari error
                    comment_text: snippet.textDisplay,
                    comment_like_count: snippet.likeCount,
                    child_comment_count: item.totalReplyCount
                });

                // 🔹 Simpan data child comments
                for (const itemChild of itemsChild) {
                    const snippetChild = itemChild.snippet;
                    childCommentsBatch.push({
                        client_account: client_account,
                        kategori: kategori,
                        platform: platform,
                        user_id: user_id,
                        username: username,
                        unique_id_post: unique_id_post,
                        parent_comment_unique_id: data.id, // Parent comment ID
                        child_comment_unique_id: itemChild.id, // Unique ID dari child comment
                        created_at: new Date(snippetChild.publishedAt).toISOString().slice(0, 19).replace('T', ' '),
                        child_commenter_username: snippetChild.authorDisplayName,
                        child_commenter_userid: snippetChild.authorChannelId?.value || "Unknown", // 🔹 Gunakan `?.` agar aman
                        child_comment_text: snippetChild.textDisplay,
                        child_comment_like_count: snippetChild.likeCount
                    });
                }
            }

            // 🔹 Simpan data secara paralel untuk meningkatkan performa
            await Promise.all([
                save.saveComment(mainCommentsBatch),
                save.saveChildComment(childCommentsBatch)
            ]);

            nextPageToken = response.data.nextPageToken;
            if (!nextPageToken) moreComments = false;
            pageCount++;
            console.log(`✅ Processed page ${pageCount}`);
        }
    } catch (error) {
        console.error(`❌ Error fetching data for ${unique_id_post}:`, error.message);
    }
};

// Fungsi untuk mendapatkan data Post dari API
const getDataLikes = async (post_code = null, created_at = null, client_account = null, kategori = null, platform = null) => {
    try {
        const getLikes = {
            method: 'GET',
            url: 'https://instagram-scraper-api2.p.rapidapi.com/v1/likes',
            params: {
                code_or_id_or_url: post_code,
            },
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_YT_KEY,
                'X-RapidAPI-Host': process.env.RAPIDAPI_YT_HOST
            }
        };

        const response = await apiRequestWithRetry(getLikes);

        if (!response.data || !response.data.data) {
            throw new Error('Response does not contain user data');
        }

        const userLikes = response.data.data.items;

        for (const item of userLikes) {

            const likes = {
                client_account: client_account,
                kategori: kategori,
                platform: platform,
                post_code: post_code,
                user_id: item.id,
                username: item.username,
                fullname: item.full_name,
                created_at: new Date(created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),

            };

            await save.saveLikes(likes);
        }
    } catch (error) {
        console.error(`Error fetching data for user ${username}:`, error.message);
    }
};

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const getDataPostByKeyword = async (client_account = null, kategori = null, platform = null, keyword = null, start_date = null, end_date = null) => {
    try {
        let nextPageToken = null;
        let hasMore = true;
        let pageCount = 0;
        let totalFetched = 0;
        const maxResultsPerPage = 50;
        const maxTotalResults = 150; // Batas maksimal 150 video
        const maxRequestsPerSecond = 5; // Batas 5 request per detik

        const startDateTime = new Date(start_date).toISOString();
        const endDateTime = new Date(end_date).toISOString();

        while (hasMore && totalFetched < maxTotalResults) {
            console.log(`Fetching page ${pageCount + 1}...`);

            // Fetch daftar video
            const getPost = {
                method: 'GET',
                url: 'https://youtube-v311.p.rapidapi.com/search/',
                params: {
                    part: 'snippet',
                    maxResults: maxResultsPerPage,
                    order: 'relevance',
                    publishedAfter: startDateTime,
                    publishedBefore: endDateTime,
                    q: keyword,
                    regionCode: 'ID',
                    relevanceLanguage: 'id',
                    safeSearch: 'none',
                    type: 'video',
                    ...(nextPageToken && { pageToken: nextPageToken })
                },
                headers: {
                    'X-RapidAPI-Key': process.env.RAPIDAPI_YT_KEY,
                    'X-RapidAPI-Host': process.env.RAPIDAPI_YT_HOST
                }
            };

            await delay(200); // Tambahkan delay untuk mengontrol rate limit
            const response = await axios.request(getPost);

            if (!response || !response.data || !response.data.items) {
                throw new Error('Response does not contain video data');
            }

            const items = response.data.items;
            totalFetched += items.length;

            // Ambil video ID untuk fetch statistik
            const videoIds = items.map(item => item.id.videoId).filter(Boolean);
            console.info('Fetching statistics for videos:', videoIds);

            // **Batas Maksimum 5 Request per Detik**
            let statsResponses = [];
            for (let i = 0; i < videoIds.length; i += maxRequestsPerSecond) {
                const batch = videoIds.slice(i, i + maxRequestsPerSecond);

                console.log(`Fetching statistics for batch: ${batch}`);

                const batchResponses = await Promise.allSettled(batch.map(async videoId => {
                    const statsRequest = {
                        method: 'GET',
                        url: 'https://youtube-v311.p.rapidapi.com/videos/',
                        params: {
                            part: 'snippet,contentDetails,statistics',
                            id: videoId
                        },
                        headers: {
                            'X-RapidAPI-Key': process.env.RAPIDAPI_YT_KEY,
                            'X-RapidAPI-Host': process.env.RAPIDAPI_YT_HOST
                        }
                    };
                    return axios.request(statsRequest);
                }));

                statsResponses.push(...batchResponses);
                await delay(1000); // Tunggu 1 detik sebelum batch berikutnya
            }

            // Mapping data video & statistik
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                const statsResponse = statsResponses[i];

                let videoStats = {
                    thumbnail_url: item.snippet?.thumbnails?.standard?.url || item.snippet?.thumbnails?.default?.url || '',
                    title: item.snippet?.title || "No Title",
                    caption: item.snippet?.description || "No Description",
                    likeCount: 0,
                    commentCount: 0,
                    viewCount: 0,
                    favoriteCount: 0,
                    shareCount: 0
                };

                if (statsResponse.status === 'fulfilled' && statsResponse.value.data.items?.length > 0) {
                    const stats = statsResponse.value.data.items[0]?.statistics || {};
                    videoStats.likeCount = parseInt(stats.likeCount || 0);
                    videoStats.commentCount = parseInt(stats.commentCount || 0);
                    videoStats.viewCount = parseInt(stats.viewCount || 0);
                    videoStats.favoriteCount = parseInt(stats.favoriteCount || 0);
                    videoStats.shareCount = parseInt(stats.shareCount || 0);
                }

                const dataPost = {
                    client_account: client_account,
                    kategori: kategori,
                    platform: platform,
                    keywords: keyword,
                    user_id: item.snippet.channelId,
                    username: item.snippet.channelTitle,
                    unique_id_post: item.id.videoId,
                    created_at: new Date(item.snippet.publishedAt).toISOString().slice(0, 19).replace('T', ' '),
                    thumbnail_url: videoStats.thumbnail_url,
                    title: videoStats.title,
                    caption: videoStats.caption,
                    comments: videoStats.commentCount,
                    playCount: videoStats.viewCount,
                    collectCount: videoStats.favoriteCount,
                    likes: videoStats.likeCount,
                    shareCount: videoStats.shareCount
                };

                await save.saveDataPostByKeywords(dataPost);
            }

            // Update token halaman berikutnya
            nextPageToken = response.data.nextPageToken;
            hasMore = !!nextPageToken && totalFetched < maxTotalResults;
            pageCount++;

            console.log(`✅ Page ${pageCount} processed. Total videos fetched: ${totalFetched}`);
        }

        console.log("✅ Finished fetching YouTube videos.");
    } catch (error) {
        console.error(`❌ Error fetching data for keyword "${keyword}":`, error.message);
    }
};

module.exports = {
    getDataUser,
    getDataPost,
    getDataComment,
    // getDataChildComment,
    getDataLikes,
    getDataPostByKeyword
};
