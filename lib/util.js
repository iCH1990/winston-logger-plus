const path = require('path');
const stackTrace = require('stack-trace');

// Absolute path to this library's source directory. Stack frames originating
// from here are skipped so we always report the user's real call site,
// regardless of how many internal frames sit in between.
const LIB_DIR = __dirname;

/**
 * Resolve the position (`file:line`) from which a logging method was invoked.
 *
 * The first stack frame that does not belong to this library is treated as the
 * caller, which keeps the result correct no matter how the internal call chain
 * changes.
 *
 * @param {String} [basePath] Project root; when provided the returned path is
 *   made relative to it for shorter, more readable output.
 * @returns {String|null} A `file:line` string, or `null` when it cannot be
 *   determined.
 */
function getCallerPosition(basePath) {
    const traces = stackTrace.get() || [];

    const trace = traces.find((frame) => {
        const fileName = frame.getFileName();

        return fileName && path.dirname(fileName) !== LIB_DIR;
    });

    if (!trace) {
        return null;
    }

    let fileName = trace.getFileName();
    const lineNumber = trace.getLineNumber();

    if (basePath) {
        fileName = path.relative(basePath, fileName);
    }

    return `${fileName}:${lineNumber}`;
}

/**
 * Replace an `Error` with its stack trace so it logs/serializes usefully.
 * Any other value is returned unchanged.
 *
 * @param {*} value
 * @returns {*}
 */
function normalizeError(value) {
    return value instanceof Error ? value.stack : value;
}

module.exports = {
    getCallerPosition,
    normalizeError
};
