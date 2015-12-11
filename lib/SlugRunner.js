/**
 * Some kind of janky runner around the slugrunner script
 * and process.spawn
 *
 * TODO: sort of where the child process stdio go... right now are just piping through to our own stdio
 */
var child_process = require("child_process");
var path = require('path');
var rimraf = require("rimraf");
var mkdirp = require("mkdirp");

var _log = require('./log')
// The path to the slugrunner shell script
var SLUGRUNNER_PATH = path.resolve(__dirname, '../bin/slugrunner');


var SlugRunner = function SlugRunner(workspace, opts){

    var options = opts || {};

    //the working directory that slugrunner will execute on
    this.workspace = workspace;

    this._cleanBeforeRun = options._cleanBeforeRun !== false
    this._slugRunnerProcess = null;
}

/**
 * [start description]
 * @param  {string}   tarballUrl URL to tarball
 * @param  {string}   command    the command to be executed by slugrunner
 * @param  {object}   enviroment the enviroment vars for the slug
 * @param  {Function} callback   called on slugrunner end (null, exitcode), or failure (err)
 */
SlugRunner.prototype.start = function(tarballUrl, command, enviroment, callback) {

    //TODO stop using sync!
    if(this._cleanBeforeRun) {
        rimraf.sync(this.workspace)
        mkdirp.sync(this.workspace)
    }

    var slugRunnerEnviroment = enviroment || {};

    // SLUG_URL is handled (and unset) by slug runner for grabbing tarballs
    // QUESTION: how would there not be a tarball, or what alterantives could there be?
    if(tarballUrl) {
        slugRunnerEnviroment['SLUG_URL'] = tarballUrl;
    }

    this._slugRunnerProcess = child_process.spawn(
        SLUGRUNNER_PATH, 
        command, 
        {   
            cwd: this.workspace, 
            env: slugRunnerEnviroment,
            stdio: 'inherit'
        })

    this._slugRunnerProcess.on('error', function (err) {
      callback(err)
    });

    this._slugRunnerProcess.on('close', function (code) {
      callback(null, code)
    });

};


module.exports = SlugRunner;