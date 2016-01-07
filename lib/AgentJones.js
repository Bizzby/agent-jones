/**
 * Slight refinment on the original script...
 */

var debug = require('debug')('agent-jones')

var TaskWatcher = require('./TaskWatcher')
var _log = require('./log')

var _STOPPED = 'stopped'
var _RUNNING = 'running'

// TODO: should probably swap taskWatcher for a factory
var AgentJones = function AgentJones(agentname, hostname, taskWatcher, slugRunnerFactory){

    this.agentname = agentname
    this.hostname = hostname

    this._taskWatcher = taskWatcher
    this._slugRunnerFactory = slugRunnerFactory

    // Holder for slugRunner instance
    this._slugRunner = null

    this._status = _STOPPED

    this._task = null

    // Not sure where else to this initialisation
    this._taskWatcher.on(TaskWatcher.events.NEW_TASK, this._newTaskHandler.bind(this))
    this._taskWatcher.on(TaskWatcher.events.STOP_TASK, this._noTaskHandler.bind(this))

    // Lame error logggggging - TODO: replace me with something better
    this._taskWatcher.on(TaskWatcher.events.SOFT_ERROR, function(err){
        _log('taskWatcher soft error: ' + err.message)
    })
}

AgentJones.prototype.start = function() {

    var self = this

    if(this._status == _RUNNING) {
        return
    }

    this._status = _RUNNING
    _log('starting agent', this.agentname + '@' + this.hostname)

    setImmediate(function(){
        self._run()
    })

}

AgentJones.prototype._run = function() {

    if (this._status !== _RUNNING) {
        this._stopped()
        return
    }

    this._taskWatcher.start()

}

AgentJones.prototype._newTaskHandler = function(task) {

    debug('new task recieved')


    if (this._status !== _RUNNING) {
        this._stopped()
        return
    }

    this._task = task
    // TODO: maybe merge this and function underneath together
    this._bumpSlugRunner()

}

AgentJones.prototype._noTaskHandler = function() {

    debug('no-task from task-watcher')

    var self = this

    if( this._slugRunner && this._slugRunner.stopped == false) {

        // pause getting commands from task watcher
        this._taskWatcher.stop()

        _log('stopping existing task')
        this._slugRunner.softStop(function(){
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
        }

        // 
        self._slugRunner.once('start', function(){
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

AgentJones.prototype._stopped = function() {
    _log('stopped agent', this.agentname + '@' + this.hostname)
}

module.exports = AgentJones
