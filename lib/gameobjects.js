//
//  gameobjects.js
//  Game objects for WPilot
//
//  Read README for instructions and LICENSE license.
//
//  Copyright (c) 2010 Johan Dahlberg
//


try {
  // server import of match
  if (require) {
    var match = require('./match').Match;
  }
} catch (_ex) {
  // client import of match
  var match = Match;
  var _ = match.incl;
}

var OP_PLAYER_SPAWN       = 1;
var OP_PLAYER_DIE         = 2;
var OP_PLAYER_STATE       = 3;
var OP_PLAYER_INFO        = 4;
var OP_PLAYER_FIRE        = 5;
var OP_PLAYER_CONNECT     = 6;
var OP_PLAYER_DISCONNECT  = 7;
var OP_POWERUP_SPAWN      = 8;
var OP_POWERUP_DIE        = 9;
var OP_ROUND_STATE        = 10;
var OP_PLAYER_SAY         = 11;

var OP_REQ_SERVER_INFO    = 10;
var OP_SERVER_INFO        = 11;
var OP_SERVER_EXEC_RESP   = 12
var OP_DISCONNECT_REASON  = 13;
var OP_WORLD_DATA         = 14;
var OP_WORLD_STATE        = 15;
var OP_WORLD_RECONNECT    = 16;
var OP_CLIENT_CONNECT     = 17;
var OP_CLIENT_JOIN        = 18;
var OP_CLIENT_STATE       = 19;
var OP_CLIENT_SET         = 20;
var OP_CLIENT_EXEC        = 21;
var OP_CLIENT_SAY         = 22;

// Packet types
var GAME_PACKET     = 2;
var PING_PACKET     = 1;

// Player action
var THRUST      = 1,
    SHOOT       = 2,
    SHIELD      = 4;

// World round states
var ROUND_WARMUP  = 1,
    ROUND_STARTING = 2,
    ROUND_RUNNING  = 3,
    ROUND_FINISHED = 4;

var ROUND_START_DELAY = 400,
    ROUND_NEXT_MAP_DELAY = 800,
    ROUND_WARMUP_RESPAWN_DELAY = 300;

// World timer related constants
var DT = 0.017,
    MILLI_STEP = 16,
    TIME_STEP = MILLI_STEP / 1000,
    ITERATIONS = 10;

var GRID_CELL_SIZE = 250;

var BLOCK_SPACING = 50,
    BLOCK_WIDTH   = GRID_CELL_SIZE - (BLOCK_SPACING * 2),
    BLOCK_HEIGHT  = GRID_CELL_SIZE - (BLOCK_SPACING * 2);

var BLOCK_CONNECTOR_NORTH = 0x01,
    BLOCK_CONNECTOR_EAST  = 0x02,
    BLOCK_CONNECTOR_SOUTH = 0x04,
    BLOCK_CONNECTOR_WEST  = 0x08;

var SHIP_WIDTH = 9,
    SHIP_HEIGHT = 20,
    SHIP_ROTATION_SPEED = 4,
    SHIP_RELOAD_SPEED = 50,
    SHIP_MAX_SPEED = 200,
    SHIP_ACCELERATION_SPEED = 300,
    BULLET_ACCELERATION_SPEED = 1,
    BULLET_MAX_SPEED = 250,
    BULLET_LIFETIME = 300,
    RBULLET_LIFETIME = 250;

var DEATH_CAUSE_KILLED = 1,
    DEATH_CAUSE_SUICDE = 2;

// Power up codes
var POWERUP_SPREAD  = 1,
    POWERUP_RAPID   = 2,
    POWERUP_RICO    = 4;

var TILE_CBLOCK         = 11,
    TILE_BLOCK          = 12,
    TILE_PLAYER_SPAWN   = 51,
    TILE_POWERUP_SPAWN  = 52;

var CC = 1;

/**
 *  Extends the prototype object with one or more objects.
 */
function extend_class() {
  var args = Array.prototype.slice.call(arguments);
  var Class = args.shift(), BaseClass = null;
  while ((BaseClass = args.shift())) {
    for (var member in BaseClass) {
      Class.prototype[member] = BaseClass[member];
    }
  }
}

var EntityBase = {

  /**
   *  Initializes the EntityBase class.
   */
  EntityBase_init: function(type) {
    this.type = type;
    this.destroyed = false;
  },

  /**
   *  Playerholder for the on_before_init event
   */
  on_before_init: function() {},

  /**
   *  Playerholder for the on_after_init event
   */
  on_after_init: function() {},

  /**
   *  Called by World on each update
   */
  world_update: function(t, dt) {
    this.move(t, dt);
    this.update(t, dt);
  },

  /**
   *  Placeholder for the move method
   */
  move: function(t, dt) { },

  /**
   *  Placeholder for the update method
   */
  update: function(t, dt) { },

  /**
   *  Tells the entity that it's being destroyed.
   */
  destroy: function() {
    this.destroyed = true;
  }

}

/**
 *  Class GameLoop
 */
function GameLoop(tick) {
  this.ontick = function() {};
  this.ondone = function() {};
  this._pid = null;
  this._kill = false;
  this._oneach = [];
  this.tick = tick || 0;
}

/**
 *  Starts the game loop.
 */
GameLoop.prototype.start = function() {
  var self = this,
      ontick = self.ontick,
      ondone = self.ondone,
      accumulator = 0,
      dt = DT,
      current_time = new Date().getTime();

  this._kill = false;

  function gameloop() {
    var new_time = new Date().getTime();
    var delta = (new_time - current_time) / 1000;
    current_time = new_time;

    if (delta > 0.25) delta = 0.25;

    accumulator += delta;

    while (accumulator >= dt) {
      accumulator -= dt;
      ontick(self.tick, dt);
      self.tick += dt;
    }

    ondone(self.tick, dt, accumulator / dt);
  };

  self._pid = setInterval(gameloop, 10);
  // gameloop();
}

//
//  method GameLoop.prototype.kill
//  Kills a running instance.
//
GameLoop.prototype.kill = function() {
  this._kill = true;
  if (this._pid) {
    clearInterval(this._pid);
  }
}

/**
 *  Class World
 *  Represents a world object base. The world object is shared between server
 *  and client.
 */
function World(server_mode) {
  this.on_before_init();
  this.max_players = 0;
  this.no_players = 0;
  this.no_ready_players = 0;
  this.entity_count = 1;
  this.entities = {};
  this.players = {};
  this._entities = [];
  this.server_mode = server_mode || false;
  this.powerups = {};
  this.powerup_count = 0;
  this.powerup_next_spawn = 0;
  this.powerup_id_incr = 0;
  this.map_data = null;
  this.map_name = '';
  this.player_spawn_points = [];
  this.powerup_spawn_points = [];
  this.on_after_init();
}

/**
 *  Placeholder for on_update event
 */
 World.prototype.on_update = function(t, dt) { }
/**
 *  Placeholder for player_died event
 */
World.prototype.on_player_died = function(player, old_entity, death_cause, killer) { }

/**
 *  Placeholder for entity_delete event
 */
World.prototype.on_round_state_changed = function(state, winners) { }

/**
 *  Playerholder for on_before_init event
 */
World.prototype.on_before_init = function() {}

/**
 *  Playerholder for the Player on_after_init event
 */
World.prototype.on_after_init = function() {}

/**
 *  Playerholder for the on_after_state_set event
 */
World.prototype.on_after_state_set = function() {}

/**
 *  Playerholder for on_player_join event
 */
World.prototype.on_player_join = function(player) {}

/**
 *  Playerholder for on_player_leave event
 */
World.prototype.on_player_leave = function(player, reason) {}

/**
 *  Playerholder for on_player_ready event
 */
World.prototype.on_player_ready = function(player) {}

/**
 *  Playerholder for on_player_name_changed event
 */
World.prototype.on_player_name_changed = function(player, new_name, old_name) {}

/**
 *  Playerholder for on_player_action event
 */
World.prototype.on_player_action = function(player, action) {}

/**
 *  Playerholder for on_player_fire event
 */
World.prototype.on_player_fire = function(player, angle) {};

