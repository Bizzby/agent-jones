var pkg = require('../package')

module.exports = function log(){

    var args = new Array(arguments.length + 1)
    args[0] = logPrefix()
    for(var i = 1; i < args.length; ++i) {
        args[i] = arguments[i-1]
    }
    console.log.apply(console, args) // eslint-disable-line no-console
}

function logPrefix(){
    var ts = new Date().toISOString()
    var prefix = ts + ' AGENT-JONES [' + pkg.version + ']' + ' PID:'+process.pid + ' ::'
    return prefix
}