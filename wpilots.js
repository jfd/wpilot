#!/usr/bin/env node
//
//  wpilots.js
//  WPilot server 
//  
//  Read README for instructions and LICENSE license.
//  
//  Copyright (c) 2010 Johan Dahlberg 
//
var sys       = require('sys'),
    path      = require('path'),
    fs        = require('fs'),
    fu        = require('./lib/fu');
    ws        = require('./lib/ws'),
    optparse  = require('./lib/optparse'),
    match     = require('./lib/match').Match;


// Define aliases
var _  = match.incl;

process.mixin(require('./lib/gameobjects'));

const SERVER_VERSION       = '(develop version)';

// Message priorities. High priority messages are sent to client no mather
// what. Low priority messages are sent only if client can afford them.
const PRIO_PASS     = 0,
      PRIO_LOW      = 'low',
      PRIO_HIGH     = 'high';

// Player Connection states      
const DISCONNECTED  = -1;
      IDLE          = 0,
      CONNECTED     = 1;
      HANDSHAKING   = 3,
      JOINED        = 4;      

// Default map. This map is used if no other map i specified.
const DEFAULT_MAP   = {
	name: 'Battle Royale',
	author: 'Johan Dahlberg',
	recommended_players: 8,

	data: [
		[51,  0,  0, 51,  0,  0, 51],
		[ 0, 11, 11,  0, 11, 11,  0],
		[ 0, 11, 52,  0, 52, 11,  0],
		[51,  0,  0, 12,  0,  0, 51],
		[ 0, 11, 52,  0, 52, 11,  0],
		[ 0, 11, 11,  0, 11, 11,  0],
		[51,  0,  0, 51,  0,  0, 51]
	]
}; 

// Command line option parser switches
const SWITCHES = [
  ['-d', '--debug',               'Enables debug mode (Default: false)'],
  ['-H', '--help',                'Shows this help section'],
  ['--name NAME',                 'The name of the server.'],
  ['--host HOST',                 'The host adress (default: 127.0.0.1).'],
  ['--map PATH',                  'Path to world map (default: built-in map).'],
  ['--pub_host HOST',             'Set if the public host differs from the local one'],
  ['--http_port PORT',            'Port number for the HTTP server (default: 6114)'],
  ['--ws_port PORT',              'Port number for the WebSocket server (default: 6115)'],
  ['--pub_ws_port PORT',          'Set if the public WebSocket port differs from the local one'],
  ['--max_rate NUMBER',           'The maximum rate per client and second (default: 1000)'],
  ['--max_players NUMBER',        'Max connected players allowed in server simultaneously (default: map setting)'],
  ['--r_respawn_time NUMBER',     'Rule: Player respawn time after death. (Default: 500)'],
  ['--r_reload_time NUMBER',      'Rule: The reload time after fire. (Default: 15)'],
  ['--r_shoot_cost NUMBER',       'Rule: Energy cost of shooting a bullet. (Default: 800)'],
  ['--r_shield_cost NUMBER',      'Rule: Energy cost of using the shield. (Default: 70)'],
  ['--r_energy_recovery NUMBER',  'Rule: Energy recovery unit (Default: 40)'],
  ['--r_round_limit NUMBER',      'Rule: Round score limit (Default: 10)'],
  ['--r_suicide_penelty NUMBER',  'Rule: The cost for suicides (Default: 1)'],
  ['--r_kill_score NUMBER',       'Rule: The price of a kill (Default: 1)'],
  ['--r_powerup_max NUMBER',      'Rule: Max no of powerups to spawn (Default: 3)'],
  ['--r_powerup_respawn NUMBER',  'Rule: Time between powerup respawns (Default: 1200)'],
  ['--r_powerup_speed_t NUMBER',  'Rule: Time before the speed powerup decline (Default: 700)'],
  ['--r_powerup_rapid_t NUMBER',  'Rule: Time before the rapid fire powerup decline (Default: 600)'],
  ['--r_powerup_energy_t NUMBER', 'Rule: Time before the energy boost powerup decline (Default: 800)']
];

