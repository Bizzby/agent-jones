'use strict'

const fs = require('fs')
const tar = require('tar-fs')
const gunzip = require('gunzip-maybe')
const first = require('ee-first')

exports.unpack = function unpack (tarballPath, directoryPath, opts, callback) {
  const tarballStream = fs.createReadStream(tarballPath)
  const gunzipStream = gunzip()
  const untarStream = tar.extract(directoryPath, opts.tar)

  function _handleError (err, emitter, event) {
    if (err) {
      callback(err)
      return
    }
    callback()
  }

    // Trap the first error/complete condition
  first([
        [tarballStream, 'error'],
        [gunzipStream, 'error'],
        [untarStream, 'end', 'finish', 'error']
  ], _handleError)

    // Pipe it up
  tarballStream.pipe(gunzipStream).pipe(untarStream)

    // TODO: return something that makes this cancellable?
}
