//
//  wpilot.js
//  Web browser WPilot client
//  
//  Read README for instructions and LICENSE license.
//  
//  Copyright (c) 2010 Johan Dahlberg 
//
var CLIENT_VERSION = '0.5.2';

// Keyboard Constants
var BACK                = 'back',
    ROTATE_W            = 'ccw',
    ROTATE_E            = 'cw',
    TOGGLE_FPS          = 'toggle_fps',
    TOGGLE_POS          = 'toggle_pos',
    TOGGLE_FLOCK        = 'toggle_flock';

var GRID_CELL_SIZE      = 250;
    GRID_CELL_COLOR     = 'rgba(255,255,255,0.2)';
    
var _ = Match.incl;

// GUI Fonts used in the client.
var HUD_SMALL_FONT      = 'bold 9px Arial',
    HUD_LARGE_FONT      = 'bold 11px Arial',
    HUD_WHITE_COLOR     = 'rgba(255,255,255,0.8)',
    HUD_GREY_COLOR      = 'rgba(255,255,255,0.4)';

// Message log related constants.
var LOG_AGE_LIMIT       = 100,
    LOG_HISTORY_COUNT   = 20,
    LOG_FONT            = '9px Arial',
    LOG_COLOR           = 'rgba(255,255,255,0.4)';

var SHIP_FONT           = '9px Arial';

// WPilotClient states
var CLIENT_DISCONNECTED     = 0,
    CLIENT_CONNECTING       = 1,
    CLIENT_CONNECTED        = 2;

// Default client options. This options can be changed from the console
// by typing wpilot.options[OPTION_NAME] = new_value
var DEFAULT_OPTIONS         = {
  max_fps:              100,
  show_fps:             true,
  
  show_netstat:         false, 

  hud_player_score_v:   true,
  hud_player_name_v:    true,
  hud_player_pos_v:     true,
  hud_coords_v:         true,
  hud_energy_v:         true,
  
  log_max_messages:     3,
  log_msg_lifetime:     5000,
  log_console:          true,
  
  bindings: {
    'ready':            114,
    'rotate_west':      37,
    'rotate_east':      39,
    'thrust':           38,
    'shoot':            32,
    'shield':           40
  }
}

/**
 *  Represents the WPilot client.
 */
function WPilotClient(options) {
  this.options            = options;
  
  this.viewport           = null;
  this.input              = null;
  this.world              = null;
  this.player             = { entity: null };
  this.conn               = null;
  this.message_log        = [];
  this.hud_message        = null;
  this.hud_message_alpha  = 0.2;

  this.netstat            = { 
    start_time:         null,
    frequence:          0.4,
    last_update:        0,
    bytes_received:     0, 
    bytes_sent:         0,
    bps_in:             0,
    bps_out:            0,
    peek_in:            0,
    peek_out:           0,
    messages_received:  0,
    messages_sent:      0,
    mps_in:             0,
    mps_out:            0,
  };
  
  // Status variables
  this.state              = CLIENT_DISCONNECTED;
  this.server_state       = null;
  this.handshaked         = false;
  this.is_connected       = false;
  this.disconnect_reason  = null;
  
  // Event callbacks
  this.onconnect          = function() {};
  this.ondisconnect       = function() {};
  
  this.log('Welcome to WPilot ' + CLIENT_VERSION);
}

