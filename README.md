# Winston Logger Plus

> [Winston](https://www.npmjs.com/package/winston) with TCP transport support and a cleaner, opinionated log format.

> Built on **Winston 3** and **winston-daily-rotate-file 5**.

`winston-logger-plus` is a thin, batteries-included wrapper around Winston that gives you:

- **Sane rotating-file defaults** — daily rotation, gzip archiving, and a 100 MB size cap out of the box.
- **Automatic caller location** — every log line records the `file:line` it was called from, relative to your project root.
- **First-class `Error` handling** — pass an `Error` directly and its full stack trace is logged for you.
- **Request marking** — tag related log lines with a `mark` (e.g. a request ID) so you can trace a single request end-to-end.
- **Centralized logging over TCP** — ship logs from many processes/machines to a single log server via a pooled socket client.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Concepts](#concepts)
- [API](#api)
  - [Writer](#writer)
  - [Logger](#logger)
  - [Client](#client)
  - [Server](#server)
- [Centralized Logging Example](#centralized-logging-example)
- [Log Levels](#log-levels)
- [Requirements](#requirements)
- [Notes](#notes)
- [License](#license)

## Installation

```shell
$ npm install winston-logger-plus
```

## Quick Start

```javascript
const WinstonPlus = require('winston-logger-plus');

// __dirname (basePath) is used to shorten the recorded caller path.
const logger = new WinstonPlus.logger({
    filename: 'test.log'
}, __dirname);

logger.log('info', 'req-1234', 'hello world', { user: 'alice' }, new Error('oops'));
```

This writes a rotating log file (`test.YYYYMMDD.log`) that includes the level, your `mark`, the metadata, and the exact `file:line` where `logger.log(...)` was called.

## Concepts

The package exposes four building blocks that stack on top of each other:

| Component | Purpose | Runs where |
| --- | --- | --- |
| **Writer** | Low-level wrapper over `winston` + `winston-daily-rotate-file`. Writes formatted lines to a rotating file. | Local process |
| **Logger** | Writer **+** automatic caller position **+** `Error` stack extraction. The most common entry point. | Local process |
| **Client** | Serializes log calls and ships them over TCP using a pooled socket connection. | Application process |
| **Server** | TCP endpoint that receives Client payloads and writes them to files (one Writer per filename). | Central log server |

Use **Logger** for local file logging. Use **Client + Server** when you want to centralize logs from multiple processes or hosts into one place.

## API

All components are available on the package's default export:

```javascript
const WinstonPlus = require('winston-logger-plus');

WinstonPlus.writer; // class Writer
WinstonPlus.logger; // class Logger
WinstonPlus.client; // class Client
WinstonPlus.server; // function (port)
```

### Writer

The lowest-level primitive. Wraps a Winston logger configured with `winston-daily-rotate-file`.

```javascript
const Writer = require('winston-logger-plus').writer;

const writer = new Writer(options);
writer.write(level, mark, data, stackInfo);
```

#### `new Writer(options)`

The following defaults are applied when not provided:

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `filename` | `String` | *(required)* | Path/name of the log file. May contain the `%DATE%` placeholder; otherwise the date pattern is appended. |
| `datePattern` | `String` | `'YYYYMMDD'` | Rotation date pattern (Moment format). |
| `level` | `String` | `'info'` | Minimum level to write. |
| `maxSize` | `String\|Number` | `'100m'` (100 MB) | Max size before rotating (e.g. `'20m'`, `'1g'`). The legacy `maxsize` in bytes is accepted as a fallback. |
| `maxFiles` | `Number` | *(unset)* | Max number of rotated files to keep. |
| `zippedArchive` | `Boolean` | `true` | Gzip rotated files. |
| `json` | `Boolean` | `false` | Emit JSON instead of plain text. |
| `colorize` | `Boolean` | `false` | Colorize plain-text output. |
| `timestamp` | `Boolean\|String\|Function` | `true` | Include a timestamp. Pass a Moment format string/function to customize, or `false` to disable. |
| `format` | `Object` | *(unset)* | A ready-made `winston.format` that fully overrides the default formatting. |

> **Migrating from 1.x (Winston 2):** the transport no longer accepts a `prepend` flag (removed upstream), `maxsize` was renamed to `maxSize` (units instead of bytes), and `json` / `colorize` / `timestamp` are now composed via `winston.format` under the hood rather than being raw transport flags. Passing `maxsize` still works as a fallback.

The default plain-text line looks like:

```text
2026-07-14T12:22:46.976Z info req-local [ 'hello local', { user: 'alice' } ] app.js:17
```

#### `writer.write(level, mark, data, stackInfo)`

- `level` `String` — log level (`silly` | `debug` | `verbose` | `info` | `warn` | `error`).
- `mark` `String` — a unique ID to mark/trace your request.
- `data` `Array` — a list of metadata values to log.
- `stackInfo` `String` — a string describing where the log originated (e.g. `file.js:42`).

### Logger

The recommended entry point for local logging. Wraps a `Writer` and automatically:

1. Computes the caller's `file:line` (relative to `basePath`) via [`stack-trace`](https://www.npmjs.com/package/stack-trace).
2. Replaces any `Error` argument with its full `.stack` string.

```javascript
const Logger = require('winston-logger-plus').logger;

const logger = new Logger(options, __dirname);
```

#### `new Logger(options, basePath)`

- `options` `Object` — the same options as [`Writer`](#writer).
- `basePath` `String` — the base path of your project. Recorded caller paths are made relative to this, so you get `src/services/user.js:88` instead of an absolute path.

#### `logger.log(level, mark, ...data)`

- `level` `String` — log level (`silly` | `debug` | `verbose` | `info` | `warn` | `error`).
- `mark` `String` — a unique ID to mark/trace your request.
- `...data` — any number of metadata values. `Error` instances are automatically expanded to their stack trace.

```javascript
logger.log('error', 'req-1234', 'failed to load user', { id: 42 }, new Error('not found'));
```

#### `logger.getPos()`

Returns the calling position as a `String` (`file:line`), relative to `basePath` when set. Used internally by `log()` but exposed for convenience.

### Client

Sends log entries to a remote [Server](#server) over TCP. Socket connections are managed by a [`generic-pool`](https://www.npmjs.com/package/generic-pool) pool, so connections are reused rather than reopened on every call.

```javascript
const Client = require('winston-logger-plus').client;

const client = new Client(ip, port, options);
```

#### `new Client(ip, port, options)`

- `ip` `String` — remote server IP.
- `port` `Number` — remote server port.
- `options` `Object`:
  - `min` `Number` — minimum size of the socket connection pool. Default `1`.
  - `max` `Number` — maximum size of the socket connection pool. Default `10`.
  - `options` `Object` — passed to `net.Socket`. Defaults to `{ type: 'ipv4', allowHalfOpen: true }`.
  - `basePath` `String` — the base path of your project, used to shorten recorded caller paths.

#### `client.log(options, level, mark, ...data)`

Acquires a socket from the pool, serializes the entry to JSON, and writes it to the server.

- `options` `Object` — the [`Writer`](#writer) options the **server** should use to write this entry (e.g. `{ filename: 'app.log' }`). The server keys its Writers by `filename`.
- `level` `String` — log level (`silly` | `debug` | `verbose` | `info` | `warn` | `error`).
- `mark` `String` — a unique ID to mark/trace your request.
- `...data` — metadata values. `Error` instances are expanded to their stack trace.

```javascript
client.log({ filename: 'app.log' }, 'info', 'req-1234', 'user logged in', { id: 42 });
```

#### `client.getPos()`

Returns the calling position (`file:line`), relative to `basePath` when set.

### Server

Starts a TCP server that receives entries from [Client](#client) instances and writes them to rotating files. A separate `Writer` is created and cached per `options.filename`, so multiple clients can log to multiple files through a single server.

```javascript
require('winston-logger-plus').server(port);
```

- `port` `Number` — the port the server listens on.

## Centralized Logging Example

**Log server** (`server.js`):

```javascript
const WinstonPlus = require('winston-logger-plus');

WinstonPlus.server(9000);
console.log('Log server listening on :9000');
```

**Application** (`app.js`):

```javascript
const WinstonPlus = require('winston-logger-plus');

const client = new WinstonPlus.client('127.0.0.1', 9000, {
    min: 1,
    max: 10,
    basePath: __dirname
});

client.log({ filename: 'app.log' }, 'info', 'req-1234', 'hello from a remote process', {
    service: 'auth'
});
```

The server receives the JSON payload and writes it into `app.YYYYMMDD.log` using the same rotating-file defaults as a local `Writer`.

## Log Levels

The supported levels follow Winston's npm levels, in order of increasing severity:

```
silly < debug < verbose < info < warn < error
```

A Writer/Logger only records entries at or above its configured `level` (default `info`).

## Requirements

- Node.js `>= 12.0.0`
- `winston` 3.x (installed automatically)

## Notes

- **Wire protocol:** `Client` and `Server` exchange newline-delimited JSON. Both sides must run the same major version — a 1.x client is not compatible with a 2.x server, and vice versa.
- **Failure handling:** `Client.log()` never throws; send failures are logged to `console.error` and the returned promise resolves regardless, so a logging problem won't crash your app or surface as an unhandled rejection.

## License

[MIT](./LICENSE) © iCH1990
