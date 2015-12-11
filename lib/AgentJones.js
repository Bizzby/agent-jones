/**
 * Slight refinment on the original script...
 */

var path = require('path');

var _log = require('./log')


var AgentJones = function AgentJones(agentname, hostname, taskFetcher, slugRunner, opts){

    this.agentname = agentname;
    this.hostname = hostname;

    this.taskFetcher = taskFetcher;
    this.slugRunner = slugRunner;


}

AgentJones.prototype.start = function() {

    var self = this;

    var taskFetcher = this.taskFetcher;

    // FIXME: debugging stuff
    taskFetcher.on('debug', function(msg){
        _log('task-fetcher-request', msg)
    })

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

        self.slugRunner.start(task.tarball, task.command, task.enviroment, _onSlugrunnerFinish)

    }


};


module.exports = AgentJones;