/**
 *  Writes a message to the message log.
 *  @param {String} The message string
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.log = function(msg) {
  var buffer = this.message_log, 
      time   = get_time() + this.options.log_msg_lifetime;
  if (buffer.length > LOG_HISTORY_COUNT) {
    buffer.shift();
  }
  buffer.push({ text: msg, time: time, disposed: false });
  if (this.options.log_console && window.console) console.log(msg);
}

/**
 *  Sets the world data
 *  @param {World} world The World instance
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.set_world = function(world) {
  this.world = world;
  this.log('World data loaded...');
}

/**
 *  Set the viewport to use for this WPilotClient instance.
 *  @param {Viewport} viewport The Viewport instance.
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.set_viewport = function(viewport) {
  var self = this;
  viewport.ondraw = function() {
    if (self.state == CLIENT_CONNECTED) {
      if (self.player.entity) {
        viewport.set_camera_pos(self.player.entity);
      }
      self.world.draw(viewport);
      self.draw_hud();
    }
    self.draw_logs();
  }
  this.viewport = viewport;
}

/**
 *  Set the Input Device
 *  @param {InputDevice} device The Input Device instance.
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.set_input = function(device) {
  this.input = device;
}

/**
 *  Sets the player data
 *  @param {Player} player The player instance
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.set_player = function(player) {
  player.is_me = true;
  this.player = player;
  this.log('You are now known as "' + player.name  + '"...');
}

WPilotClient.prototype.set_server_state = function(state) {
  if (state.no_players != state.max_players) {
    this.server_state = state;
    this.log('Recived server state, now joining game...');
    this.post([CLIENT + CONNECT]);
  } else {
    this.log('Server is full');
  }
}

/**
 *  Sets the state of the Client instance
 *  @param {Number} state The new state.
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.set_state = function(state) {
  switch(state) {

    case CLIENT_CONNECTING:
      this.log('Server found, now joining game...');
      this.onconnect();
      break;

    case CLIENT_CONNECTED:
      this.log('Joined server ' + this.conn.URL + '...');
      this.hud_message = 'Waiting for more players to connect';
      this.post([PLAYER + HANDSHAKE]);  
      break;
      
    case CLIENT_DISCONNECTED:    
      this.conn = null;
      this.is_connected = false;
      this.handshaked = false;
      this.ondisconnect(this.disconnect_reason);
      this.stop_gameloop();
      
      this.log('You where disconnected from server ' +
                this.disconnect_reason ? '(Reason: ' + this.disconnect_reason + ').' :
                '');
      break;
    
  }
  this.state = state;
}

/**
 *  Starts the gameloop
 *  @param {Number} initial_tick The tick to start on (synced with server).
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.process_user_input = function(t, dt) {
  var player        = this.player,
      input        = this.input;

  player.update({
    't': input.on('thrust'),
    'r': input.on('rotate_east') ? 1 : input.on('rotate_west') ? 2 : 0,
    'sh': input.on('shoot'),
    'sd': input.on('shield')
  });

  if (player.is_changed('actions')) {
    var fields = player.changed_fields_in('actions');
    if (fields.length == 1) {
      var action = fields[0];
      this.post([CLIENT + COMMAND, action, player[action]]);
    } else {
      var messages = [];
      for (var i = 0; i < fields.length; i++) {
        var action = fields[i];
        messages.push([CLIENT + COMMAND, action, player[action]]);
      }
      this.post([MULTIPART, messages]);
    }
    player.commit();
  }    
  
}

/**
 *  Starts the gameloop
 *  @param {Number} initial_tick The tick to start on (synced with server).
 *  @return {GameLoop} The newly created gameloop
 */
WPilotClient.prototype.start_gameloop = function(initial_tick) {
  var self          = this,
      player_entity = self.player.entity,
      world         = self.world,
      viewport      = self.viewport;
      
  var gameloop = new GameLoop(initial_tick);

  // Is called on each game tick.
  gameloop.ontick = function(t, dt) {
    self.process_user_input(t, dt);
    self.world.step(t, dt);
  }
  
  // Is called when loop is about to start over.
  gameloop.ondone = function(t, dt, alpha) {
    self.update_netstat();
    viewport.refresh(alpha);
  }

  this.viewport.set_autorefresh(false);
  this.netstat.start_time = this.netstat.last_update = get_time();
  gameloop.start();
  self.gameloop = gameloop;
  return gameloop;
}

