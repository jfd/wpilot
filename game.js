
// Protocol related op-codes    
var PROTOCOL = 'pt',
    
    // Subjects
    SERVER = 'S',
    CLIENT = 'C',
    WORLD  = 'W',
    ADMIN  = 'A', 
    PLAYER = 'P',
    ENTITY = 'E',
    BULLET = 'B',
    SHIP   = 'H',
    WALL   = 'L',
    
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



var GameObject = {
  
  HISTORY_LENGTH: 5,
  
  _proto: {

    /**
     *  Initializes the object. This must be called from the Class constructor.
     */
    no_init: function(initial_props) {
      if (this.before_init) this.before_init.apply(this, arguments);
      this.Version = function() {};
      this.Version.prototype = this;
      this._versions = [];
      this._all_fields = [];
      this._uncommited_fields = {};
      this._changed_collections = {};
      this._collections = {};
      this._changed = false;
      this.fields('_default', { 'type': this.type });
      this.fields('_initial', initial_props || {});
      if (this.after_init) this.after_init.apply(this, arguments);      
    },
    
    /**
     *  Adds a field collection to the current instance. The field collections is 
     * used to track specific fields representation to a remote part.
     */
    fields: function(cname, fields) {
      for (var prop in fields) {
        if (this[prop] === undefined) {
          this[prop] = fields[prop];
        }
        this._all_fields.push(prop);
      }
      this._collections[cname] = fields;
    },
    
    /**
     *  Returns a representation, based on all fields in any field collection.
     */
    repr: function() {
      var result = {}, l=this._all_fields.length;
      while (l--) {
        var prop = this._all_fields[l];
        result[prop] = this[prop];
      }
      return result;
    },
    
    /**
     *  Update specified fields for this object. The affected properties is 
     *  pushed to the change stack. Returns ´´true´´ if one or more field where
     *  changed, else ´´false´´.
     */
    update: function(props) {
      for (var prop in props) {
        if (this[prop] != props[prop]) {
          var new_value = props[prop], cname = this.find_collection(prop);
          if (!this._changed) {
            if (this._versions.length == GameObject.HISTORY_LENGTH) {
              this._versions.pop();
            }
            this._versions.unshift(new this.Version());
            this._changed = true;
          }
          if (this._uncommited_fields[prop] == undefined) {
            this._versions[0][prop] = this[prop];
          }
          this[prop] = this._uncommited_fields[prop] = new_value;
          this._changed_collections[cname] = true;
        }
      }
      return this._changed;
    },
    
    /**
     *  Returns ´´true´´ if the specified collection is changed, else ´´false´´.
     */
    is_changed: function(collname) {
      return collname == undefined ? 
              this._changed :
              this._changed_collections[collname] || false;
    },
    
    /**
     *  Returns a dict with all changed fields from last commit.
     */
    changed_fields: function() {
      var fields = this._uncommited_fields;
      var result = [];
      for (var prop in fields) {
        result.push(prop);
      }
      return result;
    },
    
    /**
     *  Returns a dict with all changed fields from a specific field collection.
     */
    changed_fields_in: function(collection_name) {
      if (collection_name === undefined || collection_name == null) return this.changed_fields();
      var fields = this._uncommited_fields;
      var collection = this._collections[collection_name];
      var result = [];
      for (var prop in fields) {
        for (var coll_prop in collection) {
          if (coll_prop == prop) {
            result.push(prop);
          }
        }
      }
      return result;
    },
    
    /**
     *  Searches through all collections and returns the name of the collection
     *  of where the specified field exists.
     */
    find_collection: function(field_name) {
      var results = [];
      for (var collection in this._collections) {
        for (var field in this._collections[collection]) {
          if (field == field_name) results.push(collection);
        }
      }
      return results[results.length - 1];
    },

    /**
     *  Returns a dict with all changed fields from last commit.
     */
    changed_values: function() {
      var fields = this._uncommited_fields;
      var result = {};
      for (var prop in fields) {
        result[prop] = this[prop];
      }
      return result;
    },
    
    /**
     *  Pop last version from the versions stack and apply it to the object. This
     *  method returns ´´true´´ on success and ´´false´´ when the original 
     *  version of the object is restored.
     */
    revert: function(deepth) {
      var no = deepth || 1, version;
      while (no-- && (version = this._versions.shift())) { }
      if (version) {
        for (var prop in version) {
          if (version.hasOwnProperty(prop)) {
            this[prop] = version[prop];
          }
        }        
        return true;
      }
      return false;
    },
    
    /**
     *  Commit all made changes. The version control is resetted for the object
     *  instance. The changed fields, with values, are returned. A ´´null´´ value
     *  is return ff no changes was made.
     */
    commit: function() {
      if (this.before_commit) this.before_commit.apply(this, arguments);
      var result = this._uncommited_fields;
      this._uncommited_fields = {};
      this._changed_collections = {};
      this._changed = false;
      if (this.after_commit) this.after_commit.apply(this, arguments);
      return result;
    }
    
  },
  
  /**
   *  Apply all GameObject prototype methods to the target class.
   */
  apply_to: function(Class, type_name, subject) {    
    for (var member in GameObject._proto) {
      Class.prototype[member] = GameObject._proto[member];
    }
    Class.prototype.type = type_name;
    Class.prototype._subject = subject;
  }
}

