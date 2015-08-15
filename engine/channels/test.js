// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const lang = require('lang');
const Q = require('q');

const BaseChannel = require('../base_channel');

const TestChannel = new lang.Class({
    Name: 'TestChannel',
    Extends: BaseChannel,

    _init: function() {
        this.parent();

        this._timeout = -1;
    },

    get isSource() {
        return true;
    },
    get isSink() {
        return true;
    },

    // For testing only
    get isSupported() {
        return platform.type === 'android';
    },

    sendEvent: function(event) {
        console.log('Writing data on test channel: ' + event);
    },

    _doOpen: function() {
        // emit a blob every 60 s
        this.emitEvent(42);
        this._timeout = setInterval(function() {
            this.emitEvent(42);
        }.bind(this), 60000);
        return Q();
    },

    _doClose: function() {
        clearInterval(this._timeout);
        this._timeout = -1;
        return Q();
    }
});

function createChannel() {
    return new TestChannel();
}

module.exports.createChannel = createChannel;
