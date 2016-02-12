'use strict'

const path = require('path')
const os = require('os')

const yeller = require('yeller_node')

const HerokuSlugFactory = require('./lib/driver/HerokuSlugFactory')
const SchedulerHttpClient = require('./lib/SchedulerHttpClient')
const AgentJones = require('./lib/AgentJones')
const TaskWatcher = require('./lib/TaskWatcher')
const SlackClient = require('./lib/SlackClient')
const agentJonesSlackifier = require('./lib/agentJonesSlackifier')

const log = require('./lib/log')
const logStringify = require('./lib/utils/logStringify')
const sigTrap = require('./lib/utils/sigTrap')
const fingerprint = require('./lib/utils/fingerprint')
const stats = require('./lib/stats')

const hostname = process.env['HOSTNAME'] || os.hostname()
const agentname = process.env['AGENT_NAME'] || 'anonymous'

// get the address of the scheduler
const SCHEDULER_ENDPOINT = process.env['SCHEDULER_ENDPOINT']
// optional token incase the scheduler requires tokens
const SCHEDULER_TOKEN = process.env['SCHEDULER_TOKEN']
// TODO: make data-dir mandatory and phase out workspace
const DATA_DIR = process.env['DATA_DIR'] || process.env['WORKSPACE'] || process.cwd()
const STATE_DIR = process.env['STATE_DIR'] || path.join(DATA_DIR, 'state') // eslint-disable-line no-unused-vars
const ALLOCATION_DIR = process.env['STATE_DIR'] || path.join(DATA_DIR, 'allocation')

const SLACK_WEBHOOK_URL = process.env['SLACK_WEBHOOK_URL']

const YELLER_TOKEN = process.env['YELLER_TOKEN']

// FIXME: ugly log line that feels out of place, should probably be inside AgentJones
log(`fingerprint ${fingerprint()}`)

const herokuSlugDriverFactory = new HerokuSlugFactory(ALLOCATION_DIR)
const schedulerClient = new SchedulerHttpClient(SCHEDULER_ENDPOINT, SCHEDULER_TOKEN)
const taskWatcher = new TaskWatcher(agentname, hostname, schedulerClient)
const agentJones = new AgentJones(agentname, hostname, taskWatcher, herokuSlugDriverFactory)

// turn on slack notifications
if (SLACK_WEBHOOK_URL) {
  log('slack output via webhooks enabled')
  agentJonesSlackifier(agentJones, new SlackClient(SLACK_WEBHOOK_URL))
}

agentJones.start()

// TODO: tidy this away somewhere
const statsOutput = setInterval(function () {
  const processStatOutput = stats.procStats.toJSON()
  log('metrics ' + logStringify(processStatOutput.process))
}, 60 * 1000)

const shutUpShop = function (signal) {
  log(`${signal} received, attempting graceful shutdown`)
  agentJones.stop(function () {
    clearInterval(statsOutput)
    log.close()
        // DDOGY failsafe incase network IO etc doesn't shutdown - we shouldn't need this
        // and it generally shouldn't get called
        // FIXME: magic 5 second timeout :-p
    setTimeout(process.exit, 5000).unref()
  })
}

// Trap and act on signals
sigTrap(shutUpShop)

// Attempt to crash nicely
// FIXME: this is 99% copy-pasta of shutUpShup
process.on('uncaughtException', function (err) {
  log(`uncaught exception received: ${err.message}, attempting graceful shutdown`)

    // create yeller client
    // TODO: move this out to module
  if (YELLER_TOKEN) {
    log(`sending exception to yeller`)
    const logError = function (err) { log(err.message) }
    const errorHandler = {
      ioError: logError,
      authError: logError
    }
    const yellerClient = yeller.client({token: YELLER_TOKEN, errorHandler: errorHandler})
    // NOTE: thr 5 second timeout below should buy us enough time to fire off the message
    yellerClient.report(err, {location: agentname})
  } else {
    log(err.stack)
  }

  agentJones.stop(function () {
    clearInterval(statsOutput)
    log.close()
        // DDOGY failsafe incase network IO etc doesn't shutdown - we shouldn't need this
        // and it generally shouldn't get called
        // FIXME: magic 5 second timeout :-p
    setTimeout(process.exit, 5000).unref()
  })
})
