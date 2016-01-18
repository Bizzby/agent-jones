'use strict'

const needle = require('needle')

class SlackClient {
  constructor (hookUrl) {
    this._hookUrl = hookUrl
  }

  webhook (options, callback) {
    const payload = {
      channel: options.channel, // can be null/undefined
      text: options.text,
      username: options.username, // can be null/blank
      attachments: options.attachments
    }

    const requestOpts = {
      json: true
    }

    const onResponse = function (err, response, body) {
      if (err) {
        return callback(err)
      }

      return callback(null, {
        status: body !== 'ok' ? 'fail' : 'ok',
        body: body,
        statusCode: response.statusCode,
        headers: response.headers
      })
    }

    needle.post(this._hookUrl, payload, requestOpts, onResponse)

  }

  simpleMessage (message, callback) {
    const opts = {
      text: message
    }

    const _callback = function (err, response) {
      if (err) {
        return callback(err)
      }

      if (response.status !== 'ok') {
        return callback(new Error(`response status was not "ok": ${response.status}, http status: ${response.statusCode}`))
      }

      return callback()
    }

    this.webhook(opts, _callback)

  }
}

module.exports = SlackClient