// Default server options
const DEFAULT_OPTIONS = {
  debug:                true, 
  name:                 'WPilot Server',
  host:                 '127.0.0.1',
  map:                  null, 
  pub_host:             null,
  http_port:            6114,
  ws_port:              6115,
  pub_ws_port:          null,
  max_players:          null,
  max_rate:             5000,
  r_respawn_time:       400,
  r_reload_time:        15,
  r_shoot_cost:         300,
  r_shield_cost:        70,
  r_energy_recovery:    40,
  r_round_limit:        10,
  r_suicide_penelty:    1,
  r_kill_score:         1,
  r_powerup_max:        2,
  r_powerup_respawn:    600,
  r_powerup_speed_t:    700,
  r_powerup_rapid_t:    600,
  r_powerup_energy_t:   800  
};

// Paths to all files that should be server to client.
const CLIENT_DATA = [
  'client/index.html',
  'client/style.css',
  'client/logo.png',
  'client/space.jpg',
  'client/wpilot.js',
  'client/devices.js',
  'lib/gameobjects.js',
  'lib/match.js',
  'client/sound/background.m4a',
  'client/sound/ship_spawn.m4a',
  'client/sound/ship_die.m4a',
  'client/sound/bullet_1_spawn.m4a',
  'client/sound/bullet_2_spawn.m4a',
  'client/sound/powerup_spawn.m4a',
  'client/sound/powerup_1_die.m4a',
  'client/sound/powerup_2_die.m4a',
  'client/sound/powerup_3_die.m4a',
  'client/web_socket.js',
  'client/swfobject.js',
  'client/FABridge.js',
  'client/particle.js',
  'lib/sylvester.js',
  'client/WebSocketMain.swf',
  'client/crossdomain.xml' 
];

// Player colors
const PLAYER_COLORS = [
  '255,176,0',
  '51,182,255',
  '172,48,224',
  '230,21,90',
  '166,219,0',
  '125,142,22',
  '244,52, 0',
  '199,244,136',
  '227,111,160',
  '63,140,227',
  '227,126,76',
  '134,213,227'
];

// Player names
const PLAYER_NAMES = [
  'Boba Fett', 
  'Han Solo', 
  'Luke Skywalker', 
  'Princess Leia',
  'R2-D2',
  'C-3PO',
  'Chewbacca',
  'Darth Vader',
  'Lando',
  'Yoda',
  'Teboo',
  'Admiral Ackbar'
];

/**
 *  Entry point for server.
 *  @returns {undefined} Nothing.
 */
function main() {
  var options         = parse_options(),
      shared          = { get_state: function() {} },
      webserver       = null,
      gameserver      = null,
      policy_server   = null,
      map_data        = DEFAULT_MAP;

  if (!options) return;

  sys.puts('WPilot server ' + SERVER_VERSION);
  
  function start() {
    webserver = start_webserver(options, shared);
    gameserver = start_gameserver(map_data, options, shared);
  }
  
  if (options.map) {
    fs.readFile(options.map, function (err, data) {
      if (err) {
        sys.puts('Failed to read map: ' + err);
        return;
      }
      try {
        map_data = JSON.parse(data);
      } catch(e) {
        sys.puts(e);
        sys.puts('Map file is invalid, bad format');
        return;
      }
      start();
    });
    
  } else {
    start();
  }
  
}

/**
 *  Starts the web socket game server.
 *  @param {GameOptions} options Game options.
 *  @returns {WebSocketServer} Returns the newly created WebSocket server 
 *                             instance.
 */
