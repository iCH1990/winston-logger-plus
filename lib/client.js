const genericPool = require('generic-pool');
const net = require('net');
const path = require('path');
const stackTrace = require('stack-trace');

class Client {
    constructor(ip, port, options = {}) {
        const factory = {
            create: function () {
                return new Promise(function (resolve) {
                    let socket = new net.Socket(options.options || {
                        'type': 'ipv4',
                        'allowHalfOpen': true
                    });

                    socket.connect(port, ip);

                    return resolve(socket);
                })
            },
            destroy: function (socket) {
                return new Promise(function (resolve) {
                    socket.end();

                    return resolve();
                })
            }
        };

        const opts = {
            max: options.max || 10, // maximum size of the pool
            min: options.min || 1 // minimum size of the pool
        };

        this.pool = genericPool.createPool(factory, opts);
        this.basePath = options.basePath;
    }

    log(options, level, mark, ...data) {
        let stackInfo = this.getPos();

        data = data.map((item) => {
            if (item instanceof Error) {
                return item.stack;
            }

            return item;
        });

        this.pool
            .acquire()
            .then((client) => {
                let info = {
                    options,
                    level,
                    mark,
                    data,
                    stackInfo
                };

                client.write(JSON.stringify(info));

                this.pool.release(client);
            })
            .catch((err) => {
                console.error('write socket error', err);

                throw err;
            });
    }

    getPos() {
        let traces = stackTrace.get();
        let trace = null;

        if (traces.length > 2) {
            trace = traces[2];
        }

        if (!trace) {
            return null;
        }

        let fileName = trace.getFileName();
        let lineNumber = trace.getLineNumber();

        if (this.basePath) {
            fileName = path.relative(this.basePath, fileName);
        }

        return `${fileName}:${lineNumber}`;
    }
}

module.exports = Client;