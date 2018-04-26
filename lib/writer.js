const winston = require('winston');
const WinstonRotate = require('winston-daily-rotate-file');

class Writer {
    constructor(options) {
        let opts = {
            filename: options.filename,
            datePattern: options.datePattern || 'YYYYMMDD',
            prepend: options.prepend || true,
            level: options.level || 'info',
            colorize: options.colorize || false,
            maxsize: options.maxsize || 104857600,
            zippedArchive: options.zippedArchive || true,
            json: options.json || false
        };

        if (options.timestamp) {
            opts.timestamp = options.timestamp;
        }

        if (options.format) {
            opts.format = options.format;
        }

        this.writer = new (winston.Logger)({
            transports: [
                new WinstonRotate(opts)
            ]
        });
    }

    write(level, mark, data, stackInfo) {
        this.writer.log(level, mark, data, stackInfo);
    }
}

module.exports = Writer;