function start_gameserver(map_data, options, shared) {
  var connections     = {},
      gameloop        = null,
      world           = null,
      server          = null,
      conn_id         = 1,
      post_tick       = 1,
      rules           = get_rules(DEFAULT_OPTIONS, 
                                  map_data.rules || {}, 
                                  options.rules);
  
  // Is called by the web instance to get current state
  shared.get_state = function() {
    return {
      server_name:      options.name,
      game_server_url:  'ws://' + (options.pub_host || options.host) + ':' + 
                                (options.pub_ws_port || options.ws_port) + '/',
      map_name:         map_data.name,
      max_players:      options.max_players || map_data.recommended_players,
      no_players:       world.no_players,
      no_ready_players: world.no_ready_players,
      rules:            rules
    }
  }

  /**
   *  The acutal game loop.
   *  @param {Number} t Current world time.
   *  @param {Number} dt Current delta time,
   *  @return {undefined} Nothing
   */
  function gameloop_tick(t, dt) {
    world.update(t, dt);
    check_rules(t, dt);
    post_update();
    flush_queues();
  }
  
  // Create the world instance
  world = new World({
    max_players: options.max_players || map_data.recommended_players,
    rules: rules,
    server_mode: true
  });
  
  // Listen for round state changes
  world.on_round_state_changed = function(state, winners) {
    broadcast(WORLD + STATE, state, winners);
  }

  // Listen for events on player
  world.on_player_join = function(player) {
    broadcast_each(
      [CLIENT + CONNECT, player.id, player.name, player.color],
      function(msg, conn) {
        if (player.id == conn.id) {
          return PRIO_PASS;
        } 
        return PRIO_HIGH;
      }
    );
  }
  
  world.on_player_spawn = function(player, pos) {
    broadcast(PLAYER + SPAWN, player.id, pos);
  }

  world.on_player_died = function(player, old_entity, death_cause, killer) {
    broadcast(PLAYER + DIE, player.id, death_cause, killer ? killer.id : -1);
  }
  
  world.on_player_ready = function(player) {
    broadcast(PLAYER + READY, player.id);
  }
  
  world.on_player_command = function(player, command) {
    broadcast_each(
      [PLAYER + COMMAND, player.id, command],
      function(msg, conn) {
        if (player.id == conn.id) {
          return PRIO_PASS;
        } 
        return PRIO_HIGH;
      }
    );
  }

  world.on_player_fire = function(player, angle) {
   broadcast(PLAYER + FIRE, player.id, angle);
  }
  
  world.on_player_leave = function(player, reason) {
    broadcast(CLIENT + DISCONNECT, player.id, reason);
  }
  
  world.on_powerup_spawn = function(powerup) {
    broadcast(POWERUP + SPAWN, powerup.powerup_id, 
                               powerup.powerup_type, 
                               powerup.pos);
  }
  
  world.on_powerup_die = function(powerup, player) {
    broadcast(POWERUP + DIE, powerup.powerup_id, player.id);
  }
  
  /**
   *  Starts the game loop. 
   *  @return {undefined} Nothing
   */
  function start_gameloop() {
    log('Creating server World...');
    world.build(map_data);

    gameloop = new GameLoop();
    gameloop.ontick = gameloop_tick;
    
    log('Starting game loop...');
    gameloop.start();
  }

  /**
   *  Stops the game loop, disconnects all connections and resets the world. 
   *  @param {String} reason A reason why the game loop stopped. Is sent to all 
   *                         current connections.
   *  @return {undefined} Nothing
   */
  function stop_gameloop(reason) {
    for (var id in connections) {
      connections[id].kill(reason || 'Server is shutting down');
    }
    
    world.reset();
    
    if (gameloop) {
      gameloop.kill();
      gameloop = null;
    }
  }  

  function post_update() {
    post_tick++;
    for (var id in connections) {
      var connection = connections[id];
      if (post_tick % connection.update_rate != 0) {
        continue;
      }
      for (var id in world.players) {
        var player = world.players[id];
        if (player.entity) {
          connection.queue([PLAYER + STATE, 
                            player.id, 
                            pack_vector(player.entity.pos)]);
        }
      }
    }    
  }
  
  /**
   *  Flushes all connection queues.
   *  @return {undefined} Nothing
   */
  function flush_queues() {
    for (var id in connections) {
      var connection = connections[id];
      connection.flush_queue();      
    }
  }
  
  /**
   *  Check game rules 
   *  @param {Number} t Current world time.
   *  @param {Number} dt Current delta time,
   *  @return {undefined} Nothing
   */
  function check_rules(t, dt) {
    switch (world.r_state) {
      
      // The world is waiting for players to be "ready". The game starts when 
      // 60% of the players are ready.
      case ROUND_WARMUP:
        if (world.no_players > 1 && world.no_ready_players >= (world.no_players * 0.6)) {
          world.set_round_state(ROUND_STARTING);
        }
        break;
        
      // Round is starting. Server aborts if a player leaves the game.
      case ROUND_STARTING:
        if (world.no_ready_players < (world.no_players * 0.6)) {
          world.set_round_state(ROUND_WARMUP);
          return;
        }
        if (t >= world.r_timer) {
          world.set_round_state(ROUND_RUNNING);
        }
        break;
        
      // The round is running. Wait for a winner.
      case ROUND_RUNNING:
        var winners = [];
        world.forEachPlayer(function(player) {
          if (player.score == rules.round_limit) {
            winners.push(player.id);
          }
        });
        if (winners.length) {
          world.set_round_state(ROUND_FINISHED, winners);
        }
        break;

      // The round is finished. Wait for restart
      case ROUND_FINISHED:
        if (t >= world.r_timer) {
          world.set_round_state(ROUND_WARMUP);
        }
        break;
    }
  }
  
  /**
   *  Broadcasts a game message to all current connections. Broadcast always
   *  set's message priority to HIGH.
   *  @param {String} msg The message to broadcast.
   *  @return {undefined} Nothing
   */
  function broadcast() {
    var msg = Array.prototype.slice.call(arguments);
    for(var id in connections) {
      connections[id].queue(msg);
    }
  }

  /**
   *  Broadcast, but calls specified callback for each connection
   *  @param {Array} msg The message to broadcast.
   *  @param {Function} callback A callback function to call for each connection
   *  @return {undefined} Nothing
   */
  function broadcast_each(msg, callback) {
    for(var id in connections) {
      var prio = callback(msg, connections[id]);
      if (prio) connections[id].queue(msg);
    }
  }
  
  /**
   *  Prints a system message in the console.
   *  @param {String} msg The message to print .
   *  @return {undefined} Nothing
   */
  function log(msg) {
    sys.puts(options.name + ': ' + msg);
  }
  
  /**
   *  Create the web socket server.
   *  @param {function} callback The callback for new connections.
   *  @param {String} msg The message to broadcast.
   *  @return {undefined} Nothing
   */
  server = ws.createServer(function(conn) {
    var connection_id     = conn_id++,
        disconnect_reason = 'Closed by client',
        message_queue     = [],
        player            = null;
    
    conn.id = connection_id;
    conn.player_name = null;
    conn.rate = options.max_rate;
    conn.update_rate = 2;
    conn.last_rate_check = get_time();
    conn.data_sent = 0;
    conn.dimensions = [640, 480];
    conn.state = IDLE;
    conn.debug = options.debug;
    
    /**
     *  Set's information about client.
     */
    conn.set_client_info = function(info) {
      conn.rate = Math.min(info.rate, options.max_rate);
      conn.player_name = info.name;
      conn.dimensions = info.dimensions;
    }
    
    /**
     *  Forces a connection to be disconnected. 
     */
    conn.kill = function(reason) {
      disconnect_reason = reason || 'Unknown Reason';
      this.post([SERVER + DISCONNECT, disconnect_reason]);
      this.close();
      message_queue = [];
    }
    
    /**
     *  Queues the specified message and sends it on next flush.
     */
    conn.queue = function(msg) {
      message_queue.push(msg);
    }

    /**
     *  Stringify speicified object and sends it to remote part.
     */
    conn.post = function(data) {
      var packet = JSON.stringify([CONTROL_PACKET, data]);

      this.write(packet);
    }

    /**
     *  Post's specified data to this instances message queue
     */
    conn.flush_queue = function() {
      var now = get_time();
          msg = null,
          data_sent = 6,
          packet_data = []

      while ((msg = message_queue.shift())) {
        var data = JSON.stringify(msg);
        packet_data.push(data);
        data_sent += data.length;
      }
            
      this.write('[2,[' + packet_data.join(',') + ']]');
      this.data_sent += data_sent;
      
      var diff = now - this.last_rate_check;
      
      if (diff >= 1000) {
        if (this.data_sent < this.rate && this.update_rate > 1) {
          this.update_rate--;
        } else if (this.data_sent > this.rate) {
          this.update_rate++;
        }
        this.data_sent = 0;
        this.last_rate_check = now;
      }
      
      message_queue = [];
    }
    
    /**
     *  Sets the state of the connection
     */
    conn.set_state = function(new_state) {
      switch (new_state) {
        
        case CONNECTED:
          connections[connection_id] = conn;
        
          if (conn.debug) {
            log('Debug: Sending server state to ' + conn);
          }
          
          conn.post([SERVER + INFO, shared.get_state()]);
          break;

        case HANDSHAKING:
          if (!gameloop) {
            start_gameloop();
          }
          
          if (world.no_players >= world.max_players) {
            conn.kill('Server is full');
          } else {
            conn.post([SERVER + HANDSHAKE].concat(world.get_repr()));

            if (conn.debug) {
              log('Debug: ' + conn + ' connected to server. Sending handshake...');
            }
          }
          break;
        
        case JOINED:
          // BE CAREFUL WITH THIS. Position of conn.post has changed with 
          // on_player_join broadcast
          player = world.add_player(connection_id, 
                                    conn.player_name || get_random_value(PLAYER_NAMES, world.players, 'name'), 
                                    get_random_value(PLAYER_COLORS, world.players, 'color'));

          conn.post([SERVER + CONNECT, world.tick, player.id, player.name, player.color]);
          
          log(conn + ' joined the game.');
          break;
        
        case DISCONNECTED:
          delete connections[connection_id];
        
          if (player) {
            world.remove_player(player.id, disconnect_reason);
            log(conn + ' leaved the game (Reason: ' + disconnect_reason + ')');
          }

          if (world.no_players == 0) {
            stop_gameloop();
          } 
          
          if (conn.debug) {
            log('Debug: ' + conn + ' disconnected (Reason: ' + disconnect_reason + ')');
          }
          break;
      }
      
      conn.state = new_state;
    }
    
    /**
     *  Returns a String representation for this Connection
     */
    conn.toString = function() {
      return this.remoteAddress + '(id: ' + this.id + ')';
    }

    // Connection ´connect´ event handler. Challenge the player and creates 
    // a new PlayerSession.
    conn.addListener('connect', function(resource) {
      conn.set_state(CONNECTED);
    });

    // Connection ´recieve´ event handler. Occures each time that client sent
    // a message to the server.
    conn.addListener('data', function(data) {
      var packet = null;

      try {
        packet = JSON.parse(data);        
      } catch(e) {
        sys.debug('Malformed message recieved');
        sys.debug(sys.inspect(data));
        conn.kill('Malformed message sent by client');
        return;
      }

      switch(packet[0]) {

        case CONTROL_PACKET:
          process_control_message([packet[1], conn]);
          break;
          
        case GAME_PACKET:
          if (world) {
            process_game_message([packet[1], player, world]);
          }
          break;
        
        default:
          conn.kill('Bad header');
          break;
          
      }
    });

    // Connection ´close´ event listener. Occures when the connection is 
    // closed by user or server.
    conn.addListener('close', function() {
      conn.set_state(DISCONNECTED);
    });
    
  });
  
  sys.puts('Starting Game Server server at ' + shared.get_state().game_server_url);
  server.listen(options.ws_port, options.host);
  
  return server;
}

