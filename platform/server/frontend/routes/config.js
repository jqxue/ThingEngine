var Config = require('../../engine/config');

var http = require(Config.THINGENGINE_ACCESS_MODULE);
var url = require('url');
var fs = require('fs');
var path = require('path');
var jade = require('jade');
var express = require('express');
var router = express.Router();

var ipAddress = require('../../engine/util/ip_address');
var user = require('../util/user');

function config(req, res, next, userData, cloudData) {
    return ipAddress.getServerName().then(function(host) {
        var port = res.app.get('port');
        var serverAddress = 'http://' +
            (host.indexOf(':' >= 0) ? '[' + host + ']' : host)
            + ':' + port + '/config';

        var prefs = platform.getSharedPreferences();
        var cloudId = prefs.get('cloud-id');
        var authToken = prefs.get('auth-token');

        var qrcodeTarget = 'https://thingengine.stanford.edu/qrcode/' + host + '/'
            + port + '/' + authToken;

        var ipAddresses = ipAddress.getServerAddresses(host);
        res.render('config', { page_title: "ThingEngine - run your things!",
                               csrfToken: req.csrfToken(),
                               server: { name: host, port: port,
                                         address: serverAddress,
                                         extraAddresses: ipAddresses,
                                         initialSetup: authToken === undefined },
                               user: { configured: user.isConfigured(),
                                       loggedIn: user.isLoggedIn(req),
                                       username: userData.username,
                                       password: userData.password,
                                       error: userData.error },
                               cloud: { configured: cloudId !== undefined,
                                        error: cloudData.error,
                                        username: cloudData.username,
                                        id: cloudId },
                               qrcodeTarget: qrcodeTarget });
    });
}

router.get('/', user.redirectLogin, function(req, res, next) {
    config(req, res, next, {}, {}).done();
});

router.post('/set-server-password', user.requireLogin, function(req, res, next) {
    var username, password;
    try {
        if (typeof req.body['username'] !== 'string' ||
            req.body['username'].length == 0 ||
            req.body['username'].length > 255)
            throw new Error("You must specify a valid username");
        username = req.body['username'];

        if (typeof req.body['password'] !== 'string' ||
            req.body['password'].length < 8 ||
            req.body['password'].length > 255)
            throw new Error("You must specifiy a valid password (of at least 8 characters)");

        if (req.body['confirm-password'] !== req.body['password'])
            throw new Error("The password and the confirmation do not match");
        password = req.body['password'];

    } catch(e) {
        config(req, res, next, { username: username,
                                 password: '',
                                 error: e.message }, {}).done();
        return;
    }

    user.register(req, res, username, password).then(function() {
        res.redirect('/config');
    }).catch(function(error) {
        return config(req, res, next, { username: username,
                                        password: '',
                                        error: error.message }, {});
    });
});

function setCloudId(engine, cloudId, authToken) {
    if (engine.devices.hasDevice('thingengine-own-cloud'))
        return false;
    if (!platform.setAuthToken(authToken))
        return false;

    engine.devices.loadOneDevice({ kind: 'thingengine',
                                   tier: 'cloud',
                                   cloudId: cloudId,
                                   own: true }, true).done();
    return true;
}

router.post('/cloud-setup', user.requireLogin, function(req, res, next) {
    try {
        var username = req.body.username;
        if (!username)
            throw new Error("Missing username");

        var password = req.body.password;
        if (!password)
            throw new Error("Missing password");

        var postData = 'username=' + encodeURIComponent(username)
            + '&password=' + encodeURIComponent(password);

        var request = url.parse(Config.THINGENGINE_URL + '/server/login');
        request.method = 'POST';
        request.headers = {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': postData.length
        };

        var devel = res.app.get('env') === 'development';
        if (devel) {
            // accept self-signed certs in development
            // FIXME: REMOVE
            request.agent = false;
            request.rejectUnauthorized = false;
        }
        var ajax = http.request(request);

        ajax.on('error', function(e) {
            config(req, res, next, {}, { error: e.message,
                                         username: username });
        });
        ajax.on('response', function(response) {
            if (response.statusCode != 200) {
                ajax.abort();
                config(req, res, next, {}, { error: http.STATUS_CODES[response.statusCode],
                                             username: username }).done();
                return;
            }

            var buffer = '';
            response.on('data', function(incoming) {
                buffer += incoming.toString('utf8');
            });
            response.on('end', function() {
                try {
                    var json = JSON.parse(buffer);
                    if (json.success) {
                        setCloudId(res.app.engine, json.cloudId, json.authToken);
                        res.redirect('/config');
                    } else {
                        config(req, res, next, {}, { error: json.error,
                                                     username: username }).done();
                    }
                } catch(e) {
                    config(req, res, next, {}, { error: e.message,
                                                 username: username }).done();
                }
            });
        });
        ajax.end(postData);
    } catch(e) {
        config(req, res, next, {}, { error: e.message,
                                     username: username }).done();
    }
});

module.exports = router;
