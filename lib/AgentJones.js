'use strict'
/**
 * AgentJones co-ordinates messages for new tasks etc
 * with slugRunner
 */

const EventEmitter = require('events').EventEmitter

const debug = require('debug')('agent-jones')
const async = require('async')

const Enum = require('./Enum')
const TaskWatcher = require('./TaskWatcher')
const SlugRunner = require('./SlugRunner')
const _log = require('./log')

class States extends Enum {
}
States.initEnum(['STOPPED', 'RUNNING', 'STOPPING'])

class Events extends Enum {
}
Events.initEnum([
  'START',
  'STOP',
  'TASK_START', // (task model)
  'TASK_STOP', // (task model)
  'TASK_RESTART' // (task model, numRestarts, cooldown time)
])

class AgentJones extends EventEmitter {

  constructor (agentname, hostname, taskWatcher, slugRunnerFactory) {
    super()

    this.agentname = agentname
    this.hostname = hostname

    this._taskWatcher = taskWatcher
    this._slugRunnerFactory = slugRunnerFactory

    // Holder for slugRunner instance
    this._slugRunner = null

    this._state = States.STOPPED

    this._task = null

    // Not sure where else to this initialisation
    this._taskWatcher.on(TaskWatcher.events.NEW_TASK, this._newTaskHandler.bind(this))
    this._taskWatcher.on(TaskWatcher.events.STOP_TASK, this._noTaskHandler.bind(this))

    // Lame error logggggging - TODO: replace me with something better
    this._taskWatcher.on(TaskWatcher.events.SOFT_ERROR, err => {
      _log(`taskWatcher soft error: ${err.message}`)
    })
  }

  start () {
    if (this._state === States.RUNNING) {
      debug(`start called but already in state: ${this._state}`)
      return
    }

    this._state = States.RUNNING
    _log('starting agent', `${this.agentname}@${this.hostname}`)

    this._taskWatcher.start()
    this.emit(Events.START)
  }

  _newTaskHandler (task) {
    debug('new task recieved')

    if (this._state !== States.RUNNING) {
      return
    }

    this._task = task
    // TODO: maybe merge this and function underneath together
    this._bumpSlugRunner()
  }

  _noTaskHandler () {
    debug('no-task from task-watcher')

    if (this._state !== States.RUNNING) {
      return
    }

    if (this._slugRunner && this._slugRunner.stopped === false) {
      // pause getting commands from task watcher
      this._taskWatcher.stop()

      _log('stopping existing task')
      this._slugRunner.softStop(() => {
        this.emit(Events.STOP_TASK, this._task)
        this._task = null
        // start getting commands again
        this._taskWatcher.start()
      })
      return
    }
  }

  _bumpSlugRunner () {
    _log('bumping slugrunner for new task')

    // pause getting commands from task watcher
    // FIXME: we should wait till the task watcher actually
    // stops or at least check the state?
    this._taskWatcher.stop(() => {

      // if no existing slugrunner - create one
      if (!this._slugRunner) {
        this._slugRunner = this._slugRunnerFactory.createSlugRunner()

        // FIXME: this was only place I could think to dump this right now
        this._slugRunner.on(SlugRunner.events.RESTART, (restartCount, coolDown) => {
          // NOTE: we filter out and round numbers here for niceness reasons
          if (restartCount > 0) {
            this.emit(Events.TASK_RESTART, this._task, restartCount, Math.ceil(coolDown / 1000))
          }
        })
      }

      //
      this._slugRunner.once('start', () => {
        this.emit(Events.TASK_START, this._task)
        // restart getting commands from task watcher
        // TODO: if the app never starts again we'll get stuck here?!
        this._taskWatcher.start()
      })

      // TODO: ideally we should tear down the slugrunner if a task changes
      // but that seems inefficient at the moment
      if (this._slugRunner.stopped === true) {
        this._slugRunner.start(this._task)
      } else if (this._slugRunner.stopped === false) {
        this._slugRunner.replace(this._task)
      }
    })
  }

  stop (callback) {
    _log('stopping agent')

    debug('stop called')

    if (this._state === States.STOPPED) {
      debug(`stop called but already in state: ${this._state}`)
      return
    }

    if (callback) {
      this.once(Events.STOP, callback)
    }

    if (this._state === States.STOPPING) {
      debug(`stop called but already in state: ${this._state}`)
      return
    }

    this._state = States.STOPPING
    debug(`setting state to: ${this._state}`)

    setImmediate(() => {
      async.parallel({
        tw (cb) {
          if (this._taskWatcher._state !== TaskWatcher.states.STOPPED) {
            this._taskWatcher.stop(cb)
          } else {
            cb()
          }

        },
        sr (cb) {
          if (this._slugRunner && this._slugRunner.stopped === false) {
            this._slugRunner.softStop(cb)
          } else {
            cb()
          }
        }
      }, err => {
        if (err) {
          _log(`error while stopping ${err.message}`)
        }
        // TODO: should we return an error here?
        this._state === States.STOPPED
        this._stopped()
      })
    })
  }

  _stopped () {
    _log('stopped agent', `${this.agentname}@${this.hostname}`)
    this.emit(Events.STOP)
  }
}

AgentJones.events = Events
AgentJones.states = States

module.exports = AgentJones
