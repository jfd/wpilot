var MAX_FPS = 50;

var BACK = 'back',
    ROTATE_CCW = 'ccw',
    ROTATE_CW = 'cw',
    TOGGLE_FPS = 'toggle_fps',
    TOGGLE_POS = 'toggle_pos',
    TOGGLE_FLOCK = 'toggle_flock';

var GRID_CELL_SIZE = 250;
    GRID_CELL_COLOR = 'rgba(255,255,255,0.2)';

    
var _ = Match.incl;

// Keyboard bindings
var KEYBOARD_BINDINGS = {
  27:         BACK,           // Trigger: ESC
  
  37:         ROTATE_CCW,     // Trigger: Left arrow
  39:         ROTATE_CW,      // Trigger: Right arrow
  38:         THRUST,         // Trigger: Up arrow
  32:         SHOOT,          // Trigger: Space
  40:         SHIELD,          // Trigger: Down arrow

  49:         TOGGLE_FPS,     // Trigger: f
  50:         TOGGLE_POS,     // Trigger: p
  51:         TOGGLE_FLOCK   // Trigger: l
} 


$(document).ready(function() {
  
//  $('#viewport').hide();
  $('#error').hide();
  
  // Initlaize the World object. 
  // var world = new World({ w: 1000, h: 1000 });
  // world.collision_manager = collision_manager;
  
  var session = null;
  
  $('a.join-server').click(function(e) {
    e.preventDefault();
    var addr = $(this).attr('href');
    session = new Session(addr);
    $('#servers').hide();
    $('#viewport').show();
    
  });
  
  // start_game(env, world);
  
});

function Session(addr) {
  var self = this;
  this.id = -1;
  this.world = null;
  this.player = null;
  this.gameloop = null;
  this.env = {
    show_fps: true,
    show_pos: true,
    lock_fps: true,
    show_energy: true,
    cur_fps: 0,
    cur_sps: 0, 
    fps_frame: 0,
    viewport: new ViewPort('#viewport canvas'), 
    device: initialize_keyboard('body', KEYBOARD_BINDINGS)
  };

  var conn = new WebSocket(addr);
  
  conn.onopen = function(event){
    self.post([CLIENT + CONNECT]);
  };

  conn.onmessage = function(e) {
    var data = JSON.parse(e.data);
    if (data[0] == 0) {
      // Single message
      process_message([data[1], self]);
    } else {
      // Message batch
      var messages = data[1];
      for (var i = 0; i < messages.length; i++) {
        process_message([messages[i], self]);
      }
    }
  }

  conn.onclose = function(event){
//    $('#viewport').hide();
    $('#error').html('Session closed');
    $('#error').show();
  };
  
  this.conn = conn;
}

Session.prototype.post = function(data) {
  var msg = JSON.stringify(data);
  this.conn.send(msg);
}

function create_gameloop(initial_tick, session) {
  var loop = new GameLoop(initial_tick);
      
  loop.step_callback = function(t, step) {
    handle_input(session, step);
    session.world.step(t, step);
    // loop.kill = env._kill;
  }

  loop.loop_callback = function(t, step, alpha) {
    var curtime = new Date().getTime();
    session.env.cur_sps = parseInt(1000 / ((curtime - session.world.start_time) / (t / step)));  
    draw(session, alpha);
  }
  
  return loop;
}


function initialize_keyboard(target, bindings) {
  var target = $(target);
  var state = {};
  
  for (var key in bindings) state[key] = false;
  
  function get_name(e) {
    if (bindings[e.keyCode]) return bindings[e.keyCode];
    if (!name && e.shiftKey) return bindings['<shift>'];
    if (!name && e.ctrlKey) return bindings['<ctrl>'];
    if (!name && e.altKey) return bindings['<alt>'];
    if (!name && e.metaKey) return bindings['<meta>'];
  }

  document.onkeydown = function(event) {
    var name = get_name(event);
    if(name) state[name] = 1;
  };

  document.onkeyup = function(event) {
    var name = get_name(event);
    if(name) state[name] = 0;
  };

  return {
    on: function(keycode) {
      return state[keycode];
    },
    
    // 
    toggle: function(keycode) {
      if (state[keycode]) {
        state[keycode] = false;
        return true;
      }
      return false;
    }
  }
}