/**
 *  Playerholder for on_powerup_spawn event
 */
World.prototype.on_powerup_spawn = function(powerup) {}

/**
 *  Playerholder for on_powerup_die event
 */
World.prototype.on_powerup_die = function(powerup, player) { }

World.prototype.set_state = function(state, players, powerups) {
  this.tick = state.tick || 0;
  this.delta = state.delta || 0;
  this.max_players = state.max_players || 0;
  this.no_players = state.no_players || 0;
  this.no_ready_players = state.no_ready_players || 0;
  this.start_time = state.start_time || new Date().getTime();
  this.r_state = state.r_state || ROUND_WARMUP;
  this.r_timer = state.r_timer || 0;
  this.r_winners = state.r_winners || [];

  for (var i = 0; i < players.length; i++) {
    var player_repr = players[i];
    var player = new Player(player_repr);
    this.players[player.id] = player;
    if (!player_repr.dead) {
      var entity = new Ship({
        pos:    player_repr.pos,
        vel:    player_repr.vel,
        angle:  player_repr.angle,
        player: player
      });
      entity.visible = true;
      this.add_entity(entity);
      player.entity = entity;
    }
  }

  for (var i = 0; i < powerups.length; i++) {
    var powerup_repr = powerups[i];
    var powerup = new Powerup(powerup_repr);
    this.powerups[powerup.powerup_id] = powerup;
    this.add_entity(powerup);
  }

  this.on_after_state_set();
}

/**
 *  Builds the world
 *  @return {undefined} Nothing
 */
World.prototype.build = function(map_data, rules) {
  var data = map_data.data,
      world_width = data[0].length * GRID_CELL_SIZE,
      world_height = data.length * GRID_CELL_SIZE;

  // Reset variables
  this.entity_count = 1;
  this.no_players = 0;
  this.no_ready_players = 0;
  this.r_state = ROUND_WARMUP;
  this.r_timer = 0;
  this.r_winners = [];
  this.powerups = {};
  this.powerup_count = 0;
  this.powerup_next_spawn = 0;
  this.powerup_id_incr = 0;
  this.entities = {};
  this.players = {};
  this._entities = [];
  this.player_spawn_points = [];
  this.powerup_spawn_points = [];
  this.tick = 0;
  this.delta = 0;

  this.rules = rules

  this.size = [world_width, world_height];
  this.map_name = map_data.name;
  this.map_data = map_data;

  this.add_entity(new Wall({
    pos: [-10, -10],
    size: [world_width + 20, 10],
    o: 'n'
  }));

  this.add_entity(new Wall({
    pos: [world_width, -10],
    size: [10, world_height + 20],
    o: 'e'
  }));

  this.add_entity(new Wall({
    pos: [-10, world_height],
    size: [world_width + 20, 10],
    o: 's'
  }));

  this.add_entity(new Wall({
    pos: [-10, -10],
    size: [10, world_height + 20],
    o: 'w'
  }));

  function get_connectors(data, x, y) {
    var connectors = 0;

    if (data[y - 1] === undefined || data[y - 1][x] === TILE_CBLOCK) {
      connectors |= BLOCK_CONNECTOR_NORTH;
    }

    if (data[y][x + 1] === undefined || data[y][x + 1] === TILE_CBLOCK) {
      connectors |= BLOCK_CONNECTOR_EAST;
    }

    if (!data[y + 1] || data[y + 1][x] === TILE_CBLOCK) {
      connectors |= BLOCK_CONNECTOR_SOUTH;
    }

    if (data[y][x - 1] === undefined || data[y][x - 1] === TILE_CBLOCK) {
      connectors |= BLOCK_CONNECTOR_WEST;
    }

    return connectors;
  }

  for (var row = 0; row < data.length; row++) {
    for (var col = 0; col < data[row].length; col++) {
      var tile = data[row][col];
      switch (tile) {

        case TILE_CBLOCK:
          this.add_entity(new Block({
            pos: [col * GRID_CELL_SIZE + BLOCK_SPACING,
                  row * GRID_CELL_SIZE + BLOCK_SPACING],
            connectors: get_connectors(data, col, row)
          }));
          break;

        case TILE_BLOCK:
          this.add_entity(new Block({
            pos: [col * GRID_CELL_SIZE + BLOCK_SPACING,
                  row * GRID_CELL_SIZE + BLOCK_SPACING],
            connectors: 0
          }));
          break;

        case TILE_PLAYER_SPAWN:
          this.player_spawn_points.push({
            x: col * GRID_CELL_SIZE,
            y: row * GRID_CELL_SIZE,
            w: GRID_CELL_SIZE,
            h: GRID_CELL_SIZE
          });
          break;

        case TILE_POWERUP_SPAWN:
          this.powerup_spawn_points.push({
            x: col * GRID_CELL_SIZE,
            y: row * GRID_CELL_SIZE,
            w: GRID_CELL_SIZE,
            h: GRID_CELL_SIZE
          });
          break;

      }
    }
  }

}

/**
 *  Adds a player to the game world.
 *  @param player {Player} the player to add
 *  @return {undefined} Nothing
 */
World.prototype.add_player = function(player_id, player_name) {
  var player = new Player({ id: player_id, name: player_name});
  player.world = this;
  switch (this.r_state) {

    // Let the player spawn directly
    case ROUND_WARMUP:
      player.respawn_time = this.tick + ROUND_WARMUP_RESPAWN_DELAY * this.delta;
      break;

    // Add a delay to the spawn
    case ROUND_RUNNING:
      player.time = this.tick;
      player.respawn_time = this.tick + this.rules.respawn_time * this.delta;
      break;

    // No spawn if we are waiting for a new state
    case ROUND_STARTING:
    case ROUND_FINISHED:
      break;
  }

  this.no_players++;
  this.players[player_id] = player;
  this.on_player_join(player);

  return player;
}

/**
 *  Removes a player from the game world.
 *  @param player {Player} the player to add
 *  @return {undefined} Nothing
 */
World.prototype.remove_player = function(player_id, reason) {
  var player = this.players[player_id];
  if (!player) return;
  if (this.r_state == ROUND_WARMUP && player.ready) {
    this.no_ready_players--;
  }
  if (player.entity) {
    this.remove_entity(player.entity.id);
  }
  // remove all bullets produced by player
  var entities = this._entities, l = entities.length;
  while (l--) {
    var bullet = entities[l];
    if (bullet.type == "bullet" && bullet.player.id == player_id) {
      this.remove_entity(bullet.id);
    }
  }

  delete this.players[player.id];
  this.no_players--;
  this.on_player_leave(player, reason);
}

/**
 *  Sets the ready state of a player to true.
 *  @param player_id {Number} the specified player
 *  @return {undefined} Nothing
 */
World.prototype.set_player_ready = function(player_id) {
  var player = this.players[player_id];
  // race condition - player can be undefined
  if (player && this.r_state == ROUND_WARMUP && !player.ready) {
    player.ready = true;
    this.no_ready_players++;
    this.on_player_ready(player);
  }
}

/**
 *  Sets player name
 *  @param player_id {Number} the specified player
 *  @param new_name {String} the new name
 *  @return {undefined} Nothing
 */
World.prototype.set_player_name = function(player_id, new_name) {
  var player = this.players[player_id],
      old_name = player.name;
  if (old_name != new_name) {
    player.name = new_name;
    this.on_player_name_changed(player, new_name, old_name);
  }
}

/**
 *  Sets the action of a player.
 *  @param player {Player} the specified player
 *  @return {undefined} Nothing
 */
World.prototype.set_player_action = function(player_id, action) {
  var player = this.players[player_id];
  if (player.action != action &&
      !player.dead &&
     (this.r_state == ROUND_WARMUP || this.r_state == ROUND_RUNNING)) {
    player.action = action;
    this.on_player_action(player, action);
  }
}

/**
 *  Adds an Entity instance to the World.
 *  @param {Entity} entity The Entity instance to add.
 *  @returns {undefined} Nothing
 */
