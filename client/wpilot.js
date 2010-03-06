//
//  wpilot.js
//  Web browser WPilot client
//  
//  Read README for instructions and LICENSE license.
//  
//  Copyright (c) 2010 Johan Dahlberg 
//
var CLIENT_VERSION = '(develop version)';

var GRID_CELL_SIZE      = 250;
    GRID_CELL_COLOR     = 'rgba(255,255,255,0.2)';
    
// Colors
var COLOR_BRIGHT    = '255, 255, 255',
    COLOR_DUST      = '110, 110, 110',
    COLOR_DAWN      = '78, 78, 78',
    COLOR_DARK      = '0, 0, 0',
    COLOR_ACCENT_1  = '255, 215, 0',
    COLOR_ACCENT_2  = '102, 255, 0';
    
// Predefined canvas compatible colors
var CANVAS_COLOR_BRIGHT   = 'rgb(' + COLOR_BRIGHT + ')',
    CANVAS_COLOR_DAWN     = 'rgb(' + COLOR_DAWN + ')',
    CANVAS_COLOR_DARK     = 'rgb(' + COLOR_DARK + ')';
    CANVAS_COLOR_ACCENT_1 = 'rgb(' + COLOR_ACCENT_1 + ')';
    CANVAS_COLOR_ACCENT_2 = 'rgb(' + COLOR_ACCENT_2 + ')';
    
// Font variations
var FONT_NAME = 'Arial',

    // Font attributes
    WEIGHT_NORMAL = '',
    WEIGHT_HEAVY = 'bold',

    // Font sizes
    SIZE_XSMALL = '9px',
    SIZE_SMALL = '11px',
    SIZE_MEDIUM = '13px',
    SIZE_LARGE = '16px';
    

var WARMUP_NOTICE_FONT  = [WEIGHT_HEAVY, SIZE_MEDIUM, FONT_NAME].join(' ');
    
// Scoreboard
var SCOREBOARD_PAD = 6,
    SCOREBOARD_MAR = SCOREBOARD_PAD / 2;

// Scoreboard fonts
var SCOREBOARD_TITLE_FONT   = [WEIGHT_HEAVY, SIZE_LARGE, FONT_NAME].join(' '),
    SCOREBOARD_SUB_FONT     = [WEIGHT_HEAVY, SIZE_SMALL, FONT_NAME].join(' '),
    SCOREBOARD_ROW_FONT     = [WEIGHT_HEAVY, SIZE_MEDIUM, FONT_NAME].join(' '),
    SCOREBOARD_NOTICE_FONT  = [WEIGHT_HEAVY, SIZE_MEDIUM, FONT_NAME].join(' '),
    SCOREBOARD_ROW_A_FONT   = [WEIGHT_NORMAL, SIZE_MEDIUM, FONT_NAME].join(' ');

// Scoreboard chars
var SCOREBOARD_READY_CHAR     = '\u2714',
    SCOREBOARD_NOT_READY_CHAR = '\u2716';

// FPS counter and netsat
var STATS_FONT = [WEIGHT_NORMAL, SIZE_XSMALL, FONT_NAME].join(' ');

// Message log related constants.
var MESSAGE_LOG_LENGTH    = 20;
    MESSAGE_LOG_FONT      = [WEIGHT_NORMAL, SIZE_SMALL, FONT_NAME].join(' '),
    MESSAGE_LOG_LIFETIME  = 150;

// Font for player names
var PLAYER_NAME_FONT  = [WEIGHT_HEAVY, SIZE_SMALL, FONT_NAME]

// WPilotClient states
var CLIENT_DISCONNECTED     = 0,
    CLIENT_CONNECTING       = 1,
    CLIENT_CONNECTED        = 2;

// Powerup constants    
var POWERUP_FONT            = '7px Arial',
    POWERUP_SPEED_COLOR     = '230,21,90',
    POWERUP_RAPID_COLOR     = '166,219,0',
    POWERUP_ENERGY_COLOR    = '51,182,255';
    
var SOUNDS = {
  background:   [1,  ['background']],
  ship_spawn:   [3,  ['ship_spawn']],
  ship_die:     [3,  ['ship_die']],
  ship_thrust:  [6,  ['ship_thrust']],  
  bullet_spawn: [8,  ['ship_fire_1', 'ship_fire_2', 'ship_fire_3']], 
  powerup_spawn:[3,  ['powerup_spawn']],
  powerup_die:  [2,  ['powerup_1_die', 'powerup_2_die', 'powerup_3_die']] 
}

