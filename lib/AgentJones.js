/**
 * AgentJones co-ordinates messages for new tasks etc
 * with slugRunner
 */

var EventEmitter = require('events').EventEmitter
var util = require('util')

var debug = require('debug')('agent-jones')
var async = require('async')

var TaskWatcher = require('./TaskWatcher')
var SlugRunner = require('./SlugRunner')
var _log = require('./log')


var _states = {
    STOPPED: 'stopped',
    RUNNING: 'running',
    STOPPING: 'stopping'
}

var _events = {
    START: 'start',
    STOP: 'stop',
    TASK_START: 'task_start', // (task model)
    TASK_STOP: 'task_stop', // (task model)
    TASK_RESTART: 'task_restart' // (task model, numRestarts, cooldown time)
}

// TODO: should probably swap taskWatcher for a factory
var AgentJones = module.exports = function AgentJones(agentname, hostname, taskWatcher, slugRunnerFactory){

    EventEmitter.call(this)

    this.agentname = agentname
    this.hostname = hostname

    this._taskWatcher = taskWatcher
    this._slugRunnerFactory = slugRunnerFactory

    // Holder for slugRunner instance
    this._slugRunner = null

    this._state = _states.STOPPED

    this._task = null

    // Not sure where else to this initialisation
    this._taskWatcher.on(TaskWatcher.events.NEW_TASK, this._newTaskHandler.bind(this))
    this._taskWatcher.on(TaskWatcher.events.STOP_TASK, this._noTaskHandler.bind(this))

    // Lame error logggggging - TODO: replace me with something better
    this._taskWatcher.on(TaskWatcher.events.SOFT_ERROR, function(err){
        _log('taskWatcher soft error: ' + err.message)
    })
}

util.inherits(AgentJones, EventEmitter)

// Be nice to consumers
AgentJones.states = _states
AgentJones.events = _events

// TODO: do something with the callback
AgentJones.prototype.start = function() {

    if(this._state == _states.RUNNING) {
        debug('start called but already in state: ' + this._state)
        return
    }

    this._state = _states.RUNNING
    _log('starting agent', this.agentname + '@' + this.hostname)

    this._taskWatcher.start()
    this.emit(_events.START)

}

AgentJones.prototype._newTaskHandler = function(task) {

    debug('new task recieved')

    if (this._state !== _states.RUNNING) {
        return
    }

    this._task = task
    // TODO: maybe merge this and function underneath together
    this._bumpSlugRunner()

}

AgentJones.prototype._noTaskHandler = function() {

    debug('no-task from task-watcher')

    var self = this

    if (this._state !== _states.RUNNING) {
        return
    }

    if( this._slugRunner && this._slugRunner.stopped == false) {

        // pause getting commands from task watcher
        this._taskWatcher.stop()

        _log('stopping existing task')
        this._slugRunner.softStop(function(){
            self.emit(_events.STOP_TASK, self._task)
            self._task = null
            // start getting commands again
            self._taskWatcher.start()
        })
        return
    }
}


/**
 * Stops any existing slugRunner process else starts the slugRunner
 * @return {[type]} [description]
 */
AgentJones.prototype._bumpSlugRunner = function() {
    
    var self = this

    _log('bumping slugrunner for new task')

    // pause getting commands from task watcher
    // FIXME: we should wait till the task watcher actually
    // stops or at least check the state?
    this._taskWatcher.stop(function(){

        // if no existing slugrunner - create one
        if(!self._slugRunner) {
            self._slugRunner = self._slugRunnerFactory.createSlugRunner()

            //FIXME: this was only place I could think to dump this right now
            self._slugRunner.on(SlugRunner.events.RESTART, function(restartCount, coolDown){
                // NOTE: we filter out and round numbers here for niceness reasons
                if(restartCount > 0) {
                    self.emit(_events.TASK_RESTART, self._task, restartCount, Math.ceil(coolDown/1000))
                }
            })
        }

        // 
        self._slugRunner.once('start', function(){
            self.emit(_events.TASK_START, self._task)
            // restart getting commands from task watcher
            // TODO: if the app never starts again we'll get stuck here?!
            self._taskWatcher.start()
        })

        // TODO: ideally we should tear down the slugrunner if a task changes
        // but that seems inefficient at the moment
        if(self._slugRunner.stopped == true) {
            self._slugRunner.start(self._task)
        } else if (self._slugRunner.stopped == false) {
            self._slugRunner.replace(self._task)
        }
    })
}

AgentJones.prototype.stop = function(callback) {

    var self = this

    _log('stopping agent')

    debug('stop called')

    if (this._state == _states.STOPPED) {
        debug('stop called but already in state: ' + this._state)
        return
    }

    if(callback) {
        this.once(_events.STOP, callback)
    }

    if (this._state == _states.STOPPING) {
        debug('stop called but already in state: ' + this._state)
        return
    }

    this._state = _states.STOPPING
    debug('setting state to: ' + this._state)

    setImmediate(function(){
        async.parallel({
            tw: function(cb){
                if(self._taskWatcher._state !== TaskWatcher.states.STOPPED) {
                    self._taskWatcher.stop(cb)                    
                } else {
                    cb()
                }

            },
            sr: function(cb){
                if(self._slugRunner && self._slugRunner.stopped == false) {
                    self._slugRunner.softStop(cb)
                } else {
                    cb()
                }
            }
        }, function(err){
            if(err) {
                _log('error while stopping ' + err.message)
            }
            // TODO: should we return an error here?
            self._state == _states.STOPPED
            self._stopped()
        })
        
    })

}

AgentJones.prototype._stopped = function() {
    _log('stopped agent', this.agentname + '@' + this.hostname)
    this.emit(_events.STOP)
}
