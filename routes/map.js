var express = require('express');
var router = express.Router();
var jsonfile = require('jsonfile');
var valuesPath = './config/mapvalues.json';

router.get('/', function (req, res) {
  var mapvalues = jsonfile.readFileSync(valuesPath);
  res.render('map', {title: 'Map (experimental)', mapvalues: mapvalues});
});

router.post('/values', function (req, res) {
  var mapvalues = jsonfile.readFileSync(valuesPath);

  mapvalues.offsetX = req.body.offsetX || mapvalues.offsetX;
  mapvalues.offsetY = req.body.offsetY || mapvalues.offsetY;
  mapvalues.sizeW = req.body.sizeW || mapvalues.sizeW;
  mapvalues.sizeH = req.body.sizeH || mapvalues.sizeH;
  mapvalues.pointIntervalMs = req.body.pointIntervalMs || mapvalues.pointIntervalMs;

  jsonfile.writeFileSync(valuesPath, mapvalues, {spaces: 2});
  res.json(mapvalues);
});

module.exports = router;
