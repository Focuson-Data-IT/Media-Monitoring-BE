require('dotenv').config(); // Load environment variables from .env file
const axios = require('axios');
const save = require('./saveDataTiktok');

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
};

// Fungsi untuk mendapatkan data User dari API
const getDataUser = async (client_account = null, kategori = null, platform = null, username = null) => {
    try {
        const getUser = {
            method: 'GET',
            url: 'https://tiktok-api15.p.rapidapi.com/index/Tiktok/getUserInfo',
            params: {
                unique_id: `@${username}`
            },
            headers: {
                'X-RapidAPI-Key': process.env.RAPIDAPI_TIKTOK_KEY,
                'X-RapidAPI-Host': process.env.RAPIDAPI_TIKTOK_HOST
            }
        };

        const response = await apiRequestWithRetry(getUser);

        if (!response || !response.data) {
            throw new Error('Response does not contain user data');
        }

        const userData = response.data.data;

        const user = {
            client_account: client_account,
            kategori: kategori,
            username: username,
            platform: platform,
            user_id: userData.user.id,
            followers: userData.stats.followerCount || 0,
            following: userData.stats.followingCount || 0,
            mediaCount: userData.stats.videoCount || 0,
            profile_pic_url: userData.user.avatarThumb || '',
        };

        await save.saveUser(user);
    } catch (error) {
        console.error(`Error fetching data for user ${username}:`, error.message);
    }
};

