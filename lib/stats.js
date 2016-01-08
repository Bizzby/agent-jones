/**
 * Ugly singleton kind of thing
 */

var measured = require('measured')

var procStats = exports.procStats = measured.createCollection('process')

procStats.gauge('memory_rss', function(){
    return process.memoryUsage().rss
})

procStats.gauge('memory_heap_total', function(){
    return process.memoryUsage().heapTotal
})

procStats.gauge('memory_heap_used', function(){
    return process.memoryUsage().heapUsed
})

procStats.gauge('uptime', function(){
    return process.uptime()
})

