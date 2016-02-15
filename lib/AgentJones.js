'use strict'
/**
 * AgentJones co-ordinates messages for new tasks etc
 * with slugRunner
 */

const EventEmitter = require('events').EventEmitter

const debug = require('debug')('agent-jones:agent')
const async = require('async')

const Enum = require('./Enum')
const TaskWatcher = require('./TaskWatcher')
const HerokuSlugDriver = require('./driver/HerokuSlug')
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
  'TASK_RESTART', // (task model, numRestarts, cooldown time in seconds)
  'TASK_CHANGE' // (task model)
])

class AgentJones extends EventEmitter {

  constructor (agentname, hostname, taskWatcher, herokuSlugDriverFactory) {
    super()

    this.agentname = agentname
    this.hostname = hostname

    this._taskWatcher = taskWatcher
    this._herokuSlugDriverFactory = herokuSlugDriverFactory

    // Holder for slugRunner instance
    this._slugRunner = null

    this._state = States.STOPPED

    this._task = null

    // Not sure where else to this initialisation
    this._taskWatcher.on(TaskWatcher.events.NEW_TASK, this._newTaskHandler.bind(this))
    this._taskWatcher.on(TaskWatcher.events.STOP_TASK, this._noTaskHandler.bind(this))

    // Lame error logggggging - TODO: replace me with something better
    this._taskWatcher.on(TaskWatcher.events.SOFT_ERROR, err => {
      _log.verbose(`taskWatcher soft error: ${err.message}`)
    })
  }

  start () {
    if (this._state === States.RUNNING) {
      debug(`start called but already in state: ${this._state}`)
      return
    }

    this._state = States.RUNNING
    _log.info('starting agent', `${this.agentname}@${this.hostname}`)

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
    this._bumpDriver()
  }

  _noTaskHandler () {
    debug('no-task from task-watcher')

    if (this._state !== States.RUNNING) {
      return
    }

    if (this._slugRunner && this._slugRunner.stopped === false) {
      // pause getting commands from task watcher
      this._taskWatcher.stop()

      _log.info('stopping existing task')

      this._slugRunner.stop(() => {
        this.emit(Events.TASK_STOP, this._task)
        this._task = null
        // start getting commands again
        this._taskWatcher.start()
      })
      return
    }
  }

  _bumpDriver () {
    _log.info(`bumping driver for task: ${this._task.app}/${this._task.name}`)

    // pause getting commands from task watcher
    // FIXME: we should wait till the task watcher actually
    // stops or at least check the state?
    this._taskWatcher.stop(() => {
      // if no existing slugrunner - create one
      if (!this._slugRunner) {
        this._slugRunner = this._herokuSlugDriverFactory.createDriver()

        // FIXME: this was only place I could think to dump this right now
        this._slugRunner.on(HerokuSlugDriver.events.RESTART, (restartCount, coolDown) => {
          // NOTE: cooldowns are done in increments of seconds
          if (restartCount > 0) {
            this.emit(Events.TASK_RESTART, this._task, restartCount, coolDown / 1000)
          }
        })
      }

      //
      this._slugRunner.once(HerokuSlugDriver.events.START, () => {
        // restart getting commands from task watcher
        // TODO: if the app never starts again we'll get stuck here?!
        this._taskWatcher.start()
      })

      // TODO: ideally we should tear down the slugrunner if a task changes
      // but that seems inefficient at the moment
      if (this._slugRunner.stopped === true) {
        // If the slugrunner was stopped then we are starting
        this._slugRunner.once(HerokuSlugDriver.events.START, () => {
          this.emit(Events.TASK_START, this._task)
        })
        this._slugRunner.start(this._task)
      } else if (this._slugRunner.stopped === false) {
        // If the slugrunner was already running then we are just changing tasks
        // TODO: this doesn't really account for changing which task we are running vs
        // changing the contents of that task
        this._slugRunner.once(HerokuSlugDriver.events.START, () => {
          this.emit(Events.TASK_CHANGE, this._task)
        })
        this._slugRunner.replace(this._task)
      }
    })
  }

  stop (callback) {
    _log.info('stopping agent')

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

    const tw_shutdown = cb => {
      if (this._taskWatcher._state !== TaskWatcher.states.STOPPED) {
        this._taskWatcher.stop(cb)
      } else {
        cb()
      }
    }

    const sr_shutdown = cb => {
      if (this._slugRunner && this._slugRunner.stopped === false) {
        this._slugRunner.stop(() => {
          this.emit(Events.TASK_STOP, this._task)
          this._task = null
          // Just to make events order nicely over the network
          setImmediate(cb)
        })
      } else {
        cb()
      }
    }

    setImmediate(() => {
      async.parallel({
        tw: tw_shutdown,
        sr: sr_shutdown
      }, err => {
        if (err) {
          _log.warn(`error while stopping ${err.message}`)
        }
        // TODO: should we return an error here?
        this._state === States.STOPPED
        this._stopped()
      })
    })
  }

  _stopped () {
    _log.info('stopped agent', `${this.agentname}@${this.hostname}`)
    this.emit(Events.STOP)
  }
}

AgentJones.events = Events
AgentJones.states = States

module.exports = AgentJones
