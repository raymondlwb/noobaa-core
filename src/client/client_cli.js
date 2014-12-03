/* jshint node:true */
'use strict';

var _ = require('lodash');
var Q = require('q');
var fs = require('fs');
var os = require('os');
var http = require('http');
var path = require('path');
var util = require('util');
var repl = require('repl');
var assert = require('assert');
var crypto = require('crypto');
var mkdirp = require('mkdirp');
var argv = require('minimist')(process.argv);
var BlockStream = require('block-stream');
var Semaphore = require('noobaa-util/semaphore');
var size_utils = require('../util/size_utils');
var api = require('../api');
var client_streamer = require('./client_streamer');

Q.longStackSupport = true;


/**
 *
 * ClientCLI
 *
 */
function ClientCLI(params) {
    var self = this;
    self.params = _.defaults(params, {
        address: 'http://localhost:5001',
        streamer: 5005,
        email: 'a@a.a',
        password: 'aaa',
        system: 'sys',
        tier: 'edge',
        bucket: 'bucket',
    });
    self.client = new api.Client();
    self.client.options.set_address(self.params.address);
}


/**
 *
 * INIT
 *
 *
 *
 */
ClientCLI.prototype.init = function() {
    var self = this;

    return Q.fcall(function() {
            if (self.params.setup) {
                return self.client.setup(self.params);
            }
        })
        .then(function() {
            return self.load();
        });
};



/**
 *
 * LOAD
 *
 */
ClientCLI.prototype.load = function() {
    var self = this;

    return Q.fcall(function() {
            var auth_params = _.pick(self.params,
                'email', 'password', 'system', 'role');
            if (self.params.bucket) {
                auth_params.extra = {
                    bucket: self.params.bucket
                };
            }
            console.log('create auth', auth_params);
            return self.client.create_auth_token(auth_params);
        })
        .then(function() {
            return client_streamer(self.client, self.params.streamer);
        })
        .then(function(streamer) {
            self.streamer = streamer;
        });
};



/**
 *
 * UPLOAD
 *
 * create new node agent
 *
 */
ClientCLI.prototype.upload = function(file_path) {
    var self = this;
    var key = file_path + '-' + Date.now();

    return Q.fcall(function() {
            return Q.nfcall(fs.stat, file_path);
        })
        .then(function(stats) {
            return self.client.object.create_multipart_upload({
                bucket: self.params.bucket,
                key: key,
                size: stats.size,
            });
        })
        .then(function() {
            return Q.Promise(function(resolve, reject) {
                fs.createReadStream(file_path)
                    .pipe(new BlockStream(size_utils.MEGABYTE, {
                        nopad: true
                    }))
                    .pipe(self.client.object.open_write_stream({
                        bucket: self.params.bucket,
                        key: key,
                    }).once('error', function(err) {
                        reject(err);
                    }).once('finish', function() {
                        resolve();
                    }));
            });
        })
        .then(function() {
            return self.client.object.complete_multipart_upload({
                bucket: self.params.bucket,
                key: key,
            });
        })
        .then(function(res) {
            console.log('uploaded', file_path);
            return res;
        }, function(err) {
            console.error('create failed', file_path, err, err.stack);
            throw err;
        });
};


/**
 *
 * DOWNLOAD
 *
 * download object by key and save to local file
 *
 */
ClientCLI.prototype.download = function(key) {
    var self = this;

    return Q.fcall(function() {
            // ...
        })
        .then(function() {
            // ...
        });
};



/**
 *
 * DELETE
 *
 * delete object by key
 *
 */
ClientCLI.prototype.delete = function(key) {
    var self = this;

    return Q.fcall(function() {
            // ...
        })
        .then(function() {
            // ...
        });
};


/**
 *
 * LIST
 *
 * list objects in bucket
 *
 */
ClientCLI.prototype.list = function(key) {
    var self = this;

    return Q.fcall(function() {
            return self.client.object.list_objects({
                bucket: self.params.bucket
            });
        })
        .then(function(res) {
            console.log('objects in bucket', self.params.bucket, ':');
            var i = 1;
            _.each(res.objects, function(obj) {
                console.log('#' + i, obj.key, '\t', obj.info.size, 'bytes');
                i++;
            });
        });
};




function main() {
    var cli = new ClientCLI(argv);
    cli.init().done(function() {
        // start a Read-Eval-Print-Loop
        var repl_srv = repl.start({
            prompt: 'client-cli > '
        });
        var help = 'try typing "nb." and then TAB ...';
        repl_srv.context.help = help;
        repl_srv.context.nb = cli;
    });
}

if (require.main === module) {
    main();
}
