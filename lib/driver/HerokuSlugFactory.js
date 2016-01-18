'use strict'

const HerokuSlug = require('./HerokuSlug')

class HerokuSlugFactory {
  constructor (workspaceDir, opts) {
    this._workspaceDir = workspaceDir
    this._opts = opts

  }

  createDriver () {
    return new HerokuSlug(this._workspaceDir)
  }
}

module.exports = HerokuSlugFactory
