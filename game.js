
// Protocol related op-codes    
var PROTOCOL = 'pt',
    
    // Subjects
    SERVER = 'S',
    CLIENT = 'C',
    WORLD  = 'W',
    ADMIN  = 'A', 
    PLAYER = 'P',
    ENTITY = 'E',
    
    // Actions
    HANDSHAKE = 'h',
    READY = 'r',
    KILL = 'k',
    CONNECT = 'c',
    DISCONNECT = 'd',
    COMMAND = 'x',
    STATE = 's',
    DESTROY = 'y',
    SPAWN = 'w',
    FIRE = 'f',
    
    // Other
    ERROR = '$e';

// Client Commands    
var THRUST = 't',
    ROTATE = 'r',  // 0 = off, 1=cw, 2=ccw 
    SHOOT = 'sh',
    SHIELD = 'sd';

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
    BULLET_MAX_SPEED = 250,
    SHIP_COLORS = ['0xFFFFFF', '0xFF0000', '0x00FF00', '0x0000FF'];




var NetObject = {
  
  /**
   *  Apply all NetObject prototype methods to the target class.
   */
  apply_to: function(Class, type_name) {
    

    // Initializes the object. This must be called from the Class constructor.
    Class.prototype.init = function(initial_props) {
      if (this.before_init) this.before_init.apply(this, arguments);      
      this._versions = [];
      this._all_fields = {};
      this._changed_fields = {};
      this._field_collections = {};
      this.fields('_default', { 'type': type_name });
      this.fields('_initial', initial_props || {});
      if (this.after_init) this.after_init.apply(this, arguments);      
    }
    
    // Adds a field collection to the current instance. The field collections is 
    // used to track specific fields representation to a remote part.
    Class.prototype.fields = function(collection_name, fields) {
      for (var prop in fields) {
        if (this[prop] === undefined) {
          this[prop] = fields[prop];
        }
        this._all_fields[prop] = true;
      }
      this._field_collections[collection_name] = fields;
    }
    
    // Returns a representation, based on all fields in any field collection.
    Class.prototype.representation = function() {
      var result = {};
      for (var prop in this._all_fields) {
        result[prop];
      }
      return result;
    }
    
    // Update specified fields for this object. The affected properties is 
    // pushed to the change stack
    Class.prototype.update = function(props) {
      var version = {};
      for (var prop in props) {
        version[prop] = this[prop];
        this[prop] = props[prop];
        this._changed_fields[prop] = true;
      }
      this._versions.push(version);
    }
    
    // Returns a dict with all changed fields from last commit.
    Class.prototype.changed_fields = function() {
      var fields = this._changed_fields;
      var result = {};
      for (var prop in fields) {
        result[prop] = this[prop];
      }
      return result;
    }

    // Returns a dict with all changed fields from a specific field collection.
    Class.prototype.changed_fields_in = function(collection_name) {
      var fields = this._changed_fields;
      var collection = this._field_collections[collection_name];
      var result = {};
      for (var prop in fields) {
        for (var coll_prop in collection) {
          if (collection[coll_prop] == prop) {
            result[prop] = this[prop];
          }
        }
      }
      return result;
    }
    
    // Pop last version from the versions stack and apply it to the object. This
    // method returns ´´true´´ on success and ´´false´´ when the original 
    // version of the object is restored.
    Class.prototype.revert = function() {
      var version = this._versions.pop();
      if (version) {
        for (var prop in version) {
          this[prop] = version[prop];
        }
        return true;
      }
      return false;
    }
    
    // Commit all made changes. The version control is resetted for the object
    // instance. The changed fields, with values, are returned. A ´´null´´ value
    // is return ff no changes was made.
    Class.prototype.commit = function() {
      var result = this.changed_fields;
      if (this.before_commit) this.before_commit.apply(this, arguments);
      this._versions = [];
      this._changed_fields = {};
      if (this.after_commit) this.after_commit.apply(this, arguments);
      return result;
    }
    
  }
}

/**
 *  Class GameLoop
 */
function GameLoop(tick) {
  this.step_callback = function() {};
  this.loop_callback = function() {};
  this.kill = false;
  this._oneach = [];
  this.tick = tick || 0;
}

/**
 *  Starts the game loop. 
 */
GameLoop.prototype.start = function() {
  var self = this, 
      stepcb = self.step_callback,
      loopcb = self.loop_callback,
      accumulator = 0,
      dt = DT,
      current_time = new Date().getTime();
  
  function gameloop() {
    var new_time = new Date().getTime();
    var delta = (new_time - current_time) / 1000;
    current_time = new_time;
    
    if (delta > 0.25) delta = 0.25;

    accumulator += delta;
    
    while (accumulator >= dt) {
      accumulator -= dt;
      stepcb(self.tick, dt);
      self.tick += dt;
    }
    
    loopcb(self.tick, dt, accumulator / dt);

    if(!self.kill) setTimeout(gameloop, 1);
  };

  gameloop();
}