/**
 *  Processes a control message from a connection. 
 */
var process_control_message = match (

  /**
   *  MUST be sent by the client when connected to server. It's used to validate
   *  the session.
   */
  [[CLIENT + CONNECT], {'state =': CONNECTED}], 
  function(conn) {
    conn.set_state(HANDSHAKING);
  },
  
  /**
   *  Client has received world data. Client is now a player of the world.
   */
  [[CLIENT + HANDSHAKE, Object], {'state =': HANDSHAKING}], 
  function(info, conn) {
    conn.set_client_info(info);
    conn.set_state(JOINED);
  },
  
  function(data) {
    data[1].kill('Bad control message');
  }
  
);

/**
 *  Processes a game message from specified player. 
 */
var process_game_message = match (

  /**
   *  Players command state has changed.
   */
  [[PLAYER + COMMAND, Number], _, _], 
  function(value, player, world) {
    world.set_player_command(player.id, value);
  },
  
  [[PLAYER + ANGLE, Number], _, _],
  function(value, player, world) {
    if (!player.dead) {
      player.entity.angle = angle;
    }
  },

  /**
   *  Indicates that player is ready to start the round
   */
  [[PLAYER + READY], _, _], function(player, world) {
    world.set_player_ready(player.id);
  },

  /**
   *  The message sent by client could not be matched. Kill the session
   */
  function(obj) {
    sys.puts(sys.inspect(obj[0]));
    var connection = obj[1].connection;

    if (connection.debug) {
      sys.puts('Unhandled message:');
      sys.puts(sys.inspect(obj[0]));
    }
    
    connection.kill('Bad game message');
  }

);

