'use strict'

/**
 * Some kind of janky runner around the slugrunner script
 * and process.spawn
 *
 * TODO:
 *     - sort of where the child process stdio go... right now are just piping through to our own stdio
 *     - implement our own events for start/stop etc
 */
const child_process = require('child_process')
const path = require('path')
const EventEmitter = require('events').EventEmitter

const url = require('url')
const os = require('os')

const rimraf = require('rimraf')
const mkdirp = require('mkdirp')
const retry = require('retry')
const clone = require('lodash.clone')
const debug = require('debug')('agent-jones:slugrunner')

// Used for optional log shipping
const Papertrail = require('winston-papertrail').Papertrail
const noop = function () {}

const Enum = require('../Enum')
const log = require('../log')

const _log = function (message) {
  log(`slugrunner: ${message}`)
}

// The path to the slugrunner shell script
const SLUGRUNNER_PATH = path.resolve(__dirname, '../../bin/slugrunner')
// How long to wait before hard killing the slugrunner process
const SOFTSTOP_MAXWAIT = 5000

class Events extends Enum {
}
Events.initEnum('START', 'EXIT', 'RESTART')

class HerokuSlug extends EventEmitter {
  constructor (workspace, opts) {
    super()

    const options = opts || {}

    // the working directory that slugrunner will execute on
    this._workspace = workspace

    this._cleanBeforeRun = options._cleanBeforeRun !== false
    this._slugRunnerProcess = null

    this.restartCount = 0
    // Externally consumable
    this.stopped = true
    // Internal state for backing off during restarts
    this._cooldown = false
    // Hold setTimeout for back off
    this._cooldownTimeout = null

    this._logTransport = null

    this._task = null
    // Holder for our next task when we do a replace
    this._taskNext = null
  }

  start (task) {
    _log('starting')

    if (this._slugRunnerProcess) {
      _log('pre-existing process - doing nothing')
      return null
    }

    this._task = task
    this._taskNext = null
    this.stopped = false

    this.restartCount = 0

    setImmediate(() => {
      this._start()
    })
  }

