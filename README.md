# rest980
[![Build Status](https://travis-ci.org/koalazak/rest980.svg?branch=master)](https://travis-ci.org/koalazak/rest980)
[![dependencies Status](https://david-dm.org/koalazak/rest980/status.svg)](https://david-dm.org/koalazak/rest980)

rest980 create a http server to map all [dorita980](https://github.com/koalazak/dorita980) methods in a REST API to control your iRobot Roomba 980 via HTTP requests.

## Install
```bash
$ git clone https://github.com/koalazak/rest980.git
$ cd rest980
$ npm install
```

## Configuration
The service can be configured by editing `config/default.json` or by setting environment variables.

|Config File (`config/default.json`)|Environment|Description|
|:---|:---|:---|
|port|PORT|*(default:3000)* The HTTP port to listen on.|
|blid|BLID|*(required)* The Roomba blid. *|
|password|PASSWORD|*(required)* The Roomba password. *|
|robotIP|ROBOT_IP|*(optional)* Set if you know your robot IP to skip discovery and speed up startup.|
|basicAuthUser|BASIC_AUTH_USER|*(optional)* Set to enable basic auth. Both user and pass must be set.|
|basicAuthPass|BASIC_AUTH_PASS|*(optional)* Set to enable basic auth. Both user and pass must be set.|
|sslKeyFile|SSL_KEY_FILE|*(optional)* Set path to key file to enable HTTPS. Both key and cert must be set. [(how to create self signed cert)](http://www.akadia.com/services/ssh_test_certificate.html)
|
|sslCertFile|SSL_CERT_FILE|*(optional)* Set path to cert file to enable HTTPS. Both key and cert must be set. [(how to create self signed cert)](http://www.akadia.com/services/ssh_test_certificate.html)
|

\* *See [dorita980](https://github.com/koalazak/dorita980) for more information and instructions for obtaining your robot blid and password*



## Start API Server
```
$ cd rest980
$ DEBUG=rest980:* npm start
rest980:server Listening on port 3000
```

omit `DEBUG=rest980:*` if you want. You can just run with `npm start`

## Or use Docker Image

You can use [koalazak/rest980](https://hub.docker.com/r/koalazak/rest980/) docker image to run this server in a docker container. Usefull to run on [Synology](https://www.synology.com/en-global/) for example.

Pull Docker image:
```bash
docker pull koalazak/rest980
```

Run Docker image:
```
docker run -e BLID=myuser -e PASSWORD=mypass -e ROBOT_IP=myrobotIP koalazak/rest980
```

## Dockerfile

Also you can local build and test in Docker from this [Dockerfile](https://github.com/koalazak/rest980/blob/master/Dockerfile)

```
docker build . -t koalazak/rest980 
```

## API documentation

Now you can make request to this server on port 3000.
There are 2 main endpoints: `local` and `cloud`, mapped to [dorita980](https://github.com/koalazak/dorita980) local and cloud methods as well.

## Error responses:
HTTP status 500 and response:
```
{"message":"human message","error":{}}
```

## Local

### Actions

All cleaning actions are under `/api/local/action/[action]` endpoint using GET method  without query params:

Available actions:

- start
- stop
- pause
- dock
- resume

Example: start to clean

```http
GET http://192.168.1.110:3000/api/local/action/start
```
Success Response:
```
{"ok":null,"id":23}
```

### Info

All info endpoints are under `/api/local/info/[record]` using GET method without query params:

Available records:

- mission
- wireless
- lastwireless
- sys
- sku

Example: get current mission variables
```http
GET http://192.168.1.110:3000/api/local/info/mission
```
Success Response:
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

### Configurations

All configuration endpoints are under `/api/local/config/[configName]` using `GET` method to get current configuration and `POST` method to set a new configuration.

Available configName:

- ptime (only GET)
- bbrun (only GET)
- cloud (only GET)
- langs (only GET. Use `preferences` to set lang)
- week
- time
- preferences
- carpetBoost/auto (only POST. Use `preferences` to get current config)
- carpetBoost/performance (only POST. Use `preferences` to get current config)
- carpetBoost/eco (only POST. Use `preferences` to get current config)
- edgeClean/on (only POST. Use `preferences` to get current config)
- edgeClean/off (only POST. Use `preferences` to get current config)
- cleaningPasses/auto (only POST. Use `preferences` to get current config)
- cleaningPasses/one (only POST. Use `preferences` to get current config)
- cleaningPasses/two (only POST. Use `preferences` to get current config)
- alwaysFinish/on (only POST. Use `preferences` to get current config)
- alwaysFinish/off (only POST. Use `preferences` to get current config)

See [dorita980](https://github.com/koalazak/dorita980) documentation for responses and body params for each method.

### Examples:

#### Get preferences:
```http
GET http://192.168.1.110:3000/api/local/config/preferences
```
Success Response:
```javascript
{ ok:
   { flags: 1024, // See Cleaning Preferences table in dorita980 documentation.
     lang: 2,
     timezone: 'America/Buenos_Aires',
     name: 'myRobotName',
     cleaningPreferences: {
        carpetBoost: 'auto', // 'auto', 'performance', 'eco'
        edgeClean: true,
        cleaningPasses: '1', // '1', '2', 'auto'
        alwaysFinish: true 
      }
    },
 id: 2 }
```

#### Set preferences:
```http
POST http://192.168.1.110:3000/api/local/config/preferences
```
Body:
```
{ 
  "flags": 1107, // See Cleaning Preferences table in dorita980 documentation.
  "lang": 2,
  "timezone": "America/Buenos_Aires",
  "name": "myRobotName"
}
```

Success Response:
```
{"ok":null,"id":293}
```

#### Set cleaning passes to two:
```http
POST http://192.168.1.110:3000/api/local/config/cleaningPasses/two
```
Body:
```
{}
```

Success Response:
```
{"ok":null,"id":293}
```

## Cloud

Use `GET` in all `info` endpoints without query params:

- /api/cloud/info/status
- /api/cloud/info/history
- /api/cloud/info/missionHistory

Use `GET ` in all `action` endpoints without query params:

- /api/cloud/action/clean
- /api/cloud/action/quick
- /api/cloud/action/spot
- /api/cloud/action/dock
- /api/cloud/action/start
- /api/cloud/action/stop
- /api/cloud/action/pause
- /api/cloud/action/resume
- /api/cloud/action/wake
- /api/cloud/action/reset
- /api/cloud/action/find
- /api/cloud/action/wipe
- /api/cloud/action/sleep
- /api/cloud/action/off
- /api/cloud/action/fbeep

Example:

```http
GET http://192.168.1.110:3000/api/cloud/action/clean
```
Success Response:
```
{"status":"OK","method":"multipleFieldSet"}
```
## Host images or files

You can add images or files to `public/` folder to serve static files.

## Realtime Map (experimental)

Visiting  `http://serverIP:3000/map` with your browser you can play with this cool experiment

![/map](https://cloud.githubusercontent.com/assets/8185092/20685415/23e2ed58-b593-11e6-8492-280cc381abda.png)

[![iRobot Roomba 980 cleaning map using dorita980 lib](https://img.youtube.com/vi/XILvHFEX7TM/0.jpg)](https://www.youtube.com/watch?v=XILvHFEX7TM)

Video: Realtime cleaning map

