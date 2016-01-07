/**
 * Class for handling getting new tasks from the scheduler server
 */

var crypto = require('crypto')
var EventEmitter = require('events').EventEmitter
var util = require('util')
var debug = require('debug')('agent-jones:task-watcher')

var Task = require('./Task')

var _events = {
    NEW_TASK: 'new_task', // there is a new task
    STOP_TASK: 'stop_task', // stop whatever task you're doing
    ERROR: 'error', // bad kind of error, probably blows everything up
    SOFT_ERROR: 'soft_error', // probably ignorable/transient error
    START: 'start', // we've actually started running
    STOP: 'stop' //we've actually stopped running

}

// TODO: this should be an FSM
var _states = {
    STOPPED: 'stopped',
    STOPPING: 'stopping',
    RUNNING: 'running',
    STARTING: 'starting'
}

var DEFAULT_LOOP = 60 * 1000 // Time between polls FIXME: should be configable

var TaskWatcher = module.exports = function TaskWatcher(agentname, nodename, schedulerClient){

    EventEmitter.call(this)

    /**
     * very high level / basic state flag
     */
    this._state = _states.STOPPED

    this.agentname = agentname
    this.nodename = nodename

    this._schedulerClient = schedulerClient

    /**
     * These four pretty much determine internal run state
     */
    this._pollTimeout // Holder for polling setTimeout
    this._requestLock = false //  Set true when doing http request stuff TODO: replace this with a state?
    this._kickStart // Holder for initial 'start' setImmediate
    this._kickStop // Holder for 'stop' setImmediate

    /**
     * Leaky state stuff from scheduler http client goes here
     */
    this._etag // etag for our current task
    this._task // our current (deserialised) task model/struct/obj
    this._taskHash //fallback taskHash for change detection
}

util.inherits(TaskWatcher, EventEmitter)

// Be nice to consumers
TaskWatcher.states = _states
TaskWatcher.events = _events


// TODO: should we add a callback here?
TaskWatcher.prototype.start = function() {

    var self = this

    if (this._state == _states.RUNNING || this._state == _states.STARTING) {
        debug('start called but already in state: ' + this._state)
        return
    }

    if (this._state == _states.STOPPING) {
        debug('start called but currently in state: ' + this._state)
        // FIXME: this state should throw!
        return
    }

    this._state = _states.STARTING

    debug('start called - setting state to: ' + this._state)

    // if we already doing stuff no need to kick off
    // run loop
    // TODO: can we remove this now that we have STARTING/STOPPING STATES
    if (this._pollTimeout || this._requestLock || this._kickStart || this._kickStop) {
        debug('starting but request/polltimeout/kickstart/kickstio already in progress')
        return
    }

    this._kickStart = setImmediate(function(){
        debug('starting run loop')
        self._state = _states.RUNNING
        debug('setting state to: ' + self._state)
        // TODO: should the emit go after?
        self.emit(_events.START)
        self._run()
    })
}

// TODO: probably add optional callback and attach to listener here
TaskWatcher.prototype.stop = function(callback) {

    var self = this

    debug('stop called')

    if (this._state == _states.STOPPED) {
        debug('stop called but already in state: ' + this._state)
        return
    }    

    // TODO: should we allow users to queue up multiple
    // callbacks for the same stop event?
    if(callback) {
        this.once(_events.STOP, callback)
    }

    if (this._state == _states.STOPPING) {
        debug('stop called but already in state: ' + this._state)
        return
    }       

    this._state = _states.STOPPING
    debug('setting state to: ' + this._state)

    if (this._requestLock) {
        debug('requestLock active - deferring tidy up to onRequest')
        // do nothing and wait for existing request to finish
        // it will tidy up for us
        return
    }


    debug('setting up "stop tidy up" for setImmediate')
    // use setImmediate to maintain async consistency
    setImmediate(function(){
        // else we cancel the timeout
        // and call stop ourselves
        // TODO: should we move this into a seperate method/_stopped?
        self._state = _states.STOPPED
        debug('setting state to: ' + self._state)
        debug('clearing internal timeouts')
        clearTimeout(self._pollTimeout)
        self._pollTimeout = null
        clearImmediate(self._kickStart)
        self._kickStart = null
        self._stopped()        
    })

}

