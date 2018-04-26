const net = require('net');

const Writer = require('./writer');

let writerPool = {};

module.exports = function (port) {
    let server = net.createServer((c) => {
        console.log('debug', 'client connected');

        c.on('data', (data) => {
            try {
                let params = JSON.parse(data);

                if (!writerPool.hasOwnProperty(params.options.filename)) {
                    writerPool[params.options.filename] = new Writer(params.options);
                }

                writerPool[params.options.filename].write(params.level, params.mark, params.data, params.stackInfo);
            } catch (err) {
                console.log('error', 'parameters error', err);
            }

        });

        c.on('end', () => {
            console.log('debug', 'client disconnected');
        });
    });

    server.on('error', (err) => {
        throw err;
    });

    server.listen(port, () => {
        console.log('debug', `server bound: ${port}`);
    });
};