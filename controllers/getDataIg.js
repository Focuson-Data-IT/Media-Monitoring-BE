require('dotenv').config(); // Load environment variables from .env file
const axios = require('axios');
const save = require('./saveDataIg');
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

// Fungsi untuk mendapatkan data User dari API
const getDataUser = async (username = null, client_account = null, kategori = null, platform = null) => {

    try {
        const encodedParams = new URLSearchParams();
        encodedParams.set('username_or_url', `${username}`);
        encodedParams.set('data', 'basic');

        const getUser = {
            method: 'POST',
            url: 'https://instagram-scraper-stable-api.p.rapidapi.com/ig_get_fb_profile.php',
            headers: {
                'x-rapidapi-key': process.env.RAPIDAPI_IG_KEY,
                'x-rapidapi-host': process.env.RAPIDAPI_IG_HOST,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            data: encodedParams,
        };

        // console.log('Request details:', getUser);

        const response = await apiRequestWithRetry(getUser);

        if (!response.data) {
            throw new Error('Response does not contain user data');
        }

        const userData = response.data;

        const user = {
            client_account: client_account,
            kategori: kategori,
            platform: platform,
            username: username,
            user_id: parseInt(userData.id),
            followers: userData.follower_count || 0,
            following: userData.following_count || 0,
            mediaCount: userData.media_count || 0,
            profile_pic_url: userData.profile_pic_url,
        };

        await save.saveUser(user);
    } catch (error) {
        console.error(`Error fetching data for user ${username}:`, error.message);
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
            // Buat encodedParams untuk pengiriman data dengan application/x-www-form-urlencoded
            const encodedParams = new URLSearchParams();
            encodedParams.set('username_or_url', `https://www.instagram.com/${username}/`);
            if (paginationToken) {
                encodedParams.set('pagination_token', paginationToken);
            }

            const getPost = {
                method: 'POST',
                url: 'https://instagram-scraper-stable-api.p.rapidapi.com/get_ig_user_posts.php',
                headers: {
                    'x-rapidapi-key': process.env.RAPIDAPI_IG_KEY,
                    'x-rapidapi-host': 'instagram-scraper-stable-api.p.rapidapi.com',
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                data: encodedParams,
            };

            const response = await apiRequestWithRetry(getPost);

            if (!response.data || !response.data.posts) {
                throw new Error('Response does not contain user data');
            }

            const userPosts = response.data.posts;

            for (const item of userPosts) {
                const isPinned = item.node.timeline_pinned_user_ids && item.node.timeline_pinned_user_ids.length > 0 ? 1 : 0;
                const postDate = new Date(item.node.taken_at * 1000).getTime();

                if (isPinned) {
                    const post = {
                        client_account: client_account,
                        kategori: kategori,
                        platform: platform,
                        user_id: item.node.user.id,
                        unique_id_post: item.node.pk,
                        username: item.node.user.username,
                        created_at: new Date(postDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                        thumbnail_url: item.node.thumbnails,
                        caption: item.node.accessibility_caption || '',
                        post_code: item.node.code,
                        comments: item.node.comment_count,
                        likes: item.node.like_count,
                        media_name: item.node.media_type,
                        product_type: item.node.product_type,
                        tagged_users: item.node.usertags?.in?.map(tag => tag.user.username).join(', ') || '',
                        is_pinned: isPinned,
                        followers: followers || 0, // Ambil dari database
                        following: following || 0,  // Ambil dari database
                        playCount: item.node.view_count || 0,
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
                    user_id: item.node.user.id,
                    unique_id_post: item.node.pk,
                    username: item.node.user.username,
                    created_at: new Date(postDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                    thumbnail_url: item.node.thumbnails,
                    caption: item.node.accessibility_caption || '',
                    post_code: item.node.code,
                    comments: item.node.comment_count,
                    likes: item.node.like_count,
                    media_name: item.node.media_type,
                    product_type: item.node.product_type,
                    tagged_users: item.node.usertags?.in?.map(tag => tag.user.username).join(', ') || '',
                    is_pinned: isPinned,
                    followers: followers || 0, // Ambil dari database
                    following: following || 0,  // Ambil dari database
                    playCount: item.node.view_count || 0,
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
                url: 'https://instagram-scraper-stable-api.p.rapidapi.com/get_post_comments.php',
                params: {
                    post_id: unique_id_post,
                    ...(paginationToken && { pagination_token: paginationToken })
                },
                headers: {
                    'X-RapidAPI-Key': process.env.RAPIDAPI_IG_KEY,
                    'X-RapidAPI-Host': process.env.RAPIDAPI_IG_HOST
                }
            };

            const response = await apiRequestWithRetry(getComment);

            if (!response.data || !response.data.comments) {
                moreComments = false;
                break;
            }

            const userComment = response.data.comments;

            for (const item of userComment) {
                // Simpan data comment utama
                const comment = {
                    client_account: client_account,
                    kategori: kategori,
                    platform: platform,
                    user_id: user_id,
                    username: username,
                    unique_id_post: unique_id_post,
                    comment_unique_id: item.pk,
                    created_at: new Date(item.created_at * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                    commenter_username: item.user.username,
                    commenter_userid: item.user.id,
                    comment_text: item.text,
                    comment_like_count: item.comment_like_count,
                    child_comment_count: item.child_comment_count
                };

                await save.saveComment(comment);

                // Jika terdapat child comments, iterasi dan simpan child comments
                if (item.preview_child_comments && item.preview_child_comments.length > 0) {
                    for (const child of item.preview_child_comments) {
                        const childComment = {
                            client_account: client_account,
                            kategori: kategori,
                            platform: platform,
                            user_id: user_id,
                            username: username,
                            unique_id_post: unique_id_post,
                            parent_comment_unique_id: item.pk, // Parent comment ID
                            comment_unique_id: child.pk, // Unique ID dari child comment
                            created_at: new Date(child.created_at * 1000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                            commenter_username: child.user.username,
                            commenter_userid: child.user.id,
                            comment_text: child.text,
                            comment_like_count: child.comment_like_count
                        };

                        await save.saveChildComment(childComment);
                    }
                }
            }

            paginationToken = response.data.pagination_token;
            if (!paginationToken) moreComments = false;
        }
    } catch (error) {
        console.error(`Error fetching data for ${unique_id_post}:`, error.message);
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
                'X-RapidAPI-Key': process.env.RAPIDAPI_IG_KEY,
                'X-RapidAPI-Host': process.env.RAPIDAPI_IG_HOST
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

module.exports = {
    getDataUser,
    getDataPost,
    getDataComment,
    getDataLikes
};
