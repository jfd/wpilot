var sys       = require('sys'),

/**
 *  Starts the game server
 */
exports.listen = function(options) {
  ws.createServer(connection);
  ws.listen(options.ws_port);
}


function connection(conn) {
  
}


try {
  session = create_player_session(conn); 
  process_messages(msg, this, session);
  if (session.state == 'unvalidated') {
    throw "Expected client+handshake command";
  }
} catch (msg) {
  log("Disconnected client: " + msg);
  conn.post(error(msg));
  if (session) {
     session.kill('Invalid client');
  }
  return;
}

/**
 *  Prints a system message in the console.
 */
function log(msg) {
  sys.puts(options.name + ': ' + msg);
}

/**
 *  Starts the server game loop.
 */
function start_gameloop() {
  var update_rate = options.update_rate;

  log('Creating server World...');
  world = new World({
    id: 1,
    max_players: options.max_players,
    start_delay: options.start_delay,
    state: 'waiting',
    w: options.world_width,
    h: options.world_height
  });

  log('Creating game loop...');
  gameloop = new GameLoop();
  gameloop.step_callback = function(t, dt) {

    world.step(t, dt);

    if (t % dt * update_rate) {
      world.each_uncommited(function(item) {
        var session = item.session;
        if (session) {
          // sys.puts(sys.inspect(item.changed_values('dynamic')));
          session.post([item._subject + STATE, item.id, item.changed_values('dynamic')]);
          broadcast_exclude(session, [item._subject + STATE, item.id, item.changed_values()]);
        } else {
          broadcast([item._subject + STATE, item.id, item.changed_values()]);
        }
        item.commit();
      });
    }

    for (var id in sessions) {
      var session = sessions[id];
      session.send_queue();
    }
  }

  log('Starting game loop...');
  loop.start();
  world.start();
}