/**
 *  Kills the game loop. 
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.stop_gameloop = function() {
  if (this.gameloop) {
    this.gameloop.kill();
    this.gameloop = null;
    this.viewport.set_autorefresh(true);
  }
}

/**
 *  Joins a game server. 
 *  @param {String} url Server URL.
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.join = function(url) {
  var self = this;
  
  if (!self.is_connected) {
    self.disconnect_reason = 'Unknown reason';
    this.log('Trying to join server at ' + url + '...');
    self.conn = new WebSocket(url);

    /**
     *  Override the onopen event of the WebSocket instance.
     *  @param {WebSocketEvent} event The websocket event object.
     *  @returns {undefined} Nothing
     */
    self.conn.onopen = function(event){
      self.is_connected = true;
    };

    /**
     *  Override the onmessage event of the WebSocket instance.
     *  @param {WebSocketEvent} event The websocket event object.
     *  @returns {undefined} Nothing
     */
    self.conn.onmessage = function(event) {
      var graph = JSON.parse(event.data);

      // Check if message is  aso called MULTIPART message. MULTIPART messages
      // is handled a little bit different then single messages.
      var messages = graph[0] == MULTIPART ? graph[1] : [graph];
      for (var i = 0; i < messages.length; i++) {
        PROCESS_MESSAGE([messages[i], self]);
      }
      
      if (self.netstat.start_time) {
        self.netstat.bytes_received += event.data.length;
        self.netstat.messages_received += 1;
      }
    }

    /**
     *  Override the onclose event of the WebSocket instance.
     *  @param {WebSocketEvent} event The websocket event object.
     *  @returns {undefined} Nothing
     */
    self.conn.onclose = function(event){
      self.set_state(CLIENT_DISCONNECTED);
    };
    
    this.set_state(CLIENT_CONNECTING);
  }

}

