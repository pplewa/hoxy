/*
 * Copyright (c) 2015 by Greg Reimer <gregreimer@gmail.com>
 * MIT License. See mit-license.txt for more info.
 */

'use strict';

var _get = require('babel-runtime/helpers/get')['default'];

var _inherits = require('babel-runtime/helpers/inherits')['default'];

var _createClass = require('babel-runtime/helpers/create-class')['default'];

var _classCallCheck = require('babel-runtime/helpers/class-call-check')['default'];

var _Promise = require('babel-runtime/core-js/promise')['default'];

var _regeneratorRuntime = require('babel-runtime/regenerator')['default'];

var _Object$freeze = require('babel-runtime/core-js/object/freeze')['default'];

var _getIterator = require('babel-runtime/core-js/get-iterator')['default'];

var _interopRequireDefault = require('babel-runtime/helpers/interop-require-default')['default'];

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _http = require('http');

var _http2 = _interopRequireDefault(_http);

var _cycle = require('./cycle');

var _cycle2 = _interopRequireDefault(_cycle);

var _cheerio = require('cheerio');

var _cheerio2 = _interopRequireDefault(_cheerio);

var _querystring = require('querystring');

var _querystring2 = _interopRequireDefault(_querystring);

var _routePattern = require('route-pattern');

var _routePattern2 = _interopRequireDefault(_routePattern);

var _isXml = require('./is-xml');

var _isXml2 = _interopRequireDefault(_isXml);

var _events = require('events');

var _co = require('co');

var _co2 = _interopRequireDefault(_co);

var _sniSpoofer = require('./sni-spoofer');

var _net = require('net');

var _net2 = _interopRequireDefault(_net);

var _https = require('https');

var _https2 = _interopRequireDefault(_https);

var _streamThrottle = require('stream-throttle');

// TODO: test all five for both requet and response
var asHandlers = {
  '$': function $(r) {
    // TODO: test to ensure that parse errors here propagate to error log.
    // TODO: test to ensure that parse errors here fail gracefully.
    var contentType = r.headers['content-type'];
    var isXml = (0, _isXml2['default'])(contentType);
    r.$ = _cheerio2['default'].load(r._source.toString(), { xmlMode: isXml });
  },
  'json': function json(r) {
    // TODO: test to ensure that parse errors here propagate to error log.
    // TODO: test to ensure that parse errors here fail gracefully.
    r.json = JSON.parse(r._source.toString());
  },
  'params': function params(r) {
    // TODO: test to ensure that parse errors here propagate to error log.
    // TODO: test to ensure that parse errors here fail gracefully.
    r.params = _querystring2['default'].parse(r._source.toString());
  },
  'buffer': function buffer() {},
  'string': function string() {}
};

function wrapAsync(intercept) {
  return function (req, resp, cycle) {
    var result = intercept.call(this, req, resp, cycle);
    if (result && typeof result.then === 'function') {
      return result;
    } else if (result && typeof result.next === 'function') {
      return (0, _co2['default'])(result);
    } else {
      return _Promise.resolve();
    }
  };
}

function asIntercept(opts, intercept) {
  if (opts.as) {
    return _co2['default'].wrap(_regeneratorRuntime.mark(function callee$1$0(req, resp, cycle) {
      var r;
      return _regeneratorRuntime.wrap(function callee$1$0$(context$2$0) {
        while (1) switch (context$2$0.prev = context$2$0.next) {
          case 0:
            r = opts.phase === 'request' ? req : resp;
            context$2$0.next = 3;
            return r._load();

          case 3:
            asHandlers[opts.as](r);
            context$2$0.next = 6;
            return intercept.call(this, req, resp, cycle);

          case 6:
          case 'end':
            return context$2$0.stop();
        }
      }, callee$1$0, this);
    }));
  } else {
    return intercept;
  }
}

