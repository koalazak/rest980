# rest980
[![Build Status](https://travis-ci.org/koalazak/rest980.svg?branch=master)](https://travis-ci.org/koalazak/rest980)

rest980 create a http server to map all [dorita980](https://github.com/koalazak/dorita980) methods in a REST API to control your iRobot Roomba 900 series 980 / i7 / i7+ via HTTP requests.

## Build
You can build the package for an specific architecture. Possible values are `armhf`, `arm64`, `amd64` and `i386`. 
```bash
$ dpkg-buildpackage -a armhf -us -uc -b
```

## Install
```bash
# dpkg -i rest980_2.1.0~ado1_armhf.deb
```

## Configuration
The configuration file is in `/etc/rest980.conf`.

|Property|Default|Description|
|:---|:---|:---|
|ROBOT_IP| |*(optional)* Set if you know your robot IP to skip discovery and speed up startup|
|BLID| |*(required)* The Roomba blid.|
|PASSWORD| |*(required)* The Roomba password|
|FIRMWARE_VERSION|2|*(optional)*Set to 1 or 2 depends of your robot firmware version. Use `2` for any firmware >=2 (yes, use 2 if you have firmware version 3). Default to 1 for firmware 1.6.6|
|ENABLE_LOCAL|yes|*(optional)* Set to 'no' if you want to disable local API. Default 'yes'.|
|ENABLE_CLOUD|no|*(optional)* Set to 'no' if you want to disable cloud API. Default 'yes'.|
|KEEP_ALIVE|yes|*(optional)* Set to 'no' if you want to connect and disconnect to the robot in each request (slow but leave the connection free for the official mobile app).|
|SSL_KEY_FILE| |*(optional)* Set path to key file to enable HTTPS. Both key and cert must be set. [(how to create self signed cert)](http://www.akadia.com/services/ssh_test_certificate.html)|
|SSL_CERT_FILE| |*(optional)* Set path to cert file to enable HTTPS. Both key and cert must be set. [(how to create self signed cert)](http://www.akadia.com/services/ssh_test_certificate.html)|
|PORT|3000|*(required)* The HTTP port to listen on|

*See [dorita980](https://github.com/koalazak/dorita980) for more information and instructions for obtaining your robot blid and password*

## Fimrware version

[Check your robot firmware version!](http://homesupport.irobot.com/app/answers/detail/a_id/529) and set your firmware version in `firmwareVersion` rest980 configuration!

## Service
To enable `rest980` on reboot:

    # systemctl enable rest980
    
To start and stop the service:

    # systemctl start rest980
    # systemctl stop rest980

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
- cleanRoom

Example: start to clean

```http
GET http://192.168.1.110:3000/api/local/action/start
```
Success Response:
```
{"ok":null,"id":23}
```

Example: clean a specific room

Some roomba types support "room specificic cleaning" - at the time of writing, at least the s9 and the i7 support this featrue. Assuming you have this model, and have a "Smart Map" for the floor you're trying to clean, you can send room specific cleaning commands. The easiest way to find out the values for this is to start a room specific clean via the app, and then look at the `state` endpoint (documented below) and find the `lastCommand` entry. Using this, you can find the room ids. These seem to be stable over time, unless a re-training or new smart map is saved.

The `pmap_id` and `user_pmapv_id` are also derived from the same `lastCommand` trick. These also seem to be stable - unless a new training run or edit to the smart map happens. It's important to get these correct, else your roomba won't clean.


```sh
curl -X POST http://192.168.1.110:3000/api/local/action/cleanRoom -H 'Content-Type: application/json' -d '{"ordered": 0, "pmap_id": "123456", "regions": [{"region_id":"5", "region_name":"Hallway","region_type":"hallway"}], "user_pmapv_id": "987654"}'
```

> Note that this is a `POST` becuase it has a body, unlike the other related `action` methods.


### Info

All info endpoints are under `/api/local/info/[record]` using GET method without query params:

Available records:

- mission
- wireless
- lastwireless
- sys
- sku
- state (only in firmware 2)

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

- ptime (only GET in firmware 1)
- bbrun (only GET)
- cloud (only GET)
- langs (only GET. Use `preferences` to set lang)
- week
- time (POST Y GET in firmware 1. Only GET in Firmware 2)
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

See [dorita980](https://github.com/koalazak/dorita980) documentation for responses and body params for each method and version firmware.

### Examples:

#### Get preferences in firmware 1:
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

See [dorita980](https://github.com/koalazak/dorita980) documentation for preferences in firmware 2.

#### Set preferences in firmware 1:
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

See [dorita980](https://github.com/koalazak/dorita980) documentation for preferences in firmware 2.

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

## Cloud (only for firmware 1.6.x)

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

