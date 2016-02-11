'use strict'
/**
 * simple thing to fetch artifacts from urls via curl
 * Uses curl because previous code exploded the in-use
 * memory
 */

const spawn = require('child_process').spawn
const path = require('path')
const url = require('url')

const first = require('ee-first')

const pkg = require('../package')

exports.get = function get (destDir, source, callback) {
  // TODO: try catch this
  // NOTE: this depends on the source
  const u = url.parse(source)
  const artifactFile = path.join(destDir, path.basename(u.pathname))

  // TODO: we should bodge in curl version too somehow
  const userAgent = `AgentJones/${pkg.version} (node ${process.version})`

  const curlCommand = 'curl'

  const curlCommandArgs = [
    '-s', // silent
    '-S', // show errors
    '-L', // follow redirects
    '-f', // make failures return exit code 22
    '--max-redirs', 10, // Limit the number of redirects followed
    '-A', `"${userAgent}"`, // Set the useragent
    '-w', '%{http_code}', // write out some info (status code) to stdout
    '-o', artifactFile, // download to this file..
    source // where we are getting it from
  ]

  const curl = spawn(curlCommand, curlCommandArgs, {stdio: ['ignore', 'pipe', 'pipe']})

  // Spool stderr into string
  let stderr = ''
  let stdout = ''

  curl.stderr.on('data', function (data) {
    stderr += data.toString()
  })
  curl.stdout.on('data', function (data) {
    stdout += data.toString()
  })

  first([[curl, 'error', 'close']], onFinish)

  function onFinish (error, ee, event, args) {
    // LOL - mutation
    stdout = stdout.trim()
    stderr = stderr.trim()

    if (error) {
      return callback(new Error(`unable to fetch artifact via curl : ${error.message}`))
    }

    if (event === 'close' && args[0] === 22) {
      return callback(new Error(`unable to fetch artifact via curl : http status code (${stdout})`))
    }

    if (event === 'close' && args[0] !== 0 && args[0] !== 22) {
      return callback(new Error(`unable to fetch artifact via curl : exit code (${stdout}) ${stderr}`))
    }

    if (event === 'close' && stdout !== '200') {
      return callback(new Error(`unable to fetch artifact via curl : http status code (${stdout})`))
    }

    return callback(null, artifactFile)
  }
}
