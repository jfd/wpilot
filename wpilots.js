#!/usr/bin/env node
//
//  wpilots.js
//  WPilot server
//
//  Read README for instructions and LICENSE license.
//
//  Copyright (c) 2010 Johan Dahlberg
//
var path      = require('path'),
    fs        = require('fs'),
    fu        = require('./lib/fu');
    ws        = require('ws'),
    optparse  = require('./lib/optparse'),
    match     = require('./lib/match').Match,
    go        = require('./lib/gameobjects');
    

var WebSocketServer = ws.Server;
var inspect = require('util');

// Define aliases
var _  = match.incl;

const SERVER_VERSION       = '1.0';

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
  ['--region REGION',             'Set region of this server. This info is displayed in the global server list (default: n/a).'],
  ['--admin_password PASSWORD',   'Admin password (default: "none").'],
  ['--map PATH',                  'Path to world map (default: built-in map).'],
  ['--pub_host HOST',             'Set if the public host differs from the local one'],
  ['--http_port PORT',            'Port number for the HTTP server. Disable with 0 (default: 8000)'],
  ['--ws_port PORT',              'Port number for the WebSocket server (default: 6114)'],
  ['--pub_ws_port PORT',          'Set if the public WebSocket port differs from the local one'],
  ['--max_rate NUMBER',           'The maximum rate per client and second (default: 1000)'],
  ['--max_connections NUMBER',    'Max connections, including players (default: 60)'],
  ['--max_players NUMBER',        'Max connected players allowed in server simultaneously (default: 8)'],
  ['--r_ready_ratio NUMBER',      'Rule: Player ready ratio before a round start. (Default: 0.6)'],
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
  ['--r_powerup_spread_t NUMBER', 'Rule: Time before the spread powerup decline (Default: 700)'],
  ['--r_powerup_rapid_t NUMBER',  'Rule: Time before the rapid fire powerup decline (Default: 600)'],
  ['--r_powerup_rico_t NUMBER',   'Rule: Time before the ricoshet powerup decline (Default: 800)']
];

// Default server options
const DEFAULT_OPTIONS = {
  debug:                true,
  name:                 'WPilot Server',
  host:                 '127.0.0.1',
  region:               'n/a',
  admin_password:       null,
  map:                  null,
  pub_host:             null,
  http_port:            8000,
  ws_port:              6114,
  pub_ws_port:          null,
  max_connections:      60,
  max_players:          8,
  max_rate:             5000,
  r_ready_ratio:        0.6,
  r_respawn_time:       400,
  r_reload_time:        15,
  r_shoot_cost:         300,
  r_shield_cost:        30,
  r_energy_recovery:    30,
  r_round_limit:        10,
  r_suicide_penelty:    1,
  r_kill_score:         1,
  r_powerup_max:        2,
  r_powerup_respawn:    600,
  r_powerup_spread_t:   700,
  r_powerup_rapid_t:    600,
  r_powerup_rico_t:     600
};

// Paths to all files that should be server to client.
const CLIENT_DATA = [
  'client/index.html', '',
  'client/style.css', '',
  'client/logo.png', '',
  'client/space.jpg', '',
  'client/wpilot.js', '',
  'client/devices.js', '',
  'lib/gameobjects.js', '',
  'lib/match.js', 'lib/',
  'client/sound/background.m4a', 'sound/',
  'client/sound/ship_spawn.m4a','sound/',
  'client/sound/ship_die.m4a', 'sound/',
  'client/sound/ship_thrust.m4a', 'sound/',
  'client/sound/ship_fire_1.m4a', 'sound/',
  'client/sound/ship_fire_2.m4a', 'sound/',
  'client/sound/ship_fire_3.m4a', 'sound/',
  'client/sound/powerup_spawn.m4a', 'sound/',
  'client/sound/powerup_1_die.m4a', 'sound/',
  'client/sound/powerup_2_die.m4a', 'sound/',
  'client/sound/powerup_3_die.m4a', 'sound/',
  'client/sound/background.ogg', 'sound/',
  'client/sound/ship_spawn.ogg', 'sound/',
  'client/sound/ship_die.ogg', 'sound/',
  'client/sound/ship_thrust.ogg', 'sound/',
  'client/sound/ship_fire_1.ogg', 'sound/',
  'client/sound/ship_fire_2.ogg', 'sound/',
  'client/sound/ship_fire_3.ogg', 'sound/',
  'client/sound/powerup_spawn.ogg', 'sound/',
  'client/sound/powerup_1_die.ogg', 'sound/',
  'client/sound/powerup_2_die.ogg', 'sound/',
  'client/sound/powerup_3_die.ogg', 'sound/',
  'client/web_socket.js', 'lib/',
  'client/swfobject.js', 'lib/',
  'client/FABridge.js', 'lib/',
  'client/particle.js', 'lib/',
  'client/WebSocketMain.swf', 'lib/',
  'client/crossdomain.xml', 'lib/'
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
      maps            = null;

  if (!options) return;

  console.log('WPilot server ' + SERVER_VERSION);

  maps = options.maps;

  if (options.http_port != 0) {
    webserver = start_webserver(options, shared);
  }

  gameserver = start_gameserver(maps, options, shared);

}

