var express = require('express');
var app = express();

//Form data
var bodyParser = require('body-parser');

// load the mysql library
var mysql = require('mysql');

// create a connection to our Cloud9 server
var connection = mysql.createConnection({
  host     : 'localhost',
  user     : 'florentlefebvre', // CHANGE THIS :)
  password : '',
  database: 'reddit'
});

//Reddit API
var reddit = require('./reddit');
var redditAPI = reddit(connection);

//Form data
app.use(bodyParser.urlencoded({ extended: false }));

//Template Engine
app.set('view engine', 'pug');



//4
app.get('/posts', function(request, response){
    var options = {
        numPerPage : 5
    }
    redditAPI.getAllPosts(options, function(error, posts){
        response.render('post-list', {posts: posts});
    });
});

//5
app.get('/createContent', function(request, response){
    response.render('create-content');
});

//6
app.post('/createContent', function(request, response){
    if(request.body){
        response.send(request.body);
        var post = {
            title: request.body.title,
            url: request.body.url,
            userId: 1
        };
        redditAPI.createPost(post, 1, function(err, res){
            if(err){
                console.log(err)
            }
            else {
                response.send(request.body);
            }
        });
    }
});

var server = app.listen(process.env.PORT, process.env.IP, function(){
    var host = process.env.C9_HOSTNAME;
    var port = server.address().port;
    console.log('My reddit runs at http://%s:%s', host, port);
});