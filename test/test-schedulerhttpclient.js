var SchedulerHttpClient = require('../lib/SchedulerHttpClient')

/**
 * FILL IN THE BLANKS :-)
 * - scheduler endpoint
 * - auth (optional)
 * - agentname
 * - nodename
 */

var schedulerEndpoint = 'http://127.0.0.1:8099' // http://127.0.0.1
var auth = null // null or string

var agentname = 'test' //
var nodename = 'localhost' //

var schedulerHttpClient = new SchedulerHttpClient(schedulerEndpoint, auth)

schedulerHttpClient.getTask(agentname, nodename, function(err, response, body){
    //console.log(err)
    console.log(err, body) // eslint-disable-line no-console
    // Err should be null
    // body should be ssoommmmeeettthiiiinngg
})