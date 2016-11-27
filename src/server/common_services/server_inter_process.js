/**
 *
 * Cluster Member
 *
 */
'use strict';

var mongo_ctrl = require('../utils/mongo_ctrl');
var P = require('../../util/promise');
var dotenv = require('../../util/dotenv');
var dbg = require('../../util/debug_module')(__filename);
const system_store = require('../system_services/system_store').get_instance();
const server_rpc = require('../server_rpc');


/**
 *
 */
function load_system_store(req) {
    return system_store.load().return();
}

function update_mongo_connection_string(req) {
    let old_url = process.env.MONGO_RS_URL || '';
    dotenv.load();
    dbg.log0('Recieved update mongo string. will update mongo url from', old_url, ' to ', process.env.MONGO_RS_URL);
    return P.resolve(mongo_ctrl.update_connection_string())
        .then(() => {
            if (req.rpc_params.skip_load_system_store === false) {
                load_system_store();
            }
        })
        .return();
}

function update_master_change(req) {
    let new_master_address = req.rpc_params.master_address;
    let old_master_address = server_rpc.rpc.router.master;
    // old_master_address is of the form ws://addr:port. check if new_master_address is differnet
    if (old_master_address.indexOf(new_master_address) === -1) {
        server_rpc.set_new_router({
            master_address: new_master_address
        });
    }
}


// EXPORTS
exports.load_system_store = load_system_store;
exports.update_mongo_connection_string = update_mongo_connection_string;
exports.update_master_change = update_master_change;