/**
 *  Starts the web socket game server.
 *  @param {GameOptions} options Game options.
 *  @returns {WebSocketServer} Returns the newly created WebSocket server
 *                             instance.
 */
function start_gameserver(maps, options, shared) {
  var connections     = {},
      no_connections  = 0,
      gameloop        = null,
      world           = null,
      server          = null,
      update_tick     = 1,
      next_map_index  = 0;

  // Is called by the web instance to get current state
  shared.get_state = function() {
    return {
      server_name:      options.name,
      region:           options.region,
      version:          SERVER_VERSION,
      game_server_url:  'ws://' + (options.pub_host || options.host) + ':' +
                                (options.pub_ws_port || options.ws_port) + '/',
      map_name:         world.map_name,
      max_players:      options.max_players,
      no_players:       world.no_players,
      no_ready_players: world.no_ready_players,
      rules:            world.rules
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

  function connection_for_player(player) {
    for (var connid in connections) {
      var conn = connections[connid];
      if (conn.player && conn.player.id == player.id) {
        return conn;
      }
    }
    return null;
  }

  // Create the world instance
  world = new World(true);
  world.max_players = options.max_players,

  // Listen for round state changes
  world.on_round_state_changed = function(state, winners) {
    broadcast(OP_ROUND_STATE, state, winners);
  }

  // Listen for events on player
  world.on_player_join = function(player) {
    player.name = get_unique_name(world.players, player.id, player.name);
    broadcast_each(
      [OP_PLAYER_CONNECT, player.id, player.name],
      function(msg, conn) {
        if (conn.player && conn.player.id == player.id) {
          return PRIO_PASS;
        }
        return PRIO_HIGH;
      }
    );
  }

  world.on_player_spawn = function(player, pos) {
    broadcast(OP_PLAYER_SPAWN, player.id, pos);
  }

  world.on_player_died = function(player, old_entity, death_cause, killer) {
    broadcast(OP_PLAYER_DIE, player.id, death_cause, killer ? killer.id : -1);
  }

  world.on_player_ready = function(player) {
    broadcast(OP_PLAYER_INFO, player.id, 0, true);
  }

  world.on_player_name_changed = function(player, new_name, old_name) {
    player.name = get_unique_name(world.players, player.id, new_name);
    broadcast(OP_PLAYER_INFO, player.id, 0, 0, player.name);
  }

  world.on_player_fire = function(player, angle, pos, vel, powerup) {
   broadcast(OP_PLAYER_FIRE, player.id, angle, pos, vel, powerup);
  }

  world.on_player_leave = function(player, reason) {
    broadcast(OP_PLAYER_DISCONNECT, player.id, reason);
  }

  world.on_powerup_spawn = function(powerup) {
    broadcast(OP_POWERUP_SPAWN, powerup.powerup_id,
                               powerup.powerup_type,
                               powerup.pos);
  }

  world.on_powerup_die = function(powerup, player) {
    broadcast(OP_POWERUP_DIE, powerup.powerup_id, player.id);
  }

  /**
   *  Starts the game loop.
   *  @return {undefined} Nothing
   */
  function start_gameloop() {

    // Reset game world
    world.build(world.map_data, world.rules);

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

    if (gameloop) {
      gameloop.ontick = null;
      gameloop.kill();
      gameloop = null;
    }
  }

  function post_update() {
    update_tick++;
    for (var id in connections) {
      var time = get_time();
      var connection = connections[id];

      if (connection.state != JOINED) {
        continue;
      }

      if (connection.last_ping + 2000 < time) {
        connection.last_ping = time;
        connection.send(JSON.stringify([PING_PACKET]));
      }
      if (update_tick % connection.update_rate != 0) {
        continue;
      }
      for (var id in world.players) {
        var player = world.players[id];
        var message = [OP_PLAYER_STATE, player.id];
        if (player.entity) {
          message.push(pack_vector(player.entity.pos),
                       player.entity.angle,
                       player.entity.action);
          connection.queue(message);
        }
        if (update_tick % 200 == 0) {
          var player_connection = connection_for_player(player);
          connection.queue([OP_PLAYER_INFO, player.id, player_connection.ping]);
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

      if (connection.state != JOINED) {
        continue;
      }

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
        if (world.no_players > 1 && world.no_ready_players >= (world.no_players * world.rules.ready_ratio)) {
          world.set_round_state(ROUND_STARTING);
        }
        break;

      // Round is starting. Server aborts if a player leaves the game.
      case ROUND_STARTING:
        // if (world.no_ready_players < (world.no_players * 0.6)) {
        //   world.set_round_state(ROUND_WARMUP);
        //   return;
        // }
        if (t >= world.r_timer) {
          world.set_round_state(ROUND_RUNNING);
        }
        break;

      // The round is running. Wait for a winner.
      case ROUND_RUNNING:
        var winners = [];
        world.forEachPlayer(function(player) {
          if (player.score == world.rules.round_limit) {
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
          gameloop.ontick = null;
          gameloop.kill();
          load_map(null, true, function() {
            var t = 0;
            for(var id in connections) {
              var conn = connections[id];
              if (conn.state == JOINED) {
                conn.send(JSON.stringify([OP_WORLD_RECONNECT]));
                conn.set_state(HANDSHAKING);
              }
            }
          });
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
      var conn = connections[id];
      if (conn.state == JOINED) {
        var prio = callback(msg, conn);
        if (prio) conn.queue(msg);
      }
    }
  }

  /**
   *  pad single digit numbers with leading zero
   *  @param {Integer} Number
   *  @return {String} padded number
   */
  function pad0 (num) {
    return (num < 10)
      ? '0'+num
      : num;
  }

  /**
   *  Prints a system message on the console.
   *  @param {String} msg The message to print .
   *  @return {undefined} Nothing
   */
  function log(msg) {
    var now = new Date();
    console.log(pad0(now.getHours()) + ':' + pad0(now.getMinutes()) + ':' +
                pad0(now.getSeconds()) + ' ' + options.name + ': ' + msg);
  }

  /**
   *  Load a map
   *  @param path {String} path to map.
   *  @param default_on_fail {Boolean} loads the default map if the specified
   *                                   map failed to load.
   *  @return {undefined} Nothing
   */
  function load_map(path, default_on_fail, callback) {
    var map_path = path;

    function done(err, map_data) {
      if (!map_data && default_on_fail) {
        map_data = DEFAULT_MAP;
      }

      if (map_data) {

        if (gameloop) {
          gameloop.ontick = null;
          gameloop.kill();
        }

        world.build(map_data, get_rules(DEFAULT_OPTIONS, map_data.rules || {},
                                                                options.rules));

        if (gameloop) {
          gameloop = new GameLoop();
          gameloop.ontick = gameloop_tick;
          gameloop.start();
        }

      }
      callback(err);
    }

    if (!map_path) {
      if (maps.length == 0) {
        done(null, DEFAULT_MAP);
        return;
      } else {
        if (next_map_index >= maps.length) {
          next_map_index = 0;
        }
        map_path = maps[next_map_index];
        next_map_index++;
      }
    }

    fs.readFile(map_path, function (err, data) {
      if (err) {
        done('Failed to read map: ' + err);
        return;
      }
      try {
        done(null, JSON.parse(data));
      } catch(e) {
        done('Map file is invalid, bad format');
        return;
      }
    });
  }

  /**
   *  Create the web socket server.
   *  @param {function} callback The callback for new connections.
   *  @param {String} msg The message to broadcast.
   *  @return {undefined} Nothing
   */
  server = new WebSocketServer({
    port: parseInt(options.ws_port),
    host: options.host
  });
  
  server.on("connection", function(conn) {
    var connection_id     = 0,
        disconnect_reason = 'Closed by client',
        message_queue     = [];

    /**
     *  Sets client's information.
     */
    conn.set_client_info = function(info) {
      conn.rate = Math.min(info.rate, options.max_rate);
      conn.player_name = info.name;
      conn.dimensions = info.dimensions;
    }

    conn.send_server_info = function() {
      if (conn.debug) {
        log('Debug: Sending server state to ' + conn);
      }
      conn.post([OP_SERVER_INFO, shared.get_state()]);
    }

    /**
     *  Sends a chat message
     */
    conn.chat = function(message) {
      if (conn.player) {
        broadcast(OP_PLAYER_SAY, conn.player.id, message);
        log('Chat ' + conn.player.id + ': ' + message);
      }
    }

    conn.auth = function(password) {
      conn.is_admin = password == options.admin_password ? true : false;
      return conn.is_admin;
    }

    conn.exec = function() {
      var args = Array.prototype.slice.call(arguments);
      var command = args.shift();
      switch (command) {
        case 'map':
          var path = args.shift();
          load_map(path, false, function(err) {
            if (err) {
              conn.post([OP_SERVER_EXEC_RESP, err]);
            } else {
              for(var id in connections) {
                var conn = connections[id];
                conn.send(JSON.stringify([OP_WORLD_RECONNECT]));
                conn.set_state(HANDSHAKING);
              }
            }
          });
          return 'Loading map';

        case 'warmup':
          switch (world.r_state) {
            case ROUND_WARMUP:
              return 'Already in warmup mode';
            case ROUND_RUNNING:
            case ROUND_STARTING:
              world.set_round_state(ROUND_WARMUP);
              break;
            case ROUND_FINISHED:
              return 'Game has already finished';
          }
          return 'Changed';

        case 'start':
          switch (world.r_state) {
            case ROUND_WARMUP:
              world.set_round_state(ROUND_STARTING);
              break;
            case ROUND_STARTING:
              world.set_round_state(ROUND_RUNNING);
              break;
            case ROUND_RUNNING:
              return 'Game is already started. Type sv_restart to restart';
            case ROUND_FINISHED:
              return 'Game has already finished';
          }
          return 'Changed';

        case 'restart':
          switch (world.r_state) {
            case ROUND_WARMUP:
            case ROUND_STARTING:
              return 'Cannot restart warmup round';
            case ROUND_RUNNING:
              world.set_round_state(ROUND_STARTING);
              break;
            case ROUND_FINISHED:
              world.set_round_state(ROUND_STARTING);
              break;
          }
          return 'Changed';

        case 'kick':
          var name = args.shift();
          var reason = args.shift();
          world.forEachPlayer(function(player) {
            if (player.name == name) {
              var conn = connection_for_player(player);
              conn.kill(reason);
              return "Player kicked";
            }
          })
          return "Player not found";
      }
    }

    /**
     *  Forces a connection to be disconnected.
     */
    conn.kill = function(reason) {
      disconnect_reason = reason || 'Unknown Reason';
      this.post([OP_DISCONNECT_REASON, disconnect_reason]);
      this.close();
      message_queue = [];
    }

    /**
     *  Queues the specified message and sends it on next flush.
     */
    conn.queue = function(msg) {
      if (conn.state == JOINED) {
        message_queue.push(msg);
      }
    }

    /**
     *  Stringifies specified object and sends it to remote part.
     */
    conn.post = function(data) {
      var packet = JSON.stringify(data);
      this.send(packet);
    }

    /**
     *  Posts specified data to this instances message queue
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

      try {
        this.send('[' + GAME_PACKET + ',[' + packet_data.join(',') + ']]');
        this.data_sent += data_sent;
      } catch (err) {
        return;
      }


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
          if (no_connections++ > options.max_connections) {
            conn.kill('server busy');
            return;
          }

          while (connections[++connection_id]);

          conn.id = connection_id;
          conn.player = null;
          conn.player_name = null;
          conn.is_admin = false;
          conn.rate = options.max_rate;
          conn.update_rate = 2;
          conn.max_rate = options.max_rate;
          conn.last_rate_check = get_time();
          conn.last_ping = 0;
          conn.ping = 0;
          conn.data_sent = 0;
          conn.dimensions = [640, 480];
          conn.state = IDLE;
          conn.debug = options.debug;

          connections[conn.id] = conn;

          break;

        case HANDSHAKING:
          if (!gameloop) {
            start_gameloop();
          }

          if (world.no_players >= world.max_players) {
            conn.kill('Server is full');
          } else {
            conn.post([OP_WORLD_DATA, world.map_data, world.rules]);

            if (conn.debug) {
              log('Debug: ' + conn + ' connected to server. Sending handshake...');
            }
          }
          break;

        case JOINED:
          var playeridincr = 0;

          while (world.players[++playeridincr]);

          conn.player = world.add_player(playeridincr, conn.player_name);

          conn.post([OP_WORLD_STATE, conn.player.id].concat(world.get_repr()));

          log(conn + conn.player_name + ' joined the game.');
          break;

        case DISCONNECTED:
          if (conn.id && connections[conn.id]) {
            delete connections[conn.id];

            no_connections--;

            if (conn.player) {
              world.remove_player(conn.player.id, disconnect_reason);
              conn.player = null;
              log(conn + ' left the game (Reason: ' + disconnect_reason + ')');
            }

            if (world.no_players == 0) {
              stop_gameloop();
            }

            if (conn.debug) {
              log('Debug: ' + conn + ' disconnected (Reason: ' + disconnect_reason + ')');
            }
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

    // Connection 'receive' event handler. Occures each time that client sent
    // a message to the server.
    conn.on('message', function(data) {
      var packet = null;

      try {
        packet = JSON.parse(data);
      } catch(e) {
        console.error('Malformed message recieved');
        console.error(inspect(data));
        conn.kill('Malformed message sent by client');
        return;
      }

      switch(packet[0]) {

        case GAME_PACKET:
          if (world) {
            process_game_message([packet[1], conn.player, world]);
          }
          break;

        case PING_PACKET:
          conn.ping = get_time() - conn.last_ping;
          break;

        default:
          process_control_message([packet, conn]);
          break;

      }
    });

    // Connection 'close' event listener. Occures when the connection is
    // closed by user or server.
    conn.on('close', function() {
      conn.set_state(DISCONNECTED);
    });


    // Connection 'connect' event handler. Challenge the player and creates
    // a new PlayerSession.
    conn.set_state(CONNECTED);

    conn.remoteAddress = conn._socket.remoteAddress;
  });

  load_map(null, true, function(err) {
    console.log('Starting Game Server server at ' + shared.get_state().game_server_url);
    // server.listen(parseInt(options.ws_port), options.host);
  });

  return server;
}

/**
 *  Processes a control message from a connection.
 */
var process_control_message = match (

  [[OP_REQ_SERVER_INFO], {'state =': CONNECTED}],
  function(conn) {
    conn.send_server_info();
  },

  /**
   *  MUST be sent by the client when connected to server. It's used to validate
   *  the session.
   */
  [[OP_CLIENT_CONNECT, String], {'state =': CONNECTED}],
  function(version, conn) {
    if (version != SERVER_VERSION) {
      conn.kill('Wrong version');
    } else {
      conn.set_state(HANDSHAKING);
    }
  },

  /**
   *  Client has received world data. Client is now a player of the world.
   */
  [[OP_CLIENT_JOIN, Object], {'state =': HANDSHAKING}],
  function(info, conn) {
    conn.set_client_info(info);
    conn.set_state(JOINED);
  },

  [[OP_CLIENT_SAY, String], {'state =': JOINED}],
  function(message, conn) {
    if (message.length > 200) {
      conn.kill('Bad chat message');
    } else {
      conn.chat(message);
    }
  },

  [[OP_CLIENT_SET, 'rate', Number], {'state =': JOINED}],
  function(rate, conn) {
    conn.rate = Math.min(rate, conn.max_rate);
  },

  [[OP_CLIENT_EXEC, String, 'kick', String, String], {'state =': JOINED}],
  function(password, player_name, reason, conn) {
    if (conn.auth(password)) {
      var resp = conn.exec('kick', player_name, reason);
      conn.post([OP_SERVER_EXEC_RESP, resp]);
    } else {
      conn.post([OP_SERVER_EXEC_RESP, 'Wrong password']);
    }
  },

  [[OP_CLIENT_EXEC, String, 'map', String], {'state =': JOINED}],
  function(password, path, conn) {
    if (conn.auth(password)) {
      var resp = conn.exec('map', path);
      conn.post([OP_SERVER_EXEC_RESP, resp]);
    } else {
      conn.post([OP_SERVER_EXEC_RESP, 'Wrong password']);
    }
  },

  [[OP_CLIENT_EXEC, String, 'warmup'], {'state =': JOINED}],
  function(password, conn) {
    if (conn.auth(password)) {
      var resp = conn.exec('warmup');
      conn.post([OP_SERVER_EXEC_RESP, resp]);
    } else {
      conn.post([OP_SERVER_EXEC_RESP, 'Wrong password']);
    }
  },

  [[OP_CLIENT_EXEC, String, 'start'], {'state =': JOINED}],
  function(password, conn) {
    if (conn.auth(password)) {
      var resp = conn.exec('start');
    } else {
      conn.post([OP_SERVER_EXEC_RESP, 'Wrong password']);
    }
  },

  [[OP_CLIENT_EXEC, String, 'restart'], {'state =': JOINED}],
  function(password, conn) {
    if (conn.auth(password)) {
      var resp = conn.exec('restart');
      conn.post([OP_SERVER_EXEC_RESP, resp]);
    } else {
      conn.post([OP_SERVER_EXEC_RESP, 'Wrong password']);
    }
  },

  function(data) {
    console.error(data);
    console.error(data[1].state);
    data[1].kill('Bad control message');
  }

);

/**
 *  Processes a game message from specified player.
 */
var process_game_message = match (

  [[OP_CLIENT_SET, 'ready'], _, _],
  function(player, world) {
    world.set_player_ready(player.id);
  },

  [[OP_CLIENT_SET, 'name', String], _, _],
  function(name, player, world) {
    world.set_player_name(player.id, name);
  },

  /**
   *  Players command state has changed.
   */
  [[OP_CLIENT_STATE, Number, Number], _, _],
  function(action, angle, player, world) {
    player.action = action;
    if (!player.dead) {
      player.entity.angle = angle;
    }
  },

  /**
   *  The message sent by the client could not be matched. Kill the session
   */
  function(obj) {
    console.error(inspect(obj[0]));
    var connection = obj[1].connection;

    if (connection.debug) {
      console.error('Unhandled message:');
      console.error(inspect(obj[0]));
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
  console.log('Starting HTTP server at http://' + options.host + ':' + options.http_port);
  var server = fu.listen(parseInt(options.http_port), options.host);

  for (var i=0; i < CLIENT_DATA.length; i++) {
    var virtualpath = CLIENT_DATA[i + 1] + path.basename(CLIENT_DATA[i]);
    fu.get('/' + virtualpath, fu.staticHandler(CLIENT_DATA[i]));
    i++;
  }

  fu.get('/', fu.staticHandler(CLIENT_DATA[0]));

  fu.get('/state', function (req, res) {
    res.writeHead(200, {'Content-Type': 'application/json'});
    res.write(JSON.stringify(shared.get_state()), 'utf8');
    res.end();
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
  return mixin(rules, mixin(map_rules, user_rules));
}


/**
 *  Parses and returns server options from ARGV.
 *  @returns {Options} Server options.
 */
function parse_options() {
  var parser  = new optparse.OptionParser(SWITCHES),
      result = { rules: {}, maps: []};
  parser.banner = 'Usage: wpilots.js [options]';

  parser.on('help', function() {
    console.log(parser.toString());
    parser.halt();
  });

  parser.on('map', function(prop, value) {
    result.maps.push(value);
  });

  parser.on('*', function(opt, value) {
    var match = opt.match(/^r_([a-z_]+)/);
    if (match) {
      result.rules[match[1]] = value;
    }
    result[opt] = value || true;
  });

  parser.parse(process.argv);
  return parser._halt ? null : mixin(DEFAULT_OPTIONS, result);
}

function get_unique_name(players, player_id, name) {
  var count = 0;
  var unique_name = name;
  while (true) {
    for (var id in players) {
      if (player_id == id) {
        continue;
      }
      if (players[id].name != unique_name) {
        return unique_name;
      }
      count++
    }
    if (count == 0) {
      return name;
    }
    unique_name += '_';
  }
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

/**
 *  Quick'n'dirty mixin replacement
 */
function mixin(a, b) {
  var result = {}

  for (var prop in a) {
    result[prop] = a[prop];
  }

  for (var prop in b) {
    result[prop] = b[prop];
  }

  return result;
}

// Call programs entry point
main();
