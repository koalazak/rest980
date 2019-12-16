'use strict';

var express = require('express');
var router = express.Router();
var config = require('config');
var dorita980 = require('dorita980');

var blid = process.env.BLID || config.blid;
var password = process.env.PASSWORD || config.password;
var robotIP = process.env.ROBOT_IP || config.robotIP;
var knownIP = robotIP;
var firmwareVersion = parseInt((process.env.FIRMWARE_VERSION || config.firmwareVersion || 1), 10);
var enableLocal = process.env.ENABLE_LOCAL || config.enableLocal || 'yes';
var enableCloud = process.env.ENABLE_CLOUD || config.enableCloud || 'yes';
var keepAlive = process.env.KEEP_ALIVE || config.keepAlive || 'yes';

// Temporal:
if (firmwareVersion === 2) enableCloud = 'no';

if (!blid || !password) {
  throw new Error('Config not found. Please edit config/default.json file with your robot credentials. Or set BLID, PASSWORD and ROBOT_IP enviroment variables.');
}

var myRobot = {};

var handleIP = (robotIP || enableLocal === 'no') ? function (cb) { cb(null, robotIP); } : dorita980.getRobotIP;
handleIP(function (e, ip) {
  if (e) throw e;
  knownIP = ip;
  if (enableLocal === 'yes') {
    if (firmwareVersion === 1 || (keepAlive === 'yes')) myRobot.local = new dorita980.Local(blid, password, ip, firmwareVersion);
  }
  if (enableCloud === 'yes') myRobot.cloud = new dorita980.Cloud(blid, password, firmwareVersion);
});

router.get('/', function (req, res) {
  res.send({
    version: '1.0.' + firmwareVersion}
  );
});

/*
// as example if you need to handle special things in a request...
router.get('/status/mission', function (req, res, next) {
  myRobot.local.getMission().then(function (resp) {
    res.send(resp);
  }).catch(next);
});
*/

// LOCAL:

var missingInFirmw2 = ['setTime', 'setPtime'];

router.get('/local/action/start', map2dorita('local', 'start'));
router.get('/local/action/stop', map2dorita('local', 'stop'));
router.get('/local/action/pause', map2dorita('local', 'pause'));
router.get('/local/action/dock', map2dorita('local', 'dock'));
router.get('/local/action/resume', map2dorita('local', 'resume'));

router.post('/local/action/cleanRoom', map2dorita('local', 'cleanRoom', true));

router.get('/local/config/time', map2dorita('local', 'getTime'));
router.post('/local/config/time', map2dorita('local', 'setTime', true));

router.post('/local/config/ptime', map2dorita('local', 'setPtime', true));

router.get('/local/config/langs', map2dorita('local', 'getLangs'));
router.get('/local/config/bbrun', map2dorita('local', 'getBbrun'));
router.get('/local/config/cloud', map2dorita('local', 'getCloudConfig'));

router.get('/local/config/week', map2dorita('local', 'getWeek'));
router.post('/local/config/week', map2dorita('local', 'setWeek', true));

router.post('/local/config/carpetBoost/auto', map2dorita('local', 'setCarpetBoostAuto'));
router.post('/local/config/carpetBoost/performance', map2dorita('local', 'setCarpetBoostPerformance'));
router.post('/local/config/carpetBoost/eco', map2dorita('local', 'setCarpetBoostEco'));

router.post('/local/config/edgeClean/on', map2dorita('local', 'setEdgeCleanOn'));
router.post('/local/config/edgeClean/off', map2dorita('local', 'setEdgeCleanOff'));

router.post('/local/config/cleaningPasses/auto', map2dorita('local', 'setCleaningPassesAuto'));
router.post('/local/config/cleaningPasses/one', map2dorita('local', 'setCleaningPassesOne'));
router.post('/local/config/cleaningPasses/two', map2dorita('local', 'setCleaningPassesTwo'));

router.post('/local/config/alwaysFinish/on', map2dorita('local', 'setAlwaysFinishOn'));
router.post('/local/config/alwaysFinish/off', map2dorita('local', 'setAlwaysFinishOff'));

router.post('/local/config/preferences', map2dorita('local', 'setPreferences', true));
router.get('/local/config/preferences', map2dorita('local', 'getPreferences'));

router.get('/local/info/sku', map2dorita('local', 'getSKU'));
router.get('/local/info/wireless', map2dorita('local', 'getWirelessStatus'));
router.get('/local/info/lastwireless', map2dorita('local', 'getWirelessLastStatus'));
router.get('/local/info/mission', map2dorita('local', 'getMission'));
router.get('/local/info/sys', map2dorita('local', 'getSys'));

if (firmwareVersion === 2) {
  router.get('/local/info/state', map2dorita('local', 'getRobotState'));
}

// CLOUD:

router.get('/cloud/info/status', map2dorita('cloud', 'getStatus'));
router.get('/cloud/info/history', map2dorita('cloud', 'accumulatedHistorical'));
router.get('/cloud/info/missionHistory', map2dorita('cloud', 'missionHistory'));

router.get('/cloud/action/clean', map2dorita('cloud', 'clean'));
router.get('/cloud/action/quick', map2dorita('cloud', 'quick'));
router.get('/cloud/action/spot', map2dorita('cloud', 'spot'));
router.get('/cloud/action/dock', map2dorita('cloud', 'dock'));
router.get('/cloud/action/start', map2dorita('cloud', 'start'));
router.get('/cloud/action/stop', map2dorita('cloud', 'stop'));
router.get('/cloud/action/pause', map2dorita('cloud', 'pause'));
router.get('/cloud/action/resume', map2dorita('cloud', 'resume'));
router.get('/cloud/action/wake', map2dorita('cloud', 'wake'));
router.get('/cloud/action/reset', map2dorita('cloud', 'reset'));
router.get('/cloud/action/find', map2dorita('cloud', 'find'));
router.get('/cloud/action/wipe', map2dorita('cloud', 'wipe'));
router.get('/cloud/action/sleep', map2dorita('cloud', 'sleep'));
router.get('/cloud/action/off', map2dorita('cloud', 'off'));
router.get('/cloud/action/fbeep', map2dorita('cloud', 'fbeep'));

// helper:

function map2dorita (source, method, hasArgs) {
  return function (req, res, next) {
    if (firmwareVersion === 2 && source === 'cloud') {
      // temporal
      return next('Cloud API not implemented yet for firmware 2.x.x');
    }
    if (firmwareVersion === 2 && missingInFirmw2.indexOf(method) > -1) {
      return next('Method not implemented for firmware 2.x.x');
    }
    if (enableLocal === 'no' && source === 'local') {
      return next('Local API disabled by config.');
    }
    if (enableCloud === 'no' && source === 'cloud') {
      return next('Cloud API disabled by config.');
    }

    if ((!myRobot.local && enableLocal === 'yes' && keepAlive === 'yes') || (!myRobot.cloud && enableCloud === 'yes')) return next(new Error('Connection with robot not ready.'));

    if (hasArgs) {
      if (!req.body) return next('Invalid arguments.');
    }

    if (keepAlive === 'no' && firmwareVersion === 2) {
      return sendAndDisconnect(method, hasArgs ? req.body : undefined, res, next);
    }
    myRobot[source][method](hasArgs ? req.body : undefined).then(function (resp) {
      res.send(resp);
    }).catch(next);
  };
}

function sendAndDisconnect (method, args, res, next) {
  let client = new dorita980.Local(blid, password, knownIP, 2);
  client.on('connect', function () {
    client[method](args).then(function (resp) {
      res.send(resp);
      client.end();
    }).catch(next);
  });
}

module.exports = router;
