/**
 * Basic class for fetching a task from the/a scheduler
 * TODO: this exposes lots of HTTP related stuff users
 */

var needle = require('needle')
var debug = require('debug')('agent-jones:scheduler-http-client')

var pkg = require('../package')

var SchedulerHttpClient = function SchedulerHttpClient(schedulerEndpoint, authToken){

    // TODO validate this
    this.schedulerEndpoint = schedulerEndpoint
    // TODO auth stuff
    if(authToken) {
        this._authToken = authToken
    }
}


SchedulerHttpClient.prototype.getTask = function(agentname, nodename, opts, callback) {

    debug('assembling request')

    if(typeof opts == 'function') {
        callback = opts
        opts = {}
    }



    var requestOptions = {
        compressed: true,
        headers: {
            'User-Agent': 'AgentJones/'+ pkg.version + ' (node '+ process.version + ')'
        }
    }

    if(this._authToken) {
        debug('using auth')
        requestOptions.headers['Authorization'] = 'Bearer ' + this._authToken
    }

    // NOTE: etag should bu supplied as as as string with qoutes in the string
    if(opts.etag) {
        debug('using etag: ' + opts.etag)
        requestOptions.headers['If-None-Match'] = opts.etag
    }


    var url = this.schedulerEndpoint + '/v1/tasks?agent=' + agentname +'&node='+nodename

    needle.get(url, requestOptions, callback)
    
}

module.exports = SchedulerHttpClient
