var express = require('express');
var router = express.Router();

router.get('/', function (req, res, next) {
  res.send({
    version: '1.0'}
  );
});

/*
// as example if you need to handle special things in request...
router.get('/status/mission', function (req, res, next) {
  req.dorita980.local.getMission().then(function (resp) {
    res.send(resp);
  }).catch(next);
});
*/

router.get('/local/action/start', map2dorita('local', 'start'));
router.get('/local/action/stop', map2dorita('local', 'stop'));
router.get('/local/action/pause', map2dorita('local', 'pause'));
router.get('/local/action/dock', map2dorita('local', 'dock'));
router.get('/local/action/resume', map2dorita('local', 'resume'));

router.get('/local/config/time', map2dorita('local', 'getTime'));
router.post('/local/config/time', map2dorita('local', 'setTime', true));
router.post('/local/config/ptime', map2dorita('local', 'setPtime', true));

router.get('/local/config/langs', map2dorita('local', 'getLangs'));
router.get('/local/config/bbrun', map2dorita('local', 'getBbrun'));
router.get('/local/config/week', map2dorita('local', 'getWeek'));
router.get('/local/config/cloud', map2dorita('local', 'getCloudConfig'));
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

// TODO Cloud routes.

function map2dorita (source, method, hasArgs) {
  return function (req, res, next) {
    if (hasArgs) {
      if (!req.body.args) return next('Invalid arguments.');
    }
    req.dorita980[source][method](hasArgs ? req.body.args : undefined).then(function (resp) {
      res.send(resp);
    }).catch(next);
  };
}

module.exports = router;
