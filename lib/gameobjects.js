//
//  gameobjects.js
//  Game objects for WPilot 
//  
//  Read README for instructions and LICENSE license.
//  
//  Copyright (c) 2010 Johan Dahlberg 
//

// Protocol related op-codes    
var PROTOCOL = 'pt',
    
    // Subjects
    SERVER      = 0,
    CLIENT      = 10,
    WORLD       = 20,
    PLAYER      = 30,
    ENTITY      = 40,
    BULLET      = 50,
    SHIP        = 60,
    WALL        = 70,
    
    // Actions
    HANDSHAKE   = 1,
    CONNECT     = 2,
    DISCONNECT  = 3,
    COMMAND     = 4,
    READY       = 5,
    STATE       = 6,
    SPAWN       = 7,
    DESTROY     = 8,
    
    // Client commands
    THRUST      = 1,
    SHOOT       = 2,
    ROTATE_E    = 4,  // 0 = off, 1=cw, 2=ccw 
    ROTATE_W    = 8,
    SHIELD      = 16,
    
    MULTIPART   = -1;
    
// World round states
var ROUND_WAITING  = 1,
    ROUND_STARTING = 2,
    ROUND_RUNNING  = 3,
    ROUND_FINISHED = 4;

// World timer related constants
var DT = 0.017,
    MILLI_STEP = 16,
    TIME_STEP = MILLI_STEP / 1000,
    ITERATIONS = 10;

var SHIP_ROTATION_SPEED = 4,
    SHIP_RELOAD_SPEED = 50,
    SHIP_MAX_SPEED = 150,
    SHIP_ACCELERATION_SPEED = 150,
    BULLET_ACCELERATION_SPEED = 1,
    BULLET_MAX_SPEED = 200;

var DEATH_CAUSE_KILLED = 1,
    DEATH_CAUSE_SUICDE = 2;

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
  EntityBase_init: function() {
    this.destroyed = false;
    this.dead = false;
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
    this.dead = true;
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
      self._pid = setTimeout(gameloop, 1);
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
  this.start_time = new Date().getTime();
  this.size = initial.size || [0, 0];
  this.r_state = 'waiting';
  this.r_timer = 0;
  this.r_winners = [];
  this.entities = {};
  this.players = {};
  this._entities = [];  
  this.on_after_init();
}

/**
 *  Placeholder for entity_delete event
 */
World.prototype.on_entity_destroy = function(id) { }

/**
 *  Placeholder for entity_delete event
 */
World.prototype.on_entity_spawn = function(type, entity) { }

/**
 *  Placeholder for entity_delete event
 */
World.prototype.on_round_state_changed = function(state) { }

/**
 *  Playerholder for on_before_init event
 */
World.prototype.on_before_init = function() {}

/**
 *  Playerholder for the Player on_after_init event
 */
World.prototype.on_after_init = function() {}


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
    index2 = entities.length;
    while (index2--) {
      target = entities[index2];
      if (!entity.obstacle && target != entity && intersects(entity.get_bounds(), target.get_bounds())) {
        intersections.push({entity: entity, target: target});
        break;
      }
    }
    if (entity.move) entities.splice(index, 1);
  }
  
  return intersections;
}

/**
 *  Returns whatever the specified Bounding box intersects with an Entity
 *  in the world. 
 *  @param {x,y,w,h} box The bounding box
 *  @returns {Boolean} Returns True if the bounding box intersect's else False.
 */
World.prototype.bounds_intersects = function(box) {
  var entities      = this._entities.slice(0);
      index         = entities.length;
  
  while (index--) {
    entity = entities[index];
    if (intersects(box, entity.get_bounds())) {
      return true
    } 
  }
  
  return false;
}

/**
 *  Add's an Entity instance to the World.
 *  @param {Entity} entity The Entity instance to add.
 *  @returns {undefined} Nothing
 */
World.prototype.append = function(entity) {
  this.entities[entity.id] = entity;
  this._entities.push(entity);
  this.on_entity_spawn(entity);
}

/**
 *  Delete's an Entity instance by it's ID.
 *  @param {Number} id The ID of the entity.
 *  @returns {undefined} Nothing
 */
World.prototype.delete_entity_by_id = function(id) {
  var entities = this._entities, l = entities.length, i = -1;
  while (l--) {
    if (entities[l].id == id) { i = l; break; }
  }
  if (i != -1){
    entities.splice(i, 1);
    delete this.entities[id];
    this.on_entity_destroy(id);
  }
}

