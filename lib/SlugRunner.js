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

var url = require('url')
var os = require('os')

var rimraf = require('rimraf')
var mkdirp = require('mkdirp')
var clone = require('lodash.clone')
var debug = require('debug')('agent-jones:slugrunner')

// Used for optional log shipping
var Papertrail = require('winston-papertrail').Papertrail
var noop = function(){}

var log = require('./log')

var _log = function(message){
    log('slugrunner: ' + message)
}

// The path to the slugrunner shell script
var SLUGRUNNER_PATH = path.resolve(__dirname, '../bin/slugrunner')


var _events = {
    START: 'start',
    EXIT: 'exit',
    RESTART: 'restart'
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

    _log('starting')

    if (this._slugRunnerProcess) {
        _log('pre-existing process - doing nothing')
        return null
    }

    this._task = task
    this.stopped = false
    this.restartCount = 0

    this._logTransport

    this._start()

}

SlugRunner.prototype._start = function() {

    debug('internal start')
    var self = this

    //skip doing things if already running
    if (this._slugRunnerProcess) {
        _log('pre-existing process - doing nothing')
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


    // FIXME: this will need closing/ending when/if task changes!! 
    // TODO: I should probably write a transform instead to join it all up
    if(task.config && task.config.papertrail) {
        _log('sending slugrunner process stdout to papertrail')
        this._logTransport = createPapertrailTransport(task.config.papertrail, task.app, task.name)
        this._logTransport.on('connect', function(msg){
            _log(msg)
        })
        this._logTransport.on('error', function(err){
            _log('papertrail transport error:' + err.message)
        })
    } else {
        debug('using inherited stdio for child')
    }


    //TODO: what do we want to about stdin?
    var _procOpts =  {   
        cwd: this._workspace, 
        env: slugRunnerEnviroment,
        stdio: (this._logTransport) ? 'pipe' : 'inherit'
    }

    // TODO: improve stdout/stderr handling and direction
    this._slugRunnerProcess = child_process.spawn(
        SLUGRUNNER_PATH, 
        task.command, 
        _procOpts
        )

    // If there is a logTransport attach pipes and things
    // TODO: handle more than just stdout!
    // TODO: one day we handle more than papertrail
    // TODO: really should make a stream|pipe for this
    // FIXME: there is a potential race condition between
    // the child process closing and this data event getting
    // shipped out
    function _sendLogOnwards(line){
        self._logTransport.log('info', line, noop)
    }

    if(this._logTransport) {

        this._slugRunnerProcess.stdout.on('data', function(data){
            // FIXME: lame stuff as stdout buffers multiple lines
            data.toString().split('\n').forEach(_sendLogOnwards)
            
        })

        // TODO: this seems janky - do we always get the close event?
        // does this allow enough time for sending everything + buffered to PT
        // when the app crashes/atops very quickly?
        this._slugRunnerProcess.on('close', function(){
            _log('closing papertrail connection')
            self._logTransport.close()
        })
    }


    this._slugRunnerProcess.on('error', function(err) {
        _log('Failed to spawn ' + err.message)
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

    debug('process exited')

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

    // This is a pretty nuclear option
    var signame = 'SIGKILL'


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
        _log('Kill process '+this._slugRunnerProcess.pid+ ' with '+ signame+' failed: ' + err.message)
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
    
    var signame = 'SIGTERM'
    
    try {
        this._slugRunnerProcess.kill(signame)
    } catch (err) {
        if (err.code === 'ESRCH') {
            // We got unlucky, the process is dead
            process.nextTick(callback)
            return
        }
        _log('Kill process '+this._slugRunnerProcess.pid+ ' with '+ signame+' failed: ' + err.message)
    }

    var to = setTimeout(function() {
        _log('soft stop forcibly terminated')
        self.kill()
    }, 5000) // FIXME: this is an arbitary time!!

    this._slugRunnerProcess.once('exit', function(status) {
        _log('soft stop successful')
        clearTimeout(to)
        return callback(status)
    })
    

}


// Handles restarting (or exiting) the process internally
SlugRunner.prototype._restart = function _restart() {

    debug('internal restart')

    var self = this

    if (this.stopped) {
        debug('no longer running')
        return
    }
    
    // Not all exits are unexpected (one off tasks etc)
    this.restartCount += 1
    
    _log('restarting (' + this.restartCount + ')' )

    // Emit the number of times we've restarted this task
    this.emit(_events.RESTART, this.restartCount)

    setImmediate(function(){ 
        self._start()
    })
}


module.exports = SlugRunner


function createPapertrailTransport(papertrailUrl, appname, taskname) {

    var paptrailUrlObj = url.parse(papertrailUrl    )

    var paptrail = new Papertrail({
        host: paptrailUrlObj.hostname,
        port: paptrailUrlObj.port,
        hostname: appname, // be like heroku and have the "app|system name" instead of hostname
        program: taskname + '/' + os.hostname(), //use the actual hostname
        logFormat: function(level, msg){return msg}
    })

    return paptrail
}