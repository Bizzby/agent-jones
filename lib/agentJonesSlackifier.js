/**
 * function to bind an agents events to outbound slack messages
 * should probably convert this to a class?
 */

var AgentJones = require('./AgentJones')

// FIXME: this is a massive hack
var taskHasher = require('./TaskWatcher').prototype._hashTask

var log = require('./log')

module.exports = function agentJonesSlackifier(agentJones, slackClient){

    var messagePrefix = agentJones.agentname + '@' + agentJones.hostname

    function _message(message){

        var options = {
            text: messagePrefix + ' :: ' + message
        }

        function onResponse(err, response) {

            if(err) {
                return log('sending slack message failed: ' + err.message)
            }

            if(response.status != 'ok') {
                log(new Error('sending slack message failed: ' + response.body))
            }
        }

        slackClient.webhook(options, onResponse)
    }

    agentJones.on(AgentJones.events.START, function(){
        _message('started')
    })

    agentJones.on(AgentJones.events.STOP, function(){
        _message('stopped')
    })

    agentJones.on(AgentJones.events.START_TASK, function(task){
        _message('started task: ' + task.app + '/' + task.name + ' [hash: ' + taskHasher(task) + ']' )
    })

    agentJones.on(AgentJones.events.STOP_TASK, function(task){
        _message('stopped task: ' + task.app + '/' + task.name + ' [hash: ' + taskHasher(task) + ']' )
    })

    agentJones.on(AgentJones.events.TASK_RESTART, function(task, numRestarts, cooldown){
        _message('restarting task: ' + task.app + '/' + task.name + ' [hash: ' + taskHasher(task) + '] (' + numRestarts + ' restarts) ('+ cooldown +' second cooldown)'  )
    })

}

