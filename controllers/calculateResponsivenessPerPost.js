const connection = require('../models/db');

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

const calculateResponsivenessPerPost = async (kategori) => {
    console.info(`[INFO] Starting responsiveness calculation per post for kategori: ${kategori}`);

    const [posts] = await connection.query(`
        SELECT *
        FROM posts
        WHERE comments > 0
        AND responsiveness_processed = 0
        AND FIND_IN_SET(?, kategori)         
        AND created_at > "2024-12-31"
    `, [kategori]);

    if (!posts.length) {
        console.warn(`[WARN] No unprocessed posts found.`);
        return;
    }

    console.info(`[INFO] Found ${posts.length} unprocessed posts.`);

    for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        try {
            const [incomingResult] = await connection.query(`
                SELECT comments AS incoming from posts WHERE unique_id_post = ? AND username = ?
            `, [post.unique_id_post, post.username]);

            const [replyResult] = await connection.query(`
                SELECT 
                    (SELECT COUNT(*) FROM mainComments WHERE unique_id_post = ? AND commenter_username = ?) +
                    (SELECT COUNT(*) FROM childComments WHERE unique_id_post = ? AND child_commenter_username = ?) AS replies
            `, [post.unique_id_post, post.username, post.unique_id_post, post.username]);

            const incoming = incomingResult[0].incoming || 0;
            const replies = replyResult[0].replies || 0;
            let responsiveness = null;

            if (incoming > 0 && incoming === replies) {
                responsiveness = null;
            } else if (incoming > replies) {
                responsiveness = (replies / (incoming - replies)) * 100;
            } else {
                responsiveness = null; // misal replies lebih banyak atau data janggal
            }

            console.info(`[PROCESS] ${i + 1}/${posts.length} | Post: ${post.unique_id_post} | User: ${post.username}`);
            console.info(`[PROCESS] Incoming: ${incoming} | Replies: ${replies} | Responsiveness: ${responsiveness}%`);

            await connection.query(`
                UPDATE posts 
                SET responsiveness_post = ?, responsiveness_processed = 1 
                WHERE unique_id_post = ?
            `, [responsiveness, post.unique_id_post]);

            await delay(10); // Optional delay kecil agar nggak bebanin MySQL terus menerus
        } catch (err) {
            console.error(`[ERROR] Post ${post.unique_id_post} gagal diproses:`, err.message);
        }
    }

    console.info(`[DONE] Responsiveness updated for ${posts.length} posts.`);
};

module.exports = { calculateResponsivenessPerPost };