// Default client options. This options can be changed from the console
// by typing wpilot.options[OPTION_NAME] = new_value
var DEFAULT_OPTIONS         = {
  max_fps:              100,
  show_fps:             true,
  
  show_netstat:         false, 
  
  rate:                 5000,
  
  name:                 null,

  hud_player_score_v:   true,
  hud_player_name_v:    true,
  hud_player_pos_v:     true,
  hud_coords_v:         true,
  hud_energy_v:         true,
  
  rotation_speed:       6,
  
  sound_enabled:        true,
  sound_bg_volume:      0.8,
  
  log_max_messages:     3,
  log_msg_lifetime:     5000,
  log_console:          true,
  
  bindings: {
    'ready':            82,
    'scoreboard':       83,
    'netstat':          78,
    'fps':              70,
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
  this.sound              = null;
  this.world              = null;
  this.player             = null;
  this.conn               = null;
  this.message_log        = [];
  this.gui                = { hud: null, scoreboard: null, warmupnotice: null,
                              netstat: null, fps: null, messages: null };

  this.netstat            = { 
    start_time:         null,
    frequence:          0.4,
    last_update:        0,
    last_received:      0, 
    bytes_received:     0, 
    bytes_sent:         0,
    bps_in:             0,
    bps_out:            0,
    peek_in:            0,
    peek_out:           0,
    messages_received:  0,
    messages_sent:      0,
    mps_in:             0,
    mps_out:            0
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
  if (buffer.length > MESSAGE_LOG_LENGTH) {
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
  world.client = this;
  this.viewport.set_camera_pos(vector_div(world.size, 2));
  this.world = world;
  this.log('World data loaded...');
  this.gui.scoreboard.world = world;
  this.gui.warmupnotice.world = world;
}

/**
 *  Set the viewport to use for this WPilotClient instance.
 *  @param {Viewport} viewport The Viewport instance.
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.set_viewport = function(viewport) {
  var gui = this.gui;
  var self = this;

  // Initialize GUI elements
  gui.hud = new GUIPlayerHUD([viewport.w / 2, viewport.h / 2]);
  gui.netstat = new GUINetStat([6, 12], this.netstat);
  gui.fps = new GUIFpsCounter([viewport.w - 6, 12], viewport);
  gui.messages = new GUIMessageLog([6, viewport.h - 2], 
                                   this.message_log,
                                   this.options);
  gui.scoreboard = new GUIScoreboard([0, 0]);
  gui.scoreboard.set_size([viewport.w, viewport.h]);
  gui.warmupnotice = new GUIWarmupNotice([viewport.w / 2, viewport.h - 50]);
  
  // Set the draw callback
  viewport.ondraw = function(ctx) {
    var world = self.world,
        player = self.player;

    if (player && !player.dead) {
      viewport.set_camera_pos(player.entity.pos);
    }
    
    if (world) {
      world.draw(viewport);
    }

    // Draw GUI elements
    for (var name in gui) {
      var element = gui[name],
          visible = element.is_visible();

      if (element.alpha) {
        ctx.save();
        ctx.globalAlpha = element.alpha;
        ctx.translate(element.pos[0], element.pos[1]);
        element.draw(ctx);
        ctx.restore();
      }

      if (visible && element.alpha < 1.0) {
        element.alpha = element.alpha + 0.2 > 1.0 ? 1.0 : element.alpha + 0.2;
      } else if (!visible && element.alpha > 0) {
        element.alpha = element.alpha - 0.2 < 0 ? 0 : element.alpha - 0.2;
      }
      
    }
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
 *  Set the Sound Device
 *  @param device {SoundDevice} the sound device
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.set_sound = function(device) {
  device.init(SOUNDS);
  this.sound = device;
}

/**
 *  Sets the player data
 *  @param {Player} player The player instance
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.set_player = function(player) {
  player.is_me = true;
  this.player = player;
  this.gui.hud.me = player;
  this.gui.scoreboard.me = player;
  this.gui.warmupnotice.me = player;
  this.log('You are now known as "' + player.name  + '"...');
}

WPilotClient.prototype.set_server_state = function(state) {
  if (state.no_players != state.max_players) {
    this.server_state = state;
    this.log('Recived server state, now joining game...');
    this.post_control_packet([CLIENT + CONNECT]);
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
      this.sound.loop('background', this.options.sound_bg_volume);
      this.log('Server found, now joining game...');
      this.onconnect();
      break;

    case CLIENT_CONNECTED:
      this.log('Joined server ' + this.conn.URL + '...');
      this.post_control_packet([CLIENT + HANDSHAKE, {
        name: this.options.name,
        rate: this.options.rate,
        dimensions: [this.viewport.w, this.viewport.h] 
      }]);  
      break;
      
    case CLIENT_DISCONNECTED:    
      this.conn = null;
      this.is_connected = false;
      this.handshaked = false;
      this.world = null;
      this.player = null;
      this.conn = null;
      this.message_log = [];
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
      input         = this.input;

  if (input.on('scoreboard')) {
    this.gui.scoreboard.visible = true;
  } else {
    this.gui.scoreboard.visible = false;
  }
  
  if (input.toggle('fps')) {
    if (this.gui.fps.visible) {
      this.gui.fps.visible = false;
    } else {
      this.gui.fps.visible = true;
    }
  }

  if (input.toggle('netstat')) {
    if (this.gui.netstat.visible) {
      this.gui.netstat.visible = false;
    } else {
      this.gui.netstat.visible = true;
    }
  }

  if (input.toggle('ready')) {
    this.post_game_packet([PLAYER + READY]);
  }

  if (!player.dead && player.entity.visible) {
    var new_command   = 0,
        new_angle     = player.entity.angle;
    
    if (input.on('thrust')) new_command |= THRUST;
    if (input.on('shield')) new_command |= SHIELD;
    if (input.on('shoot')) new_command |= SHOOT;

    if (new_command != player.command) {
      player.command = new_command;
      this.post_game_packet([PLAYER + COMMAND, new_command]);
    }
    
    if (player.is(THRUST) && (parseInt(t * 1000)) % 10 == 0) {
      this.sound.play('ship_thrust', 0.05);
    }
    
    if (input.on('rotate_west')) {
      new_angle -= dt * this.options.rotation_speed;
    }  else if (input.on('rotate_east')) {
      new_angle += dt * this.options.rotation_speed;
    }
    
    if (new_angle != player.entity.angle) {
      if (new_angle > Math.PI) new_angle = -Math.PI;
      else if(new_angle < -Math.PI) new_angle = Math.PI;
      
      player.entity.angle = new_angle;
      this.post_game_packet([PLAYER + ANGLE, new_angle]);
    }

    // if (this.is(ROTATE_W)) ;
    // else if (this.is(ROTATE_E)) angle += dt * SHIP_ROTATION_SPEED;
    // 
  }  
}

/**
 *  Starts the gameloop
 *  @param {Number} initial_tick The tick to start on (synced with server).
 *  @return {GameLoop} The newly created gameloop
 */
WPilotClient.prototype.start_gameloop = function(initial_tick) {
  var self          = this,
      world         = self.world,
      viewport      = self.viewport;
      
  var gameloop = new GameLoop(initial_tick);

  // Is called on each game tick.
  gameloop.ontick = function(t, dt) {
    self.process_user_input(t, dt);
    self.world.update(t, dt);
  }
  
  // Is called when loop is about to start over.
  gameloop.ondone = function(t, dt, alpha) {
    self.update_netstat(t, dt);
    viewport.refresh(alpha);
  }

  this.viewport.set_autorefresh(false);
  this.netstat.start_time = this.netstat.last_update = this.netstat.last_received = get_time();
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
      var packet        = JSON.parse(event.data);
      
      switch (packet[0]) {
        
        case CONTROL_PACKET:
          process_control_message([packet[1], self]);
          break;
          
        case GAME_PACKET:
          if (!self.world) return;
          
          var messages      = packet[1];

          if (self.netstat.start_time) {
            var now = get_time(),
                alpha = 0;
            if (self.netstat.last_received) {
              self.netstat.last_received = now;
            }
            self.netstat.last_received = now;
            self.netstat.bytes_received += event.data.length;
            self.netstat.messages_received += 1;
          }
          
          for (var i = 0; i < messages.length; i++) {
            self.world.process_world_packet(messages[i]);
          }
        
          break;
          
        case PING_PACKET:
          self.conn.send(JSON.stringify([PING_PACKET]));
          break;
          
        default:
          self.log('Recived bad packet header');
          break;
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
 *  Post a game packet to server 
 *  @param {String} msg The message that should be sent.
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.post_game_packet = function(msg) {
  var packet = JSON.stringify([GAME_PACKET, msg]);
  if (this.netstat.start_time) {
    this.netstat.bytes_sent += packet.length;
    this.netstat.messages_sent += 1;
  }
  this.conn.send(packet);
}

/**
 *  Post a control packet to server 
 *  @param {String} msg The message that should be sent.
 *  @return {undefined} Nothing
 */
WPilotClient.prototype.post_control_packet = function(msg) {
  var packet = JSON.stringify([CONTROL_PACKET, msg]);
  this.conn.send(packet);
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
 *  Processes control message recieved from server.
 *  
 */
var process_control_message = match (
  /**
   *  The first message recieved from server on connect. Contains the 
   *  state of the server. 
   */
  [[SERVER + INFO, Object], _], 
  function(state, client) {
    client.set_server_state(state);
  },
  
  /**
   *  Is received after the client has sent a CLIENT CONNECT message. The message
   *  contains all data necessary to set up the game world.
   */
  [[SERVER + HANDSHAKE, Object, Array, Array], _], 
  function(world_data, players_data, powerups_data, client) {
    var world = new World(world_data);
    world.build(world_data.map_data);
    
    for (var i = 0; i < players_data.length; i++) {
      var player_data = players_data[i];
      var player = new Player(player_data);
      world.players[player.id] = player;
      if (!player_data.dead) {
        var entity = new Ship({
          pos:    player_data.pos,
          vel:    player_data.vel,
          angle:  player_data.angle,
          player: player
        });
        world.add_entity(entity);
        player.entity = entity;
      }
    }

    for (var i = 0; i < powerups_data.length; i++) {
      var powerup_data = powerups_data[i];
      var powerup = new Powerup(powerup_data);
      world.powerups[powerup.powerup_id] = powerup;
      world.add_entity(powerup);
    }
    
    client.set_world(world);
    
    client.set_state(CLIENT_CONNECTED);
  },
  
  [[SERVER + CONNECT, Number, Number, String, String], _],
  function(tick, id, name, color, client) {
    var player = client.world.add_player(id, name, color);
    client.set_player(player);
    client.start_gameloop(tick);
  },
  
  /**
   *  Is recieved when disconnected from server.
   */
  [[SERVER + DISCONNECT, String], _], 
  function(reason, client) {
    client.disconnect_reason = reason;
  },
  
  function(msg) {
    console.log('Unhandled message')
    console.log(msg[0]);
  }
  
);

Player.prototype.on_before_init = function() {
  this.angle = 0; 
  this.rank = 1;
  this.is_me = false;
  
  // Used by score board to write information
  this.death_cause = 0;
  this.killed_by = null;
}

World.prototype.on_before_init = function() {
  this.anim_id_count = 1;
  this.animations = [];
  this.ranked_player_list = [];
  this.winner_names = null;
}

/**
 *  Callback for world update
 */
World.prototype.on_update = function(t, dt) {
  var animations = this.animations,
      index = animations.length;
  while (index--) {
    var job = animations[index];
    job.anim.update(t, dt);
    if (job.anim.is_done) {
      job.callback();
      animations.splice(index, 1);
    }
  }
}

/**
 * Callback for player join
 */
World.prototype.on_player_join = function(player) {
  this.client.log('Player "' + player.name + '" joined the world...');

  this.ranked_player_list = calculate_ranks(this);
}

/**
 * Callback for player leave
 */
World.prototype.on_player_leave = function(player, reason) {
  this.client.log('Player "' + player.name + '" disconnected. Reason: ' + reason);
  
  this.ranked_player_list = calculate_ranks(this);
}

/**
 * Callback for player spawn. 
 */
World.prototype.on_player_spawn = function(player, pos) {
  var self = this,
      volume = player.is_me ? 1 : calculate_sfx_volume(this.client, pos);

  this.client.sound.play('ship_spawn', volume);
  
  this.play_animation(new SpawnAnimation(pos), function() {
    player.entity.visible = true;
  });

  if (player.is_me) {
    player.entity.is_me = true;
    this.client.viewport.set_camera_pos(pos);
  }
  
}

World.prototype.on_player_fire = function(player, angle) {
  var volume = player.is_me ? 1 : calculate_sfx_volume(this.client, 
                                                       player.entity.pos);
  this.client.sound.play('bullet_spawn', volume);
}

/**
 * Callback for player died
 */
World.prototype.on_player_died = function(player, old, death_cause, killer) {
  var volume = player.is_me ? 1 : calculate_sfx_volume(this.client, 
                                                       old.pos);

  player.death_cause = death_cause;
  player.killed_by = killer;

  this.client.sound.play('ship_die', volume);
  
  this.play_animation(new DieAnimation(old.pos, old.angle, old.vel));
  this.play_animation(new ExplodeAnimation(old.pos));
  
  if (killer && killer.is_me) {
    this.play_animation(new TextAnimation(old.pos, killer.color, 'score'));
  }
  
  if (player.is_me) {
    if (death_cause == DEATH_CAUSE_KILLED) {
      text = 'You where killed by ' + killer.name;
    } else {
      text = 'You took your own life!';
    }
  } else {
    if (death_cause == DEATH_CAUSE_KILLED) {
      text = player.name + ' was killed by ' + (killer.is_me ? 'you' : killer.name) + '.';
    } else {
      text = player.name + ' killed him self.';
    }
  }

  this.client.log(text);
  
  this.ranked_player_list = calculate_ranks(this);
}

/**
 * Callback for player ready
 */
World.prototype.on_player_ready = function(player) {
  this.client.log(player.is_me ? 'You are now ready' : 'Player "' + player.name + ' is ready');
}

/**
 * Callback for round state changed
 */
World.prototype.on_round_state_changed = function(state, winners) {

  switch (state) {
    
    case ROUND_STARTING:
      this.client.viewport.set_camera_pos(vector_div(this.size, 2));
      break;
      
    case ROUND_FINISHED:
      var names = [];      
      for (var i = 0; i < winners.length; i++) {
         names.push(this.players[winners[i]].name);
      }
      this.winner_names = names.join(',');
      break;
      
  }
};

World.prototype.on_powerup_spawn = function(powerup) {
  var volume = calculate_sfx_volume(this.client, powerup.pos);
  this.client.sound.play('powerup_spawn', volume);
}

World.prototype.on_powerup_die = function(powerup, player) {

  if (player.is_me) {
    this.client.sound.play('powerup_die');
  }
  
  this.play_animation(new TextAnimation(
    powerup.pos,
    get_powerup_color(powerup.powerup_type),
    get_powerup_text(powerup.powerup_type)
  ));
  
}

World.prototype.on_after_init = function() {
  this.PACKET_HANDLERS = {};
  this.PACKET_HANDLERS[WORLD + STATE] = this.set_round_state;
  this.PACKET_HANDLERS[CLIENT + CONNECT] = this.add_player;
  this.PACKET_HANDLERS[CLIENT + DISCONNECT] = this.remove_player;
  this.PACKET_HANDLERS[PLAYER + READY] = this.set_player_ready;
  this.PACKET_HANDLERS[PLAYER + SPAWN] = this.spawn_player;
  this.PACKET_HANDLERS[PLAYER + DIE] = this.kill_player;
  this.PACKET_HANDLERS[PLAYER + FIRE] = this.fire_player_canon;
  this.PACKET_HANDLERS[PLAYER + STATE] = this.update_player_state;
  this.PACKET_HANDLERS[PLAYER + COMMAND] = this.set_player_command;
  this.PACKET_HANDLERS[POWERUP + SPAWN] = this.spawn_powerup;
  this.PACKET_HANDLERS[POWERUP + DIE] = this.kill_powerup;
}

World.prototype.play_animation = function(animation, callback) {
  var id = this.anim_id_count++;

  this.animations.push({
    id: id,
    anim: animation,
    callback: callback || function() {}
  });
  
  return id;
}

World.prototype.process_world_packet = function(msg) {;
  var id = msg.shift();
  var handler = this.PACKET_HANDLERS[id];
  if (handler) {
    handler.apply(this, msg);
  } else {
    console.log(id);
  }
}

World.prototype.update_player_state = function(id, pos, angle, ping) {
  var player = this.players[id];
  if (pos) {
    player.entity.pos_sv = pos;
  }
  if (!player.is_me && angle) {
    player.entity.angle = angle;
  }
  if (ping) {
    if (player.ping) {
      player.ping = parseInt(player.ping * 0.9 + ping * 0.1);
    } else {
      player.ping = ping;
    }
  }
}

/**
 *  Method World.draw
 *  Draw all entites within viewport bounds.
 */
World.prototype.draw = function(viewport, alpha) {
  var entities    = this.entities,
      animations  = this.animations,
      ctx         = viewport.ctx,
      camera      = viewport.camera;
  this.draw_grid(ctx, camera);
  for (var id in entities) {
    var entity = entities[id];
    if (!entity.is_me && intersects(entity.get_bounds(), viewport.get_camera_box())) {
      var point = viewport.translate(entity.pos);
      ctx.save();
      ctx.translate(point[0], point[1]);
      entity.draw(ctx);
      ctx.restore();
    }
  }
  var index = animations.length;
  while (index--) {
    var job = animations[index],
        point = viewport.translate(job.anim.pos);
    ctx.save();
    ctx.translate(point[0], point[1]);
    job.anim.draw(ctx);
    ctx.restore();
  }
}

/**
 *  Draw's the background grid of the viewport.
 */
World.prototype.draw_grid = function(ctx, camera) {
  var x, y;
  var camx = camera.pos[0];
  var camy = camera.pos[1];
  var camw = camera.size[0];
  var camh = camera.size[1];
  ctx.save();
  ctx.fillStyle = 'black';
  ctx.strokeStyle = GRID_CELL_COLOR;
  ctx.lineWidth = 0.5;
  ctx.beginPath();

  if (camx < 0) {
    x = -camx;
  } else {
    x = GRID_CELL_SIZE - camx % GRID_CELL_SIZE;
  }

  while(x < camw) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, camh);
    x += GRID_CELL_SIZE;
  }

  if (camy < 0) {
    y = -camy;
  } else {
    y = GRID_CELL_SIZE - camy % GRID_CELL_SIZE
  }

  while(y < camh) {
    ctx.moveTo(0, y);
    ctx.lineTo(camw, y);
    y += GRID_CELL_SIZE;
  }
   
  ctx.stroke();

  // Left Edge
  if (camx < 0) {
    ctx.fillRect(0, 0, -camx, camh);
  }

  // Right Edge
  if (camx + camw > this.size[0]) {
    ctx.fillRect(this.size[0] - camx, 0, camx + camw - this.size[0], camh);
  }

  // Top Edge
  if (camy < 0) {
    ctx.fillRect(0, 0, camw, -camy);
  }

  // Bottom Edge
  if (camy + camh > this.size[1]) {
    ctx.fillRect(0, this.size[1] - camy, camw, camy - camh + this.size[1]);
  }
  ctx.restore();
}

/**
 *  Class Ship
 *  Local constructor for the Entity class. Add a visible property that 
 *  indiciates that the Entity is visible or not.
 */
Ship.prototype.on_before_init = function() {
  this.visible = false;
  this.is_me = false;
}

Ship.prototype.on_after_init = function() {
  this.animations = {
    'thrust': new ThrustAnimation(),
    'shield': new ShieldAnimation()
  }
  this.pos_sv = this.pos;
}

Ship.prototype.world_update = function(t, dt) {

  this.move(t, dt);
  
  if (Math.abs(this.pos[0] - this.pos_sv[0]) > 0.01 || 
      Math.abs(this.pos[1] - this.pos_sv[1]) > 0.01) {
    this.pos = vector_add(this.pos, vector_div(vector_sub(this.pos_sv, this.pos), 10));
  }

  this.update(t, dt);
}


/**
 *  Prepare properties for a draw call
 */
Ship.prototype.update = function(t, dt) {
  this.animations['shield'].set_active(this.is(SHIELD));
  this.animations['thrust'].set_active(this.is(THRUST));
  for (var anim in this.animations) {
    this.animations[anim].update(t, dt);
  }
}

/**
 *  Override the EntityBase.destroy method. Destroy's the Ship in end of 
 *  world update.
 *  @param {DEATH_CAUSE_*} death_cause The cause of death
 *  @param {Player} killed_by The killer if not suicide.
 *  @return {undefined} Nothing.
 */
Ship.prototype.destroy = function(death_cause, killer_id) {
  this.destroyed = true;
  this.death_cause = death_cause;
  this.destroyed_by = killer_id;
  this.animations['die'].set_active(true);
}


/**
 *  Method Ship.draw
 *  Draws the Ship instance on the specified GraphicsContext.
 */
Ship.prototype.draw = function(ctx) {
  if (!this.visible) return;
  
  var centerx = this.size[0] / 2,
      centery = this.size[1] / 2;

  ctx.rotate(this.angle);
  ctx.strokeStyle = "white";
  ctx.lineWidth = 1;
  ctx.fillStyle = "white";
  draw_triangle(ctx, centerx, centery);
  
  for (var anim in this.animations) {
    ctx.save();
    this.animations[anim].draw(ctx);
    ctx.restore();
  }
  
  if(!this.is_me){  
    ctx.rotate(-this.angle);
    ctx.font = PLAYER_NAME_FONT;
  	ctx.fillStyle = 'rgb(' + this.player.color + ')';
    draw_label(ctx, 0, this.size[1] + 10, this.player.name, 'center', 100);	
  }
}

/**
 *  Class Bullet
 *  Local constructor for the Entity class. Add a visible property that 
 *  indiciates that the Entity is visible or not.
 */
Bullet.prototype.on_before_init = function() {
  this.visible = true;
}

/**
 *  Method Ship.draw
 *  Draws the Bullet instance on the specified GraphicsContext.
 */
Bullet.prototype.draw = function(ctx) {
  var w = this.size[0],
      h = this.size[1];
  ctx.rotate(this.angle);
  ctx.fillStyle = "white";
  ctx.fillRect(-(w / 2), -(h / 2), w, h);
}

/**
 *  Method Wall.draw
 *  Draws Wall instance on the specified GraphicsContext.
 */
Wall.prototype.draw = function(ctx, world) {
  var w = this.size[0],
      h = this.size[1],
      t = Math.min(w, h) * 0.2,
      o = Math.min(w, h) * 0.8;
  ctx.save();
  ctx.fillStyle = "black";
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "red";
  switch (this.o) {
    case 'n':
      ctx.fillRect(o, h - t, w - o * 2, t);
      break;
    case 'e':
      ctx.fillRect(0, o, t, h - o * 2);
      break;
    case 's':
      ctx.fillRect(o, 0, w - o * 2, t);
      break;
    case 'w':
      ctx.fillRect(w - t, o, t, h - o * 2);
      break;
  }
  ctx.restore();
}

/**
 *  Draw's the Block instance.
 */
Block.prototype.draw = function(ctx, world) {
  var connectors = this.connectors,
      size       = this.size;
  
  ctx.strokeStyle = "rgba(200, 20, 20, 0.4)";
  ctx.lineWidth = 2;
  ctx.fillStyle = 'rgba(200, 20, 20, 0.1)';
  ctx.fillRect(0, 0, this.size[0], this.size[1]);
  
  if (!(connectors & BLOCK_CONNECTOR_NORTH)) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size[0], 0);
    ctx.stroke();
  }

  if (!(connectors & BLOCK_CONNECTOR_EAST)) {
    ctx.beginPath();
    ctx.moveTo(size[0], 0);
    ctx.lineTo(size[0], size[1]);
    ctx.stroke();
  }

  if (!(connectors & BLOCK_CONNECTOR_SOUTH)) {
    ctx.beginPath();
    ctx.moveTo(0, size[1]);
    ctx.lineTo(size[0], size[1]);
    ctx.stroke();
  }

  if (!(connectors & BLOCK_CONNECTOR_WEST)) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, size[1]);
    ctx.stroke();
  }
  
  if(connectors == (BLOCK_CONNECTOR_EAST | BLOCK_CONNECTOR_NORTH)){
    ctx.beginPath();
    ctx.moveTo(size[0]-BLOCK_SPACING, 0);
    ctx.lineTo(size[0], 0);
    ctx.lineTo(size[0], BLOCK_SPACING);
    ctx.stroke();
  }
  if(connectors == (BLOCK_CONNECTOR_EAST | BLOCK_CONNECTOR_SOUTH)){
    ctx.beginPath();
    ctx.moveTo(size[0], size[1]-BLOCK_SPACING);
    ctx.lineTo(size[0], size[1]);
    ctx.lineTo(size[0]-BLOCK_SPACING, size[1]);
    ctx.stroke();
  }
  if(connectors == (BLOCK_CONNECTOR_WEST | BLOCK_CONNECTOR_NORTH)){
    ctx.beginPath();
    ctx.moveTo(0+BLOCK_SPACING, 0);
    ctx.lineTo(0, 0);
    ctx.lineTo(0, BLOCK_SPACING);
    ctx.stroke();
  }
  if(connectors == (BLOCK_CONNECTOR_WEST | BLOCK_CONNECTOR_SOUTH)){
    ctx.beginPath();
    ctx.moveTo(0+BLOCK_SPACING, size[1]);
    ctx.lineTo(0, size[1]);
    ctx.lineTo(0, size[1]-BLOCK_SPACING);
    ctx.stroke();
  }
}

