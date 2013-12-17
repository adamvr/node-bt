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

  it('should send a choke packet', function (done) {
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

describe('unchoke', function () {
  it('should emit unchoke', function (done) {
    var w = new Wire();

    w.state = 'established';

    w.on('unchoke', function () {
      done();
    });

    w.write(new Buffer([0, 0, 0, 1, 1]));
  });

  it('should send a choke packet', function (done) {
    var w = new Wire()
      , data = new Buffer(1024)
      , written = 0;

    w.on('data', function (d) { d.copy(data, written); written += d.length });
    w.on('finish', function () {
      data.slice(0, written).toJSON().should.eql([0,0,0,1,1]);
      done();
    });

    w.unchoke().end();
  });
});

describe('interested', function () {
  it('should emit interested', function (done) {
    var w = new Wire();

    w.state = 'established';

    w.on('interested', function () {
      done();
    });

    w.write(new Buffer([0, 0, 0, 1, 2]));
  });

  it('should send a choke packet', function (done) {
    var w = new Wire()
      , data = new Buffer(1024)
      , written = 0;

    w.on('data', function (d) { d.copy(data, written); written += d.length });
    w.on('finish', function () {
      data.slice(0, written).toJSON().should.eql([0,0,0,1,2]);
      done();
    });

    w.interested().end();
  });
});


describe('uninterested', function () {
  it('should emit uninterested', function (done) {
    var w = new Wire();

    w.state = 'established';

    w.on('uninterested', function () {
      done();
    });

    w.write(new Buffer([0, 0, 0, 1, 3]));
  });

  it('should send a choke packet', function (done) {
    var w = new Wire()
      , data = new Buffer(1024)
      , written = 0;

    w.on('data', function (d) { d.copy(data, written); written += d.length });
    w.on('finish', function () {
      data.slice(0, written).toJSON().should.eql([0,0,0,1,3]);
      done();
    });

    w.uninterested().end();
  });
});

describe('have', function () {
  it('should emit have', function (done) {
    var w = new Wire();

    w.state = 'established';

    w.on('have', function (packet) {
      packet.pieceId.should.equal(1);
      done();
    });

    w.write(new Buffer([0, 0, 0, 5, 4, 0, 0, 0, 1]));
  });

  it('should send a have packet', function (done) {
    var w = new Wire()
      , data = new Buffer(1024)
      , written = 0;

    w.on('data', function (d) { d.copy(data, written); written += d.length });
    w.on('finish', function () {
      data.slice(0, written).toJSON().should.eql([0,0,0,5,4,0,0,0,1]);
      done();
    });

    w.have(1).end();
  });
});

describe('bitfield', function () {
  it('should emit bitfield', function (done) {
    var w = new Wire();

    w.state = 'established';

    w.on('bitfield', function (packet) {
      packet.bitfield.should.eql([1, 1, 1, 1, 1, 1, 1, 1]);
      done();
    });

    w.write(new Buffer([0, 0, 0, 2, 5, 255]));
  });

  it('should send a bitfield packet', function (done) {
    var w = new Wire()
      , data = new Buffer(1024)
      , written = 0;

    w.on('data', function (d) { d.copy(data, written); written += d.length });
    w.on('finish', function () {
      data.slice(0, written).toJSON().should.eql([0,0,0,2,5,255]);
      done();
    });

    w.bitfield([1,1,1,1,1,1,1,1]).end();
  });
});

describe('request', function () {
  it('should emit request', function (done) {
    var w = new Wire();

    w.state = 'established';

    w.on('request', function (packet) {
      packet.index.should.equal(1);
      packet.offset.should.equal(1);
      packet.length.should.equal(1);
      done();
    });

    w.write(new Buffer([0, 0, 0, 13, 6, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]));
  });

  it('should send a request packet', function (done) {
    var w = new Wire()
      , data = new Buffer(1024)
      , written = 0;

    w.on('data', function (d) { d.copy(data, written); written += d.length });
    w.on('finish', function () {
      data.slice(0, written).toJSON().should.eql(
        [0, 0, 0, 13, 6, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]
      );
      done();
    });

    w.request(1,1,1).end();
  });
});

describe('piece', function () {
  it('should emit piece', function (done) {
    var w = new Wire();

    w.state = 'established';

    w.on('piece', function (packet) {
      packet.index.should.equal(1);
      packet.offset.should.equal(1);
      packet.piece.toJSON().should.eql([1, 1]);
      done();
    });

    w.write(new Buffer([0, 0, 0, 11, 7, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1]));
  });

  it('should send a piece packet', function (done) {
    var w = new Wire()
      , data = new Buffer(1024)
      , written = 0;

    w.on('data', function (d) { d.copy(data, written); written += d.length });
    w.on('finish', function () {
      data.slice(0, written).toJSON().should.eql(
        [0, 0, 0, 11, 7, 0, 0, 0, 1, 0, 0, 0, 1, 1, 1]
      );
      done();
    });

    w.piece(1,1, new Buffer([1, 1])).end();
  });
});

describe('cancel', function () {
  it('should emit cancel', function (done) {
    var w = new Wire();

    w.state = 'established';

    w.on('cancel', function (packet) {
      packet.index.should.equal(1);
      packet.offset.should.equal(1);
      packet.length.should.equal(1);
      done();
    });

    w.write(new Buffer([0, 0, 0, 13, 8, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]));
  });

  it('should send a cancel packet', function (done) {
    var w = new Wire()
      , data = new Buffer(1024)
      , written = 0;

    w.on('data', function (d) { d.copy(data, written); written += d.length });
    w.on('finish', function () {
      data.slice(0, written).toJSON().should.eql(
        [0, 0, 0, 13, 8, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]
      );
      done();
    });

    w.cancel(1,1,1).end();
  });
});
