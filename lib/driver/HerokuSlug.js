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

const async = require('async')
const rimraf = require('rimraf')
const mkdirp = require('mkdirp')
const retry = require('retry')
const clone = require('lodash.clone')
const debug = require('debug')('agent-jones:slugrunner')
const treeKill = require('tree-kill')
const Camlock = require('@sandfox/camlock')

const artifactFetcher = require('../artifactFetcher')
const tarballUnpacker = require('../tarballUnpacker')
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
const SOFTSTOP_MAXWAIT = 30 * 1000

class Events extends Enum {
}
Events.initEnum(['START', 'EXIT', 'RESTART', 'STOP'])

class States extends Enum {
}
States.initEnum(['STOPPED', 'STARTING', 'RUNNING', 'STOPPING'])

class InternalLocks extends Enum {
}
InternalLocks.initEnum(['START'])

/**
 * STATES:
 * stopped:
 *   -> [start] starting
 * starting:
 *   -> [] running
 *   -> [stop] stopped
 * running:
 *   -> [stop] stopping
 * stopping:
 *   -> [stop] (nothing)
 *   -> [] stopped
 */

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
    // Holder for [optional] logger for child process
    this._logTransport = null

    this._state = States.STOPPED

    // NOTE: We don't want to allow multiple concurrent access to the _start routine
    // because it contains async stuff which will go bang if run concurrently
    // I don't think can happen anyway but lets play it safe for now.
    this._internalLocks = new Camlock()

    this._task = null
    // Holder for our next task when we do a replace
    this._taskNext = null
  }

  start (task) {
    _log('starting')

    // TODO: we should be able to remove this check!
    if (this._slugRunnerProcess) {
      debug('pre-existing process - doing nothing')
      _log('pre-existing process - doing nothing')
      return null
    }

    if (this._state !== States.STOPPED) {
      throw new Error(`illegal state transition ${this._state} -> ${States.STARTING}`)
    }
    this._changeState(States.STARTING)

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
    // Prevent any other loop from entering this block
    const lockToken = this._internalLocks.get(InternalLocks.START)
    // Should check for existing cool down
    // before just blindly terminating it
    this._cancelCooldown()

    // TODO: this should never happen!
    if (this._slugRunnerProcess) {
      throw new Error('pre-existing slugrunner process found')
    }

    const task = this._task

    const _cleanDirs = (cb) => {
      debug('starting cleaning up workspace')
      rimraf(this._workspace, cb)
    }

    const _createDirs = (cb) => {
      debug('creating directories')
      mkdirp(path.join(this._workspace, 'app'), cb)
    }

    const _fetchTarball = (cb) => {
      debug('fetching tarball')
      artifactFetcher.get(this._workspace, task.tarball, cb)
    }

    const _unpackTarball = (cb, res) => {
      debug('unpacking tarball')
      const tarballPath = res.fetch_tarball
      const tarOpts = {
        strip: 2
      }
      tarballUnpacker.unpack(tarballPath, path.join(this._workspace, 'app'), {tar: tarOpts}, cb)
    }

    const _createStdioHandlers = (cb, res) => {
      if (task.config && task.config.papertrail) {
        this._setupSlugProcessPapertrail(task.config.papertrail, task.app, task.name, cb)
      } else {
        debug('using inherited stdio for child')
        cb()
      }
    }

    const _createRunner = (cb, res) => {
      debug('creating runner')
      const slugRunnerEnviroment = clone(task.enviroment)

      slugRunnerEnviroment['HOME'] = path.join(this._workspace, 'app')

      // TODO: what do we want to do about stdin?
      const _procOpts = {
        cwd: path.join(this._workspace, 'app'),
        env: slugRunnerEnviroment,
        stdio: (this._logTransport) ? 'pipe' : 'inherit'
      }

      this._slugRunnerProcess = this._createSlugRunnerProcess(task.command, _procOpts)
      cb() // TODO: async protects us from the affects of calling this synchronously
    }

    const _finishUp = (err, res) => {
      if (err) {
        _log(`failure during slugrunner startup: ${err.message}`)
        // TODO: for now just act like the slugrunner process failed
        // as this is the behaviour exhibited previously
        // TODO: need to differentiate between recoverable and perm failures
        setImmediate(() => {
          this._internalLocks.release(InternalLocks.START, lockToken)
          // TODO: are we breaking stuff by jumping straight into 'restart'?
          // we need seperate "restart/retry" logic for starting as opposed to
          // piggbacking on "running/retry" logic
          this._restart()
        })
        return
      }

      setImmediate(() => {
        this._internalLocks.release(InternalLocks.START, lockToken)
        debug('slugrunner process probably started')
        _log(`started slugrunner process, pid: ${this._slugRunnerProcess.pid}`)
        this._changeState(States.RUNNING)
        this.emit(Events.START)
      })
    }

    const workload = {
      clean_dirs: _cleanDirs,
      create_dirs: ['clean_dirs', _createDirs],
      create_stdio_handlers: _createStdioHandlers,
      create_runner: ['create_dirs', 'create_stdio_handlers', _createRunner]
    }

    if (task.tarball) {
      workload.fetch_tarball = ['create_dirs', _fetchTarball]
      workload.unpack_tarball = ['fetch_tarball', _unpackTarball]
      workload.create_runner.unshift('unpack_tarball')
    }

    async.auto(workload, _finishUp)
  }

  _createSlugRunnerProcess (command, processOpts) {
    const slugRunnerProc = child_process.spawn(
      SLUGRUNNER_PATH,
      command,
      processOpts
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
      slugRunnerProc.stdout.on('data', _logLineSplit)
      slugRunnerProc.stderr.on('data', _logLineSplit)
    }

    // TODO: this seems janky - do we always get the close event?
    // does this allow enough time for sending everything + buffered to PT
    // when the app crashes/atops very quickly?
    slugRunnerProc.on('close', () => {
      debug('slugrunner process stdio closed')
      _log('slugrunner process stdio closed')

      if (this._logTransport) {
        _log('closing papertrail connection')
        this._logTransport.close()
      }
    })

    slugRunnerProc.on('error', err => {
      debug('slugrunner process errored: %', err.message)
      _log(`Failed to spawn ${err.message}`)
      // Mostly, this will fail because cmd wasn't found in PATH, but it could
      // also fail because of insufficient mem, permissions, etc. Pass failure
      // up by faking a 127 exit status for this, similar to /bin/sh.
      this._onExit(127)
    })

    slugRunnerProc.on('exit', (code, signal) => {
      debug('slugrunner process exited, code %d, signal %s', code, signal)
      _log(`slugrunner process exited, code ${code}, signal ${signal}`)
      this._onExit(code, signal)
    })

    return slugRunnerProc
  }

  _setupSlugProcessPapertrail (papertrailUrl, appname, taskname, cb) {
    _log('sending slugrunner process stdout to papertrail')
    this._logTransport = createPapertrailTransport(papertrailUrl, appname, taskname)
    this._logTransport.on('connect', msg => {
      _log(msg)
      cb()
    })
    this._logTransport.on('error', err => {
      _log(`papertrail transport error:${err.message}`)
    })
  }

  // TODO: this should become an task-update method instead
  // updates/changes the task and then attempts to restart
  replace (task) {
    debug('setting next task to run')
    this._taskNext = task

    // Can only update a running task
    if (this._state !== States.RUNNING) {
      throw new Error(`replace can only be called when in state ${States.RUNNING}, current state: ${this._state}`)
    }

    // if we are in cooldown then cancel and and skip straight to restart
    // as there is no process to kill
    if (this._cooldown) {
      this._cancelCooldown()
      this._restart()
      return
    }

    this._stop()
  }

  // Call this when the child process has finished
  // so we can clean up
  _onExit (code, signal) {
    _log('onExit firing')

    const status = signal || code

    this._slugRunnerProcess = null
    this.emit(Events.EXIT, status)
    this._restart(status)
  }

  // applies the signal to the child process and all it's
  // child processes
  _kill (signal, cb) {
    // Bind the value for use later because hopefully the process
    // will be gone
    const pid = this._slugRunnerProcess.pid
    debug('starting tree kill with signal %s', signal)
    treeKill(this._slugRunnerProcess.pid, signal, (err) => {
      if (err) {
        _log(
          `Kill process tree of ${pid} with ${signal} failed: ${err.message}`
        )
      } else {
        _log(`Kill process tree of ${pid} with ${signal} finished`)
      }
      cb(err)
    })
  }

  _stop (callback) {
    debug('internal stop')

    callback = callback || noop

    if (!this._slugRunnerProcess) {
      process.nextTick(callback)
      return
    }

    this._kill('SIGTERM', noop)

    const to = setTimeout(() => {
      debug('stop timed out - initiating kill')
      _log('soft stop forcibly terminated')
      this._kill('SIGKILL', noop)
    }, SOFTSTOP_MAXWAIT)

    this._slugRunnerProcess.once('exit', status => {
      _log('stop successful')
      clearTimeout(to)
      return callback(status)
    })
  }

  stop (callback) {
    debug('soft stopping')

    if (this._state === States.STOPPING || this._state === States.STOPPED) {
      debug(`stop called called but already in state: ${this._state}`)
      return
    }

    callback = callback || noop

    this._changeState(States.STOPPING)

    this._cancelCooldown()
    this.stopped = true

    this._stop((status) => {
      this._changeState(States.STOPPED)
      callback(status)
    })
  }

  _restart () {
    debug('internal restart')

    if (this.stopped) {
      debug('no longer running')
      return
    }

    if (this._taskNext) {
      debug('switching over tasks')
      _log('switching over tasks')
      this._task = this._taskNext
      this._taskNext = null
      this.restartCount = 0
    } else {
      this.restartCount++
      debug('incremented restart count %d', this.restartCount)
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
    _log('starting cooldown')
    // TODO: this would be a serious problem! contemplate crashing here!
    if (this.cooldown) {
      _log('existing cooldown already detected!! aborting creating a new one')
      return
    }

    const cooldownLength = retry.createTimeout(this.restartCount, {
      factor: 2,
      minTimeout: 1000 * 10,
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

  // Mostly here for debugging
  _changeState (state) {
    if (state instanceof States !== true) {
      throw new TypeError(`unrecognised state supplied: ${typeof state}, ${state}`)
    }
    debug(`state transition: ${this._state} -> ${state}`)
    this._state = state
  }

  // Internal lock wrappers to enforce names and debug stuff
  _getLock (lockName) {
    if (lockName instanceof InternalLocks !== true) {
      throw new TypeError(`unrecognised lock supplied: ${typeof lockName}, ${lockName}`)
    }
    debug(`engaging lock: ${lockName}`)

    return this._internalLocks.get(lockName)
  }

  _releaseLock (lockName, token) {
    if (lockName instanceof InternalLocks !== true) {
      throw new TypeError(`unrecognised lock supplied: ${typeof lockName}, ${lockName}`)
    }
    debug(`releasing lock: ${lockName}`)

    this._internalLocks.release(lockName, token)
  }
}

HerokuSlug.events = Events
HerokuSlug.states = States

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