Powerup.prototype.on_after_init = function() {
  this.inner_radius = this.size[0]  / 1.8;
  this.pulse = 0;
  this.color = get_powerup_color(this.powerup_type);
  this.ch = get_powerup_text(this.powerup_type)[0];
}

Powerup.prototype.update = function(t, dt) {
  this.pulse += (dt * 6);
  
  if (this.pulse > 20) {
    this.pulse = 0;
  }
}

/**
 *  Draws the Powerup instance
 */
Powerup.prototype.draw = function(ctx) {
  var color = this.color,
      text_alpha = 1 - ((this.pulse * 8) / 100),
      outer_alpha = 0.7 - ((this.pulse * 5) / 100),
      inner_radius = this.inner_radius,
      outer_radius = inner_radius + this.pulse;
      
  ctx.beginPath();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(' + color + ', 0.8)';    
  ctx.arc(0, 0, inner_radius, 0, Math.PI / 180, true);
  ctx.stroke();
    
  ctx.beginPath();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(' + color + ', ' +  outer_alpha +')';    
  ctx.arc(0, 0, outer_radius, 0, Math.PI / 180, true);
  ctx.stroke();
    
  ctx.font = POWERUP_FONT;
  ctx.fillStyle = 'rgba(' + color + ', ' + text_alpha + ')';
  draw_label(ctx, 1, 2, this.ch, 'center', inner_radius);
  
}

