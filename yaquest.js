'use strict';

const URL = require('url');
const zlib = require('zlib');
const http = require('http');
const https = require('https');
const queryString = require('querystring');

class Request {

  constructor() {
    this._body = null;
    this._binary = false;
    this._timeout = 30000;
    this._query = {};
    this._opt = {
      headers: {
        'Accept-Encoding': 'gzip'
      }
    };
  }

  url(url) {
    const urlObj = URL.parse(url);

    this._opt.protocol = urlObj.protocol;
    this._opt.hostname = urlObj.hostname;
    this._opt.port = urlObj.port;
    this._opt.path = urlObj.path;

    return this;
  }

  get() {
    this._opt.method = 'GET';
    return this;
  }

  post() {
    this._opt.method = 'POST';
    return this;
  }

  put() {
    this._opt.method = 'PUT';
    return this;
  }

  patch() {
    this._opt.method = 'PATCH';
    return this;
  }

  delete() {
    this._opt.method = 'DELETE';
    return this;
  }

  binary() {
    this._binary = true;
    return this;
  }

  send(body) {
    if (Buffer.isBuffer(body)) {
      this._body = body;
      this._opt.headers['Content-Type'] = 'application/octet-stream';
    } else {
      this._body = new Buffer(JSON.stringify(body));
      this._opt.headers['Content-Type'] = 'application/json';
    }

    this._opt.headers['Content-Length'] = this._body.length;
    return this;
  }

  set(headerName, header) {
    this._opt.headers[headerName] = header;
    return this;
  }

  query(name, value) {
    this._query[name] = this._query[name] || [];
    this._query[name].push(value);
    return this;
  }

  auth(username, password) {
    this._opt.headers['Authorization'] = 'Basic ' + new Buffer(`${username}:${password}`).toString('base64');
    return this;
  }

  timeout(timeout) {
    this._timeout = timeout;
    return this;
  }

  agent(agent) {
    this._opt.agent = agent;
    return this;
  }

  then() {
    const promise = this._execute();
    return promise.then.apply(promise, arguments);
  }

  catch() {
    const promise = this._execute();
    return promise.catch.apply(promise, arguments);
  }

  toString() {
    return `${this._opt.method} ${this._getUrl()}`;
  }

  _getUrl() {
    return URL.format({
      protocol: this._opt.protocol,
      hostname: this._opt.hostname,
      pathname: this._opt.path
    });
  }

  _execute() {
    const ctx = {
      resolve: null,
      reject: null,
      timeoutHandle: null,
      req: null,
      res: null
    };

    return new Promise((resolve, reject) => {
      const opt = Object.assign({}, this._opt);
      const httpOrHttps = opt.protocol === 'https:' ? https : http;

      if (Object.keys(this._query).length) {
        opt.path += '?' + queryString.encode(this._query);
      }

      ctx.resolve = resolve;
      ctx.reject = reject;

      ctx.req = httpOrHttps.request(opt, response => {
        ctx.res = response;

        try {
          this._onResponse(ctx);
        } catch (err) {
          reject(err);
        }
      });

      this._writeBody(ctx);
      this._registerTimeout(ctx);

      handleError(ctx.req, ctx.reject);

      ctx.req.url = this._getUrl();
      ctx.req.end();
    }).then(res => {
      this._clearTimeout(ctx);
      return res;
    }).catch(err => {
      this._clearTimeout(ctx);
      err.req = ctx.req;
      err.res = ctx.res;
      err.status = (ctx.res && ctx.res.status) || null;
      err.data = (ctx.res && ctx.res.body) || null;
      return Promise.reject(err);
    });
  }

  _onResponse({res, resolve, reject}) {
    const data = [];
    let resStream = res;

    handleError(res, reject);

    if (isGzipped(res)) {
      resStream = wrapGzip(res);

      handleError(resStream, reject);
    }

    resStream.on('data', chunk => {
      data.push(chunk);
    });

    resStream.on('end', () => {
      res.body = Buffer.concat(data);
      res.status = res.statusCode || 500;
      res.isBinary = this._binary;

      if (!this._binary && res.body.length !== 0) {
        try {
          res.body = JSON.parse(res.body.toString());
        } catch(err) {
          // Do nothing.
        }
      }

      if (res.status < 200 || res.status >= 300) {
        reject(new Error(http.STATUS_CODES[res.status || 500]));
      } else {
        resolve(res);
      }
    });
  }

  _writeBody({req}) {
    if (this._body) {
      req.write(this._body);
    }
  }

  _registerTimeout(ctx) {
    if (this._timeout) {
      ctx.timeoutHandle = setTimeout(() => {
        ctx.timeoutHandle = null;
        ctx.req.abort();
        ctx.reject(new Error(`request ${this.toString()} timed out after ${this._timeout} ms`));
      }, this._timeout);
    }
  }

  _clearTimeout(ctx) {
    if (ctx.timeoutHandle) {
      clearTimeout(ctx.timeoutHandle);
      ctx.timeoutHandle = null;
    }
  }
}

function isGzipped(res) {
  const encoding = res.headers['content-encoding'];
  return typeof encoding === 'string' && encoding.trim().toLowerCase() === 'gzip';
}

function wrapGzip(res) {
  const wrapped = zlib.createGunzip();
  res.pipe(wrapped);
  return wrapped;
}

function handleError(emitter, reject) {
  emitter.on('error', err => {
    reject(err);
  });
}

function combineUrl(baseUrl, path) {
  return ensureSlashEnd(baseUrl || '') + ensureNoSlashStart(path || '');
}

function ensureSlashEnd(str) {
  if (!str) {
    return str;
  } else if (str.charAt(str.length - 1) !== '/') {
    return str + '/';
  } else {
    return str;
  }
}

function ensureNoSlashStart(str) {
  if (!str) {
    return str;
  } else if (str.charAt(0) === '/') {
    return str.substr(1);
  } else {
    return str;
  }
}

module.exports = {
  Request,

  get(url) {
    return new Request().get().url(url);
  },

  post(url) {
    return new Request().post().url(url);
  },

  put(url) {
    return new Request().put().url(url);
  },

  patch(url) {
    return new Request().patch().url(url);
  },

  delete(url) {
    return new Request().delete().url(url);
  },

  forUrl(baseUrl) {
    return {
      get(path) {
        return new Request().get().url(combineUrl(baseUrl, path));
      },

      post(path) {
        return new Request().post().url(combineUrl(baseUrl, path));
      },

      put(path) {
        return new Request().put().url(combineUrl(baseUrl, path));
      },

      patch(path) {
        return new Request().patch().url(combineUrl(baseUrl, path));
      },

      delete(path) {
        return new Request().delete().url(combineUrl(baseUrl, path));
      }
    };
  }
};
