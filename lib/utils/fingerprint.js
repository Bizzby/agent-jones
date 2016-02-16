'use strict'
const os = require('os')
const lsb = require('bizzby-lsb-release')
const pretty = require('prettysize')

const pkg = require('../../package')

// FIXME: this is just making human friendly values! will need another version for machines
const parts = {
  'agent-jones': pkg.version,
  nodejs: process.versions.node,
  os: function () {
    return `${os.platform()} ${os.release()}`
  },
  arch: os.arch,
  distro: function () {
    const rel = lsb() || {}
    return rel.description || 'OSX?'
  },
  memory: function () {
    return pretty(os.totalmem(), true)
  },
  cpu: function () {
    const cores = os.cpus()
        // we assume that all CPU's are the same.... (one day of course this will be wrong)
    return `${cores.length} x "${cores[0].model}"`
  },
  interfaces: function () {
    function _filterEmptyInterfaces (iface) {
      return Array.isArray(iface.addrs) && iface.addrs.length > 0
    }

    function _isExternal (address) {
      return address.internal === false
    }

    function _isIPv4 (address) {
      return address.family === 'IPv4'
    }

    function _address2ip (address) {
      return address.address
    }

    function _prettyPrint (exIface) {
      const addresses = exIface.addrs.map(function (addr) { return `[${addr}]` })
      return `${exIface.name}: ${addresses.join('')}`
    }

    const ifaces = os.networkInterfaces()
    const interfaceNames = Object.keys(ifaces)
    const externalInterfaces = interfaceNames.map(function (ifaceName) {
        // TODO: for now we only care about IPv4....
      return { name: ifaceName, addrs: ifaces[ifaceName].filter(_isExternal).filter(_isIPv4).map(_address2ip) }
    }).filter(_filterEmptyInterfaces).map(_prettyPrint)

    return externalInterfaces.join(', ')
  }
}

module.exports = function fingerprint () {
  var fingerprintString = Object.keys(parts).map(function (key) {
    if (typeof parts[key] === 'function') {
      return `${key}: ${parts[key]()}`
    } else {
      return `${key}: ${parts[key]}`
    }
  }).join(', ')

  return fingerprintString
}
