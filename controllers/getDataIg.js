require('dotenv').config(); // Load environment variables from .env file
const axios = require('axios');
const save = require('./saveDataIg');
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
        // Ambil daftar username dari database berdasarkan kategori dan platform
        const [rows] = await db.query('SELECT * FROM listAkun WHERE platform = ? AND FIND_IN_SET(?, kategori)', [platform, kategori]);

        if (!rows.length) {
            return console.log('No users found in the database.');
        }

        const batchSize = 5; // Jumlah user yang diproses per batch
        const rowBatches = chunkArray(rows, batchSize);

        for (const batch of rowBatches) {
            console.info(`🚀 Processing batch of ${batch.length} users...`);

            await Promise.all(batch.map(async (row) => {
                let retryCount = 0;
                const maxRetries = 3; // Maksimal retry 3 kali

                while(retryCount < maxRetries) {
                    try {
                        console.info(`🔍 Fetching data for user: ${row.username}`);
    
                        const getUser = {
                            method: 'GET',
                            url: 'https://instagram-scraper-api2.p.rapidapi.com/v1/info',
                            params: {
                                username_or_id_or_url: row.username,
                                include_about: 'true',
                                url_embed_safe: 'true'
                            },
                            headers: {
                                'x-rapidapi-key': process.env.RAPIDAPI_IG_KEY,
                                'x-rapidapi-host': process.env.RAPIDAPI_IG_HOST
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
                            user_id: userData.id,
                            followers: userData.follower_count || 0,
                            following: userData.following_count || 0,
                            mediaCount: userData.media_count || 0,
                            profile_pic_url: userData.profile_pic_url,
                        };
    
                        await save.saveUser(user);
                        console.info(`✅ Successfully saved data for user: ${row.username}`);
                        break; // Keluar dari loop retry jika sukses

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

            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1 detik antar batch
        }

        console.log('✅ All Instagram users have been successfully updated.');
    } catch (error) {
        console.error('❌ Error executing function:', error.message);
    }
};

// Fungsi untuk mendapatkan data Post dari API
const getDataPost = async (kategori = null, platform = null) => {
    try {
        // Ambil daftar akun dari database berdasarkan kategori dan platform
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
            console.log('No users found in the database.');
            return;
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
                let retryCount = 0;
                const maxRetries = 3; // Maksimal retry per user
                while (retryCount < maxRetries) {
                    try {
                        console.info(`🔍 Fetching posts for user: ${row.username} (Attempt ${retryCount + 1})`);

                        let paginationToken = null;
                        let morePosts = true;
                        let pageCount = 0;
                        const maxPaginationPages = 10; // Maksimum pagination loop

                        let currentFollowers = row.min_followers;
                        const maxFollowers = row.max_followers;

                        while (morePosts && pageCount < maxPaginationPages) {
                            const getPost = {
                                method: 'GET',
                                url: 'https://instagram-scraper-api2.p.rapidapi.com/v1/posts',
                                params: {
                                    username_or_id_or_url: row.username,
                                    url_embed_safe: 'true',
                                    ...(paginationToken && { pagination_token: paginationToken })
                                },
                                headers: {
                                    'X-RapidAPI-Key': process.env.RAPIDAPI_IG_KEY,
                                    'X-RapidAPI-Host': process.env.RAPIDAPI_IG_HOST
                                }
                            };

                            const response = await axios.request(getPost);

                            if (!response.data?.data?.items) {
                                console.warn(`🚫 No posts found for user: ${row.username}`);
                                break;
                            }

                            const userPosts = response.data.data.items;

                            for (const item of userPosts) {
                                const isPinned = item.is_pinned ? 1 : 0;
                                const postDate = new Date(item.taken_at * 1000).getTime();
                                const captionText = item.caption || "No Caption";

                                // Naik bertahap tapi tidak melebihi max_followers
                                const increaseAmount = Math.floor(Math.random() * (20 - 5 + 1)) + 5;
                                currentFollowers = Math.min(currentFollowers + increaseAmount, maxFollowers);

                                if (postDate < endDateObj) {
                                    return;
                                }

                                const post = {
                                    client_account: row.client_account,
                                    kategori: kategori,
                                    platform: platform,
                                    user_id: row.user_id,
                                    unique_id_post: item.id,
                                    username: row.username,
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
                                    followers: currentFollowers || 0,
                                    following: row.following || 0,
                                    playCount: item.play_count || 0,
                                    shareCount: item.share_count || 0,
                                    collabs: (item.coauthor_producers && item.coauthor_producers.length > 0) ? 1 : 0,
                                    collabs_with: (item.coauthor_producers && item.coauthor_producers.length > 0)
                                        ? item.coauthor_producers.map(user => user.username).join(",")
                                        : ""
                                };

                                await save.savePost(post);
                            }

                            paginationToken = response.data.pagination_token;
                            pageCount++;
                            if (!paginationToken) morePosts = false;
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
                            await new Promise(resolve => setTimeout(resolve, 5000)); // Delay 5 detik sebelum retry
                        }
                    }
                }
            }));

            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1 detik antar batch akun
        }

        console.log('✅ All Instagram posts have been successfully updated.');
    } catch (error) {
        console.error('❌ Error executing function:', error.message);
    }
};

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
            console.log('No posts found in the database.');
            return;
        }

        const batchSize = 5; // Jumlah postingan yang diproses per batch
        const rowBatches = chunkArray(rows, batchSize);

        for (const batch of rowBatches) {
            console.info(`🚀 Processing batch of ${batch.length} posts...`);

            await Promise.all(batch.map(async (row) => {
                let retryCount = 0;
                const maxRetries = 3; // Maksimal retry per post
                
                while (retryCount < maxRetries) {
                    try {
                        console.info(`🔍 Fetching comments for post: ${row.unique_id_post} (Attempt ${retryCount + 1})`);

                        let paginationToken = null;
                        let moreComments = true;
                        let pageCount = 0;
                        const limitPage = 20; // Batas maksimal halaman

                        while (moreComments && pageCount < limitPage) {
                            const getComment = {
                                method: 'GET',
                                url: 'https://instagram-scraper-api2.p.rapidapi.com/v1/comments',
                                params: {
                                    code_or_id_or_url: row.unique_id_post,
                                    sort_by: 'popular',
                                    ...(paginationToken && { pagination_token: paginationToken })
                                },
                                headers: {
                                    'X-RapidAPI-Key': process.env.RAPIDAPI_IG_KEY,
                                    'X-RapidAPI-Host': process.env.RAPIDAPI_IG_HOST
                                }
                            };

                            const response = await axios.request(getComment);

                            if (!response.data?.data?.items) {
                                console.warn(`🚫 No more comments for post ${row.unique_id_post}`);
                                moreComments = false;
                                break;
                            }

                            const userComments = response.data.data.items;
                            const commentBatches = chunkArray(userComments, batchSize);

                            for (const commentBatch of commentBatches) {
                                console.info(`💬 Processing batch of ${commentBatch.length} comments...`);
                                await Promise.all(commentBatch.map(async (item) => {
                                    const comment = {
                                        client_account: row.client_account,
                                        kategori: kategori,
                                        platform: platform,
                                        user_id: row.user_id,
                                        username: row.username,
                                        unique_id_post: row.unique_id_post,
                                        comment_unique_id: item.id,
                                        created_at: new Date(item.created_at * 1000).toISOString().slice(0, 19).replace('T', ' '),
                                        commenter_username: item.user.username,
                                        commenter_userid: item.user.id,
                                        comment_text: item.text,
                                        comment_like_count: item.like_count,
                                        child_comment_count: item.child_comment_count
                                    };

                                    await save.saveComment(comment);
                                }));
                            }

                            paginationToken = response.data.pagination_token;
                            pageCount++;

                            if (!paginationToken) moreComments = false;
                            console.log(`✅ Processed page: ${pageCount} for post ${row.unique_id_post}`);
                        }

                        console.info(`✅ Finished processing comments for post: ${row.unique_id_post}`);
                        break; // Jika berhasil, keluar dari retry loop
                    } catch (error) {
                        retryCount++;
                        console.error(`❌ Error fetching comments for ${row.unique_id_post} (Attempt ${retryCount}):`, error.message);

                        if (retryCount >= maxRetries) {
                            console.error(`❌ Failed to fetch comments for ${row.unique_id_post} after ${maxRetries} attempts.`);
                        } else {
                            console.warn(`⚠️ Retrying for post ${row.unique_id_post} in 5 seconds...`);
                            await new Promise(resolve => setTimeout(resolve, 5000)); // Delay 5 detik sebelum retry
                        }
                    }
                }
            }));

            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1 detik antar batch postingan
        }

        console.log('✅ All Instagram comments have been successfully updated.');
    } catch (error) {
        console.error('❌ Error executing function:', error.message);
    }
};

