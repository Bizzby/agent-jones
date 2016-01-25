var Task = require('../../lib/Task')

module.exports = function create (opts) {
  opts = opts || {}
  const task = new Task()

  task.name = opts.name || 'mock-task'
  task.app = opts.app || 'bash-ting'
  task.command = opts.command || ['echo', ': task start', '&&', 'echo', ':PID $$', '&&', 'sleep', '60', '&&', 'echo', ': task ended']
  task.tarball = opts.tarball || 'http://127.0.0.1:12345/app.tar.gz?somestuff=yeeaah'
  task.enviroment = opts.enviroment || {FOO: 'BAR'}
    task.meta = opts.meta || {
      version: 'this-is-a-test-task-version'
    }
  return task
}
