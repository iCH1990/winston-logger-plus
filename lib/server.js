const net = require('net');

const Writer = require('./writer');

// Must match the delimiter used by the client.
const DELIMITER = '\n';

/**
 * Start a TCP log server. Each incoming entry (newline-delimited JSON produced
 * by the client) is written to a rotating file. One {@link Writer} is created
 * and cached per `filename`, so many clients can share a single server.
 *
 * @param {Number} port Port to listen on.
 * @returns {net.Server} The underlying server (handy for tests and shutdown).
 */
module.exports = function (port) {
    if (!port) {
        throw new Error('server: `port` is required');
    }

    // Cache of Writers keyed by target filename.
    const writers = {};

    const getWriter = (options) => {
        if (!options || !options.filename) {
            throw new Error('received entry is missing `options.filename`');
        }

        if (!writers[options.filename]) {
            writers[options.filename] = new Writer(options);
        }

        return writers[options.filename];
    };

    const handleEntry = (line) => {
        if (!line) {
            return;
        }

        try {
            const params = JSON.parse(line);

            getWriter(params.options).write(params.level, params.mark, params.data, params.stackInfo);
        } catch (err) {
            console.error('winston-logger-plus: failed to handle log entry', err);
        }
    };

    const server = net.createServer((socket) => {
        // TCP is a stream: a chunk may hold zero, one, or many entries, and the
        // final entry may be split across chunks. Buffer until we see a
        // delimiter before parsing.
        let buffer = '';

        socket.on('data', (chunk) => {
            buffer += chunk.toString();

            let index = buffer.indexOf(DELIMITER);
            while (index !== -1) {
                handleEntry(buffer.slice(0, index));
                buffer = buffer.slice(index + 1);
                index = buffer.indexOf(DELIMITER);
            }
        });

        socket.on('end', () => {
            // Flush a trailing entry that was not newline-terminated.
            handleEntry(buffer.trim());
            buffer = '';
        });

        socket.on('error', (err) => {
            console.error('winston-logger-plus: client socket error', err);
        });
    });

    server.on('error', (err) => {
        throw err;
    });

    server.listen(port, () => {
        console.log(`winston-logger-plus: log server listening on ${port}`);
    });

    return server;
};
