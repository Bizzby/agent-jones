# Agent-Jones

_named after one of the "other" agents in the Matrix_

An agent for running tasks that are asigned to it by scheduler (currently all via http(s)). 

It only handles running tarballs that have been built via heroku's build system at the moment.

## Concepts

### Task

Simple JSON object with the following keys
- `name`: string, the name of the task
- `app`: string, the name of application
- `command`: an array of command + args to be run
- `tarball`: string containing the location of a fetchable
- `enviroment` : single level deep object of key:value which is injected into the enviroment
- `config` : object, optional, see below

e.g
```
{
    name: "some-task",
    app: "my-web-app",
    command: ["node", "-v", "&&", "echo", "$HOME"],
    tarball: "http://some-server.example.com/app/whizzy/ajde648134.tar.gz",
    enviroment: {FOO:"BAR", PORT:"4724", "LEVEL": "NEXT"},
}
```

__command__

Supplying a command that begins with `start` triggers reading of the Procfile in the tarball much like Heroku does. If there is no Procfile or the command doesn't exist, the process will crash

```
task.command = ["start", "web"]; 
```

__config__

allows passing in configuration for the agent to use in relation to the task, at the moment only one option is supported

`papertrail`: a `url` to a papertrail log destination e.g `syslog://logs.papertrailapp.com:12345`, if supplied your app's stdout will be redirected to papertrail (stderr goes nowhere right now). Output in papertrail will appear as 
```
[TIMESTAMP] [task.app] [task.name]/[hostname] 
Dec 30 20:21:15 bash-ting mock-task-z/sandfox-mbp
```

## Installation

Terribad global install for the moment as we need the npm bin path installation magic

``` 
npm install -g agent-jones
```

## Usage

```
./bin/agent-jones
```

__Signals__

`SIGTERM` will cause the process to gracefully terminate


__Enviroment Variables__

All configuration is currently through the enviroment

- `HOSTNAME`: optional, if not supplied the OS's hostname is used by default
- `AGENT_NAME`: optional, defaults to `anonymous`
- `SCHEDULER_ENDPOINT`: required, the `url` of the scheduler where tasks will come from
- `SCHEDULER_TOKEN`: optional, a value that will be used as a bearer token for authenticating with the scheduler
- `WORKSPACE`: optional, directory the agent will use for unpacking tarballs etc. The agent must have the permission to create this directory and during it's lifecycle will destroy anything here! By default it's the current working directory + '/workspace'
- `CONSOLE_OUTPUT`: optional, defaults to `true` unless `PAPERTRAIL_URL` is also supplied. Enables/disbales logging to stdout
- `PAPERTRAIL_URL`: optional, a `url` to a papertrail log destination e.g `syslog://logs.papertrailapp.com:12345`, if supplied will disable logging to stdout.

__Logging__

See above, default output is to stdout but optionally a papertrail endpoint can be supplied which will turn off logging to stdout and just send logs to papertrail. Logging to both can be enabled by explicitly supplying `CONSOLE_OUTPUT="true"` as well.

The log output could definately be improved!

## Development

Enable debugging output (via `debug`) with `DEBUG="agent-jones:*"`

There are some manual tests in `test` - these needs docs / automating. Basically you are checking it doesn't crash.

Run the linter via `npm run lint`

## Other things...

It's actually possible to run this in a heroku dyno
__BUT__
- inbound networking is broken external as enviroment variables don't get passed through (fine if you only make outbound connections)
- the hostname is some kind of uuid (v4) which changes each time the dyno is run, so you'll probably want to set the hostname in the env vars for now
- I don't really have a good reason for wanting to do this, but it's fun!

## COPYRIGHT 

Majority works: Copyright 2015 Bizzby Ltd.
Some works: Copyright 2015 Engine Yard, Inc.

## LICENSE

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.