/**
 *  Leaves the game server, if connected to one
 *  @param {String} reason A reason why leaving
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.leave = function(reason) {
  this.disconnect_reason = reason;
  this.conn.close();
}

/**
 *  Post a jsonified message to the server 
 *  @param {String} msg The message that should be sent.
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.post = function(msg) {
  var data = JSON.stringify(msg);
  if (this.netstat.start_time) {
    this.netstat.bytes_sent += data.length;
    this.netstat.messages_sent += 1;
  }
  this.conn.send(data);
}

/**
 *  Draws logs, which includes the message log, netstat log and fps counter.
 *  @param {String} msg The message that should be sent.
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.draw_logs = function() {
  var ctx             = this.viewport.ctx,
      log             = this.message_log,
      log_index       = log.length,
      log_count       = 0,
      log_x           = 5,
      log_y           = this.viewport.h + 7,
      current_time    = get_time(),
      max             = this.options.log_max_messages;
  
  ctx.font = LOG_FONT;
  while (log_index-- && ((log.length - 1) - log_index < max)) {
    var msg = log[log_index];
    if (!msg.disposed) {
      var alpha = msg.time > current_time ? 0.8 :
           0.8 + (0 - ((current_time - msg.time) / 1000));
      if (alpha < 0.02) {
        msg.disposed = true;
      } 
      ctx.fillStyle = 'rgba(255,255,255,' + alpha + ')';
      draw_label(ctx, log_x, (log_y -= 12), msg.text, 'left');
    }
  }  
  
  if (this.options.show_netstat && this.netstat.start_time) {
    ctx.fillStyle = LOG_COLOR;
    var in_kps = round_number(this.netstat.bps_in / 1024, 2);
    var out_kps = round_number(this.netstat.bps_out / 1024, 2);
    var in_mps = round_number(this.netstat.mps_in, 2);
    var out_mps = round_number(this.netstat.mps_out, 2);
    var text = 'Netstat: in: ' + in_kps + 'kb/s, out: ' + out_kps + 'kb/s, ' +
               'in: ' + in_mps + '/mps, out: ' + out_mps + '/mps';
    draw_label(ctx, 6, 12, text, 'left');
  }
  
  if (this.options.show_fps) {
    ctx.font = LOG_FONT;
    ctx.fillStyle = LOG_COLOR;
    draw_label(ctx, this.viewport.w - 6, 12, 'FPS count: ' + parseInt(this.viewport.average_fps), 'right');
  }
}

/**
 *  Draws the player HUD.
 *  @param {String} msg The message that should be sent.
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.draw_hud = function() {
  var viewport        = this.viewport,
      ctx             = viewport.ctx,
      center_w        = viewport.w / 2,
      center_h        = viewport.h / 2,
      player_entity   = this.player.entity,
      opt             = this.options;
  
  if (player_entity) {
    ctx.textAlign = 'center';

    ctx.font = HUD_SMALL_FONT;
    
    if(opt.hud_player_score_v) {
      ctx.fillStyle = HUD_GREY_COLOR;
      draw_label(ctx, center_w + 72, center_h + 55, 'Score: ' + this.player.s, 'right', 45);
    }

    if (opt.hud_player_name_v) {
      ctx.fillStyle = HUD_WHITE_COLOR;
      draw_label(ctx, center_w - 72, center_h - 45, this.player.name, 'left', 100);
    }

    if (opt.hud_player_pos_v) {
      var my_pos = '1';
      var max_pos = this.server_state.no_players;
      ctx.fillStyle = HUD_WHITE_COLOR;
      draw_label(ctx, center_w + 72, center_h - 45, 'Pos ' + my_pos + '/' + max_pos, 'right', 45);
    }
    
    if (opt.hud_coords_v)  {
      ctx.fillStyle = HUD_GREY_COLOR;
      draw_label(ctx, center_w - 72, center_h + 55, parseInt(player_entity.x) + ' x ' + parseInt(player_entity.y));
    }    
    
    if (opt.hud_energy_v) {
      draw_v_bar(ctx, center_w + 62, center_h - 37, 7, 78, this.player.e);
    }
    
    ctx.save();
    ctx.translate(center_w, center_h);
    player_entity.draw(ctx);
    ctx.restore();
    
  }

  ctx.font = HUD_LARGE_FONT;
  
  // Draw HUD message
  // Fixme: Find a better way to cycle between alpha values
  if (this.hud_message) {
    var alpha = Math.abs(Math.sin((this.hud_message_alpha += 0.08)));
    if (alpha < 0.1) alpha = 0.1;
    ctx.fillStyle = 'rgba(255, 215,0,' + alpha + ')';
    draw_label(ctx, center_w, viewport.h - 50, this.hud_message, 'center', 100);
  }

}

/**
 *  Updates the netstat object
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.update_netstat = function() {
  var netstat = this.netstat;
  if (netstat.start_time) {
    var now = get_time();
    if (now - netstat.last_update >= 1000) {
      var diff = now - netstat.last_update - 1000;
      var secs = ((now - netstat.start_time) / 1000) + (diff / 1000);
      var fa = netstat.frequence;
      var fb = 1 - netstat.frequence;
      netstat.last_update = now + diff;
      netstat.bps_in = fa * netstat.bps_in + fb * netstat.bytes_received / secs;
      netstat.bps_out = fa * netstat.bps_out + fb * netstat.bytes_sent / secs;
      netstat.mps_in = fa * netstat.mps_in + fb * netstat.messages_received / secs;
      netstat.mps_out = fa * netstat.mps_out + fb * netstat.messages_sent / secs;
      netstat.peek_in = netstat.bps_in > netstat.peek_in ? netstat.bps_in : netstat.peek_in;
      netstat.peek_out = netstat.bps_out > netstat.peek_out ? netstat.bps_out : netstat.peek_out;
    }
  }
}

/**
 *  Represents a keyboard device. 
 *  @param {DOMElement} target The element to read input from.
 *  @param {Object} options Options with .bindings
 */
function Keyboard(target, options) {
  var key_states = this.key_states = {};
  this.target = target;
  this.bindings = options.bindings
  
  for (var i=16; i < 128; i++) {
    key_states[i] = 0;
  }
  
  key_states['shift'] = 0;
  key_states['ctrl'] = 0;
  key_states['alt'] = 0;
  key_states['meta'] = 0;
  
  target.onkeydown = function(e) {
    if(key_states[e.keyCode] == 0) key_states[e.keyCode] = 1;
  };

  target.onkeyup = function(e) {
    if(key_states[e.keyCode] == 1) key_states[e.keyCode] = 0;
  };
}

