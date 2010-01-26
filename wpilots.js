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
    fu        = require('./lib/fu');
    ws        = require('./lib/ws'),
    optparse  = require('./lib/optparse'),
    match     = require('./lib/match').Match;

var _         = match.incl;

process.mixin(require('./lib/gameobjects'));

const SERVER_VERSION       = '(develop version)';

const RE_POLICY_REQ = /<\s*policy\-file\-request\s*\/>/i,
      POLICY_RES    = "<cross-domain-policy><allow-access-from domain=\"*\" to-ports=\"*\" /></cross-domain-policy>";

// Message priorities. Not supported in current version of server.
const PRIO_HIGH     = 3,
      PRIO_MID      = 2,
      PRIO_LOW      = 1;

// Player Connection states      
const CONNECTING    = 1,
      OK            = 2;

// Command line option parser switches
const SWITCHES = [
  ['-d', '--debug',               'Enables debug mode (Default: false)'],
  ['-H', '--help',                'Shows this help section'],
  ['-p', '--serve_flash_policy',  'Enables the Flash Socket Policy Server, must be run as root (Default: false)'],
  ['--name NAME',                 'The name of the server.'],
  ['--host HOST',                 'The host adress (default: 127.0.0.1).'],
  ['--pub_host HOST',             'Set if the public host differs from the local one'],
  ['--http_port PORT',            'Port number for the HTTP server (default: 6114)'],
  ['--ws_port PORT',              'Port number for the WebSocket server (default: 6115)'],
  ['--pub_ws_port PORT',          'Set if the public WebSocket port differs from the local one'],
  ['--policy_port PORT',          'Port number for the Flash Policy server (default: 843)'],
  ['--max_players NUMBER',        'Max connected players allowed in server simultaneously (default: 8)'],
  ['--world_width NUMBER',        'The world width (Default: 1000)'],
  ['--world_height NUMBER',       'The world height (Default: 1000)'],
  ['--update_rate NUMBER',        'Represent the frame no where updates are sent to clients. (Default: 10)'],
  ['--r_start_delay NUMBER',      'Rule: Time before game starts after warmup (Default: 300)'],
  ['--r_respawn_time NUMBER',     'Rule: Player respawn time after death. (Default: 500)'],
  ['--r_reload_time NUMBER',      'Rule: The reload time after fire. (Default: 15)'],
  ['--r_shoot_cost NUMBER',       'Rule: Energy cost of shooting a bullet. (Default: 800)'],
  ['--r_shield_cost NUMBER',      'Rule: Energy cost of using the shield. (Default: 70)'],
  ['--r_energy_recovery NUMBER',  'Rule: Energy recovery unit (Default: 40)'],
  ['--r_round_limit NUMBER',      'Rule: Round score limit (Default: 10)'],
  ['--r_round_rs_time NUMBER',    'Rule: Restart time after round finished (Default: 600)'],
  ['--r_penelty_score NUMBER',    'Rule: The cost of suicides (Default: 1)'],
  ['--r_kill_score NUMBER',       'Rule: The price of a kill (Default: 1)']
];

// Default server options
const DEFAULT_OPTIONS = {
  debug:                false, 
  name:                 'WPilot Server',
  host:                 '127.0.0.1',
  pub_host:             null,
  http_port:            6114,
  ws_port:              6115,
  pub_ws_port:          null,
  max_players:          8,
  policy_port:          843,
  serve_flash_policy:   false,
  world_width:          1000,
  world_height:         1000,
  update_rate:          10,
  r_start_delay:        200,
  r_respawn_time:       400,
  r_reload_time:        15,
  r_shoot_cost:         300,
  r_shield_cost:        70,
  r_energy_recovery:    40,
  r_round_limit:        10,
  r_round_rs_time:      600,
  r_penelty_score:      1,
  r_kill_score:         1
};

// Paths to all files that should be server to client.
const CLIENT_DATA = [
  'client/index.html',
  'client/style.css',
  'client/logo.png',
  'client/space.jpg',
  'client/wpilot.js',
  'lib/gameobjects.js',
  'lib/match.js',
  'client/web_socket.js',
  'client/swfobject.js',
  'client/FABridge.js',
  'client/particle.js',
  'client/WebSocketMain.swf',
  'client/crossdomain.xml' 
];

