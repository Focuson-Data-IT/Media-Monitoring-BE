const connection = require('../models/db');

// Fungsi untuk menyimpan data user ke database
const saveUser = async (user) => {
    const sql = `
        INSERT INTO users (client_account, kategori, platform, username, user_id, followers, following, mediaCount, profile_pic_url) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            client_account = IF(
                        FIND_IN_SET(VALUES(client_account), client_account) > 0, 
                        client_account, 
                        CONCAT_WS(',', client_account, VALUES(client_account))
                    ),
                kategori = IF(
                        FIND_IN_SET(VALUES(kategori), kategori) > 0, 
                        kategori, 
                        CONCAT_WS(',', kategori, VALUES(kategori))
                    ),
            platform = VALUES(platform),
            followers = VALUES(followers),
            following = VALUES(following),
            mediaCount = VALUES(mediaCount),
            profile_pic_url = VALUES(profile_pic_url)
    `;
    connection.query(sql, [
        user.client_account, user.kategori, user.platform,
        user.username, user.user_id, user.followers, user.following, user.mediaCount, user.profile_pic_url
    ],
        (err, result) => {
            if (err) {
                console.error(`Error saving user ${user.username} to database:`, err.message);
            } else {
                console.log(`Saved user ${user.username}, ${user.kategori}, untuk platform ${user.platform} to database`);
            }
        }
    );
};

// Fungsi untuk menyimpan data post ke database
const savePost = async (post) => {
    const sql = `
        INSERT INTO posts (client_account, kategori, platform, username, user_id, unique_id_post, created_at, thumbnail_url, caption, post_code, 
            comments, likes, media_name, product_type, tagged_users, is_pinned, followers, following, playCount,
            collectCount, shareCount, downloadCount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            client_account = IF(
                        FIND_IN_SET(VALUES(client_account), client_account) > 0, 
                        client_account, 
                        CONCAT_WS(',', client_account, VALUES(client_account))
                    ),
                kategori = IF(
                        FIND_IN_SET(VALUES(kategori), kategori) > 0, 
                        kategori, 
                        CONCAT_WS(',', kategori, VALUES(kategori))
                    ),
            platform = VALUES(platform),
            username = VALUES(username),
            user_id = VALUES(user_id),
            created_at = VALUES(created_at),
            thumbnail_url = VALUES(thumbnail_url),
            caption = VALUES(caption),
            post_code = VALUES(post_code),
            comments = VALUES(comments),
            likes = VALUES(likes),
            media_name = VALUES(media_name),
            product_type = VALUES(product_type),
            tagged_users = VALUES(tagged_users),
            is_pinned = VALUES(is_pinned),
            followers = VALUES(followers),
            following = VALUES(following),
            playCount = VALUES(playCount),
            collectCount = VALUES(collectCount),
            shareCount = VALUES(shareCount),
            downloadCount = VALUES(downloadCount)
    `;

    try {
        await connection.query(sql, [
            post.client_account, post.kategori, post.platform, post.username,
            post.user_id, post.unique_id_post, post.created_at, post.thumbnail_url, post.caption, post.post_code, 
            post.comments, post.likes, post.media_name, post.product_type, post.tagged_users, post.is_pinned, 
            post.followers, post.following, post.playCount, post.collectCount, post.shareCount, post.downloadCount
        ]);
        console.log(`✅ Saved post ${post.unique_id_post} for ${post.username} in kategori ${post.kategori}`);
    } catch (error) {
        console.error(`❌ Error saving post ${post.unique_id_post} to database:`, error.message);
    }
};

// Fungsi untuk menyimpan data comment ke database
const saveComment = async (comment) => {
    const sql = `
        INSERT INTO mainComments (client_account, kategori, platform, username, user_id, unique_id_post, comment_unique_id, created_at, 
            commenter_username, commenter_userid, comment_text, comment_like_count, child_comment_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            client_account = IF(
                        FIND_IN_SET(VALUES(client_account), client_account) > 0, 
                        client_account, 
                        CONCAT_WS(',', client_account, VALUES(client_account))
                    ),
                kategori = IF(
                        FIND_IN_SET(VALUES(kategori), kategori) > 0, 
                        kategori, 
                        CONCAT_WS(',', kategori, VALUES(kategori))
                    ),
            platform = VALUES(platform),
            username = VALUES(username),
            user_id = VALUES(user_id),
            unique_id_post = VALUES(unique_id_post),
            created_at = VALUES(created_at),
            commenter_username = VALUES(commenter_username),
            commenter_userid = VALUES(commenter_userid),
            comment_text = VALUES(comment_text),
            comment_like_count = VALUES(comment_like_count),
            child_comment_count = VALUES(child_comment_count)
    `;
    connection.query(sql, [
        comment.client_account, comment.kategori, comment.platform, comment.username,
        comment.user_id, comment.unique_id_post, comment.comment_unique_id, comment.created_at,
        comment.commenter_username, comment.commenter_userid, comment.comment_text, comment.comment_like_count, comment.child_comment_count
    ], (err, result) => {
        if (err) {
            console.error(`❌ Error saving comment ${comment.comment_unique_id} for ${comment.client_account}:`, err.message);
        } else {
            console.log(`✅ Saved comment ${comment.comment_unique_id} for ${comment.client_account} in kategori ${comment.kategori}`);
        }
    });
};

