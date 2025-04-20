require('dotenv').config(); // Load environment variables from .env file
const axios = require('axios');
const save = require('./saveDataTiktok');
const db = require('../models/db'); // Pastikan ini diatur sesuai koneksi database Anda

const chunkArray = (array, size) => {
    const chunkedArr = [];
    for (let i = 0; i < array.length; i += size) {
        chunkedArr.push(array.slice(i, i + size));
    }
    return chunkedArr;
};

let userCache = {};

// Fungsi untuk mendapatkan data User dari API
const getDataUser = async (kategori = null, platform = null) => {
    try {

        const [rows] = await db.query('SELECT * FROM listAkun WHERE platform = ? AND FIND_IN_SET(?, kategori)', [platform, kategori]);

        if (!rows.length) {
            return console.log('No users found in the database.');
        }

        const batchSize = 50; // Jumlah row yang diproses per batch
        const rowBatches = chunkArray(rows, batchSize);

        for (const batch of rowBatches) {
            console.info(`Processing batch of ${batch.length} users...`)

            await Promise.all(batch.map(async (row) => {
                let retryCount = 0;
                const maxRetries = 3;

                while (retryCount < maxRetries) {
                    try {
                        console.info(`Fetching data for user: ${row.username}`);
    
                        const getUser = {
                            method: 'GET',
                            url: 'https://tiktok-api15.p.rapidapi.com/index/Tiktok/getUserInfo',
                            params: {
                                unique_id: `@${row.username}`
                            },
                            headers: {
                                'X-RapidAPI-Key': process.env.RAPIDAPI_TIKTOK_KEY,
                                'X-RapidAPI-Host': process.env.RAPIDAPI_TIKTOK_HOST
                            }
                        };
    
                        const response = await axios.request(getUser);
    
                        if (!response.data?.data) {
                            console.warn(`🚫 No data found for user: ${row.username}`);
                            return;
                        }
                            const userData = response.data.data;
    
                            const user = {
                                client_account: row.client_account,
                                kategori: kategori,
                                platform: platform,
                                username: row.username,
                                user_id: userData.user.id,
                                followers: userData.stats.followerCount || 0,
                                following: userData.stats.followingCount || 0,
                                mediaCount: userData.stats.videoCount || 0,
                                profile_pic_url: userData.user.avatarThumb || '',
                            };
                            
                            await save.saveUser(user);
    
                            // Simpan ke cache
                            userCache[row.username] = {
                                followers: userData.stats.followerCount || 0,
                                following: userData.stats.followingCount || 0
                            };
    
                            console.info(`✅ Successfully saved data for user: ${row.username}`);
                            break; 

                    } catch (error) {                        
                        retryCount++;

                        if (error.response) {
                            console.error(`❌ API Error for ${row.username}:`, error.response.status, error.response.data);
                        } else {
                            console.error(`❌ Request failed for ${row.username}:`, error.message);
                            await new Promise(resolve => setTimeout(resolve, 5000));
                        }
                    }
                }
            }));

            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1 detik antara batch
        }

        console.log('Data User berhasil diperbarui untuk semua pengguna.');
    } catch (error) {
        console.error('Error executing function:', error.message);
    }
};