// Player colors
const PLAYER_COLORS = [
  '255, 176,  0',
  '51,  182,  255',
  '172, 48,   224',
  '230, 21,   90',
  '166, 219,  0',
  '125, 142,  22',
  '244, 52,   0',
  '199, 244,  136',
  '227, 111,  160',
  '63,  140,  227',
  '227, 126,  76',
  '134, 213,  227'
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
      state           = {},
      webserver       = null,
      gameserver      = null,
      policy_server   = null;

  if (!options) return;

  sys.puts('WPilot server ' + SERVER_VERSION);
  
  webserver = start_webserver(options, state);
  gameserver = start_gameserver(options, state);
  policy_server = options.serve_flash_policy ? start_policy_server(options) : null;
}

/**
 *  Starts the web socket game server.
 *  @param {GameOptions} options Game options.
 *  @returns {WebSocketServer} Returns the newly created WebSocket server 
 *                             instance.
 */
function start_gameserver(options, state) {
  var connections     = {},
      gameloop        = null,
      world           = null,
      server          = null,
      delayed_actions = {},
      conn_id         = 1,
      update_rate     = options.update_rate,
      rules           = get_rules(options);
  
  // Represents a state object that is shared between game server and web server.
  state.server_name       = options.name;
  state.game_server_url   = 'ws://' + (options.pub_host || options.host) + ':' + 
                            (options.pub_ws_port || options.ws_port) + '/';
  state.max_players       = options.max_players;
  state.no_players        = 0;
  state.no_ready_players  = 0;
  state.update_rate       = options.update_rate;
  state.flash_compatible  = options.serve_flash_policy;
  state.world_width       = options.world_width;
  state.world_height      = options.world_height;
  state.rules             = rules;

  /**
   *  The acutal game loop.
   *  @param {Number} t Current world time.
   *  @param {Number} dt Current delta time,
   *  @return {undefined} Nothing
   */
  function gameloop_tick(t, dt) {
    do_game_logic(t, dt);
    world.update(t, dt);
    check_collisions(t, dt);
    check_rules(t, dt);
    post_state_updates(t, dt);
    flush_queues();
  }
  
  /**
   *  Starts the game loop. 
   *  @return {undefined} Nothing
   */
  function start_gameloop() {
    log('Creating server World...');
    world = new World({
      id: 1,
      state: 'waiting',
      w: options.world_width,
      h: options.world_height
    });
    world.build();

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
      connections[id].kill('Server is shutting down')
    }
    
    world.r_state = 'waiting';

    gameloop.kill();
    gameloop = null;
    world = null;
  }  
  
  /**
   *  Checks and resolvs collision between entities.
   *  @param {Number} t Current world time.
   *  @param {Number} dt Current delta time,
   *  @return {undefined} Nothing
   */
  function check_collisions(t, dt) {
    var intersections = world.get_intersections(),
        index = intersections.length
        trash = [];
    
    while (index--) {
      var intersection = intersections[index];
      COLLISSION_RESOLVER([intersection.entity, intersection.target, trash]);
    }
    
    index = trash.length;
    while (index--) {
      var entity = trash[index];
      world.delete_by_id(entity.id);
      broadcast([ENTITY + DESTROY, entity.id]);
    }
  }
  
  /**
   *  Post updates to connected clients. 
   *  @param {Number} t Current world time.
   *  @param {Number} dt Current delta time,
   *  @return {undefined} Nothing
   */
  function post_state_updates(t, dt) {
    var time = parseInt(t * 1000);
    if (time % update_rate == 0) {
      world.each_uncommited(function(item) {
        if (item.update_interval && time % item.update_interval == 0) {
          var connection = null;
          if (item.player) {
            connection = item.player.connection;
            connection.queue([item.subject + STATE, item.id, item.changed_values('dynamic')]);
            broadcast_exclude(connection, [item.subject + STATE, item.id, item.changed_values()]);
          } else {
            broadcast([item.subject + STATE, item.id, item.changed_values()]);
          }
          item.commit();
        }
      });
    }
    if (world.is_changed('round')) {
      broadcast([WORLD + STATE, world.changed_values()]);
      world.commit();
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
   *  Do game logics
   *  @param {Number} t Current world time.
   *  @param {Number} dt Current delta time,
   *  @return {undefined} Nothing
   */
  function do_game_logic(t, dt) {
    for (var id in world.players) {
      var player = world.players[id];

      if (player.respawn_time && t >= player.respawn_time) {
        player.respawn_time = 0;
        player.spawn_ship(world.find_respawn_pos());
      }
    
      if (player.is_dead && !player.respawn_time) {
        if (world.r_state == 'running') {
          player.respawn_time = t + rules.respawn_time * dt;
        } else {
          player.respawn_time = t + 10 * dt;
        }
      }

      if (player.entity) {
        var entity = player.entity;

        entity.set_prop(THRUST, player[THRUST]);
        entity.set_prop(ROTATE, player[ROTATE]);

        if (player[SHIELD] && player.e >= rules.shield_cost * dt) {
          player.set_props({
            e: player.e - rules.shield_cost * dt
          });
          entity.set_prop(SHIELD, 1);
        } else {
          entity.set_prop(SHIELD, 0);
        }

        if (player.reload_time && t >= player.reload_time) {
          player.reload_time = 0;
        } 
        
        if (player[SHOOT] && !player.reload_time && player.e >= rules.shoot_cost * dt) {
          entity.set_prop(SHOOT, 1);
          player.set_props({
            e: player.e - rules.shoot_cost * dt
          });
          player.reload_time = t + rules.reload_time * dt;
          player.spawn_bullet();
        } else {
          entity.set_prop(SHOOT, 0);
        }
        
        if (player.e <= 100 && !player[SHIELD] && !player[SHOOT]) {
          player.set_props({
            e: player.e + rules.energy_recovery * dt
          });
        }
      }
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
      case 'waiting':
        if (state.no_players > 1 && state.no_ready_players >= (state.no_players * 0.6)) {
          world.set_props({
            r_state: 'starting',
            r_start_at: t + rules.start_delay * dt
          });
          world.each('players', function(player) {
            if (player.entity) {
              world.delete_by_id(player.entity.id);
              broadcast([ENTITY + DESTROY, player.entity.id]);
            }
          });
        }
        break;
        
      // Round is starting. Server aborts if a player leaves the game.
      case 'starting':
        if (state.no_ready_players < (state.no_players * 0.6)) {
          world.set_props({
            r_state: 'waiting',
            r_start_at: 0
          });
          world.each('players', function(player) {
            player.spawn_ship(world.find_respawn_pos());
          });
          return;
        }
        if (t >= world.r_start_at) {
          world.set_props({
            r_state: 'running',
            r_start_at: 0
          });
          world.each('players', function(player) {
            player.set_props({st: 0, s: 0});
            player.spawn_ship(world.find_respawn_pos());
          });
          state.no_ready_players = 0;
        }
        break;
        
      // The round is running. Wait for a winner.
      case 'running':
        var winners = [];
        world.each('players', function(player) {
          if (player.s == rules.round_limit) {
            winners.push(player.id);
          }
        });
        if (winners.length) {
          world.set_props({
            r_state: 'finished',
            r_restart_at: t + rules.round_rs_time * dt,
            r_winners: winners
          });
          world.each('players', function(player) {
            if (player.entity) {
              world.delete_by_id(player.entity.id);
              broadcast([ENTITY + DESTROY, player.entity.id]);
            }
            player.is_dead = false;
            player.respawn_time = 0;
          });
        }
        break;

      // The round is finished. Wait for restart
      case 'finished':
        if (t >= world.r_restart_at) {
          world.set_props({
            r_state: 'waiting',
            r_restart_at: 0,
            r_winners: []
          });
          world.each('players', function(player) {
            player.set_props({
              s: 0,
              e: 100
            });
            player.spawn_ship(world.find_respawn_pos());
          });
        }
        break;
    }
  }
  
  /**
   *  Broadcasts specified message to all current connections.
   *  @param {String} msg The message to broadcast.
   *  @return {undefined} Nothing
   */
  function broadcast(msg) {
    for(var id in connections) {
      connections[id].queue(msg);
    }
  }

  /**
   *  Broadcasts a message to all connections except to the one specified.
   *  @param {tcp.Connection} exclude The connection to exclude from the 
   *                                  broadcast.
   *  @param {String} msg The message to broadcast.
   *  @return {undefined} Nothing
   */
  function broadcast_exclude(exclude, msg) {
    for(var id in connections) {
      if (exclude.id != id) {
        connections[id].queue(msg);
      }
    }
  }
  
  /**
   *  Prints a system message in the console.
   *  @param {String} msg The message to print .
   *  @return {undefined} Nothing
   */
  function log(msg) {
    sys.puts(state.server_name + ': ' + msg);
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
    
    // Add connection to server's connection list.
    connections[connection_id] = conn;

    //  
    //  const Connection.is_game_conn
    //
    conn.is_game_conn = true;
    
    //  
    //  const Connection.id
    //  The unique id for this Connection instance.
    //
    conn.id = connection_id;

    //  
    //  variable Connection.warnings
    //
    conn.warnings       = 0;
    
    // 
    //  method Connection.kill
    //  Forces a connection to be disconnected. 
    //
    conn.kill = function(reason) {
      disconnect_reason = reason || 'Unknown Reason';
      this.queue([SERVER + DISCONNECT, disconnect_reason]);
      this.flush_queue();
      this.close();
    }
    
    //
    //  method Connection.queue
    //  Queues the specified message and sends it on next flush.
    // 
    conn.queue = function(data) {
      message_queue.push(data);
    }

    //
    //  method Connection.post
    //  Stringify speicified object and sends it to remote part.
    // 
    conn.post = function(data) {
      var msg = JSON.stringify(data);
      this.send(msg);
    }

    //
    //  method Connection.flush_queue
    //  Post's specified data to this instances message queue
    // 
    conn.flush_queue = function() {
      if (message_queue.length) {
        var msg = JSON.stringify([MULTIPART, message_queue]);
        this.send(msg);
        message_queue = [];
      }
    }
    
    //
    //  method Connection.toString
    //  Returns a String representation for this Connection
    // 
    conn.toString = function() {
      return this.remoteAddress + '(id: ' + this.id + ')';
    }

    // 
    //  event connect
    //  Connection ´connect´ event handler. Challenge the player and creates 
    //  a new PlayerSession.
    //
    conn.addListener('connect', function(resource) {
      conn.post([SERVER + STATE, state]);
    });

    // 
    //  event receive
    //  Connection ´recieve´ event handler. Occures each time that client sent
    //  a message to the server.
    //
    conn.addListener('receive', function(data) {
      try {
        var graph = JSON.parse(data);        
      } catch(e) {
        sys.debug('Malformed message recieved');
        require('sys').debug(sys.inspect(data));
        conn.kill('Malformed message sent by client');
        return;
      }

      // Check if message is  aso called MULTIPART message. MULTIPART messages
      // is handled a little bit different then single messages.
      var messages = graph[0] == MULTIPART ? graph[1] : [graph];
      for (var i = 0; i < messages.length; i++) {
        PROCESS_MESSAGE([messages[i], player || conn]);
      }
    });

    // Custom event. Occures when a player try's to join the game.
    // 
    conn.addListener('client-join', function(data) {
      if (!gameloop) {
        start_gameloop();
      }

      if (state.no_players == state.max_players) {
        return conn.kill('Server is full');
      }

      player = new Player({ id: connection_id }, conn, world);

      player.events.addListener('spawn', function(entity) {
        broadcast([ENTITY + SPAWN, entity.repr()])
      });
      
      player.events.addListener('state_changed', function(state) {
        switch (state) {
          case OK:
            broadcast_exclude(conn, [PLAYER + CONNECT, player.repr()]);
            player.spawn_ship(world.find_respawn_pos());
            log(conn + ' joined the game.');
            break;
        }
      });
      
      player.events.addListener('ready', function() {
        if (world.r_state == 'waiting') {
          state.no_ready_players = state.no_ready_players + 1;
          broadcast([PLAYER + READY, player.id]);
        }
      });
      
      player.events.addListener('dead', function(death_cause, killer) {
        switch (death_cause) {
          case DEATH_CAUSE_SUICDE:
            player.set_prop('s', player.s - rules.penelty_score < 0 ? 0 : player.s - rules.penelty_score);
            break;
          case DEATH_CAUSE_KILLED:
            killer.set_prop('s', killer.s + rules.kill_score);
            break;
        }
        broadcast([PLAYER + DESTROY, player.id, death_cause, killer ? killer.id : -1]);
      });

      world.players[connection_id] = player;

      state.no_players = state.no_players + 1

      log(conn + ' connected to server. Sending handshake...');
      conn.post([SERVER + HANDSHAKE, connection_id, gameloop.tick, world.repr(), world.list_repr('entities'), world.list_repr('players')]);
    });

    //
    //  event close
    //  Connection ´close´ event listener. Occures when the connection is 
    //  closed by user or server.
    //
    conn.addListener('close', function() {
      if (connections[connection_id]) {
        delete connections[connection_id];

        if (player) {
          delete world.players[connection_id];

          state.no_players = state.no_players - 1;
          state.no_ready_players = state.no_ready_players - 1;

          if (state.no_players == 0) {
            stop_gameloop();
          }
        }

        broadcast([PLAYER + DISCONNECT, connection_id, disconnect_reason]);    
      }
      
      log(conn + ' disconnected (Reason: ' + disconnect_reason + ')');
    });
    
  });
  
  sys.puts('Starting Game Server server at ' + state.game_server_url);
  server.listen(options.ws_port, options.host);
  
  return server;
}