function ViewPort(target) {
  var q = $(target);
  var elem = q[0], w = q.width(), h = q.height();
  elem.width = w;
  elem.height = h;
  this.ctx = elem.getContext('2d');
  this.camera = { x: 0, y: 0, w: 0, h: 0, scale: 1};
  this.elem = elem;
  this.w = w;
  this.h = h;
  this.world = null;
  this.factor = null;
}

ViewPort.prototype = {
  
  /**
   *  Moves the camera focus to the specified point. 
   */
  set_camera_pos: function(point) {
    this.camera.x = point.x - (this.w / 2);
    this.camera.y = point.y - (this.h / 2);
    this.camera.w = this.w;
    this.camera.h = this.h;
    this.camera.scale = 1;
  },
  
  set_world_size: function(size) {
    this.world = { w: size.w, h: size.h }
  },
  
  /**
   *  Translate world cooridnates into viewport coordinates.
   */
  to_vp_point: function(point) {
    return { x: point.x * this.camera.scale, y: point.y * this.camera.scale };
  },

  /**
   *  Translate a world size into viewport size.
   */
  to_vp_size: function(size) {
    return { w: size.w * this.camera.scale, h: size.h * this.camera.scale };
  },
  
  /**
   *  Translate world cooridnates into viewport coordinates.
   */
  to_world_point: function(point) {
    return { x: point.x / this.camera.scale, y: point.y / this.camera.scale };
  },

  /**
   *  Translate viewport size into world size.
   */
  to_world_size: function(size) {
    return { w: size.w / this.camera.scale, h: size.h / this.camera.scale };
  },
  
  /**
   *  Translate a point into a camera pos.
   */
  translate: function(point) {
    return {
      x: point.x - this.camera.x,
      y: point.y - this.camera.y
    };
  },
  
  begin_draw: function() {
    this.ctx.clearRect(0,0, this.w, this.h);
    this.ctx.save();
  },
  
  end_draw: function() {
    this.ctx.restore();
  }
}

var process_message = Match (
  
  [[SERVER + HANDSHAKE, Number, Number, Object, Array], _], 
  function(player_id, tick, world_data, entities, session) {
    var world = new World(world_data);
    for (var i = 0; i < entities.length; i++) {
      var entity = entities[i];
      world.append(Serializable.parse(entity));
    }
    session.id = player_id;
    session.world = world;
    session.player = world.players[player_id];
    var loop = create_gameloop(tick, session);
    session.gameloop = loop;
    session.env.viewport.set_world_size(session.world);
    loop.start();

    session.post([PLAYER + HANDSHAKE]);
  },
  
  /**
   * Player connected
   * Is recived when a new player is connected to the server.
   */
  [[PLAYER + CONNECT, Object], _], 
  function(player_data, session) {
    // var player = new Player(player_data);
    console.log( 'Player connected...');
  },
  
  /**
   * Player ship spawned
   * Is recived when a new player ship is spawned
   */
  [[PLAYER + SPAWN, Object], _],
  function(entity_data, session) {
    console.log('Player spawn');
    var world = session.world,
        entity = new Ship(entity_data);
    world.append(entity);
    world.players[entity.pid].entity = entity;
    if (session.id == entity.pid) {
      session.env.player_entity_id = entity.id;
      session.env.viewport.set_camera_pos(entity);
    }
  },
  
  /**
   * Entity state changed
   * Is recived when an entity's state has changed.
   */
  [[ENTITY + STATE, Number, Object], _],
  function(entity_id, props, session) {
    var entity = session.world.find(entity_id);
    if (entity) entity.apply_props(props);
  },

  /**
   * Destroy entity
   * Is recived when an entity is destroyed
   */
  [[ENTITY + DESTROY, Number], _],
  function(entity_id,  session) {
    var entity = session.world.find(entity_id);
    if (session.player.entity.id == entity_id) {
      console.log('Self was destroyed');
    }
    session.world.delete_by_id(entity_id);
    console.log('Player entity: ' + session.player.entity_id);
    console.log('Delete entity: ' + entity_id);
  },
  
  function(msg) {
    console.log(msg);
  }

);

