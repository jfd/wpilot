// Github: http://github.com/ncr/node.ws.js
// Author: Jacek Becela
// License: MIT
// Based on: http://github.com/Guille/node.websocket.js

function nano(template, data) {
  return template.replace(/\{([\w\.]*)}/g, function (str, key) {
    var keys = key.split("."), value = data[keys.shift()];
    keys.forEach(function (key) { value = value[key] });
    return value;
  });
}

var sys = require("sys"),
  tcp = require("net"),
  createHash = require("crypto").createHash,
  Buffer = require("buffer").Buffer,
  headerExpressions_v75 = [
    /^GET (\/[^\s]*) HTTP\/1\.1$/,
    /^Upgrade: WebSocket$/,
    /^Connection: Upgrade$/,
    /^Host: (.+)$/,
    /^Origin: (.+)$/
  ],
  headerExpressions_v76 = [
    /^GET (\/[^\s]*) HTTP\/1\.1$/,
    /^Upgrade: WebSocket$/,
    /^Connection: Upgrade$/,
    /^Host: (.+)$/,
    /^Origin: (.+)$/,
    /^Sec-WebSocket-Key1: (.+)$/,
    /^Sec-WebSocket-Key2: (.+)$/
  ],
  handshakeTemplate_v75 = [
    'HTTP/1.1 101 Web Socket Protocol Handshake',
    'Upgrade: WebSocket',
    'Connection: Upgrade',
    'WebSocket-Origin: {origin}',
    'WebSocket-Location: ws://{host}{resource}',
    '',
    ''
  ].join("\r\n"),
  handshakeTemplate_v76 = [
    'HTTP/1.1 101 Web Socket Protocol Handshake',
    'Upgrade: WebSocket',
    'Connection: Upgrade',
    'Sec-WebSocket-Origin: {origin}',
    'Sec-WebSocket-Location: ws://{host}{resource}',
    '',
    ''
  ].join("\r\n"),
  policy_file = '<cross-domain-policy><allow-access-from domain="*" to-ports="*" /></cross-domain-policy>';

