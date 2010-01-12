var sys = require('sys'),
    websocket = require('./websocket'),
    fu = require('./fu'),
    match = require('./match').Match;
    _ = match.incl;

process.mixin(require('./game'));

var MAX_PLAYERS = 8,
    START_DELAY = 3,
    WORLD_WIDTH = 1000,
    WORLD_HEIGHT = 1000;
    
var PRIO_HIGH = 3,
    PRIO_MID = 2,
    PRIO_LOW = 1;
      

/**
 *  Entry point for server.
 */
function main() {
  var sessions = [],
      game_id_incr = 1;

  fu.listen(8000, null);

  fu.get("/", fu.staticHandler("index.html"));
  fu.get("/style.css", fu.staticHandler("style.css"));
  fu.get("/client.js", fu.staticHandler("client.js"));
  fu.get("/space.jpg", fu.staticHandler("space.jpg"));

  var server = new websocket.Server({ address: '127.0.0.1', port: 8001});
  // server.get('room1', create_route());

  // Create a new Gmae that user's can connect to.
  sessions.push(new GameSession(game_id_incr++, server, {}));  
}


/**
 *  Class GameSession
 */
function GameSession(id, server, props) {
  var self = this;
  this.name = "game" + id; 
  this.gameloop = null;
  this.server = server;
  this.sessions = {};
  this.session_count = 1;

  var world = new World({
    id: id,
    max_players: props.max_players || MAX_PLAYERS,
    start_delay: props.start_delay || START_DELAY,
    state: 'waiting',
    w: props.w || WORLD_WIDTH,
    h: props.h || WORLD_HEIGHT
  });
  world.collision_manager = collision_manager;
  world.delete_manager = function(list) { self.delete_manager.apply(self, [list]) };
  this.world = world;
  
  // Start to listen for data at the given URL.
  server.get('/' + this.name, this);
  this.log('Starting socket server');
}

sys.inherits(GameSession, process.EventEmitter);

/**
 *  Handles the ondata event from the server instance. 
 */
GameSession.prototype.onData = function(data, conn) {
  var session = conn.session, msg = JSON.parse(data);
  if (session) {
    process_message([msg, this, session]);  
  } else {
    // No session is available. This is a new player. Try to create a new 
    // session.
   try {
      session = this.create_player_session(conn); 
      this.sessions[session.id] = session;
      process_message([msg, this, session]);
      if (session.state == 'unvalidated') {
        throw "Expected client+handshake command";
      }
    } catch (msg) {
      this.log("Disconnected client: " + msg);
      conn.post(error(msg));
      if (session) {
        session.kill('Invalid client');
      }
      return;
    }
  }  
  conn.session = session;
}

/**
 *  Handles the onDisconnect event from the server instance. 
 */
GameSession.prototype.onDisconnect = function(conn) {
  var session = conn.session;
  if (session) {
    session._reason = 'User Disconnected';
  }
}

/**
 *  Creates a new player session. 
 */
GameSession.prototype.create_player_session = function(conn) {
  var self = this,
      player = null,
      world = this.world,
      session = null;
    
  // Player was not found. Check player limit, then create a new player 
  // profile and add it to the world. 
  if (world.no_players == world.max_players) {
    throw error('Server is full');
  }
  
  if (world.state == 'finished') {
    throw error('Game already finished');
  }
    
  // Handles the killed event's 
  function disconnected(reason) {
    delete self.sessions[session.id];
    session.removeListener('disconnected', disconnected);
    session.removeListener('state', state_changed);
    self.broadcast([PLAYER + DISCONNECT, session.id]);    
    self.log(session.player + ' disconnected (Reason: ' + reason + ')');
  }
  
  // Handles state event's
  function state_changed(changed_values) {
    sys.debug('state_changes')
    self.broadcast([PLAYER + STATE, session.state.id, changed_values]);    
    if (changed_values.state == 'ready') {
      self.log(session.state + ' is ready');
    }
  }
  
  if (!self.gameloop) {
    // First player to connect. Start the gameloop
    self.start_gameloop();
  }

  session = new PlayerSession(self.session_count++, conn);

  session.addListener('disconnected', disconnected);
  session.addListener('state', state_changed);

  self.sessions[session.player.id] = session;
  world.players[session.player.id] = session.player;
  
  self.log(session.player + ' connected. Sending handshake...');
  
  var entities = [];
  for(var i = 0; i < world._entities.length; i++) {
    entities.push(world._entities[i].props());
  }
  
  session.send([
    SERVER + HANDSHAKE, 
    session.player.id, 
    self.gameloop.tick, 
    world.props(),
    entities
  ]);
  
  self.broadcast_exclude(
    [session], 
    [PLAYER + CONNECT, session.player.props()]
  );

  // Update the player count
  world.no_players++;
  
  // // The player is automaticly granted admin status if he/she is the first 
  // // one to connect to the world.
  // if (world.no_players == 0) {
  //   world.admin = player;
  // }

  return session;
}

