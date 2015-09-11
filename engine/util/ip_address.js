// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const Q = require('q');
const os = require('os');
const dns = require('dns');
const ip = require('ip');

function getPublicIP() {
    // try the ipv4 address first, then the ipv6, then
    // fallback on ipv4 if both are private

    var ipv4 = ip.address('public', 'ipv4');
    if (!ip.isPrivate(ipv4))
        return ipv4;

    var ipv6 = ip.address('public', 'ipv6');
    if (!ip.isPrivate(ipv6))
        return ipv6;
}

module.exports = {
    getServerName: function() {
        // first check if the hostname resolves to a public routable IP
        // if so, we return that because it's likely to be human readable
        var hostname = os.hostname();
        return Q.all([Q.nfcall(dns.resolve4, hostname), Q.nfcall(dns.resolve6, hostname)]).spread(function(resolved4, resolved6) {
            // in a well configured system, the hostname *always* resolves to something
            // but that something might be 127.0.0.1 or another private IP
            var public4 = resolve4.filter(function(a) { return !ip.isPrivate(a); });
            var public6 = resolve6.filter(function(a) { return !ip.isPrivate(a); });
            if (public4.length > 0 || public6.length > 0)
                return hostname;

            return getPublicIP();
        }).catch(function(e) {
            // ignore dns resolution errors
            return getPublicIP();
        });
    },

    getServerAddresses: function(host) {
        var ifaces = os.networkInterfaces();
        var addresses = [];
        for (var iface in ifaces) {
            ifaces[iface].forEach(function(_if) {
                addresses.push(_if.address);
            });
        }
        return addresses.filter(function(a) { return !ip.isLoopback(a) &&
                                              a !== host &&
                                              a !== host; });
    },
};
