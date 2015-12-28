var path = require('path')
var os = require('os')

var clone = require('lodash.clone')

var AgentJones = require('../lib/AgentJones')
var SlugRunnerFactory = require('../lib/SlugRunnerFactory')
var Task = require('../lib/Task')

var tarballServer = require('./mocks/tarballServer').createServer()

var tarballServerPort = 12346

tarballServer.listen(tarballServerPort)

var sendTask = true // used for testing no task

var task  =  new Task()
task.command = ['echo', '%% task start', '&&', 'echo', '%% $FOO', '&&', 'sleep', '32', '&&', 'echo', '%% task ended']
task.tarball = 'http://127.0.0.1:12346/app.tar.gz?somestuff=yeeaah'
task.enviroment = {FOO:'BAR'}


var mockTaskFetcher = {
    getTask: function(agentname, nodename, callback){
        console.log('[MOCK TASK FETCHER] task fetched', sendTask) // eslint-disable-line no-console
        setImmediate(function(){
            if(sendTask) {
                callback(null, clone(task))
            } else {
                callback(null, null)
            }
        })
    }
}

var workspace = path.join(os.tmpdir(), 'agentjones-test')

var slugRunnerFactory = new SlugRunnerFactory(workspace)

var agent = new AgentJones('a', 'b', mockTaskFetcher, slugRunnerFactory)


agent.start()

// setInterval(function(){
//     task.enviroment = {FOO: Date()}
//     console.log('[TEST SCRIPT] changed an enviroment variable')
// }, 5000)

setInterval(function(){
    sendTask = sendTask ? false : true
    console.log('[TEST SCRIPT] switched sendtask to ' + sendTask) // eslint-disable-line no-console
}, 8000)