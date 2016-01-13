var needle = require('needle')

var SlackClient = module.exports = function SlackClient(hookUrl){

    this._hookUrl = hookUrl
}

SlackClient.prototype.webhook = function(options, callback) {
    
    var payload = {
        channel: options.channel, //can be null/undefined
        text: options.text,
        username: options.username, // can be null/blank
        attachments: options.attachments
    }

    var requestOpts = {
        json: true
    }

    var onResponse = function(err, response, body){
        if(err) {
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

SlackClient.prototype.simpleMessage = function(message, callback) {
    
    var opts = {
        text: message
    }

    var _callback = function(err, response) {
        if(err) {
            return callback(err)
        }

        if(response.status !== 'ok') {
            return callback(new Error('response status was not "ok": ' + response.status + ', http status: ' + response.statusCode))
        }

        return callback()
    }

    this.webhook(opts, _callback)

}
