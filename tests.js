const yaquest = require('./');
const express = require('express');
const bodyParser = require('body-parser');
const expect = require('expect.js');

describe('yaquest', () => {
  let server;
  let port = 56247;

  before(done => {
    server = express().use(bodyParser.json());

    server.use((req, res) => {
      server.req = req;
      res.status(server.res.status).send(server.res.body);
    });

    server.listen(port, () => done());
  });

  beforeEach(() => {
    server.req = null;
    server.res = {
      status: 500,
      body: {}
    };
  });

  describe('#post', () => {

    it('should send json and receive', () => {
      server.res.status = 200;
      server.res.body = {hello: 'world'};

      return yaquest
        .create(`http://localhost:${port}`)
        .post('/foo')
        .send({bar: 'baz'})
        .then(res => {
          expect(res.body).to.eql({hello: 'world'});
          expect(server.req.body).to.eql({bar: 'baz'});
        });
    });

    it('should send a header', () => {
      server.res.status = 200;

      return yaquest
        .create(`http://localhost:${port}`)
        .post('/foo')
        .set('x-eggs', 'spam')
        .then(() => {
          expect(server.req.header('x-eggs')).to.equal('spam')
        });
    });

  });

});