// Fungsi untuk mendapatkan data Post dari API
const getDataPost = async (client_account = null, kategori = null, platform = null, username = null, followers = null, following = null) => {
    try {

        // Ambil startDate dari server
        const response = await fetch(`http://localhost:${process.env.PORT}/data/getDates`);
        const data = await response.json();

        const endDate = new Date(data.startDate).toISOString().split('T')[0];

        let cursor = null;
        let hasMore = true;
        let pageCount = 0; // Tambahkan variabel untuk menghitung halaman
        const endDateObj = new Date(endDate).getTime();

        while (hasMore) {
            const getPost = {
                method: 'GET',
                url: 'https://tiktok-api15.p.rapidapi.com/index/Tiktok/getUserVideos',
                params: {
                    unique_id: `@${username}`,
                    count: 35,
                    ...(cursor && { cursor: cursor })
                },
                headers: {
                    'X-RapidAPI-Key': process.env.RAPIDAPI_TIKTOK_KEY,
                    'X-RapidAPI-Host': process.env.RAPIDAPI_TIKTOK_HOST
                }
            };

            const response = await apiRequestWithRetry(getPost);

            if (!response || !response.data) {
                throw new Error('Response does not contain user data');
            }

            const userPosts = response.data.data.videos;

            for (const item of userPosts) {
                const isPinned = item.is_top ? 1 : 0;
                const postDate = new Date(item.create_time * 1000).getTime();

                if (isPinned) {
                    const post = {
                        client_account: client_account,
                        kategori: kategori,
                        platform: platform,
                        user_id: item.author.id,
                        unique_id_post: item.video_id,
                        username: username,
                        created_at: new Date(postDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                        thumbnail_url: item.cover,
                        caption: item.title || '',
                        post_code: item.code || '',
                        comments: item.comment_count,
                        likes: item.digg_count,
                        media_name: item.media_name || '',
                        product_type: item.media_type || '',
                        tagged_users: item.tagged_users?.in?.map(tag => tag.user.username).join(', ') || '',
                        is_pinned: isPinned,
                        followers: followers || 0, // Ambil dari database
                        following: following || 0,  // Ambil dari database
                        playCount: item.play_count || 0,
                        collectCount: item.collect_count || 0,
                        shareCount: item.share_count || 0,
                        downloadCount: item.download_count || 0,
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
                    user_id: item.author.id,
                    unique_id_post: item.video_id,
                    username: username,
                    created_at: new Date(postDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                    thumbnail_url: item.cover,
                    caption: item.title || '',
                    post_code: item.code || '',
                    comments: item.comment_count,
                    likes: item.digg_count,
                    media_name: item.media_name || '',
                    product_type: item.media_type || '',
                    tagged_users: item.tagged_users?.in?.map(tag => tag.user.username).join(', ') || '',
                    is_pinned: isPinned,
                    followers: followers || 0, // Ambil dari database
                    following: following || 0,  // Ambil dari database
                    playCount: item.play_count || 0,
                    collectCount: item.collect_count || 0,
                    shareCount: item.share_count || 0,
                    downloadCount: item.download_count || 0,
                };

                await save.savePost(post);
            }

            cursor = response.data.data.cursor;
            hasMorePage = response.data.data.hasMore;
            if (hasMorePage == false) hasMore = false;
            pageCount++; // Tambahkan penghitung halaman
            console.log(`Page count: ${pageCount}`); // Log jumlah halaman yang telah diproses
        }
    } catch (error) {
        console.error(`Error fetching data for user ${username}:`, error.message);
    }
};

// Fungsi untuk mendapatkan data Comment dari API
const getDataComment = async (unique_id_post = null, user_id = null, username = null, client_account = null, kategori = null, platform = null) => {
    try {
        let cursor = 0;
        let hasMore = true;
        let pageCount = 0; // Tambahkan variabel untuk menghitung halaman
        limitPage = 20;

        while (hasMore) {

            if (limitPage > 0 && pageCount >= limitPage) {
                console.log(`⏹️ Stopping at page limit (${limitPage}) for post ${unique_id_post}`);
                break;
            }

            const getComment = {
                method: 'GET',
                url: 'https://tiktok-api15.p.rapidapi.com/index/Tiktok/getCommentListByVideo',
                params: {
                    url: unique_id_post,
                    count: 50,
                    ...(cursor && { cursor: cursor })
                },
                headers: {
                    'X-RapidAPI-Key': process.env.RAPIDAPI_TIKTOK_KEY,
                    'X-RapidAPI-Host': process.env.RAPIDAPI_TIKTOK_HOST
                }
            };

            const response = await apiRequestWithRetry(getComment);

            if (!response.data || !response.data.data || !response.data.data.comments) {
                hasMore = false;
                break;
            }

            const userComment = response.data.data.comments;

            for (const item of userComment) {
                const postDate = new Date(item.create_time * 1000).getTime();
                const comment = {
                    client_account: client_account,
                    kategori: kategori,
                    platform: platform,
                    user_id: user_id,
                    username: username,
                    unique_id_post: unique_id_post,
                    comment_unique_id: item.id,
                    created_at: new Date(postDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                    commenter_username: item.user.unique_id,
                    commenter_userid: item.user.id,
                    comment_text: item.text,
                    comment_like_count: item.digg_count,
                    child_comment_count: item.reply_total
                };

                await save.saveComment(comment);
            }

            cursor = response.data.data.cursor;
            hasMorePage = response.data.data.hasMore;
            if (hasMorePage == false) hasMore = false;
            pageCount++; // Tambahkan penghitung halaman
            console.log(`Page count: ${pageCount}`); // Log jumlah halaman yang telah diproses
        }
    } catch (error) {
        console.error(`Error fetching data for ${unique_id_post}:`, error.message);
    }
};

// Fungsi untuk mendapatkan data Child Comment dari API
const getDataChildComment = async (unique_id_post =null, user_id = null, username = null, comment_unique_id = null, client_account= null, kategori = null, platform = null) => {
    try {
        let cursor = 0;
        let hasMore = true;
        let pageCount = 0; // Tambahkan variabel untuk menghitung halaman
        limitPage = 2;

        while (hasMore) {

            if (limitPage > 0 && pageCount >= limitPage) {
                console.log(`⏹️ Stopping at page limit (${limitPage}) for child comments on post ${unique_id_post}`);
                break;
            }
            
            const getChildComment = {
                method: 'GET',
                url: 'https://tiktok-api15.p.rapidapi.com/index/Tiktok/getReplyListByCommentId',
                params: {
                    comment_id: comment_unique_id,
                    video_id: unique_id_post,
                    count: 50,
                    ...(cursor && { cursor: cursor })
                },
                headers: {
                    'X-RapidAPI-Key': process.env.RAPIDAPI_TIKTOK_KEY,
                    'X-RapidAPI-Host': process.env.RAPIDAPI_TIKTOK_HOST
                }
            };

            const response = await apiRequestWithRetry(getChildComment);

            if (!response.data || !response.data.data || !response.data.data.comments) {
                hasMore = false;
                break;
            }

            const userComment = response.data.data.comments;

            for (const item of userComment) {
                const postDate = new Date(item.create_time * 1000).getTime();
                const childComment = {
                    client_account: client_account,
                    kategori: kategori,
                    platform: platform,
                    user_id: user_id,
                    username: username,
                    unique_id_post: unique_id_post,
                    comment_unique_id: comment_unique_id,
                    child_comment_unique_id: item.id,
                    created_at: new Date(postDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                    child_commenter_username: item.user.unique_id,
                    child_commenter_userid: item.user.id,
                    child_comment_text: item.text,
                    child_comment_like_count: item.digg_count
                };

                await save.saveChildComment(childComment);
            }

            cursor = response.data.data.cursor;
            hasMorePage = response.data.data.hasMore;
            if (hasMorePage == false) hasMore = false;
            pageCount++; // Tambahkan penghitung halaman
            console.log(`Page count: ${pageCount}`); // Log jumlah halaman yang telah diproses
        }
    } catch (error) {
        console.error(`Error fetching data for ${unique_id_post}:`, error.message);
    }
};

const getDataPostByKeyword = async (client_account = null, kategori = null, platform = null, keyword = null) => {
    try {

        let cursor = null;
        let hasMore = true;
        let pageCount = 0; // Tambahkan variabel untuk menghitung halaman
        
        while (hasMore) {
            const getPost = {
                method: 'GET',
                url: 'https://tiktok-api15.p.rapidapi.com/index/Tiktok/searchVideoListByKeywords',
                params: {
                    keywords: keyword,
                    count: 30,
                    ...(cursor && { cursor: cursor })
                },
                headers: {
                    'X-RapidAPI-Key': process.env.RAPIDAPI_TIKTOK_KEY,
                    'X-RapidAPI-Host': process.env.RAPIDAPI_TIKTOK_HOST
                }
            };

            const response = await apiRequestWithRetry(getPost);

            if (!response || !response.data) {
                throw new Error('Response does not contain user data');
            }

            const items = response.data.data.videos;

            for (const item of items) {
                const postDate = new Date(item.create_time * 1000).getTime();
                const dataPost = {
                    client_account: client_account,
                    kategori: kategori,
                    platform: platform,
                    keywords: keyword,
                    user_id: item.author.id,
                    username: item.author.unique_id,
                    unique_id_post: item.video_id,
                    created_at: new Date(postDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                    thumbnail_url: item.cover,
                    caption: item.title || '',
                    comments: item.comment_count,
                    likes: item.digg_count,
                    playCount: item.play_count || 0,
                    collectCount: item.collect_count || 0,
                    shareCount: item.share_count || 0,
                    downloadCount: item.download_count || 0,
                };

                await save.saveDataPostByKeywords(dataPost);
            }

            cursor = response.data.data.cursor;
            hasMorePage = response.data.data.hasMore;
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
    getDataPostByKeyword
};
