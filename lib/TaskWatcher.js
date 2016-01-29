'use strict'

/**
 * Class for handling getting new tasks from the scheduler server
 */

const crypto = require('crypto')
const EventEmitter = require('events').EventEmitter
const debug = require('debug')('agent-jones:task-watcher')

const Enum = require('./Enum')
const Task = require('./Task')

class Events extends Enum {
}
Events.initEnum(['NEW_TASK', 'STOP_TASK, ERROR', 'SOFT_ERROR', 'START', 'STOP'])

class States extends Enum {
}
States.initEnum(['STOPPED', 'STOPPING', 'RUNNING', 'STARTING'])

// Time between polls FIXME: should be configable
const DEFAULT_LOOP = 60 * 1000

class TaskWatcher extends EventEmitter {
  constructor (agentname, nodename, schedulerClient) {
    super()

    /**
     * very high level / basic state flag
     */
    this._state = States.STOPPED

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
    this._taskHash // fallback taskHash for change detection
  }

  start () {
    if (this._state === States.RUNNING || this._state === States.STARTING) {
      debug(`start called but already in state: ${this._state}`)
      return
    }

    if (this._state === States.STOPPING) {
      debug(`start called but currently in state: ${this._state}`)
      // FIXME: this state should throw!
      return
    }

    this._state = States.STARTING

    debug(`start called - setting state to: ${this._state}`)

    // if we already doing stuff no need to kick off
    // run loop
    // TODO: can we remove this now that we have STARTING/STOPPING STATES
    if (this._pollTimeout || this._requestLock || this._kickStart || this._kickStop) {
      debug('starting but request/polltimeout/kickstart/kickstio already in progress')
      return
    }

    this._kickStart = setImmediate(() => {
      debug('starting run loop')
      this._state = States.RUNNING
      debug(`setting state to: ${this._state}`)
      // TODO: should the emit go after?
      this.emit(Events.START)
      this._run()
    })
  }

  stop (callback) {
    debug('stop called')

    if (this._state === States.STOPPED) {
      debug(`stop called but already in state: ${this._state}`)
      return
    }

    // TODO: should we allow users to queue up multiple
    // callbacks for the same stop event?
    if (callback) {
      this.once(Events.STOP, callback)
    }

    if (this._state === States.STOPPING) {
      debug(`stop called but already in state: ${this._state}`)
      return
    }

    this._state = States.STOPPING
    debug(`setting state to: ${this._state}`)

    if (this._requestLock) {
      debug('requestLock active - deferring tidy up to onRequest')
      // do nothing and wait for existing request to finish
      // it will tidy up for us
      return
    }

    debug('setting up "stop tidy up" for setImmediate')
    // use setImmediate to maintain async consistency
    setImmediate(() => {
      // else we cancel the timeout
      // and call stop ourselves
      // TODO: should we move this into a seperate method/_stopped?
      this._state = States.STOPPED
      debug(`setting state to: ${this._state}`)
      debug('clearing internal timeouts')
      clearTimeout(this._pollTimeout)
      this._pollTimeout = null
      clearImmediate(this._kickStart)
      this._kickStart = null
      this._stopped()
    })
  }

  _run () {
    debug('entering run loop')
    // clear the timeout/setImmediate handle
    this._pollTimeout = null
    this._kickStart = null

    // We expect async entry to this func so check is state changed
    // while we were away
    if (this._state !== States.RUNNING) {
      (`exiting run loop early as state is: ${this._state}`)
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
      {etag: this._etag},
      this._taskResponseHandler.bind(this)
    )
  }

  _taskResponseHandler (err, response, task) {
    // unlock internal state
    debug('unsetting request lock')
    this._requestLock = false

    // check we are still running - if not then bail
    // stop may have been called and there for a stop is queud up
    if (this._state !== States.RUNNING) {
      debug(`exiting onResponse early as state is: ${this._state}`)
      this._stopped()
      return
    }

    // trigger next run in preperation - wish we had defer
    this._runAgain()

    // fundamental error like ECONN
    // TODO: should we deal with some errors here instead of just bailing?
    // FIXME: some errors here will be unrecoverable!
    if (err) {
      debug('error making request')
      return this._softError(err)
    }

    debug(`response received, status: ${response.statusCode}`)

    if (response.statusCode === 200) {
      debug('task received')
      // TODO: should we always update the etag?
      this._etag = response.headers['etag']
      let _task = this._deserialiseTask(task)
      let _taskHash = this._hashTask(_task)

      if (_taskHash !== this._taskHash) {
        this._task = _task
        this._taskHash = _taskHash
        return this._receivedTask()
      }

      debug('task hash did not change - ignoring new task')
      return
    }

    // no change from current task
    if (response.statusCode === 304) {
      debug('task not changed')
      return
    }

    // no task - this is ok
    // TODO: should probably check it's the 404 we're expecting...
    if (response.statusCode === 404) {
      debug('no task received')
      this._etag = null
      this._task = null
      return this._noTask()
    }

    // auth is wrong/missing
    // FIXME: this is probably pretttty fatal?
    if (response.statusCode === 401) {
      debug('auth failure')
      return this._softError(new Error('could not authenticate with the scheduler'))
    }

    // wierd stuff happened
    // lets assume it's nothing super bad :-)
    debug('unexpected http response')
    const _error = new Error('unhandled HTTP status')
    _error.statusCode = response.statusCode

    return this._softError(_error)
  }

  _runAgain () {
    debug('setting runAgain timeout')

    this._pollTimeout = setTimeout(() => {
      this._run()
    }, DEFAULT_LOOP)
  }

  _receivedTask () {
    this.emit(Events.NEW_TASK, this._task)
  }

  _noTask () {
    this.emit(Events.STOP_TASK)
  }

  _softError (err) {
    this.emit(Events.SOFT_ERROR, err)
  }

  _error (err) {
    this.emit(Events.ERROR, err)
  }

  _stopped () {
    this.emit(Events.STOP)
  }

  _hashTask (taskModel) {
    const hash = crypto.createHash('sha1')
    hash.update(JSON.stringify(taskModel), 'utf8')
    return hash.digest('hex')
  }

  _deserialiseTask (rawTask) {
    debug('deserialising task')

    const taskModel = new Task()

    Object.keys(taskModel).reduce(copyKey, taskModel)

    return taskModel

    function copyKey (task, key) {
      if (rawTask[key]) {
        task[key] = rawTask[key]
      }
      return task
    }
  }
}

module.exports = TaskWatcher

// Be nice to consumers
TaskWatcher.states = States
TaskWatcher.events = Events