/**
 *  Set round state
 *  @param {Number} t Current world frame
 *  @param {Number} dt Current delta time
 *  @returns {undefined} Nothing
 */
World.prototype.set_round_state = function(state, timer, winners) {
  if (this.r_state != state) {
    this.r_state = state;
    this.r_timer = timer || 0;
    this.r_winners = winners || [] ;
    this.on_round_state_changed(this.r_state, this.r_timer, this.r_winners);
  }
}

/**
 *  Move's the game world one tick ahead.
 *  @param {Number} t Current world frame
 *  @param {Number} dt Current delta time
 *  @returns {undefined} Nothing
 */
World.prototype.update = function(t, dt) {
  var entities = this.entities, target;
  for (var id in entities) {
    var entity = entities[id], res = false;
    entity.world_update(t, dt);
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
 *  Spawns a new entity of specified type
 *  @param {String} type The entity type. Valid values  
 *  @return {Object} The newly created Entity instance.
 */
World.prototype.spawn_entity = function(type, props) {
  var Class = World.ENTITIES[type];
  var instance = new Class(process.mixin({
    id: this.entity_count++
  }, props));
  this.append(instance);
  return instance;
}

/**
 *  Spawn's new entity of type Bullet. The Bullet is based on the 
 *  specified Ship instance.
 *  @param {Ship} ship The Ship that is associated to the Bullet.
 *  @return {Bullet} The newly created Bullet instance
 */
World.prototype.spawn_bullet = function(ship) {
  return this.spawn_entity('bullet', {
    oid: ship.id,
    pos: [
      ship.pos[0] + Math.cos(ship.angle - Math.PI / 2) * ship.size[0] * 2,
      ship.pos[1] + Math.sin(ship.angle - Math.PI / 2) * ship.size[0] * 2
    ],
    vel: [
      Math.cos(ship.angle - Math.PI / 2) * (BULLET_MAX_SPEED) + ship.vel[0],
      Math.sin(ship.angle - Math.PI / 2) * (BULLET_MAX_SPEED) - ship.vel[1]
    ],
    angle: ship.angle
  });
}

/**
 *  Gets an representation of this object
 */
World.prototype.get_repr = function() {
  var players = [],
      entities = [];

  for (var pid in this.players) {
    players.push(this.players[pid].get_repr());
  }

  for (var eid in this.entities) {
    entities.push(this.entities[eid].get_repr());
  }
  
  return [
    {
      start_time: this.start_time,
      r_state:    this.r_state,
      r_timer:    this.r_timer,
      r_winners:  this.r_winners,
      size:       this.size
    },
    players,
    entities
  ]
}

World.ENTITIES = {'ship': Ship, 'wall': Wall, 'bullet': Bullet};

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
 *    eid       - Id of the player's entity (Entity Id).
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
  this.id       = initial.id || -1;
  this.name     = initial.name || 'Unknown';
  this.color    = initial.color || '255, 255, 255';
  this.joined   = initial.joined || new Date().getTime();
  this.eid      = 0;
  this.ready    = 0;
  this.score    = 0;
  this.energy   = 100;
  this.commands = 0;
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
  return (this.commands & flag) == flag;
}

Player.prototype.set = function(flag) {
  return this.commands |= flag;
}

/**
 *  Gets an representation of this object
 */
Player.prototype.get_repr = function() {
  return [
    PLAYER,
    this.id,
    this.name,
    this.color,
    this.joined
  ]
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
  this.EntityBase_init();
  this.id         = initial.id || -1;
  this.pid        = initial.pid || -1;
  this.pos        = initial.pos || [0, 0];
  this.vel        = initial.vel || [0, 0];
  this.angle      = initial.angle || 0;
  this.size       = [9, 20];
  this.max_speed  = SHIP_MAX_SPEED;
  this.commands   = 0;
  this.on_after_init();
}

extend_class(Ship, EntityBase);

/**
 *  Move's the Ship in the world
 *  @param {Number} t Current world time.
 *  @param {Number} dt Current delta time,
 *  @return {undefined} Nothing.
 */
Ship.prototype.move = function(t, dt) {
  if (this.dead) return;
  var angle = this.angle;
  
  if (this.is(ROTATE_W)) angle -= dt * SHIP_ROTATION_SPEED;
  else if (this.is(ROTATE_E)) angle += dt * SHIP_ROTATION_SPEED;
  
  if (angle > Math.PI) angle = -Math.PI;
  else if(angle < -Math.PI) angle = Math.PI;

  var acc = this.is(THRUST) ? dt * SHIP_ACCELERATION_SPEED : 0 ;
  var speedx = this.vel[0] + acc * Math.sin(angle);
  var speedy = this.vel[1] + acc * Math.cos(angle);
  var speed = Math.sqrt(Math.pow(speedx,2) + Math.pow(speedy,2));
  
  if (speed > this.max_speed) {
    speedx = speedx / speed * this.max_speed;
    speedy = speedy / speed * this.max_speed;
  }
  
  this.vel = [speedx, speedy];
  this.pos = [this.pos[0] + speedx * dt,  this.pos[1] - speedy * dt]
  this.angle = angle;
}

Ship.prototype.is = function(flag) {
  return (this.commands & flag) == flag;
}

Ship.prototype.toggle = function(flag) {
  if (this.commands & flag == flag)  {
    this.commands = this.commands & ~flag;
  } else {
    this.commands |= flag;
  }
}

Ship.prototype.set = function(flag, value) {
  this.commands = value ? this.commands | flag : this.commands & ~flag; 
}

/**
 *  Returns bounding box of the Ship
 *  @param {Number} expand (Optional) A value to expand the bounding box with.
 *  @return {x, y, w, h} The bounds of the Ship.
 */
Ship.prototype.get_bounds = function(expand) {
  var exp = expand || 0;
  if (this.is(SHIELD)) {
    return {
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
    return {
      x: x - exp,
      y: y - exp,
      w: Math.max(x1, Math.max(x2, x3)) - x + exp,
      h: Math.max(y1, Math.max(y2, y3)) - y + exp
    }
  }
}

/**
 *  Gets an representation of this object
 */
Ship.prototype.get_repr = function() {
  return [
    SHIP,
    this.id,
    this.pid,
    this.pos,
    this.vel,
    this.angle
  ]
}


/**
 *  Class Wall
 *  Represents a Wall Entity
 *
 *  Static fields 
 *  Fields that is never changed. The dynamic field collection 
 *  contains:
 *    id              - The Entity ID of this Wall instance
 *    x               - The x of the Wall instance
 *    y               - The y of the Wall instance
 *    w               - The width of the Wall instance
 *    h               - The height of the Wall instance
 *    o               - The orientation of the Wall instance (n, e, s, w)
 *    update_interval - Sync interval 
 */
function Wall(initial) {
  this.on_before_init();
  this.EntityBase_init();
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
 *  Gets an representation of this object
 */
Wall.prototype.get_repr = function() {
  return [
    WALL,
    this.id,
    this.pos,
    this.size,
    this.o
  ]
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
  this.EntityBase_init();
  this.id   = initial.id || -1;
  this.oid  = initial.oid || -1;
  this.pos  = initial.pos || [0, 0];
  this.vel  = initial.vel || [0, 0];
  this.angle = initial.angle || 0;
  this.size = [1, 2];
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
  if (this.dead) return;
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
 *  Gets an representation of this object
 */
Bullet.prototype.get_repr = function() {
  return [
    BULLET,
    this.id,
    this.oid,
    this.pos,
    this.vel,
    this.angle
  ]
}

function vector_add(a, b) {
  return [a[0] + b[0], a[1] + b[1]];
}

function vector_sub(a, b) {
  return [a[0] - b[0], a[1] - b[1]];
}

function vector_mul(a, v) {
  return [a[0] * v, a[1] * v];
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
  exports.ENTITY = ENTITY;
  exports.SHIP = SHIP;
  exports.BULLET = BULLET;

  exports.HANDSHAKE = HANDSHAKE;
  exports.READY = READY;
  exports.CONNECT = CONNECT;
  exports.DISCONNECT = DISCONNECT;
  exports.COMMAND = COMMAND;
  exports.STATE = STATE;
  exports.DESTROY = DESTROY;
  exports.SPAWN = SPAWN;
  
  exports.ROUND_WAITING  = ROUND_WAITING,
  exports.ROUND_STARTING = ROUND_STARTING,
  exports.ROUND_RUNNING  = ROUND_RUNNING,
  exports.ROUND_FINISHED = ROUND_FINISHED;
  
  exports.MULTIPART = MULTIPART;

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
  
  exports.intersects = intersects;
  
} catch (e) {  }