/**
 *  Returns current state of a defined key
 *  @param {String} name Name of defined key
 *  @return {NUmber} 1 if down else 0.
 */
Keyboard.prototype.on = function(name) {
  var key = this.bindings[name];
  return this.key_states[key];
}

/**
 *  Returns current state of a defined key. The key is reseted/toggled if state
 *  is on.
 *  @param {String} name Name of defined key
 *  @return {NUmber} 1 if down else 0.
 */
Keyboard.prototype.toggle = function(name) {
  var key = this.bindings[name];
  if (this.state[key]) {
    this.state[key] = 0;
    return 1;
  }
  return 0;
}

/**
 *  Represents a canvas Viewport.
 *  @param {DOMElement} target The canvas element 
 *  @param {Number} width The width of the viewport
 *  @param {Number} height The height of the viewport
 */
function Viewport(target, width, height, options) {
  this.target       = target;
  this.ctx          = target.getContext('2d');
  this.camera       = { x: 0, y: 0, w: 0, h: 0, scale: 1};
  this.w            = width;
  this.h            = height;
  this.options      = options;
  this.world        = {};
  this.factor       = null;
  this.autorefresh  = false;
  this.frame_skip   = 1;
  this.frame_count  = 0;
  this.frame_time   = 0;
  this.current_fps  = 0;
  this.average_fps  = 0;
  this.refresh_count = 0;

  // Event callbacks
  this.ondraw       = function() {};
  
  // Set canvas width and height
  target.width        = width;
  target.height       = height;
  
  // Start to draw things
  this.set_autorefresh(true);
}

/**
 *  Moves the camera focus to the specified point. 
 *  @param {x, y} A point representing the position of the camera
 *  @returns {undefined} Nothing
 */
Viewport.prototype.set_autorefresh = function(autorefresh) {
  var self  = this;
  if (autorefresh != self.autorefresh) {
    self.autorefresh = autorefresh;
    self.frame_time = get_time();
    if (autorefresh) {
      function loop() {
        self.refresh(0);
        if (self.autorefresh) setTimeout(loop, 1);
      }
      loop();
    } 
  }
}

/**
 *  Moves the camera focus to the specified point. 
 *  @param {x, y} A point representing the position of the camera
 *  @returns {undefined} Nothing
 */
Viewport.prototype.set_camera_pos = function(point) {
   this.camera.x = point.x - (this.w / 2);
   this.camera.y = point.y - (this.h / 2);
   this.camera.w = this.w;
   this.camera.h = this.h;
   this.camera.scale = 1;
}

/**
 *  Moves the camera focus to the specified point. 
 *  @param {x, y} A point representing the position of the camera
 *  @returns {undefined} Nothing
 */
Viewport.prototype.set_world = function(world) {
  this.world = world
}
  
/**
 *  Translate a point into a camera pos.
 *  @param {x, y} The point that should be translated into camera pos
 *  @return The translated Point
 */
Viewport.prototype.translate = function(point) {
  return {
    x: point.x - this.camera.x,
    y: point.y - this.camera.y
  };
}

/**
 *  If necessary, refreshes the view.
 *
 *  FIXME: Need a better solution for frame skipping (if possible in JS).. 
 *         frame_skip +- 0 isnt good enough
 *  @param {Number} alpha A alpha number that can be used for interpolation
 *  @return {undefined} Nothing
 */
Viewport.prototype.refresh = function(alpha) {
  var time    = get_time(),
      diff    = time - this.frame_time,
      max_fps = this.options.max_fps;
  
  if (this.refresh_count % this.frame_skip == 0) {
    this.draw();
    this.frame_count++;
  } 
  
  if (diff > 100) {
    this.current_fps = this.current_fps * 0.9 + (diff / 10) * this.frame_count * 0.1;
    
    if (this.current_fps > (max_fps)) {
      this.frame_skip += 1;
    } else if (this.frame_skip > 1 && this.current_fps < (max_fps)) {
      this.frame_skip -= 1;
    }
    
    this.frame_time = time;
    this.frame_count = 0;
    this.average_fps = this.current_fps;
  }
  
  this.refresh_count++;
}

