/**
 * Basic class for fetching a task from the/a scheduler
 *
 */

var request = require('request')
var debug = require('debug')('agent-jones:task-fetcher')

var pkg = require('../package')

var Task = require('./Task')

var TaskFetcher = function TaskFetcher(schedulerEndpoint, authToken){

    // TODO validate this
    this.schedulerEndpoint = schedulerEndpoint
    // TODO auth stuff
    if(authToken) {
        this.authToken = authToken
    }

}


TaskFetcher.prototype.getTask = function(agentname, nodename, callback) {

    debug('task requested')
    var self = this

    this._getTaskRequest(agentname, nodename, onResponse)

    function onResponse(err, response, task){

        debug('response received')
        // fundamental error like econn
        // TODO: should we deal with some errors here instead of just bailing?
        if(err) {
            debug('error making request')
            return callback(err)
        }

        if(response.statusCode == 200) {
            debug('task received')
            return callback(null, self._unserialiseTask(task))
        }

        // no task - this is ok
        if(response.statusCode == 404) {
            debug('no task received')
            return callback(null, null)
        }

        // auth is wrong/missing
        if(response.statusCode == 401) {
            debug('auth failure')
            return callback(new Error('could not authenticate with the scheduler'))
        }

        // wierd stuff happened
        debug('unexpected http response')
        var _error = new Error('unhandled HTTP status')
        _error.statusCode = response.statusCode

        return callback(_error)


    }
}

TaskFetcher.prototype._getTaskRequest = function(agentname, nodename, callback) {

    debug('assembling request')
    var schedulerTaskReq = {
        method: 'GET',
        url: this.schedulerEndpoint + '/v1/tasks',
        qs: {
            agent: agentname,
            node: nodename
        },
        headers: {
            'User-Agent': 'AgentJones/'+ pkg.version
        },
        json: true,
        gzip: true
    }

    if(this.authToken) {
        debug('using auth')
        schedulerTaskReq.auth = {
            'bearer': this.authToken
        }
    }

    request(schedulerTaskReq, callback)
    
}

TaskFetcher.prototype._unserialiseTask = function(rawTask) {

    debug('unserialising task')

    var taskModel = new Task()

    Object.keys(taskModel).reduce(copyKey, taskModel)

    return taskModel

    function copyKey(task, key){
        if(rawTask[key]) {
            task[key] = rawTask[key]
        }
        return task        
    }
}

module.exports = TaskFetcher
