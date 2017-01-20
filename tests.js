const yaquest = require('./');
const express = require('express');
const bodyParser = require('body-parser');
const compression = require('compression');
const expect = require('expect.js');

describe('yaquest', () => {
  let server;
  let port = 56247;

  [true, false].forEach(gzip => {

    describe(`gzip ${gzip ? 'on' : 'off'}`, () => {

      beforeEach(done => {
        server = express()
          .use(bodyParser.json())
          .use(bodyParser.raw({limit: '10mb'}));

        if (gzip) {
          server.use(compression({threshold: 0}));
        }

        server.use((req, res) => {
          server.req = req;

          setTimeout(() => {
            res.status(server.res.status).send(server.res.body);
          }, server.delay);
        });

        server.closePromise = defer();
        server.close = () => {
          server.conn.close(() => server.closePromise.resolve());
          return server.closePromise;
        };

        server.conn = server.listen(port, () => done());
      });

      afterEach(() => {
        return server.close();
      });

      beforeEach(() => {
        server.req = null;
        server.delay = 0;
        server.res = {
          status: 200,
          body: {hello: 'world'}
        };
      });

      describe('get', () => {

        it('should receive json', () => {
          return yaquest
            .forUrl(`http://localhost:${port}`)
            .get('/foo')
            .then(res => {
              expect(res.body).to.eql({hello: 'world'});
              expect(server.req.path).to.eql('/foo');
              expect(server.req.method).to.eql('GET');
            });
        });

      });

      ['post', 'patch', 'put'].forEach(method => {

        describe(method, () => {

          it('should send and receive json', () => {
            return yaquest
              .forUrl(`http://localhost:${port}`)
              [method]('/foo')
              .send({bar: 'baz'})
              .then(res => {
                expect(res.body).to.eql({hello: 'world'});
                expect(server.req.body).to.eql({bar: 'baz'});
                expect(server.req.path).to.eql('/foo');
                expect(server.req.method).to.eql(method.toUpperCase());
                expect(server.req.header('Content-Type')).to.equal('application/json');
              });
          });

          it('should send and receive buffers', () => {
            server.res.body = new Buffer('response body');

            return yaquest
              .forUrl(`http://localhost:${port}`)
              [method]('/foo')
              .send(new Buffer('request body'))
              .then(res => {
                expect(res.body.toString()).to.eql('response body');
                expect(server.req.body.toString()).to.eql('request body');
                expect(server.req.path).to.eql('/foo');
                expect(server.req.method).to.eql(method.toUpperCase());
                expect(server.req.header('Content-Type')).to.equal('application/octet-stream');
              });
          });

          it('should send a header', () => {
            server.res.status = 200;

            return yaquest
              [method](`http://localhost:${port}/foo`)
              .set('x-eggs', 'spam')
              .then(() => {
                expect(server.req.header('x-eggs')).to.equal('spam');
                expect(server.req.path).to.eql('/foo');
                expect(server.req.method).to.eql(method.toUpperCase());
              });
          });

        });

      });

      describe('all methods', () => {

        ['post', 'put', 'patch', 'get', 'delete'].forEach(method => {

          describe(method, () => {

            it('query', () => {
              return yaquest
                .forUrl(`http://localhost:${port}`)
                [method]()
                .query('q1', 'v1')
                .query('q1', 'v2')
                .query('q2', 'v3')
                .then(() => {
                  expect(server.req.query).to.eql({q1: ['v1', 'v2'], q2: 'v3'});
                  expect(server.req.path).to.equal('/');
                });
            });

            it('query with path', () => {
              return yaquest
                .forUrl(`http://localhost:${port}`)
                [method]('/foo')
                .query('q1', 'v1')
                .query('q1', 'v2')
                .query('q2', 'v3')
                .then(() => {
                  expect(server.req.query).to.eql({q1: ['v1', 'v2'], q2: 'v3'});
                  expect(server.req.path).to.equal('/foo');
                });
            });

            it('timeout', (done) => {
              server.delay = 1000;

              yaquest
                .forUrl(`http://localhost:${port}`)
                [method]('/foo')
                .timeout(100)
                .then(res => done(new Error('should not get here')))
                .catch(err => {
                  expect(err.message).to.equal(`request ${method.toUpperCase()} http://localhost/foo timed out after 100 ms`);
                  done();
                })
                .catch(done);
            });

            it('connection error', (done) => {
              server.delay = 1000;
              // Destroy the request after a while to cause a request error.
              setTimeout(() => server.req.destroy(), 100);

              yaquest
                .forUrl(`http://localhost:${port}`)
                [method]('/foo')
                .then(res => done(new Error('should not get here')))
                .catch(err => {
                  expect(err.message).to.equal('socket hang up');
                  done();
                })
                .catch(done);
            });

          });

        });

      });

    });

  });

});

function defer() {
  const deferred = {
    resolve: null,
    reject: null,
    promise: null
  };

  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });

  return deferred;
}