'use strict'

const spawn = require('child_process').spawn
const first = require('ee-first')

exports.unpack = function unpack (tarballPath, directoryPath, opts, callback) {
  const tarCommand = 'tar'

  // tar -xzC $HOME --strip 2
  const tarCommandArgs = [
    '-x',
    '-z',
    '-C', directoryPath,
    '--strip', 2,
    '-f', tarballPath
  ]

  const tar = spawn(tarCommand, tarCommandArgs, {stdio: ['ignore', 'ignore', 'pipe']})

  // Spool stderr into string
  let stderr = ''

  tar.stderr.on('data', function (data) {
    stderr += data.toString()
  })

  first([[tar, 'error', 'close']], onFinish)

  function onFinish (error, ee, event, args) {
    if (error) {
      return callback(new Error(`unable to unpack tarball via tar : ${error.message}`))
    }

    if (event === 'close' && args[0] !== 0) {
      return callback(new Error(`unable to unpack tarball via tar : (${args[0]}) ${stderr}`))
    }

    // TODO: for now just assume it all went ok if we get exit-code 0
    // there may some situation where curl runs fine but does download anything
    return callback()
  }
}