// Fungsi untuk mendapatkan data Post dari API
const getDataPost = async (kategori = null, platform = null) => {
    try {
        const [rows] = await db.query(`
            SELECT * FROM listAkun
            WHERE platform = ? AND FIND_IN_SET(?, kategori)
        `, [platform, kategori]);

        if (!rows.length) {
            console.log('No users found.');
            return;
        }

        // const response = await fetch(`http://localhost:${process.env.PORT}/data/getDates`);
        // const data = await response.json();
        // const endDate = new Date(data.startDate).toISOString().split('T')[0];
        // const endDateObj = new Date(endDate).getTime();

        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 5); // Kurangi 1 hari dari hari ini
        const endDates = endDate.toISOString().split('T')[0];
        const endDateObj = new Date(endDates).getTime();

        const batchSize = 5; // Jumlah akun yang diproses per batch
        const rowBatches = chunkArray(rows, batchSize);

        for (const batch of rowBatches) {
            console.info(`🚀 Processing batch of ${batch.length} users...`);

            await Promise.all(batch.map(async (row) => {
                let retryCount = 0;
                const maxRetries = 3; // Maksimal retry per user
                
                while (retryCount < maxRetries) {
                    try {
                        console.info(`Fetching data for user: ${row.username}`);
    
                        const userInfoRes = await axios.request({
                            method: 'GET',
                            url: 'https://tiktok-api15.p.rapidapi.com/index/Tiktok/getUserInfo',
                            params: {
                                unique_id: `@${row.username}`
                            },
                            headers: {
                                'X-RapidAPI-Key': process.env.RAPIDAPI_TIKTOK_KEY,
                                'X-RapidAPI-Host': process.env.RAPIDAPI_TIKTOK_HOST
                            }
                        });

                        const userData = userInfoRes.data?.data;
                        if (!userData) {
                            console.warn(`🚫 No data found for user: ${row.username}`);
                            return;
                        }
                        
                        await save.saveUser({
                            client_account: row.client_account,
                            kategori: kategori,
                            platform: platform,
                            username: row.username,
                            user_id: userData.user.id,
                            followers: userData.stats.followerCount || 0,
                            following: userData.stats.followingCount || 0,
                            mediaCount: userData.stats.videoCount || 0,
                            profile_pic_url: userData.user.avatarThumb || '',
                        })

                        let cursor = null;
                        let hasMore = true;
                        let pageCount = 0;

                        while (hasMore) {
                            const getPost = {
                                method: 'GET',
                                url: 'https://tiktok-api15.p.rapidapi.com/index/Tiktok/getUserVideos',
                                params: {
                                    unique_id: `@${row.username}`,
                                    count: 35,
                                    ...(cursor && { cursor: cursor })
                                },
                                headers: {
                                    'X-RapidAPI-Key': process.env.RAPIDAPI_TIKTOK_KEY,
                                    'X-RapidAPI-Host': process.env.RAPIDAPI_TIKTOK_HOST
                                }
                            };

                            const response = await axios.request(getPost);

                            if (!response.data?.data?.videos) {
                                console.warn(`No videos found for user: ${row.username}`);
                                break;
                            }

                            const userPosts = response.data.data.videos;

                            for (const item of userPosts) {
                                const isPinned = item.is_top ? 1 : 0;
                                const postDate = new Date(item.create_time * 1000).getTime();

                                if (isPinned) {
                                    const post = {
                                        client_account: row.client_account,
                                        kategori: row.kategori,
                                        platform: row.platform,
                                        user_id: item.author.id,
                                        unique_id_post: item.video_id,
                                        username: row.username,
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
                                        followers: userData.stats.followerCount || 0,
                                        following: userData.stats.followingCount || 0,
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
                                    client_account: row.client_account,
                                    kategori: row.kategori,
                                    platform: row.platform,
                                    user_id: item.author.id,
                                    unique_id_post: item.video_id,
                                    username: row.username,
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
                                    followers: userData.stats.followerCount || 0,
                                    following: userData.stats.followingCount || 0,
                                    playCount: item.play_count || 0,
                                    collectCount: item.collect_count || 0,
                                    shareCount: item.share_count || 0,
                                    downloadCount: item.download_count || 0,
                                };
                                
                                await save.savePost(post);
                            }
                            cursor = response.data?.data?.cursor;
                            hasMore = response.data?.data?.hasMore;
                            pageCount++;
                            console.log(`Page count: ${pageCount}`);
                        }
                        console.info(`✅ Finished processing posts for user: ${row.username}`);
                        break; // Jika berhasil, keluar dari loop retry
                    } catch (error) {
                        retryCount++;
                        console.error(`❌ Error fetching posts for ${row.username} (Attempt ${retryCount})`, error.message);

                        if (retryCount >= maxRetries) {
                            console.error(`❌ Failed to fetch posts for ${row.username} after ${maxRetries} attempts.`);
                        } else {
                            console.warn(`⚠️ Retrying for ${row.username} in 5 seconds...`);
                            await new Promise(resolve => setTimeout(resolve, 2000)); // Delay 5 detik sebelum retry
                        }
                    }
                }
            }));

            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1 detik antara batch
        }

        console.log('Data posts berhasil diperbarui untuk semua pengguna.');
    } catch (error) {
        console.error('Error executing function:', error.message);
    }
};

