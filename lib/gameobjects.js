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

// Packet types
var CONTROL_PACKET  = 1,
    GAME_PACKET     = 2,
    PING_PACKET     = 3;

// Net packet op-codes (Subjects)
var SERVER      = 10,
    CLIENT      = 20,
    WORLD       = 30,
    PLAYER      = 40,
    POWERUP     = 50;
    
// Control packet op-codes (for SERVER and CLIENT)
var INFO        = 1,
    HANDSHAKE   = 2
    CONNECT     = 3,
    DISCONNECT  = 4;

// Global game packet op-codes
var STATE       = 1,
    SPAWN       = 2,
    DIE         = 3;

// Player specific packet op-codes.
var COMMAND     = 4,
    ANGLE       = 5,
    READY       = 6,
    FIRE        = 7;
    
// Player commands
var THRUST      = 1,
    SHOOT       = 2,
    ROTATE_E    = 4,  // 0 = off, 1=cw, 2=ccw 
    ROTATE_W    = 8,
    SHIELD      = 16;
    
// World round states
var ROUND_WARMUP  = 1,
    ROUND_STARTING = 2,
    ROUND_RUNNING  = 3,
    ROUND_FINISHED = 4;

var ROUND_START_DELAY = 600,
    ROUND_NEXT_MAP_DELAY = 1200,
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
    BULLET_MAX_SPEED = 250;

var DEATH_CAUSE_KILLED = 1,
    DEATH_CAUSE_SUICDE = 2;

// Power up codes
var POWERUP_SPEED   = 1,
    POWERUP_RAPID   = 2,
    POWERUP_ENERGY  = 4;

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
   *  Tell's the entity that it's being destroyed.
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

    if(!self._kill) {
      self._pid = setTimeout(gameloop, 10);
    } 
  };

  gameloop();
}

//
//  method GameLoop.prototype.kill
//  Kills a running instance. 
//
GameLoop.prototype.kill = function() {
  this._kill = true;
  if (this._pid) {
    clearTimeout(this._pid);
  }
}

/**
 *  Class World
 *  Represents a world object base. The world object is shared between server
 *  and client. 
 *
 *    type                - The entity type. Must be set to 'world'
 *    id (server)         - The unique id for this instance. Is used by server
 *                          to identifiy multiple worlds.
 *    start_time          - The time when the world started to exist.
 *    players             - A dict with connected players. (server)
 *    w                   - World width
 *    h                   - World height
 *    entities            - Entities dict. Used for fast lookups. 
 *    _entities           - Entities list. Is a duplicate of entities but with 
 *                          array like lookups.
 *    collission_manager  - A callback that handles collision detection.
 *
 *    round_state         - Current round state. Vaild values are: "waiting", 
 *                          "starting", "running", "finished".
 */