/**
 *  Draws the scene.
 *  @return {undefined} Nothing
 */
Viewport.prototype.draw = function() {
  var ctx = this.ctx;
  ctx.clearRect(0, 0, this.w, this.h);
  ctx.save();
  ctx.translate(0, 0);
  this.ondraw(ctx);
  ctx.restore();
}

/**
 *  PROCESS_MESSAGE
 *  Processes message recieved from server.
 *  
 */
var PROCESS_MESSAGE = Match (

  /**
   *  The first message recieved from server on connect. Contains the 
   *  state of the server. 
   */
  [[SERVER + STATE, Object], _], 
  function(state, client) {
    client.set_server_state(state);
  },
  
  /**
   *  Is received after the client has sent a CLIENT CONNET message. The message
   *  contains all data necessary to set up the game world.
   */
  [[SERVER + HANDSHAKE, Number, Number, Object, Array, Array], _], 
  function(player_id, tick, world_data, entities, players, client) {
    var world = new World(world_data);
    client.world = world;
    for (var i = 0; i < players.length; i++) {
      world.players[players[i].id] = new Player(players[i]);
    }
    for (var i = 0; i < entities.length; i++) {
      PROCESS_MESSAGE([[ENTITY + SPAWN, entities[i]], client]);
    }
    client.server_state.no_players++
    client.set_world(world);
    client.set_player(world.players[player_id]);
    client.start_gameloop(tick);
    client.set_state(CLIENT_CONNECTED);
  },

  /**
   *  Is recieved when disconnected from server.
   */
  [[SERVER + DISCONNECT, String], _], 
  function(reason, client) {
    client.disconnect_reason = reason;
  },

  
  /**
   * Is recived when a new player has connected to the server.
   */
  [[PLAYER + CONNECT, Object], _], 
  function(player_data, client) {
    var player = new Player(player_data);
    client.world.players[player.id] = player;
    client.server_state.no_players++;
    client.log('Player "' + player.name + ' joined the world...');
  },

  /**
   * Is recived when the state of a player has changed
   */
  [[PLAYER + STATE, Number, Object], _],
  function(id, data, client) {
    var world = client.world,
        player = world.players[id];
    if (player) {
      player.update(data);
      player.commit();
      if (data.eid) {
        var entity = world.find(data.eid);
        player.entity = entity;
        if (player.is_me) {
          entity.is_me = true;
          client.viewport.set_camera_pos(entity);
          client.hud_message = 'Waiting for more players to join..';
        }
      }
    }
  },
  
  /**
   * Is recived when a new player ship is spawned
   */
  [[PLAYER + DESTROY, Number, Number, Number], _], 
  function(player_id, death_cause, killer_id, client) {
    var player  = client.world.players[player_id],
        killer  = client.world.players[killer_id],
        text    = '';
    
    if (player) {
      player.entity = null;

      if (player.is_me) {
        if (death_cause == DEATH_CAUSE_KILLED) {
          text = 'You where killed by ' + killer.name;
        } else {
          text = 'You took your own life, you suck!';
        }
        client.hud_message = 'Relax, you will respawn soon';
      } else {
        if (death_cause == DEATH_CAUSE_KILLED) {
          if (killer.is_me) {
            // This is a temporary solution to player score. When game rules are
            // in place, server will handle this.
            killer.s++;
          } 
          text = player.name + ' was killed by ' + (killer.is_me ? 'you' : killer.name) + '.';
        } else {
          text = player.name + ' killed him self.';
        }
      }
      client.log(text);      
    }
  },
  
  /**
   * Is recived when a player has disconnected from the server.
   */
  [[PLAYER + DISCONNECT, Number, String], _], 
  function(player_id, reason, client) {
    var player = client.world.players[player_id];
    client.log('Player "' + player.name + ' disconnected. Reason: ' + reason);
    delete client.world.players[player_id];
    client.server_state.no_players--;
  },

  /**
   * Is recived when a ship has been created
   */
  [[ENTITY + SPAWN, {'type =': SHIP}], _],
  function(data, client) {
    var entity = new Ship(data);
    client.world.append(entity);
    entity.player = client.world.players[entity.pid];
  },

  /**
   * Is recived when a bullet has been created
   */
  [[ENTITY + SPAWN, {'type =': BULLET}], _],
  function(data, client) {
    console.log('Spawn bullet');
    console.log(data);
    var entity = new Bullet(data);
    client.world.append(entity);
  },

  /**
   * Is recived when a bullet has been created
   */
  [[ENTITY + SPAWN, {'type =': WALL}], _],
  function(data, client) {
    var entity = new Wall(data);
    client.world.append(entity);
  },
  
  /**
   * Is recived when an entity's state has changed.
   */
  [[ENTITY + STATE, Number, Object], _],
  function(id, data, client) {
    var entity = client.world.find(id);
    if (entity) {
      entity.update(data);
      entity.commit();
    } 
  },

  /**
   * Is recived when an entity is destroyed
   */
  [[ENTITY + DESTROY, Number], _],
  function(entity_id,  client) {
    client.world.delete_by_id(entity_id);
  },

  //
  //  Default message handler.
  //
  //  The message sent by server could not be matched.
  //
  function(msg) {
    console.log('Unhandled message')
    console.log(msg[0]);
  }

);

