const crypto = require('crypto')

const HASH_ALGO = 'sha1'
const HASH_ENCODING = 'hex'

const url = require('url')
const path = require('path')

/**
 * List of keys that are used for creating the task hash
 * @type {Array}
 */
const hashKeys = [
  'command',
  'tarball',
  'enviroment',
  'config',
  'meta'
]

/**
 * dictionary of any transform to apply to any hash keys before hashing
 * the object
 * @type {Object}
 */
const transforms = {
  'tarball': stripTarballUrl
}

module.exports = function hash (taskModel) {
  const hash = crypto.createHash(HASH_ALGO)

  const thingToHash = hashKeys.reduce(function (o, key) {
    if (taskModel[key] && transforms[key]) {
      o[key] = transforms[key](taskModel[key])
    } else if (taskModel[key]) {
      o[key] = taskModel[key]
    }
    return o
  }, {})
  // FIXME: this includes tarball which can change!
  hash.update(JSON.stringify(thingToHash), 'utf8')
  return hash.digest(HASH_ENCODING)
}

/**
 * Strips off query params + protocol - we use this to make working with signed
 * S3 tarballs less painful
 * NOTE: this assumes we are using vaguely content-addressable paths
 * which is pretty silly and won't be true one day.
 * @param  {[type]} url [description]
 * @return {[type]}     [description]
 */
function stripTarballUrl (tarballUrl) {
  const u = url.parse(tarballUrl)
  const strippedUrl = path.join(u.hostname, u.pathname)

  return strippedUrl
}