/**
 *  Class World
 *  Represents a world object base. The world object is shared between server
 *  and client. 
 *
 *    type                - The entity type. Must be set to 'world'
 *    id (server)         - The unique id for this instance. Is used by server
 *                          to identifiy multiple worlds.
 *    state               - Current game state. Vaild values are: "waiting", 
 *                          "starting", "running", "finished".
 *    admin_id            - The player id of the game creator.
 *    max_players         - The maximum number of simultaneously players in the 
 *                          world.
 *    start_time          - The time when the world started to exist.
 *    no_players          - Current number of connected players.
 *    players             - A dict with connected players. (server)
 *    w                   - World width
 *    h                   - World height
 *    entities            - Entities dict. Used for fast lookups. 
 *    _entities           - Entities list. Is a duplicate of entities but with 
 *                          array like lookups.
 *    collission_manager  - A callback that handles collision detection.
 *
 */
function World(props) {
  this.init(props);
  this.fields('static', {
    start_time: 0,
    id: -1,
    w: 0,
    h: 0
  });
  this.fields('state', {
    state: 'waiting',
  });
  this.fields('player', {
    admin_id: null,
    max_players: 0,
    no_players: 0,
    players: {}
  });
  this.entities = {};
  this._entities = [];  
  this.collision_manager = function() {};
  this.build()
}

NetObject.apply_to(World, 'world');

World.prototype.start = function() {
  this.start_time = new Date().getTime();
}

World.prototype.append = function(entity) {
  this.entities[entity.id] = entity;
  this._entities.push(entity);
}

World.prototype.delete_by_id = function(id) {
  var entities = this._entities, l = entities.length, i = -1;
  while (l--) {
    if (entities[l].id == id) { i = l; break; }
  }
  if (i != -1){
    entities.splice(i, 1);
    delete this.entities[id];
  }
}

