/**
 * Slight refinment on the original script...
 */

var path = require('path');
var url = require('url');
var _log = require('./log')


var AgentJones = function AgentJones(agentname, hostname, taskFetcher, slugRunner, opts){

    this.agentname = agentname;
    this.hostname = hostname;

    this.taskFetcher = taskFetcher;
    this.slugRunner = slugRunner;


}

AgentJones.prototype.start = function() {

    var self = this;

    _log('starting agent', this.agentname + '@' + this.hostname)

    var taskFetcher = this.taskFetcher;

    // FIXME: debugging stuff
    taskFetcher.on('debug', function(msg){
        _log('task-fetcher-request', msg)
    })

    _log('fetching task from scheduler')
    taskFetcher.getTask(this.agentname, this.hostname, onResponse)

    function onResponse(err, task){

        if(err){
            _log('fatal error whilst retrieving task', err)
            process.exit(1);
        }

        function _onSlugrunnerFinish(err, exitCode){
            if(err) {
                _log('slugrunner failed', err);
                process.exit(1)
            }

            _log('slugrunner exited with code', exitCode);
            process.exit(exitCode);
        }

        _log('retrieved task', _getNicerTarballName(task.tarball))

        self.slugRunner.start(task.tarball, task.command, task.enviroment, _onSlugrunnerFinish)

    }


};


module.exports = AgentJones;

function _getNicerTarballName(tarball){

    var name = 'unknown';

    try {
        name = url.parse(tarball).pathname
    } catch (err) {
        //do nothing
    }

    return name;
}