var net = require('net')
  , util = require('util')
  , Writable = require('stream').Writable;

var packetType = [
  'choke',
  'unchoke',
  'interested',
  'uninterested',
  'have',
  'bitfield',
  'request',
  'piece',
  'cancel'
];

var Connection = function Connection (stream, opts) {
  var that = this;

  this.opts = opts;
  this.state = 'init';
  this.stream = stream;

  stream.on('connect', function () {
    that.handshake();
  });

  stream.pipe(this);

  Writable.call(this);
};
util.inherits(Connection, Writable);

Connection.prototype._write = function (data, encoding, done) {
  if (this.state === 'init') {
    this.parseHandshake(data);
    done();
  }
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
