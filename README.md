# Winston Logger Plus

> Winston with tcp connection and better format.

```javascript
const WinstonPlus = require('winston-logger-plus');

let logger = new (WinstonPlus.logger)({
    filename: 'test.log'
}, __dirname);

logger.log('info', 'mark', 'hello world', {meta: 'test'}, Error('test'));
```

## Installation

```shell
$ npm install winston-logger-plus
```

## Usage

### Writer

```
const Writer = require('winston-logger-plus').writer;

let writer = new Writer(options);
```

#### constructor

##### options

The same with (winston)[https://www.npmjs.com/package/winston].

#### writer.write(level, mark, data, stackInfo);

- level `String` log level (silly|debug|verbose|info|warn|error)
- mark `String` a unique ID to mark your request
- data `Array` a list of meta data
- stackInfo 'String' record the log place

### Logger

```
const Logger = require('winston-logger-plus').logger;

let logger = new Logger(options, __dirname);

```

#### constructor

##### options

The same with (winston)[https://www.npmjs.com/package/winston].

##### basePath

The base path of the project.

#### logger.log(level, mark, ...data);

- level `String` log level (silly|debug|verbose|info|warn|error)
- mark `String` a unique ID to mark your request
- data `Array` a list of meta data

### Client

```
const Client = require('winston-logger-plus').client;

let client = new Client(ip, port, options);
```
#### constructor

##### ip

Remote server IP.

##### port

Remote server port.

##### options

- min `Number` minimum size of socket connection pool
- max `Number` maximum size of socket connection pool
- options `Object` the same with `net.createConnection`
- basePath `String` the base path of the project

#### client.log(options, level, mark, ...data)

- options `Object` The same with (winston)[https://www.npmjs.com/package/winston]
- level `String` log level (silly|debug|verbose|info|warn|error)
- mark `String` a unique ID to mark your request
- data `Array` a list of meta data

#### client.getPos()

Return the calling position.

### Server

```
require('winston-logger-plus').server(port);
```

#### port

Listening port of the server.