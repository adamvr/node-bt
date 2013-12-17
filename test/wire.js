/**
 * Testing requires
 */
var should = require('should');

var Wire = require('../');

var handshake = {
  protocolId: 'BitTorrent protocol',
  reserved: new Buffer(8),
  hash: '82f31648eb4205be6e975ab44c5485c6c1ee1292',
  clientId: '-TR2770-abcdefghijkl',
  type: 'handshake'
};

describe('handshake', function () {
  it('should emit a handshake packet', function (done) {
    var w = new Wire();

    w.on('handshake', function (packet) {
      packet.should.have.keys(Object.keys(handshake));
      done();
    });

    w.write(new Buffer([19]));
    w.write(handshake.protocolId, 'ascii');
    w.write(handshake.reserved);
    w.write(handshake.hash, 'hex');
    w.write(handshake.clientId, 'ascii');
  });

  it('should set the connection state to established', function (done) {
    var w = new Wire();

    w.on('handshake', function () {
      w.state.should.equal('established');
      done();
    });

    w.write(new Buffer([19]));
    w.write('BitTorrent protocol', 'ascii');
    w.write(new Buffer(8));
    w.write('82f31648eb4205be6e975ab44c5485c6c1ee1292', 'hex');
    w.write('-TR2770-abcdefghijkl', 'ascii');
  });
});

describe('choke', function () {
  it('should emit choke', function (done) {
    var w = new Wire();
    
    // Must be established before it can parse normal packets
    w.state = 'established';

    w.on('choke', function () {
      done();
    });

    w.write(new Buffer([0, 0, 0, 1, 0]));
  });

  it('should send a choke packet', function(done) {
    var w = new Wire()
      , data = new Buffer(1024)
      , written = 0;

    w.on('data', function (d) { d.copy(data, written); written += d.length });
    w.on('finish', function () {
      data.slice(0, written).toJSON().should.eql([0,0,0,1,0]);
      done();
    });

    w.choke().end();
  });
});
