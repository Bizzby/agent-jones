// Just a struct - one day I'll be written in a real language
// FIXME: this is crappy defaults and way of specifying them!
// 
var Task = function Task(){

    this.name = ''
    this.app = ''
    this.command = []
    this.tarball = ''
    this.enviroment = {}
    this.config = {}
}

module.exports = Task