const getDataChildComment = async (kategori = null, platform = null, startDate = null, endDate = null) => {
    try {
        // Ambil daftar komentar induk dari database berdasarkan kategori dan platform
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
            console.log('No parent comments found in the database.');
            return;
        }

        const batchSize = 5; // Jumlah komentar yang diproses per batch
        const rowBatches = chunkArray(rows, batchSize);

        for (const batch of rowBatches) {
            console.info(`🚀 Processing batch of ${batch.length} parent comments...`);

            await Promise.all(batch.map(async (row) => {
                let retryCount = 0;
                const maxRetries = 3; // Maksimum retry per parent comment
                
                while (retryCount < maxRetries) {
                    try {
                        console.info(`🔍 Fetching child comments for parent comment: ${row.comment_unique_id} on post: ${row.unique_id_post} (Attempt ${retryCount + 1})`);

                        let paginationToken = null;
                        let moreComments = true;
                        let pageCount = 0;
                        const limitPage = 10; // Batas maksimal pagination

                        while (moreComments && pageCount < limitPage) {
                            const getChildComment = {
                                method: 'GET',
                                url: 'https://instagram-scraper-api2.p.rapidapi.com/v1/comments_thread',
                                params: {
                                    code_or_id_or_url: row.unique_id_post,
                                    comment_id: row.comment_unique_id,
                                    ...(paginationToken && { pagination_token: paginationToken })
                                },
                                headers: {
                                    'X-RapidAPI-Key': process.env.RAPIDAPI_IG_KEY,
                                    'X-RapidAPI-Host': process.env.RAPIDAPI_IG_HOST
                                }
                            };

                            const response = await axios.request(getChildComment);

                            if (!response.data?.data?.items) {
                                console.warn(`🚫 No more child comments for post ${row.unique_id_post}`);
                                moreComments = false;
                                break;
                            }

                            const userComments = response.data.data.items;
                            const commentBatches = chunkArray(userComments, batchSize);

                            for (const commentBatch of commentBatches) {
                                console.info(`💬 Processing batch of ${commentBatch.length} child comments...`);
                                await Promise.all(commentBatch.map(async (child) => {
                                    const childComment = {
                                        client_account: row.client_account,
                                        kategori: kategori,
                                        platform: platform,
                                        user_id: row.user_id,
                                        username: row.username,
                                        unique_id_post: row.unique_id_post,
                                        comment_unique_id: row.comment_unique_id,
                                        child_comment_unique_id: child.id,
                                        created_at: new Date(child.created_at * 1000).toISOString().slice(0, 19).replace('T', ' '),
                                        child_commenter_username: child.user.username,
                                        child_commenter_userid: child.user.id,
                                        child_comment_text: child.text,
                                        child_comment_like_count: child.comment_like_count
                                    };

                                    await save.saveChildComment(childComment);
                                }));
                            }

                            paginationToken = response.data.pagination_token;
                            pageCount++;

                            if (!paginationToken) moreComments = false;
                            console.log(`✅ Processed page: ${pageCount} for parent comment ${row.comment_unique_id} on post ${row.unique_id_post}`);
                        }

                        console.info(`✅ Finished processing child comments for parent comment: ${row.comment_unique_id}`);
                        break; // Jika berhasil, keluar dari retry loop
                    } catch (error) {
                        retryCount++;
                        console.error(`❌ Error fetching child comments for ${row.comment_unique_id} on post ${row.unique_id_post} (Attempt ${retryCount}):`, error.message);

                        if (retryCount >= maxRetries) {
                            console.error(`❌ Failed to fetch child comments for ${row.comment_unique_id} after ${maxRetries} attempts.`);
                        } else {
                            console.warn(`⚠️ Retrying for comment ${row.comment_unique_id} in 5 seconds...`);
                            await new Promise(resolve => setTimeout(resolve, 5000)); // Delay 5 detik sebelum retry
                        }
                    }
                }
            }));

            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1 detik antar batch komentar induk
        }

        console.log('✅ All Instagram child comments have been successfully updated.');
    } catch (error) {
        console.error('❌ Error executing function:', error.message);
    }
};

