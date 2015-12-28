var http = require('http')
var fs = require('fs')
var path = require('path')

var testTarballPath = path.resolve(process.cwd(), __dirname, 'app.tar.gz')

exports.createServer = function(){

    var tarServer = http.createServer(function(request, response) {

        console.log('[FAKE TARBALL SERVER] tarball request recieved') // eslint-disable-line no-console

        fs.readFile(testTarballPath, 'binary', function(err, file) {
            if(err) {        
                response.writeHead(500, {'Content-Type': 'text/plain'})
                response.write(err + '\n')
                response.end()
                return
            }

            response.writeHead(200)
            response.write(file, 'binary')
            response.end()
        })

    })

    return tarServer

}