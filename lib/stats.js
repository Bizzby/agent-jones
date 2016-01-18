'use strict'
/**
 * Ugly singleton kind of thing
 */

const measured = require('measured')

let procStats = exports.procStats = measured.createCollection('process')

procStats.gauge('memory_rss', () => {
  return process.memoryUsage().rss
})

procStats.gauge('memory_heap_total', () => {
  return process.memoryUsage().heapTotal
})

procStats.gauge('memory_heap_used', () => {
  return process.memoryUsage().heapUsed
})

procStats.gauge('uptime', () => {
  return process.uptime()
})