// Fungsi untuk mendapatkan data Post dari API
const getDataLikes = async (kategori = null, platform = null, client_account = null) => {
    try {
        // Ambil daftar postingan dari database berdasarkan kategori dan platform
        const [rows] = await db.query(`
            SELECT post_code, created_at 
            FROM listPost 
            WHERE platform = "Instagram" 
            AND FIND_IN_SET(?, kategori)`, [kategori]);

        if (!rows.length) {
            return console.log('No posts found in the database.');
        }

        const batchSize = 5; // Jumlah postingan yang diproses per batch
        const rowBatches = chunkArray(rows, batchSize);

        for (const batch of rowBatches) {
            console.info(`🚀 Processing batch of ${batch.length} posts...`);

            await Promise.all(batch.map(async (row) => {
                let retryCount = 0;
                const maxRetries = 3; // Maksimum retry per post

                while (retryCount < maxRetries) {
                    try {
                        console.info(`🔍 Fetching likes for post: ${row.post_code} (Attempt ${retryCount + 1})`);

                        let paginationToken = null;
                        let moreLikes = true;
                        let pageCount = 0;
                        const limitPage = 10; // Batas maksimal halaman

                        while (moreLikes && pageCount < limitPage) {
                            const getLikes = {
                                method: 'GET',
                                url: 'https://instagram-scraper-api2.p.rapidapi.com/v1/likes',
                                params: {
                                    code_or_id_or_url: row.post_code,
                                    ...(paginationToken && { pagination_token: paginationToken })
                                },
                                headers: {
                                    'X-RapidAPI-Key': process.env.RAPIDAPI_IG_KEY,
                                    'X-RapidAPI-Host': process.env.RAPIDAPI_IG_HOST
                                }
                            };

                            const response = await axios.request(getLikes);

                            if (!response.data?.data?.items) {
                                console.warn(`🚫 No more likes for post: ${row.post_code}`);
                                moreLikes = false;
                                break;
                            }

                            const userLikes = response.data.data.items;
                            const likeBatches = chunkArray(userLikes, batchSize);

                            for (const likeBatch of likeBatches) {
                                console.info(`💖 Processing batch of ${likeBatch.length} likes...`);
                                await Promise.all(likeBatch.map(async (item) => {
                                    const likes = {
                                        client_account: client_account,
                                        kategori: kategori,
                                        platform: platform,
                                        post_code: row.post_code,
                                        user_id: item.id,
                                        username: item.username,
                                        fullname: item.full_name,
                                        created_at: new Date(row.created_at).toISOString().slice(0, 19).replace('T', ' '),
                                    };

                                    await save.saveLikes(likes);
                                }));
                            }

                            paginationToken = response.data.pagination_token;
                            pageCount++;

                            if (!paginationToken) moreLikes = false;
                            console.log(`✅ Processed page: ${pageCount} for post: ${row.post_code}`);
                        }

                        console.info(`✅ Successfully processed likes for post: ${row.post_code}`);
                        break; // Jika berhasil, keluar dari retry loop
                    } catch (error) {
                        retryCount++;
                        console.error(`❌ Error fetching likes for post ${row.post_code} (Attempt ${retryCount}):`, error.message);

                        if (retryCount >= maxRetries) {
                            console.error(`❌ Failed to fetch likes for post ${row.post_code} after ${maxRetries} attempts.`);
                        } else {
                            console.warn(`⚠️ Retrying for post ${row.post_code} in 5 seconds...`);
                            await new Promise(resolve => setTimeout(resolve, 5000)); // Delay 5 detik sebelum retry
                        }
                    }
                }
            }));

            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1 detik antar batch postingan
        }

        console.log('✅ All Instagram likes have been successfully updated.');
    } catch (error) {
        console.error('❌ Error executing function:', error.message);
    }
};