/**
 *  Creates a new instance of the ThrustAnimation class.
 */
function ThrustAnimation() {
  var particles = new cParticleSystem();
  particles.active = false;
  particles.position = Vector.create(0, 12);	
  particles.positionRandom = Vector.create( 0, 0 );
  particles.gravity = Vector.create( 0.01, 0.01 );
  particles.speed = 1.5;
  particles.lifeSpan = 10;
  // particles.lifeSpanRandom = 5;
  particles.size = 1;
  particles.sizeRandom = 1;
  particles.angle = 90;
  particles.angleRandom = 15;
  particles.maxParticles = 60;
  particles.init();
  this.particles = particles; 
}

/**
 *  Sets if the animation should be active or not
 *  @param {Boolean} active True if the animation should be active else false
 *  @return {undefined} Nothing
 */
ThrustAnimation.prototype.set_active = function(active) {
  this.particles.active = active;
}

/**
 *  Updates the ThrustAnimation instance.
 *  @param {Number} t Current world time.
 *  @param {Number} dt Current delta time,
 *  @return {undefined} Nothing
 */
ThrustAnimation.prototype.update = function(t, dt) {
  this.particles.update(65 * dt);
}

/**
 *  Draws the ThrustAnimation instance on specified context.
 *  @param {Context2D} ctx The context to draw on.
 *  @return {undefined} Nothing
 */
