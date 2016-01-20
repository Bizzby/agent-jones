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
  const agentIdent = `${agentJones.agentname}@${agentJones.hostname.split('.')[0]}`

  function _message (colour, message, fields, fallback) {
    const options = {
      text: '',
      attachments: [
        {
          color: colour,
          author_name: agentIdent,
          text: message,
          fields: fields,
          fallback: fallback
        }
      ]
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
    _message('good', 'agent started running')
  })

  agentJones.on(AgentJones.events.STOP, () => {
    _message('danger', 'agent stopped running')
  })

  agentJones.on(AgentJones.events.TASK_START, task => {
    // HACK: remove this ASAP
    const fields = []
    fields.push({title: 'app/task', value: `${task.app}/${task.name}`})
    fields.push(getVersionField(task))
    fields.push(getHashField(task))

    const version = (task.meta && task.meta.version) ? task.meta.version : 'unknown'
    const fallback = `started task ${task.app}/${task.name} [v: ${version}] [hash: ${taskHasher(task)}]`

    _message('good', 'task started', fields, fallback)
  })

  agentJones.on(AgentJones.events.TASK_STOP, task => {
    // HACK: remove this ASAP
    const fields = []
    fields.push({title: 'app/task', value: `${task.app}/${task.name}`})
    fields.push(getVersionField(task))
    fields.push(getHashField(task))

    const version = (task.meta && task.meta.version) ? task.meta.version : 'unknown'
    const fallback = `stopped task ${task.app}/${task.name} [v: ${version}] [hash: ${taskHasher(task)}]`

    _message('danger', 'task stopped', fields, fallback)
  })

  agentJones.on(AgentJones.events.TASK_RESTART, (task, numRestarts, cooldown) => {
    // HACK: remove this ASAP
    const fields = []
    fields.push({title: 'app/task', value: `${task.app}/${task.name}`})
    fields.push({title: 'restarts', value: numRestarts, short: true})
    fields.push({title: 'cooldown', value: `${cooldown} secs`, short: true})
    fields.push(getVersionField(task))
    fields.push(getHashField(task))

    const version = (task.meta && task.meta.version) ? task.meta.version : 'unknown'
    const fallback = `restarting task ${task.app}/${task.name} [v: ${version}] [hash: ${taskHasher(task)}] (${numRestarts} restarts) (${cooldown} second cooldown)`
    _message('warning', 'task restarting', fields, fallback)
  })
}

function getVersionField (task) {
  return {
    title: 'version',
    value: (task.meta && task.meta.version) ? task.meta.version : 'unknown'
  }
}

function getHashField (task) {
  return {
    title: 'task hash',
    value: taskHasher(task)
  }
}
