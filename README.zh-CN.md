# Winston Logger Plus

[English](./README.md) | **简体中文**

> 为 [Winston](https://www.npmjs.com/package/winston) 增加 TCP 传输能力，并提供更清爽、更有主见的日志格式。

> 基于 **Winston 3** 与 **winston-daily-rotate-file 5** 构建。

`winston-logger-plus` 是对 Winston 的一层开箱即用的轻量封装，提供：

- **合理的滚动文件默认值** —— 默认按天滚动、gzip 归档、单文件上限 100 MB。
- **自动记录调用位置** —— 每条日志都会记录调用它的 `文件:行号`（相对于项目根目录）。
- **原生 `Error` 处理** —— 直接传入 `Error`，会自动记录其完整堆栈。
- **请求标记（mark）** —— 用一个 `mark`（如请求 ID）标记相关日志，方便端到端追踪单个请求。
- **基于 TCP 的集中式日志** —— 通过带连接池的 socket 客户端，把多个进程/机器的日志汇聚到同一台日志服务器。

## 目录

- [安装](#安装)
- [快速开始](#快速开始)
- [核心概念](#核心概念)
- [API](#api)
  - [Writer](#writer)
  - [Logger](#logger)
  - [Client](#client)
  - [Server](#server)
- [集中式日志示例](#集中式日志示例)
- [日志级别](#日志级别)
- [运行要求](#运行要求)
- [注意事项](#注意事项)
- [许可证](#许可证)

## 安装

```shell
$ npm install winston-logger-plus
```

## 快速开始

```javascript
const WinstonPlus = require('winston-logger-plus');

// __dirname（basePath）用于把记录的调用路径缩短为相对路径。
const logger = new WinstonPlus.logger({
    filename: 'test.log'
}, __dirname);

logger.log('info', 'req-1234', 'hello world', { user: 'alice' }, new Error('oops'));
```

上面的代码会写入一个按天滚动的日志文件（`test.YYYYMMDD.log`），内容包含级别、你的 `mark`、元数据，以及调用 `logger.log(...)` 的确切 `文件:行号`。

## 核心概念

本包提供四个可层层叠加的构建块：

| 组件 | 作用 | 运行位置 |
| --- | --- | --- |
| **Writer** | 对 `winston` + `winston-daily-rotate-file` 的底层封装，把格式化后的日志写入滚动文件。 | 本地进程 |
| **Logger** | 在 Writer 基础上 **+ 自动调用位置 + `Error` 堆栈提取**，是最常用的入口。 | 本地进程 |
| **Client** | 序列化日志调用，通过带连接池的 socket 经 TCP 发送出去。 | 应用进程 |
| **Server** | TCP 端点，接收 Client 的数据并写入文件（每个 filename 一个 Writer）。 | 中心日志服务器 |

本地文件日志用 **Logger**；需要把多个进程或主机的日志集中到一处时，用 **Client + Server**。

## API

所有组件都挂在本包的默认导出上：

```javascript
const WinstonPlus = require('winston-logger-plus');

WinstonPlus.writer; // class Writer
WinstonPlus.logger; // class Logger
WinstonPlus.client; // class Client
WinstonPlus.server; // function (port)
```

### Writer

最底层的原语。封装了一个配置了 `winston-daily-rotate-file` 的 Winston logger。

```javascript
const Writer = require('winston-logger-plus').writer;

const writer = new Writer(options);
writer.write(level, mark, data, stackInfo);
```

#### `new Writer(options)`

未显式提供时，采用以下默认值：

| 选项 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `filename` | `String` | *（必填）* | 日志文件路径/名称。可包含 `%DATE%` 占位符；否则日期模式会被追加到文件名。 |
| `datePattern` | `String` | `'YYYYMMDD'` | 滚动日期模式（Moment 格式）。 |
| `level` | `String` | `'info'` | 写入的最低级别。 |
| `maxSize` | `String\|Number` | `'100m'`（100 MB） | 触发滚动的大小（如 `'20m'`、`'1g'`）。旧版以字节为单位的 `maxsize` 仍作为回退支持。 |
| `maxFiles` | `Number` | *（未设置）* | 保留的滚动文件最大数量。 |
| `zippedArchive` | `Boolean` | `true` | 对滚动后的文件进行 gzip 压缩。 |
| `json` | `Boolean` | `false` | 输出 JSON 而非纯文本。 |
| `colorize` | `Boolean` | `false` | 为纯文本输出着色。 |
| `timestamp` | `Boolean\|String\|Function` | `true` | 是否包含时间戳。可传 Moment 格式字符串/函数以自定义，或传 `false` 关闭。 |
| `format` | `Object` | *（未设置）* | 一个现成的 `winston.format`，完全覆盖默认格式。 |

> **从 1.x（Winston 2）迁移：** 传输层不再接受 `prepend`（上游已移除）；`maxsize` 更名为 `maxSize`（改用带单位的字符串而非字节）；`json` / `colorize` / `timestamp` 现在底层通过 `winston.format` 组合实现，而非原始的传输层开关。传入 `maxsize` 仍可作为回退。

默认的纯文本日志行形如：

```text
2026-07-14T12:22:46.976Z info req-local [ 'hello local', { user: 'alice' } ] app.js:17
```

#### `writer.write(level, mark, data, stackInfo)`

- `level` `String` —— 日志级别（`silly` | `debug` | `verbose` | `info` | `warn` | `error`）。
- `mark` `String` —— 用于标记/追踪请求的唯一 ID。
- `data` `Array` —— 要记录的元数据列表。
- `stackInfo` `String` —— 描述日志来源位置的字符串（如 `file.js:42`）。

### Logger

本地日志的推荐入口。封装一个 `Writer`，并自动：

1. 通过 [`stack-trace`](https://www.npmjs.com/package/stack-trace) 计算调用者的 `文件:行号`（相对于 `basePath`）。
2. 把任意 `Error` 参数替换为其完整的 `.stack` 字符串。

```javascript
const Logger = require('winston-logger-plus').logger;

const logger = new Logger(options, __dirname);
```

#### `new Logger(options, basePath)`

- `options` `Object` —— 与 [`Writer`](#writer) 相同的选项。
- `basePath` `String` —— 项目根目录。记录的调用路径会相对于它，因此你会得到 `src/services/user.js:88` 而非绝对路径。

#### `logger.log(level, mark, ...data)`

- `level` `String` —— 日志级别（`silly` | `debug` | `verbose` | `info` | `warn` | `error`）。
- `mark` `String` —— 用于标记/追踪请求的唯一 ID。
- `...data` —— 任意数量的元数据值。`Error` 实例会被自动展开为其堆栈。

```javascript
logger.log('error', 'req-1234', 'failed to load user', { id: 42 }, new Error('not found'));
```

#### `logger.getPos()`

返回调用位置字符串（`文件:行号`），在设置了 `basePath` 时为相对路径。`log()` 内部会用到它，同时也对外暴露以便使用。

### Client

通过 TCP 把日志条目发送到远程 [Server](#server)。socket 连接由 [`generic-pool`](https://www.npmjs.com/package/generic-pool) 连接池管理，因此连接会被复用而非每次调用都重新建立。

```javascript
const Client = require('winston-logger-plus').client;

const client = new Client(ip, port, options);
```

#### `new Client(ip, port, options)`

- `ip` `String` —— 远程服务器 IP。
- `port` `Number` —— 远程服务器端口。
- `options` `Object`：
  - `min` `Number` —— socket 连接池的最小大小。默认 `1`。
  - `max` `Number` —— socket 连接池的最大大小。默认 `10`。
  - `options` `Object` —— 传给 `net.Socket`。默认 `{ type: 'ipv4', allowHalfOpen: true }`。
  - `basePath` `String` —— 项目根目录，用于缩短记录的调用路径。

#### `client.log(options, level, mark, ...data)`

从连接池取出一个 socket，把条目序列化为 JSON，然后写给服务器。

- `options` `Object` —— **服务器**用来写入该条目的 [`Writer`](#writer) 选项（如 `{ filename: 'app.log' }`）。服务器以 `filename` 为键来区分各个 Writer。
- `level` `String` —— 日志级别（`silly` | `debug` | `verbose` | `info` | `warn` | `error`）。
- `mark` `String` —— 用于标记/追踪请求的唯一 ID。
- `...data` —— 元数据值。`Error` 实例会被展开为其堆栈。

```javascript
client.log({ filename: 'app.log' }, 'info', 'req-1234', 'user logged in', { id: 42 });
```

#### `client.getPos()`

返回调用位置（`文件:行号`），在设置了 `basePath` 时为相对路径。

### Server

启动一个 TCP 服务器，接收来自 [Client](#client) 的条目并写入滚动文件。会按 `options.filename` 分别创建并缓存 `Writer`，因此多个客户端可以通过同一个服务器写入多个文件。

```javascript
require('winston-logger-plus').server(port);
```

- `port` `Number` —— 服务器监听的端口。

## 集中式日志示例

**日志服务器**（`server.js`）：

```javascript
const WinstonPlus = require('winston-logger-plus');

WinstonPlus.server(9000);
console.log('Log server listening on :9000');
```

**应用程序**（`app.js`）：

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

服务器收到 JSON 数据后，会用与本地 `Writer` 相同的滚动文件默认值写入 `app.YYYYMMDD.log`。

## 日志级别

支持的级别遵循 Winston 的 npm 级别，严重程度递增：

```
silly < debug < verbose < info < warn < error
```

Writer/Logger 只会记录不低于其配置 `level`（默认 `info`）的条目。

## 运行要求

- Node.js `>= 12.0.0`
- `winston` 3.x（会自动安装）

## 注意事项

- **线协议：** `Client` 与 `Server` 之间以换行符分隔的 JSON 通信。两端必须运行相同的主版本 —— 1.x 的客户端与 2.x 的服务器互不兼容，反之亦然。
- **失败处理：** `Client.log()` 不会抛出异常；发送失败会记录到 `console.error`，返回的 Promise 无论如何都会 resolve，因此日志问题不会拖垮你的应用，也不会变成未处理的 Promise rejection。

## 许可证

[MIT](./LICENSE) © iCH1990