var collision_manager = Match (

  // Bullet vs. Ship
  // A bullet hitted a ship. 
  [Ship, Bullet], function(ship, bullet) {  
    if (bullet.owner == ship) return;
    if (ship.shield) bullet.dead = true;
    else ship.dead = true;
  },
  [Bullet, Ship], function(bullet, ship) { return collision_manager(ship, bullet)},
  
  // Ship vs. Wall
  // A ship hitted a wall.
  [Ship, Wall], function(ship, wall) {
    if (ship.shield) {
      if (wall.w > wall.h) ship.speedy = -ship.speedy;
      else ship.speedx = -ship.speedx;
    } else {
      ship.dead = true;
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

function handle_input(session, step) {
  var entity = session.player.entity,
      env = session.env,
      player = session.player,
      entity = session.player.entity,
      device = session.env.device;
      
  if (device.on(BACK)) {
    env._kill = true;
    return;
  }
  
  if (entity) {

    if_changed(entity, THRUST, device.on(THRUST), function(value) {
      session.post([CLIENT + COMMAND, THRUST, value]);
    });

    var rotation = 0;  
    if (device.on(ROTATE_CW)) rotation = 1;
    if (device.on(ROTATE_CCW)) rotation = 2;

    if_changed(entity, ROTATE, rotation, function(value) {
      session.post([CLIENT + COMMAND, ROTATE, value]);
    });

    // if(shield && player.energy > 1) {
    //   player.energy -= 0.5;    
    //   player.shield = true;
    // } else {
    //   player.shield = false;
    // }
    // 
    // if_changed(entity, SHIELD, device.on(SHIELD), function(value) {
    //   session.post([CLIENT + COMMAND, SHIELD, value]);
    // });
    
  }
  
  if_changed(env, 'show_pos', device.toggle(TOGGLE_POS));
  if_changed(env, 'show_fps', device.toggle(TOGGLE_FPS));
  if_changed(env, 'lock_fps', device.toggle(TOGGLE_FLOCK));
  
  
  
  // Fire a shoot

  if (player.reloading >= 0) {
    player.reloading -= 4 * step
  }

  if(device.on(SHOOT) && 
     !player.shield && 
     player.reloading <= 0 &&
     player.energy > 0) {
    player.energy -= 2;
    player.score++;
    player.reloading = 1;
    var bullet = player.create_bullet();
    world.append(bullet);
  }
}


/**
 *  Adds painting routines to Ship entity.
 */
Ship.prototype.draw = function(ctx) {
  ctx.strokeStyle = "white";
  ctx.lineWidth = 1;
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.moveTo(0, -this.h);
  ctx.lineTo(this.w / 2, this.h);
  ctx.lineTo(-(this.w / 2), this.h);
  ctx.lineTo(0, -this.h);
  ctx.fill();
  if(this.shield) {
    ctx.beginPath();
    ctx.arc(0, 0, 20, 0, Math.PI / 180, true);
    ctx.stroke();
  }  
}

Ship.prototype.interpolate = function(alpha) {
  this.x = this.x * alpha + this.old_state.x * (1 - alpha);
	this.y = this.y * alpha + this.old_state.y * (1 - alpha);	
}

/**
 *  Adds painting routines to Bullet entity.
 */
Bullet.prototype.draw = function(ctx) {
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, this.w, this.h);
}

Bullet.prototype.interpolate = function(alpha) {
  // console.log(alpha);
  this.x = this.x * alpha + this.old_state.x * (1 - alpha);
  this.y = this.y * alpha + this.old_state.y * (1 - alpha);  
}

Wall.prototype.interpolate = function(alpha) {z
  // No need for interpolation for static objects.
}


/**
 *  Adds painting routines to Wall entity.
 */
Wall.prototype.draw = function(ctx, world) {
  ctx.fillStyle = "red";
  ctx.fillRect(0, 0, this.w, this.h);
}

/**
 *  Draw all entites within viewport bounds.
 */
World.prototype.draw = function(viewport, alpha, env) {
  var entities = this.entities, ctx = viewport.ctx, state, camera = viewport.camera;
  this.draw_grid(viewport);  
  for (var id in entities) {
    var entity = entities[id];
    if (intersects(entity, camera)) {
      if (entity.old_state) {
        state = entity.get_state();
        entity.interpolate(alpha);
      }
      if (entity.id == env.player_entity_id) {
        viewport.set_camera_pos(entity);
      }
      var point = viewport.translate(entity);
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.rotate(entity.angle);
      entity.draw(ctx);
      ctx.restore();
      if (entity.old_state) entity.apply_state(state);
    }
  }
}

/**
 *  Draw's the background grid of the viewport.
 */
World.prototype.draw_grid = function(viewport) {
  var ctx = viewport.ctx,
      cam_x = viewport.camera.x,
      cam_y = viewport.camera.y,
      cam_w = viewport.camera.w,
      cam_h = viewport.camera.h,
      world_w = this.w,
      world_h = this.h;
      
   ctx.save();
   ctx.fillStyle = 'black';
   ctx.strokeStyle = GRID_CELL_COLOR;
   ctx.lineWidth = 0.5;
   ctx.beginPath();
   var x, y;

   if (cam_x < 0) {
     x = -cam_x;
   } else {
     x = GRID_CELL_SIZE - cam_x % GRID_CELL_SIZE;
   }

   while(x < cam_w) {
     ctx.moveTo(x, 0);
     ctx.lineTo(x, cam_h);
     x += GRID_CELL_SIZE;
   }

   if (cam_y < 0) {
     y = -cam_y;
   } else {
     y = GRID_CELL_SIZE - cam_y % GRID_CELL_SIZE
   }

   while(y < cam_h) {
     ctx.moveTo(0, y);
     ctx.lineTo(cam_w, y);
     y += GRID_CELL_SIZE;
   }
   
   ctx.stroke();

   // Left Edge
   if (cam_x < 0) {
     ctx.fillRect(0, 0, -cam_x, cam_h);
   }

   // Right Edge
   if (cam_x + cam_w > world_w) {
     ctx.fillRect(world_w - cam_x, 0, cam_x + cam_w - world_w, cam_h);
   }

   // Top Edge
   if (cam_y < 0) {
     ctx.fillRect(0, 0, cam_w, -cam_y);
   }

   // Bottom Edge
   if (cam_y + cam_h > world_h) {
     ctx.fillRect(0, world_h - cam_y, cam_w, cam_y - cam_h + world_h);
   }

}

function draw(session, alpha) {
  var env = session.env,
      world = session.world,
      startime = world.start_time,
      currtime = new Date().getTime(),
      viewport = env.viewport; 

  if (!env.lock_fps || env.lock_fps && env.cur_fps < MAX_FPS) {
      viewport.begin_draw();
      world.draw(viewport, alpha, env);
      draw_gui(env, world);
      env.fps_frame++;
      viewport.end_draw();      
    } 
    
  // Update the environment object with the current 
  // Frame's per second count. 
  env.cur_fps = parseInt(1000 / ((currtime - startime) / env.fps_frame));  
}

function draw_gui(env, world) {
  var vp = env.viewport,
      player = env.player || {},
      ctx = vp.ctx,
      px = parseInt(player.x || 0),
      py = parseInt(player.y || 0),
      vpw = vp.w / 2,
      vph = vp.h / 2,
      cx = px + vpw,
      cy = py + vph;
      w = vp.w,
      h = vp.h;
  ctx.save();
  ctx.translate(0, 0);
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = "9px Arial";
  if (env.show_pos) 
    draw_label(ctx, px + ' x ' + py, vpw - 52, vph + 45);
  if (env.show_fps)
    draw_label(ctx, env.cur_sps + ' steps / ' + env.cur_fps + ' fps', w - 6, 12, 'right');
  // if (env.show_energy)
  //   draw_v_bar(ctx, vpw + 45, vph - 25, 7, 50, player.energy);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.font = "bold 11px Arial";
//  draw_label(ctx, player.score, vpw + 52, vph + 44, 'right', 45);
  
  ctx.restore();            
}

function draw_v_bar(ctx, x, y, w, h, percent) {
  ctx.lineWidth = 0.2;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fillRect(x + 2, (y + 2) + ((h - 4) - (h - 4) * (percent / 100)), (w - 4) , (h - 4) * (percent / 100));
  ctx.stroke();   
}

function draw_label(ctx, text, x, y, align, width) {
  var len = ctx.measureText(text).width,
      cx = x,
      cy = y;
  // if (align === 'center') {
  //   cx = cx + (width / 2) + (len / 2);
  // } else if (align === 'right') {
  //   cx = cx + width - len;
  // }
  ctx.textAlign = align || 'left';
  // console.log(ctx.textAlign);
  ctx.fillText(text, cx, cy, width || 0);
}

