/**
 * TODO: rewrite this into machine read-able test
 */

var path = require('path')
var os = require('os')

var tarballServer = require('./mocks/tarballServer').createServer()

var Task = require('../lib/Task')
var SlugRunner = require('../lib/SlugRunner')

var workspace = path.join(os.tmpdir(), 'slugrunner-test')

// arbitary
var port = 12345

tarballServer.listen(port)

var task = new Task()

task.name = 'mock-task'
task.app = 'bash-ting'
task.command = ['echo', ': task start', '&&', 'echo', ': $$', '&&', 'sleep', '1', '&&', 'echo', ': task ended']
task.tarball = 'http://127.0.0.1:12345/app.tar.gz?somestuff=yeeaah'
task.enviroment = {FOO: 'BAR'}

var slugRunner = new SlugRunner(workspace)

slugRunner.on('start', function () {
  console.log('[TEST-SCRIPT] slugrunner start fired') // eslint-disable-line no-console
})

slugRunner.on('exit', function () {
  slugRunner.stop()
  console.log('[TEST-SCRIPT] slugrunner exit fired') // eslint-disable-line no-console
  tarballServer.close()
})

slugRunner.start(task)

console.log('[TEST-SCRIPT] some log outout should follow :-) \n[TEST-SCRIPT] it should end with "exit fired"') // eslint-disable-line no-console