/**
 *  PROCESS_MESSAGE
 *  Processes a message from specified session. 
 *  
 */
var PROCESS_MESSAGE = match (

  /**
   *  MUST be sent by the client when connected to server. It's used to validate
   *  the session.
   */
  [[CLIENT + CONNECT], {'is_game_conn =': true}], function(conn) {
    conn.emit('client-join');
  },
  
  /**
   *  Client has received world data. Client is now a player of the world.
   */
  [[CLIENT + HANDSHAKE], {'state =': CONNECTING}], function(player) {
    player.set_state(OK);
  },

  /**
   *  Indicates that the player state ROTATE is changed
   */
  [[CLIENT + COMMAND, ROTATE, Number], { 'state =': OK }], 
  function(value, player) {
    player[ROTATE] = value;
  },

  /**
   *  Indicates that the player state THRUST is changed
   */
  [[CLIENT + COMMAND, THRUST, Number], { 'state =': OK }], 
  function(value, player) {
    player[THRUST] = value;
  },

  /**
   *  Indicates that the player state SHOOT is changed
   */
  [[CLIENT + COMMAND, SHOOT, Number], { 'state =': OK }],
  function(value, player) {
    player[SHOOT] = value;
  },

  /**
   *  Indicates that the player state SHIELD is changed
   */
  [[CLIENT + COMMAND, SHIELD, Number], { 'state =': OK }],
  function(value, player) {
    player[SHIELD] = value;
  },

  /**
   *  Indicates that player is ready to start the round
   */
  [[CLIENT + COMMAND, READY], { 'state =': OK }], function(player) {
    if (player.st != READY) {
      player.set_props({ st: READY });
      player.events.emit('ready');
    }
  },

  //
  //  Default message handler.
  //
  //  The message sent by client could not be matched. The session get's a 
  //  warning. The session is disconnected after three warnings.
  //
  function(obj) {
    var message = obj[0]
    var connection = obj[1].is_game_conn ? obj[1] : obj[1].connection;

    connection.warnings += 1;
    
    if (connection.warnings > 3) {
      connection.kill('Too many malformed messages.');
    }

    sys.puts('Unhandled message:');
    sys.puts(sys.inspect(message[0]));
    // sys.puts(sys.inspect(msg));
  }

);

