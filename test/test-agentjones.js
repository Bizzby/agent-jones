var path = require('path')
var os = require('os')
var EventEmitter = require('events').EventEmitter

var clone = require('lodash.clone')

var AgentJones = require('../lib/AgentJones')
var SlugRunnerFactory = require('../lib/SlugRunnerFactory')
var Task = require('../lib/Task')
var TaskWatcher = require('../lib/TaskWatcher')

var tarballServer = require('./mocks/tarballServer').createServer()

var tarballServerPort = 12346

tarballServer.listen(tarballServerPort)


var task  =  new Task()

task.name = 'mock-task-z'
task.app = 'bash-ting'
task.command = ['echo', ': task start', '&&', 'echo', ': $FOO', '&&', 'sleep', '30', '&&', 'echo', ': task ended']
task.tarball = 'http://127.0.0.1:12346/app.tar.gz?somestuff=yeeaah'
task.enviroment = {FOO:'BAR'}
task.config = {
    //papertrail : 'syslog://logs3.papertrailapp.com:33280'
}

// Remove me


var mockTaskWatcher = new EventEmitter()
mockTaskWatcher.start = function(){
    console.log('[TASK WATCHER] started') // eslint-disable-line no-console
}
mockTaskWatcher.stop = function(){
    console.log('[TASK WATCHER] stopped') // eslint-disable-line no-console
}

setInterval(function(){
    console.log('[TASK WATCHER] emitting new task') // eslint-disable-line no-console
    mockTaskWatcher.emit(TaskWatcher.events.NEW_TASK, clone(task))
}, 5000)

var workspace = path.join(os.tmpdir(), 'agentjones-test')

var slugRunnerFactory = new SlugRunnerFactory(workspace)

var agent = new AgentJones('a', 'b', mockTaskWatcher, slugRunnerFactory)


agent.start()

// setInterval(function(){
//     task.enviroment = {FOO: Date()}
//     console.log('[TEST SCRIPT] changed an enviroment variable')
// }, 5000)
