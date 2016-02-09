/**
 * simple thing to fetch artifacts from urls
 */

var needle = require('needle')
var path = require('path')
var url = require('url')

const pkg = require('../package')

exports.get = function get (destDir, source, callback) {
    // TODO: try catch this
  var u = url.parse(source)

  var artifactFile = path.join(destDir, path.basename(u.pathname))

  const requestOptions = {
    follow: 10,
    headers: {
      'User-Agent': `AgentJones/${pkg.version} (node ${process.version})`
    },
    output: artifactFile
  }

  needle.get(source, requestOptions, function (err, resp, body) {
    if (err) {
      return callback(new Error(`unable to fetch artifact: ${err.message}`))
    }

    if (resp.statusCode === 200) {
      return callback(null, artifactFile)
    }

        // TODO: enable body printing for debugging somehow
    callback(new Error(`unable to fetch artifact, statusCode ${resp.statusCode}`))
  })
}
