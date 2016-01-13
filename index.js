var path = require("path")
var os = require("os")


var SlugRunnerFactory = require('./lib/SlugRunnerFactory')
var SchedulerHttpClient = require('./lib/SchedulerHttpClient')
var AgentJones = require('./lib/AgentJones')
var TaskWatcher = require('./lib/TaskWatcher')
var SlackClient = require('./lib/SlackClient')
var agentJonesSlackifier = require('./lib/agentJonesSlackifier')

var log = require('./lib/log')
var logStringify = require('./lib/utils/logStringify')
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

// FIXME: ugly log line that feels out of place - should probably go into a fingerprinting funtion
// inside AgentJones
log( ['node: ' + process.versions.node, 'os: ' + os.platform() + ' ' + os.release(), 'arch: ' + os.arch()].join(', '))

var slugRunnerFactory = new SlugRunnerFactory(SLUGRUNNER_CWD)
var schedulerClient = new SchedulerHttpClient(SCHEDULER_ENDPOINT, SCHEDULER_TOKEN)
var taskWatcher = new TaskWatcher(agentname, hostname, schedulerClient)
var agentJones = new AgentJones(agentname, hostname, taskWatcher, slugRunnerFactory);

//turn on slack notifications
if(SLACK_WEBHOOK_URL) {
    console.log('activating slackiness')
    agentJonesSlackifier(agentJones, new SlackClient(SLACK_WEBHOOK_URL))
}

agentJones.start()

// TODO: tidy me away somewhere
// graceful Shutdown logic
process.on('SIGTERM', function(){
    log('SIGTERM recieved, attempting graceful shutdown')
    // TODO: get errors and do non-zero exit code stuff
    agentJones.stop(function(){
        process.exit()
    })
})

// TODO: tidy this away somewhere
setInterval(function(){

    var processStatOutput = stats.procStats.toJSON()
    log('metrics ' + logStringify(processStatOutput.process))

}, 60*1000)