var GameObjectList = {

  _proto: {
    
    /**
     *  Initialize the GameObjectList instance
     */
    nol_init: function(initial_lists) {
      for (var list_name in initial_lists) {
        if (this[list_name] == undefined) {
          this[list_name] = initial_lists[list_name];
        }
      }
      this._lists = initial_lists;
    },
    
    append_to: function(list_name, netobj) {
      
    },
    
    /**
     *  Executes a callback on each uncommited object in this list. It's 
     *  possible limit the result by give the optional collection_name argument.
     */
    each_uncommited: function(callback, collection_name) {
      var lists = this._lists, cb = callback || function() {}, result = [];
      for (var list_name in lists) {
        var list = lists[list_name];
        for (var object_id in list) {
          var obj = list[object_id];
          if (obj.is_changed(collection_name)) {
            cb(obj, this);
            result.push(obj);
          }
        }
      }
      return result;
    }
    
  },

  /**
   *  Apply all GameObjectList prototype methods to the target class.
   */
  apply_to: function(Class, type_name) {    
    for (var member in GameObjectList._proto) {
      Class.prototype[member] = GameObjectList._proto[member];
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
  this.no_init(props);
  this.nol_init({ entities: {}, players: {} });
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
    no_players: 0
  });
  this._entities = [];  
  this.collision_manager = function() {};
  this.build()
}

GameObject.apply_to(World, WORLD, 'world');
GameObjectList.apply_to(World);

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
      // entity.old_state = entity.get_state();
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
 *
 *  Static fields (Fields that is never changed);
 *    id          - The Entity ID of this ship instance
 *    name        - The name of the player.
 *    color       - Player color
 *    start_time  - The time when the player joined the world.
 *    max_speed   - Max speed of the ship  
 *  
 *  Props fields (Fields that are change occasionally):
 *    eid       - Id of the player's entity (Entity Id).
 *    st (n/r)  - Current state of the player. Vaild values are: 
 *                "r" (ready), "n" (not ready).
 *    s (Int)   - Current score
 *    e (Int)   - Current energy
 */
function Player(initial_props) {
  this.no_init(initial_props);
  this.fields('static', {
    id: -1,
    name: 'Unknown',
    color: '0xFFFFFF',
    start_time: new Date().getTime(),
  });
  this.fields('props', {
    eid: -1,
    st: 'n',
    s: 0,
    e: 0
  });
}

GameObject.apply_to(Player, PLAYER, PLAYER);

Player.prototype.toString = function() {
  return 'Player ' + this.name + ' (' + this.id + ')';
}

/**
 *  Class Ship
 *  Represents a Ship entity.
 *  Static fields (Fields that is never changed);
 *    id          - The Entity ID of this ship instance
 *    pid         - The Player ID.
 *    w           - The width of the ship
 *    h           - The height of the ship
 *    max_speed   - Max speed of the ship
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
 *    re        - Indicates that the ship is currently reloading.
 */