/**
 *  Resolvs collision between two entities
 */
var COLLISSION_RESOLVER = match (

  /**
   *  Check collission between Ship and Bullet
   */
  [Ship, Bullet, Array], function(ship, bullet, trash) {  
    if (ship[SHIELD]) {
      trash.push(bullet);
    } else if (ship.id != bullet.oid) {
      ship.player.die(DEATH_CAUSE_KILLED, bullet.player);
      trash.push(ship);
      trash.push(bullet);
    }
  },
  [Bullet, Ship, Array], function(bullet, ship, trash) { 
    return COLLISSION_RESOLVER([ship, bullet, trash]);
  },

  /**
   * Check collission between Ship and Wall 
   */
  [Ship, Wall, Array], function(ship, wall, trash) {
    if (ship[SHIELD]) {
      if (wall.w > wall.h) {
        ship.set_props({
          sy: -ship.sy
        });
      } else {
        ship.set_props({
          sx: -ship.sx
        });
      }
    } else {
      ship.player.die(DEATH_CAUSE_SUICDE);
      trash.push(ship);
    }
  },

  /**
   * Check collission between Bullet and Wall 
   */
  [Bullet, Wall, Array], function(bullet, wall, trash) {
    trash.push(bullet);
  },

  /**
   * Check collission between Ship and Ship 
   */
  [Ship, Ship, Array], function(ship_a, ship_b, trash) {
    if (!ship_a[SHIELD] && !ship_b[SHIELD]) {
      ship_a.player.die(DEATH_CAUSE_SUICDE);
      ship_b.player.die(DEATH_CAUSE_SUICDE);
      trash.push(ship_a);
      trash.push(ship_b);
    } else if(ship_a[SHIELD] && ship_b[SHIELD]) {
      ship_a.set_props({
        sx: -ship_a.sx,
        sy: -ship_a.sy
      });
      ship_b.set_props({
        sx: -ship_b.sx,
        sy: -ship_b.sy
      });
    } else {
      if (!ship_a[SHIELD]) {
        ship_a.player.die(DEATH_CAUSE_KILLED, ship_b.player);
        trash.push(ship_a);
      } 
      if (!ship_b[SHIELD]) {
        ship_b.player.die(DEATH_CAUSE_KILLED, ship_a.player);
        trash.push(ship_b);
      } 
    }
  }

);

