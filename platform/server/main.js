// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

var Q = require('q');

var Engine = require('./engine');
var Frontend = require('./frontend');

function main() {
    global.platform = require('./platform');

    platform.init().then(function() {
        var engine = new Engine();
        var frontend = new Frontend();

        process.on('SIGINT', function() {
            engine.stop();
        });

        return Q.all([engine.open(), frontend.open()]).then(function() {
            return engine.run().finally(function() {
                return Q.all([engine.close(), frontend.close()]);
            });
        });
    }).catch(function(error) {
        console.log('Uncaught exception: ' + error);
    }).finally(function () {
        console.log('Cleaning up');
        platform.exit();
    }).done();
}

main();