Player.prototype.before_init = function() {
  this.is_me = false;
}

/**
 *  Method World.draw
 *  Draw all entites within viewport bounds.
 */
World.prototype.draw = function(viewport, alpha) {
  var entities  = this.entities, 
      ctx       = viewport.ctx,
      camera    = viewport.camera;
  this.draw_grid(ctx, camera);
  for (var id in entities) {
    var entity = entities[id], pos = { x: entity.x, y: entity.y };
    if (!entity.is_me && intersects(entity, camera)) {
      var point = viewport.translate(pos);
      ctx.save();
      ctx.translate(point.x, point.y);
      entity.draw(ctx);
      ctx.restore();
    }
  }
}

/**
 *  Draw's the background grid of the viewport.
 */
World.prototype.draw_grid = function(ctx, camera) {
//ctx.save();
   ctx.fillStyle = 'black';
   ctx.strokeStyle = GRID_CELL_COLOR;
   ctx.lineWidth = 0.5;
   ctx.beginPath();
   var x, y;

   if (camera.x < 0) {
     x = -camera.x;
   } else {
     x = GRID_CELL_SIZE - camera.x % GRID_CELL_SIZE;
   }

   while(x < camera.w) {
     ctx.moveTo(x, 0);
     ctx.lineTo(x, camera.h);
     x += GRID_CELL_SIZE;
   }

   if (camera.y < 0) {
     y = -camera.y;
   } else {
     y = GRID_CELL_SIZE - camera.y % GRID_CELL_SIZE
   }

   while(y < camera.h) {
     ctx.moveTo(0, y);
     ctx.lineTo(camera.w, y);
     y += GRID_CELL_SIZE;
   }
   
   ctx.stroke();

   // Left Edge
   if (camera.x < 0) {
     ctx.fillRect(0, 0, -camera.x, camera.h);
   }

   // Right Edge
   if (camera.x + camera.w > this.w) {
     ctx.fillRect(this.w - camera.x, 0, camera.x + camera.w - this.w, camera.h);
   }

   // Top Edge
   if (camera.y < 0) {
     ctx.fillRect(0, 0, camera.w, -camera.y);
   }

   // Bottom Edge
   if (camera.y + camera.h > this.h) {
     ctx.fillRect(0, this.h - camera.y, camera.w, camera.y - camera.h + this.h);
   }
}

/**
 *  Class Ship
 *  Local constructor for the Entity class. Add a visible property that 
 *  indiciates that the Entity is visible or not.
 */
Ship.prototype.before_init = function() {
  this.visible = true;
  this.is_me = false;
  this.position_lights_alpha = 0.3;
  this.shield_pulse_alpha = 0.3;
  this.player = null;
}

/**
 *  Method Ship.draw
 *  Draws the Ship instance on the specified GraphicsContext.
 */
