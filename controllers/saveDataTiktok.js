const connection = require('../models/db');

// fungsi untuk menyimpan data user ke database
const saveUser = async (user) => {
    const sql = `
                    INSERT INTO users (username, user_id, secUid, followers, following, mediaCount, likeCount) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                    user_id = VALUES(user_id),
                    secUid = VALUES(secUid),
                    followers = VALUES(followers),
                    following = VALUES(following),
                    mediaCount = VALUES(mediaCount),
                    likeCount = VALUES(likeCount)
                `;
    connection.query(sql, [
        user.username, user.user_id, user.secUid, user.followers, user.following, user.mediaCount, user.likeCount
    ],
        (err, result) => {
            if (err) {
                console.error(`Error saving user ${user.username} to database:`, err.message);
            } else {
                console.log(`Saved user ${user.username} to database`);
            }
        }
    );
};

// fungsi untuk menyimpan data post ke database
const savePost = async (post) => {
    const sql = `
        INSERT INTO posts (user_id, unique_id_post, aweme_id, username, created_at, thumbnail_url, caption, comments, likes, playCount, shareCount, downloadCount, collectCount, is_pinned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            user_id = VALUES(user_id),
            aweme_id = VALUES(aweme_id),
            username = VALUES(username),
            created_at = VALUES(created_at),
            thumbnail_url = VALUES(thumbnail_url),
            caption = VALUES(caption),
            comments = VALUES(comments),
            likes = VALUES(likes),
            playCount = VALUES(playCount),
            shareCount = VALUES(shareCount),
            downloadCount = VALUES(downloadCount),
            collectCount = VALUES(collectCount),
            is_pinned = VALUES(is_pinned)
    `;
    connection.query(sql, [
        post.user_id,
        post.unique_id_post,
        post.aweme_id,
        post.username,
        post.created_at,
        post.thumbnail_url,
        post.caption,
        post.comments,
        post.likes,
        post.playCount,
        post.shareCount,
        post.downloadCount,
        post.collectCount,
        post.is_pinned
    ],
        (err, result) => {
            if (err) {
                console.error(`Error saving post ${post.unique_id_post} to database:`, err.message);
            } else {
                console.log(`Saved post ${post.unique_id_post} to database`);
            }
        }
    );
};

// fungsi untuk menyimpan data comment ke database
const saveComment = async (comment) => {
    const sql = `
        INSERT INTO mainComments (user_id, username, unique_id_post, comment_unique_id, created_at, commenter_username, commenter_userid, comment_text, comment_like_count, child_comment_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            user_id = VALUES(user_id),
            username = VALUES(username),
            unique_id_post = VALUES(unique_id_post),
            created_at = VALUES(created_at),
            commenter_username = VALUES(commenter_username),
            commenter_userid = VALUES(commenter_userid),
            comment_text = VALUES(comment_text),
            comment_like_count = VALUES(comment_like_count),
            child_comment_count = VALUES(child_comment_count)
    `;
    connection.query(sql, [
        comment.user_id,
        comment.username,
        comment.unique_id_post,
        comment.comment_unique_id,
        comment.created_at,
        comment.commenter_username,
        comment.commenter_userid,
        comment.comment_text,
        comment.comment_like_count,
        comment.child_comment_count
    ],
        (err, result) => {
            if (err) {
                console.error(`Error saving comments ${comment.unique_id_post} to database:`, err.message);
            } else {
                console.log(`Saved comments ${comment.unique_id_post} to database`);
            }
        }
    );
};

const saveChildComment = async (childComment) => {
    const sql = `
        INSERT INTO childComments 
        (user_id, username, unique_id_post, comment_unique_id, child_comment_unique_id, created_at, 
        child_commenter_username, child_commenter_userid, child_comment_text, child_comment_like_count)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
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
        childComment.user_id,
        childComment.username,
        childComment.unique_id_post,
        childComment.comment_unique_id,
        childComment.child_comment_unique_id,
        childComment.created_at,
        childComment.child_commenter_username,
        childComment.child_commenter_userid,
        childComment.child_comment_text,
        childComment.child_comment_like_count
    ], (err, result) => {
        if (err) {
            console.error(`Error saving child comment ID ${childComment.child_comment_unique_id} to database:`, err.message);
            reject(err);
        } else {
            console.log(`Saved child comment ID ${childComment.child_comment_unique_id} to database`);
            resolve(result);
        }
    });
};

module.exports = {
    saveUser,
    savePost,
    saveComment,
    saveChildComment
};