GameSession.prototype.start_gameloop = function() {
  var world = this.world,
      sessions = this.sessions;
  this.log('Starting ' + this);
  var loop = new GameLoop();
  loop.step_callback = function(t, dt) {
    world.step(t, dt);
    for (var id in sessions) {
      var session = sessions[id];
      session.send_queue();
    }
  }
  this.gameloop = loop;
  loop.start();
  world.start();
}

/**
 *  Start's the game, with a 
 */
GameSession.prototype.start = function() {
  world.state = 'starting';
  broadcast(world, [WORLD + STATE, ['starting', world.start_delay]]);
  setTimeout(function() {
    world.state = 'running';
    broadcast(world, [WORLD + STATE, ['running', world.start_delay]]);
  }, world.start_delay);
}

/**
 *  Broadcasts specified message to all connected players.
 */
GameSession.prototype.broadcast = function(msg, prio) {
  var sessions = this.sessions;
  for(var id in sessions) {
    sessions[id].post(msg, prio);
  }
}

/**
 *  Broadcasts specified message to all connected players except does who is
 *  in the exclude list..
 */
GameSession.prototype.broadcast_exclude = function(exclude_list, msg, prio) {
  var sessions = subtract_array(this.sessions, exclude_list);
  for(var id in sessions) {
    sessions[id].post(msg, prio);
  }
}

GameSession.prototype.spawn_player = function(session) {
  var entity = this.world.spawn_entity('ship', {
    pid: session.player.id,
    x: 150,
    y: 150
  });
  session.update_values({'entity_id': entity.id});
  this.broadcast([PLAYER + SPAWN, entity.props()]);
  return entity;
}


GameSession.prototype.delete_manager = function(delete_list) {
  sys.debug('Inside delete manager')
  var index = delete_list.length;
  while (index--) {
    var entity = delete_list[index];
    this.world.delete_by_id(entity.id);
    sys.debug('Broadcast message ' + entity.id);
    this.broadcast([ENTITY + DESTROY, entity.id]);
  }
  sys.debug('outside delete manager')
}

/**
 *  Prints a system message in the console.
 */
GameSession.prototype.log = function(msg) {
  sys.puts(this + ': ' + msg);
}

GameSession.prototype.toString = function() {
  return this.name;
}


/**
 *  Class PlayerSession
 */
function PlayerSession(id, conn, game) {
  var self = this;
  this.conn = conn;
  this.game = game;
  this.player = new Player({
    id: id
    // color: get_random_value(SHIP_COLORS)
  });
  this._reason = null;
  this.queue = [];
  this.state = 'unvalidated';

  function onclose(had_error) {
    self.emit('disconnected', self._reason);
    
    conn.socket.removeListener('close', onclose);
    conn.socket.removeListener('timeout', ontimeout);

    self.conn = null;
    self.game = null;
    self.player = null;
  }

  function ontimeout(had_error) {
    self.kill('timeout');
  }
  
  conn.socket.addListener('close', onclose);
  conn.socket.addListener('timeout', ontimeout);
}

sys.inherits(PlayerSession, process.EventEmitter);

/**
 *  Disconnect the player session.
 */
PlayerSession.prototype.kill = function(reason) {
  this._reason = reason;
  if (this.conn.readyState != 'closed') {
    this.post([CLIENT + DISCONNET, reason]);
    this.send_queue();
    this.conn.close();
  }
}

/**
 *  Post's specified data to this instances message queue
 *  TODO: use prio
 */
PlayerSession.prototype.update_values = function(values) {
  for (var name in values) {
    this.player[name] = values[name];
  }
  this.emit('state', values);
}

/**
 *  Post's specified data to this instances message queue
 *  TODO: use prio
 */
PlayerSession.prototype.post = function(data, prio) {
  this.queue.push(data);
}

/**
 *  Sends a message directly to the client
 */
PlayerSession.prototype.send = function(data) {
  var msg = JSON.stringify([
    0,
    data,
  ]);
  this.conn.send(msg);
}

/**
 *  Takes all messages in the queue and send them to the client.
 */
PlayerSession.prototype.send_queue = function() {
  if (this.queue.length) {
    var msg = JSON.stringify([
      1,
      this.queue        // Instruction set for this update
    ]);
    if (this.conn) this.conn.send(msg);
    this.queue = [];
  }
}

/**
 *  Is called upon before init.
 */
World.prototype.pre_init = function() {
  this.entity_count = 1;
}

/**
 *  Is called upon after init.
 */
World.prototype.build = function() {
  
  this.spawn_entity('wall', {
    x: 0, y: 0, w: this.w, h:2
  });

  this.spawn_entity('wall', {
    x: this.w + 2, y: 0, w: this.w + 2, h:2
  });

  this.spawn_entity('wall', {
    x: 0, y: this.h , w: this.w + 2, h: 2
  });

  this.spawn_entity('wall', {
    x: 0, y: 0, w: 2, h: this.h + 2
  });
  
}

World.prototype.spawn_entity = function(type, props) {
  var Class = World.ENTITIES[type];
  var instance = new Class(process.mixin({
    id: this.entity_count++
  }, props));
  this.append(instance);
  return instance;
}