function Ship(initial_props) {
  this.no_init(initial_props);
  this.fields('static', {
    id: -1,
    pid: -1, 
    w: 7, 
    h: 10,
    max_speed: SHIP_MAX_SPEED
  });
  this.fields('dynamic', {
    x: 0, 
    y: 0,
    a: 0,
    sx: 0,
    sy: 0
  });
  this.fields('actions', {
    sd: 0,
    sh: 0,
    r: 0,
    t: 0,
    re: 0
  });
}

GameObject.apply_to(Ship, SHIP, ENTITY);

// Ship.prototype.update = function(step) {
//   if (this.energy && this.energy < 100) {
//     this.energy = this.energy + (4 * step); 
//     if (this.energy > 100) this.energy = 100;
//   }
// }

Ship.prototype.move = function(step) {
  var angle = this.a;
  if (this.r == 2) angle -= step * SHIP_ROTATION_SPEED;
  else if (this.r == 1) angle += step * SHIP_ROTATION_SPEED;
  
  if (angle > Math.PI) angle = -Math.PI;
  else if(angle < -Math.PI) angle = Math.PI;

  var acc = this.t == 1 ? step * SHIP_ACCELERATION_SPEED : 0 ;
  var speedx = this.sx + acc * Math.sin(angle);
  var speedy = this.sy + acc * Math.cos(angle);
  var speed = Math.sqrt(Math.pow(speedx,2) + Math.pow(speedy,2));
  
  if (speed > this.max_speed) {
    speedx = speedx / speed * this.max_speed;
    speedy = speedy / speed * this.max_speed;
  } 
  
  this.update({
    x: this.x += speedx * step,
    y: this.y -= speedy * step,
    sx: speedx,
    sy: speedy,
    a: angle
    // speed = speed;  
  }); 
}

/**
 *  Class Wall
 *  Represents a Wall Entity
 *
 *  Static fields 
 *  Fields that is never changed. The dynamic field collection 
 *  contains:
 *    id          - The Entity ID of this ship instance
 *    pid         - The Player ID.
 *    w           - The width of the ship
 *    h           - The height of the ship
 *    max_speed   - Max speed of the ship  
 */
function Wall(initial_props) {
  this.no_init(initial_props);
  this.fields('static', {
    id: -1,
    x: 0, y: 0, w: 0, h: 0,
    angle: 0
  });
}

GameObject.apply_to(Wall, WALL, ENTITY);


/**
 *  Class Bullet
 *  Represents a Bullet Entity
 *
 *  Static fields 
 *  Fields that is never changed. The dynamic field collection 
 *  contains:
 *    id          - The Entity ID of this ship instance
 *    oid         - The ID of the owner to the bullet
 *    w           - The width of the ship
 *    h           - The height of the ship
 *    sx          - The speed x value for the the bullet.
 *    sy          - The speed y value for the the bullet.
 *    a           - The angle of the bullet
 *    max_speed   - The max speed
 *
 *  Dynamic fields 
 *  Fields that changes often. The dynamic field collection 
 *  contains:
 *    x       - The x coordinate of the bullet.      
 *    y       - The y coordinate of the bullet.
 */
function Bullet(initial_props) {
  this.no_init(initial_props);
  this.fields('static', {
    id: -1,
    oid: -1, 
    w: 2, 
    h: 1,
    sx: 0,
    sy: 0,
    a: 0,
    max_speed: BULLET_MAX_SPEED
  });
  this.fields('dynamic', {
    x: 0, 
    y: 0
  });
}

GameObject.apply_to(Bullet, BULLET, ENTITY);


Bullet.prototype.move = function(step) {
  this.update({
    x: this.x + this.sx * step,
    y: this.y - this.sy * step
  });
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
  exports.GameObject = GameObject;
  exports.GameObjectList = GameObjectList;
  
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
  exports.SHIP = SHIP;
  exports.BULLET = BULLET;

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
