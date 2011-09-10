/**
 *  Represents a keyboard device.
 *  @param {DOMElement} target The element to read input from.
 *  @param {Object} options Options with .bindings
 */
function KeyboardDevice(target, options) {
  var self = this;
  var key_states = this.key_states = {};
  this.target = target;
  this.bindings = options.bindings;
  this.onkeypress = null;

  for (var i=0; i < 255; i++) {
    key_states[i] = 0;
  }

  key_states['shift'] = 0;
  key_states['ctrl'] = 0;
  key_states['alt'] = 0;
  key_states['meta'] = 0;

  target.onkeypress = function(e) {
    if (self.onkeypress) {
      self.onkeypress(e.keyCode || e.which);
      e.preventDefault();
    }
  };

  target.onkeydown = function(e) {
    if(key_states[e.keyCode] == 0) key_states[e.keyCode] = 1;
    if (!self.onkeypress) {
      e.preventDefault();
    }
  };

  target.onkeyup = function(e) {
    if(key_states[e.keyCode] > 0) key_states[e.keyCode] = 0;
    if (!self.onkeypress) {
      e.preventDefault();
    }
  };
}

KeyboardDevice.prototype.destroy = function() {
  this.target.onkeypress = null;
  this.target.onkeydown = null;
  this.target.onkeyup = null;
}

/**
 *  Returns current state of a defined key
 *  @param {String} name Name of defined key
 *  @return {NUmber} 1 if down else 0.
 */
KeyboardDevice.prototype.on = function(name) {
  var key = this.bindings[name];
  return this.key_states[key];
}

/**
 *  Returns current state of a defined key. The key is reseted/toggled if state
 *  is on.
 *  @param {String} name Name of defined key
 *  @return {NUmber} 1 if down else 0.
 */
KeyboardDevice.prototype.toggle = function(name) {
  var key = this.bindings[name];
  if (this.key_states[key] == 1) {
    this.key_states[key] = 2;
    return 1;
  }
  return 0;
}


// Emulate requestAnimationFrame
// Thanks http://paulirish.com/2011/requestanimationframe-for-smart-animating/
window.requestAnimationFrame = window.requestAnimationFrame ||
  (function(){
     return  window.webkitRequestAnimationFrame || 
             window.mozRequestAnimationFrame    || 
             window.oRequestAnimationFrame      || 
             window.msRequestAnimationFrame     || 
             function(/* function */ callback, /* DOMElement */ element){
               window.setTimeout(callback, 1000 / 60);
             };
   })();

/**
 *  Represents a canvas ViewportDevice.
 *  @param {DOMElement} target The canvas element
 *  @param {Number} width The width of the viewport
 *  @param {Number} height The height of the viewport
 */
function ViewportDevice(target, width, height, options) {
  this.target       = target;
  this.ctx          = target.getContext('2d');
  this.camera       = { pos: [0, 0], size: [0, 0], scale: 1};
  this.w            = width;
  this.h            = height;
  this.options      = options;
  this.factor       = null;
  this.autorefresh  = false;
  this.frames       = 0;
  this.frame_time   = 0;
  this.current_fps  = 0;
  this.max_fps      = 0;
  this.min_fps      = 10000;
  this.average_fps  = 0;

  // Event callbacks
  this.ondraw       = function(ctx) {};

  // Set canvas width and height
  target.width        = width;
  target.height       = height;

  // Start to draw things
  this.set_autorefresh(true);
}


ViewportDevice.prototype.update_size = function(width, height) {
  this.target.width = width;
  this.target.height = height;
  this.w = width;
  this.h = height;
  this.camera.size = [width, height];
};

ViewportDevice.prototype.destroy = function() {
  this.set_autorefresh(false);
  this.ctx.clearRect(0, 0, this.w, this.h);
}

/**
 *  Moves the camera focus to the specified point.
 *  @param {x, y} A point representing the position of the camera
 *  @returns {undefined} Nothing
 */
ViewportDevice.prototype.set_autorefresh = function(autorefresh) {
  var self  = this;

  if (autorefresh != self.autorefresh) {
    self.autorefresh = autorefresh;
    if (autorefresh) {
      self.frame_time = get_time();
      (function animloop(dt){
        var time = get_time();

        self.draw(0);

        self.frames++;

        if (time > self.frame_time + 1000 ) {
			    self.current_fps = Math.round((self.frames * 1000) /
			                                  (time - self.frame_time));
        	self.min_fps = Math.min(self.min_fps, self.current_fps);
        	self.max_fps = Math.max(self.max_fps, self.current_fps);
        	self.average_fps = self.current_fps;
        	self.frame_time = time;
        	self.frames = 0;
        }

        if (self.autorefresh) {
          requestAnimationFrame(animloop);
        } 
      })();
    }
  }
}

/**
 *  Moves the camera focus to the specified point.
 *  @param {Vector} A vector representing the position of the camera
 *  @returns {undefined} Nothing
 */