var otherIntercept = (function () {
  var ctPatt = /;.*$/;
  function test(tester, testee, isUrl) {
    if (tester === undefined) {
      return true;
    }
    if (tester instanceof RegExp) {
      return tester.test(testee);
    }
    if (typeof tester === 'function') {
      return !!tester(testee);
    }
    if (isUrl) {
      return getUrlTester(tester)(testee);
    }
    return tester == testee; // eslint-disable-line eqeqeq
  }
  return function (opts, intercept) {
    return function (req, resp, cycle) {

      var isReq = opts.phase === 'request' || opts.phase === 'request-sent',
          reqContentType = req.headers['content-type'],
          respContentType = resp.headers['content-type'],
          contentType = isReq ? reqContentType : respContentType,
          reqMimeType = reqContentType ? reqContentType.replace(ctPatt, '') : undefined,
          respMimeType = respContentType ? respContentType.replace(ctPatt, '') : undefined,
          mimeType = isReq ? reqMimeType : respMimeType,
          isMatch = 1;

      isMatch &= test(opts.contentType, contentType);
      isMatch &= test(opts.mimeType, mimeType);
      isMatch &= test(opts.requestContentType, reqContentType);
      isMatch &= test(opts.responseContentType, respContentType);
      isMatch &= test(opts.requestMimeType, reqMimeType);
      isMatch &= test(opts.responseMimeType, respMimeType);
      isMatch &= test(opts.protocol, req.protocol);
      isMatch &= test(opts.host, req.headers.host);
      isMatch &= test(opts.hostname, req.hostname);
      isMatch &= test(opts.port, req.port);
      isMatch &= test(opts.method, req.method);
      isMatch &= test(opts.url, req.url, true);
      isMatch &= test(opts.fullUrl, req.fullUrl(), true);

      if (isMatch) {
        return intercept.call(this, req, resp, cycle);
      } else {
        return _Promise.resolve();
      }
    };
  };
})();

