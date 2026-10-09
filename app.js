var express = require('express');
var path = require('path');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var basicAuth = require('basic-auth');
var config = require('config');
var debug = require('debug')('rest980:server');

var helloRoute = require('./routes/index');
var apiRoute = require('./routes/api');
var mapRoute = require('./routes/map');

var app = express();

// Authentication handler
var basicAuthUser = process.env.BASIC_AUTH_USER || config.basicAuthUser;
var basicAuthPass = process.env.BASIC_AUTH_PASS || config.basicAuthPass;
var publicRoutes = [];

var authHandler = function (req, res, next) {
  // Allow if basic auth is not enabled
  if (!basicAuthUser || !basicAuthPass) return next();

  // Allow whitelisted public routes
  if (publicRoutes.indexOf(req.path) > -1) return next();

  function unauthorized (res) {
    res.set('WWW-Authenticate', 'Basic realm=Authorization Required');
    return res.sendStatus(401);
  }

  // Get basis auth credentials
  var user = basicAuth(req);
  if (!user || !user.name || !user.pass) {
    return unauthorized(res);
  }

  // Check credentials
  if (user.name === basicAuthUser && user.pass === basicAuthPass) {
    return next();
  } else {
    return unauthorized(res);
  }
};

app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(authHandler);

app.use('/', helloRoute);
app.use('/api', apiRoute);
app.use('/map', mapRoute);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  var err = new Error('Endpoint not found.');
  err.status = 404;
  next(err);
});

// error handler (needs all 4 args, or Express won't treat it as one)
app.use(function (err, req, res, next) {
  if (res.headersSent) return next(err);
  // map2dorita passes plain strings to next()
  if (typeof err === 'string') err = new Error(err);
  // the default handler used to print these, keep them visible (DEBUG=rest980:*)
  if (!err.status || err.status >= 500) debug(err.stack);
  res.status(err.status || 500);
  res.json({
    message: err.message,
    // stacktrace only in development
    error: app.get('env') === 'development' ? { stack: err.stack } : {}
  });
});

module.exports = app;
