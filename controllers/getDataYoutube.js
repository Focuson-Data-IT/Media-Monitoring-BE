require('dotenv').config(); // Load environment variables from .env file
const axios = require('axios');
const save = require('./saveDataYoutube');
const db = require('../models/db'); // Database connection

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
        let paginationToken = null;
        let moreComments = true;

        while (moreComments) {
            const getComment = {
                method: 'GET',
                url: 'https://instagram-scraper-api2.p.rapidapi.com/v1/comments',
                params: {
                    code_or_id_or_url: unique_id_post,
                    sort_by: 'popular',
                    ...(paginationToken && { pagination_token: paginationToken })
                },
                headers: {
                    'X-RapidAPI-Key': process.env.RAPIDAPI_YT_KEY,
                    'X-RapidAPI-Host': process.env.RAPIDAPI_YT_HOST
                }
            };

            const response = await apiRequestWithRetry(getComment);

            if (!response.data || !response.data.data.items) {
                moreComments = false;
                break;
            }

            const userComment = response.data.data.items;

            for (const item of userComment) {
                // Simpan data comment utama
                const comment = {
                    client_account: client_account,
                    kategori: kategori,
                    platform: platform,
                    user_id: user_id,
                    username: username,
                    unique_id_post: unique_id_post,
                    comment_unique_id: item.id,
                    created_at: new Date(item.created_at * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                    commenter_username: item.user.username,
                    commenter_userid: item.user.id,
                    comment_text: item.text,
                    comment_like_count: item.like_count,
                    child_comment_count: item.child_comment_count
                };

                await save.saveComment(comment);

            }

            paginationToken = response.data.pagination_token;
            if (!paginationToken) moreComments = false;
        }
    } catch (error) {
        console.error(`Error fetching data for ${unique_id_post}:`, error.message);
    }
};

const getDataChildComment = async (unique_id_post =null, user_id = null, username = null, comment_unique_id = null, client_account= null, kategori = null, platform = null) => {
    
    console.info(unique_id_post, client_account, kategori, comment_unique_id, user_id, username, platform);

    try {
        let paginationToken = null;
        let moreComments = true;

        while (moreComments) {
            const getChildComment = {
                method: 'GET',
                url: 'https://instagram-scraper-api2.p.rapidapi.com/v1/comments_thread',
                params: {
                    code_or_id_or_url: unique_id_post,
                    comment_id: comment_unique_id,
                    ...(paginationToken && { pagination_token: paginationToken })
                },
                headers: {
                    'X-RapidAPI-Key': process.env.RAPIDAPI_YT_KEY,
                    'X-RapidAPI-Host': process.env.RAPIDAPI_YT_HOST
                }
            };

            const response = await apiRequestWithRetry(getChildComment);

            if (!response.data || !response.data.data.items) {
                moreComments = false;
                break;
            }

            const userComment = response.data.data.items;

            for (const child of userComment) {
                // Simpan data comment utama
                const childComment = {
                    client_account: client_account,
                    kategori: kategori,
                    platform: platform,
                    user_id: user_id,
                    username: username,
                    unique_id_post: unique_id_post,
                    parent_comment_unique_id: comment_unique_id, // Parent comment ID
                    comment_unique_id: child.id, // Unique ID dari child comment
                    created_at: new Date(child.created_at * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                    commenter_username: child.user.username,
                    commenter_userid: child.user.id,
                    comment_text: child.text,
                    comment_like_count: child.comment_like_count
                };

                await save.saveChildComment(childComment);

            }

            paginationToken = response.data.pagination_token;
            if (!paginationToken) moreComments = false;
        }
    } catch (error) {
        console.error(`Error fetching data for comment ${comment_unique_id} on post ${unique_id_post}:`, error.message);
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
    getDataChildComment,
    getDataLikes,
    getDataPostByKeyword
};