  _start () {
    debug('internal start')

    // Should check for existing cool down
    // before just blindly terminating it
    this._cancelCooldown()

    // skip doing things if already running
    if (this._slugRunnerProcess) {
      _log('pre-existing process - doing nothing')
      return null
    }

    // TODO stop using sync!
    if (this._cleanBeforeRun) {
      debug('cleaning up workspace')
      rimraf.sync(this._workspace)
      mkdirp.sync(this._workspace)
    }

    const task = this._task

    const slugRunnerEnviroment = clone(task.enviroment)

    // SLUG_URL is handled (and unset) by slug runner script for grabbing tarballs
    // QUESTION: how would there not be a tarball, or what alternatives could there be? (stdin!, prexisting path)
    if (task.tarball) {
      slugRunnerEnviroment['SLUG_URL'] = task.tarball
    }

    // FIXME: this will need closing/ending when/if task changes!!
    // TODO: I should probably write a transform instead to join it all up
    if (task.config && task.config.papertrail) {
      _log('sending slugrunner process stdout to papertrail')
      this._logTransport = createPapertrailTransport(task.config.papertrail, task.app, task.name)
      this._logTransport.on('connect', msg => {
        _log(msg)
      })
      this._logTransport.on('error', err => {
        _log(`papertrail transport error:${err.message}`)
      })
    } else {
      debug('using inherited stdio for child')
    }

    // TODO: what do we want to about stdin?
    const _procOpts = {
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
    const _sendLogOnwards = line => this._logTransport.log('info', line, noop)
    // FIXME: lame stuff as stdout buffers multiple lines
    const _logLineSplit = data => data.toString().split('\n').forEach(_sendLogOnwards)

    if (this._logTransport) {
      this._slugRunnerProcess.stdout.on('data', _logLineSplit)
      this._slugRunnerProcess.stderr.on('data', _logLineSplit)
    }

    // TODO: this seems janky - do we always get the close event?
    // does this allow enough time for sending everything + buffered to PT
    // when the app crashes/atops very quickly?
    this._slugRunnerProcess.on('close', () => {
      debug('slugrunner process stdio closed')
      _log('slugrunner process stdio closed')

      if (this._logTransport) {
        _log('closing papertrail connection')
        this._logTransport.close()
      }
    })

    this._slugRunnerProcess.on('error', err => {
      _log(`Failed to spawn ${err.message}`)
      // Mostly, this will fail because cmd wasn't found in PATH, but it could
      // also fail because of insufficient mem, permissions, etc. Pass failure
      // up by faking a 127 exit status for this, similar to /bin/sh.
      this.onExit(127)
    })

    this._slugRunnerProcess.on('exit', (code, signal) => {
      debug('slugrunner process exited')
      _log('slugrunner process exited')
      this.onExit(code, signal)
    })

    // FIXME: we don't actually know when the app starts!!!
    setImmediate(() => {
      _log(`started slugrunner process, pid: ${this._slugRunnerProcess.pid}`)
      this.emit(Events.START)
    })
  }

  replace (task) {
    debug('setting next task to run')
    this._taskNext = task

    // if we are in cooldown then cancel and and skip straight to restart
    // as there is no process to kill
    if (this._cooldown) {
      this._cancelCooldown()
      this._restart()
      return
    }

    this.kill()
  }

  onExit (code, signal) {
    _log('onExit firing')

    const status = signal || code

    this._slugRunnerProcess = null
    this.emit(Events.EXIT, status)
    this._restart(status)
  }

  kill (callback) {
    debug('kill requested')

    if (!callback) {
      callback = noop
    }

    this._cancelCooldown()

    // if no process to kill silently carry on
    if (!this._slugRunnerProcess) {
      process.nextTick(callback)
      return
    }

    // This is a pretty nuclear option
    const signame = 'SIGKILL'

    try {
      this._slugRunnerProcess.kill(signame)
      this._slugRunnerProcess.once('exit', (code, signal) => {
        callback(signal || code)
      })
    } catch (err) {
      if (err.code === 'ESRCH') {
        // We got unlucky, the process is dead
        process.nextTick(callback)
        return
      }
      _log(
        `Kill process ${this._slugRunnerProcess.pid} with ${signame} failed: ${err.message}`
      )
    }
  }

  stop (callback) {
    debug('stopping')

    this._cancelCooldown()

    this.stopped = true
    this.kill(status => {
      if (callback) {
        callback(status)
      }
    })
    return
  }

  softStop (callback) {
    debug('soft stopping')

    this._cancelCooldown()

    if (!this._slugRunnerProcess) {
      process.nextTick(callback)
      return
    }

    this.stopped = true

    const signame = 'SIGTERM'

    try {
      this._slugRunnerProcess.kill(signame)
    } catch (err) {
      if (err.code === 'ESRCH') {
        // We got unlucky, the process is dead
        process.nextTick(callback)
        return
      }
      _log(
        `Kill process ${this._slugRunnerProcess.pid} with ${signame} failed: ${err.message}`
      )
    }

    const to = setTimeout(() => {
      _log('soft stop forcibly terminated')
      this.kill()
    }, SOFTSTOP_MAXWAIT)

    this._slugRunnerProcess.once('exit', status => {
      _log('soft stop successful')
      clearTimeout(to)
      return callback(status)
    })
  }

  _restart () {
    debug('internal restart')

    if (this.stopped) {
      debug('no longer running')
      return
    }

    if (this._taskNext) {
      _log('switching over tasks')
      this._task = this._taskNext
      this._taskNext = null
      this.restartCount = 0
    } else {
      this.restartCount += 1
    }

    if (this.restartCount > 0) {
      this._startCooldown()
      return
    } else {
      setImmediate(() => {
        this._start()
      })
      _log('restarting without cooldown')
      this.emit(Events.RESTART, 0, 0)
    }
  }

  _startCooldown () {
    // TODO: this would be a serious problem! contemplate crashing here!
    if (this.cooldown) {
      _log('existing cooldown already detected!! aborting creating a new one')
      return
    }

    const cooldownLength = retry.createTimeout(this.restartCount, {
      factor: 2,
      minTimeout: 1000,
      maxTimeout: 1000 * 60 * 11,
      randomize: true
    })
      // round it down to the nearest second
    const roundedCooldownLength = Math.round(cooldownLength / 1000) * 1000

    const onCooldownFinish = () => {
      _log('ending cooldown')
      this._cooldown = false
      this._cooldownTimeout = null
      this._start()
    }

    this._cooldown = true
    this._cooldownTimeout = setTimeout(onCooldownFinish, roundedCooldownLength)

    _log(`restarting (${this.restartCount}) with cooldown: ${roundedCooldownLength}`)
    this.emit(Events.RESTART, this.restartCount, cooldownLength)
  }

  _cancelCooldown () {
    if (this._cooldown) {
      debug('cancelling active cooldown')
      this._cooldown = false
      clearTimeout(this._cooldownTimeout)
      this._cooldownTimeout = null
      return true
    } else {
      debug('no cooldown active to cancel')
      return false
    }
  }
}

HerokuSlug.events = Events

module.exports = HerokuSlug

function createPapertrailTransport (papertrailUrl, appname, taskname) {
  const paptrailUrlObj = url.parse(papertrailUrl)

  const paptrail = new Papertrail({
    host: paptrailUrlObj.hostname,
    port: paptrailUrlObj.port,
    hostname: appname, // be like heroku and have the "app|system name" instead of hostname
    program: `${taskname}/${os.hostname()}`, // use the actual hostname
    logFormat (level, msg) { return msg }
  })

  return paptrail
}
