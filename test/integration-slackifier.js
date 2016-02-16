
var EventEmitter = require('events').EventEmitter
var SlackClient = require('../lib/SlackClient')
var AgentJones = require('../lib/AgentJones')
var Task = require('../lib/Task')
var agentJonesSlackifier = require('../lib/agentJonesSlackifier')
var webhookUrl = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXX'

var client = new SlackClient(webhookUrl)

var agent = new EventEmitter()
agent.agentname = 'elephant'
agent.hostname = 'sandfox-mbp'

var task = new Task()

task.meta.version = 'fe5ab1664ef9398b8ae70fdcc2c0f3de34d315dd'
task.name = 'launch'
task.app = 'Saturn 5'

agentJonesSlackifier(agent, client)

/**
 * Send a serious of messages to slack
 */

setTimeout(function () {
  agent.emit(AgentJones.events.START)
}, 500)

setTimeout(function () {
  agent.emit(AgentJones.events.TASK_START, task)
}, 1000)

setTimeout(function () {
  agent.emit(AgentJones.events.TASK_RESTART, task, 1, 3)
}, 1500)

setTimeout(function () {
  agent.emit(AgentJones.events.TASK_RESTART, task, 2, 10)
}, 2000)

setTimeout(function () {
  agent.emit(AgentJones.events.TASK_STOP, task, 2, 10)
}, 2500)

setTimeout(function () {
  agent.emit(AgentJones.events.STOP)
}, 3000)
