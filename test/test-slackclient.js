var SlackClient = require('../lib/SlackClient')

var webhookUrl = 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXX' // Insert one here

var message = 'This message should appear in slack, if it does then a test has been run'

var client = new SlackClient(webhookUrl)

client.simpleMessage(message, function(err){
    if(err) {
        console.log(err) // eslint-disable-line no-console
    } else {
        console.log('message sent ok') // eslint-disable-line no-console
    }
})