const getDataPostByKeyword = async (kategori = null, platform = null, client_account = null, keyword = null) => {
    try {
        console.info(`🔍 Searching Instagram posts for keyword: #${keyword}`);

        let paginationToken = null;
        let hasMore = true;
        let pageCount = 0;
        let totalFetched = 0;
        const maxTotalResults = 250; // Maksimum ambil 250 post
        const maxRetries = 3; // Maksimum retry untuk request yang gagal
        const batchSize = 5; // Jumlah postingan yang diproses per batch
        const maxPages = 10; // Batas maksimal pagination

        while (hasMore && totalFetched < maxTotalResults && pageCount < maxPages) {
            let retryCount = 0;
            let success = false;

            while (retryCount < maxRetries && !success) {
                try {
                    console.info(`📥 Fetching Page ${pageCount + 1} for keyword: #${keyword} (Attempt ${retryCount + 1})`);

                    const getPost = {
                        method: 'GET',
                        url: 'https://instagram-scraper-api2.p.rapidapi.com/v1/hashtag',
                        params: {
                            hashtag: keyword,
                            feed_type: 'top',
                            url_embed_safe: 'true',
                            ...(paginationToken && { pagination_token: paginationToken }) // Perbaikan logic pagination
                        },
                        headers: {
                            'X-RapidAPI-Key': process.env.RAPIDAPI_IG_KEY,
                            'X-RapidAPI-Host': process.env.RAPIDAPI_IG_HOST
                        }
                    };

                    const response = await axios.request(getPost);

                    if (!response.data?.data?.items) {
                        console.warn(`🚫 No more posts found for keyword: #${keyword}`);
                        hasMore = false;
                        break;
                    }

                    success = true; // Berhasil mendapatkan data, keluar dari retry loop

                    const items = response.data.data.items;
                    totalFetched += items.length;

                    // Proses data dalam batch kecil
                    const postBatches = chunkArray(items, batchSize);

                    for (const postBatch of postBatches) {
                        console.info(`🚀 Processing batch of ${postBatch.length} posts for keyword: #${keyword}...`);

                        await Promise.all(postBatch.map(async (item) => {
                            try {
                                const postDate = new Date(item.taken_at * 1000).toISOString().slice(0, 19).replace('T', ' ');
                                const captionText = item.caption?.text || "No Caption";

                                const dataPost = {
                                    client_account: client_account,
                                    kategori: kategori,
                                    platform: platform,
                                    keyword: keyword,
                                    user_id: item.user?.id || "",
                                    username: item.user?.username || "Unknown",
                                    unique_id_post: item.id,
                                    post_code: item.code,
                                    created_at: postDate,
                                    thumbnail_url: item.thumbnail_url || "",
                                    caption: captionText,
                                    comments: item.comment_count || 0,
                                    likes: item.like_count || 0,
                                    media_name: item.media_name || "Unknown",
                                    product_type: item.product_type || "Unknown",
                                    tagged_users: item.tagged_users?.in?.map(tag => tag.user.username).join(', ') || '',
                                    playCount: item.play_count || 0,
                                    shareCount: item.share_count || item.reshare_count || 0,
                                };

                                await save.saveDataPostByKeywords(dataPost);
                            } catch (error) {
                                console.error(`⚠️ Error processing post ID ${item.id}: ${error.message}`);
                            }
                        }));
                    }

                    paginationToken = response.data.pagination_token;
                    hasMore = !!paginationToken;
                    pageCount++;

                    console.log(`✅ Processed Page ${pageCount} - Total Posts Fetched: ${totalFetched}`);

                } catch (error) {
                    retryCount++;
                    console.error(`❌ API Error fetching posts for keyword #${keyword} (Attempt ${retryCount}): ${error.message}`);

                    if (retryCount >= maxRetries) {
                        console.error(`❌ Skipping keyword #${keyword} after ${maxRetries} failed attempts.`);
                        hasMore = false;
                    } else {
                        console.warn(`⚠️ Retrying keyword #${keyword} in 5 seconds...`);
                        await new Promise(resolve => setTimeout(resolve, 5000)); // Delay 5 detik sebelum retry
                    }
                }
            }

            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1 detik antar batch pencarian
        }

        console.log(`🎉 Done fetching Instagram posts for keyword #${keyword}. Total Fetched: ${totalFetched}`);
    } catch (error) {
        console.error(`❌ Critical error fetching data for keyword #${keyword}:`, error.message);
    }
};

