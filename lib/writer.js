const util = require('util');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const { format } = winston;

// Default size before a file is rotated (100 MB, expressed in the units that
// winston-daily-rotate-file v5 expects).
const DEFAULT_MAX_SIZE = '100m';

/**
 * Build the winston format for a Writer.
 *
 * winston 3 no longer exposes `json` / `colorize` / `timestamp` as transport
 * flags; formatting is composed from `winston.format.*` instead. This mirrors
 * the old boolean options on top of the new API, and lets callers pass a
 * ready-made `format` to take full control.
 *
 * @param {Object} options
 * @returns {Object} A composed winston format.
 */
function buildFormat(options) {
    if (options.format) {
        return options.format;
    }

    const parts = [];

    // Timestamp is on by default; `timestamp: false` disables it, a string or
    // function is forwarded as the timestamp format.
    if (options.timestamp !== false) {
        const timestampFormat =
            typeof options.timestamp === 'string' || typeof options.timestamp === 'function'
                ? { format: options.timestamp }
                : undefined;

        parts.push(format.timestamp(timestampFormat));
    }

    if (options.json) {
        parts.push(format.json());

        return format.combine(...parts);
    }

    if (options.colorize) {
        parts.push(format.colorize());
    }

    // Render: "<timestamp> <level> <mark> <data> <stackInfo>".
    parts.push(format.printf((info) => {
        const segments = [];

        if (info.timestamp) {
            segments.push(info.timestamp);
        }

        segments.push(info.level);
        segments.push(info.message);

        if (Array.isArray(info.data) && info.data.length) {
            segments.push(util.inspect(info.data, { depth: null, breakLength: Infinity }));
        }

        if (info.stackInfo) {
            segments.push(info.stackInfo);
        }

        return segments.join(' ');
    }));

    return format.combine(...parts);
}

/**
 * Pick `value` when it was explicitly provided, otherwise fall back to
 * `fallback`. Unlike `value || fallback`, this preserves valid falsy values
 * such as `false`.
 */
function withDefault(value, fallback) {
    return value !== undefined ? value : fallback;
}

/**
 * Thin wrapper around a winston 3 logger backed by a daily-rotating file
 * transport. Applies opinionated defaults (date rotation, gzip archiving and a
 * 100 MB size cap) while still allowing every option to be overridden.
 */
class Writer {
    /**
     * @param {Object} options
     * @param {String} options.filename Path/name of the log file (required).
     *   May contain the `%DATE%` placeholder; otherwise the date pattern is
     *   appended.
     * @param {String} [options.datePattern='YYYYMMDD'] Moment date pattern.
     * @param {String} [options.level='info'] Minimum level to write.
     * @param {String|Number} [options.maxSize='100m'] Size before rotating.
     *   The legacy `maxsize` (bytes) is accepted as a fallback.
     * @param {Number} [options.maxFiles] Max number of rotated files to keep.
     * @param {Boolean} [options.zippedArchive=true] Gzip rotated files.
     * @param {Boolean} [options.json=false] Emit JSON instead of plain text.
     * @param {Boolean} [options.colorize=false] Colorize plain-text output.
     * @param {Boolean|String|Function} [options.timestamp] Timestamp control.
     * @param {Object} [options.format] A winston format to fully override the
     *   default formatting.
     */
    constructor(options) {
        if (!options || !options.filename) {
            throw new Error('Writer: `options.filename` is required');
        }

        const transportOpts = {
            filename: options.filename,
            datePattern: options.datePattern || 'YYYYMMDD',
            level: options.level || 'info',
            maxSize: options.maxSize || options.maxsize || DEFAULT_MAX_SIZE,
            zippedArchive: withDefault(options.zippedArchive, true)
        };

        if (options.maxFiles !== undefined) {
            transportOpts.maxFiles = options.maxFiles;
        }

        this.writer = winston.createLogger({
            level: transportOpts.level,
            format: buildFormat(options),
            transports: [
                new DailyRotateFile(transportOpts)
            ]
        });
    }

    /**
     * Write a single entry.
     *
     * @param {String} level Log level (silly|debug|verbose|info|warn|error).
     * @param {String} mark A unique ID used to correlate related log lines.
     * @param {Array} data Metadata values to log.
     * @param {String} [stackInfo] Caller position, e.g. `file.js:42`.
     */
    write(level, mark, data, stackInfo) {
        this.writer.log({
            level,
            message: mark,
            data,
            stackInfo
        });
    }
}

module.exports = Writer;
