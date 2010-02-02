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


// Define aliases
var _  = match.incl;

process.mixin(require('./lib/gameobjects'));

const SERVER_VERSION       = '(develop version)';

const RE_POLICY_REQ = /<\s*policy\-file\-request\s*\/>/i,
      POLICY_RES    = "<cross-domain-policy><allow-access-from domain=\"*\" to-ports=\"*\" /></cross-domain-policy>";

// Message priorities. High priority messages are sent to client no mather
// what. Low priority messages are sent only if client can afford it.
const PRIO_PASS     = 0,
      PRIO_LOW      = 'low',
      PRIO_MED      = 'med',
      PRIO_HIGH     = 'high';

// Player Connection states      
const DISCONNECTED  = -1;
      IDLE          = 0,
      CONNECTED     = 1;
      HANDSHAKING   = 3,
      JOINED        = 4;      

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
  ['--max_rate NUMBER',           'The maximum rate per client and second (default: 1000)'],
  ['--max_players NUMBER',        'Max connected players allowed in server simultaneously (default: 8)'],
  ['--world_width NUMBER',        'The world width (Default: 1000)'],
  ['--world_height NUMBER',       'The world height (Default: 1000)'],
  ['--r_start_delay NUMBER',      'Rule: Time before game starts after warmup (Default: 300)'],
  ['--r_respawn_time NUMBER',     'Rule: Player respawn time after death. (Default: 500)'],
  ['--r_w_respawn_time NUMBER',   'Rule: Warm-up respawn time after death. (Default: 100)'],
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
  debug:                true, 
  name:                 'WPilot Server',
  host:                 '127.0.0.1',
  pub_host:             null,
  http_port:            6114,
  ws_port:              6115,
  pub_ws_port:          null,
  max_players:          8,
  policy_port:          843,
  max_rate:             1000,
  serve_flash_policy:   false,
  world_width:          1000,
  world_height:         1000,
  r_start_delay:        200,
  r_respawn_time:       400,
  r_w_respawn_time:     100,
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
  'client/devices.js',
  'lib/gameobjects.js',
  'lib/match.js',
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
      last_flush      = 0,
      rules           = get_rules(options);
  
  // Represents a state object that is shared between game server and web server.
  state.server_name       = options.name;
  state.game_server_url   = 'ws://' + (options.pub_host || options.host) + ':' + 
                            (options.pub_ws_port || options.ws_port) + '/';
  state.max_players       = options.max_players;
  state.no_players        = 0;
  state.no_ready_players  = 0;
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
    post_update();
    flush_queues();
  }
  
  /**
   *  Starts the game loop. 
   *  @return {undefined} Nothing
   */
  function start_gameloop() {
    log('Creating server World...');

    world = new World({
      size: [options.world_width, options.world_height]
    });
    
    world.on_round_state_changed = function(state, timer, winners) {
      broadcast(WORLD + STATE, state, timer, winners);
    }

    world.on_entity_destroy = function(id) {
      broadcast(ENTITY + DESTROY, id);
    }
    
    world.on_entity_spawn = function(entity) {
      if (entity.constructor == Ship)
        broadcast(
          SHIP + SPAWN, 
          entity.id,
          entity.pid,
          entity.pos
        );
      else if (entity.constructor == Bullet)
        broadcast(
          BULLET + SPAWN, 
          entity.id,
          entity.oid,
          entity.pos,
          entity.vel,
          entity.angle
        );
    }
    
    world.build();

    gameloop = new GameLoop();
    gameloop.ontick = gameloop_tick;
    
    last_flush = get_time();
    
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
    
    world.set_round_state(ROUND_WAITING);

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
      world.delete_entity_by_id(entity.id);
    }
  }
  
  function post_update() {
    for (var id in connections) {
      var connection = connections[id],
          viewport_bounds = connection.get_viewport_bounds();
      for (var id in world.players) {
        var player = world.players[id],
            entity = player.entity;
        if (entity) {
          connection.queue(
            intersects(entity.cached_bounds, viewport_bounds) ? PRIO_MED : PRIO_LOW,
            [
              SHIP + STATE,
              entity.id,
              entity.angle,
              entity.commands,
              pack_vector(entity.pos),
              pack_vector(entity.vel)
            ]
          );
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
          player.respawn_time = t + rules.w_respawn_time * dt;
        }
      }

      if (player.entity) {
        var entity = player.entity;

        entity.set(THRUST, player.is(THRUST));
        entity.set(ROTATE_W, player.is(ROTATE_W));
        entity.set(ROTATE_E, player.is(ROTATE_E));

        if (player.is(SHIELD) && player.energy >= rules.shield_cost * dt) {
          player.energy -= rules.shield_cost * dt;
          entity.set(SHIELD, true);
        } else {
          entity.set(SHIELD, false);
        }

        if (player.reload_time && t >= player.reload_time) {
          player.reload_time = 0;
        } 
        
        if (player.is(SHOOT) && !player.reload_time && player.energy >= rules.shoot_cost * dt) {
          entity.set(SHOOT, true);
          player.energy -= rules.shoot_cost * dt;
          player.reload_time = t + rules.reload_time * dt;
          player.spawn_bullet();
        } else {
          entity.set(SHOOT, false);
        }
        
        if (player.energy <= 100 && !player.is(SHIELD) && !player.is(SHOOT)) {
          player.energy += rules.energy_recovery * dt
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
      case ROUND_WAITING:
        if (state.no_players > 1 && state.no_ready_players >= (state.no_players * 0.6)) {
          world.set_round_state(ROUND_STARTING, t + rules.start_delay * dt);
          for (var pid in world.players) {
            player = world.players[id];
            if (player.entity) {
              world.delete_entity_by_id(player.entity.id);
            }
          }
        }
        break;
        
      // Round is starting. Server aborts if a player leaves the game.
      case ROUND_STARTING:
        if (state.no_ready_players < (state.no_players * 0.6)) {
          world.set_round_state(ROUND_WAITING, 0);
          for (var pid in world.players) {
            player = world.players[id];
            player.spawn_ship(world.find_respawn_pos());
          }
          return;
        }
        if (t >= world.r_timer) {
          world.set_round_state(ROUND_RUNNING, 0);
          for (var pid in world.players) {
            player = world.players[id];
            player.ready = false;
            player.score = 0;
            player.spawn_ship(world.find_respawn_pos());
          }
          state.no_ready_players = 0;
        }
        break;
        
      // The round is running. Wait for a winner.
      case ROUND_RUNNING:
        var winners = [],
            player;
        for (var pid in world.players) {
          player = world.players[id];
          if (player.s == rules.round_limit) {
            winners.push(player.id);
          }
        }
        if (winners.length) {
          world.set_round_state(ROUND_FINISHED, t + rules.round_rs_time * dt, winners);
          for (var pid in world.players) {
            player = world.players[id];
            if (player.s == rules.round_limit) {
              if (player.entity) {
                world.delete_entity_by_id(player.entity.id);
              }
              player.is_dead = false;
              player.respawn_time = 0;
            }
          }
        }
        break;

      // The round is finished. Wait for restart
      case ROUND_FINISHED:
        if (t >= world.r_timer) {
          world.set_round_state(ROUND_WAITING, 0, []);
          for (var pid in world.players) {
            player = world.players[id];
            player.score = 0;
            player.energy = 100;
            player.spawn_ship(world.find_respawn_pos());
          }
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
      connections[id].queue(PRIO_HIGH, msg);
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
      if (prio) connections[id].queue(prio, msg);
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
        message_queue     = { low: [], med: [], high: [] },
        player            = null,
        current_vp_bounds = null;
    
    conn.is_game_conn = true;
    conn.id = connection_id;
    conn.rate = 1000;
    conn.update_rate = 100;
    conn.dimensions = [640, 480];
    conn.state = IDLE;
    conn.debug = options.debug;
    
    /**
     *  Set's information about client.
     */
    conn.set_client_info = function(info) {
      conn.rate = info.rate;
      conn.update_rate = info.update_rate;
      conn.dimensions = info.dimensions;
    }
    
    /**
     *  Returns current bouds for viewport
     */
    conn.get_viewport_bounds = function() {
      var dim = conn.dimensions;
      if (player && player.entity) {
        current_vp_bounds = {
          x: player.entity - dim[0] / 2,
          y: player.entity - dim[1] / 2,
          w: dim[0],
          h: dim[1]
        } 
      }
      
      if (current_vp_bounds == null) {
        current_vp_bounds = {
          x: 0,
          y: 0,
          w: dim[0],
          h: dim[1]
        } 
      }

      return current_vp_bounds
    }
    
    /**
     *  Forces a connection to be disconnected. 
     */
    conn.kill = function(reason) {
      disconnect_reason = reason || 'Unknown Reason';
      this.post([SERVER + DISCONNECT, disconnect_reason]);
      this.close();
      message_queue = null;
    }
    
    /**
     *  Queues the specified message and sends it on next flush.
     */
    conn.queue = function(prio, msg) {
      message_queue[prio].push(msg);
    }

    /**
     *  Stringify speicified object and sends it to remote part.
     */
    conn.post = function(data) {
      var packet = JSON.stringify([CONTROL_PACKET, data]);
      this.send(packet);
    }

    /**
     *  Post's specified data to this instances message queue
     */
    conn.flush_queue = function() {
      var msg = null,
          data_sent = 6,
          packet_data = [],
          rate = Math.min(conn.rate, options.max_rate) / 60;

      while ((msg = message_queue[PRIO_HIGH].pop())) {
        var data = JSON.stringify(msg);
        packet_data.push(data);
        data_sent +=  data.length;
      }
      
      while (data_sent < rate && (msg = message_queue[PRIO_MED].pop())) {
        var data = JSON.stringify(msg);
        packet_data.push(data);
        data_sent +=  data.length;
      }

      while (data_sent < rate && (msg = message_queue[PRIO_LOW].pop())) {
        var data = JSON.stringify(msg);
        packet_data.push(data);
        data_sent +=  data.length;
      }
      
      this.send('[2,[' + packet_data.join(',') + ']]');
      
      message_queue = { low: [], med: [], high: []};
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
          
          conn.post([SERVER + STATE, state]);
          break;

        case HANDSHAKING:
          if (!gameloop) {
            start_gameloop();
          }
                
          state.no_players = state.no_players + 1
                
          if (state.no_players >= state.max_players) {
            conn.kill('Server is full');
          } else {
            conn.post([SERVER + HANDSHAKE].concat(world.get_repr()));

            if (conn.debug) {
              log('Debug: ' + conn + ' connected to server. Sending handshake...');
            }
          }
          break;
        
        case JOINED:
          player = new Player({ id: connection_id }, conn, world);

          player.events.addListener('ready', function() {
            if (world.r_state == ROUND_WAITING) {
              state.no_ready_players = state.no_ready_players + 1;
              broadcast(PLAYER + READY, player.id);
            }
          });

          player.events.addListener('dead', function(death_cause, killer) {
            switch (death_cause) {

              case DEATH_CAUSE_SUICDE:
                player.score -= rules.penelty_score < 0 ? 0 : player.s - rules.penelty_score;
                break;

              case DEATH_CAUSE_KILLED:
                killer.score += rules.kill_score;
                break;
                
            }
            broadcast(PLAYER + DESTROY, player.id, death_cause, killer ? killer.id : -1);
          });

          world.players[connection_id] = player;

          conn.post([SERVER + CONNECT, gameloop.tick, player.id, player.name, player.color]);

          broadcast_each(
            [PLAYER + CONNECT, player.id, player.name, player.color],
            function(msg, conn) {
              if (conn.id == connection_id) {
                return PRIO_PASS;
              } 
              return PRIO_HIGH;
            }
          );

          player.spawn_ship(world.find_respawn_pos());
          
          log(conn + ' joined the game.');
          break;
        
        case DISCONNECT:
          delete connections[connection_id];
        
          if (conn.state == HANDSHAKING || conn.state == JOINED) {
            state.no_players = state.no_players - 1;

            if (conn.state == JOINED) {
              
              // FIXME: Should remove entity as well.
              delete world.players[connection_id];

              state.no_ready_players = state.no_ready_players - 1;
              
              broadcast(PLAYER + DISCONNECT, connection_id, disconnect_reason);

              log(conn + ' leaved the game (Reason: ' + disconnect_reason + ')');
            }
          }

          if (state.no_players == 0) {
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
    conn.addListener('receive', function(data) {
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
          process_game_message([packet[1], player]);
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
  
  sys.puts('Starting Game Server server at ' + state.game_server_url);
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
    conn.set_state(JOINED);
    conn.set_client_info(info);
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
   *  Indicates that the player state ROTATE_E is changed
   */
  [[CLIENT + COMMAND, Number], _], 
  function(value, player) {
    player.commands = value;
  },

  /**
   *  Indicates that player is ready to start the round
   */
  [[CLIENT + COMMAND, READY], _], function(player) {
    if (player.st != READY) {
      player.ready = true;
      player.events.emit('ready');
    }
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
 *  Resolvs collision between two entities
 */
var COLLISSION_RESOLVER = match (

  /**
   *  Check collission between Ship and Bullet
   */
  [Ship, Bullet, Array], function(ship, bullet, trash) {  
    if (ship.is(SHIELD)) {
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
    if (ship.is(SHIELD)) {
      if (wall.size[0] > wall.size[1]) {
        ship.vel = [ship.vel[0], -ship.vel[1]];
      } else {
        ship.vel = [-ship.vel[0], ship.vel[1]];
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
    if (!ship_a.is(SHIELD) && !ship_b.is(SHIELD)) {
      ship_a.player.die(DEATH_CAUSE_SUICDE);
      ship_b.player.die(DEATH_CAUSE_SUICDE);
      trash.push(ship_a);
      trash.push(ship_b);
    } else if(ship_a.is(SHIELD) && ship_b.is(SHIELD)) {
      ship_a.vel = [-ship.vel[0], -ship.vel[1]];
      ship_b.vel = [-ship.vel[0], -ship.vel[1]];
    } else {
      if (!ship_a.is(SHIELD)) {
        ship_a.player.die(DEATH_CAUSE_KILLED, ship_b.player);
        trash.push(ship_a);
      } 
      if (!ship_b.is(SHIELD)) {
        ship_b.player.die(DEATH_CAUSE_KILLED, ship_a.player);
        trash.push(ship_b);
      } 
    }
  }

);

Player.prototype.on_before_init = function(initial, connection, world) {
  this.events         = new process.EventEmitter(); 
  this.connection     = connection;
  this.world          = world;
  this.reload_time    = 0;
  this.respawn_time   = 0;
  this.is_dead        = false;
  initial.name        = get_random_value(PLAYER_NAMES);
  initial.color       = get_random_value(PLAYER_COLORS);
}

Player.prototype.get_entity = function() {
  return this.world ? this.world.find(this.eid) : null;
}

/**
 *  Spawns a new player ship at a random location.
 *  @return {gameobjects.Ship} The newly created Ship instance.
 */
Player.prototype.spawn_ship = function(pos) {
  var entity = this.world.spawn_entity('ship', {
    pid: this.id,
    pos: pos
  });
  entity.player = this;
  this.is_dead = false;
  this.events.emit('spawn', entity);
  this.eid = entity.id;
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
World.prototype.on_before_init = function() {
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
    bounds.x = 50 + (Math.random() * (this.size[0] - 100));
    bounds.y = 50 + (Math.random() * (this.size[1] - 100));
    if (!this.bounds_intersects(bounds)) {
      pos = [bounds.x + 30, bounds.y + 30];
    }
  }
  
  return pos;
}

/**
 *  Builds the world
 *  @return {undefined} Nothing
 */
World.prototype.build = function() {
  var w = this.size[0],
      h = this.size[1];
  this.spawn_entity('wall', {
    pos: [0, 0],
    size: [w + 10, 10],
    o: 'n'
  });
  this.spawn_entity('wall', {
    pos: [w, 0],
    size: [10, h + 10],
    o: 'e'
  });
  this.spawn_entity('wall', {
    pos: [0, h],
    size: [w + 10, 10],
    o: 's'
  });
  this.spawn_entity('wall', {
    pos: [0, 0],
    size: [10, h + 10],
    o: 'w'
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