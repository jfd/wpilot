#!/usr/bin/env node
var sys       = require('sys'),
    path      = require('path'),
    fu        = require('./libs/fu');
    ws        = require('./libs/ws'),
    optparse  = require('./libs/optparse'),
    match     = require('./libs/match').Match;

var _         = match.incl;

process.mixin(require('./libs/gameobjects'));

const VERSION       = '0.1';

// Message priorities. Not supported in current version of server.
const PRIO_HIGH     = 3,
      PRIO_MID      = 2,
      PRIO_LOW      = 1;

// Command line option parser switches
const SWITCHES = [
  ['-d', '--debug',         'Enables debug mode'],
  ['-H', '--help',          'Shows this help section'],
  ['--server_name NAME',    'The name of the server.'],
  ['--host HOST',           'The host adress.'],
  ['--http_port PORT',      'Port number for the HTTP server (default: 6114)'],
  ['--ws_port PORT',        'Port number for the Websocket server (default: 6115)'],
  ['--max_players NUMBER',  'Max connected players allowed in server simultaneously (default: 8)'],
  ['--start_delay NUMBER',  'DEPRETATED'],
  ['--world_width NUMBER',  'The world width (Default: 1000)'],
  ['--world_height NUMBER', 'The world height (Default: 1000)'],
  ['--update_rate NUMBER',  'Represent the frame no where updates are sent to the client. (Default: 10)'],
];

// Default server options
const DEFAULT_OPTIONS = {
  debug:          false, 
  name:           'WPilot Server',
  host:           '10.0.1.2',
  http_port:      6114,
  ws_port:        6115,
  max_players:    8,
  start_delay:    3,
  world_width:    1000,
  world_height:   1000,
  update_rate:    10
};

// Paths to all files that should be server to client.
const CLIENT_DATA = [
  'client/index.html',
  'client/index.local.html',
  'client/style.css',
  'client/wpilot.js',
  'libs/gameobjects.js',
  'libs/match.js',
  'client/space.jpg',
  'client/WebSocketMain.swf',
  'client/web_socket.js',
  '/swfobject.js',
  'client/FABridge.js',
  'client/crossdomain.xml' 
];

/**
 *  Entry point for server.
 */
function main() {
  var options = parse_options(),
      state   = { no_players: 0 };

  if (!options) return;
  
  sys.puts('WPilot server ' + VERSION);

//  world.collision_manager = collision_manager;
//  world.delete_manager = function(list) { self.delete_manager.apply(self, [list]) };

  sys.puts('Starting HTTP server at port ' + options.http_port);
  fu.listen(options.http_port, options.host);
  for (var i=0; i < CLIENT_DATA.length; i++) {
    fu.get('/' + path.basename(CLIENT_DATA[i]), fu.staticHandler(CLIENT_DATA[i]));
  }

//  sys.puts('Starting WebSocket server at port ' + options.ws_port);
//  start_gameserver(options, state);
}

/**
 *  Starts the web socket game server.
 */
function start_gameserver(options, state) {
  var sessions      = {},
      gameloop      = null,
      world         = null;
  
  return ws.createServer(function(conn) {
    var session = null;

    // No session is available. This is a new player. Try to create a new 
    // session.
    function connect(resource) {
      var player = null;

      // Check player max limit.
      if (world.no_players == world.max_players) {
        throw error('Server is full');
      }

      if (world.state == 'finished') {
        throw error('Game already finished');
      }

      // Handles the killed event's 
      function disconnected(reason) {
        session.removeListener('disconnected', disconnected);
        session.removeListener('state', state_changed);
        self.broadcast([PLAYER + DISCONNECT, session.id]);    
        self.log(session.player + ' disconnected (Reason: ' + reason + ')');
      }

      // Handles state event's
      function state_changed(changed_values) {
        sys.debug('state_changes')
        self.broadcast([PLAYER + STATE, session.player.id, changed_values]);    
        if (changed_values.state == 'ready') {
          self.log(session.state + ' is ready');
        }
      }

      // Check if the gameloop needs to be started.
      if (!gameloop) {
        start_gameloop();
      }

      session = new PlayerSession(conn);

      session.addListener('disconnected', disconnected);
      session.addListener('state', state_changed);

      sessions[session.id] = session;
      world.players[session.id] = session.player;

      log(conn.remoteAddress + ' connected to server. Sending handshake...');

      var entities = [], players = [];
      for (var i = 0; i < world._entities.length; i++) {
        entities.push(world._entities[i].repr());
      }
      for (var pid in world.players) {
        players.push(world.players[pid].repr());
      }

      session.send([
        SERVER + HANDSHAKE, 
        session.player.id, 
        self.gameloop.tick, 
        world.repr(),
        entities,
        players
      ]);

      self.broadcast_exclude(
        session, 
        [PLAYER + CONNECT, session.player.repr()]
      );

      // Update the player count
      world.no_players++;

    }

    // Handles the receive event from the server instance.  
    function receive(data) {
      var session = conn.session, msg = JSON.parse(data);
      if (session) {
        process_messages(msg, session);  
      }
    }

    // Handles the close event from the server instance.  
    function close() {
      if (session) {
        delete sessions[session.id];
        delete players[session.id];
        world.no_players--;

        if (world.no_players == 0) {
          stop_gameloop();
        }

        session._reason = 'User Disconnected';
      }
    }

    conn.addListener('connect', connect);
    conn.addListener('receive', receive);
    conn.addListener('close', close);
    
  });
  
  .listen(options.ws_port);
}


function parse_options() {
  var parser  = new optparse.OptionParser(SWITCHES),
      result;
  parser.banner = 'Usage: wpilots.js [options]';
  parser.on('help', function() {
    sys.puts(parser.toString());
    parser.halt();
  });
  for (var i = 0; i < DEFAULT_OPTIONS.length; i++) {
    var option = DEFAULT_OPTIONS[i];
    (function(opt) {
      parser.on(opt, function(value) {
        result[opt] = value;
      });      
    })(DEFAULT_OPTIONS[i]);
  }
  result = parser.parse(process.ARGV);
  return result ? process.mixin(result, DEFAULT_OPTIONS) : null;
}

// Call programs entry point
main();