World.prototype.spawn_bullet = function(ship) {
  var bullet = this.spawn_entity('bullet', {
    pid: ship.id,
    x: this.x + Math.cos(ship.angle - Math.PI/2)*ship.w*2,
    y: this.y + Math.sin(ship.angle - Math.PI/2)*ship.w*2,
    angle: this.angle,
  });  
  bullet.speedx =  Math.sin(bullet.angle) * bullet.max_speed;
  bullet.speedy =  Math.cos(bullet.angle) * bullet.max_speed;
  return bullet;
}


var process_message = match (

  /**
   * CLIENT CONNECTED
   * A new Player connected to the world.
   */
  [[CLIENT + CONNECT], _, _], function(game, session) {
    game.log('Client connect');
    session.state = 'validated';
  },
  
  /**
   * CLIENT ROTATE
   * Starts/ends rotation for a player's ship.
   */
  [[CLIENT + COMMAND, ROTATE, Number], _, _], function(value, game, session) {
    var player = session.player;
    if_changed(player, ROTATE, value, function() {
      var prop_names = [ROTATE].concat(Ship.STATE_PROPS);
      game.broadcast([ENTITY + STATE, player.entity_id, player.props(prop_names)]);
    });
  },

  /**
   * CLIENT THRUST
   * Activates/de-activates thrust of a player's ship
   */
  [[CLIENT + COMMAND, THRUST, Number], _, _], function(value, game, session) {
    var entity = game.world.find(session.player.entity_id);
    if_changed(entity, THRUST, value, function() {
      var prop_names = [THRUST].concat(Ship.STATE_PROPS);
      game.broadcast([ENTITY + STATE, entity.id , entity.props(prop_names)]);
    });
  },

  /**
   * PLAYER HANDSHAKE
   * Is recived when client has downloaded world state. Let's spawn the new
   * player.
   */
  [[PLAYER + HANDSHAKE], _, _], function(game, session) {
    game.log('Player handshake');
    game.spawn_player(session);
  },

  /**
   * PLAYER CONNECTED
   * A new Player connected to the world.
   */
  [[CONNECT], _, _], function(game, session) {
    game.log(session.state + ' connected');
  },

  /**
   * PLAYER READY
   * Player is ready for some action.  
   */
  [[PLAYER + READY], _, _], function(game, session) {
    var world = game.world;
    var player = session.player;

    // Set player state to ready and broadcast to a notification to the rest 
    // of the players. 
    player.ready = true;

    // Start if the game is 60% full and all of them are ready.
    if(world.no_players / world.max_players >= 0.6) {
      for(var id in world.players) if(!world.players[id].state != READY) return;
      return start_game(world);
    }
  },
  
  /**
   * PLAYER FIRE
   * Player fire's a bullet.  
   */
  [[PLAYER + FIRE], _, _], function(world, player) {
    if(world.state !== 'running') return;
    
  
  },
  
  function(msg) {
    sys.puts('Unhandled message')
    sys.puts(sys.inspect(msg));
  }
  
);

var collision_manager = match (

  // Bullet vs. Ship
  // A bullet hitted a ship. 
  [Ship, Bullet], function(ship, bullet) {  
    if (bullet.owner == ship) return;
    if (ship.shield) return bullet;
    else return ship;
  },
  [Bullet, Ship], function(bullet, ship) { return collision_manager(ship, bullet)},
  
  // Ship vs. Wall
  // A ship hitted a wall.
  [Ship, Wall], function(ship, wall) {
    sys.debug('Ship vs wall');
    if (ship.shield) {
      if (wall.w > wall.h) ship.speedy = -ship.speedy;
      else ship.speedx = -ship.speedx;
    } else {
      return ship;
    }
  },

  // Bullet vs. Wall
  // A bullet hitted a wall. 
  [Bullet, Wall], function(bullet, wall) {
    console.log('bullet vs wall');
    bullet.dead = true;
  },
  
  [Ship, Ship], function(ship_a, ship_b) {
    if (!ship_a.shield && !ship_b.shield) {
      ship_a.dead = true;
      ship_b.dead = true;
    } else if(ship_a.shield && ship_b.shield) {
      ship_a.speedx = -ship_a.speedx;
      ship_a.speedy = -ship_a.speedy;

      ship_b.speedx = -ship_b.speedx;
      ship_b.speedy = -ship_b.speedy;
    } else {
      ship_a.dead = !ship_a.shield;
      ship_b.dead = !ship_b.shield;
    }
  }

);

function get_random_value(src) {
  var no = Math.floor(Math.random()*src.length);
  return src[no];
}

function error(msg) {
  return [ERROR, msg];
}

function subtract_array(array_a, array_b) {
  var result = [];
  for (var i = 0; i < array_a.length; i++) {
    var item = array_a[i], found = false;
    for (var i = 0; i < array_b.length; i++) {
      if (item == array_b[i]) {
        found = true;
        break;
      } 
    }
    if (!found) result.push(item);
  }
}

// Start the server
main();