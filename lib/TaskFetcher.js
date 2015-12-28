/**
 * Basic class for fetching a task from the/a scheduler
 *
 */

var request = require('request')

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

    var self = this

    this._getTaskRequest(agentname, nodename, onResponse)

    function onResponse(err, response, task){

        // fundamental error like econn
        // TODO: should we deal with some errors here instead of just bailing?
        if(err) {
            return callback(err)
        }

        if(response.statusCode == 200) {
            return callback(null, self._unserialiseTask(task))
        }

        // no task - this is ok
        if(response.statusCode == 404) {
            return callback(null, null)
        }

        // auth is wrong/missing
        if(response.statusCode == 401) {
            return callback(new Error('could not authenticate with the scheduler'))
        }

        // wierd stuff happened
        var _error = new Error('unhandled HTTP status')
        _error.statusCode = response.statusCode

        return callback(_error)


    }
}

TaskFetcher.prototype._getTaskRequest = function(agentname, nodename, callback) {

    var schedulerTaskReq = {
        method: 'GET',
        url: this.schedulerEndpoint + '/v1/tasks',
        qs: {
            agent: agentname,
            node: nodename
        },
        json: true
    }

    if(this.authToken) {
        schedulerTaskReq.auth = {
            'bearer': this.authToken
        }
    }

    request(schedulerTaskReq, callback)
    
}

TaskFetcher.prototype._unserialiseTask = function(rawTask) {


    var task = new Task

    task.command = rawTask.command
    task.enviroment = rawTask.enviroment
    task.tarball = rawTask.tarball

    return task
}

module.exports = TaskFetcher