// Fungsi untuk menyimpan data child comment ke database
const saveChildComment = async (childComment) => {
    const sql = `
        INSERT INTO childComments 
        (client_account, kategori, platform, 
        user_id, username, unique_id_post, comment_unique_id, child_comment_unique_id, created_at, 
        child_commenter_username, child_commenter_userid, child_comment_text, child_comment_like_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            client_account = IF(
                        FIND_IN_SET(VALUES(client_account), client_account) > 0, 
                        client_account, 
                        CONCAT_WS(',', client_account, VALUES(client_account))
                    ),
                kategori = IF(
                        FIND_IN_SET(VALUES(kategori), kategori) > 0, 
                        kategori, 
                        CONCAT_WS(',', kategori, VALUES(kategori))
                    ),
            platform = VALUES(platform),
            user_id = VALUES(user_id),
            username = VALUES(username),
            unique_id_post = VALUES(unique_id_post),
            comment_unique_id = VALUES(comment_unique_id),
            created_at = VALUES(created_at),
            child_commenter_username = VALUES(child_commenter_username),
            child_commenter_userid = VALUES(child_commenter_userid),
            child_comment_text = VALUES(child_comment_text),
            child_comment_like_count = VALUES(child_comment_like_count)
    `;

    connection.query(sql, [
        childComment.client_account, childComment.kategori, childComment.platform,
        childComment.user_id, childComment.username,
        childComment.unique_id_post, childComment.comment_unique_id, childComment.child_comment_unique_id, childComment.created_at,
        childComment.child_commenter_username, childComment.child_commenter_userid, childComment.child_comment_text, childComment.child_comment_like_count
    ], (err, result) => {
        if (err) {
            console.error(`❌ Error saving child comment ID ${childComment.child_comment_unique_id} for ${childComment.client_account}:`, err.message);
        } else {
            console.log(`✅ Saved child comment ID ${childComment.child_comment_unique_id} for ${childComment.client_account} in kategori ${childComment.kategori}`);
        }
    });
};

const saveDataPostByKeywords = async (post) => {
    const sql = `
        INSERT INTO posts (
        client_account, kategori, platform, keywords, 
        user_id, username, unique_id_post, created_at, 
        thumbnail_url, caption, comments, likes, 
        playCount, collectCount, shareCount, downloadCount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            client_account = IF(
                        FIND_IN_SET(VALUES(client_account), client_account) > 0, 
                        client_account, 
                        CONCAT_WS(',', client_account, VALUES(client_account))
                    ),
                kategori = IF(
                        FIND_IN_SET(VALUES(kategori), kategori) > 0, 
                        kategori, 
                        CONCAT_WS(',', kategori, VALUES(kategori))
                    ),
            platform = VALUES(platform),
            keywords = VALUES(keywords),
            user_id = VALUES(user_id),
            username = VALUES(username),
            created_at = VALUES(created_at),
            thumbnail_url = VALUES(thumbnail_url),
            caption = VALUES(caption),
            comments = VALUES(comments),
            likes = VALUES(likes),
            playCount = VALUES(playCount),
            collectCount = VALUES(collectCount),
            shareCount = VALUES(shareCount),
            downloadCount = VALUES(downloadCount)
    `;
    connection.query(sql, [
        post.client_account, post.kategori, post.platform, post.keywords,
        post.user_id, post.username, post.unique_id_post, post.created_at,
        post.thumbnail_url, post.caption, post.comments, post.likes,
        post.playCount, post.collectCount, post.shareCount, post.downloadCount
    ], (err, result) => {
        if (err) {
            console.error(`❌ Error saving post ${post.unique_id_post} to database:`, err.message);
        } else {
            console.log(`✅ Saved post ${post.unique_id_post} for ${post.client_account} in kategori ${post.kategori}`);
        }
    });
};

module.exports = {
    saveUser,
    savePost,
    saveComment,
    saveChildComment,
    saveDataPostByKeywords
};
