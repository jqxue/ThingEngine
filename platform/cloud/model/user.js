// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const db = require('../util/db');
const Q = require('q');

function create(client, user) {
    var KEYS = ['username', 'human_name', 'google_id', 'facebook_id', 'password', 'salt', 'cloud_id', 'auth_token'];
    KEYS.forEach(function(key) {
        if (user[key] === undefined)
            user[key] = null;
    });
    var vals = KEYS.map(function(key) {
        return user[key];
    });
    var marks = KEYS.map(function() { return '?'; });

    return db.insertOne(client, 'insert into users(' + KEYS.join(',') + ') '
                        + 'values (' + marks.join(',') + ')', vals).then(function(id) {
                            user.id = id;
                            return user;
                        });
}

module.exports = {
    get: function(client, id) {
        return db.selectOne(client, "select * from users where id = ?", [id]);
    },

    getByName: function(client, username) {
        return db.selectAll(client, "select * from users where username = ?", [username]);
    },

    getByGoogleAccount: function(client, googleId) {
        return db.selectAll(client, "select * from users where google_id = ?", [googleId]);
    },

    getByFacebookAccount: function(client, facebookId) {
        return db.selectAll(client, "select * from users where facebook_id = ?", [facebookId]);
    },

    create: create,

    getAll: function(client) {
        return db.selectAll(client, "select * from users");
    },
}