var Proxy = (function (_EventEmitter) {
  _inherits(Proxy, _EventEmitter);

  function Proxy() {
    var _this = this;

    var opts = arguments.length <= 0 || arguments[0] === undefined ? {} : arguments[0];

    _classCallCheck(this, Proxy);

    _get(Object.getPrototypeOf(Proxy.prototype), 'constructor', this).call(this);

    if (opts.reverse) {
      var reverse = opts.reverse;
      if (!/^https?:\/\/[^:]+(:\d+)?$/.test(reverse)) {
        throw new Error('invalid value for reverse: "' + opts.reverse + '"');
      }
      this._reverse = reverse;
    }

    if (opts.upstreamProxy) {
      var proxy = opts.upstreamProxy;
      if (!/^https?:\/\//.test(proxy)) {
        proxy = 'http://' + proxy;
      }
      if (!/^https?:\/\/[^:]+:\d+$/.test(proxy)) {
        throw new Error('invalid value for upstreamProxy: "' + opts.upstreamProxy + '"');
      }
      this._upstreamProxy = proxy;
    }

    if (opts.slow) {
      this.slow(opts.slow);
    }

    this._tls = opts.tls;

    this._intercepts = _Object$freeze({
      'request': [],
      'request-sent': [],
      'response': [],
      'response-sent': []
    });

    var createServer = opts.tls ? _https2['default'].createServer.bind(_https2['default'], opts.tls) : _http2['default'].createServer.bind(_http2['default']);

    this._server = createServer(function (fromClient, toClient) {

      var cycle = new _cycle2['default'](_this),
          req = cycle._request,
          resp = cycle._response;

      cycle.on('log', function (log) {
        return _this.emit('log', log);
      });

      _co2['default'].call(_this, _regeneratorRuntime.mark(function callee$3$0() {
        var partiallyFulfilledRequest, responseFromServer;
        return _regeneratorRuntime.wrap(function callee$3$0$(context$4$0) {
          while (1) switch (context$4$0.prev = context$4$0.next) {
            case 0:
              req._setHttpSource(fromClient, opts.reverse);
              context$4$0.prev = 1;
              context$4$0.next = 4;
              return this._runIntercepts('request', cycle);

            case 4:
              context$4$0.next = 9;
              break;

            case 6:
              context$4$0.prev = 6;
              context$4$0.t0 = context$4$0['catch'](1);
              this._emitError(context$4$0.t0, 'request');

            case 9:
              context$4$0.next = 11;
              return cycle._sendToServer();

            case 11:
              partiallyFulfilledRequest = context$4$0.sent;
              context$4$0.prev = 12;
              context$4$0.next = 15;
              return this._runIntercepts('request-sent', cycle);

            case 15:
              context$4$0.next = 20;
              break;

            case 17:
              context$4$0.prev = 17;
              context$4$0.t1 = context$4$0['catch'](12);
              this._emitError(context$4$0.t1, 'request-sent');

            case 20:
              if (!(partiallyFulfilledRequest === undefined)) {
                context$4$0.next = 24;
                break;
              }

              this.emit('log', {
                level: 'debug',
                message: 'server fetch skipped for ' + req.fullUrl()
              });
              context$4$0.next = 28;
              break;

            case 24:
              context$4$0.next = 26;
              return partiallyFulfilledRequest.receive();

            case 26:
              responseFromServer = context$4$0.sent;

              resp._setHttpSource(responseFromServer);

            case 28:
              context$4$0.prev = 28;
              context$4$0.next = 31;
              return this._runIntercepts('response', cycle);

            case 31:
              context$4$0.next = 36;
              break;

            case 33:
              context$4$0.prev = 33;
              context$4$0.t2 = context$4$0['catch'](28);
              this._emitError(context$4$0.t2, 'response');

            case 36:
              context$4$0.next = 38;
              return cycle._sendToClient(toClient);

            case 38:
              context$4$0.prev = 38;
              context$4$0.next = 41;
              return this._runIntercepts('response-sent', cycle);

            case 41:
              context$4$0.next = 46;
              break;

            case 43:
              context$4$0.prev = 43;
              context$4$0.t3 = context$4$0['catch'](38);
              this._emitError(context$4$0.t3, 'response-sent');
            case 46:
            case 'end':
              return context$4$0.stop();
          }
        }, callee$3$0, this, [[1, 6], [12, 17], [28, 33], [38, 43]]);
      }))['catch'](function (ex) {
        _this.emit('error', ex);
        _this.emit('log', {
          level: 'error',
          message: ex.message,
          error: ex
        });
      });
    });

    this._server.on('error', function (err) {
      _this.emit('error', err);
      _this.emit('log', {
        level: 'error',
        message: 'proxy server error: ' + err.message,
        error: err
      });
    });

    if (opts.certAuthority) {
      (function () {
        var _opts$certAuthority = opts.certAuthority;
        var key = _opts$certAuthority.key;
        var cert = _opts$certAuthority.cert;
        var altNames = _opts$certAuthority.altNames;
        var spoofer = new _sniSpoofer.SNISpoofer(key, cert, altNames);
        var SNICallback = spoofer.callback();
        var cxnEstablished = new Buffer('HTTP/1.1 200 Connection Established\r\n\r\n', 'ascii');

        spoofer.on('error', function (err) {
          return _this.emit('error', err);
        });
        spoofer.on('generate', function (serverName) {
          _this.emit('log', {
            level: 'info',
            message: 'generated fake credentials for ' + serverName
          });
        });

        _this._server.on('connect', function (request, clientSocket, head) {
          var addr = _this._tlsSpoofingServer.address();
          var serverSocket = _net2['default'].connect(addr.port, addr.address, function () {
            clientSocket.write(cxnEstablished);
            serverSocket.write(head);
            clientSocket.pipe(serverSocket).pipe(clientSocket);
          });
        });

        _this._tlsSpoofingServer = _https2['default'].createServer({
          key: key,
          cert: cert,
          SNICallback: SNICallback
        }, function (fromClient, toClient) {
          var shp = 'https://' + fromClient.headers.host,
              fullUrl = shp + fromClient.url,
              addr = _this._server.address();
          var toServer = _http2['default'].request({
            host: 'localhost',
            port: addr.port,
            method: fromClient.method,
            path: fullUrl,
            headers: fromClient.headers
          }, function (fromServer) {
            toClient.writeHead(fromServer.statusCode, fromServer.headers);
            fromServer.pipe(toClient);
          });
          fromClient.pipe(toServer);
        });
      })();
    }
  }

  // TODO: test direct url string comparison, :id tags, wildcard, regexp
  // TODO: test line direct url string comparison, :id tags, wildcard

  _createClass(Proxy, [{
    key: 'listen',
    value: function listen(port) {
      // TODO: test bogus port
      this._server.listen.apply(this._server, arguments);
      var message = 'proxy listening on ' + port;
      if (this._tls) {
        message = 'https ' + message;
      }
      if (this._reverse) {
        message += ', reverse ' + this._reverse;
      }
      this.emit('log', {
        level: 'info',
        message: message
      });
      if (this._tlsSpoofingServer) {
        this._tlsSpoofingServer.listen(0, 'localhost');
      }
      return this;
    }
  }, {
    key: 'intercept',
    value: function intercept(opts, _intercept) {
      // TODO: test string versus object
      // TODO: test opts is undefined
      if (typeof opts === 'string') {
        opts = { phase: opts };
      }
      var phase = opts.phase;
      if (!this._intercepts.hasOwnProperty(phase)) {
        throw new Error(phase ? 'invalid phase ' + phase : 'missing phase');
      }
      if (opts.as) {
        if (!asHandlers[opts.as]) {
          // TODO: test bogus as
          throw new Error('invalid as: ' + opts.as);
        }
        if (phase === 'request-sent' || phase === 'response-sent') {
          // TODO: test intercept as in read only phase
          throw new Error('cannot intercept ' + opts.as + ' in phase ' + phase);
        }
      }
      _intercept = wrapAsync(_intercept);
      _intercept = asIntercept(opts, _intercept); // TODO: test asIntercept this, args, async
      _intercept = otherIntercept(opts, _intercept); // TODO: test otherIntercept this, args, async
      this._intercepts[phase].push(_intercept);
    }
  }, {
    key: 'close',
    value: function close() {
      this._server.close.apply(this._server, arguments);
    }
  }, {
    key: 'address',
    value: function address() {
      return this._server.address.apply(this._server, arguments);
    }
  }, {
    key: 'log',
    value: function log(events, cb) {
      var listenTo = {};
      events.split(/\s/).map(function (s) {
        return s.trim();
      }).filter(function (s) {
        return !!s;
      }).forEach(function (s) {
        return listenTo[s] = true;
      });
      var writable = undefined;
      if (!cb) {
        writable = process.stderr;
      } else if (cb.write) {
        writable = cb;
      }
      this.on('log', function (log) {
        if (!listenTo[log.level]) {
          return;
        }
        var message = log.error ? log.error.stack : log.message;
        if (writable) {
          writable.write(log.level.toUpperCase() + ': ' + message + '\n');
        } else if (typeof cb === 'function') {
          cb(log);
        }
      });
      return this;
    }
  }, {
    key: 'slow',
    value: function slow(opts) {
      if (opts) {
        var slow = this._slow = { opts: opts, latency: 0 };
        ['rate', 'latency', 'up', 'down'].forEach(function (name) {
          var val = opts[name];
          if (val === undefined) {
            return;
          }
          if (typeof val !== 'number') {
            throw new Error('slow.' + name + ' must be a number');
          }
          if (val < 0) {
            throw new Error('slow.' + name + ' must be >= 0');
          }
        });
        if (opts.rate) {
          slow.rate = new _streamThrottle.ThrottleGroup({ rate: opts.rate });
        }
        if (opts.latency) {
          slow.latency = opts.latency;
        }
        if (opts.up) {
          slow.up = new _streamThrottle.ThrottleGroup({ rate: opts.up });
        }
        if (opts.down) {
          slow.down = new _streamThrottle.ThrottleGroup({ rate: opts.down });
        }
      } else {
        if (!this._slow) {
          return undefined;
        } else {
          return this._slow.opts;
        }
      }
    }
  }, {
    key: '_emitError',
    value: function _emitError(ex, phase) {
      this.emit('log', {
        level: 'error',
        message: phase + ' phase error: ' + ex.message,
        error: ex
      });
    }
  }, {
    key: '_runIntercepts',
    value: function _runIntercepts(phase, cycle) {

      var req = cycle._request,
          resp = cycle._response,
          self = this,
          intercepts = this._intercepts[phase];

      return (0, _co2['default'])(_regeneratorRuntime.mark(function callee$2$0() {
        var _iteratorNormalCompletion, _didIteratorError, _iteratorError, _iterator, _step, intercept, stopLogging;

        return _regeneratorRuntime.wrap(function callee$2$0$(context$3$0) {
          while (1) switch (context$3$0.prev = context$3$0.next) {
            case 0:
              cycle._setPhase(phase);
              _iteratorNormalCompletion = true;
              _didIteratorError = false;
              _iteratorError = undefined;
              context$3$0.prev = 4;
              _iterator = _getIterator(intercepts);

            case 6:
              if (_iteratorNormalCompletion = (_step = _iterator.next()).done) {
                context$3$0.next = 15;
                break;
              }

              intercept = _step.value;
              stopLogging = self._logLongTakingIntercept(phase, req);
              context$3$0.next = 11;
              return intercept.call(cycle, req, resp, cycle);

            case 11:
              stopLogging();

            case 12:
              _iteratorNormalCompletion = true;
              context$3$0.next = 6;
              break;

            case 15:
              context$3$0.next = 21;
              break;

            case 17:
              context$3$0.prev = 17;
              context$3$0.t0 = context$3$0['catch'](4);
              _didIteratorError = true;
              _iteratorError = context$3$0.t0;

            case 21:
              context$3$0.prev = 21;
              context$3$0.prev = 22;

              if (!_iteratorNormalCompletion && _iterator['return']) {
                _iterator['return']();
              }

            case 24:
              context$3$0.prev = 24;

              if (!_didIteratorError) {
                context$3$0.next = 27;
                break;
              }

              throw _iteratorError;

            case 27:
              return context$3$0.finish(24);

            case 28:
              return context$3$0.finish(21);

            case 29:
            case 'end':
              return context$3$0.stop();
          }
        }, callee$2$0, this, [[4, 17, 21, 29], [22,, 24, 28]]);
      }));
    }
  }, {
    key: '_logLongTakingIntercept',
    value: function _logLongTakingIntercept(phase, req) {
      var _this2 = this;

      var t = setTimeout(function () {
        _this2.emit('log', {
          level: 'debug',
          message: 'an async ' + phase + ' intercept is taking a long time: ' + req.fullUrl()
        });
      }, 5000);

      return function stopLogging() {
        clearTimeout(t);
      };
    }
  }]);

  return Proxy;
})(_events.EventEmitter);

exports['default'] = Proxy;
var getUrlTester = (function () {
  var sCache = {},
      rCache = {};
  return function (testUrl) {
    if (testUrl instanceof RegExp) {
      if (!rCache[testUrl]) {
        rCache[testUrl] = function (u) {
          return testUrl.test(u);
        };
      }
      return rCache[testUrl];
    } else {
      if (!sCache[testUrl]) {
        if (!testUrl) {
          sCache[testUrl] = function (u) {
            return testUrl === u;
          };
        } else {
          (function () {
            var pattern = _routePattern2['default'].fromString(testUrl);
            sCache[testUrl] = function (u) {
              return pattern.matches(u);
            };
          })();
        }
      }
      return sCache[testUrl];
    }
  };
})();
module.exports = exports['default'];