/**
 *  GameObject.dump
 *  Extends the GameObject with a "print-to-stdout" method.
 */
GameObject.dump = function() {
  var item = this.repr();
  var result = this.type + '#' + this.id + ': { ';
  for (var name in item) {
    result += name + ': ' + item;
  };
  result += '}';
  sys.debug(result);
}


Player.prototype.before_init = function(initials, connection, world) {
  this.events         = new process.EventEmitter(); 
  this.connection     = connection;
  this.world          = world;
  this.state          = CONNECTING;
  this.reload_time    = 0;
  this.respawn_time   = 0;
  this.is_dead        = false;
  initials.name       = get_random_value(PLAYER_NAMES);
  initials.color      = get_random_value(PLAYER_COLORS);
}

Player.prototype.get_entity = function() {
  return this.world ? this.world.find(this.eid) : null;
}

Player.prototype.set_state = function(new_state) {
  if (this.state != new_state) {
    this.state = new_state;
    this.events.emit('state_changed', new_state);
  }
}

/**
 *  Spawns a new player ship at a random location.
 *  @return {gameobjects.Ship} The newly created Ship instance.
 */
Player.prototype.spawn_ship = function(pos) {
  var entity = this.world.spawn_entity('ship', {
    pid: this.id,
    x: pos.x,
    y: pos.y
  });
  entity.player = this;
  this.is_dead = false;
  this.events.emit('spawn', entity);
  this.set_prop('eid', entity.id);
  this.entity = entity;
  return entity;
}