function stop_gameloop(reason) {
  
  for (var id in sessions) {
    sessions[id].post([SERVER + SHUTDOWN, reason]);
  }
  
  gameloop.kill = true;
  gameloop = null;
  world = null;
  sessions = null;
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
function broadcast(msg, prio) {
  for(var id in sessions) {
    sessions[id].post(msg, prio);
  }
}

/**
 *  Broadcasts specified message to all connected players except does who is
 *  in the exclude list..
 */
function broadcast_exclude(exclude, msg, prio) {
  for(var id in sessions) {
    if (exclude.id != id) {
      sessions[id].post(msg, prio);
    }
  }
}

function spawn_player(session) {
  var player = session.player;
  var entity = world.spawn_entity('ship', {
    pid: session.player.id,
    x: 150,
    y: 150
  });
  entity.session = session;
  broadcast([ENTITY + SPAWN, entity.repr()])
  player.update({ eid: entity.id });
  player.entity = entity;
  return entity;
}

function spawn_bullet(session) {
  var player = session.player,
      ship = player.entity;
  var entity = world.spawn_entity('bullet', {
    oid: ship.id,
    x: ship.x + Math.cos(ship.a - Math.PI/2)*ship.w*2,
    y: ship.y + Math.sin(ship.a - Math.PI/2)*ship.w*2,
    a: ship.a,
  });
  broadcast([ENTITY + SPAWN, entity.repr()])
  player.r = 10;
  ship.sh = 1;  
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
 *  GameObject.dump
 *  Prints all or selected files in console.
 */
GameObject._proto.dump = function() {
  var item = this.repr();
  var result = this.type + '#' + this.id + ': { ';
  for (var name in item) {
    result += name + ': ' + item;
  };
  result += '}';
  sys.debug(result);
}



/**
 *  Class PlayerSession
 */
function PlayerSession(conn) {
  var self = this;
  this.id = PlayerSession.session_count++;
  this.conn = conn;
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

PlayerSession.session_count = 1;


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
World.prototype.before_init = function() {
  this.entity_count = 1;
}

/**
 *  Is called upon after init.
 */
World.prototype.build = function() {

  this.spawn_entity('wall', {
    x: 0, y: 0, w: this.w + 2, h:2
  });

  this.spawn_entity('wall', {
    x: this.w, y: 0, w: 2, h: this.h + 2
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


// if_changed(player, ROTATE, value, function() {
//   var prop_names = [ROTATE].concat(Ship.STATE_PROPS);
//   game.broadcast([ENTITY + STATE, entity.id, entity.props(prop_names)]);
// });
function process_messages(message_data, game_session, player_session) {
  if (message_data[0] == MULTIPART) {
    // Multipart
    var messages = message_data[1];
    for (var i = 0; i < messages.length; i++) {
      process_message([messages[i], game_session, player_session]);
    }
  } else {
    process_message([message_data, game_session, player_session]);
  }
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
    var entity = game.world.find(session.player.eid);
    if (entity) {
      entity.update({'r': value});
    } 
  },

  /**
   * CLIENT THRUST
   * Activates/de-activates thrust of a player's ship
   */
  [[CLIENT + COMMAND, THRUST, Number], _, _], function(value, game, session) {
    var entity = game.world.find(session.player.eid);
    if (entity) entity.update({'t': value});
  },

  /**
   * CLIENT SHOOT
   * Activates/de-activates thrust of a player's ship
   */
  [[CLIENT + COMMAND, SHOOT, Number], _, _], function(value, game, session) {
    var player = session.player
        world = game.world;
    if (player.can_issue_command()) {
      game.spawn_bullet(session);
    }
  },

  /**
   * CLIENT SHIELD
   * Activates/de-activates thrust of a player's ship
   */
  [[CLIENT + COMMAND, SHIELD, Number], _, _], function(value, game, session) {
    var player = session.player,
        entity = session.player.entity;
    if (entity) {
      entity.update({
        'sd': player.can_issue_command() ? value : 0
      });
    } 
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
   * Indicates that the player is ready for some action.  
   *
   * The game is automaticly started if 60% of the players are ready.
   */
  [[PLAYER + READY], _, _], function(game, session) {
    var world = game.world;
    var player = session.player;

    // Set player state to ´´ready´´
    player.update({ st: READY });

    if(world.no_players / world.max_players >= 0.6) {
      for(var id in world.players) if(!world.players[id].st != READY) return;
      return start_game(world);
    }
  },

  /**
   * PLAYER FIRE
   * Player fire's a bullet.  
   */
  [[PLAYER + FIRE], _, _], function(world, player) {
  },

  function(msg) {
    sys.puts('Unhandled message:');
    sys.puts(sys.inspect(msg[0]));
    // sys.puts(sys.inspect(msg));
  }

);

var collision_manager = match (

  // Bullet vs. Ship
  // A bullet hitted a ship. 
  [Ship, Bullet], function(ship, bullet) {  
    sys.debug('bullet coll');
    sys.debug(ship.sd);
    if (bullet.oid == ship.id) return;
    if (ship.sd) return bullet;
    else return ship;
  },
  [Bullet, Ship], function(bullet, ship, list) { 
    return collision_manager([ship, bullet]);
  },

  // Ship vs. Wall
  // A ship hitted a wall.
  [Ship, Wall], function(ship, wall) {
    sys.debug('Ship vs wall');
    if (ship.sd) {
      if (wall.w > wall.h) {
        ship.update({
          sy: -ship.sy
        });
      } else {
        ship.update({
          sx: -ship.sx
        });
      }
    } else {
      return ship;
    }
  },

  // Bullet vs. Wall
  // A bullet hitted a wall. 
  [Bullet, Wall], function(bullet, wall) {
    sys.debug('bullet vs wall');
    return bullet;
  },

  [Ship, Ship], function(ship_a, ship_b) {
    if (!ship_a.sd && !ship_b.sd) {
    //   return [ship_a, ship_b];
    // } else if(ship_a.sd && ship_b.sd) {
      ship_a.update({
        sx: -ship_a.sx,
        sy: -ship_a.sy
      });
      ship_b.update({
        sx: -ship_b.sx,
        sy: -ship_b.sy
      });
    } else {
      ship_a.dead = !ship_a.sd;
      ship_b.dead = !ship_b.sd;
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