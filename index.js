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

var Connection = module.exports = function Connection (opts) {
  var that = this;

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
    this.buffer = data.slice(read);
    // Continue parsing
    // TODO: do on next tick to avoid stack smashing
    this.parse(this.buffer, done);
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
  if (pos + 5 > len) return -1;

  // Parse packet length
  var length = data.readUInt32BE(0);
  pos += 4;

  // Parse packet type
  packet.type = packetType[data[pos++]] || 'unknown';

  // Shelve packet if we haven't got the whole length
  if (pos + length - 1 > len) return -1;

  // Parse payload
  this['parse_' + packet.type](packet, data.slice(pos, pos + length - 1));
  pos += length;

  // Emit the packet
  this.emit(packet.type, packet);

  // Pos will be one byte after the last read byte
  return pos - 1;
};

['choke', 'unchoke', 'interested', 'uninterested'].forEach(function (t) {
  Connection.prototype['parse_' + t] = function (packet, data) {
    return;
  }
});

Connection.prototype.parse_unknown = function (packet, payload) {
  packet.payload = payload;
};

Connection.prototype.parse_bitfield = function (packet, payload) {
  packet.bitfield = bitfieldToArray(payload);
};

Connection.prototype.parse_have = function (packet, payload) {
  packet.pieceId = payload.readUInt32BE(0);
};

Connection.prototype.parse_request = function (packet, payload) {
  packet.index = payload.readUInt32BE(0);
  packet.offset = payload.readUInt32BE(4);
  packet.length = payload.readUInt32BE(8);
};

Connection.prototype.parse_piece = function (packet, payload) {
  packet.index = payload.readUInt32BE(0);
  packet.offset = payload.readUInt32BE(4);
  packet.piece = payload.slice(8);
};

Connection.prototype.parse_cancel = function (packet, payload) {
  packet.index = payload.readUInt32BE(0);
  packet.offset = payload.readUInt32BE(4);
  packet.length = payload.readUInt32BE(8);
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

  if (pos >= len) return -1;

  // Parse protocol id
  packet.protocolId = data.slice(pos, pos + length).toString('utf8');
  pos += length;

  if (pos >= len) return -1;

  // Parse reserved bytes
  packet.reserved = data.slice(pos, pos + 8);
  pos += 8;

  if (pos >= len) return -1;

  // Parse hash
  packet.hash = data.slice(pos, pos + 20).toString('hex');
  pos += 20;

  if (pos + 20 > len) return -1;

  // Parse client id
  packet.clientId = data.slice(pos, pos + 20).toString('utf8');
  pos += 20;

  // Emit the packet
  this.emit('handshake', packet);

  return pos;
};

Connection.prototype.choke = function () {
  this.push(new Buffer([0, 0, 0, 1, 0]));
};

Connection.prototype.unchoke = function () {
  this.push(new Buffer([0, 0, 0, 1, 1]));
};

Connection.prototype.interested = function () {
  this.push(new Buffer([0, 0, 0, 1, 2]));
};

Connection.prototype.uninterested = function () {
  this.push(new Buffer([0, 0, 0, 1, 3]));
};

Connection.prototype.handshake = function (protocolId, reserved, hash, clientId) {
  if ('object' === typeof protocolId) {
    var opts = protocolId;
    return this.handshake(
      opts.protocolId,
      opts.reserved,
      opts.hash,
      opts.clientId
    );
  }

  if (Buffer.byteLength(hash, 'hex') !== 20) throw new Error('Incorrect hash length');
  if (Buffer.byteLength(clientId, 'utf8') !== 20) throw new Error('Incorrect id length');

  var buffer = new Buffer(1 + protocolId.length + 8 + 20 + 20)
    , pos = 0;

  // Write protocol
  buffer.writeUInt8(protocolId.length, pos);
  pos += 1;
  buffer.write(protocolId, 'utf8', pos);
  pos += protocolId.length;

  // Write reserved bytes
  reserved.copy(buffer, pos);
  pos += 8;

  // Write hash
  buffer.write(hash, 'hex', pos);
  pos += 20;

  // Write client id
  buffer.write(clientId, 'utf8', pos);

  // Transmit it
  this.push(buffer);
};

Connection.prototype.have = function (pieceId) {
  // Out of bounds piece id
  if (pieceId < 0 || pieceId > 0xFFFFFFFF) return;

  this.push(new Buffer([0, 0, 0, 5, 4]));
  // Assemble piece id
  var piece = new Buffer(4);
  piece.writeUInt32BE(pieceId, 0);
  // Write it
  this.push(piece);
};

Connection.prototype.bitfield = function (bitfield) {
  // Convert array bitfield to buffer
  if (!Buffer.isBuffer(bitfield)) bitfield = arrayToBitfield(bitfield);

  // Assemble header
  var header = new Buffer(5);
  header.writeUInt32BE(1 + bitfield.length, 0);
  header.writeUInt8(5, 4);

  // Send header
  this.push(header);

  // Send bitfield
  this.push(bitfield);
};

Connection.prototype.request = function (index, offset, length) {
  // Write header
  this.push(new Buffer([0, 0, 0, 13, 6]));

  // Assemble payload
  var payload = new Buffer(12);
  payload.writeUInt32BE(index, 0);
  payload.writeUInt32BE(offset, 4);
  payload.writeUInt32BE(length, 8);

  this.push(payload);
};

Connection.prototype.piece = function (index, offset, piece) {
  // Assemble header
  var header = new Buffer(5);
  header.writeUInt32BE(9 + piece.length, 0);
  header.writeUInt8(7, 4);

  // Write header
  this.push(header);

  // Write index and offset
  var meta = new Buffer(8);
  meta.writeUInt32BE(index, 0);
  meta.writeUInt32BE(offset, 4);
  this.push(meta);

  // Write payload
  this.push(piece);
};

Connection.prototype.cancel = function (index, offset, length) {
  // Write header
  this.push(new Buffer([0, 0, 0, 13, 8]));

  // Assemble payload
  var payload = new Buffer(12);
  payload.writeUInt32BE(index, 0);
  payload.writeUInt32BE(offset, 4);
  payload.writeUInt32BE(length, 8);

  this.push(payload);
};

var bitfieldToArray = function (bitfield) {
  var bitArray = [];
  for (var i = 0, len = bitfield.length; i < len; i++) {
    var byte = bitfield[i];
    for (var bit = 7; bit + 1; bit--) {
      bitArray.push(!!(byte & 1 << bit));
    }
  }

  return bitArray;
};

var arrayToBitfield = function (bitArray) {
  var fieldLength = Math.ceil(bitArray.length / 8)
    , field = new Buffer(fieldLength);

  // Zero unused bits
  field.fill(0);

  for (var i = 0, len = bitArray.length; i < len; i++) {
    var byteNum = Math.floor(i / 8)
      , shift = i % 8;

    field[byteNum] = field[byteNum] | bitArray[i] << (7 - shift);
  }

  return field;
};