/**
 *  Starts a webserver that serves WPilot client related files.
 *  @param {Object} options Web server options.
 *  @return {http.Server} Returns the HTTP server instance.
 */
function start_webserver(options, shared) {
  sys.puts('Starting HTTP server at http://' + options.host + ':' + options.http_port);
  var server = fu.listen(options.http_port, options.host);

  for (var i=0; i < CLIENT_DATA.length; i++) {
    fu.get('/' + path.basename(CLIENT_DATA[i]), fu.staticHandler(CLIENT_DATA[i]));
  }
  
  fu.get('/', fu.staticHandler(CLIENT_DATA[0]));
  
  fu.get('/state', function (req, res) {
    res.sendHeader(200, {'Content-Type': 'application/json'});
    res.write(JSON.stringify(shared.get_state()), 'utf8');
    res.close();
  });
  
  return server;
}

/**
 *  Filters all rules from a options dict
 *  @param {Object} options A option set
 *  @return {Object} All rules that was found in the specifed option set.
 */
function get_rules(default_rules, map_rules, user_rules) {
  var rules = {};
  for (var option in default_rules) {
    var match = option.match(/^r_([a-z_]+)/);
    if (match) {
      rules[match[1]] = default_rules[option];
    }
  }
  return process.mixin(rules, process.mixin(map_rules, user_rules)); 
}