/**
 *  Kills a player
 *  @param {DEATH_CAUSE_*} death_cause The cause of death
 *  @param {Player} killed_by The killer if not suicide.
 *  @return {undefined} Nothing
 */
Player.prototype.die = function(death_cause, killed_by) {
  this.is_dead = true;
  this.entity = null;
  this.events.emit('dead', death_cause, killed_by);
}

/**
 *  Spawns a new bullet.
 *  @return {gameobjects.Bullet} The newly created Bullet instance.
 */
Player.prototype.spawn_bullet = function() {
  var bullet = this.world.spawn_bullet(this.entity);
  bullet.player = this;
  this.events.emit('spawn', bullet);
  return bullet;
}

/**
 *  Is called upon before init.
 *  @return {undefined} Nothing
 */
World.prototype.before_init = function() {
  this.entity_count = 1;
}

/**
 *  Find's a position to respawn on. 
 *  @return {x, y} A point to a location where it's safe to spawn.
 */
World.prototype.find_respawn_pos = function() {
  var bounds = { x: 0, y: 0, w: 60, h: 60};
      pos    = null;

  while (pos == null) {
    bounds.x = 50 + (Math.random() * (this.w - 100));
    bounds.y = 50 + (Math.random() * (this.h - 100));
    if (!this.bounds_intersects(bounds)) {
      pos = {x: bounds.x + 30, y: bounds.y + 30};
    }
  }
  
  return pos;
}

