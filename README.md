#rest980
[dorita980](https://github.com/koalazak/dorita980) REST interface to control your iRobot Roomba 980 via local server on your lan.

See [dorita980](https://github.com/koalazak/dorita980) for more information and instructions to get your blid and password.

## Install
```bash
$ git clone https://github.com/koalazak/rest980.git
$ cd rest980
$ npm install
```

## Config

Edit `config.default.json` file to put your blid and password.

And if you know your robot IP address complete `robotIP` field (optional) just to speed up the startup.
```
{
  "port": 3000,
  "blid": "yourRobotBlid",
  "password": "yourRobotPassword",
  "robotIP": ""
}
```

## Run
```
$ cd rest980
$ DEBUG=rest980:* npm start
rest980:server Listening on port 3000
```

omit `DEBUG=rest980:*` if you want. You can just run with `npm start`

## API

Now you can make request to this server.

### Actions

#### start
```http
GET http://[ip]/local/action/start
```
Response:
```
{"ok":null,"id":23}
```

#### stop
```http
GET http://[ip]/local/action/stop
```
Response:
```
{"ok":null,"id":23}
```

### Info

#### mission
```http
GET http://[ip]/local/info/mission
```
Response:
```
{ "ok":
   { "flags": 0,
     "cycle": "none",
     "phase": "charge",
     "pos": { "theta": 179, "point": {"x": 102, "y": -13} },
     "batPct": 99,
     "expireM": 0,
     "rechrgM": 0,
     "error": 0,
     "notReady": 0,
     "mssnM": 0,
     "sqft": 0 },
  "id": 2 }
```

### Config

#### week
Get week configuration
```http
GET http://[ip]/local/config/week
```
Response:
```
{ "ok":
   { "cycle": [ "start", "none", "start", "start", "start", "start", "start" ],
     "h": [ 10, 10, 10, 10, 10, 10, 10 ],
     "m": [ 30, 30, 30, 30, 30, 30, 30 ] },
  "id": 2 }
```

Set week configuration
```http
POST http://[ip]/local/config/week
{"cycle":["none","start","start","start","start","start","start"],"h":[10,10,10,10,10,10,10],"m":[30,30,30,30,30,30,30]}
```
Response:
```
{"ok":null,"id":23}
```

Full Documentation pending...