ThrustAnimation.prototype.draw = function(ctx) {
  this.particles.render(ctx);
}

/**
 *  Creates a new instance of the ShieldAnimation class.
 */
function ShieldAnimation() {
  this.active = false;
  this.value = 0;
}

/**
 *  Sets if the animation should be active or not
 *  @param {Boolean} active True if the animation should be active else false
 *  @return {undefined} Nothing
 */
ShieldAnimation.prototype.set_active = function(active) {
  if (active != this.active) {
    this.active = active;
    if (active && this.value <= 0) {
      this.value = 0.01;
    }
  }
}

/**
 *  Updates the ShieldAnimation instance.
 *  @param {Number} t Current world time.
 *  @param {Number} dt Current delta time,
 *  @return {undefined} Nothing
 */
ShieldAnimation.prototype.update = function(t, dt) {
  var value = this.value;
  if (this.active && value < 0.7) {
    value += (dt * 5);
  } else if (value > 0) {
    value -= (dt * 5);
  } 
  this.value = value;
}

/**
 *  Draws the ShieldAnimation instance on specified context.
 *  @param {Context2D} ctx The context to draw on.
 *  @return {undefined} Nothing
 */
ShieldAnimation.prototype.draw = function(ctx) {
  if (this.value > 0) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255, 255, 255,' + this.value + ')';    
    ctx.arc(0, 0, 20, 0, Math.PI / 180, true);
    ctx.stroke();
  }
}

/**
 *  Creates a new instance of the SpawnAnimation class.
 */