exports.createServer = function (websocketListener) {
  return tcp.createServer(function (socket) {
    socket.setTimeout(0);
    socket.setNoDelay(true);

    var emitter = new process.EventEmitter(),
      handshaked = false,
      buffer = "";

    function handle(data) {
      buffer += data;

      var chunks = buffer.split("\ufffd"),
        count = chunks.length - 1; // last is "" or a partial packet

      for(var i = 0; i < count; i++) {
        var chunk = chunks[i];
        if(chunk[0] == "\u0000") {
          emitter.emit("data", chunk.slice(1));
        } else {
          socket.end();
          return;
        }
      }

      buffer = chunks[count];
    }

    function md5_challenge(key_1, key_2, key_3) {
      var i;

      var key_number_1_str = "", key_number_2_str = "";
      for (i = 0; i < key_1.length; ++i) {
        if (key_1.charAt(i) >= '0' && key_1.charAt(i) <= '9') {
          key_number_1_str += key_1.charAt(i);
        }
      }
      for (i = 0; i < key_2.length; ++i) {
        if (key_2.charAt(i) >= '0' && key_2.charAt(i) <= '9') {
          key_number_2_str += key_2.charAt(i);
        }
      }

      var key_number_1, key_number_2;
      key_number_1 = parseInt(key_number_1_str, 10);
      key_number_2 = parseInt(key_number_2_str, 10);

      var spaces_1 = 0, spaces_2 = 0;
      for (i = 0; i < key_1.length; ++i) {
        if (key_1.charAt(i) == ' ') {
          ++spaces_1;
        }
      }
      for (i = 0; i < key_2.length; ++i) {
        if (key_2.charAt(i) == ' ') {
          ++spaces_2;
        }
      }

      var part_1, part_2;
      part_1 = parseInt(key_number_1 / spaces_1, 10);
      part_2 = parseInt(key_number_2 / spaces_2, 10);

      var challenge = [];
      challenge[0x00] = (part_1 >>> 24 & 0x000000ff);
      challenge[0x01] = (part_1 >>> 16 & 0x000000ff);
      challenge[0x02] = (part_1 >>> 8 & 0x000000ff);
      challenge[0x03] = (part_1 >>> 0 & 0x000000ff);
      challenge[0x04] = (part_2 >>> 24 & 0x000000ff);
      challenge[0x05] = (part_2 >>> 16 & 0x000000ff);
      challenge[0x06] = (part_2 >>> 8 & 0x000000ff);
      challenge[0x07] = (part_2 >>> 0 & 0x000000ff);
      challenge[0x08] = key_3[0] & 0x000000ff;
      challenge[0x09] = key_3[1] & 0x000000ff;
      challenge[0x0a] = key_3[2] & 0x000000ff;
      challenge[0x0b] = key_3[3] & 0x000000ff;
      challenge[0x0c] = key_3[4] & 0x000000ff;
      challenge[0x0d] = key_3[5] & 0x000000ff;
      challenge[0x0e] = key_3[6] & 0x000000ff;
      challenge[0x0f] = key_3[7] & 0x000000ff;

      var hash = createHash("md5");
      var md5_str = null;
      var ret = [];

      hash.update(String.fromCharCode.apply(String.fromCharCode, challenge));
      md5_str = hash.digest("binary");

      for (i = 0; i < 16; ++i) {
        ret.push(md5_str.charCodeAt(i));
      }

      return String.fromCharCode.apply(String.fromCharCode, ret);
    }

    function handshake_v75(data) {
       var headers = data.split("\r\n");

       var matches = [], match;
       for (var i = 0, l = headerExpressions_v75.length; i < l; i++) {
         match = headerExpressions_v75[i].exec(headers[i]);

         if (match) {
           if(match.length > 1) {
             matches.push(match[1]);
           }
         } else {
           return;
         }
       }

       try {
         socket.write(nano(handshakeTemplate_v75, {
           resource:  matches[0],
           host:      matches[1],
           origin:    matches[2],
         }), 'utf8');
       } catch (e) {
         // Socket not open for writing,
         socket.end();
         return;
       }

       handshaked = true;
       emitter.emit("connect", matches[0]);
     }

     function handshake_v76(data) {
       var utf8data = data.toString("utf8", 0, data.length - 9);
       var headers = utf8data.split("\r\n");

       var matches = [], match, i;
       for (i = 0, l = headerExpressions_v76.length; i < l; i++) {
         match = false;
         for (var j = 0, lh = headers.length; !match && j < lh; j++) {
           match = headerExpressions_v76[i].exec(headers[j]);
         }

         if (match) {
           if(match.length > 1) {
             matches.push(match[1]);
           }
         } else {
           return;
         }
       }

       var key_3 = [];
       for (i = data.length - 8; i < data.length; ++i) {
         key_3.push(data[i]);
       }

      try {
		socket.write(nano(handshakeTemplate_v76, {
		  resource:  matches[0],
		  host:      matches[1],
		  origin:    matches[2]
		}), 'utf8');
		var challenge = md5_challenge(matches[3], matches[4], key_3);
		socket.write(challenge, "binary");
      } catch (e) {
        // Socket not open for writing,
        socket.end();
        return;
      }
      handshaked = true;
      emitter.emit("connect", matches[0]);
    }

    function handshake(data) {
      var utf8data = data.toString("utf8", 0, data.length - 1);
      var headers = utf8data.split("\r\n");

      if(/<policy-file-request.*>/.exec(headers[0])) {
        try {
          socket.write(policy_file, 'ascii');
        } catch (e) {
          // socket not writeable. We're done anyway
		}
        socket.end();
        return;
      }

      handshake_v76(data);
      if (!handshaked) {
        handshake_v75(utf8data);
      }

      if (!handshaked) {
        socket.end();
      }
    }

    socket.addListener("error", function () {
      socket.end();
    });

    socket.addListener("data", function (data) {
      if(handshaked) {
        handle(data);
      } else {
        handshake(data);
      }
    }).addListener("end", function () {
      socket.end();
    }).addListener("close", function () {
      if (handshaked) { // don't emit close from policy-requests
        emitter.emit("close");
      }
    });

    emitter.remoteAddress = socket.remoteAddress;

    emitter.write = function (data) {
      try {
        socket.write('\u0000', 'binary');
        socket.write(data, 'utf8');
        socket.write('\uffff', 'binary');
      } catch(e) {
        // Socket not open for writing,
        // should get "close" event just before.
        socket.end();
      }
    }

    emitter.close = function () {
      socket.end();
    }

    websocketListener(emitter); // emits: "connect", "data", "close", provides: write(data), close()
  });
}
