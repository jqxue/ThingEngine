// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

// Server platform

const Q = require('q');
const fs = require('fs');
const os = require('os');

const sql = require('./engine/db/sql');

var Config;
try {
Config = require('./platform_config');
} catch(e) {
Config = {};
}
const prefs = require('./engine/prefs');

var _writabledir = null;
var _frontend = null;
var _prefs = null;

function dropCaps() {
    process.initgroups('thingengine', 'thingengine');
    process.setgid('thingengine');
    process.setuid('thingengine');
}

function checkLocalStateDir() {
    fs.mkdirSync(_writabledir);
    fs.chownSync(_writabledir, 'thingengine', 'thingengine');
    fs.chmodSync(_writabledir, 0700);
}

module.exports = {
    // Initialize the platform code
    // Will be called before instantiating the engine
    init: function(test) {
        if (test) {
            _writabledir = process.cwd();
        } else {
            _writabledir = Config.LOCALSTATEDIR;
            checkLocalStateDir();
            dropCaps();
        }
        try {
            fs.mkdirSync(_writabledir + '/cache');
        } catch(e) {
            if (e.code != 'EEXIST')
                throw e;
        }

        _prefs = new prefs.FilePreferences(_writabledir + '/prefs.db');

        return sql.ensureSchema(_writabledir + '/sqlite.db',
                                'schema.sql');
    },

    type: 'server',

    // If downloading code from the thingpedia server is allowed on
    // this platform
    canDownloadCode: true,

    // Check if this platform has the required capability
    // (eg. long running, big storage, reliable connectivity, server
    // connectivity, stable IP, local device discovery, bluetooth, etc.)
    //
    // Which capabilities are available affects which apps are allowed to run
    hasCapability: function(cap) {
        return false;
    },

    // Obtain a shared preference store
    // Preferences are simple key/value store which is shared across all apps
    // but private to this instance (tier) of the platform
    // Preferences should be normally used only by the engine code, and a persistent
    // shared store such as DataVault should be used by regular apps
    getSharedPreferences: function() {
        return _prefs;
    },

    // Get the root of the application
    // (In android, this is the virtual root of the APK)
    getRoot: function() {
        return process.cwd();
    },

    // Get a directory that is guaranteed to be writable
    // (in the private data space for Android, in /var/lib for server)
    getWritableDir: function() {
        return _writabledir;
    },

    // Get a directory good for long term caching of code
    // and metadata
    getCacheDir: function() {
        return _writabledir + '/cache';
    },

    // Get a temporary directory
    // Also guaranteed to be writable, but not guaranteed
    // to persist across reboots or for long times
    // (ie, it could be periodically cleaned by the system)
    getTmpDir: function() {
        return os.tmpdir() + '/thingengine';
    },

    // Get the filename of the sqlite database
    getSqliteDB: function() {
        return _writabledir + '/sqlite.db';
    },

    // Stop the main loop and exit
    // (In Android, this only stops the node.js thread)
    // This function should be called by the platform integration
    // code, after stopping the engine
    exit: function() {
        return process.exit();
    },

    // Change the auth token
    // Returns true if a change actually occurred, false if the change
    // was rejected
    setAuthToken: function(authToken) {
        var oldAuthToken = _prefs.get('auth-token');
        if (oldAuthToken !== undefined && authToken !== oldAuthToken)
            return false;
        _prefs.set('auth-token', authToken);
        return true;
    },

    // For internal use only
    _setFrontend: function(frontend) {
        _frontend = frontend;
    },

    _getPrivateFeature: function(name) {
        switch(name) {
        case 'frontend-express':
            return _frontend.getApp();
        default:
            throw new Error('Invalid private feature name (what are you trying to do?)');
        }
    },

};
