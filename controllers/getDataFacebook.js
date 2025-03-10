require('dotenv').config(); // Load environment variables from .env file
const axios = require('axios');
const save = require('./saveDataFacebook');
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
                'x-rapidapi-key': process.env.RAPIDAPI_FB_KEY, 
                'x-rapidapi-host': process.env.RAPIDAPI_FB_HOST
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
                    'X-RapidAPI-Key': process.env.RAPIDAPI_FB_KEY,
                    'X-RapidAPI-Host': process.env.RAPIDAPI_FB_HOST
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
                    'X-RapidAPI-Key': process.env.RAPIDAPI_FB_KEY,
                    'X-RapidAPI-Host': process.env.RAPIDAPI_FB_HOST
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
                    'X-RapidAPI-Key': process.env.RAPIDAPI_FB_KEY,
                    'X-RapidAPI-Host': process.env.RAPIDAPI_FB_HOST
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
                'X-RapidAPI-Key': process.env.RAPIDAPI_FB_KEY,
                'X-RapidAPI-Host': process.env.RAPIDAPI_FB_HOST
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

const getDataPostByKeyword = async (client_account = null, kategori = null, platform = null, keyword = null, start_date = null, end_date = null) => {
    try {

        let cursor = null;
        let hasMore = true;
        let pageCount = 0; // Tambahkan variabel untuk menghitung halaman
        
        while (hasMore) {
            const getPost = {
                method: 'GET',
                url: 'https://facebook-scraper3.p.rapidapi.com/search/posts',
                params: {
                    query: keyword,
                    start_date: start_date,
                    end_date: end_date,
                    ...(cursor && { cursor: cursor })
                },
                headers: {
                    'X-RapidAPI-Key': process.env.RAPIDAPI_FB_KEY,
                    'X-RapidAPI-Host': process.env.RAPIDAPI_FB_HOST
                }
            };

            const response = await axios.request(getPost);

            if (!response || !response.data) {
                throw new Error('Response does not contain user data');
            }

            const items = response.data.results;

            for (const item of items) {
                const postDate = new Date(item.timestamp * 1000).getTime();
                const dataPost = {
                    client_account: client_account,
                    kategori: kategori,
                    platform: platform,
                    keywords: keyword,
                    user_id: item.author.id,
                    username: item.author.name,
                    unique_id_post: item.post_id,
                    created_at: new Date(postDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                    thumbnail_url: item.video_thumbnail || item.image_thumbnail,
                    caption: item.message || '',
                    comments: item.comments_count,
                    likes: item.reactions.like,
                    shareCount: item.reshare_count || 0,
                };

                await save.saveDataPostByKeywords(dataPost);
            }

            cursor = response.data.cursor;
            hasMorePage = response.data.cursor ? true : false; // Cek apakah masih ada halaman selanjutnya
            if (hasMorePage == false) hasMore = false;
            pageCount++; // Tambahkan penghitung halaman
            console.log(`Page count: ${pageCount}`); // Log jumlah halaman yang telah diproses
            
        }
    } catch (error) {
        console.error(`Error fetching data for keyword ${keyword}:`, error.message);
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
