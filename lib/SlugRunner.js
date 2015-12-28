/**
 * Some kind of janky runner around the slugrunner script
 * and process.spawn
 *
 * TODO: 
 *     - sort of where the child process stdio go... right now are just piping through to our own stdio
 *     - implement our own events for start/stop etc
 */
var child_process = require('child_process')
var path = require('path')
var EventEmitter = require('events').EventEmitter
var util = require('util')

var rimraf = require('rimraf')
var mkdirp = require('mkdirp')
var clone = require('lodash.clone')
var debug = require('debug')('agent-jones:slugrunner')

var _log = require('./log')

// The path to the slugrunner shell script
var SLUGRUNNER_PATH = path.resolve(__dirname, '../bin/slugrunner')


var _events = {
    START: 'start',
    EXIT: 'exit'
}

var SlugRunner = function SlugRunner(workspace, opts){

    EventEmitter.call(this)

    var options = opts || {}

    //the working directory that slugrunner will execute on
    this._workspace = workspace

    this._cleanBeforeRun = options._cleanBeforeRun !== false
    this._slugRunnerProcess = null

    this.restartCount = 0
    this.stopped = true

    this._task = null
}

util.inherits(SlugRunner, EventEmitter)


/**
 * starts the underlying slugrunner process on the next event loop cycle
 * @param  {string}   tarballUrl URL to tarball
 * @param  {string}   command    the command to be executed by slugrunner
 * @param  {object}   enviroment the enviroment vars for the slug
 * @param  {Function} callback   called on slugrunner end (null, exitcode), or failure (err)
 */
SlugRunner.prototype.start = function(task) {

    _log('starting SlugRunner')

    if (this._slugRunnerProcess) {
        _log('pre-existing slugRunner process - doing nothing')
        return null
    }

    this._task = task
    this.stopped = false
    this.restartCount = 0

    this._start()

}

SlugRunner.prototype._start = function() {

    debug('internal start')
    var self = this

    //skip doing things if already running
    if (this._slugRunnerProcess) {
        _log('pre-existing slugRunner process - doing nothing')
        return null
    }

    //TODO stop using sync!
    if(this._cleanBeforeRun) {
        rimraf.sync(this._workspace)
        mkdirp.sync(this._workspace)
    }

    var task = this._task

    // FIXME: we should clone here
    var slugRunnerEnviroment = clone(task.enviroment)

    // SLUG_URL is handled (and unset) by slug runner script for grabbing tarballs
    // QUESTION: how would there not be a tarball, or what alternatives could there be? (stdin!, prexisting path)
    if(task.tarball) {
        slugRunnerEnviroment['SLUG_URL'] = task.tarball
    }


    // TODO: improve stdout/stderr handling and direction
    this._slugRunnerProcess = child_process.spawn(
        SLUGRUNNER_PATH, 
        task.command, 
        {   
            cwd: this._workspace, 
            env: slugRunnerEnviroment,
            stdio: 'inherit'
        })


    this._slugRunnerProcess.on('error', function(err) {
        _log('Failed to spawn', err)
        // Mostly, this will fail because cmd wasn't found in PATH, but it could
        // also fail because of insufficient mem, permissions, etc. Pass failure
        // up by faking a 127 exit status for this, similar to /bin/sh.
        self.onExit(127)
    })

    this._slugRunnerProcess.on('exit', this.onExit.bind(this))

    process.nextTick(function(){
        self.emit(_events.START)
    })

}

// Inplace swap task over
// TODO: we don't actually know of the task is any different
// from the existing task we are running run
SlugRunner.prototype.replace = function(task) {
    debug('replacing current task')
    this._task = task
    this.kill()
}

SlugRunner.prototype.onExit = function onExit(code, signal) {

    var status = signal || code

    this._slugRunnerProcess = null
    this.emit(_events.EXIT, status)
    this._restart(status)
}


// Callback with exit status if killed, with nothing if already dead.
SlugRunner.prototype.kill = function kill(callback) {

    debug('kill requested')

    if (!callback) {
        callback = function() {}
    }

    // if no process to kill silently carry on
    if (!this._slugRunnerProcess) {
        process.nextTick(callback)
        return 
    }

    var signame = 'SIGTERM'


    try {
        this._slugRunnerProcess.kill(signame)
        this._slugRunnerProcess.once('exit', function(code, signal) {
            callback(signal || code)
        })
    } catch (err) {
        if (err.code === 'ESRCH') {
          // We got unlucky, the process is dead
            process.nextTick(callback)
            return
        }
        _log('Kill process %d with %s failed: %s', this._slugRunnerProcess.pid, signame, err)
    }
}



SlugRunner.prototype.stop = function stop(callback) {

    debug('stopping')

    this.stopped = true
    this.kill(function(status) {
        if (callback) {
            callback(status)
        }
    })
    return
}


SlugRunner.prototype.softStop = function softStop(callback) {

    debug('soft stopping')

    var self = this

    if (!this._slugRunnerProcess) {
        process.nextTick(callback)
        return
    }

    self.stopped = true
  // TODO send correct signal!
  // SIGTERM

    var to = setTimeout(function() {
        _log('Soft stop forcibly terminated')
        self.kill()
    }, 5000) //
    self.once('exit', function(status) {
        clearTimeout(to)
        return callback(status)
    })
    return
}


// Handles restarting (or exiting) the process internally
SlugRunner.prototype._restart = function _restart() {

    debug('internal restart')

    var self = this

    if (this.stopped) {
        return
    }
    _log('restarting')
    // Not all exits are unexpected (one off tasks etc)
    this.restartCount += 1

    setImmediate(function(){ 
        self._start()
    })
}



module.exports = SlugRunner