World.prototype.step = function(frame, step) {
  var entities = this.entities, target;
  for (var id in entities) {
    var entity = entities[id], res = false;
    if (entity && entity.move && !entity.dead) {
      entity.old_state = entity.get_state();
      entity.move(step);
      if (entity.update) entity.update(step);
    }
  }
  
  // Collision dection for each enitity
  var collisions = this._entities.slice(0);
  var index = collisions.length;
  var delete_list = [];
  while (index--) {
    var result = check_collision.apply(this, [collisions[index], collisions, delete_list]);
    if (result) delete_list.push(result);
    if (collisions[index].move) collisions.splice(index, 1);
  }
  
  if (delete_list.length && this.delete_manager) {
    this.delete_manager(delete_list);
  }
  // // Remove all dead entities
  // for (var id in entities) {
  //   if (entities[id] && entities[id].dead) this.delete_by_id(id);
  // }
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
 *  Placeholder method for ´´build´´.
 */
World.prototype.build = function() {}

/**
 *  Class Player
 *  Represents a Player in the game world. 
 */
function Player(initial_props) {
  this.init(initial_props);
  
  // Static fields 
  // Fields that is never changed. The dynamic field collection 
  // contains:
  //    id          - The Entity ID of this ship instance
  //    name        - The name of the player.
  //    color       - Player color
  //    start_time  - The time when the player joined the world.
  //    max_speed   - Max speed of the ship  
  this.fields('static', {
    id: -1,
    name: 'Unknown',
    color: '0xFFFFFF',
    start_time: new Date().getTime(),
  });
  
  // Props fields 
  // Fields that are change occasionally. The props field collection 
  // contains:
  //    eid       - Id of the player's entity (Entity Id).
  //    st (0/1)  - Current state of the player. Vaild values are: 
  //                "1" (ready), "0" (not ready).
  //    s (Int)   - Current score
  //    e (Int)   - Current energy
  this.fields('props', {
    eid: -1
    st: 1,
    s: 0,
    e: 0
  });
}

NetObject.apply_to(Player, 'player');

Player.prototype.toString = function() {
  return 'Player ' + this.name + ' (' + this.id + ')';
}

/**
 *  Class Ship
 *  Represents a Ship entity.
 */
function Ship(initial_props) {
  this.init(initial_props);

  // Static fields 
  // Fields that is never changed. The dynamic field collection 
  // contains:
  //    id          - The Entity ID of this ship instance
  //    pid         - The Player ID.
  //    w           - The width of the ship
  //    h           - The height of the ship
  //    max_speed   - Max speed of the ship
  this.fields('static', {
    id: -1,
    pid: -1, 
    w: 7, 
    h: 10
    max_speed: SHIP_MAX_SPEED,
  });
  
  // Dynamic fields 
  // Fields that changes often. The dynamic field collection 
  // contains:
  //    x       - The x coordinate of the ship.      
  //    y       - The y coordinate of the ship.
  //    a       - Ships current angle. 
  //    r       - The current rotation of the ship.
  //    sx      - Current speed x value for the the ship.
  //    sy      - Current speed y value for the the ship.
  this.fields('dynamic', {
    x: 0, 
    y: 0,
    a: 0,
    r: 0,
    sx: 0,
    sy: 0,
    speed: 0 //???????????????????
  });

  // State fields 
  // Fields such as actions. This fields is highly priorities and will likely
  // to be sent to client on next world tick. The state field collection 
  // contains:
  //    sd (0/1) - Indicates that the shield is currently activated. 
  //    sh (0/1) - Indicates that the ship is currently shooting.
  //    t  (0/1) - Indicates that the thurst of the ship is currently on.
  //    re        - Indicates that the ship is currently reloading.
  this.fields('state', {
    sd: 0,
    sh: 0,
    t: 0,
    re: 0
  });
}

NetObject.apply_to(Ship, 'ship');

Ship.prototype.update = function(step) {
  if (this.energy && this.energy < 100) {
    this.energy = this.energy + (4 * step); 
    if (this.energy > 100) this.energy = 100;
  }
}

Ship.prototype.move = function(step) {
  var angle = this.angle;
  var max = this.max_speed;
  if (this.rotate == 2) angle -= step * SHIP_ROTATION_SPEED;
  else if (this.rotate == 1) angle += step * SHIP_ROTATION_SPEED;
  
  if (angle > Math.PI) angle = -Math.PI;
  else if(angle < -Math.PI) angle = Math.PI;

  var acc = this.thrust == 1 ? step * SHIP_ACCELERATION_SPEED : 0 ;
  var speedx = this.speedx + acc * Math.sin(angle);
  var speedy = this.speedy + acc * Math.cos(angle);
  var speed = Math.sqrt(Math.pow(speedx,2) + Math.pow(speedy,2));
  
  if (speed > max) {
    speedx = speedx / speed * max;
    speedy = speedy / speed * max;
  } 

  this.x += speedx * step;
  this.y -= speedy * step;
  this.speedx = speedx;
  this.speedy = speedy;
  this.angle = angle;
  this.speed = speed;  
}

/**
 *  Class Wall
 *  Represents a Wall Entity
 */
function Wall(initial_props) {
  this.init(initial_props);
  // Static fields 
  
  // Fields that is never changed. The dynamic field collection 
  // contains:
  //    id          - The Entity ID of this ship instance
  //    pid         - The Player ID.
  //    w           - The width of the ship
  //    h           - The height of the ship
  //    max_speed   - Max speed of the ship  
  this.fields('static', {
    id: -1,
    x: 0, y: 0, w: 0, h: 0,
    angle: 0
  });
}

NetObject.apply_to(Wall, 'wall');


/**
 *  Class Bullet
 *  Represents a Bullet Entity
 */
function Bullet(initial_props) {
  this.init(initial_props);
  
  // Static fields 
  // Fields that is never changed. The dynamic field collection 
  // contains:
  //    id          - The Entity ID of this ship instance
  //    oid         - The ID of the owner to the bullet
  //    w           - The width of the ship
  //    h           - The height of the ship
  //    sx          - The speed x value for the the bullet.
  //    sy          - The speed y value for the the bullet.
  this.fields('static', {
    id: -1,
    oid: -1, 
    w: 2, 
    h: 1,
    sx: 0,
    sy: 0
  });
  
  // Dynamic fields 
  // Fields that changes often. The dynamic field collection 
  // contains:
  //    x       - The x coordinate of the bullet.      
  //    y       - The y coordinate of the bullet.
  this.fields('dynamic', {
    x: 0, 
    y: 0
  });
}

NetObject.apply_to(Bullet, 'bullet');


Bullet.prototype.move = function(step) {
  var y = this.y;
  this.x += this.speedx * step;
  this.y -= this.speedy * step;
}

World.ENTITIES = {'ship': Ship, 'wall': Wall, 'bullet': Bullet};

function check_collision(entity, entities, delete_list) {
  if(!entity) return;
  var l = entities.length;
  while (l--) {
    var target = entities[l];
    if (target != entity && intersects(entity, target)) {
      return this.collision_manager([entity, target, delete_list]);
    }
  }
}

/**
 * Taken from google closure library
 * Returns whether two rectangles intersect. Two rectangles intersect if they
 * touch at all, for example, two zero width and height rectangles would
 * intersect if they had the same top and left.
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
  exports.ADMIN  = ADMIN; 
  exports.PLAYER = PLAYER;
  exports.ENTITY = ENTITY;

  exports.HANDSHAKE = HANDSHAKE;
  exports.READY = READY;
  exports.KILL = KILL;
  exports.CONNECT = CONNECT;
  exports.DISCONNECT = DISCONNECT;
  exports.COMMAND = COMMAND;
  exports.STATE = STATE;
  exports.DESTROY = DESTROY;
  exports.SPAWN = SPAWN;
  exports.FIRE = FIRE;
  exports.ERROR = ERROR;

  exports.THRUST = THRUST;
  exports.ROTATE = ROTATE;  
  exports.BRAKE = BRAKE;
  exports.SHOOT = SHOOT;
  exports.SHIELD = SHIELD;

  exports.SHIP_COLORS = SHIP_COLORS;

} catch (e) {  }