// Expect async entry
TaskWatcher.prototype._run = function() {

    debug('entering run loop')
    // clear the timeout/setImmediate handle
    this._pollTimeout = null
    this._kickStart = null

    // We expect async entry to this func so check is state changed
    // while we were away
    if (this._state !== _states.RUNNING) {
        ('exiting run loop early as state is: ' + this._state )
        this._stopped()
        return
    }

    // Should check this value before setting it probably...
    // TODO: it may be possible to end up in incorrect state of multiple
    // requests in flight
    debug('setting request lock')
    this._requestLock = true

    this._schedulerClient.getTask(
        this.agentname, 
        this.nodename, 
        {etag:this._etag}, 
        this._taskResponseHandler.bind(this)
        )

}

// Expect async entry!
TaskWatcher.prototype._taskResponseHandler = function(err, response, task){

    // unlock internal state
    debug('unsetting request lock')
    this._requestLock = false

    // check we are still running - if not then bail
    // stop may have been called and there for a stop is queud up
    if (this._state !== _states.RUNNING) {
        debug('exiting onResponse early as state is: ' + this._state)
        this._stopped()
        return
    }


    // trigger next run in preperation - wish we had defer
    this._runAgain()

    debug('response received, status: ' + response.statusCode)
    // fundamental error like ECONN
    // TODO: should we deal with some errors here instead of just bailing?
    // FIXME: some errors here will be unrecoverable!
    if(err) {
        debug('error making request')
        return this._softError(err)
    }

    if(response.statusCode == 200) {
        debug('task received')
        // TODO: should we always update the etag?
        this._etag = response.headers['etag']
        var _task = this._deserialiseTask(task)
        var _taskHash = this._hashTask(_task)

        if(_taskHash != this._taskHash) {
            this._task = _task
            this._taskHash = _taskHash
            return this._receivedTask()
        }

        debug('task hash did not change - ignoring new task')
        return
    }

    // no change from current task
    if(response.statusCode == 304) {
        debug('task not changed')
        return
    }        

    // no task - this is ok
    // TODO: should probably check it's the 404 we're expecting...
    if(response.statusCode == 404) {
        debug('no task received')
        this._etag = null
        this._task = null
        return this._noTask()
    }

    // auth is wrong/missing
    // FIXME: this is probably pretttty fatal?
    if(response.statusCode == 401) {
        debug('auth failure')
        return this._softError(new Error('could not authenticate with the scheduler'))
    }

    // wierd stuff happened
    // lets assume it's nothing super bad :-)
    debug('unexpected http response')
    var _error = new Error('unhandled HTTP status')
    _error.statusCode = response.statusCode

    return this._softError(_error)

}

// Expect sync entry
TaskWatcher.prototype._runAgain = function() {

    var self = this
    debug('setting runAgain timeout')

    this._pollTimeout = setTimeout(function(){
        self._run()
    }, DEFAULT_LOOP)
}

// Handler for 
TaskWatcher.prototype._receivedTask = function() {
    this.emit(_events.NEW_TASK, this._task)
}

TaskWatcher.prototype._noTask = function() {
    this.emit(_events.STOP_TASK)
}

TaskWatcher.prototype._softError = function(err) {
    this.emit(_events.SOFT_ERROR, err)
}

TaskWatcher.prototype._error = function(err) {
    this.emit(_events.ERROR, err) 
}

// If we stop we should call this so listener can know we've stopped
TaskWatcher.prototype._stopped = function() {
    this.emit(_events.STOP)
}

TaskWatcher.prototype._hashTask = function(taskModel) {
    var hash = crypto.createHash('sha1')
    hash.update(JSON.stringify(taskModel), 'utf8')
    return hash.digest('hex')
}

//Doesn't really belong on class
TaskWatcher.prototype._deserialiseTask = function(rawTask) {

    debug('deserialising task')

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