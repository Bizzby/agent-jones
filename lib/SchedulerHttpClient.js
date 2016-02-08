'use strict'

/**
 * Basic class for fetching a task from the/a scheduler
 * TODO: this exposes lots of HTTP related stuff users
 */

const needle = require('needle')
const debug = require('debug')('agent-jones:scheduler-http-client')

const pkg = require('../package')

class SchedulerHttpClient {
  constructor (schedulerEndpoint, authToken) {
    // TODO validate this
    this.schedulerEndpoint = schedulerEndpoint
    // TODO auth stuff
    if (authToken) {
      this._authToken = authToken
    }
  }

  getTask (agentname, nodename, opts, callback) {
    debug('assembling request')

    if (typeof opts === 'function') {
      callback = opts
      opts = {}
    }

    const requestOptions = {
      compressed: true,
      headers: {
        'User-Agent': `AgentJones/${pkg.version} (node ${process.version})`
      }
    }

    if (this._authToken) {
      debug('using auth')
      requestOptions.headers['Authorization'] = `Bearer ${this._authToken}`
    }

    // NOTE: etag should be supplied as as as string with qoutes in the string
    if (opts.etag) {
      debug(`using etag: ${opts.etag}`)
      requestOptions.headers['If-None-Match'] = opts.etag
    }

    const url = `${this.schedulerEndpoint}/v1/tasks?agent=${agentname}&node=${nodename}`

    needle.get(url, requestOptions, callback)
  }
}

module.exports = SchedulerHttpClient
