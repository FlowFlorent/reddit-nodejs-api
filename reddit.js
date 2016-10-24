var bcrypt = require('bcrypt');
var HASH_ROUNDS = 10;

module.exports = function RedditAPI(conn) {
  return {
    createUser: function(user, callback) {
      
      // first we have to hash the password...
      bcrypt.hash(user.password, HASH_ROUNDS, function(err, hashedPassword) {
        if (err) {
          callback(err);
        }
        else {
          conn.query(
            'INSERT INTO users (username,password, createdAt) VALUES (?, ?, ?)', [user.username, hashedPassword, new Date()],
            function(err, result) {
              if (err) {
                /*
                There can be many reasons why a MySQL query could fail. While many of
                them are unknown, there's a particular error about unique usernames
                which we can be more explicit about!
                */
                if (err.code === 'ER_DUP_ENTRY') {
                  callback(new Error('A user with this username already exists'));
                }
                else {
                  callback(err);
                }
              }
              else {
                /*
                Here we are INSERTing data, so the only useful thing we get back
                is the ID of the newly inserted row. Let's use it to find the user
                and return it
                */
                conn.query(
                  'SELECT id, username, createdAt, updatedAt FROM users WHERE id = ?', [result.insertId],
                  function(err, result) {
                    if (err) {
                      callback(err);
                    }
                    else {
                      /*
                      Finally! Here's what we did so far:
                      1. Hash the user's password
                      2. Insert the user in the DB
                      3a. If the insert fails, report the error to the caller
                      3b. If the insert succeeds, re-fetch the user from the DB
                      4. If the re-fetch succeeds, return the object to the caller
                      */
                        callback(null, result[0]);
                    }
                  }
                );
              }
            }
          );
        }
      });
    },
    createPost: function(post, subredditId, callback) {
      conn.query(
        'INSERT INTO posts (userId, title, url, createdAt, subredditId) VALUES (?, ?, ?, ?, ?)', [post.userId, post.title, post.url, new Date(), subredditId],
        function(err, result) {
          if (err) {
            callback(err);
          }
          else {
            /*
            Post inserted successfully. Let's use the result.insertId to retrieve
            the post and send it to the caller!
            */
            conn.query(
              'SELECT id,title,url,userId, subredditId, createdAt, updatedAt FROM posts WHERE id = ?', [result.insertId],
              function(err, result) {
                if (err) {
                  callback(err);
                }
                else {
                  callback(null, result[0]);
                }
              }
            );
          }
        }
      );
    },
    createSubbreddit: function(sub, callback){
        conn.query('INSERT INTO subreddits (name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?)', [sub.name, sub.description, new Date(), new Date()], function(err, result){
                if(err){
                    console.log("stuf");
                    callback(err);
                }
                else {
                    console.log("subreddit created!")
                    conn.query('SELECT * FROM subreddits WHERE name = ?',[sub.name], function(err, result) {
                       if(err){
                           callback(err);
                       } 
                       else {
                           callback(null, result[0]);
                       }
                    });
                }
            });
    },
    getAllSubreddits: function(callback) {
        conn.query('SELECT * FROM subreddits ORDER BY createdAt DESC;', function(err, result){
            if(err){
                callback(err);
            }
            else {
                callback(null, result);
            }
        });
    },
    getAllPosts: function(sortingMethod, options, callback) {
      // In case we are called without an options parameter, shift all the parameters manually
      if (!callback) {
        callback = options;
        options = {};
      }
      var limit = options.numPerPage || 25; // if options.numPerPage is "falsy" then use 25
      var offset = (options.page || 0) * limit;
      
      conn.query(`
            SELECT 
                posts.id AS postId, 
                title AS postTitle, 
                url AS postURL, 
                posts.createdAt AS postCreatedAt, 
                posts.updatedAt AS postUpdatedAt,
                posts.userId,
                username,
                users.createdAt AS userCreatedAt,
                users.updatedAt AS userUpdatedAt,
                subredditId,
                subreddits.name AS subName,
                subreddits.description AS subDescription,
                subreddits.createdAt AS subCreatedAt,
                subreddits.updatedAt AS subUpdatedAt,
                SUM(votes.vote) AS voteScore,
                numUpvotes = (SELECT SUM(votes.vote) WHERE votes.vote = 1),
                numDownvotes = (SELECT SUM(votes.vote) WHERE votes.vote = -1)
            FROM 
                posts
            LEFT JOIN users
            ON posts.userId = users.id
            LEFT JOIN subreddits
            ON posts.subredditId = subreddits.id
            LEFT JOIN votes
            ON votes.postId = posts.id AND votes.userId = users.id
            GROUP BY postId
            ${sortingMethod === 'new'? 'ORDER BY postCreatedAt DESC':'' }
            ${sortingMethod === 'top'? 'ORDER BY voteScore DESC':''}
            ${sortingMethod === 'hot'? 'ORDER BY voteScore '():''}
            LIMIT ? OFFSET ?`
        , [limit, offset],
        function(err, results) {
          if (err) {
            callback(err);
          }
          else {
            var neatResults = results.map(function(row){
              return {
                "id": row.postId,
                "title": row.postTitle,
                "url": row.postURL,
                "createdAt": row.postCreatedAt,
                "updatedAt": row.postUpdatedAt,
                "userId": row.userId,
                "user": {
                  "id": row.userId,
                  "username": row.username,
                  "createdAt": row.userCreatedAt,
                  "updatedAt": row.userUpdatedAt
                },
                "subredditId": row.subredditId,
                "subreddit": {
                    "id": row.subredditId,
                    "name": row.subName,
                    "description": row.subDescription,
                    "createdAt": row.subCreatedAt,
                    "updatedAt": row.subUpdatedAt
                },
                "voteScore": row.voteScore
              }
            });
            callback(null, neatResults);
          }
        }
      );
    },
    getAllPostsForUser: function(userId, options, callback) {
      // In case we are called without an options parameter, shift all the parameters manually
      if (!callback) {
        callback = options;
        options = {};
      }
      var limit = options.numPerPage || 25; // if options.numPerPage is "falsy" then use 25
      var offset = (options.page || 0) * limit;
      
      conn.query(`
SELECT 
    posts.id AS postId, 
    title AS postTitle, 
    url AS postURL, 
    posts.createdAt AS postCreatedAt, 
    posts.updatedAt AS postUpdatedAt,
    userId,
    username,
    users.createdAt AS userCreatedAt,
    users.updatedAt AS userUpdatedAt,
    subredditId,
    subreddits.name AS subName,
    subreddits.description AS subDescription,
    subreddits.createdAt AS subCreatedAt,
    subreddits.updatedAt AS subUpdatedAt
FROM 
    posts
JOIN users
ON posts.userId = ?
LEFT JOIN subreddits
ON posts.subredditId = subreddits.id
ORDER BY postCreatedAt DESC
LIMIT ? OFFSET ?`
        , [userId, limit, offset],
        function(err, results) {
          if (err) {
            callback(err);
          }
          else {
            var neatResults = results.map(function(row){
              return {
                "id": row.postId,
                "title": row.postTitle,
                "url": row.postURL,
                "createdAt": row.postCreatedAt,
                "updatedAt": row.postUpdatedAt,
                "userId": row.userId,
                "user": {
                  "id": row.userId,
                  "username": row.username,
                  "createdAt": row.userCreatedAt,
                  "updatedAt": row.userUpdatedAt
                },
                "subredditId": row.subredditId,
                "subreddit": {
                    "id": row.subredditId,
                    "name": row.subName,
                    "description": row.subDescription,
                    "createdAt": row.subCreatedAt,
                    "updatedAt": row.subUpdatedAt
                }
              }
            });
            callback(null, neatResults);
          }
        }
      );
    },
    getSinglePost: function(postId, callback){
        //TODO If wrong post ID
        conn.query(`
SELECT 
    posts.id AS postId, 
    title AS postTitle, 
    url AS postURL, 
    posts.createdAt AS postCreatedAt, 
    posts.updatedAt AS postUpdatedAt,
    userId,
    username,
    users.createdAt AS userCreatedAt,
    users.updatedAt AS userUpdatedAt,
    subredditId,
    subreddits.name AS subName,
    subreddits.description AS subDescription,
    subreddits.createdAt AS subCreatedAt,
    subreddits.updatedAt AS subUpdatedAt
FROM 
    posts
LEFT JOIN users
ON posts.userId = users.id
LEFT JOIN subreddits
ON posts.subredditId = subreddits.id
WHERE posts.id = ?;
`
        , [postId],
        function(err, results) {
          if (err) {
            callback(err);
          }
          else {
              if (results.length > 0){
                  var neatResults = {
                    "id": results[0].postId,
                    "title": results[0].postTitle,
                    "url": results[0].postURL,
                    "createdAt": results[0].postCreatedAt,
                    "updatedAt": results[0].postUpdatedAt,
                    "userId": results[0].userId,
                    "user": {
                      "id": results[0].userId,
                      "username": results[0].username,
                      "createdAt": results[0].userCreatedAt,
                      "updatedAt": results[0].userUpdatedAt
                    },
                    "subredditId": results[0].subredditId,
                    "subreddit": {
                    "id": results[0].subredditId,
                    "name": results[0].subName,
                    "description": results[0].subDescription,
                    "createdAt": results[0].subCreatedAt,
                    "updatedAt": results[0].subUpdatedAt
                }
                  }
                callback(null, neatResults);
              }
              else{
                  console.log("Post does not exist!")
              }
          }
        }
      );
    },
    createVote: function(vote, callback){
        if (vote.vote === 1 || vote.vote === 0 || vote.vote === -1){
            conn.query(`
                INSERT INTO votes
                SET 
                    postId = ?,
                    userId = ?,
                    vote = ?,
                ON DUPLICATE KEY
                UPDATE
                    vote = ?`, [vote.postId, vote.userId, vote.vote, vote.vote],
                function(err, result){
                    if(err){
                        callback(err);
                    }
                    else {
                        console.log("Vote success!");
                        callback(null, result);
                    }
            });
        }
        else {
            console.log("Don't try and cheat the vote system!")
        }
    }
  }
}