ViewportDevice.prototype.set_camera_pos = function(vector) {
  this.camera.midpoint = vector;
  this.camera.pos = [vector[0] - (this.w / 2), vector[1] - (this.h / 2)];
  this.camera.size = [this.w, this.h];
  this.camera.scale = 1;
}

ViewportDevice.prototype.get_camera_box = function() {
  return {
    x: this.camera.pos[0],
    y: this.camera.pos[1],
    w: this.camera.size[0],
    h: this.camera.size[1]
  }
}

/**
 *  Translate a point into a camera pos.
 *  @param {Vector} The point that should be translated into camera pos
 *  @return The translated Point
 */
ViewportDevice.prototype.translate = function(vector) {
  return vector_sub(vector, this.camera.pos);
}


/**
 *  Draws the scene.
 *  @return {undefined} Nothing
 */
ViewportDevice.prototype.draw = function() {
  var ctx = this.ctx;
  ctx.clearRect(0, 0, this.w, this.h);
  ctx.save();
  ctx.translate(0, 0);
  this.ondraw(ctx);
  ctx.restore();
}


/**
 *  Represents a keyboard device.
 *  @param {DOMElement} target The element to read input from.
 *  @param {Object} options Options with .bindings
 */
function SoundDevice(options){
  this.BG_SOUND = '_bgsound';

  this.sounds = {};
  this.destroyed = false;

  this.bg_sound_enabled = options.bg_sound_enabled;
  this.sfx_sound_enabled = options.sfx_sound_enabled;

  try{
    this.supported = (new Audio()) !== undefined;
  }catch(e){
    this.supported = false;
  }

  this.prefix = ".ogg";

  if (this.supported && /AppleWebKit/.test(navigator.userAgent) &&
      !(this.supported && /Chrome/.test(navigator.userAgent))) {
    this.prefix = ".m4a";
  }
}

SoundDevice.prototype.destroy = function() {
  this.destroyed = true;
  for (var name in this.sounds) {
    var sound = this.sounds[name];
    var index = sound.buffers.length;
    while (index--) {
      sound.buffers[index].pause();
      delete sound.buffers[index];
    }
    sound.free_count = 0;
  }
}

SoundDevice.prototype.init_sfx = function(sources) {
  if (!this.supported || !this.sfx_sound_enabled) {
    return false;
  }

  for (var name in sources) {
    var source = sources[name],
        size = source[0],
        urls = source[1],
        sound = { name: name, buffers: [], free_count: size};

    while (size--) {
      var url = urls[Math.floor(Math.random() * urls.length)],
          audio = new Audio(url + this.prefix);
      audio.is_free = true;
      audio.load();
      sound.buffers.push(audio);
    }

    this.sounds[name] = sound;
  }

  return true;
}

SoundDevice.prototype.init_bg = function(source) {
  if (!this.supported || !this.bg_sound_enabled) {
    return false;
  }

  var sound = { name: this.BG_SOUND, buffers: [], free_count: 2};

  for (var i = 0; i < 2; i++) {
    var audio = new Audio(source + this.prefix);
    audio.is_free = true;
    sound.buffers.push(audio);
  }

  this.sounds[this.BG_SOUND] = sound;

  return true;
}

SoundDevice.prototype.play = function(name, volume) {
  if (this.destroyed || !this.supported || !this.sfx_sound_enabled) {
    return;
  }

  var sound_volume = volume === undefined ? 1 : volume;

  if (sound_volume <= 0 || sound_volume > 1) {
    return;
  }

  var self = this;
  var buffer = self.get_buffer(name);

  if (buffer) {

    function free() {
      self.free_buffer(name, buffer, free);
    }

    buffer.addEventListener('ended', free, false);
    buffer.volume = sound_volume;
    buffer.play();
  }
}

SoundDevice.prototype.playbg = function(volume) {
  if (this.destroyed || !this.supported || !this.bg_sound_enabled) {
    return;
  }

  var self = this;
  var buffer = this.get_buffer(this.BG_SOUND);

  function free() {
    self.playbg(volume);
    self.free_buffer(self.BG_SOUND, buffer, free);
  }

  if (buffer) {
    buffer.volume = volume;
    buffer.addEventListener('ended', free, false);
    buffer.play();
  }

}

SoundDevice.prototype.get_buffer = function(name) {
  var sound = this.sounds[name],
      buffers = sound.buffers;

  if (sound.free_count) {
    var buffer = null,
        index = buffers.length;

    while ((buffer = buffers[--index]) && !buffer.is_free);

    if (buffer) {
      buffer.is_free = false;
      sound.free_count--;
      return buffer;
    }
  }

  return;
}

SoundDevice.prototype.free_buffer = function(name, buffer, handle) {
  var sound = this.sounds[name];
  sound.free_count++;

  buffer.removeEventListener('ended', handle, false);
  buffer.is_free = true;
  buffer.load();
}