Ship.prototype.draw = function(ctx) {
  ctx.rotate(this.a);
  ctx.strokeStyle = "white";
  ctx.lineWidth = 1;
  ctx.fillStyle = "white";
  ctx.beginPath();
  ctx.moveTo(0, -(this.h / 2));
  ctx.lineTo(this.w / 2, (this.h / 2));
  ctx.lineTo(-(this.w / 2), (this.h / 2));
  ctx.lineTo(0, -(this.h / 2));
  ctx.fill();
  //posistion lights
  var pos_alpha = Math.abs(Math.sin((this.position_lights_alpha += 0.06)));
  ctx.beginPath();
  ctx.fillStyle = 'rgba(' + this.player.color + ',' + pos_alpha +')';
  ctx.arc(this.w / 2, this.h / 2,1,0, 2*Math.PI,true)
  ctx.fill();
  ctx.beginPath();
  ctx.fillStyle = 'rgba(' + this.player.color + ',' + pos_alpha +')';
  ctx.arc(-(this.w / 2), this.h / 2,1,0, 2* Math.PI,true)
  ctx.fill();
  //ship window
  ctx.beginPath();
  ctx.fillStyle = 'rgb(' + this.player.color + ')';
  ctx.arc(0,0,2,0, Math.PI,true)
  ctx.fill();
  if(!this.is_me){  
    ctx.rotate(-this.a);
    ctx.font = SHIP_FONT;
  	ctx.fillStyle = 'rgb(' + this.player.color + ')';
    draw_label(ctx, 0, this.h + 10, this.player.name, 'center', 100);	
  }
  if (this.sd) {
    ctx.beginPath();
    var alpha = Math.abs(Math.sin((this.shield_pulse_alpha += 0.06)));
    if (alpha < 0.3) alpha = 0.3;
    ctx.strokeStyle = 'rgba(255, 255, 255,' + alpha + ')';    
    ctx.arc(0, 0, 20, 0, Math.PI / 180, true);
    ctx.stroke();
  }
}

/**
 *  Class Bullet
 *  Local constructor for the Entity class. Add a visible property that 
 *  indiciates that the Entity is visible or not.
 */
Bullet.prototype.before_init = function() {
  this.visible = true;
}

/**
 *  Method Ship.draw
 *  Draws the Bullet instance on the specified GraphicsContext.
 */
Bullet.prototype.draw = function(ctx) {
  ctx.rotate(this.a);
  ctx.fillStyle = "white";
  ctx.fillRect(-(this.w / 2), -(this.h / 2), this.w, this.h);
}

/**
 *  Class Wall
 *  Local constructor for the Wall Entity class. 
 */
Wall.prototype.before_init = function() { }

/**
 *  Method Wall.draw
 *  Draws Wall instance on the specified GraphicsContext.
 */
Wall.prototype.draw = function(ctx, world) {
  var t = Math.min(this.w, this.h) * 0.2,
      o = Math.min(this.w, this.h) * 0.8;
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, this.w, this.h);
  ctx.fillStyle = "red";
  switch (this.o) {
    case 'n':
      ctx.fillRect(o, this.h - t, this.w - o * 2, t);
      break;
    case 'e':
      ctx.fillRect(0, o, t, this.h - o * 2);
      break;
    case 's':
      ctx.fillRect(o, 0, this.w - o * 2, t);
      break;
    case 'w':
      ctx.fillRect(this.w - t, o, t, this.h - o * 2);
      break;
  }
}

/**
 *  Draws a vertical bar 
 *  
 */
function draw_v_bar(ctx, x, y, w, h, percent) {
  ctx.lineWidth = 0.2;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fillRect(x + 2, (y + 2) + ((h - 4) - (h - 4) * (percent / 100)), (w - 4) , (h - 4) * (percent / 100));
  ctx.stroke();   
}

/**
 *  Draws a label
 *  
 */
function draw_label(ctx, x, y, text, align, width) {
  ctx.textAlign = align || 'left';
  ctx.fillText(text, x, y, width || 0);
}

/**
 *  Returns current time stamp
 */
function get_time() {
  return new Date().getTime();
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
