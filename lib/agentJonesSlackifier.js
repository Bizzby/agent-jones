'use strict'

/**
 * function to bind an agents events to outbound slack messages
 * should probably convert this to a class?
 */
const path = require('path')
const url = require('url')

const AgentJones = require('./AgentJones')
const taskHasher = require('./taskHasher')

const log = require('./log')

module.exports = function agentJonesSlackifier (agentJones, slackClient) {
  // FIXME: this does not live here - quick hack to shorten hostnames to something nice
  const agentIdent = `${agentJones.agentname}@${agentJones.hostname.split('.')[0]}`

  function _message (colour, title, messageLines, fallback) {
    const options = {
      text: '',
      attachments: [
        {
          color: colour,
          author_name: agentIdent,
          title: title,
          text: messageLines.join('\n'),
          fallback: fallback,
          mrkdwn_in: ['text']
        }
      ]
    }

    function onResponse (err, response) {
      if (err) {
        return log.warn(`sending slack message failed: ${err.message}`)
      }

      if (response.status !== 'ok') {
        log.warn(new Error(`sending slack message failed: ${response.body}`))
      }
    }
    slackClient.webhook(options, onResponse)
  }

  agentJones.on(AgentJones.events.START, () => {
    _message('good', 'agent started running', [], 'agent started running')
  })

  agentJones.on(AgentJones.events.STOP, () => {
    _message('danger', 'agent stopped running', [], 'agent stopped running')
  })

  agentJones.on(AgentJones.events.TASK_START, task => {
    // HACK: remove this ASAP
    const lines = []
    lines.push(`*app:* ${task.app}`)
    lines.push(`*task:* ${task.name}`)
    lines.push(getVersionLine(task))
    lines.push(getHashLine(task))

    const version = (task.meta && task.meta.version) ? task.meta.version : 'unknown'
    const fallback = `started task ${task.app}/${task.name} [v: ${version}] [hash: ${taskHasher(task)}]`

    _message('good', 'task started', lines, fallback)
  })

  agentJones.on(AgentJones.events.TASK_STOP, task => {
    // HACK: remove this ASAP
    const lines = ['task stopped']
    lines.push(`*app:* ${task.app}`)
    lines.push(`*task:* ${task.name}`)
    lines.push(getVersionLine(task))
    lines.push(getHashLine(task))

    const version = (task.meta && task.meta.version) ? task.meta.version : 'unknown'
    const fallback = `stopped task ${task.app}/${task.name} [v: ${version}] [hash: ${taskHasher(task)}]`

    _message('danger', 'task stopped', lines, fallback)
  })

  agentJones.on(AgentJones.events.TASK_CHANGE, task => {
    // HACK: remove this ASAP
    const lines = []
    lines.push(`*app:* ${task.app}`)
    lines.push(`*task:* ${task.name}`)
    lines.push(getVersionLine(task))
    lines.push(getHashLine(task))

    const version = (task.meta && task.meta.version) ? task.meta.version : 'unknown'
    const fallback = `changed task ${task.app}/${task.name} [v: ${version}] [hash: ${taskHasher(task)}]`

    _message('good', 'task changed', lines, fallback)
  })

  agentJones.on(AgentJones.events.TASK_RESTART, (task, numRestarts, cooldown) => {
    // HACK: remove this ASAP
    const lines = []
    lines.push(`*app:* ${task.app}`)
    lines.push(`*task:* ${task.name}`)
    lines.push(`*restarts:* ${numRestarts}`)
    lines.push(`*cooldown:* ${cooldown} _secs_`)
    lines.push(getVersionLine(task))
    lines.push(getHashLine(task))

    const version = (task.meta && task.meta.version) ? task.meta.version : 'unknown'
    const fallback = `restarting task ${task.app}/${task.name} [v: ${version}] [hash: ${taskHasher(task)}] (${numRestarts} restarts) (${cooldown} second cooldown)`
    _message('warning', 'task restarting', lines, fallback)
  })
}

function getVersionLine (task) {
  // NOTE: we fallback to the tarball filename as a version
  // this is poop but better than nothing for now
  const fallback = (task.meta && task.meta.version) ? task.meta.version : 'unknown'
  let version = ''

  try {
    version = path.basename(url.parse(task.tarball).pathname, '.tar.gz')
  } catch (e) {
    version = fallback
  }

  return `*version:* ${version}`
}

function getHashLine (task) {
  return `*task hask:* ${taskHasher(task)}`
}
