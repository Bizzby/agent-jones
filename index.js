var path = require("path")
var os = require("os")


var HerokuSlugFactory = require('./lib/driver/HerokuSlugFactory')
var SchedulerHttpClient = require('./lib/SchedulerHttpClient')
var AgentJones = require('./lib/AgentJones')
var TaskWatcher = require('./lib/TaskWatcher')
var SlackClient = require('./lib/SlackClient')
var agentJonesSlackifier = require('./lib/agentJonesSlackifier')

var log = require('./lib/log')
var logStringify = require('./lib/utils/logStringify')
var sigTrap = require('./lib/utils/sigTrap')
var fingerprint = require('./lib/utils/fingerprint')
var stats = require('./lib/stats')



var hostname = process.env['HOSTNAME'] || os.hostname();
var agentname = process.env['AGENT_NAME'] || 'anonymous';

// get the address of the scheduler
var SCHEDULER_ENDPOINT = process.env['SCHEDULER_ENDPOINT']
// optional token incase the scheduler requires tokens
var SCHEDULER_TOKEN = process.env['SCHEDULER_TOKEN']

// where we run/unpack the tarball
var SLUGRUNNER_CWD = process.env['WORKSPACE'] || path.join(process.cwd(), 'workspace')

var SLACK_WEBHOOK_URL = process.env['SLACK_WEBHOOK_URL']

// FIXME: ugly log line that feels out of place, should probably be inside AgentJones
log(`fingerprint ${fingerprint()}`)

var herokuSlugDriverFactory = new HerokuSlugFactory(SLUGRUNNER_CWD)
var schedulerClient = new SchedulerHttpClient(SCHEDULER_ENDPOINT, SCHEDULER_TOKEN)
var taskWatcher = new TaskWatcher(agentname, hostname, schedulerClient)
var agentJones = new AgentJones(agentname, hostname, taskWatcher, herokuSlugDriverFactory);

//turn on slack notifications
if(SLACK_WEBHOOK_URL) {
    log('slack output via webhooks enabled')
    agentJonesSlackifier(agentJones, new SlackClient(SLACK_WEBHOOK_URL))
}

agentJones.start()

// TODO: tidy this away somewhere
var statsOutput = setInterval(function(){

    var processStatOutput = stats.procStats.toJSON()
    log('metrics ' + logStringify(processStatOutput.process))

}, 60*1000)

var shutUpShop = function(signal){
    log(`${signal} received, attempting graceful shutdown`)
    agentJones.stop(function(){
        clearInterval(statsOutput)
        log.close()
        // DDOGY failsafe incase network IO etc doesn't shutdown - we shouldn't need this
        // and it generally shouldn't get called
        // FIXME: magic 5 second timeout :-p
        setTimeout(process.exit, 5000).unref()
    })
}

sigTrap(shutUpShop)