World.prototype.add_entity = function(entity) {
  var entity_id = this.entity_count++;
  entity.id = entity_id;
  this.entities[entity_id] = entity;
  this._entities.push(entity);
}

/**
 *  Deletes an Entity instance by its ID.
 *  @param {Number} id The ID of the entity.
 *  @returns {undefined} Nothing
 */
World.prototype.remove_entity = function(id) {
  var entities = this._entities, l = entities.length, i = -1;
  while (l--) {
    if (entities[l].id == id) { i = l; break; }
  }
  if (i != -1){
    entities.splice(i, 1);
    delete this.entities[id];
  }
}

/**
 *  Executes a callback on each player in the game world
 *  @param callback {Function} the callback to be executed.
 *  @returns {undefined} Nothing
 */
World.prototype.forEachPlayer = function(callback) {
  for (var id in this.players) {
    callback(this.players[id]);
  }
}

/**
 *  Executes a callback on each powerup in the game world
 *  @param callback {Function} the callback to be executed.
 *  @returns {undefined} Nothing
 */
World.prototype.forEachPowerup = function(callback) {
  for (var id in this.powerups) {
    callback(this.powerups[id]);
  }
}

/**
 *  Kills a player
 *  @param {Player} the player that should be killed.
 *  @param {DEATH_CAUSE_*} death_cause The cause of death
 *  @param {Player} killed_by The killer if not suicide.
 *  @return {undefined} Nothing
 */
World.prototype.kill_player = function(player_id, death_cause, killed_by_id) {
  var player      = this.players[player_id];
      killer      = this.players[killed_by_id] || null,
      old_entity  = player.entity;

  switch (death_cause) {

    case DEATH_CAUSE_SUICDE:
      player.suicides++;
      player.score = (player.score - this.rules.suicide_penelty) < 0 ? 0 : player.score - this.rules.suicide_penelty;
      break;

    case DEATH_CAUSE_KILLED:
      killer.kills++;
      killer.score += this.rules.kill_score;
      break;

  }

  player.deaths++;

  this.remove_entity(player.entity.id);

  player.action = 0;
  player.dead = true;
  player.entity = null;

  this.on_player_died(player, old_entity, death_cause, killer);
}

/**
 *  Spawns a new player ship at a random location.
 *  @param player_id {Number} the id of the player to spawn
 *  @param pos {x, y} (optional) the spawn position.
 *  @return {gameobjects.Ship} The newly created Ship instance.
 */
World.prototype.spawn_player = function(player_id, pos) {
  var player = this.players[player_id];
  var spawn_pos = pos;

  if (!spawn_pos) {
    var spawn_points = this.player_spawn_points;
    var index = spawn_points.length;
    var indecies = get_random_indicies(spawn_points);

    while (index--) {
      var spawn_point = spawn_points[indecies[index]];
      if (!this.bounds_intersects(spawn_point, 'ship')) {
        spawn_pos = [spawn_point.x + (GRID_CELL_SIZE / 2),
                     spawn_point.y + (GRID_CELL_SIZE / 2)];

        break;
      }
    }

    if (!spawn_pos) {
      spawn_pos = this.get_random_respawn_pos();
    }
  }

  var entity = new Ship({
    pos:    spawn_pos,
    player: player
  });
  this.add_entity(entity);

  player.action = 0;
  player.powerup = 0;
  player.energy = 100;
  player.entity = entity;
  player.dead = false;
  player.respawn_time = 0;

  this.on_player_spawn(player, entity.pos);

  return entity;
}

/**
 *  Spawns a new bullet.
 */
World.prototype.fire_player_cannon = function(player_id, angle, pos, vel, powerup) {
  var player = this.players[player_id];
  var ship = player.entity;
  var powerup = powerup || player.powerup;
  var lifetime = (powerup & POWERUP_RICO) == POWERUP_RICO ?
                                  this.tick + (RBULLET_LIFETIME *  this.delta) :
                                  this.tick + (BULLET_LIFETIME *  this.delta);
  var count = (powerup & POWERUP_SPREAD) == POWERUP_SPREAD ? 3 : 1;
  var pos = pos || [
    ship.pos[0] + Math.cos(angle - Math.PI / 2) * ship.size[0] * 2,
    ship.pos[1] + Math.sin(angle - Math.PI / 2) * ship.size[0] * 2
  ];
  var vel = vel || [
    Math.cos(angle - Math.PI / 2) * (BULLET_MAX_SPEED) + ship.vel[0],
    Math.sin(angle - Math.PI / 2) * (BULLET_MAX_SPEED) + ship.vel[1]
  ];

  var velocities = [vel];

  if ((powerup & POWERUP_SPREAD) == POWERUP_SPREAD) {
    velocities.unshift(vector_rotate.apply(null, [-Math.PI / 8, vel]));
    velocities.push(vector_rotate.apply(null, [Math.PI / 8, vel]));
  }

  var bullet_vel = null;

  while ((bullet_vel = velocities.shift())) {
    var entity = new Bullet({
      rico: (powerup & POWERUP_RICO) == POWERUP_RICO,
      lifetime: lifetime,
      pos: pos,
      vel: bullet_vel,
      angle: angle,
      player: player
    });
    this.add_entity(entity);
  }

  if ((powerup & POWERUP_RAPID) == POWERUP_RAPID) {
    player.energy -= (this.rules.shoot_cost / 3) * this.delta;
    player.reload_time = this.tick + (this.rules.reload_time / 2) * this.delta;
  } else {
    player.energy -= this.rules.shoot_cost * this.delta;
    player.reload_time = this.tick + this.rules.reload_time * this.delta;
  }

  this.on_player_fire(player, angle, pos, vel, powerup);

  return entity;
}

/**
 *  Finds a position to respawn on.
 *  @return {x, y} A point to a location where it's safe to spawn.
 */