function SpawnAnimation(pos) {
  var particles = new cParticleSystem();
  particles.active = true;
  particles.position = Vector.create( 0, 0 );
  particles.positionRandom = Vector.create( 3, 3 );
  particles.startColour = [ 123, 180, 255, 1 ];
  particles.finishColour = [59,116,191, 0 ];
  particles.startColourRandom = [80,20,20,0 ];
  particles.finishColourRandom = [60,10,10,0.1];
  particles.gravity = Vector.create( 0.01, 0.01 );
  particles.sharpness = 60; 
  particles.speed = 1;
  particles.size = 1.5; 
  particles.sizeRandom = 1;
  particles.maxParticles = 120;
  particles.duration = 0.8;
  particles.lifeSpan = 1;
  particles.lifeSpanRandom = 1;
  particles.init();
  this.alpha = 0;
  this.ship_size = 0;
  this.pos = pos;
  this.particles = particles;
  this.is_done = false;
}

/**
 *  Updates the SpawnAnimation instance.
 *  @param {Number} t Current world time.
 *  @param {Number} dt Current delta time,
 *  @return {undefined} Nothing
 */
SpawnAnimation.prototype.update = function(t, dt) {
  this.alpha += dt * 2;
  this.ship_size = this.alpha;
  if (this.ship_size >= 0.5) {
    this.ship_size = 0.5;
  }
  this.particles.update(5 * dt);
  if (this.particles.particleCount == 0) {
    this.is_done = true;
  }
}

/**
 *  Draws the SpawnAnimation instance on specified context.
 *  @param {Context2D} ctx The context to draw on.
 *  @return {undefined} Nothing
 */
SpawnAnimation.prototype.draw = function(ctx) {
  this.particles.render(ctx);
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, ' + this.alpha + ')';
  draw_triangle(ctx, (SHIP_WIDTH * this.ship_size), (SHIP_HEIGHT * this.ship_size));
  ctx.restore();  
}

/**
 *  Creates a new instance of the DieAnimation class.
 */
function DieAnimation(pos, angle, vel) {
  var cx = SHIP_WIDTH / 2, cy = SHIP_HEIGHT / 2;
  this.pieces = [
    [0, -(cy / 3), cx / 2, cy / 2, angle, Math.random()],
    [-(cx / 2), (cy / 4), cx / 2 , cy / 2, angle, Math.random()],
    [(cx / 2), (cy / 4), cx / 2 , cy / 2, angle, Math.random()],
    [0, (cy / 4), cx / 2 , cy / 2, angle -270, Math.random()]
  ];
  
  this.lifetime = 1.5;
  this.pos = pos;
  this.vel = vel;
  this.angle = angle
  this.is_done = false;
}

/**
 *  Updates the DieAnimation instance.
 *  @param {Number} t Current world time.
 *  @param {Number} dt Current delta time,
 *  @return {undefined} Nothing
 */
DieAnimation.prototype.update = function(t, dt) {
  if (this.lifetime < 1.5) {
    if (this.lifetime > 0) {
      var pieces = this.pieces,
          index = pieces.length;

      while (index--) {
        var piece = pieces[index],
            seed  = piece[5];
        piece[4] += dt * (seed * 8);
      }
      
      var speedx = this.vel[0] / 1.05;
      var speedy = this.vel[1] / 1.05;
      
      this.pos = [this.pos[0] + speedx * dt,  this.pos[1] - speedy * dt];
      
      this.vel[0] = speedx;
      this.vel[1] = speedy;
      
    } else {
      this.is_done = true;
    }
  } 
  
  this.lifetime -= dt;
}

/**
 *  Draws the DieAnimation instance on specified context.
 *  @param {Context2D} ctx The context to draw on.
 *  @return {undefined} Nothing
 */
DieAnimation.prototype.draw = function(ctx) {
  var pieces = this.pieces,
      index = pieces.length;

  ctx.fillStyle = 'rgba(255, 255, 255, ' + this.lifetime + ')';
  while (index--) {
    var piece = pieces[index];
    ctx.save();
    ctx.rotate(piece[4]);
    ctx.translate(piece[0], piece[1]);
    draw_triangle(ctx, piece[2], piece[3]);
    ctx.restore();
  }
}

/**
 *  Creates a new instance of the ExplodeAnimation class.
 */
function ExplodeAnimation(pos) {
  var particles = new cParticleSystem();
  particles.active = true;
  particles.position = Vector.create( 0, 0 );
  particles.positionRandom = Vector.create( 3, 3 );
  particles.gravity = Vector.create(0.01, 0.01);
  particles.sharpness = 60;
  particles.size = 1.5; 
  particles.sizeRandom = 1;
  particles.maxParticles = 150;
  particles.speed = 1;
  particles.duration = 1;
  particles.lifeSpan = 5;
  particles.lifeSpanRandom = 5;
  particles.init();
  this.pos = pos;
  this.particles = particles;
  this.is_done = false;
}

/**
 *  Updates the ExplodeAnimation instance.
 *  @param {Number} t Current world time.
 *  @param {Number} dt Current delta time,
 *  @return {undefined} Nothing
 */
ExplodeAnimation.prototype.update = function(t, dt) {
  this.particles.update(5 * dt);
  if (this.particles.particleCount == 0) {
    this.is_done = true;
  }
}

/**
 *  Draws the ExplodeAnimation instance on specified context.
 *  @param {Context2D} ctx The context to draw on.
 *  @return {undefined} Nothing
 */
ExplodeAnimation.prototype.draw = function(ctx) {
  this.particles.render(ctx);
}

/**
 *  Creates a new instance of the TextAnimation class.
 */
function TextAnimation(pos, color, text) {
  this.pos = pos;
  this.color = color;
  this.text = text;
  this.value = 0;
  this.is_done = false;
}

/**
 *  Updates the TextAnimation instance.
 *  @param {Number} t Current world time.
 *  @param {Number} dt Current delta time,
 *  @return {undefined} Nothing
 */
TextAnimation.prototype.update = function(t, dt) {
  this.value += dt * 60;
  if (this.value >= 50) {
    this.is_done = true;
  }
}

/**
 *  Draws the ExplodeAnimation instance on specified context.
 *  @param {Context2D} ctx The context to draw on.
 *  @return {undefined} Nothing
 */
TextAnimation.prototype.draw = function(ctx) {
  var alpha = 1 - ((this.value * 5) / 100),
      size = 6 + this.value;

  ctx.fillStyle = 'rgba(' + this.color + ', ' + alpha + ')';
  ctx.font = 'bold ' + size + 'px Arial';
  draw_label(ctx, 0, 0, this.text, 'center');
}

function get_powerup_color(type) {
  switch (type) {

    case POWERUP_SPEED:
      return POWERUP_SPEED_COLOR;

    case POWERUP_RAPID:
      return POWERUP_RAPID_COLOR;
      
    case POWERUP_ENERGY:
      return POWERUP_ENERGY_COLOR;

  }
}

function get_powerup_text(type) {
  switch (type) {

    case POWERUP_SPEED:
      return 'Speed x1.3';

    case POWERUP_RAPID:
      return 'Rapid fire';
      
    case POWERUP_ENERGY:
      return 'Energy boost';

  }
}

