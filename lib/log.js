/**
 * Rudimentary logging
 * TODO: when using papertrail we aren't closing the underlying tcp connection and the process stays open
 */

var url = require('url')
var os = require('os')

var winston = require('winston')
require('winston-papertrail').Papertrail

var pkg = require('../package')



var transports = []


if (process.env['PAPERTRAIL_URL']) {
    transports.push(createPapertrailTransport())
}

// Enabling papertrail out disables console output unless explicitly enabled
// console output is default enabled otherwise
if ( (process.env['PAPERTRAIL_URL'] && process.env['CONSOLE_OUTPUT'] == 'true') || (process.env['CONSOLE_OUTPUT'] != 'false' && !process.env['PAPERTRAIL_URL'] ) ) {
    transports.push(createConsoleTransport())
}

var logger = new winston.Logger({
    transports: transports,
    exitOnError: false
})

module.exports = logger.info
// FIXME: hack till this becomes properly structured
module.exports.close = logger.close.bind(logger)

function createPapertrailTransport() {

    var paptrailUrlObj = url.parse(process.env['PAPERTRAIL_URL'])

    return new winston.transports.Papertrail({
        host: paptrailUrlObj.hostname,
        port: paptrailUrlObj.port,
        hostname: 'agent-jones', // be like heroku and have the "system name" instead of hostname
        program: (process.env['AGENT_NAME'] || 'anonymous') + '/' + (process.env['HOSTNAME'] || os.hostname()),
        logFormat: function(level, message) { return 'pid='+ process.pid + ' ' + message}
    })
}

function createConsoleTransport() {

    return new winston.transports.Console({
        timestamp: function(){ return new Date().toISOString()},
        formatter: function(options){
            return options.timestamp() +' AGENT-JONES [' + pkg.version + ']' + ' PID:'+process.pid + ' :: ' + options.message
        }
    })
}