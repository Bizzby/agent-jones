# Agent-Jones

_named after one of the "other" agents in the Matrix_

An agent for running tasks that are asigned to it by scheduler (currently all via http). 

It only handles running tarballs that have been built via heroku's build system at the moment.

## Concepts

__Task__

Simple JSON object with the following keys
- `command`: an array of command + args to be run
- `tarball`: string containing the location of a fetchable
- `enviroment` : single level deep object of key:value which is injected into the enviroment

## Installation

Terribad global install for the moment as we need the npm bin path installation magic

``` 
npm install -g agent-jones
```

## Usage

__Enviroment Variables__

All configuration is currently through the enviroment

- `HOSTNAME`: optional, if not supplied the OS's hostname is used by default
- `AGENT_NAME`: optional, defaults to `anonymous`
- `SCHEDULER_ENDPOINT`: required, the `url` of the scheduler where tasks will come from
- `SCHEDULER_TOKEN`: optional, a value that will be used as a bearer token for authenticating with the scheduler
- `WORKSPACE`: optional, directory the agent will use for unpacking tarballs etc. The agent must have the permission to create this directory and during it's lifecycle will destroy anything here! By default it's the current working directory + '/workspace'

__Logging__

At the moment all the logs from the agent and it's sub processes going to stdout, the agent prefixes it's logs with timestamp and process idents

## Development

Enable debugging output (via `debug`) with `DEBUG="agent-jones:*"`

There are some manual tests in `test` - these needs docs / automating. Basically you are checking it doesn't crash.

Run the linter via `npm run lint`

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