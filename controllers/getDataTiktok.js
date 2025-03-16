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

// Fungsi untuk mendapatkan data User dari API
const getDataUser = async (kategori = null, platform = null) => {
    try {

        const [rows] = await db.query('SELECT * FROM listAkun WHERE platform = ? AND FIND_IN_SET(?, kategori)', [platform, kategori]);

        if (!rows.length) {
            return console.log('No users found in the database.');
        }

        const batchSize = 5; // Jumlah row yang diproses per batch
        const rowBatches = chunkArray(rows, batchSize);

        for (const batch of rowBatches) {
            console.info(`Processing batch of ${batch.length} users...`)

            await Promise.all(batch.map(async(row)=>{
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
            
                    if (response.data?.data) {
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
                    }
                } catch (error) {
                    console.error(`Error fetching/updating data for ${row.username}:`, error.message);
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
        // Ambil daftar akun dari database berdasarkan kategori dan platform
        // const [rows] = await db.query('SELECT * FROM users WHERE platform = ? AND FIND_IN_SET(?, kategori)', [platform, kategori]);

        const [rows] = await db.query(`
            SELECT 
                u.*, 
                u.followers AS max_followers, 
                ROUND(u.followers * 0.9) AS min_followers
            FROM users u
            WHERE u.platform = ? 
                AND FIND_IN_SET(?, u.kategori)
        `, [platform, kategori]);

        if (!rows.length) {
            return console.log('No users found in the database.');
        }

        // Ambil startDate dari server
        const response = await fetch(`http://localhost:${process.env.PORT}/data/getDates`);
        const data = await response.json();
        const endDate = new Date(data.startDate).toISOString().split('T')[0];
        const endDateObj = new Date(endDate).getTime();

        const batchSize = 5; // Jumlah akun yang diproses per batch
        const rowBatches = chunkArray(rows, batchSize);

        for (const batch of rowBatches) {
            console.info(`🚀 Processing batch of ${batch.length} users...`);

            await Promise.all(batch.map(async (row) => {
                try {
                    console.info(`Fetching post data for user: ${row.username}`);

                    let cursor = null;
                    let hasMore = true;
                    let pageCount = 0;

                    // Manipulasi followers hanya jika lebih dari 1000
                    let currentFollowers = row.min_followers; // Mulai dari min_followers yang sudah dihitung
                    const maxFollowers = row.max_followers; // Ambil max_followers dari tabel users

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

                            // Naik bertahap tapi tidak melebihi max_followers
                            const increaseAmount = Math.floor(Math.random() * (20 - 5 + 1)) + 5; // Random dari 5 hingga 20
                            currentFollowers = Math.min(currentFollowers + increaseAmount, maxFollowers);

                            if (isPinned) {
                                const post = {
                                    client_account: row.client_account,
                                    kategori: kategori,
                                    platform: platform,
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
                                    followers: currentFollowers || 0,
                                    following: row.following || 0,
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
                                kategori: kategori,
                                platform: platform,
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
                                followers: currentFollowers || 0,
                                following: row.following || 0,
                                playCount: item.play_count || 0,
                                collectCount: item.collect_count || 0,
                                shareCount: item.share_count || 0,
                                downloadCount: item.download_count || 0,
                            };

                            await save.savePost(post);
                        }

                        cursor = response.data.data.cursor;
                        hasMore = response.data.data.hasMore;
                        pageCount++;
                        console.log(`Page count: ${pageCount}`);
                    }
                } catch (error) {
                    console.error(`Error fetching/updating post data for ${row.username}:`, error.message);
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
const getDataComment = async (kategori = null, platform = null, startDate = null, endDate = null) => {
    try {
        // Ambil daftar postingan dari database berdasarkan kategori dan platform
        const [rows] = await db.query(`
            SELECT unique_id_post, user_id, username, comments, client_account, kategori, platform
            FROM posts 
            WHERE platform = ?
            AND FIND_IN_SET(?, kategori)
            AND DATE(created_at) BETWEEN ? AND ?
            AND comments > 0
        `, [platform, kategori, startDate, endDate]);

        if (!rows.length) {
            return console.log('No posts found in the database.');
        }

        const batchSize = 5; // Jumlah postingan yang diproses per batch
        const rowBatches = chunkArray(rows, batchSize);

        for (const batch of rowBatches) {
            console.info(`🚀 Processing batch of ${batch.length} posts...`);

            await Promise.all(batch.map(async (row) => {
                try {
                    console.info(`🔍 Fetching comments for post: ${row.unique_id_post}`);

                    let cursor = 0;
                    let hasMore = true;
                    let pageCount = 0;
                    const limitPage = 20; // Batas maksimal halaman

                    while (hasMore) {
                        if (limitPage > 0 && pageCount >= limitPage) {
                            console.log(`⏹️ Stopping at page limit (${limitPage}) for post ${row.unique_id_post}`);
                            break;
                        }

                        // Konfigurasi request ke TikTok API
                        const getComment = {
                            method: 'GET',
                            url: 'https://tiktok-api15.p.rapidapi.com/index/Tiktok/getCommentListByVideo',
                            params: {
                                url: row.unique_id_post,
                                count: 50,
                                ...(cursor && { cursor: cursor }) // Hanya tambahkan jika cursor tersedia
                            },
                            headers: {
                                'X-RapidAPI-Key': process.env.RAPIDAPI_TIKTOK_KEY,
                                'X-RapidAPI-Host': process.env.RAPIDAPI_TIKTOK_HOST
                            }
                        };

                        const response = await axios.request(getComment);

                        if (!response.data?.data?.comments) {
                            console.log(`🚫 No more comments for post ${row.unique_id_post}`);
                            hasMore = false;
                            break;
                        }

                        const userComments = response.data.data.comments;

                        // Proses data dalam batch kecil untuk menghindari overload
                        const commentBatches = chunkArray(userComments, batchSize);

                        for (const commentBatch of commentBatches) {
                            console.info(`💬 Processing batch of ${commentBatch.length} comments...`);
                            await Promise.all(commentBatch.map(async (item) => {
                                const postDate = new Date(item.create_time * 1000).getTime();
                                const comment = {
                                    client_account: row.client_account,
                                    kategori: kategori,
                                    platform: platform,
                                    user_id: row.user_id,
                                    username: row.username,
                                    unique_id_post: row.unique_id_post,
                                    comment_unique_id: item.id,
                                    created_at: new Date(postDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                                    commenter_username: item.user.unique_id,
                                    commenter_userid: item.user.id,
                                    comment_text: item.text,
                                    comment_like_count: item.digg_count,
                                    child_comment_count: item.reply_total
                                };

                                await save.saveComment(comment);
                            }));
                        }

                        cursor = response.data.data.cursor;
                        hasMore = response.data.data.hasMore;
                        pageCount++;

                        console.log(`✅ Processed page: ${pageCount}, Cursor: ${cursor}, HasMore: ${hasMore}`);
                    }
                } catch (error) {
                    console.error(`❌ Error fetching comments for post ${row.unique_id_post}:`, error.message);
                }
            }));

            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1 detik antar batch postingan
        }

        console.log('✅ All comments have been successfully updated.');
    } catch (error) {
        console.error('❌ Error executing function:', error.message);
    }
};

// Fungsi untuk mendapatkan data Child Comment dari API
const getDataChildComment = async (kategori = null, platform = null, startDate = null, endDate = null) => {
    try {
        // Ambil daftar komentar dari database berdasarkan kategori dan platform
        const [rows] = await db.query(`
            SELECT mc.comment_unique_id, mc.unique_id_post, mc.user_id, mc.username, mc.child_comment_count, mc.client_account, mc.kategori, mc.platform
            FROM mainComments mc
            JOIN posts p ON mc.unique_id_post = p.unique_id_post
            WHERE mc.platform = ?
            AND FIND_IN_SET(?, mc.kategori)
            AND DATE(p.created_at) BETWEEN ? AND ?
            AND mc.child_comment_count > 0
        `, [platform, kategori, startDate, endDate]);

        if (!rows.length) {
            return console.log('No comments found in the database.');
        }

        const batchSize = 5; // Jumlah komentar yang diproses per batch
        const rowBatches = chunkArray(rows, batchSize);

        for (const batch of rowBatches) {
            console.info(`🚀 Processing batch of ${batch.length} parent comments...`);

            await Promise.all(batch.map(async (row) => {
                try {
                    console.info(`🔍 Fetching child comments for parent comment: ${row.comment_unique_id} on post: ${row.unique_id_post}`);

                    let cursor = 0;
                    let hasMore = true;
                    let pageCount = 0;
                    const limitPage = 2; // Batas maksimal halaman

                    while (hasMore) {
                        if (limitPage > 0 && pageCount >= limitPage) {
                            console.log(`⏹️ Stopping at page limit (${limitPage}) for child comments on post ${row.unique_id_post}`);
                            break;
                        }

                        // Konfigurasi request ke TikTok API
                        const getChildComment = {
                            method: 'GET',
                            url: 'https://tiktok-api15.p.rapidapi.com/index/Tiktok/getReplyListByCommentId',
                            params: {
                                comment_id: row.comment_unique_id,
                                video_id: row.unique_id_post,
                                count: 50,
                                ...(cursor && { cursor: cursor }) // Hanya tambahkan jika cursor tersedia
                            },
                            headers: {
                                'X-RapidAPI-Key': process.env.RAPIDAPI_TIKTOK_KEY,
                                'X-RapidAPI-Host': process.env.RAPIDAPI_TIKTOK_HOST
                            }
                        };

                        const response = await axios.request(getChildComment);

                        if (!response.data?.data?.comments) {
                            console.log(`🚫 No more child comments for post ${row.unique_id_post}`);
                            hasMore = false;
                            break;
                        }

                        const userComments = response.data.data.comments;

                        // Proses data dalam batch kecil untuk menghindari overload
                        const commentBatches = chunkArray(userComments, batchSize);

                        for (const commentBatch of commentBatches) {
                            console.info(`💬 Processing batch of ${commentBatch.length} child comments...`);
                            await Promise.all(commentBatch.map(async (item) => {
                                const postDate = new Date(item.create_time * 1000).getTime();
                                const childComment = {
                                    client_account: row.client_account,
                                    kategori: kategori,
                                    platform: platform,
                                    user_id: row.user_id,
                                    username: row.username,
                                    unique_id_post: row.unique_id_post,
                                    comment_unique_id: row.comment_unique_id,
                                    child_comment_unique_id: item.id,
                                    created_at: new Date(postDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                                    child_commenter_username: item.user.unique_id,
                                    child_commenter_userid: item.user.id,
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
                } catch (error) {
                    console.error(`❌ Error fetching child comments for comment ${row.comment_unique_id} on post ${row.unique_id_post}:`, error.message);
                }
            }));

            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1 detik antar batch komentar induk
        }

        console.log('✅ All child comments have been successfully updated.');
    } catch (error) {
        console.error('❌ Error executing function:', error.message);
    }
};

const getDataPostByKeyword = async (client_account = null, kategori = null, platform = null, keyword = null) => {
    try {
        console.info(`🔍 Searching posts for keyword: ${keyword}`);

        let cursor = null;
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

            if (!response.data?.data?.videos) {
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

module.exports = {
    getDataUser,
    getDataPost,
    getDataComment,
    getDataChildComment,
    getDataPostByKeyword,
    getDataFollowers
};