World.prototype.get_random_respawn_pos = function() {
  var bounds = { x: 0, y: 0, w: GRID_CELL_SIZE - 2, h: GRID_CELL_SIZE - 2};
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
 *  Set round state
 *  @param {Number} t Current world frame
 *  @param {Number} dt Current delta time
 *  @returns {undefined} Nothing
 */
World.prototype.set_round_state = function(state, winners) {
  var self = this;
  switch (state) {

    // Sets round state to waiting. Remove all existing entities and
    // spawn new ships.
    case ROUND_WARMUP:
      this.no_ready_players = 0;
      this.r_timer = 0;
      this.r_winners = [];
      this.forEachPlayer(function(player) {
        player.ready = false;
        player.score = 0;
        player.kills = 0;
        player.deaths = 0;
        player.suicides = 0;
        if (self.server_mode) {
          self.spawn_player(player.id);
        }
      });
      this.forEachPowerup(function(powerup) {
        self.remove_entity(powerup.id);
      });
      break;

    // The round is starting. Remove all entities from the world and prepare
    // players for fight!
    case ROUND_STARTING:
      this.r_timer = this.tick + ROUND_START_DELAY * this.delta;
      this.forEachPlayer(function(player) {
        player.respawn_time = 0;
        player.dead = true;
        if (player.entity) {
          self.remove_entity(player.entity.id);
        }
      });
      break;

    // The round is now started.
    case ROUND_RUNNING:
      this.r_timer = 0;
      this.forEachPlayer(
        function(player) {
          player.time = self.tick;
          player.ready = false;
          player.score = 0;
          player.kills = 0;
          player.deaths = 0;
          player.suicides = 0;
          if (self.server_mode) {
            self.spawn_player(player.id);
          }
        }
      );
      break;

    case ROUND_FINISHED:
      this.forEachPlayer(
        function(player) {
          if (player.entity) {
            self.remove_entity(player.entity.id);
          }
          player.dead = true;
          player.respawn_time = 0;
        }
      );
      this.r_timer = this.tick + ROUND_NEXT_MAP_DELAY * this.delta;
      this.r_winners = winners;
      break;
  }

  this.r_state = state;
  this.on_round_state_changed(this.r_state, this.r_winners);
}

/**
 *  Moves all alive entities in the world.
 */
World.prototype.update_entities = function(t, dt) {
  var entities = this.entities;
  for (var id in entities) {
    var entity = entities[id], res = false;
    entity.world_update(t, dt);
  }
}

/**
 *  Update game world states
 *  @param {Number} t Current world time.
 *  @param {Number} dt Current delta time,
 *  @return {undefined} Nothing
 */
World.prototype.update_state = function(t, dt) {
  var players   = this.players,
      rules     = this.rules,
      respawn_t = rules.respawn_time;

  // Update round timer if running
  if (this.r_state == ROUND_RUNNING) {
    this.r_timer += dt;
  }

  for (var player_id in players) {
    var player = players[player_id];


    // It's the server's job to spawn players.
    if (this.server_mode && player.respawn_time && t >= player.respawn_time) {
      this.spawn_player(player_id);
    }

    switch (this.r_state) {
      case ROUND_WARMUP:
        respawn_t = ROUND_WARMUP_RESPAWN_DELAY;
      case ROUND_RUNNING:
        if (player.dead && !player.respawn_time) {
          player.respawn_time = t + respawn_t * dt;
        }
        break;
    }

    if (!player.dead) {
      var entity = player.entity;

      entity.set(THRUST, player.is(THRUST));

      if (player.is(SHIELD) && player.energy >= rules.shield_cost * dt) {
        player.energy -= rules.shield_cost * dt;
        entity.set(SHIELD, true);
      } else {
        entity.set(SHIELD, false);
      }

      if (player.reload_time && t >= player.reload_time) {
        player.reload_time = 0;
      }

      if (!player.is(SHIELD) && player.is(SHOOT) && !player.reload_time &&
                                        player.energy >= rules.shoot_cost * dt) {
        entity.set(SHOOT, true);

        // Again, to keep things synchronized, we let the server handle firing
        if (this.server_mode) {
          this.fire_player_cannon(player_id, entity.angle);
        }

      } else {
        entity.set(SHOOT, false);
      }

      if (player.energy < 100 && !player.is(SHIELD) && !player.is(SHOOT)) {
        player.energy += rules.energy_recovery * dt;
        if (player.energy > 100) {
          player.energy = 100;
        }
      }

      if (player.powerup > 0) {
        for (var powerup_type in player.powerup_timers) {
          if (player.powerup_timers[powerup_type] &&
              player.powerup_timers[powerup_type].end < t) {
            player.remove_powerup(powerup_type);
          }
        }
      }

      entity.powerup = player.powerup;
    }
  }

  if (this.server_mode && this.r_state == ROUND_RUNNING) {
    if (this.powerup_next_spawn == 0) {

      // spawn first powerups a little faster
      this.powerup_next_spawn = t + (rules.powerup_respawn / 4) * dt;

    } else if (this.powerup_next_spawn < t) {

      if (this.powerup_count < rules.powerup_max)  {
        // We can spawn more powerups. Take a random no how many that should be
        // spawned.
        var rnd = Math.round(Math.random() * (rules.powerup_max -
                                            this.powerup_count));

        while (rnd--) {
          this.spawn_powerup();
        }

      }

      this.powerup_next_spawn = t + rules.powerup_respawn * dt;
    }
  }

}

/**
 *  Spawns a new powerup at a random location.
 *  @param powerup_id {Number} the id of the powerup
 *  @param type {Number} the type of power-up
 *  @param pos {x, y} (optional) the spawn position.
 *  @return {gameobjects.Ship} The newly created Ship instance.
 */
World.prototype.spawn_powerup = function(powerup_id, type, pos) {
  var spawn_pos = pos;

  if (!spawn_pos) {
    var spawn_points = this.powerup_spawn_points;

    if (!spawn_points.length) {
      spawn_pos = this.get_random_respawn_pos();
    } else {
      var index = spawn_points.length;
      var indecies = get_random_indicies(spawn_points);

      while (index--) {
        var spawn_point = spawn_points[indecies[index]];
        if (!this.bounds_intersects(spawn_point, 'powerup')) {
          spawn_pos = [spawn_point.x + (GRID_CELL_SIZE / 2),
                       spawn_point.y + (GRID_CELL_SIZE / 2)];
          break;
        }
      }

      if (!spawn_pos) {

        // No position available
        return;
      }

    }

  }

  var entity = new Powerup({
    powerup_id:   powerup_id || this.powerup_id_incr++,
    powerup_type: type || get_random_powerup_type(),
    pos:          spawn_pos
  });
  this.powerup_count++;
  this.add_entity(entity);
  this.powerups[entity.powerup_id] = entity;
  this.on_powerup_spawn(entity);
  return entity;
}

/**
 *  Kill powerup
 *  @param powerup_id {Number} the id of the powerup
 *  @param destroyed_by_id {Number} id of player who destroyed the powerup
 *  @return {undefined} nothing
 */
World.prototype.kill_powerup = function(powerup_id, destroyed_by_id) {
  var powerup       = this.powerups[powerup_id],
      player        = this.players[destroyed_by_id];

  if (powerup) {
    var powerup_t = get_powerup_decline_time(this.rules, powerup);
    player.set_powerup(powerup.powerup_type, this.tick,
                       this.tick + powerup_t * this.delta);

    this.powerup_count--;
    this.remove_entity(powerup.id);
    delete this.powerups[powerup_id];
    this.on_powerup_die(powerup, player);
  }
}

/**
 *  Moves the game world one tick ahead.
 *  @param {Number} t Current world frame
 *  @param {Number} dt Current delta time
 *  @returns {undefined} Nothing
 */
World.prototype.update = function(t, dt) {
  var entities  = this.entities,
      target    = null;
  this.tick = t;
  this.delta = dt;
  this.update_entities(t, dt);
  this.handle_collisions(t, dt);
  this.update_state(t, dt);
  this.on_update(t, dt);
  this.remove_destroyed_entities();
}

/**
 *  Returns a list of current entity interesections.
 *  @returns {Array} A list of entity interesections.
 */
World.prototype.get_intersections = function() {
  var entities      = this._entities.slice(0);
      index         = entities.length,
      index2        = 0,
      intersections = [],
      entity        = null,
      target        = null;

  while (index--) {
    entity = entities[index];

    if (entity.obstacle) {
      continue;
    }

    index2 = entities.length;

    while (index2--) {
      target = entities[index2];
      if (target != entity && intersects(entity.get_bounds(), target.get_bounds())) {
        intersections.push({entity: entity, target: target});
        break;
      }
    }

    entities.splice(index, 1);
  }

  return intersections;
}

/**
 *  Returns whatever the specified Bounding box intersects with an Entity
 *  in the world.
 *  @param {x,y,w,h} box The bounding box
 *  @returns {Boolean} Returns True if the bounding box intersects else False.
 */
World.prototype.bounds_intersects = function(box, type) {
  var entities      = this._entities;
      index         = entities.length;

  while (index--) {
    entity = entities[index];
    if ((!type || entity.type == type) && intersects(box, entity.get_bounds())) {
      return true
    }
  }

  return false;
}

/**
 *  Checks and resolves collisions between entities.
 *  @param {Number} t Current world time.
 *  @param {Number} dt Current delta time,
 *  @return {undefined} Nothing
 */
World.prototype.handle_collisions = function(t, dt) {
  var intersections = this.get_intersections(),
      index = intersections.length
      trash = [];

  while (index--) {
    var intersection = intersections[index];
    collision_resolver([intersection.entity, intersection.target, this.server_mode]);
  }
}

/**
 *  Remove all destroyed entities
 */
World.prototype.remove_destroyed_entities = function(t, dt) {
  var index = this._entities.length;
  while (index--) {
    var entity = this._entities[index];
    if (entity.destroyed) {
      switch (entity.type) {
        case 'ship':
          this.kill_player(entity.player.id, entity.death_cause, entity.destroyed_by);
          break;

        case 'powerup':
          this.kill_powerup(entity.powerup_id, entity.destroyed_by.id);
          break;

        default:
          this.remove_entity(entity.id);
          break
      }
    }
  }
}

/**
 *  Finds an Entity by id
 */
World.prototype.find = function(id_to_find) {
  for (var id in this.entities) {
    if (id == id_to_find) return this.entities[id];
  }
  return null;
}

/**
 *  Gets an representation of this object
 */
World.prototype.get_repr = function() {
  var players = [],
      powerups = [];

  for (var id in this.players) {
    players.push(this.players[id].get_repr());
  }

  for (var id in this.powerups) {
    powerups.push(this.powerups[id].get_repr());
  }

  return [
    {
      tick:               this.tick,
      delta:              this.delta,
      max_players:        this.max_players,
      no_players:         this.no_players,
      no_ready_players:   this.no_ready_players,
      start_time:         this.start_time,
      r_state:            this.r_state,
      r_timer:            this.r_timer,
      r_winners:          this.r_winners
    },
    players,
    powerups
  ]
}

/**
 *  Class Player
 *  Represents a Player in the game world.
 */
function Player(initial) {
  this.on_before_init.apply(this, Array.prototype.slice.call(arguments));
  this.id             = initial.id || -1;
  this.name           = initial.name || 'Unknown';
  this.joined         = initial.joined || new Date().getTime();
  this.ping           = initial.ping || 0;
  this.time           = initial.time || 0;
  this.entity         = initial.entity || null;
  this.ready          = initial.ready || false;
  this.score          = initial.score || 0;
  this.kills          = initial.kills || 0;
  this.deaths         = initial.deaths || 0;
  this.suicides       = initial.suicides || 0;
  this.energy         = initial.energy || 100;
  this.action         = initial.action || 0;
  this.powerup        = initial.powerup || 0;
  this.reload_time    = initial.reload_time || 0;
  this.respawn_time   = initial.respawn_time || 0;
  this.dead           = initial.dead || true;
  this.powerup_timers = initial.powerup_times || { 1: null, 2: null, 4: null};
  this.on_after_init();
}

/**
 *  Playerholder for the Player on_before_init event
 */
Player.prototype.on_before_init = function() {}

/**
 *  Playerholder for the Player on_after_init event
 */
Player.prototype.on_after_init = function() {}

Player.prototype.is = function(flag) {
  return (this.action & flag) == flag;
}

Player.prototype.set = function(flag) {
  return this.action |= flag;
}

Player.prototype.has_powerup = function(flag) {
  return (this.powerup & flag) == flag;
}

Player.prototype.set_powerup = function(flag, start_time, end_time) {
  this.powerup_timers[flag] = {start: start_time, end: end_time};
  return this.powerup |= flag;
}

Player.prototype.remove_powerup = function(flag) {
  this.powerup_timers[flag] = null;
  return this.powerup &= ~flag;
}

/**
 *  Gets an representation of this object
 */
Player.prototype.get_repr = function() {
  var repr = {
    id: this.id,
    name: this.name,
    joined: this.joined,
    ping: this.ping,
    time: this.time,
    ready: this.ready,
    score: this.score,
    kills: this.kills,
    deaths: this.deaths,
    suicides: this.suicides,
    energy: this.energy,
    action: this.action,
    powerup: this.powerup,
    ready: this.ready,
    reload_time: this.reload_time,
    respawn_time: this.respawn_time,
    dead: this.dead,
    powerup_timers: this.powerup_timers
  }

  if (!this.dead) {
    repr.pos = this.entity.pos;
    repr.vel = this.entity.vel;
    repr.angle = this.entity.angle;
  }

  return repr;
}

/**
 *  Returns a string representation of the Player instance.
 *  @return {String} A String represetating the Player.
 */
Player.prototype.toString = function() {
  return 'Player ' + this.name + ' (' + this.id + ')';
}

/**
 *  Class Ship
 *  Represents a Ship entity.
 */
function Ship(initial) {
  this.on_before_init();
  this.EntityBase_init('ship');
  this.id             = initial.id || -1;
  this.pid            = initial.pid || -1;
  this.pos            = initial.pos || [0, 0];
  this.vel            = initial.vel || [0, 0];
  this.angle          = initial.angle || 0;
  this.player         = initial.player || null;
  this.size           = [SHIP_WIDTH, SHIP_HEIGHT];
  this.action        = 0;
  this.powerup        = 0;
  this.death_cause    = -1
  this.destroyed_by   = -1;
  this.points         =[[0,-SHIP_HEIGHT/2],[SHIP_WIDTH/2,SHIP_HEIGHT/2],[-SHIP_WIDTH/2,SHIP_HEIGHT/2]];
  this.on_after_init();
}

extend_class(Ship, EntityBase);

/**
 *  Destroys the Ship in end of world update.
 *  @param {DEATH_CAUSE_*} death_cause The cause of death
 *  @param {Player} killed_by The killer if not suicide.
 *  @return {undefined} Nothing.
 */
Ship.prototype.destroy = function(death_cause, killer_id) {
  this.destroyed = true;
  this.death_cause = death_cause;
  this.destroyed_by = killer_id;
}

/**
 *  Moves the Ship in the world
 *  @param {Number} t Current world time.
 *  @param {Number} dt Current delta time,
 *  @return {undefined} Nothing.
 */
Ship.prototype.move = function(t, dt) {
  if (this.dead) return;
  var angle = this.angle;
  var max_speed = SHIP_MAX_SPEED;
  var acc_speed = SHIP_ACCELERATION_SPEED;

  var acc = this.is(THRUST) ? dt * acc_speed : 0 ;
  var speedx = this.vel[0] + acc * Math.sin(angle);
  var speedy = this.vel[1] - acc * Math.cos(angle);
  var speed = Math.sqrt(Math.pow(speedx,2) + Math.pow(speedy,2));

  if (speed > max_speed) {
    speedx = speedx / speed * max_speed;
    speedy = speedy / speed * max_speed;
  }

  this.vel = [speedx, speedy];
  this.pos = [this.pos[0] + speedx * dt,  this.pos[1] + speedy * dt]

  this.angle = angle;
}

Ship.prototype.is = function(flag) {
  return (this.action & flag) == flag;
}

Ship.prototype.toggle = function(flag) {
  if (this.action & flag == flag)  {
    this.action = this.action & ~flag;
  } else {
    this.action |= flag;
  }
}

Ship.prototype.set = function(flag, value) {
  this.action = value ? this.action | flag : this.action & ~flag;
}

Ship.prototype.has_powerup = function(flag) {
  return (this.powerup & flag) == flag;
}

/**
 *  Returns bounding box of the Ship
 *  @return {x, y, w, h} The bounds of the Ship.
 */
Ship.prototype.get_bounds = function() {
  return {
      x: (this.pos[0] - 20),
      y: (this.pos[1] - 20),
      w: 40,
      h: 40
  }
}

/**
 *  Represents a static Wall instance
 */
function Wall(initial) {
  this.on_before_init();
  this.EntityBase_init('wall');
  this.id       = initial.id || -1;
  this.pos      = initial.pos || [0, 0];
  this.size     = initial.size || [0, 0];
  this.o        = initial.o || 'n';
  this.obstacle = true;
  this.on_after_init();
}

extend_class(Wall, EntityBase);

/**
 *  Returns bounding box of the Wall
 *  @param {Number} expand (Optional) A value to expand the bounding box with.
 *  @return {x, y, w, h} The bounds of the Ship.
 */
Wall.prototype.get_bounds = function(expand) {
  return {
    x: this.pos[0],
    y: this.pos[1],
    w: this.size[0],
    h: this.size[1]
  }
}

/**
 *  Represents a static Block instance
 */
function Block(initial) {
  this.on_before_init();
  this.EntityBase_init('block');
  var x = initial.pos[0];
  var y = initial.pos[1];
  var width = BLOCK_WIDTH;
  var height = BLOCK_HEIGHT;
  var connectors = initial.connectors;

  if ((connectors & BLOCK_CONNECTOR_NORTH) == BLOCK_CONNECTOR_NORTH) {
    y -= BLOCK_SPACING;
    height += BLOCK_SPACING;
  }

  if ((connectors & BLOCK_CONNECTOR_EAST) == BLOCK_CONNECTOR_EAST) {
    width += BLOCK_SPACING;
  }

  if ((connectors & BLOCK_CONNECTOR_SOUTH) == BLOCK_CONNECTOR_SOUTH) {
    height += BLOCK_SPACING;
  }

  if ((connectors & BLOCK_CONNECTOR_WEST) == BLOCK_CONNECTOR_WEST) {
    x -= BLOCK_SPACING;
    width += BLOCK_SPACING;
  }

  this.id       = initial.id || -1;
  this.pos      = [x, y];
  this.size     = [width, height];
  this.connectors = connectors;
  this.obstacle = true;
  this.on_after_init();
}

extend_class(Block, EntityBase);

/**
 *  Returns bounding box of the Block
 *  @return {x, y, w, h} The bounds of the Ship.
 */
Block.prototype.get_bounds = function() {
  return {
    x: this.pos[0],
    y: this.pos[1],
    w: this.size[0],
    h: this.size[1]
  }
}


/**
 *  Class Bullet
 *  Represents a Bullet Entity
 */
function Bullet(initial) {
  this.on_before_init();
  this.EntityBase_init('bullet');
  this.id     = initial.id || -1;
  this.oid    = initial.oid || -1;
  this.pos    = initial.pos || [0, 0];
  this.vel    = initial.vel || [0, 0];
  this.angle  = initial.angle || 0;
  this.rico   = initial.rico || 0;
  this.player = initial.player || null;
  this.size   = [1, 2];
  this.lifetime = initial.lifetime || 0;
  this.on_after_init();
}

extend_class(Bullet, EntityBase);

/**
 *  Moves the Bullet in the world
 *  @param {Number} t Current world time.
 *  @param {Number} dt Current delta time,
 *  @return {undefined} Nothing.
 */
Bullet.prototype.move = function(t, dt) {
  if (this.lifetime <= t) {
    this.destroy();
  } else {
    this.pos = vector_add(this.pos, vector_mul(this.vel, dt));
  }
}

/**
 *  Returns bounding box of the Bullet
 *  @return {x, y, w, h} The bounds of the Bullet.
 */
Bullet.prototype.get_bounds = function() {
  return {
    x: this.pos[0] - 5,
    y: this.pos[1] - 5,
    w: 10,
    h: 10
  }
}

/**
 *  Class Powerup
 *  Represents a Powerup Entity
 */
function Powerup(initial) {
  this.on_before_init();
  this.EntityBase_init('powerup');
  this.id           = initial.id || -1;
  this.pos          = initial.pos || [0, 0];
  this.powerup_id   = initial.powerup_id;
  this.powerup_type = initial.powerup_type;
  this.size         = [10, 10];
  this.obstacle = true;
  this.destroyed_by = null;
  this.on_after_init();
}

extend_class(Powerup, EntityBase);


/**
 *  Destroys the Powerup instance
 *  @param destroyed_by {Player} the player who destroyed the powerup
 *  @return {undefined} Nothing.
 */
Powerup.prototype.destroy = function(destroyed_by) {
  this.destroyed = true;
  this.destroyed_by = destroyed_by;
}

/**
 *  Returns bounding box of the Wall
 *  @return {x, y, w, h} The bounds of the Ship.
 */
Powerup.prototype.get_bounds = function(expand) {
  return {
    x: this.pos[0] - 5,
    y: this.pos[1] - 5,
    w: 5,
    h: 5
  }
}

/**
 *  Gets an representation of this object
 */
Powerup.prototype.get_repr = function() {
  return {
    pos: this.pos,
    powerup_id: this.powerup_id,
    powerup_type: this.powerup_type
  }
}

/**
 *  Resolvs collision between two entities
 */
var collision_resolver = match (

  /**
   *  Check collission between Ship and Bullet
   */
  [Ship, Bullet, Boolean], function(ship, bullet, server_mode) {
    if (!ship.is(SHIELD) && (ship.player != bullet.player)) {
      // Only kill ship if world is running server. Clients should wait for
      // the message PLAYER + DIE
      var a = vector_rotate.apply(null, [ship.angle].concat(ship.points));

      //add points & pos
      a=[vector_add(ship.pos, a[0]),
        vector_add(ship.pos, a[1]),
        vector_add(ship.pos, a[2])
        ];
      //points for the bullet
      var b=[[bullet.pos[0],bullet.pos[1]],
          [bullet.pos[0],bullet.pos[1]+bullet.size[1]],
          [bullet.pos[0]+bullet.size[0],bullet.pos[1]+bullet.size[1]],
          [bullet.pos[0]+bullet.size[0],bullet.pos[1]]
          ];

      if (poly_check_col(a, b)) {
        if (server_mode) {
          ship.destroy(DEATH_CAUSE_KILLED, bullet.player.id);
        }
      }
    }
  },
  [Bullet, Ship, Boolean], function(bullet, ship, server_mode) {
    return collision_resolver([ship, bullet, server_mode]);
  },

  /**
   * Check collission between Ship and Wall
   */
  [Ship, Wall, Boolean], function(ship, wall, server_mode) {
    if (ship.is(SHIELD)) {

      //distance between object centers
      var distance = sphere_poly_check_col(ship, wall);

      if (distance) {
        var dt = (vector_len(distance) + 1) / vector_len(ship.vel);
        if (dt>0.2 && server_mode){
          ship.destroy(DEATH_CAUSE_SUICDE);
        }else{
          var distance_vector = [-ship.vel[0] * dt, -ship.vel[1] * dt];

          ship.pos[0] += distance_vector[0];
          ship.pos[1] += distance_vector[1];

          if (!server_mode) {
            ship.pos_sv = ship.pos;
          }

          if(distance[0]!=0) {
            ship.vel[0] = -ship.vel[0];
          } else {
            ship.vel[1] =- ship.vel[1];
          }
        }
      }

    } else if(server_mode) {
      var a = vector_rotate.apply(null, [ship.angle].concat(ship.points));

      //add points & pos
      a = [vector_add(ship.pos, a[0]),
           vector_add(ship.pos, a[1]),
           vector_add(ship.pos, a[2])];

      //points for the block
      var b = [[wall.pos[0],wall.pos[1]],
               [wall.pos[0],wall.pos[1]+wall.size[1]],
               [wall.pos[0]+wall.size[0],wall.pos[1]+wall.size[1]],
               [wall.pos[0]+wall.size[0],wall.pos[1]]];

      if (poly_check_col(a, b)) {
        ship.destroy(DEATH_CAUSE_SUICDE);
      }
    }
  },

  /**
   * Check collission between Ship and Wall
   */
  [Ship, Block, Boolean], function(ship, block, server_mode) {
    if (ship.is(SHIELD)) {

      //distance between object centers
      var distance = sphere_poly_check_col(ship, block);

      if (distance) {
        var dt = (vector_len(distance) + 1) / vector_len(ship.vel);
        if (dt>0.2 && server_mode){
          ship.destroy(DEATH_CAUSE_SUICDE);
        }else{
          var distance_vector = [-ship.vel[0] * dt, -ship.vel[1] * dt];

          ship.pos[0] += distance_vector[0];
          ship.pos[1] += distance_vector[1];

          if (!server_mode) {
            ship.pos_sv = ship.pos;
          }

          if(distance[0]!=0) {
            ship.vel[0] = -ship.vel[0];
          } else {
            ship.vel[1] =- ship.vel[1];
          }
        }
      }

    } else if(server_mode) {
      var a = vector_rotate.apply(null, [ship.angle].concat(ship.points));

      //add points & pos
      a = [vector_add(ship.pos, a[0]),
           vector_add(ship.pos, a[1]),
           vector_add(ship.pos, a[2])];

      //points for the block
      var b = [[block.pos[0],block.pos[1]],
               [block.pos[0],block.pos[1]+block.size[1]],
               [block.pos[0]+block.size[0],block.pos[1]+block.size[1]],
               [block.pos[0]+block.size[0],block.pos[1]]];

      if (poly_check_col(a, b)) {
        ship.destroy(DEATH_CAUSE_SUICDE);
      }
    }
  },

  /**
   * Check collission between Bullet and Wall
   */
  [Bullet, Wall, Boolean], function(bullet, wall, server_mode) {
    if (bullet.rico) {
      var x0 = Math.max(bullet.pos[0], wall.pos[0]);
      var x1 = Math.min(bullet.pos[0] + bullet.size[0], wall.pos[0] +
                                                              wall.size[0]);

       if (x0 <= x1) {
         bullet.vel = [bullet.vel[0], -bullet.vel[1]];
       } else {
         bullet.vel = [-bullet.vel[0], bullet.vel[1]];
       }
   	} else {
      bullet.destroy();
    }
  },

  /**
   * Check collission between Bullet and Wall
   */
  [Bullet, Block, Boolean], function(bullet, block, server_mode) {
    if (bullet.rico) {
      var x0 = Math.max(bullet.pos[0], block.pos[0]);
      var x1 = Math.min(bullet.pos[0] + bullet.size[0], block.pos[0] +
                                                              block.size[0]);

       if (x0 <= x1) {
         bullet.vel = [bullet.vel[0], -bullet.vel[1]];
       } else {
         bullet.vel = [-bullet.vel[0], bullet.vel[1]];
       }
   	} else {
      bullet.destroy();
    }
  },

  /**
   * Check collission between Ship and Ship
   */
  [Ship, Ship, Boolean], function(ship_a, ship_b, server_mode) {
    // Client waits for PLAYER + DIE message, so ignore all collision
    // between players, if not in server mode, and one shield is off.
    if(ship_a.is(SHIELD) && ship_b.is(SHIELD)) {
      //make a collsiontest for circles
      var dx = ship_b.pos[0] - ship_a.pos[0];
      var dy = ship_b.pos[1] - ship_a.pos[1];
      var d = Math.sqrt(dx * dx + dy * dy);

      if(d<=40){
        //retrace time until real collision occured
        vp1=ship_a.vel[0]*dx/d+ship_a.vel[1]*dy/d;
        vp2=ship_b.vel[0]*dx/d+ship_b.vel[1]*dy/d;
        dt=(40-d)/(vp1-vp2);

        //move back in time
        ship_a.pos[0]-=ship_a.vel[0]*dt;
        ship_a.pos[1]-=ship_a.vel[1]*dt;
        ship_b.pos[0]-=ship_b.vel[0]*dt;
        ship_b.pos[1]-=ship_b.vel[1]*dt;

        dx=ship_b.pos[0]-ship_a.pos[0];
        dy=ship_b.pos[1]-ship_a.pos[1];
        d=40;

        var ax = dx/d;
        var ay = dy/d;

        //Projections
        var va1 = ship_a.vel[0]*ax+ship_a.vel[1]*ay;
        var va2 = ship_b.vel[0]*ax+ship_b.vel[1]*ay;
        var vb1 = -ship_a.vel[0]*ay+ship_a.vel[1]*ax;
        var vb2 = -ship_b.vel[0]*ay+ship_b.vel[1]*ax;

        //Velocity
        var vaP1 = va1 + (1+1)*(va2-va1)/(1+1/1);
        var vaP2 = va2 + (1+1)*(va1-va2)/(1+1/1);

        ship_a.vel[0] = vaP1 * ax + vb1 * ay;
        ship_a.vel[1] = vaP1 * ay + vb1 * ax;
        ship_b.vel[0] = vaP2 * ax + vb2 * ay;
        ship_b.vel[1] = vaP2 * ay + vb2 * ax;

        //Fast forward time to catch up
        ship_a.pos[0] += ship_a.vel[0] * dt;
        ship_a.pos[1] += ship_a.vel[1] * dt;
        ship_b.pos[0] += ship_b.vel[0] * dt;
        ship_b.pos[1] += ship_b.vel[1] * dt;

        if (!server_mode) {
          ship_a.pos_sv = ship_a.pos;
          ship_b.pos_sv = ship_b.pos;
        }

      }

    } else if (server_mode && !ship_a.is(SHIELD) && !ship_b.is(SHIELD)) {

      //collision test triangle vs triangle
      var a = vector_rotate.apply(null, [ship_a.angle].concat(ship_a.points));

      //add points & pos
      a = [vector_add(ship_a.pos, a[0]),
           vector_add(ship_a.pos, a[1]),
           vector_add(ship_a.pos, a[2])];

      var b = vector_rotate.apply(null, [ship_b.angle].concat(ship_b.points));

      //add points & pos
      b = [vector_add(ship_b.pos, b[0]),
           vector_add(ship_b.pos, b[1]),
           vector_add(ship_b.pos, b[2])];

      if (poly_check_col(a, b)) {
        ship_a.destroy(DEATH_CAUSE_SUICDE);
        ship_b.destroy(DEATH_CAUSE_SUICDE);
      }
    } else if (server_mode) {
      if (!ship_a.is(SHIELD)) {
        ship_a.destroy(DEATH_CAUSE_KILLED, ship_b.player.id);
      }
      if (!ship_b.is(SHIELD)) {
        ship_b.destroy(DEATH_CAUSE_KILLED, ship_a.player.id);
      }
    }
  },

  /**
   * Check collission between Ship and Powerup
   */
  [Ship, Powerup, true], function(ship, powerup) {
    powerup.destroy(ship.player);
  }
);

function vector_add(a, b) {
  return [a[0] + b[0], a[1] + b[1]];
}

function vector_sub(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}

function vector_mul(a, v) {
  return [a[0] * v, a[1] * v];
}

function vector_div(a, v) {
  return [a[0] / v, a[1] / v];
}

function vector_pow(a, exponent) {
  return [Math.pow(a[0], exponent), Math.pow(a[1], exponent)];
}

function vector_abs(v) {
  return [Math.abs(v[0]), Math.abs(v[1])];
}

/**
 *  Get unit vector
 */
function vector_unit(a){
  var l = vector_len(a);
  return [a[0]/l, a[1]/l];
}

/**
 *  Get dot product from two vectors
 */
function vector_dot(a, b) {
  return (a[0]*b[0])+(a[1]*b[1]);
}

/**
 *  Vector length
 */
function vector_len(a) {
  return Math.sqrt(a[0]*a[0]+a[1]*a[1]);
}

/**
 *  Vector square length
 */
function vector_lens(a) {
  return a[0]*a[0]+a[1]*a[1];
}

/**
 * Projects vector a onto vector b
 */
function vector_proj(a, b) {
  bls = vector_lens(b);
  if (bls!=0) return vector_mul(b,vector_dot(a,b)/bls);
  else return [0,0];
}

/**
 * Rotates one or more vectors
 */
function vector_rotate() {
  var args = Array.prototype.slice.call(arguments);
  var angle = args.shift();
  var result = [];
  var sin=Math.sin(angle);
  var cos=Math.cos(angle);
  var vector;

  while (vector = args.shift()) {
    result.push([vector[0] * cos - vector[1] * sin,
                 vector[0] * sin + vector[1] * cos]);
  }

  return result.length == 1 ? result[0] : result;
}

function distance_between(a, b) {
  var x = a[0] - b[0];
  var y = a[1] - b[1];
  return Math.sqrt(x * x + y * y);
}

function get_random_powerup_type() {
  var no = Math.floor(Math.random() * 3);
  switch (no) {
    case 0:
      return POWERUP_SPREAD;
    case 1:
      return POWERUP_RAPID;
    case 2:
      return POWERUP_RICO;
  }
}

function get_powerup_decline_time(rules, powerup) {
  switch (powerup.powerup_type) {
    case POWERUP_SPREAD:
      return rules.powerup_spread_t;

    case POWERUP_RAPID:
      return rules.powerup_rapid_t;

    case POWERUP_RICO:
      return rules.powerup_rico_t;
  }
}

function aabb_distance_sphere(sphere, box) {
  var distance = 0;
  var diff=0;
  // process X
  if (sphere[0] < box[0][0]) {
    var diff = sphere[0] - box[0][0];
    distance += diff;
  } else if (sphere[0] >  box[2][0]) {
    diff = sphere[0] - box[2][0];
    distance += diff;
  }

  // process Y
  if (sphere[1] < box[0][1]) {
    diff = sphere[1] - box[0][1];
    distance += diff;
  } else if (sphere[1] > box[2][1]) {
    diff = sphere[1] - box[2][1];
    distance += diff;
  }

  return distance;
}

function aabb_distance_vector_sphere(sphere, radius, box) {
  var distx = 0;
  var disty = 0;
  var diff=0;
  // process X
  if (sphere[0] < box[0][0]) {
    diff = sphere[0] + radius - box[0][0];
    distx -= diff;
  }

  else if (sphere[0] > box[2][0]) {
    diff = sphere[0] - radius - box[2][0];
    distx += diff;
  }

  // process Y
  if (sphere[1] < box[0][1]) {
    diff = sphere[1] + radius - box[0][1];
    disty -= diff;
  }

  else if (sphere[1] > box[2][1]) {
    diff = sphere[1] - radius - box[2][1];
    disty += diff;
  }

  return [-distx, -disty];
}

function poly_check_col(a, b) {
  var col = private_poly_check_col(a, b);
  if (col) return private_poly_check_col(b, a);
  return false;
}

function sphere_poly_check_col(s, p){

    //get locations
    var p = [[p.pos[0], p.pos[1]],
            [p.pos[0], p.pos[1]+p.size[1]],
            [p.pos[0]+p.size[0], p.pos[1]+p.size[1]],
            [p.pos[0]+p.size[0], p.pos[1]]];

    var dis = 0;
    var r = 20;

    dis=Math.abs(aabb_distance_sphere(s.pos, p));

    if (dis < r){
      return aabb_distance_vector_sphere(s.pos, r, p);;
    }else {
      return false;
    }
}

function private_poly_check_col(a, b) {
  var vbr=[];

  for(var i=0; i<a.length-1;i++){
    vbr.push([a[i][0]-a[i+1][0], a[i][1]-a[i+1][1]]);
  }

  vbr.push([a[a.length-1][0]-a[0][0], a[a.length-1][1]-a[0][1]]);

  var i;
  var smaxv, sminv, bmaxv, bminv, sv;
  for (i=0;i<vbr.length;i++) {

    //make a right hand normal, to project upon
    rnv= [-vbr[i][1],vbr[i][0]];

    //Start projecting points
    //smaxv=v_proj(sp[0],rnv)
    smaxv=vector_dot(a[0],rnv);
    sminv=smaxv;
    sv=0;
    for (var j=1;j<a.length;j++) {
      sv=vector_dot(a[j],rnv);
      smaxv = sv > smaxv ? sv : smaxv;
      sminv = sv < sminv ? sv : sminv;
    }

    bmaxv=vector_dot(b[0],rnv);
    bminv=bmaxv;
    for (var g=1;g<b.length;g++) {
      sv=vector_dot(b[g],rnv);
      bmaxv = sv > bmaxv ? sv : bmaxv;
      bminv = sv < bminv ? sv : bminv;
    }

    //so.. do we intersect?
    if((smaxv<bminv)||(sminv>bmaxv)){

      //found a space between objects, lets move on
      //internal_log('space i:'+i + 'smin'+sminv+'smax'+smaxv+'bminv'+bminv+'bmaxv'+bmaxv+' sp'+a[0]);
      return false;
    }
  }

  return true;
}



/**
 * Returns whether two rectangles intersect. Two rectangles intersect if they
 * touch at all, for example, two zero width and height rectangles would
 * intersect if they had the same top and left.
 *
 * Note: Stolen from google closure library
 *
 * @param {goog.math.Rect} a A Rectangle.
 * @param {goog.math.Rect} b A Rectangle.
 * @return {boolean} Whether a and b intersect.
 */
function intersects(a, b) {
  var x0 = Math.max(a.x, b.x);
  var x1 = Math.min(a.x + a.w, b.x + b.w);

  if (x0 <= x1) {
    var y0 = Math.max(a.y, b.y);
    var y1 = Math.min(a.y + a.h, b.y + b.h);

    if (y0 <= y1) {
      return true;
    }
  }
  return false;
}

function get_args(a) {
  return Array.prototype.slice.call(a);
}

function get_random_indicies(list) {
  var result = [],
      count = list.length,
      index = -1;
  while (count--) {
    while (index == -1 || result.indexOf(index) != -1) {
      index = Math.floor(Math.random() * list.length);
    }
    result.push(index);
  }
  return result;
}

/**
 *  Returns a number with specified decimals
 *  @param {Number} value The number to round
 *  @param {Number} decimals The no of deciamls.
 *  @return {Number} A rounded number.
 */
function round_number(value, decimals) {
	return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
}

function internal_log(msg) {
  try {
    typeof console !== "undefined" && console.log(msg);
  } catch (e) {
    require('sys').puts(msg);
  }
}

// Export for CommonJS (in this case node.js)
try {

  global.World = World;
  global.GameLoop = GameLoop;
  global.Player = Player;
  global.Ship = Ship;
  global.Wall = Wall;
  global.Bullet = Bullet;

  global.DT = DT;

  global.GAME_PACKET = GAME_PACKET;
  global.PING_PACKET = PING_PACKET;

  global.OP_PLAYER_SPAWN       = OP_PLAYER_SPAWN;
  global.OP_PLAYER_DIE         = OP_PLAYER_DIE;
  global.OP_PLAYER_STATE       = OP_PLAYER_STATE;
  global.OP_PLAYER_INFO        = OP_PLAYER_INFO;
  global.OP_PLAYER_FIRE        = OP_PLAYER_FIRE;
  global.OP_PLAYER_CONNECT     = OP_PLAYER_CONNECT;
  global.OP_PLAYER_DISCONNECT  = OP_PLAYER_DISCONNECT;
  global.OP_POWERUP_SPAWN      = OP_POWERUP_SPAWN;
  global.OP_POWERUP_DIE        = OP_POWERUP_DIE;
  global.OP_ROUND_STATE        = OP_ROUND_STATE;
  global.OP_PLAYER_SAY         = OP_PLAYER_SAY;

  global.OP_REQ_SERVER_INFO    = OP_REQ_SERVER_INFO;
  global.OP_SERVER_INFO        = OP_SERVER_INFO;
  global.OP_SERVER_EXEC_RESP   = OP_SERVER_EXEC_RESP;
  global.OP_DISCONNECT_REASON  = OP_DISCONNECT_REASON;
  global.OP_WORLD_DATA         = OP_WORLD_DATA;
  global.OP_WORLD_STATE        = OP_WORLD_STATE;
  global.OP_WORLD_RECONNECT    = OP_WORLD_RECONNECT;
  global.OP_CLIENT_CONNECT     = OP_CLIENT_CONNECT;
  global.OP_CLIENT_JOIN        = OP_CLIENT_JOIN;
  global.OP_CLIENT_SET         = OP_CLIENT_SET;
  global.OP_CLIENT_STATE       = OP_CLIENT_STATE;
  global.OP_CLIENT_EXEC        = OP_CLIENT_EXEC;
  global.OP_CLIENT_SAY         = OP_CLIENT_SAY;

  global.ROUND_WARMUP  = ROUND_WARMUP,
  global.ROUND_STARTING = ROUND_STARTING,
  global.ROUND_RUNNING  = ROUND_RUNNING,
  global.ROUND_FINISHED = ROUND_FINISHED;

  global.POWERUP_RAPID = POWERUP_RAPID;
  global.POWERUP_RICO = POWERUP_RICO;
  global.POWERUP_SPREAD = POWERUP_SPREAD;

  global.THRUST = THRUST;
  global.SHOOT = SHOOT;
  global.SHIELD = SHIELD;

  global.DEATH_CAUSE_KILLED = DEATH_CAUSE_KILLED;
  global.DEATH_CAUSE_SUICDE = DEATH_CAUSE_SUICDE;

  global.vector_add = vector_add;
  global.vector_sub = vector_sub;
  global.vector_mul = vector_mul;
  global.vector_div = vector_div;
  global.vector_pow = vector_pow;
  global.vector_abs = vector_abs;

  global.intersects = intersects;
  global.round_number = round_number;

} catch (e) {  }
