var TaskFetcher = require('../lib/TaskFetcher')

/**
 * FILL IN THE BLANKS :-)
 * - scheduler endpoint
 * - auth (optional)
 * - agentname
 * - nodename
 */

var schedulerEndpoint = "http://127.0.0.1:8000"; // http://127.0.0.1
var auth = null; // null or string

var agentname = "test-stage" //
var nodename = "localhost" //

var taskFetcher = new TaskFetcher(schedulerEndpoint, auth)

taskFetcher.getTask(agentname, nodename, function(err, task){
    // Err should be null
    // task should be ssoommmmeeettthiiiinngg or null
})