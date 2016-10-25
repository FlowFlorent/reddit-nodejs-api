var bcrypt = require('bcrypt');
var HASH_ROUNDS = 10;

module.exports = function RedditAPI(conn) {
  var api = {
    //DONE
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
    //DONE
    createPost: function(post, subredditId, callback) {
      if (!subredditId) {
        callback(new Error('subredditId is required'));
        return;
      }
      conn.query(
        'INSERT INTO posts (userId, subredditId, title, url, createdAt) VALUES (?, ?, ?, ?, ?)', [post.userId, subredditId, post.title, post.url, new Date()],
        function(err, result) {
          if (err) {
            callback(err);
          }
          else {
            /*
            Post inserted successfully. Let's use the result.insertId to retrieve
            the post and send it to the caller!
            */
            api.getSinglePost(result.insertId, callback);
          }
        }
      );
    },
    //DONE
    createSubreddit: function(subreddit, callback) {
      if (!subreddit || !subreddit.name) {
        callback(new Error('name is mandatory'));
        return;
      }
      conn.query(
        'INSERT INTO subreddits (name, description) VALUES (?, ?)', [subreddit.name, subreddit.description || ''],
        function(err, result) {
          if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
              callback(new Error('A subreddit with this name already exists'));
            }
            else {
              callback(err);
            }
          }
          else {
            /*
            Subreddit inserted successfully. Let's use the result.insertId to retrieve
            the post and send it to the caller!
            */
            conn.query(
              'SELECT id, name, description FROM subreddits WHERE id = ?', [result.insertId],
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
    //DONE
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
    },
    //DONE
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
    //NOT MODIFIED YET
    //TODO: sortingMethod
    getAllPosts: function(options, callback) {
          // In case we are called without an options parameter, shift all the parameters manually
          if (!callback) {
            callback = options;
            options = {};
          }
          var limit = options.numPerPage || 25; // if options.numPerPage is "falsy" then use 25
          var offset = (options.page || 0) * limit;
          
          conn.query(`
            SELECT
              posts.id as posts_id,
              posts.title as posts_title,
              posts.url as posts_url,
              users.id as users_id,
              users.username as users_username,
              subreddits.id as subreddits_id,
              subreddits.name as subreddits_name,
              subreddits.description as subreddits_description
            FROM posts
            JOIN users ON posts.userId = users.id
            JOIN subreddits ON posts.subredditId = subreddits.id
            ${options.userId ? 'WHERE users.id = ?' : ''}
            ${options.postId ? 'WHERE posts.id = ?' : ''}
            ORDER BY posts.createdAt DESC
            LIMIT ? OFFSET ?`
            , options.userId ? [options.userId, limit, offset] : options.postId? [options.postId, limit, offset] : [limit, offset],
            function(err, results) {
              if (err) {
                callback(err);
              }
              else {
                results = results.map(function(result) {
                  return {
                    id: result.posts_id,
                    title: result.posts_title,
                    url: result.posts_url,
                    user: {
                      id: result.users_id,
                      username: result.users_username
                    },
                    subreddit: {
                      id: result.subreddits_id,
                      name: result.subreddits_name,
                      description: result.subreddits_description
                    }
                  };
                });
                
                if (options.postId) {
                  callback(null, results[0]);
                }
                else {
                  callback(null, results);
                }
                
              }
            }
          );
        },
    getAllPostsForUser: function(userId, options, callback) {
      if (!callback) {
        callback = options;
        options = {};
      }
      
      options.userId = userId;
      
      api.getAllPosts(options, callback);
    },
    getSinglePost: function(postId, callback) {
      api.getAllPosts({postId: postId}, callback);
    }
  }
  return api;
}
