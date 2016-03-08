var express = require('express');
var http = require('http');
var path = require('path');
var favicon = require('static-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var sentiment = require('sentiment');
var ntwitter = require('ntwitter');


var tweeter = new ntwitter({
    consumer_key: '',
    consumer_secret: '',
    access_token_key: '',
    access_token_secret: ''
});




var routes = require('./routes');



var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(favicon());
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(app.router);

var monitoringPhrase;

//app.get('/',routes.index);

//app.get('/testSentiment',routes.testSentiments);
function resetMonitoring() {
    if (stream) {
        var tempStream = stream;
        stream = null;  // signal to event handlers to ignore end/destroy
        tempStream.destroySilent();
    }
    monitoringPhrase = "";
}

function beginMonitoring(phrase) {
    // cleanup if we're re-setting the monitoring
    if (monitoringPhrase) {
        resetMonitoring();
    }
    monitoringPhrase = phrase;
    tweetCount = 0;
    tweetTotalSentiment = 0;
    tweeter.verifyCredentials(function (error, data) {
        if (error) {
            resetMonitoring();
            console.error("Error connecting to Twitter: " + error);
            if (error.statusCode === 401)  {
                console.error("Authorization failure.  Check your API keys.");
            }
        } else {
            tweeter.stream('statuses/filter', {
                'track': monitoringPhrase
            }, function (inStream) {
                // remember the stream so we can destroy it when we create a new one.
                // if we leak streams, we end up hitting the Twitter API limit.
                stream = inStream;
                console.log("Monitoring Twitter for " + monitoringPhrase);
                stream.on('data', function (data) {
                    // only evaluate the sentiment of English-language tweets
                    if (data.lang === 'en') {
                        sentiment(data.text, function (err, result) {
                            tweetCount++;
                            tweetTotalSentiment += result.score;
                        });
                    }
                });
                stream.on('error', function (error, code) {
                    console.error("Error received from tweet stream: " + code);
                    if (code === 420)  {
                        console.error("API limit hit, are you using your own keys?");
                    }
                    resetMonitoring();
                });
                stream.on('end', function (response) {
                    if (stream) { // if we're not in the middle of a reset already
                        // Handle a disconnection
                        console.error("Stream ended unexpectedly, resetting monitoring.");
                        resetMonitoring();
                    }
                });
                stream.on('destroy', function (response) {
                    // Handle a 'silent' disconnection from Twitter, no end/error event fired
                    console.error("Stream destroyed unexpectedly, resetting monitoring.");
                    resetMonitoring();
                });
            });
            return stream;
        }
    });
}

function sentimentImage() {
    var avg = tweetTotalSentiment / tweetCount;
    if (avg > 0.5) { // happy
        return "/images/happy.jpg";
    }
    if (avg < -0.5) { // angry
        return "/images/sad.jpg";
    }
    // neutral
    return "/images/emotionless.jpg";
}

app.get('/',
    function (req, res) {

        if (!monitoringPhrase) {
            res.render("index");
        } else {
            var monitoringResponse = "<head>" +
                "<meta http-equiv=\"refresh\" content=\"5; URL=http://" +
                req.headers.host +
                "/\">\n" +
                "<title>Twitter Sentiment Analysis</title>\n" +
                "<link rel=\"stylesheet\" href=\"http://maxcdn.bootstrapcdn.com/bootstrap/3.3.6/css/bootstrap.min.css\">"+
                "<script src=\"https://ajax.googleapis.com/ajax/libs/jquery/1.12.0/jquery.min.js\"></script>"+
                "<script src=\"http://maxcdn.bootstrapcdn.com/bootstrap/3.3.6/js/bootstrap.min.js\"></script>"+
                "</head>\n" +
                "<body>\n" +
                "<div class='col-md-2'></div><div class='col-md-8' style='font-size: 38px'><br>\n" +
                "<center>The tweet feeling about "+monitoringPhrase+ " is </center> </div><div class='col-md-2'></div>" +
                "<img style=\"margin: 20px 20px 20px 470px;\" height=\"300px\" width=\"300px\" src=\"" + sentimentImage() + "\"/><br>\n" +
                "<p style='font-size: 26px;'>"+

                "<div class='col-md-3'></div><div class='col-md-6' style='margin-left: 60px; font-size: 20px;'>"+"Analyzed"
                 + "<div style='font-size:38px;'>"+tweetCount + "</div> tweets..." +
                "<div style='margin: -72px 10px 10px 360px'><a href=\"/reset\"> Do it again ! </a>"+
                "<br><div class='col-md-3'> </div></div>" +

                "</body>";
            res.send(monitoringResponse);
        }
    });



app.get('/monitor', function (req, res) {
    var phrase = req.param("text");
    beginMonitoring(phrase);
    res.redirect(302, '/');
});

app.get('/reset', function (req, res) {
    resetMonitoring();
    res.redirect(302, '/');
});

/// catch 404 and forwarding to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

/// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.render('error', {
        message: err.message,
        error: {}
    });
});


module.exports = app;