/**
 *  Returns a random value from an array and discards values that is already
 *  picked. 
 *  @param {Array} src Source array.
 *  @param {Array} list An array that contains objects that already has been  
                        assigned a value.
 *  @param {String} prop_name The name of the property to check against. 
 *  @return {Object} The value
 */
function get_random_value(src, list, prop_name) {
  var value = null, count = 0;
  while (!value && count++ <= src.length) {
    value = src[Math.floor(Math.random() * src.length)];
    src.forEach(function(item){
      if (item[prop_name] == value) value = null;
    });
    if (value) return value;
  }
  return src[0];
}


/**
 *  Parses and returns server options from ARGV.
 *  @returns {Options} Server options.
 */
function parse_options() {
  var parser  = new optparse.OptionParser(SWITCHES),
      result = { rules: {}};
  parser.banner = 'Usage: wpilots.js [options]';
  parser.on('help', function() {
    sys.puts(parser.toString());
    parser.halt();
  });
  parser.on('*', function(opt, value) {
    var match = opt.match(/^r_([a-z_]+)/);
    if (match) {
      result.rules[match[1]] = value;
    }
    result[opt] = value || true;
  });      
  parser.parse(process.ARGV);
  return parser._halt ? null : process.mixin(DEFAULT_OPTIONS, result);
}

/**
 *  Returns a packet vector
 */
function pack_vector(v) {
  return [round_number(v[0], 2), round_number(v[1], 2)];
}

/**
 *  Returns current time stamp
 */
function get_time() {
  return new Date().getTime();
}


// Call programs entry point
main();