/**
 *  GUIPlayerHUD
 */
function GUIPlayerHUD(pos) {
  this.pos = pos || [0, 0];
  this.alpha = 0;
  this.visible = true;
  this.me = null;
}

GUIPlayerHUD.prototype.is_visible = function() {
  return !this.me || this.me.dead ? false : this.visible;
}

GUIPlayerHUD.prototype.draw = function(ctx) {
  var x        = this.pos[0],
      y        = this.pos[1],
      me       = this.me;
  
  // if (opt.hud_player_pos_v) {
  //   var my_rank = this.player.rank;
  //   var max_rank = this.world.no_players;
  //   ctx.fillStyle = HUD_WHITE_COLOR;
  //   draw_label(ctx, center_w + 72, center_h - 45, 'Pos ' + my_rank + '/' + max_rank, 'right', 45);
  // }
  // 
  // if (opt.hud_coords_v)  {
  //   ctx.fillStyle = HUD_GREY_COLOR;
  //   draw_label(ctx, center_w - 72, center_h + 55, parseInt(player_entity.pos[0]) + ' x ' + parseInt(player_entity.pos[1]));
  // }    
  
  draw_v_bar(ctx, 62, -37, 7, 78, me.energy);
  
  if (me.powerup) {
    if (me.has_powerup(POWERUP_SPEED)) {
      ctx.fillStyle = 'rgba(' + POWERUP_SPEED_COLOR + ',0.7)';
      draw_label(ctx, -70, -10, 'S');
    }
    if (me.has_powerup(POWERUP_RAPID)) {
      ctx.fillStyle = 'rgba(' + POWERUP_RAPID_COLOR + ',0.7)';
      draw_label(ctx, -70, 0 , 'R');
    }
    if (me.has_powerup(POWERUP_ENERGY)) {
      ctx.fillStyle = 'rgba(' + POWERUP_ENERGY_COLOR + ',0.7)';
      draw_label(ctx, -70, 10, 'E');
    }
  }

  // Draw ship
  if (me.entity) {
    me.entity.draw(ctx);    
  }

}

/**
 *  GUIMessageLog 
 */
function GUIMessageLog(pos, buffer, options) {
  this.pos = pos || [0, 0];
  this.alpha = 0;
  this.visible = true;
  this.buffer = buffer;
  this.options = options;
}

GUIMessageLog.prototype.is_visible = function() {
  return this.buffer == null ? false : this.visible;
}

GUIMessageLog.prototype.draw = function(ctx) {
  var buffer = this.buffer,
      index = buffer.length,
      count = 0,
      row = 0,
      time = get_time(),
      max = this.options.log_max_messages;

  ctx.textBaseline = 'top';
  ctx.font = MESSAGE_LOG_FONT;

  while (index-- && ((buffer.length - 1) - index < max)) {
    var message = buffer[index];
    if (!message.disposed) {
      var alpha = message.time > time ? 0.8 :
           0.8 + (0 - ((time - message.time) / 1000));
      if (alpha < 0.02) {
        message.disposed = true;
      } 
      ctx.fillStyle = 'rgba(' + COLOR_BRIGHT + ',' + alpha + ')';
      draw_label(ctx, 0, (row -= 12), message.text, 'left');
    }
  }  
}

/**
 *  GUINetStat 
 */
function GUINetStat(pos, stats) {
  this.pos = pos || [0, 0];
  this.alpha = 0;
  this.visible = false;
  this.stats = stats || null;
}

GUINetStat.prototype.is_visible = function() {
  return !this.stats.start_time ? false : this.visible;
}

GUINetStat.prototype.draw = function(ctx) {
  var stats = this.stats;
  ctx.font = STATS_FONT;
  ctx.fillStyle = CANVAS_COLOR_BRIGHT;
  var in_kps = round_number(stats.bps_in / 1024, 2);
  var out_kps = round_number(stats.bps_out / 1024, 2);
  var in_mps = round_number(stats.mps_in, 2);
  var out_mps = round_number(stats.mps_out, 2);
  var text = 'Netstat: in: ' + in_kps + 'kb/s, out: ' + out_kps + 'kb/s, ' +
             'in: ' + in_mps + '/mps, out: ' + out_mps + '/mps';
  draw_label(ctx, 0, 0, text, 'left');
}

/**
 *  GUIFpsCounter 
 */
function GUIFpsCounter(pos, stats) {
  this.pos = pos || [0, 0];
  this.alpha = 0;
  this.visible = true;
  this.stats = stats || null;
}

GUIFpsCounter.prototype.is_visible = function() {
  return this.visible;
}

GUIFpsCounter.prototype.draw = function(ctx) {
  ctx.font = STATS_FONT;
  ctx.fillStyle = CANVAS_COLOR_BRIGHT;
  draw_label(ctx, 0, 0, 'FPS count: ' + parseInt(this.stats.average_fps), 
             'right');
}

/**
 *  GUIWarmupNotice 
 */
function GUIWarmupNotice(pos) {
  this.pos = pos || [0, 0];
  this.alpha = 0;
  this.visible = true;
  this.pulse = 0;
  this.world = null;
  this.me = null;
}

GUIWarmupNotice.prototype.is_visible = function() {
  return !this.world || this.world.r_state != ROUND_WARMUP || !this.me || 
         this.me.dead ? false : this.visible;
}

GUIWarmupNotice.prototype.draw = function(ctx) {
  var world = this.world,
      me = this.me,
      text = '',
      pulse = false;
      
  if (world.no_players == 1) {
    text = 'Waiting for more players to join...';
  } else if (!me.ready) {
    text = 'Press (r) when ready';
    pulse = true;
  } else {
    var no = Math.ceil((world.no_players * 0.6) - world.no_ready_players);
    text = 'Waiting for ' + no + ' player' + (no == 1 ? '' : 's') + 
           ' to press ready';
  }

  ctx.font = WARMUP_NOTICE_FONT;
  ctx.fillStyle = CANVAS_COLOR_ACCENT_1;
  
  if (pulse) {
    var alpha = Math.abs(Math.sin((this.pulse += 0.08)));
    if (alpha < 0.1) {
      alpha = 0.1;
    } 
    ctx.fillStyle = 'rgba(' + COLOR_ACCENT_1 + ',' + alpha + ')';
  }
  
  draw_label(ctx, 0, 0, text, 'center');
}

/**
 *  GUIScoreboard 
 */
function GUIScoreboard(pos) {
  this.pos = pos;
  this.size = null;
  this.table_width = null;
  this.table_height = null;
  this.margin = null;
  this.alpha = 0;
  this.visible = false;
  this.pulse = 0;
  this.world = null;
  this.me = null
}

GUIScoreboard.prototype.is_visible = function() {
  return this.visible || (this.world && this.me && this.me.dead) || false;
}

GUIScoreboard.prototype.set_size = function(size) {
  this.size = size;
  this.table_width = this.size[0] * 0.8;
  this.margin = (this.size[0] - this.table_width) / 2;
  this.table_height = this.size[1] - this.margin;
}