// Fungsi untuk mendapatkan data Comment dari API
const getDataComment = async (kategori = null, platform = null) => {
    try {
        const [rows] = await db.query(`
            SELECT * FROM posts 
            WHERE platform = ? AND FIND_IN_SET(?, kategori)
              AND comments_processed = 0 AND comments > 0
        `, [platform, kategori]);

        if (!rows.length) return console.log('📭 No posts found to process.');

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            console.info(`\n🔍 [${i + 1}/${rows.length}] Processing post: ${row.unique_id_post}`);

            let retry = 0;
            let success = false;

            while (retry < 3 && !success) {
                try {
                    let cursor = 0;
                    let hasMore = true;
                    let pageCount = 0;

                    while (hasMore) {
                        const response = await axios.get('https://tiktok-api15.p.rapidapi.com/index/Tiktok/getCommentListByVideo', {
                            params: {
                                url: row.unique_id_post,
                                count: 50,
                                ...(cursor && { cursor })
                            },
                            headers: {
                                'X-RapidAPI-Key': process.env.RAPIDAPI_TIKTOK_KEY,
                                'X-RapidAPI-Host': process.env.RAPIDAPI_TIKTOK_HOST
                            }
                        });

                        const comments = response?.data?.data?.comments || [];
                        if (!comments.length) break;

                        for (const item of comments) {
                            const postDate = new Date(item.create_time * 1000);
                            await save.saveComment({
                                client_account: row.client_account,
                                kategori, platform,
                                user_id: row.user_id,
                                username: row.username,
                                unique_id_post: row.unique_id_post,
                                comment_unique_id: item.id,
                                created_at: postDate.toISOString().slice(0, 19).replace('T', ' '),
                                commenter_username: item.user.unique_id,
                                commenter_userid: item.user.id,
                                comment_text: item.text,
                                comment_like_count: item.digg_count,
                                child_comment_count: item.reply_total
                            });
                        }

                        cursor = response.data.data.cursor;
                        hasMore = response.data.data.hasMore;
                        pageCount++;
                        console.log(`✅ Page ${pageCount} processed`);
                    }

                    await db.query(`UPDATE posts SET comments_processed = 1 WHERE unique_id_post = ?`, [row.unique_id_post]);
                    console.log(`🎉 Done: ${row.unique_id_post}`);
                    success = true;

                } catch (err) {
                    retry++;
                    console.error(`❌ Error post ${row.unique_id_post} (try ${retry}):`, err.message);
                    if (retry >= 3) {
                        await db.query(`UPDATE posts SET comments_processed = 0 WHERE unique_id_post = ?`, [row.unique_id_post]);
                    } else {
                        console.warn('⏳ Retrying in 5s...');
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('✅ Semua komentar berhasil diproses!');
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
    }
};

// Fungsi untuk mendapatkan data Child Comment dari API
const getDataChildComment = async (kategori = null, platform = null) => {
    try {
        const [rows] = await db.query(`
            SELECT * FROM mainComments mc
            JOIN posts p ON mc.unique_id_post = p.unique_id_post
            WHERE mc.platform = ? AND FIND_IN_SET(?, mc.kategori)
              AND mc.child_comments_processed = 0
              AND mc.child_comment_count > 0
        `, [platform, kategori]);

        if (!rows.length) return console.log('📭 No child comments to process.');

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            console.info(`\n🔍 [${i + 1}/${rows.length}] Parent comment: ${row.comment_unique_id}`);

            let retry = 0;
            let success = false;

            while (retry < 3 && !success) {
                try {
                    let cursor = 0;
                    let hasMore = true;
                    let pageCount = 0;

                    while (hasMore) {
                        const response = await axios.get('https://tiktok-api15.p.rapidapi.com/index/Tiktok/getReplyListByCommentId', {
                            params: {
                                comment_id: row.comment_unique_id,
                                video_id: row.unique_id_post,
                                count: 50,
                                ...(cursor && { cursor })
                            },
                            headers: {
                                'X-RapidAPI-Key': process.env.RAPIDAPI_TIKTOK_KEY,
                                'X-RapidAPI-Host': process.env.RAPIDAPI_TIKTOK_HOST
                            }
                        });

                        const replies = response?.data?.data?.comments || [];
                        if (!replies.length) break;

                        for (const reply of replies) {
                            const date = new Date(reply.create_time * 1000);
                            await save.saveChildComment({
                                client_account: row.client_account,
                                kategori, platform,
                                user_id: row.user_id,
                                username: row.username,
                                unique_id_post: row.unique_id_post,
                                comment_unique_id: row.comment_unique_id,
                                child_comment_unique_id: reply.id,
                                created_at: date.toISOString().slice(0, 19).replace('T', ' '),
                                child_commenter_username: reply.user.unique_id,
                                child_commenter_userid: reply.user.id,
                                child_comment_text: reply.text,
                                child_comment_like_count: reply.digg_count
                            });
                        }

                        cursor = response.data.data.cursor;
                        hasMore = response.data.data.hasMore;
                        pageCount++;
                        console.log(`✅ Page ${pageCount} processed`);
                    }

                    await db.query(`
                        UPDATE mainComments 
                        SET child_comments_processed = 1 
                        WHERE comment_unique_id = ?
                    `, [row.comment_unique_id]);

                    console.log(`🎉 Done: ${row.comment_unique_id}`);
                    success = true;

                } catch (err) {
                    retry++;
                    console.error(`❌ Error for ${row.comment_unique_id} (try ${retry}):`, err.message);
                    if (retry >= 3) {
                        await db.query(`UPDATE mainComments SET child_comments_processed = 0 WHERE comment_unique_id = ?`, [row.comment_unique_id]);
                    } else {
                        console.warn('⏳ Retrying in 5s...');
                        await new Promise(resolve => setTimeout(resolve, 5000));
                    }
                }
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        console.log('✅ Semua child comments berhasil diproses!');
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
    }
};

const getDataPostByKeyword = async (client_account = null, kategori = null, platform = null, keyword = null) => {
    try {
        console.info(`🔍 Searching posts for keyword: ${keyword}`);

        let cursor = 0;
        let hasMore = true;
        let pageCount = 0;
        const batchSize = 5; // Jumlah video yang diproses per batch

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

            const response = await axios.request(getPost);

            if (!response.data.data) {
                console.warn(`🚫 No videos found for keyword: ${keyword}`);
                break;
            }

            const items = response.data.data.videos;
            const videoBatches = chunkArray(items, batchSize);

            for (const batch of videoBatches) {
                console.info(`🚀 Processing batch of ${batch.length} videos for keyword: ${keyword}...`);

                await Promise.all(batch.map(async (item) => {
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
                }));
            }

            cursor = response.data.data.cursor;
            hasMore = response.data.data.hasMore;
            pageCount++;

            console.log(`✅ Processed page: ${pageCount}, Cursor: ${cursor}, HasMore: ${hasMore}`);

            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1 detik antar batch pencarian
        }

        console.log(`✅ All posts for keyword "${keyword}" have been successfully updated.`);
    } catch (error) {
        console.error(`❌ Error fetching data for keyword ${keyword}:`, error.message);
    }
};

const getDataFollowers = async (kategori = null, platform = null) => {
    try {
        const [rows] = await db.query('SELECT * FROM posts WHERE FIND_IN_SET(?, kategori) AND platform = ? AND followers IS NULL', [kategori, platform]);

        if (!rows.length) {
            return res.send('No users found in the database.');
        }

        const batchSize = 5; // Jumlah row yang diproses per batch
        const rowBatches = chunkArray(rows, batchSize);

        for (const batch of rowBatches) {
            console.info(`Processing batch of ${batch.length} users...`);

            await Promise.all(batch.map(async (row) => {
                try {
                    console.info('Fetching data for user: ' + row.username);

                    const getUser = {
                        method: 'GET',
                        url: 'https://tiktok-api15.p.rapidapi.com/index/Tiktok/getUserInfo',
                        params: {
                            unique_id: `@${row.username}`
                        },
                        headers: {
                            'x-rapidapi-key': process.env.RAPIDAPI_TIKTOK_KEY,
                            'x-rapidapi-host': process.env.RAPIDAPI_TIKTOK_HOST
                        }
                    };

                    const response = await axios.request(getUser);

                    if (response.data?.data) {
                        const userData = response.data;

                        const follower = userData.data.stats.followerCount;
                        const following = userData.data.stats.followingCount;

                        console.info(`Updating ${row.username}: followers=${follower}, following=${following}`);

                        const updateQuery = `UPDATE posts SET followers = ?, following = ? WHERE username = ?`;
                        await db.query(updateQuery, [follower, following, row.username]);
                    }
                } catch (error) {
                    console.error(`Error fetching/updating data for ${row.username}:`, error.message);
                }
            }));

            // Tambahkan delay opsional jika ingin menghindari rate limit API
            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1 detik antara batch
        }

        res.send('Data followers & following berhasil diperbarui untuk semua pengguna.');
    } catch (error) {
        console.error('Error executing update:', error.message);
        res.status(500).send(`Error executing update: ${error.message}`);
    }
};

const getDataCommentByCode = async (kategori = null, platform = null, url = null) => {
    try {
        if (!url || !kategori || !platform) {
            return console.warn('⚠️ URL, kategori, dan platform harus diisi.');
        }

        let retryCount = 0;
        const maxRetries = 3;
        const batchSize = 50;

        while (retryCount < maxRetries) {
            try {
                console.info(`🔍 Fetching comments for post: ${url}`);

                let cursor = 0;
                let hasMore = true;
                let pageCount = 0;

                while (hasMore) {
                    const getComment = {
                        method: 'GET',
                        url: 'https://tiktok-api15.p.rapidapi.com/index/Tiktok/getCommentListByVideo',
                        params: {
                            url: url,
                            count: 50,
                            ...(cursor && { cursor })
                        },
                        headers: {
                            'X-RapidAPI-Key': process.env.RAPIDAPI_TIKTOK_KEY,
                            'X-RapidAPI-Host': process.env.RAPIDAPI_TIKTOK_HOST
                        }
                    };

                    const response = await axios.request(getComment);

                    if (!response.data?.data?.comments) {
                        console.log(`🚫 No more comments for URL: ${url}`);
                        hasMore = false;
                        break;
                    }

                    const userComments = response.data.data.comments;
                    const commentBatches = chunkArray(userComments, batchSize);

                    for (const commentBatch of commentBatches) {
                        console.info(`💬 Processing batch of ${commentBatch.length} comments...`);

                        await Promise.all(commentBatch.map(async (item) => {
                            const postDate = new Date(item.create_time * 1000).getTime();
                            const commentData = {
                                client_account: "",
                                kategori: kategori,
                                platform: platform,
                                user_id: "",
                                username: "",
                                unique_id_post: item.video_id,
                                comment_unique_id: item.id,
                                created_at: new Date(postDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                                commenter_username: item.user?.unique_id || '',
                                commenter_userid: item.user?.id || '',
                                comment_text: item.text,
                                comment_like_count: item.digg_count,
                                child_comment_count: item.reply_total
                            };

                            await save.saveComment(commentData);

                            // Ambil child comment kalau ada
                            if (item.reply_total > 0) {
                                await getChildCommentsFromComment({
                                    kategori,
                                    platform,
                                    comment_id: item.id,
                                    video_id: item.video_id,
                                    client_account: '',
                                    username: '',
                                    user_id: ''
                                });
                            }
                        }));
                    }

                    cursor = response.data.data.cursor;
                    hasMore = response.data.data.hasMore;
                    pageCount++;

                    console.log(`✅ Processed page: ${pageCount}, Cursor: ${cursor}, HasMore: ${hasMore}`);
                }

                console.info(`✅ Finished processing all comments for URL: ${url}`);
                break;
            } catch (error) {
                retryCount++;
                console.error(`❌ Error fetching comments (Attempt ${retryCount}):`, error.message);

                if (retryCount < maxRetries) {
                    console.warn(`⚠️ Retrying in 5 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                } else {
                    console.error(`❌ Failed to fetch comments after ${maxRetries} attempts.`);
                }
            }
        }

    } catch (error) {
        console.error('❌ Error executing function:', error.message);
    }
};

// Fungsi tambahan untuk mengambil child comment dari satu komentar
const getChildCommentsFromComment = async ({
    kategori,
    platform,
    comment_id,
    video_id,
    client_account,
    username,
    user_id
}) => {
    try {
        let retryCount = 0;
        const maxRetries = 3;
        const batchSize = 50;

        while (retryCount < maxRetries) {
            try {
                console.info(`🔍 Fetching child comments for comment: ${comment_id} on post: ${video_id}`);

                let cursor = 0;
                let hasMore = true;
                let pageCount = 0;

                while (hasMore) {
                    const getChildComment = {
                        method: 'GET',
                        url: 'https://tiktok-api15.p.rapidapi.com/index/Tiktok/getReplyListByCommentId',
                        params: {
                            comment_id: comment_id,
                            video_id: video_id,
                            count: 50,
                            ...(cursor && { cursor })
                        },
                        headers: {
                            'X-RapidAPI-Key': process.env.RAPIDAPI_TIKTOK_KEY,
                            'X-RapidAPI-Host': process.env.RAPIDAPI_TIKTOK_HOST
                        }
                    };

                    const response = await axios.request(getChildComment);

                    if (!response.data?.data?.comments) {
                        console.log(`🚫 No more child comments for comment: ${comment_id}`);
                        hasMore = false;
                        break;
                    }

                    const userComments = response.data.data.comments;
                    const commentBatches = chunkArray(userComments, batchSize);

                    for (const commentBatch of commentBatches) {
                        console.info(`💬 Processing batch of ${commentBatch.length} child comments...`);
                        await Promise.all(commentBatch.map(async (item) => {
                            const postDate = new Date(item.create_time * 1000).getTime();
                            const childComment = {
                                client_account: client_account,
                                kategori: kategori,
                                platform: platform,
                                user_id: user_id,
                                username: username,
                                unique_id_post: video_id,
                                comment_unique_id: comment_id,
                                child_comment_unique_id: item.id,
                                created_at: new Date(postDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                                child_commenter_username: item.user?.unique_id || '',
                                child_commenter_userid: item.user?.id || '',
                                child_comment_text: item.text,
                                child_comment_like_count: item.digg_count
                            };

                            await save.saveChildComment(childComment);
                        }));
                    }

                    cursor = response.data.data.cursor;
                    hasMore = response.data.data.hasMore;
                    pageCount++;

                    console.log(`✅ Processed page: ${pageCount}, Cursor: ${cursor}, HasMore: ${hasMore}`);
                }

                console.info(`✅ Finished processing child comments for comment: ${comment_id}`);
                break;
            } catch (error) {
                retryCount++;
                console.error(`❌ Error fetching child comments (Attempt ${retryCount}):`, error.message);

                if (retryCount < maxRetries) {
                    console.warn(`⚠️ Retrying in 5 seconds...`);
                    await new Promise(resolve => setTimeout(resolve, 5000));
                } else {
                    console.error(`❌ Failed to fetch child comments after ${maxRetries} attempts.`);
                }
            }
        }

    } catch (error) {
        console.error('❌ Error executing child comment function:', error.message);
    }
};

module.exports = {
    getDataUser,
    getDataPost,
    getDataComment,
    getDataChildComment,
    getDataPostByKeyword,
    getDataFollowers,
    getDataCommentByCode
};
