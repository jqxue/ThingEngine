// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const events = require('events');
const lang = require('lang');

const BaseChannel = require('./base_channel');
const BaseDevice = require('./base_device');

// naming: proxy is the side that requested the channel, stub is the
// side that has the implementation and is forwarding the data

const ProxyChannel = new lang.Class({
    Name: 'ProxyChannel',
    Extends: BaseChannel,

    _init: function(proxyManager, targetTier, targetChannelId, cachedArgs, isSource, isSink) {
        this.parent();
        this.uniqueId = targetChannelId;
        this.targetTier = targetTier;
        this._cachedArgs = cachedArgs;

        this._proxyManager = proxyManager;
        this._isSource = isSource;
        this._isSink = isSink;
    },

    get isSource() {
        return this._isSource;
    },

    get isSink() {
        return this._isSink;
    },

    _doOpen: function() {
        // open is immediate and proceeds asynchronously, because we cache data locally anyway
        this._proxyManager.requestProxyChannel(this, this._cachedArgs).done();
        return Q();
    },

    _doClose: function() {
        this._proxyManager.releaseProxyChannel(this).done();
        return Q();
    },

    sendEvent: function(data) {
        this._proxyManager.sendSinkEvent(this.targetTier, this.uniqueId, data);
    }
});

const ChannelStub = new lang.Class({
    Name: 'ChannelStub',

    _init: function(proxyManager, targetTier, innerChannel) {
        this._proxyManager = proxyManager;
        this._targetTier = targetTier;
        this._innerChannel = innerChannel;
        this._listener = null;
    },

    // called when the inner channel produced some data, we want to send it
    // back to whoever asked for us
    _handleEvent: function(data) {
        this._proxyManager.sendSourceEvent(this._targetTier, this._innerChannel.uniqueId, data);
    },

    // called when whoever asked for us is requesting to push some data into
    // the channel
    sendEvent: function(data) {
        this._innerChannel.sendEvent(data);
    },

    open: function() {
        this._listener = this._handleEvent.bind(this);
        this._innerChannel.on('event', this._listener);

        return this._innerChannel.open();
    },

    close: function() {
        this._innerChannel.removeListener('event', this._listener);
        return this._innerChannel.close();
    },
});