GUIScoreboard.prototype.draw = function(ctx) {
  var world = this.world,
      me = this.me,
      x = this.margin,
      y = this.margin;
  
  var title  = '',
      notice = null,
      timer  = 0;

  // Shading
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(0, 0, this.size[0], this.size[1]);

  ctx.fillStyle = CANVAS_COLOR_ACCENT_1;

  switch (world.r_state) {
    case ROUND_WARMUP:
      title = 'Warmup round';
      if (!me.ready) {
        notice = 'Press (r) when ready';
      }
      break;
      
    case ROUND_STARTING:
      title = 'Prepare your self, game starts in...';
      break;

    case ROUND_RUNNING:
      if (me.dead) {
        title = me.death_cause == DEATH_CAUSE_KILLED ?
                                  'You where killed by ' + me.killed_by.name :
                                  'You took your own life';
                                  
        // Respawn timer
        timer = me.respawn_time - world.tick;
        notice = 'Respawn in ' + format_timer(timer, world.delta) + ' sec';

      } else {
        title = 'Your rank is ' + me.rank + ' of ' + world.no_players;
      }
      break;
      
    case ROUND_FINISHED:
      title = 'Round won by ' + world.winner_names + ', next map starts in...';
      break;
  }
  
  ctx.font = SCOREBOARD_TITLE_FONT;
  draw_label(ctx, x, y, title , 'left');
  
  if (world.r_timer) {
    timer = (world.r_state == ROUND_RUNNING) ? world.r_timer :
                                       world.r_timer - world.tick; 
    draw_label(ctx, x + this.table_width, y, 
               format_timer(timer, world.delta), 'right');
  }
  
  // Draw heads-up notice
  if (notice) {
    ctx.font = SCOREBOARD_NOTICE_FONT;
    draw_label(ctx, this.size[0] / 2, this.table_height + this.margin / 2, 
                    notice, 'center');
  }
  
  ctx.font = SCOREBOARD_SUB_FONT;
  draw_label(ctx, x, (y += 20), world.map_name + 
                                ', round limit: ' + world.rules.round_limit);
                                        
  draw_label(ctx, x + this.table_width, y, world.no_players + ' / ' +
                                 world.max_players + ' players', 'right');
  
  // Draw table header
  draw_label(ctx, (x += (SCOREBOARD_PAD * 7)), (y += 60), 'Player name');
  draw_label(ctx, (x = this.margin + this.table_width), y, 'Score', 
                  'right', 50);
  draw_label(ctx, (x -= 50), y, 'Kills', 'right', 50);
  draw_label(ctx, (x -= 50), y, 'Deaths', 'right', 50);
  draw_label(ctx, (x -= 50), y, 'Time', 'right', 50);
  draw_label(ctx, (x -= 50), y, 'Ping', 'right', 50);
  
  var players = world.ranked_player_list,
      row = 0;
    
  x = this.margin;    
  y += 10;
  
  // Draw each table row
  while (row < players.length && y < this.table_height) {
    var player = players[row++];
    this.draw_row(ctx, [x, y], player);
    y += 28;
  }
  
}

GUIScoreboard.prototype.draw_row = function(ctx, pos, player) {
  var x = pos[0],
      y = pos[1],
      t = this.world.tick,
      dt = this.world.delta;      

  var name = player.name + (this.world.r_state == ROUND_RUNNING &&
                            player.dead ? ' (dead)' : ''),
      score = player.score,
      deaths = player.deaths + '(' + player.suicides + ')',
      kills = player.kills,
      time = format_timer(t - player.time, dt),
      ping = player.ping || '--',
      rank = player.rank;
      
  ctx.textBaseline = 'top';

  switch (this.world.r_state) {

    case ROUND_WARMUP:
    case ROUND_STARTING:
      score = kills = deaths = time = '--';
      ctx.font = SCOREBOARD_ROW_A_FONT;
      if (player.ready) {
        ctx.fillStyle = 'rgba(' + COLOR_ACCENT_2 + ', 0.4)';
        rank = SCOREBOARD_READY_CHAR;
      } else {
        ctx.fillStyle = 'rgba(' + COLOR_DUST + ', 0.4)';
        rank = SCOREBOARD_NOT_READY_CHAR;
      }
      break;
      
    case ROUND_RUNNING:
    case ROUND_FINISHED:
      ctx.font = SCOREBOARD_ROW_FONT;
      ctx.fillStyle = 'rgba(' + player.color + ', 0.4)';
      break;
  }

  ctx.fillRect(x, y, SCOREBOARD_PAD * 4, 22);
  
  x +=  SCOREBOARD_PAD;
  y += SCOREBOARD_MAR;

  ctx.fillStyle = CANVAS_COLOR_BRIGHT;
  draw_label(ctx, x + SCOREBOARD_PAD, y, rank, 'center');

  ctx.font = SCOREBOARD_ROW_FONT;
  ctx.fillStyle = player.is_me ? CANVAS_COLOR_BRIGHT : CANVAS_COLOR_DAWN;
  
  draw_label(ctx, (x += SCOREBOARD_PAD * 6), y, name);
  draw_label(ctx, (x  = pos[0] + (this.table_width)), y, score, 'right', 50);
  draw_label(ctx, (x -= 50), y, kills, 'right', 50);
  draw_label(ctx, (x -= 50), y, deaths, 'right', 50);
  draw_label(ctx, (x -= 50), y, time, 'right', 50);
  draw_label(ctx, (x -= 50), y, ping, 'right', 50);  
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

function draw_triangle(ctx, centerx, centery) {
  ctx.beginPath();
  ctx.moveTo(0, -centery);
  ctx.lineTo(centerx, centery);
  ctx.lineTo(-centerx, centery);
  ctx.lineTo(0, -centery);
  ctx.fill();
}

/**
 *  Draws a label
 *  
 */
function draw_label(ctx, x, y, text, align, width) {
  ctx.textAlign = align || 'left';
  ctx.fillText(text, x, y, width || 0);
}

function calculate_sfx_volume(client, pos) {
  var midpoint = client.viewport.camera.midpoint,
      distance = distance_between(midpoint, pos);
  return Math.abs(1 - ((distance / 4) / 100));
}

function calculate_ranks(world) {
  var ranked_list = [];
  for (var id in world.players) {
    ranked_list.push(world.players[id]);
  }
  ranked_list.sort(function(player, opponent) { 
    if (player.score == opponent.score) {
      return 0;
    } 
    return player.score > opponent.score ? -1 : 1; 
  });
  
  var index = ranked_list.length;
  
  while (index--) {
    ranked_list[index].rank = index + 1;
  }
  return ranked_list;
}

function format_timer(value, delta) {
  var seconds = parseInt(value / (delta * 60));
      minutes = seconds < 0 ? 0 : parseInt(seconds / 60);
      
  seconds = seconds < 0 ? 0 : seconds - minutes * 60;

  return minutes + ':' + (seconds < 10 ? '0' + seconds : seconds);
}

/**
 *  Returns current time stamp
 */
function get_time() {
  return new Date().getTime();
}