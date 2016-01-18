'use strict'

const SlugRunner = require('./SlugRunner')

class SlugRunnerFactory {
  constructor (workspaceDir, opts) {
    this._workspaceDir = workspaceDir
    this._opts = opts

  }

  createSlugRunner () {
    return new SlugRunner(this._workspaceDir)
  }
}

module.exports = SlugRunnerFactory
