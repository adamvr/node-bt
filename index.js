var net = require('net')
  , util = require('util')
  , Duplex = require('stream').Duplex;

var packetType = {
  0: 'choke',
  1: 'unchoke',
  2: 'interested',
  3: 'uninterested',
  4: 'have',
  5: 'bitfield',
  6: 'request',
  7: 'piece',
  8: 'cancel'
};

var Connection = function Connection (opts) {
  var that = this;

  this.opts = opts;
  this.state = 'init';
  this.buffer = null;

  this.on('handshake', function () {
    that.state = 'established';
  });

  Duplex.call(this);
};

util.inherits(Connection, Duplex);

Connection.prototype._write = function (data, encoding, done) {
  // Concat incoming data with leftover data from last time
  this.buffer = this.buffer ? Buffer.concat([this.buffer, data]) : data;

  // Parse it
  this.parse(this.buffer, done);
};

Connection.prototype.parse = function (data, done) {
  var read = 0;

  if (this.state === 'init') {
    read = this.parseHandshake(data);
  } else if (this.state === 'established') {
    read = this.parsePacket(data);
  }

  // Short write
  if (read < 0) {
    this.buffer = data;
    done();
  // Long write
  } else if (read < data.length) {
    // Remove used data from buffer
    this.buffer = data.slice(0, read);
    // Continue parsing
    // TODO: do on next tick to avoid stack smashing
    this.parse(this.data, done);
  } else {
    // All data used up
    this.buffer = null;
    done();
  }
};

Connection.prototype._read = function(size) {
  // Nothing to do, probably would process a queue here
};

Connection.prototype.parsePacket = function (data) {
  var pos = 0
    , len = data.length
    , packet = {};

  // Shelve packet until we get at least the length and type
  if (pos + 2 > len) return -1;

  // Parse packet length
  var length = data[pos++];

  // Parse packet type
  packet.type = packetType[data[pos++]];

  // Shelve packet if we haven't got the whole length
  if (pos + length - 1 > len) return -1;

  // Parse payload
  this['parse_' + packet.type](packet, data.slice(pos, pos + length));
  pos += length;

  // Emit the packet
  this.emit(packet.type, packet);

  return pos;
};

['choke', 'unchoke', 'interested', 'uninterested'].forEach(function (t) {
  Connection.prototype['parse_' + t] = function (packet, data) {
    return;
  }
});

Connection.prototype.parse_bitfield = function (packet, payload) {
  packet.bitfield = bitfieldToArray(payload);
};

/**
 * Connection#parseHandshake - parse a handshake packet
 * @param {Buffer} data - buffer possibly containing handshake
 * @returns {Integer} number of bytes read from the buffer
 * @api private
 */
Connection.prototype.parseHandshake = function (data) {
  var pos = 0
    , len = data.length
    , packet = {type: 'handshake'};

  // Parse protocol length
  var length = data[pos++];

  if (pos > len) return 0;

  // Parse protocol id
  packet.protocolId = data.slice(pos, pos + length).toString('utf8');
  pos += length;

  if (pos > len) return 0;

  // Parse reserved bits
  packet.reserved = data.slice(pos, pos + 8).toString('utf8');
  pos += 8;

  if (pos > len) return 0;

  // Parse hash
  packet.hash = data.slice(pos, pos + 20).toString('hex');
  pos += 8;

  if (pos > len) return 0;

  // Parse client id
  packet.clientId = data.slice(pos).toString('utf8');

  // Emit the packet
  this.emit('handshake', packet);

  return pos;
};

Connection.prototype.handshake = function () {
  var protocolName = 'BitTorrent protocol';

  // Write protocol
  this.stream.write(new Buffer([protocolName.length]));
  this.stream.write(protocolName, 'ascii');
  // Write reserved bits
  this.stream.write(new Buffer(8));
  // Write hash
  this.stream.write(this.opts.hash, 'hex');
  // Write client id
  this.stream.write(this.opts.id, 'ascii');
};

var socket = net.connect(51413);
var client = new Connection(socket, {
  hash: '1d9e10cad090a293e0c367b56ab963beff0d4eec',
  id: '-TR9000-' + new Buffer(12).toString('utf8')
});

client.on('handshake', console.dir);