module.exports = new lang.Class({
    Name: 'ProxyManager',

    _init: function(tierManager, channels, devices) {
        this._channels = channels;
        this._tierManager = tierManager;
        this._devices = devices;

        this._proxies = {};
        this._requests = {};
        this._stubs = {};

        this._tierManager.registerHandler('proxy', this._handleMessage.bind(this));
        this._tierManager.on('connected', this._onConnected.bind(this));
    },

    // if we reestablish a connection, send all subscription requests we have
    _onConnected: function(tier) {
        console.log(tier + ' is back online, flushing proxy channel requests');
        for (var fullId in this._requests) {
            if (this._requests[fullId].targetTier === tier)
                this._sendChannelRequest(this._requests[fullId]);
        }
    },

    _handleMessage: function(fromTier, msg) {
        switch (msg.op) {
        case 'request-channel':
            this._requestChannel(fromTier, msg.channelId, msg.args);
            return;
        case 'release-channel':
            this._releaseChannel(fromTier, msg.channelId);
            return;
        case 'channel-request-complete':
            this._channelReady(fromTier, msg.channelId, msg.result);
            return;
        case 'channel-source-data':
            this._channelSourceData(fromTier, msg.channelId, msg.data);
            return;
        case 'channel-sink-data':
            this._channelSinkData(fromTier, msg.channelId, msg.data);
            return;
        default:
            console.log('Invalid proxy op ' + msg.op);
        }
    },

    _sendMessage: function(targetTier, msg) {
        // target the proxy manager of the remote tier
        msg.target = 'proxy';
        this._tierManager.sendTo(targetTier, msg);
    },

    sendSourceEvent: function(targetTier, targetChannelId, data) {
        this._sendMessage(targetTier, {op:'channel-source-data', channelId: targetChannelId,data:data});
    },

    sendSinkEvent: function(targetTier, targetChannelId, data) {
        this._sendMessage(targetTier, {op:'channel-sink-data', channelId: targetChannelId,data:data});
    },

    getProxyChannel: function(forChannel, targetTier, args) {
        var targetChannelId = forChannel.uniqueId;
        var fullId = targetChannelId + '-' + targetTier;

        if (fullId in this._proxies)
            return this._proxies[fullId];

        var proxy = new ProxyChannel(this, targetTier, targetChannelId, args,
                                     forChannel.isSource, forChannel.isSink);
        console.log('Created proxy channel ' + targetChannelId + ' targeting ' + targetTier);
        this._proxies[fullId] = proxy;
        return proxy;
    },

    requestProxyChannel: function(proxyChannel, cachedArgs) {
        var fullId = proxyChannel.uniqueId + '-' + proxyChannel.targetTier;

        // marshal args into something that we can send on the wire
        var marshalledArgs = cachedArgs.map(function(arg) {
            if (typeof arg === 'function')
                throw new Error('Cannot marshal a function');
            if (typeof arg !== 'object')
                return arg;
            if (arg === null)
                return arg;
            if (arg instanceof BaseDevice)
                return {class:'device',uniqueId:arg.uniqueId};

            throw new Error('Cannot marshal object ' + arg);
        });

        var request = {
            defer: Q.defer(),
            args: marshalledArgs,
            targetChannelId: proxyChannel.uniqueId,
            targetTier: proxyChannel.targetTier,
        };
        this._requests[fullId] = request;

        if (this._tierManager.isConnected(request.targetTier)) {
            console.log(request.targetTier + ' is connected, sending proxy'
                        + ' channel request now');
            this._sendChannelRequest(request);
        } else {
            console.log('Delaying proxy channel request until ' + request.targetTier
                        + ' is connected');
        }

        return this._requests[fullId].defer.promise;
    },

    _sendChannelRequest: function(request) {
        this._sendMessage(request.targetTier,
                          {op:'request-channel', channelId: request.targetChannelId,
                           args: request.args});
    },

    releaseProxyChannel: function(proxyChannel) {
        var fullId = proxyChannel.uniqueId + '-' + proxyChannel.targetTier;
        if (!(fullId in this._requests)) {
            console.error('Cannot release a channel that was not requested');
            return;
        }
        delete this._requests[fullId];

        this._sendMessage(proxyChannel.targetTier,
                          {op:'release-channel', channelId:
                           proxyChannel.uniqueId});
        return Q(true);
    },

    _replyChannel: function(targetTier, targetChannelId, result) {
        this._sendMessage(targetTier,
                          {op:'channel-request-complete',
                           channelId:targetChannelId,
                           result:result});
    },

    _requestChannel: function(fromTier, targetChannelId, marshalledArgs) {
        var fullId = targetChannelId + '-' + fromTier;

        if (fullId in this._stubs) {
            // No-op but no error
            // (can happen if the connection is flaky and one peer keeps
            // rerequesting channels)
            console.log('Duplicate channel request from ' + fromTier + ' for '
                       + targetChannelId);
            this._replyChannel(fromTier, targetChannelId, 'ok');
            return;
        }

        console.log('New remote channel request for ' + targetChannelId);

        var defer = Q.defer();
        this._stubs[fullId] = defer.promise;

        try {
            // marshal args into something that we can send on the wire
            var devices = this._devices;
            var args = [false].concat(marshalledArgs.map(function(arg) {
                if (typeof arg !== 'object')
                    return arg;
                if (arg === null)
                    return arg;
                if (arg.class === 'device')
                    return devices.getDevice(arg.uniqueId);
                throw new Error('Cannot unmarshal object of class ' + arg.class);
            }));

            this._channels._getChannelInternal.apply(this._channels, args).then(function(channel) {
                var stub = new ChannelStub(this, fromTier, channel);
                return stub.open().then(function() {
                    defer.resolve(stub);
                });
            }.bind(this)).then(function() {
                this._replyChannel(fromTier, targetChannelId, 'ok');
            }, function(e) {
                this._replyChannel(fromTier, targetChannelId, e.message);
            });
        } catch(e) {
            this._replyChannel(fromTier, targetChannelId, e.message);
        }
    },

    _releaseChannel: function(fromTier, targetChannelId) {
        var fullId = targetChannelId + '-' + fromTier;

        if (!(fullId in this._stubs)) {
            console.error('Channel ' + fullId + ' was not requested');
            return;
        }

        this._stubs[fullId].then(function(stub) {
            stub.close();
        });
        delete this._stubs[fullId];
    },

    _channelReady: function(fromTier, targetChannelId, result) {
        var fullId = targetChannelId + '-' + fromTier;

        if (!(fullId in this._requests)) {
            console.error('Invalid channel reply for ' + targetChannelId);
            return;
        }

        var request = this._requests[fullId];
        var defer = request.defer;
        if (result === 'ok')
            defer.resolve();
        else
            defer.reject(new Error(result));
    },

    _channelSourceData: function(fromTier, targetChannelId, data) {
        var fullId = targetChannelId + '-' + fromTier;

        if (!(fullId in this._proxies)) {
            console.error('Invalid data message from ' + targetChannelId);
            return;
        }

        var proxy = this._proxies[fullId];
        if (proxy.targetTier !== fromTier) {
            console.error('Message sender tier does not match expected for ' + proxy.uniqueId);
            return;
        }

        proxy.emitEvent(data);
    },

    _channelSinkData: function(fromTier, targetChannelId, data) {
        var fullId = targetChannelId + '-' + fromTier;

        if (!(fullId in this._stubs)) {
            console.error('Invalid data message for ' + targetChannelId);
            return;
        }

        this._stubs[fullId].then(function(stub) {
            stub.sendEvent(data);
        });
    }
});

