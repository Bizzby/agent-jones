/**
 * Basic class for fetching a task from the/a scheduler
 *
 * Keeps trying for a task until error, or task is returned
 * Is also an event emitter for debug purposes
 */

var EventEmitter = require('events').EventEmitter;
var util = require('util');
var request = require('request');


var DEFAULT_RETRY = 10 * 1000; //10 seconds

var TaskFetcher = function TaskFetcher(schedulerEndpoint, authToken){

    //TODO validate this
    this.schedulerEndpoint = schedulerEndpoint;
    //TDO auth stuff
    if(authToken) {
        this.authToken = authToken;
    }

}

util.inherits(TaskFetcher, EventEmitter);


TaskFetcher.prototype.getTask = function(agentname, nodename, callback) {

    var self = this;

    this._getTaskRequest(agentname, nodename, onResponse)

    function onResponse(err, response, task){
        if(err) {
            return callback(err);
        }

        if(response.statusCode == 200) {
            return callback(null, task)
        }

        // FIXME: worse named event ever?
        self.emit("debug", {
            status: response.statusCode
        })

        // otherwise keep trying!
        setTimeout(function(){
            self._getTaskRequest(agentname, nodename, onResponse)
        }, DEFAULT_RETRY)
            
    }

};

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

    request(schedulerTaskReq, callback)
    
};

module.exports = TaskFetcher;
