var SlugRunner = require('./SlugRunner')

var SlugRunnerFactory = function SlugRunnerFactory(workspaceDir, opts){

    this._workspaceDir = workspaceDir
    this._opts = opts

}

SlugRunnerFactory.prototype.createSlugRunner = function() {

    return new SlugRunner(this._workspaceDir)
}

module.exports = SlugRunnerFactory