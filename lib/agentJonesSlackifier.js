'use strict'

/**
 * function to bind an agents events to outbound slack messages
 * should probably convert this to a class?
 */

const AgentJones = require('./AgentJones')

// FIXME: this is a massive hack
const taskHasher = require('./TaskWatcher').prototype._hashTask

const log = require('./log')

module.exports = function agentJonesSlackifier (agentJones, slackClient) {
  // FIXME: this does not live here - quick hack to shorten hostnames to something nice
  const messagePrefix = `${agentJones.agentname}@${agentJones.hostname.split('.')[0]}`

  function _message (message) {
    const options = {
      text: `${messagePrefix} ${message}`
    }

    function onResponse (err, response) {
      if (err) {
        return log(`sending slack message failed: ${err.message}`)
      }

      if (response.status !== 'ok') {
        log(new Error(`sending slack message failed: ${response.body}`))
      }
    }

    slackClient.webhook(options, onResponse)
  }

  agentJones.on(AgentJones.events.START, () => {
    _message('started')
  })

  agentJones.on(AgentJones.events.STOP, () => {
    _message('stopped')
  })

  agentJones.on(AgentJones.events.TASK_START, task => {
    _message(`started task: ${task.app}/${task.name} [hash: ${taskHasher(task)}]`)
  })

  agentJones.on(AgentJones.events.TASK_STOP, task => {
    _message(`stopped task: ${task.app}/${task.name} [hash: ${taskHasher(task)}]`)
  })

  agentJones.on(AgentJones.events.TASK_RESTART, (task, numRestarts, cooldown) => {
    _message(
      `restarting task: ${task.app}/${task.name} [hash: ${taskHasher(task)}] (${numRestarts} restarts) (${cooldown} second cooldown)`
    )
  })

}
