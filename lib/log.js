'use strict'

/**
 * Rudimentary logging
 * TODO: when using papertrail we aren't closing the underlying tcp connection and the process stays open
 */

const url = require('url')
const os = require('os')

const winston = require('winston')
require('winston-papertrail').Papertrail

const pkg = require('../package')

const transports = []

if (process.env['PAPERTRAIL_URL']) {
  transports.push(createPapertrailTransport())
}

// Enabling papertrail out disables console output unless explicitly enabled
// console output is default enabled otherwise
if ((process.env['PAPERTRAIL_URL'] && process.env['CONSOLE_OUTPUT'] === 'true') || (process.env['CONSOLE_OUTPUT'] !== 'false' && !process.env['PAPERTRAIL_URL'])) {
  transports.push(createConsoleTransport())
}

const logger = new winston.Logger({
  transports: transports,
  exitOnError: false
})

module.exports = logger.info
// FIXME: hack till this becomes properly structured
module.exports.close = logger.close.bind(logger)

function createPapertrailTransport () {
  const paptrailUrlObj = url.parse(process.env['PAPERTRAIL_URL'])

  return new winston.transports.Papertrail({
    host: paptrailUrlObj.hostname,
    port: paptrailUrlObj.port,
    hostname: 'agent-jones', // be like heroku and have the "system name" instead of hostname
    program: `${process.env['AGENT_NAME'] || 'anonymous'}/${process.env['HOSTNAME'] || os.hostname()}`,
    logFormat (level, message) { return `pid=${process.pid} ${message}` }
  })
}

function createConsoleTransport () {
  return new winston.transports.Console({
    timestamp () { return new Date().toISOString() },
    formatter (options) {
      return `${options.timestamp()} AGENT-JONES [${pkg.version}] PID:${process.pid} :: ${options.message}`
    }
  })
}