const getDataPostByCode = async (kategori = null, platform = null, client_account = null) => {
    try {
        console.info(`🔍 Fetching Instagram post details for category: ${kategori}`);

        // Ambil daftar post_code dari database berdasarkan kategori dan platform
        const [rows] = await db.query('SELECT * FROM listPost WHERE platform = "Instagram" AND FIND_IN_SET(?, kategori)', [kategori]);

        if (!rows.length) {
            return console.log('No posts found in the database.');
        }

        const batchSize = 5; // Jumlah postingan yang diproses per batch
        const rowBatches = chunkArray(rows, batchSize);
        const maxRetries = 3; // Maksimum jumlah retry jika API gagal
        const maxPages = 10; // Batas maksimal pagination

        for (const batch of rowBatches) {
            console.info(`🚀 Processing batch of ${batch.length} posts...`);

            await Promise.all(batch.map(async (row) => {
                let retryCount = 0;
                let success = false;

                while (retryCount < maxRetries && !success) {
                    try {
                        console.info(`📥 Fetching post info for: ${row.post_code} (Attempt ${retryCount + 1})`);

                        const getPost = {
                            method: 'GET',
                            url: 'https://instagram-scraper-api2.p.rapidapi.com/v1/post_info',
                            params: {
                                code_or_id_or_url: row.post_code,
                                url_embed_safe: 'true',
                                include_insights: 'true'
                            },
                            headers: {
                                'X-RapidAPI-Key': process.env.RAPIDAPI_IG_KEY,
                                'X-RapidAPI-Host': process.env.RAPIDAPI_IG_HOST
                            }
                        };

                        const response = await axios.request(getPost);

                        if (!response.data?.data) {
                            console.warn(`🚫 No data found for post: ${row.post_code}`);
                            break;
                        }

                        success = true; // Jika berhasil mendapatkan data, keluar dari retry loop

                        const item = response.data.data;
                        const isPinned = item.is_pinned ? 1 : 0;
                        const postDate = new Date(item.taken_at * 1000).getTime();
                        const captionText = item.caption?.text || "No Caption";
                        const metrics = item.metrics || {};

                        const post = {
                            client_account: client_account,
                            kategori: kategori,
                            platform: platform,
                            user_id: item.user?.id || "",
                            username: item.user?.username || "Unknown",
                            unique_id_post: item.id,
                            created_at: new Date(postDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' }).slice(0, 19).replace('T', ' '),
                            thumbnail_url: item.thumbnail_url || "",
                            caption: captionText,
                            post_code: item.code,
                            comments: metrics.comment_count || 0,
                            likes: metrics.like_count || 0,
                            playCount: metrics.play_count || 0,
                            shareCount: metrics.share_count || 0,
                            media_name: item.media_name || "Unknown",
                            product_type: item.product_type || "Unknown",
                            tagged_users: item.tagged_users?.in?.map(tag => tag.user.username).join(', ') || '',
                            is_pinned: isPinned,
                        };

                        await save.savePost(post);
                        console.log(`✅ Successfully fetched data for post: ${row.post_code}`);
                    } catch (error) {
                        retryCount++;
                        console.error(`❌ API Error fetching post data for ${row.post_code} (Attempt ${retryCount}): ${error.message}`);

                        if (retryCount >= maxRetries) {
                            console.error(`❌ Skipping post ${row.post_code} after ${maxRetries} failed attempts.`);
                        } else {
                            console.warn(`⚠️ Retrying post ${row.post_code} in 5 seconds...`);
                            await new Promise(resolve => setTimeout(resolve, 5000)); // Delay 5 detik sebelum retry
                        }
                    }
                }
            }));

            await new Promise(resolve => setTimeout(resolve, 1000)); // Delay 1 detik antar batch pencarian
        }

        console.log('✅ All Instagram posts have been successfully updated.');
    } catch (error) {
        console.error('❌ Error executing function:', error.message);
    }
};

const getDataFollowers = async (kategori = null, platform = null) => {
    try {
        const [rows] = await db.query(`
            SELECT 
                p.*, 
                u.followers AS max_followers, 
                ROUND(u.followers * 0.9) AS min_followers
            FROM posts p
            JOIN users u ON p.username = u.username
            WHERE FIND_IN_SET(?, p.kategori) 
            AND p.platform = ? 
            AND p.followers = 0;
        `, [kategori, platform]);

        if (!rows.length) {
            console.log('No users found in the database.');
            return 'No users found in the database.'; // Return ke router
        }

        const batchSize = 5;
        const rowBatches = chunkArray(rows, batchSize);

        for (const batch of rowBatches) {
            console.info(`Processing batch of ${batch.length} users...`);

            await Promise.all(batch.map(async (row) => {
                try {
                    console.info('Fetching data for user: ' + row.username);

                    const getUser = {
                        method: 'GET',
                        url: 'https://instagram-scraper-api2.p.rapidapi.com/v1/info',
                        params: {
                            username_or_id_or_url: row.username,
                            include_about: 'true',
                            url_embed_safe: 'true'
                        },
                        headers: {
                            'x-rapidapi-key': process.env.RAPIDAPI_IG_KEY,
                            'x-rapidapi-host': process.env.RAPIDAPI_IG_HOST
                        }
                    };

                    const response = await axios.request(getUser);

                    let currentFollowers = row.min_followers;
                    const maxFollowers = row.max_followers;

                    if (response.data?.data) {
                        const increaseAmount = Math.floor(Math.random() * (20 - 5 + 1)) + 5;
                        currentFollowers = Math.min(currentFollowers + increaseAmount, maxFollowers);

                        const follower = currentFollowers;
                        const following = response.data.data.following_count;

                        console.info(`Updating ${row.username}: followers=${follower}, following=${following}`);

                        const updateQuery = `UPDATE posts SET followers = ?, following = ? WHERE username = ?`;
                        await db.query(updateQuery, [follower, following, row.username]);
                    }
                } catch (error) {
                    console.error(`Error fetching/updating data for ${row.username}:`, error.message);
                }
            }));

            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        return 'Data followers & following berhasil diperbarui untuk semua pengguna.'; // ✅ Return ke router
    } catch (error) {
        console.error('Error executing update:', error.message);
        throw new Error(`Error executing update: ${error.message}`); // ✅ Kirim error ke router
    }
};

module.exports = {
    getDataUser,
    getDataPost,
    getDataComment,
    getDataChildComment,
    getDataLikes,
    getDataPostByKeyword,
    getDataPostByCode,
    getDataFollowers
};
