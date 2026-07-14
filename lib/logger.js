const Writer = require('./writer');
const { getCallerPosition, normalizeError } = require('./util');

/**
 * High-level local logger. Wraps a {@link Writer} and, on every call,
 * automatically records the caller's `file:line` and expands `Error`
 * arguments to their full stack trace.
 */
class Logger {
    /**
     * @param {Object} options Options forwarded to {@link Writer}.
     * @param {String} [basePath] Project root; recorded caller paths are made
     *   relative to it for shorter output.
     */
    constructor(options, basePath) {
        this.writer = new Writer(options);
        this.basePath = basePath;
    }

    /**
     * @param {String} level Log level (silly|debug|verbose|info|warn|error).
     * @param {String} mark A unique ID used to correlate related log lines.
     * @param {...*} data Metadata values. `Error` instances are replaced by
     *   their stack trace.
     */
    log(level, mark, ...data) {
        const stackInfo = this.getPos();
        const payload = data.map(normalizeError);

        this.writer.write(level, mark, payload, stackInfo);
    }

    /**
     * @returns {String|null} The caller position (`file:line`), relative to
     *   `basePath` when set.
     */
    getPos() {
        return getCallerPosition(this.basePath);
    }
}

module.exports = Logger;
