// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const events = require('events');
const lang = require('lang');
const Q = require('q');

const Tier = require('./tier_manager').Tier;

module.exports = new lang.Class({
    Name: 'BaseChannel',
    Abstract: true,
    Extends: events.EventEmitter,

    _init: function() {
        // EventEmitter is a node.js class not a lang class,
        // can't chain up normally
        events.EventEmitter.call(this);
        this._isSupported = undefined;
        this._useCount = 0;
        this._openPromise = null;
        this._closePromise = null;

        // don't set this, it is set automatically by ChannelFactory
        this.uniqueId = undefined;
    },

    get isSupported() {
        if (this._isSupported !== undefined)
            return this._isSupported;

        this._isSupported = this.requiredCapabilities.every(function(cap) {
            return platform.hasCapability(cap);
        });
        return this._isSupported;
    },

    // default implementation runs on all tiers
    // you should rarely need to override this, require a specific capability
    // instead
    get allowedTiers() {
        return [Tier.PHONE, Tier.SERVER, Tier.CLOUD];
    },

    // default implementation requires no capabilities
    get requiredCapabilities() {
        return [];
    },

    // Open any resources or connections that this channel might
    // require
    _doOpen: function() {
        return Q();
    },

    // Close all resources that were opened in open()
    _doClose: function() {
        return Q();
    },

    // public API handles ref counts for you, so that multiple apps can open your
    // channel and individually close it
    open: function() {
        // if closing, wait to fully close then reopen
        if (this._closePromise) {
            return this._closePromise.then(function() {
                return this.open();
            }.bind(this));
        }

        this._useCount++;
        if (this._useCount == 1) { // first open
            if (this._openPromise)
                throw new Error('bookkeeping error');
            return this._openPromise = this._doOpen().finally(function() {
                this._openPromise = null;
            }.bind(this));
        } else if (this._openPromise) { // opening
            return this._openPromise;
        } else { // opened
            return Q();
        }
    },

    close: function() {
        // if opening, wait to fully open then close
        if (this._openPromise) {
            return this._openPromise.then(function() {
                return this.close();
            }.bind(this));
        }

        this._useCount++;
        if (this._useCount == 0) { // last close
            if (this._closePromise)
                throw new Error('bookkeeping error');
            return this._closePromise = this._doOpen().finally(function() {
                this._closePromise = null;
            }.bind(this));
        } else if (this._closePromise) { // opening
            return this._closePromise;
        } else { // opened
            return Q();
        }
    },

    // Override these in your class
    get isSource() {
        return false;
    },
    get isSink() {
        return false;
    },

    // for subclasses
    emitEvent: function(object) {
        if (!this.isSource)
            throw new Error('Cannot emit event on a sink channel - did you mean sendEvent?');
        this.emit('event', object);
    },

    // public API
    sendEvent: function(object) {
        if (this.isSink)
            throw new Error('sendEvent is not implemented by this channel (channel bug)');
        else
            throw new Error('Cannot send event on a source channel - did you mean emitEvent?');
    },
});
