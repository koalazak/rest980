var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var config = require('config');
var dorita980 = require('dorita980');

if (!config.blid || !config.password) {
  throw new Error('Please edit config/default.json file with your robot credentials.');
}

var myRobotLocal;
var myRobotCloud;
if (config.robotIP) {
  myRobotLocal = new dorita980.Local(config.blid, config.password, config.robotIP);
  myRobotCloud = new dorita980.Cloud(config.blid, config.password, config.robotIP);
} else {
  dorita980.getRobotIP(function (e, ip) {
    if (e) throw e;
    myRobotLocal = new dorita980.Local(config.blid, config.password, ip);
    myRobotCloud = new dorita980.Cloud(config.blid, config.password, ip);
  });
}

var helloRoute = require('./routes/index');
var apiRoute = require('./routes/api');

var app = express();

app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(function (req, res, next) {
  req.dorita980 = {
    local: myRobotLocal,
    cloud: myRobotCloud
  };
  next();
});

app.use('/', helloRoute);
app.use('/api', apiRoute);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error('Endpoint not found.');
  err.status = 404;
  next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
  app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.send({
      message: err.message,
      error: err
    });
  });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
  res.status(err.status || 500);
  res.send({
    message: err.message,
    error: {}
  });
});

module.exports = app;
