const tap = require('tap')

const taskHasher = require('../lib/taskHasher')
const Task = require('../lib/Task')

tap.test('taskHasher should return a string', function (t) {
  const myTask = new Task()
  const hash = taskHasher(myTask)

  t.ok(typeof hash === 'string')

  t.end()
})

tap.test('taskHasher should return same hash regardless of tarball query string', function (t) {
  const myTask = new Task()

  myTask.tarball = 'http://example.com/file?sig=1234'
  const hashA = taskHasher(myTask)

  myTask.tarball = 'http://example.com/file?sig=1234e32r'
  const hashB = taskHasher(myTask)

  myTask.tarball = 'http://example.com/file?sig=1234e32r'
  const hashC = taskHasher(myTask)

  t.ok(hashA === hashB)
  t.ok(hashB === hashC)

  t.end()
})