function World(initial) {
  this.on_before_init();
  this.entity_count = 1;
  this.entities = {};
  this.players = {};
  this._entities = [];
  this.server_mode = initial.server_mode || false;
  this.tick = initial.tick || 0;
  this.delta = initial.delta || 0;
  this.max_players = initial.max_players || 0;
  this.no_players = initial.no_players || 0;
  this.no_ready_players = initial.no_ready_players || 0;
  this.rules = initial.rules || {};
  this.start_time = initial.start_time || new Date().getTime();
  this.r_state = initial.r_state || ROUND_WARMUP;
  this.r_timer = initial.r_timer || 0;
  this.r_winners = initial.r_winners || [];
  this.size = initial.size || [0, 0];
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
 *  Playerholder for on_player_command_changed event
 */
World.prototype.on_player_command = function(player, command) {}

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

/**
 *  Removes all players and entities from the game world, without 
 *  raise any events
 */
World.prototype.reset = function() {
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
  this.tick = 0;
  this.delta = 0;
}

/**
 *  Builds the world
 *  @return {undefined} Nothing
 */
World.prototype.build = function(map_data) {
  var data = map_data.data,
      world_width = data[0].length * GRID_CELL_SIZE,
      world_height = data.length * GRID_CELL_SIZE;

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
World.prototype.add_player = function(player_id, player_name, player_color) {
  var player = new Player({ id: player_id, name: player_name, color: player_color });
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
  if (this.r_state == ROUND_WARMUP && player.ready) {
    this.no_ready_players--;
  }
  if (player.entity) {
    this.remove_entity(player.entity.id);
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
  if (this.r_state == ROUND_WARMUP && !player.ready) {
    player.ready = true;
    this.no_ready_players++;
    this.on_player_ready(player);
  }
}

/**
 *  Sets the command of a player.
 *  @param player {Player} the specified player
 *  @return {undefined} Nothing
 */
World.prototype.set_player_command = function(player_id, command) {
  var player = this.players[player_id];
  if (player.command != command &&
      !player.dead &&
     (this.r_state == ROUND_WARMUP || this.r_state == ROUND_RUNNING)) {
    player.command = command;
    this.on_player_command(player, command);
  }
}

/**
 *  Add's an Entity instance to the World.
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
 *  Delete's an Entity instance by it's ID.
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
  
  player.command = 0;
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
  
  player.command = 0;
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
World.prototype.fire_player_canon = function(player_id, angle) {
  var player = this.players[player_id];
  var ship = player.entity;
  var entity = new Bullet({
    pos: [
      ship.pos[0] + Math.cos(angle - Math.PI / 2) * ship.size[0] * 2,
      ship.pos[1] + Math.sin(angle - Math.PI / 2) * ship.size[0] * 2
    ],
    vel: [
      Math.cos(angle - Math.PI / 2) * (BULLET_MAX_SPEED) + ship.vel[0],
      Math.sin(angle - Math.PI / 2) * (BULLET_MAX_SPEED) - ship.vel[1]
    ],
    angle: angle,
    player: player
  });
  this.add_entity(entity);
  if (player.has_powerup(POWERUP_RAPID)) {
    player.energy -= (this.rules.shoot_cost / 3) * this.delta;
    player.reload_time = this.tick + (this.rules.reload_time / 2) * this.delta;
  } else {
    player.energy -= this.rules.shoot_cost * this.delta;
    player.reload_time = this.tick + this.rules.reload_time * this.delta;
  }
  this.on_player_fire(player, angle);
  return entity;
}

/**
 *  Find's a position to respawn on. 
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
    
    // Set's round state to waiting. Remove all existing entiies and 
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

    
    // It's server's job to spawn players.
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
        
        // Again, to keep things synchronized, we let the server handle fire'ing
        if (this.server_mode) {
          this.fire_player_canon(player_id, entity.angle);
        }
        
      } else {
        entity.set(SHOOT, false);
      }
      
      if (player.has_powerup(POWERUP_ENERGY)) {
        player.energy = 100;
      } else if (player.energy <= 100 && !player.is(SHIELD) && !player.is(SHOOT)) {
        player.energy += rules.energy_recovery * dt
      }
      
      if (player.powerup > 0) {
        for (var powerup_type in player.powerup_timers) {
          if (player.powerup_timers[powerup_type] < t) {
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
    player.set_powerup(powerup.powerup_type, 
                       this.tick + powerup_t * this.delta);
    
    this.powerup_count--;
    this.remove_entity(powerup.id);
    delete this.powerups[powerup_id];
    this.on_powerup_die(powerup, player);
  }
}

/**
 *  Move's the game world one tick ahead.
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
 *  @returns {Boolean} Returns True if the bounding box intersect's else False.
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
 *  Find's an Entity by id
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
      rules:              this.rules,
      start_time:         this.start_time,
      r_state:            this.r_state,
      r_timer:            this.r_timer,
      r_winners:          this.r_winners,
      size:               this.size,
      map_data:           this.map_data
    },
    players,
    powerups
  ]
}

/**
 *  Class Player
 *  Represents a Player in the game world. 
 *
 *  Static fields (Fields that is never changed);
 *    id              - The Entity ID of this ship instance
 *    name            - The name of the player.
 *    color           - Player color
 *    start_time      - The time when the player joined the world.
 *    max_speed       - Max speed of the ship
 *    update_interval - Sync interval 
 *  
 *  Props fields (Fields that are change occasionally):
 *    st (n/r)  - Current state of the player. Vaild values are: 
 *                "r" (ready), "n" (not ready).
 *    s (Int)   - Current score
 *    e (Int)   - Current energy
 *
 *  Actions fields 
 *  Fields such as actions. This fields is highly priorities and will likely
 *  to be sent to client on next world tick. The state field collection 
 *  contains:
 *    sd (0/1)    - Indicates that the shield is activated
 *    sh (0/1)    - Indicates that the player is shooting
 *    t  (0/1)    - Indicates that the player is thursting
 *    r  (0/1/2)  - Indicates that the player is rotating
 */
function Player(initial) {
  this.on_before_init.apply(this, Array.prototype.slice.call(arguments));
  this.id             = initial.id || -1;
  this.name           = initial.name || 'Unknown';
  this.color          = initial.color || '255, 255, 255';
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
  this.command        = initial.command || 0;
  this.powerup        = initial.powerup || 0;
  this.reload_time    = initial.reload_time || 0;
  this.respawn_time   = initial.respawn_time || 0;
  this.dead           = initial.dead || true;
  this.powerup_timers = initial.powerup_times || { 1: 0, 2: 0, 4: 0};  
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
  return (this.command & flag) == flag;
}

Player.prototype.set = function(flag) {
  return this.command |= flag;
}

Player.prototype.has_powerup = function(flag) {
  return (this.powerup & flag) == flag;
}

Player.prototype.set_powerup = function(flag, time) {
  this.powerup_timers[flag] = time;
  return this.powerup |= flag;
}

Player.prototype.remove_powerup = function(flag) {
  this.powerup_timers[flag] = 0;
  return this.powerup &= ~flag;
}

/**
 *  Gets an representation of this object
 */
Player.prototype.get_repr = function() {
  var repr = {
    id: this.id,
    name: this.name,
    color: this.color,
    joined: this.joined,
    ping: this.ping,
    time: this.time,
    ready: this.ready,
    score: this.score,
    kills: this.kills,
    deaths: this.deaths,
    suicides: this.suicides,
    energy: this.energy,
    command: this.command,
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
 *  Static fields (Fields that is never changed);
 *    id              - The Entity ID of this ship instance
 *    pid             - The Player ID.
 *    w               - The width of the ship
 *    h               - The height of the ship
 *    max_speed       - Max speed of the ship
 *    update_interval - Sync interval 
 *
 *  Dynamic fields (Fields that changes often);
 *    x       - The x coordinate of the ship.      
 *    y       - The y coordinate of the ship.
 *    a       - Ships current angle. 
 *    r       - The current rotation of the ship.
 *    sx      - Current speed x value for the the ship.
 *    sy      - Current speed y value for the the ship.
 *
 *  Actions fields 
 *  Fields such as actions. This fields is highly priorities and will likely
 *  to be sent to client on next world tick. The state field collection 
 *  contains:
 *    sd (0/1) - Indicates that the shield is currently activated. 
 *    sh (0/1) - Indicates that the ship is currently shooting.
 *    t  (0/1) - Indicates that the thurst of the ship is currently on.
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
  this.command        = 0;
  this.powerup        = 0;
  this.cached_bounds  = null;
  this.death_cause    = -1
  this.destroyed_by   = -1;
  this.on_after_init();
}

extend_class(Ship, EntityBase);

/**
 *  Destroy's the Ship in end of world update.
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
 *  Move's the Ship in the world
 *  @param {Number} t Current world time.
 *  @param {Number} dt Current delta time,
 *  @return {undefined} Nothing.
 */
Ship.prototype.move = function(t, dt) {
  if (this.dead) return;
  var angle = this.angle,
      max_speed = this.has_powerup(POWERUP_SPEED) ? SHIP_MAX_SPEED * 1.3 :
                                                    SHIP_MAX_SPEED;
      acc_speed = this.has_powerup(POWERUP_SPEED) ? SHIP_ACCELERATION_SPEED * 1.3 :
                                                    SHIP_ACCELERATION_SPEED;

  var acc = this.is(THRUST) ? dt * acc_speed : 0 ;
  var speedx = this.vel[0] + acc * Math.sin(angle);
  var speedy = this.vel[1] + acc * Math.cos(angle);
  var speed = Math.sqrt(Math.pow(speedx,2) + Math.pow(speedy,2));
  
  if (speed > max_speed) {
    speedx = speedx / speed * max_speed;
    speedy = speedy / speed * max_speed;
  }
  
  this.vel = [speedx, speedy];
  this.pos = [this.pos[0] + speedx * dt,  this.pos[1] - speedy * dt]
  
  this.angle = angle;
}

Ship.prototype.is = function(flag) {
  return (this.command & flag) == flag;
}

Ship.prototype.toggle = function(flag) {
  if (this.command & flag == flag)  {
    this.command = this.command & ~flag;
  } else {
    this.command |= flag;
  }
}

Ship.prototype.set = function(flag, value) {
  this.command = value ? this.command | flag : this.command & ~flag; 
}

Ship.prototype.has_powerup = function(flag) {
  return (this.powerup & flag) == flag;
}

/**
 *  Returns bounding box of the Ship
 *  @param {Number} expand (Optional) A value to expand the bounding box with.
 *  @return {x, y, w, h} The bounds of the Ship.
 */
Ship.prototype.get_bounds = function(expand) {
  var exp = expand || 0;
  if (this.is(SHIELD)) {
    this.cached_bounds = {
      x: (this.pos[0] - 20 - exp),
      y: (this.pos[1] - 20 - exp),
      w: 40 + exp,
      h: 40 + exp,
    }    
  } else {
     var sin = Math.sin(this.angle),
         cos = Math.cos(this.angle),
         w   = this.size[0] / 2,
         h   = this.size[1] / 2,
         x1  = this.pos[0] + -sin * -h,
         y1  = this.pos[1] + cos * -h,
         x2  = this.pos[0] + cos * w + -sin * h,
         y2  = this.pos[1] + sin * w + cos * h,
         x3  = this.pos[0] + cos * -w + -sin * h,
         y3  = this.pos[1] + sin * -w + cos * h,
         x   = Math.min(x1, Math.min(x2, x3)),
         y   = Math.min(y1, Math.min(y2, y3));
    this.cached_bounds = {
      x: x - exp,
      y: y - exp,
      w: Math.max(x1, Math.max(x2, x3)) - x + exp,
      h: Math.max(y1, Math.max(y2, y3)) - y + exp
    }
  }
  return this.cached_bounds;
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
  var exp = expand || 0;
  return {
    x: this.pos[0] + exp,
    y: this.pos[1] + exp,
    w: this.size[0] + exp,
    h: this.size[1] + exp
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
 *  @param {Number} expand (Optional) A value to expand the bounding box with.
 *  @return {x, y, w, h} The bounds of the Ship.
 */
Block.prototype.get_bounds = function(expand) {
  var exp = expand || 0;
  return {
    x: this.pos[0] + exp,
    y: this.pos[1] + exp,
    w: this.size[0] + exp,
    h: this.size[1] + exp
  }
}


/**
 *  Class Bullet
 *  Represents a Bullet Entity
 *
 *  Static fields 
 *  Fields that is never changed. The dynamic field collection 
 *  contains:
 *    id              - The Entity ID of this bullet instance
 *    oid             - The ID of the owner to the bullet
 *    w               - The width of the bullet
 *    h               - The height of the bullet
 *    a               - The angle of the bullet
 *    update_interval - Sync interval 
 *
 *  Dynamic fields 
 *  Fields that changes often. The dynamic field collection 
 *  contains:
 *    x       - The x coordinate of the bullet.      
 *    y       - The y coordinate of the bullet.
 *    sx      - Current speed x value for the the ship.
 *    sy      - Current speed y value for the the ship.
 */
function Bullet(initial) {
  this.on_before_init();
  this.EntityBase_init('bullet');
  this.id     = initial.id || -1;
  this.oid    = initial.oid || -1;
  this.pos    = initial.pos || [0, 0];
  this.vel    = initial.vel || [0, 0];
  this.angle  = initial.angle || 0;
  this.player = initial.player || null;
  this.size   = [1, 2];
  this.on_after_init();
}

extend_class(Bullet, EntityBase);

/**
 *  Move's the Bullet in the world
 *  @param {Number} t Current world time.
 *  @param {Number} dt Current delta time,
 *  @return {undefined} Nothing.
 */
Bullet.prototype.move = function(t, dt) {
  this.pos = vector_add(this.pos, vector_mul(this.vel, dt));
}

/**
 *  Returns bounding box of the Bullet
 *  @param {Number} expand (Optional) A value to expand the bounding box with.
 *  @return {x, y, w, h} The bounds of the Ship.
 */
Bullet.prototype.get_bounds = function(expand) {
   var exp = expand || 0,
       sin = Math.sin(this.angle),
       cos = Math.cos(this.angle),
       w   = this.size[0] / 2,
       h   = this.size[1] / 2,
       x1  = this.pos[0] + -sin * -h,
       y1  = this.pos[1] + cos * -h,
       x2  = this.pos[0] + -sin * h,
       y2  = this.pos[1] + cos * h,
       x   = Math.min(x1, x2),
       y   = Math.min(y1, y2);
  return {
    x: x - exp,
    y: y - exp,
    w: Math.max(x1, x2) - x + exp,
    h: Math.max(y1, y2) - y + exp
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
 *  Destroy's the Powerup instance
 *  @param destroyed_by {Player} the player who destroyed the powerup
 *  @return {undefined} Nothing.
 */
Powerup.prototype.destroy = function(destroyed_by) {
  this.destroyed = true;
  this.destroyed_by = destroyed_by;
}

/**
 *  Returns bounding box of the Wall
 *  @param {Number} expand (Optional) A value to expand the bounding box with.
 *  @return {x, y, w, h} The bounds of the Ship.
 */
Powerup.prototype.get_bounds = function(expand) {
  var exp = expand || 0;
  return {
    x: this.pos[0] + exp,
    y: this.pos[1] + exp,
    w: this.size[0] + exp,
    h: this.size[1] + exp
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
      // Only kill ship if world is running server. Client's should wait for
      // the message PLAYER + DIE
      if (server_mode) {
        ship.destroy(DEATH_CAUSE_KILLED, bullet.player.id);
      }
    }
    bullet.destroy();    
  },
  [Bullet, Ship, Boolean], function(bullet, ship, server_mode) { 
    return collision_resolver([ship, bullet, server_mode]);
  },

  /**
   * Check collission between Ship and Wall 
   */
  [Ship, Wall, Boolean], function(ship, wall, server_mode) {
    if (ship.is(SHIELD)) {
      if (wall.size[0] > wall.size[1]) {
        ship.vel = [ship.vel[0], -ship.vel[1]];
      } else {
        ship.vel = [-ship.vel[0], ship.vel[1]];
      }
    } else {
      // Only kill ship if world is running server. Client's should wait for
      // the message PLAYER + DIE
      if (server_mode) {
        ship.destroy(DEATH_CAUSE_SUICDE);
      }
    }
  },

  /**
   * Check collission between Ship and Wall 
   */
  [Ship, Block, Boolean], function(ship, block, server_mode) {
    if (ship.is(SHIELD)) {
      var x0 = Math.max(ship.pos[0], block.pos[0]);
      var x1 = Math.min(ship.pos[0] + ship.size[0], block.pos[0] + block.size[0]);

      if (x0 <= x1) {
        ship.vel = [ship.vel[0], -ship.vel[1]];
        return;
      } 

      var y0 = Math.max(ship.pos[1], block.pos[1]);
      var y1 = Math.min(ship.pos[1] + ship.size[1], block.pos[1] + block.size[1]);
      
      if (y0 <= y1) {
        ship.vel = [-ship.vel[0], ship.vel[1]];
      } 
      
    } else {
      // Only kill ship if world is running server. Client's should wait for
      // the message PLAYER + DIE
      if (server_mode) {
        ship.destroy(DEATH_CAUSE_SUICDE);
      }
    }
  },

  /**
   * Check collission between Bullet and Wall 
   */
  [Bullet, Wall, Boolean], function(bullet, wall, server_mode) {
    bullet.destroy();
  },

  /**
   * Check collission between Bullet and Wall 
   */
  [Bullet, Block, Boolean], function(bullet, block, server_mode) {
    bullet.destroy();
  },

  /**
   * Check collission between Ship and Ship 
   */
  [Ship, Ship, Boolean], function(ship_a, ship_b, server_mode) {
    // Client waits for PLAYER + DIE message, so ignore all collision 
    // between players, if not in server mode, and one shield is off.
    if(ship_a.is(SHIELD) && ship_b.is(SHIELD)) {
      ship_a.vel = [-ship_a.vel[0], -ship_a.vel[1]];
      ship_b.vel = [-ship_b.vel[0], -ship_b.vel[1]];
    } else if (server_mode && !ship_a.is(SHIELD) && !ship_b.is(SHIELD)) {
      ship_a.destroy(DEATH_CAUSE_SUICDE);
      ship_b.destroy(DEATH_CAUSE_SUICDE);
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

function distance_between(a, b) {
  var x = a[0] - b[0];
  var y = a[1] - b[1];
  return Math.sqrt(x * x + y * y);
}

function get_random_powerup_type() {
  var no = Math.floor(Math.random() * 3);
  switch (no) {
    case 0:
      return POWERUP_SPEED;
    case 1:
      return POWERUP_ENERGY;
    case 2:
      return POWERUP_RAPID;
  }
}

function get_powerup_decline_time(rules, powerup) {
  switch (powerup.powerup_type) {
    case POWERUP_SPEED:
      return rules.powerup_speed_t;

    case POWERUP_RAPID:
      return rules.powerup_rapid_t;

    case POWERUP_ENERGY:
      return rules.powerup_energy_t;
  }
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
    console.log(msg);
  } catch (e) {
    require('sys').puts(msg);
  }
}

// Export for CommonJS (in this case node.js)
try {

  exports.World = World;
  exports.GameLoop = GameLoop;
  exports.Player = Player;
  exports.Ship = Ship;
  exports.Wall = Wall;
  exports.Bullet = Bullet;
  
  exports.DT = DT;
  exports.SERVER = SERVER;
  exports.CLIENT = CLIENT;
  exports.WORLD  = WORLD;
  exports.PLAYER = PLAYER;
  exports.POWERUP = POWERUP;

  exports.CONTROL_PACKET = CONTROL_PACKET;
  exports.GAME_PACKET = GAME_PACKET;
  exports.PING_PACKET = PING_PACKET;
  
  exports.HANDSHAKE = HANDSHAKE;
  exports.READY = READY;
  exports.CONNECT = CONNECT;
  exports.DISCONNECT = DISCONNECT;
  exports.COMMAND = COMMAND;
  exports.INFO = INFO;
  exports.STATE = STATE;
  exports.DIE = DIE;
  exports.SPAWN = SPAWN;
  exports.FIRE = FIRE;
  exports.ANGLE = ANGLE;
  
  exports.ROUND_WARMUP  = ROUND_WARMUP,
  exports.ROUND_STARTING = ROUND_STARTING,
  exports.ROUND_RUNNING  = ROUND_RUNNING,
  exports.ROUND_FINISHED = ROUND_FINISHED;
  
  exports.POWERUP_RAPID = POWERUP_RAPID;
  exports.POWERUP_ENERGY = POWERUP_ENERGY;
  exports.POWERUP_SPEED = POWERUP_SPEED;

  exports.THRUST = THRUST;
  exports.ROTATE_E = ROTATE_E;
  exports.ROTATE_W = ROTATE_W;
  exports.SHOOT = SHOOT;
  exports.SHIELD = SHIELD;

  exports.DEATH_CAUSE_KILLED = DEATH_CAUSE_KILLED;
  exports.DEATH_CAUSE_SUICDE = DEATH_CAUSE_SUICDE;
  
  exports.vector_add = vector_add;
  exports.vector_sub = vector_sub;
  exports.vector_mul = vector_mul;
  exports.vector_div = vector_div;
  exports.vector_pow = vector_pow;
  exports.vector_abs = vector_abs;
  
  exports.intersects = intersects;
  exports.round_number = round_number;
  
} catch (e) {  }