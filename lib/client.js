const genericPool = require('generic-pool');
const net = require('net');

const { getCallerPosition, normalizeError } = require('./util');

// Entries are newline-delimited on the wire. `JSON.stringify` escapes literal
// newlines inside strings, so a raw '\n' reliably marks a message boundary.
const DELIMITER = '\n';

/**
 * Ships log entries to a remote {@link module:server|Server} over TCP. Socket
 * connections are managed by a `generic-pool` pool so they are reused instead
 * of being reopened on every call.
 */
class Client {
    /**
     * @param {String} ip Remote server IP.
     * @param {Number} port Remote server port.
     * @param {Object} [options]
     * @param {Number} [options.min=1] Minimum pool size.
     * @param {Number} [options.max=10] Maximum pool size.
     * @param {Object} [options.options] Options passed to `net.Socket`.
     * @param {String} [options.basePath] Project root for shortening caller paths.
     */
    constructor(ip, port, options = {}) {
        if (!ip || !port) {
            throw new Error('Client: `ip` and `port` are required');
        }

        const socketOptions = options.options || {
            type: 'ipv4',
            allowHalfOpen: true
        };

        const factory = {
            create() {
                return new Promise((resolve, reject) => {
                    const socket = new net.Socket(socketOptions);

                    // Reject if the connection fails before it is established.
                    const onConnectError = (err) => reject(err);
                    socket.once('error', onConnectError);

                    socket.connect(port, ip, () => {
                        socket.removeListener('error', onConnectError);

                        // Keep a handler attached afterwards so a runtime socket
                        // error never crashes the host process as an
                        // "unhandled 'error' event".
                        socket.on('error', (err) => {
                            console.error('winston-logger-plus: socket error', err);
                        });

                        resolve(socket);
                    });
                });
            },
            destroy(socket) {
                return new Promise((resolve) => {
                    socket.end();
                    resolve();
                });
            },
            // Never hand out a dead socket.
            validate(socket) {
                return Promise.resolve(Boolean(socket) && !socket.destroyed && socket.writable);
            }
        };

        const opts = {
            max: options.max || 10,
            min: options.min || 1,
            testOnBorrow: true
        };

        this.pool = genericPool.createPool(factory, opts);
        this.basePath = options.basePath;
    }

    /**
     * Send a single entry to the remote server.
     *
     * @param {Object} options Writer options the server should use to persist
     *   this entry (keyed by `options.filename`).
     * @param {String} level Log level (silly|debug|verbose|info|warn|error).
     * @param {String} mark A unique ID used to correlate related log lines.
     * @param {...*} data Metadata values. `Error` instances are replaced by
     *   their stack trace.
     * @returns {Promise<void>} Resolves once the entry has been written to the
     *   socket. Failures are logged and swallowed so a logging error never
     *   surfaces as an unhandled rejection.
     */
    log(options, level, mark, ...data) {
        const stackInfo = this.getPos();
        const payload = data.map(normalizeError);

        const message = JSON.stringify({
            options,
            level,
            mark,
            data: payload,
            stackInfo
        }) + DELIMITER;

        return this.pool
            .acquire()
            .then((socket) => {
                try {
                    socket.write(message);
                } finally {
                    // Always return the socket to the pool, even if the write throws.
                    this.pool.release(socket);
                }
            })
            .catch((err) => {
                console.error('winston-logger-plus: failed to send log over TCP', err);
            });
    }

    /**
     * @returns {String|null} The caller position (`file:line`), relative to
     *   `basePath` when set.
     */
    getPos() {
        return getCallerPosition(this.basePath);
    }
}

module.exports = Client;
