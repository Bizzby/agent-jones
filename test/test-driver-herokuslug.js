/**
 * TODO: rewrite this into machine read-able test
 */

var path = require('path')
var os = require('os')

var tarballServer = require('./mocks/tarballServer').createServer()
var taskFactory = require('./utils/taskFactory')
var SlugRunner = require('../lib/Driver/HerokuSlug')

var workspace = path.join(os.tmpdir(), 'herokuslug-driver-test')

// arbitary
var port = 12345

tarballServer.listen(port)

var task = taskFactory()

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

setTimeout(function () {
  slugRunner.stop()
}, 50000)

console.log('[TEST-SCRIPT] some log outout should follow :-) \n[TEST-SCRIPT] it should end with "exit fired"') // eslint-disable-line no-console
