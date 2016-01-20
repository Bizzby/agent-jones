'use strict'

var signals = [
  'SIGHUP',
  'SIGINT',
  'SIGQUIT',
  'SIGILL',
  // 'SIGTRAP',
  'SIGABRT',
  // 'SIGIOT',
  // 'SIGBUS',
  // 'SIGFPE',
  // 'SIGKILL',
  // 'SIGUSR1',
  // 'SIGSEGV',
  // 'SIGUSR2',
  // 'SIGPIPE',
  // 'SIGALRM',
  'SIGTERM',
  // 'SIGCHLD',
  // 'SIGSTKFLT',
  // 'SIGCONT',
  // 'SIGSTOP',
  'SIGTSTP',
  'SIGBREAK',
  //'SIGTTIN',
  //'SIGTTOU',
  // 'SIGURG',
  // 'SIGXCPU',
  // 'SIGXFSZ',
  //'SIGVTALRM',
  // 'SIGPROF',
  // 'SIGWINCH',
  // 'SIGIO',
  // 'SIGPOLL',
  // 'SIGLOST',
  'SIGPWR',
  // 'SIGSYS',
  // 'SIGUNUSED'
]

module.exports = function (cb) {
  const _prepFire = function (signame) {
    return function () { cb(signame) }
  }

  signals.forEach(function (sig) {
    process.on(sig, _prepFire(sig))
  })
}
