var path = require("path");
var os = require("os");


var SlugRunnerFactory = require('./lib/SlugRunnerFactory');
var TaskFetcher = require('./lib/TaskFetcher');
var AgentJones = require('./lib/AgentJones');

var hostname = process.env['HOSTNAME'] || os.hostname();
var agentname = process.env['AGENT_NAME'] || 'anonymous';

// get the address of the scheduler
var SCHEDULER_ENDPOINT = process.env['SCHEDULER_ENDPOINT'];
// optional token incase the scheduler requires tokens
var SCHEDULER_TOKEN = process.env['SCHEDULER_TOKEN'];

// where we run/unpack the tarball
var SLUGRUNNER_CWD = process.env['WORKSPACE'] || path.join(process.cwd(), 'workspace') ;



var slugRunnerFactory = new SlugRunnerFactory(SLUGRUNNER_CWD)
var taskFetcher = new TaskFetcher(SCHEDULER_ENDPOINT, SCHEDULER_TOKEN)

var agentJones = new AgentJones(agentname, hostname, taskFetcher, slugRunnerFactory);

agentJones.start()