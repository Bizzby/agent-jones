/**
 * Slight refinment on the original script...
 */

var url = require('url')
var crypto = require('crypto')
var debug = require('debug')('agent-jones')

var _log = require('./log')

var _STOPPED = 'stopped'
var _RUNNING = 'running'

// FIXME: this probably wants to become expo backoff at somepoint
var DEFAULT_LOOP = 10 * 1000

var AgentJones = function AgentJones(agentname, hostname, taskFetcher, slugRunnerFactory){

    this.agentname = agentname
    this.hostname = hostname

    this._taskFetcher = taskFetcher
    this._slugRunnerFactory = slugRunnerFactory

    // Holder for slugRunner instance
    this._slugRunner = null

    this._status = _STOPPED

    this._task = null
    this._taskHash = null
}

AgentJones.prototype.start = function() {

    var self = this

    this._status = _RUNNING
    _log('starting agent', this.agentname + '@' + this.hostname)

    setImmediate(function(){
        self._run()
    })

}

AgentJones.prototype._run = function() {

    debug('starting run')

    if (this._status !== _RUNNING) {
        this._stopped()
        return
    }

    debug('fetching task from scheduler')
    this._taskFetcher.getTask(this.agentname, this.hostname, this._fetchTaskHandler.bind(this))

}

AgentJones.prototype._runAgain = function() {
    debug('scheduling run for ' + DEFAULT_LOOP/1000 + ' seconds' )
    setTimeout(this._run.bind(this), DEFAULT_LOOP)
}

AgentJones.prototype._fetchTaskHandler = function(err, task) {

    debug('response from scheduler')

    var self = this

    if (this._status !== _RUNNING) {
        this._stopped()
        return
    }

    // FIXME: right now we'll just streamroller through any errors
    // and log them
    if(err){
        _log('error whilst fetching task from scheduler', err)
        this._runAgain()
        return
    }

    // no task + no error state
    // - stop the current running process
    if(task == null) {
        debug('no task from scheduler')
        if( this._slugRunner.stopped == false) {
            _log('no task recieved from scheduler - stopping existing task')
            this._slugRunner.softStop(function(){
                self._task = null
                self._taskHash = null
                self._runAgain()
            })
            return
        } else {
            self._runAgain()
            return
        }
    }

    var taskHash = _hashTask(task)

    if (this._taskHash != taskHash) {
        _log('task hash has changed from ' + this._taskHash + ' to ' + taskHash)
        this._taskHash = taskHash
        this._task = task
        this._bumpSlugRunner()
        return
    }

    this._runAgain()

    return
}

/**
 * Stops any existing slugRunner process else starts the slugRunner
 * @return {[type]} [description]
 */
AgentJones.prototype._bumpSlugRunner = function() {
    
    var self = this

    _log('bumping slugrunner for new task')

    if(!this._slugRunner) {
        this._slugRunner = this._slugRunnerFactory.createSlugRunner()
    }

    this._slugRunner.once('start', function(){
        self._runAgain()
    })

    if(this._slugRunner.stopped == true) {
        this._slugRunner.start(this._task)
    } else if (this._slugRunner.stopped == false) {
        this._slugRunner.replace(this._task)
    }

}

AgentJones.prototype._stopped = function() {
    _log('stopped agent', this.agentname + '@' + this.hostname)
}

module.exports = AgentJones



function _hashTask(task) {
    
    var hash = crypto.createHash('sha1')

    var hashObj = {
        tarball: _getNicerTarballName(task.tarball),
        enviroment: task.enviroment,
        command: task.command
    }

    hash.update(JSON.stringify(hashObj), 'utf8')

    return hash.digest('hex')

}

// Workaround so that getting the same tarball but different signature
// doesn't resolve to a new tarball
function _getNicerTarballName(tarball){

    var name = 'unknown'

    try {
        var urlObj = url.parse(tarball)
        name = urlObj.host + urlObj.pathname
    } catch (err) {
        //do nothing
    }

    return name
}