var express = require('express');
var router = express.Router();

router.get('/', function (req, res) {
  res.render('map', {title: 'Map (experimental)'});
});

module.exports = router;
