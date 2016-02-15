'use strict'

/**
 * Rudimentary logging
 *
 */

const url = require('url')
const os = require('os')

const winston = require('winston')
require('winston-papertrail').Papertrail

const pkg = require('../package')

const transports = []

const consoleTransport = createConsoleTransport()

transports.push(consoleTransport)

if (process.env['PAPERTRAIL_URL']) {
  const papertrailTransport = createPapertrailTransport(process.env['PAPERTRAIL_URL'])
  transports.push(papertrailTransport)
}

const logger = new winston.Logger({
  transports: transports,
  exitOnError: false
})

// NOTE: if this gets called it's all gone pete tong
logger.on('error', function (err) {
  const ts = new Date().toISOString()
  console.log(`${ts} PID:${process.pid} :: LOGGER-ERROR ${err}`)
  console.log(err.stack)
})

// Wierd hack to catch+logs Papertrail events
if (logger.transports.Papertrail) {
  const ptTransport = logger.transports.Papertrail

  ptTransport.on('error', function (err) {
    logger.error(err)
  })

  ptTransport.on('connect', function (message) {
    logger.info(message)
  })
}
  
module.exports = logger

/**
 * Helper functions
 */

function createPapertrailTransport (papertrailUrl) {
  const paptrailUrlObj = url.parse(papertrailUrl)

  return new winston.transports.Papertrail({
    level: 'info',
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