/**
 *  Builds the world
 *  @return {undefined} Nothing
 */
World.prototype.build = function() {
  this.spawn_entity('wall', {
    x: 0, y: 0, w: this.w + 10, h: 10, o: 'n'
  });
  this.spawn_entity('wall', {
    x: this.w, y: 0, w: 10, h: this.h + 10, o: 'e'
  });
  this.spawn_entity('wall', {
    x: 0, y: this.h , w: this.w + 10, h: 10, o: 's'
  });
  this.spawn_entity('wall', {
    x: 0, y: 0, w: 10, h: this.h + 10, o: 'w'
  });
}

/**
 *  Starts a webserver that serves WPilot client related files.
 *  @param {Object} options Web server options.
 *  @return {http.Server} Returns the HTTP server instance.
 */
function start_webserver(options, state) {
  sys.puts('Starting HTTP server at http://' + options.host + ':' + options.http_port);
  var server = fu.listen(options.http_port, options.host);

  for (var i=0; i < CLIENT_DATA.length; i++) {
    fu.get('/' + path.basename(CLIENT_DATA[i]), fu.staticHandler(CLIENT_DATA[i]));
  }
  
  fu.get('/', fu.staticHandler(CLIENT_DATA[0]));
  
  fu.get('/state', function (req, res) {
    res.sendHeader(200, {'Content-Type': 'application/json'});
    res.sendBody(JSON.stringify(state), 'utf8');
    res.finish();
  });
  
  return server;
}

/**
 *  Starts a Flash Socket Policy server that servers the required policy file
 *  for clients that uses the Flash WebSocket plugin.
 *
 *  Based on an example by "tautologistics" (http://github.com/zimbatm/nodejs-http-websocket/tree/master/example/socketpolicy.js)
 *  @param {Object} options Policy server options.
 *  @return {tcp.Server} Returns the newly created policy server.
 */
function start_policy_server(options) {
  var tcp = require("tcp");

  var server = tcp.createServer(function (socket) {
  	socket.setEncoding("utf8");
  	socket.inBuffer = "";
  	socket.addListener("connect", function () {
  	  if (options.debug) {
  	    sys.debug(socket.remoteAddress + ' connected to policy server');
  	  }
  	}).addListener("receive", function (data) {
  		socket.inBuffer += data;
  		if (socket.inBuffer.length > 32) {
  			socket.close();
  			return;
  		}
  		if (RE_POLICY_REQ.test(socket.inBuffer)) {
  	    sys.debug('Sending policy file to ' + socket.remoteAddress + '');
  			socket.send(POLICY_RES);
  			socket.close();
  		}
	  });
  });

  // Would like to quit the process if listen fails. Today Node will print:
  //   "(evcom) bind() Permission denied 
  // on failure. I can't get some kind of notification about this. The error 
  // message is probably hard coded. 
  sys.puts('Starting Flash Socket Policy server at ' + options.host + ':' + options.policy_port);
  server.listen(options.policy_port);
  
  return server;
}

/**
 *  Filters all rules from a options dict
 *  @param {Object} options A option set
 *  @return {Object} All rules that was found in the specifed option set.
 */
function get_rules(options) {
  var rules = {}
  for (var option in options) {
    var match = option.match(/^r_([a-z_]+)/);
    if (match) {
      rules[match[1]] = options[option];
    }
  }
  return rules; 
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
      result = {};
  parser.banner = 'Usage: wpilots.js [options]';
  parser.on('help', function() {
    sys.puts(parser.toString());
    parser.halt();
  });
  parser.on('*', function(opt, value) {
    result[opt] = value || true;
  });      
  parser.parse(process.ARGV);
  return parser._halt ? null : process.mixin(DEFAULT_OPTIONS, result);
}

// Call programs entry point
main();