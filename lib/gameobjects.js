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
    ERROR = '$e',
    MULTIPART = -1;

// Client Commands    
var THRUST = 't',
    SHOOT = 'sh',
    ROTATE = 'r',  // 0 = off, 1=cw, 2=ccw 
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
    BULLET_MAX_SPEED = 200;

var DEATH_CAUSE_KILLED = 1,
    DEATH_CAUSE_SUICDE = 2;

var CC = 1;

var GameObject = {
  
  _proto: {

    /**
     *  Initializes the object. This must be called from the Class constructor.
     */
    no_init: function() {
      if (this.before_init) this.before_init.apply(this, get_args(arguments));
      this._all_fields = [];
      this._old_state = {};
      this._uncommited_fields = {};
      this._changed_collections = {};
      this._collections = {};
      this._changed = false;
      this.fields('_default', { 'type': this.type });
      this.fields('_initial', arguments[0] || {});
      if (this.after_init) this.after_init.apply(this, get_args(arguments));      
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
            this._old_state = {};
            this._changed = true;
          }
          if (this._uncommited_fields[prop] == undefined) {
            this._old_state[prop] = this[prop];
          }
          this[prop] = this._uncommited_fields[prop] = new_value;
          this._changed_collections[cname] = true;
        }
      }
      return this._changed;
    },
    
    update_field: function(field_name, value) {
      var props = {};
      props[field_name] = value;
      this.update(props);
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
     *  Pop's  the original version and apply it to the object. This
     *  method returns ´´true´´ on success and ´´false´´ when the original 
     *  version of the object is restored.
     */
    revert: function() {
      if (this._old_state) {
        for (var prop in this._old_state) {
          if (this._old_state.hasOwnProperty(prop)) {
            this[prop] = this._old_state[prop];
          }
        }
        this._old_state = null;
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
      if (this.before_commit) this.before_commit.apply(this, get_args(arguments));
      var result = this._uncommited_fields;
      this._old_state = null;
      this._uncommited_fields = {};
      this._changed_collections = {};
      this._changed = false;
      if (this.after_commit) this.after_commit.apply(this, get_args(arguments));
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
    
    /**
     *  Works with anynomous list aswell.
     */
    list_repr: function(list_name) {
      var result = null;

      if (this._lists[list_name]) {
        var result  = [],
            list    = this._lists[list_name];

        for (var id in list) {
          result.push(list[id].repr());
        }
        
        return result;
      }

      return null;
    },

    /**
     *  Executes a callback on each object in this list. 
     *  @param {String} list_name (Optional) Name of the list.
     *  @param {Function} callback The callback to call on each item.
     *  @return {undefined} Nothing.
     */
    each: function() {
      var lists     = this._lists, 
          cb        = arguments[0].constructor == Function ? arguments[0] : arguments[1];
          list_name = arguments[0].constructor == Function ? null : arguments[0];
          list      = null,
          object_id = null;
          
      if (list_name) {
        list = lists[list_name];
        for (object_id in list) {
          cb(list[object_id], this);
        }
      } else {
        for (var list_name in lists) {
          list = lists[list_name];
          for (object_id in list) {
            cb(list[object_id], this);
          }
        }
      }
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
function World(props) {
  this.no_init(props);
  this.nol_init({ entities: {}, players: {} });
  this.fields('static', {
    start_time: new Date().getTime(),
    id: -1,
    w: 0,
    h: 0
  });
  this.fields('round', {
    r_state: 'waiting',
    r_restart_at: 0,
    r_start_at: 0,
    r_winners: []
  });
  this._entities = [];  
}

GameObject.apply_to(World, WORLD, 'world');
GameObjectList.apply_to(World);

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
      if (entity.move && target != entity && intersects(entity.get_bounds(), target.get_bounds())) {
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
    if (intersects(box, entity)) {
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
}

/**
 *  Delete's an Entity instance by it's ID.
 *  @param {Number} id The ID of the entity.
 *  @returns {undefined} Nothing
 */
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

/**
 *  Move's the game world one tick ahead.
 *  @param {Number} frame Current loop frame
 *  @param {Number} dt Current delta time
 *  @returns {undefined} Nothing
 */
World.prototype.step = function(frame, dt) {
  var entities = this.entities, target;
  for (var id in entities) {
    var entity = entities[id], res = false;
    if (entity && entity.move) {
      // entity.old_state = entity.get_state();
      entity.move(dt);
      // if (entity.update) entity.update(dt);
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
    x: ship.x + Math.cos(ship.a - Math.PI/2) * ship.w * 2,
    y: ship.y + Math.sin(ship.a - Math.PI/2) * ship.w * 2,
    sx: Math.cos(ship.a - Math.PI/2) * (BULLET_MAX_SPEED) + ship.sx,
    sy: Math.sin(ship.a - Math.PI/2) * (BULLET_MAX_SPEED) - ship.sy,
    a: ship.a
  });  
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
function Player() {
  this.no_init.apply(this, get_args(arguments));
  this.fields('static', {
    id: -1,
    name: 'Unknown',
    color: '0xFFFFFF',
    start_time: new Date().getTime(),
    update_interval: 1
  });
  this.fields('props', {
    eid: -1,
    st: 'n',
    s: 0,
    e: 100
  });
  this.fields('actions', {
    sd: 0,
    sh: 0,
    t: 0,
    r: 0
  });
  this.r = 0;
}

GameObject.apply_to(Player, PLAYER, PLAYER);

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
function Ship(initial_props) {
  this.no_init(initial_props);
  this.fields('static', {
    id: -1,
    pid: -1, 
    w: 9, 
    h: 20,
    max_speed: SHIP_MAX_SPEED,
    update_interval: 1
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
    t: 0
  });
}

GameObject.apply_to(Ship, SHIP, ENTITY);

// Ship.prototype.update = function(step) {
//   if (this.energy && this.energy < 100) {
//     this.energy = this.energy + (4 * step); 
//     if (this.energy > 100) this.energy = 100;
//   }
// }

/**
 *  Move's the Ship in the world
 *  @param {Number} dt The delta time unit to move
 *  @return {undefined} Nothing.
 */
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
    x: this.x + speedx * step,
    y: this.y - speedy * step,
    sx: speedx,
    sy: speedy,
    a: angle,
    //speed: speed
  });
}

/**
 *  Returns bounding box of the Ship
 *  @param {Number} expand (Optional) A value to expand the bounding box with.
 *  @return {x, y, w, h} The bounds of the Ship.
 */
Ship.prototype.get_bounds = function(expand) {
  var exp = expand || 0;
  if (this.sd) {
    return {
      x: (this.x - 20 - exp),
      y: (this.y - 20 - exp),
      w: 40 + exp,
      h: 40 + exp,
    }    
  } else {
     var sin = Math.sin(this.a),
         cos = Math.cos(this.a),
         w   = this.w / 2,
         h   = this.h / 2,
         x1  = this.x + -sin * -h,
         y1  = this.y + cos * -h,
         x2  = this.x + cos * w + -sin * h,
         y2  = this.y + sin * w + cos * h,
         x3  = this.x + cos * -w + -sin * h,
         y3  = this.y + sin * -w + cos * h,
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
function Wall(initial_props) {
  this.no_init(initial_props);
  this.fields('static', {
    id: -1,
    x: 0, y: 0, w: 0, h: 0,
    o: 'n',
    update_interval: 0
  });
}

/**
 *  Returns bounding box of the Wall
 *  @param {Number} expand (Optional) A value to expand the bounding box with.
 *  @return {x, y, w, h} The bounds of the Ship.
 */
Wall.prototype.get_bounds = function(expand) {
  var exp = expand || 0;
  return {
    x: this.x + exp,
    y: this.y + exp,
    h: this.h + exp,
    w: this.w + exp,
  }
}

GameObject.apply_to(Wall, WALL, ENTITY);


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
function Bullet(initial_props) {
  this.no_init(initial_props);
  this.fields('static', {
    id: -1,
    oid: -1, 
    w: 1, 
    h: 2,
    a: 0,
    update_interval: 0
  });
  this.fields('dynamic', {
    x: 0, 
    y: 0,
    sx: 0, 
    sy: 0
  });
}

GameObject.apply_to(Bullet, BULLET, ENTITY);


/**
 *  Move's the Bullet in the world
 *  @param {Number} dt The delta time unit to move
 *  @return {undefined} Nothing.
 */
Bullet.prototype.move = function(dt) {
  this.update({
    x: this.x + this.sx * dt,
    y: this.y + this.sy * dt
  });
}

/**
 *  Returns bounding box of the Bullet
 *  @param {Number} expand (Optional) A value to expand the bounding box with.
 *  @return {x, y, w, h} The bounds of the Ship.
 */
Bullet.prototype.get_bounds = function(expand) {
   var exp = expand || 0,
       sin = Math.sin(this.a),
       cos = Math.cos(this.a),
       w   = this.w / 2,
       h   = this.h / 2,
       x1  = this.x + -sin * -h,
       y1  = this.y + cos * -h,
       x2  = this.x + -sin * h,
       y2  = this.y + cos * h,
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
  
  exports.MULTIPART = MULTIPART;

  exports.THRUST = THRUST;
  exports.ROTATE = ROTATE;  
  exports.SHOOT = SHOOT;
  exports.SHIELD = SHIELD;

  exports.DEATH_CAUSE_KILLED = DEATH_CAUSE_KILLED;
  exports.DEATH_CAUSE_SUICDE = DEATH_CAUSE_SUICDE;
      
  
  exports.intersects = intersects;

} catch (e) {  }
