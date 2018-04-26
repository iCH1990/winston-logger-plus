const path = require('path');
const stackTrace = require('stack-trace');

const Writer = require('./writer');

class Logger {
    constructor(options, basePath) {
        this.writer = new Writer(options);
        this.basePath = basePath;
    }

    log(level, mark, ...data) {
        let stackInfo = this.getPos();

        data = data.map((item) => {
            if (item instanceof Error) {
                return item.stack;
            }

            return item;
        });

        this.writer.write(level, mark, data, stackInfo)
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

module.exports = Logger;