/* Copyright (C) 2016 NooBaa */

import * as model from 'model';
import { api } from 'services';
import config from 'config';
import { makeArray } from 'utils/core-utils';
import { execInOrder } from 'utils/promise-utils';
import { realizeUri, downloadFile } from 'utils/browser-utils';

// Action dispathers from refactored code.
import { action$ } from 'state';
import {
    fetchSystemInfo,
    showNotification,
    requestLocation
} from 'action-creators';

// Use preconfigured hostname or the addrcess of the serving computer.
const endpoint = window.location.hostname;

// -----------------------------------------------------
// Utility function to log actions.
// -----------------------------------------------------
const prefix = 'ACTION DISPATHCED';

function logAction(action, payload) {
    if (typeof payload !== 'undefined') {
        console.info(`${prefix} ${action} with`, payload);
    } else {
        console.info(`${prefix} ${action}`);
    }
}

// -----------------------------------------------------
// Navigation actions
// -----------------------------------------------------
export function redirectTo(route = model.routeContext().pathname, params = {}, query = {}) {
    logAction('redirectTo', { route, params, query });

    const uri = realizeUri(route, Object.assign({}, model.routeContext().params, params), query);
    action$.next(requestLocation(uri, true));
}

// -----------------------------------------------------
// Information retrieval actions.
// -----------------------------------------------------
export async function loadServerInfo(testPhonehomeConnectvity) {
    logAction('loadServerInfo', { testPhonehomeConnectvity });

    const { serverInfo } = model;
    serverInfo(null);

    const { has_accounts } = await api.account.accounts_status();
    if (has_accounts) {
        try {
            const res = await fetch('/oauth/authorize', {
                method: 'HEAD',
                redirect: 'manual'
            });

            serverInfo({
                initialized: true,
                supportOAuth:
                    res.type === 'opaqueredirect' &&
                    res.status === 0
            });

        } catch (err) {
            serverInfo({
                initialized: true,
                supportOAuth: false
            });
        }

    } else {
        const config = await api.cluster_server.read_server_config({
            test_ph_connectivity: testPhonehomeConnectvity
        });

        serverInfo({
            initialized: false,
            address: endpoint,
            config: config
        });
    }
}

// -----------------------------------------------------
// Managment actions.
// -----------------------------------------------------

export function testNode(source, testSet) {
    logAction('testNode', { source, testSet });

    const regexp = /=>(\w{3}):\/\/\[?([.:0-9a-fA-F]+)\]?:(\d+)$/;
    const { nodeTestInfo } = model;

    nodeTestInfo({
        source: source,
        tests: testSet,
        timestamp: Date.now(),
        results: [],
        state:'IN_PROGRESS'
    });

    const { targetCount, testSettings } = config.nodeTest;
    api.node.get_test_nodes({
        count: targetCount,
        source: source
    })
        .then(
            // Aggregate selected tests.
            targets => [].concat(
                ...testSet.map(
                    testType => targets.map(
                        ({ name, rpc_address }) => {
                            const result = {
                                testType: testType,
                                targetName: name,
                                targetAddress: rpc_address,
                                targetIp: '',
                                targetPort: '',
                                protocol: '',
                                state: 'WAITING',
                                time: 0,
                                position: 0,
                                speed: 0,
                                progress: 0
                            };
                            nodeTestInfo().results.push(result);

                            return {
                                testType: testType,
                                source: source,
                                target: rpc_address,
                                result: result
                            };
                        }
                    )
                )
            )
        )
        .then(
            // Execute the tests in order.
            tests => execInOrder(
                tests,
                ({ source, target, testType, result }) => {
                    if (nodeTestInfo().state === 'ABORTING') {
                        result.state = 'ABORTED';
                        nodeTestInfo.valueHasMutated();
                        return;
                    }

                    const { stepCount, requestLength, responseLength, count, concur } = testSettings[testType];
                    const stepSize = count * (requestLength + responseLength);
                    const totalTestSize = stepSize * stepCount;

                    // Create a step list for the test.
                    const steps = makeArray(
                        stepCount,
                        {
                            source: source,
                            target: target,
                            request_length: requestLength,
                            response_length: responseLength,
                            count: count,
                            concur: concur
                        }
                    );

                    // Set start time.
                    const start = Date.now();
                    result.state = 'RUNNING';

                    // Execute the steps in order.
                    return execInOrder(
                        steps,
                        stepRequest => {
                            if (nodeTestInfo().state === 'ABORTING'){
                                return true;
                            }

                            return api.node.test_node_network(stepRequest)
                                .then(
                                    ({ session }) => {
                                        const [,protocol, ip, port] = session.match(regexp);
                                        result.protocol = protocol;
                                        result.targetIp = ip.replace('::ffff:','');
                                        result.targetPort = port;
                                        result.time = Date.now() - start;
                                        result.position = result.position + stepSize;
                                        result.speed = result.position / result.time;
                                        result.progress = totalTestSize > 0 ?
                                            result.position / totalTestSize :
                                            1;

                                        // Notify subscribers on the change.
                                        nodeTestInfo.valueHasMutated();
                                    }
                                );
                        }
                    )
                        .then(
                            res => res === true ? 'ABORTED' : 'COMPLETED',
                            () => 'FAILED'
                        )
                        .then(
                            state => {
                            // Notify subscribers on the change.
                                result.state = state;
                                nodeTestInfo.valueHasMutated();
                            }
                        );
                }
            )
        )
        .then(
            () => {
                if (nodeTestInfo().state === 'ABORTING') {
                    nodeTestInfo(null);
                } else {
                    nodeTestInfo.assign({
                        state: 'COMPLETED'
                    });
                }
            }
        )
        .done();
}

export function abortNodeTest() {
    logAction('abortNodeTest');

    const nodeTestInfo = model.nodeTestInfo;
    if (nodeTestInfo().state === 'IN_PROGRESS') {
        nodeTestInfo.assign({
            state: 'ABORTING'
        });
    }
}

export function downloadServerDiagnosticPack(secret, hostname) {
    logAction('downloadServerDiagnosticPack', { secret, hostname });

    const name = `${hostname}-${secret}`;
    const key = `server:${secret}`;
    if (model.collectDiagnosticsState[key]) {
        return;
    }

    model.collectDiagnosticsState.assign({ [key]: true });
    api.cluster_server.diagnose_system({
        target_secret: secret
    })
        .catch(
            err => {
                notify(`Packing server diagnostic file for ${name} failed`, 'error');
                model.collectDiagnosticsState.assign({ [key]: false });
                throw err;
            }
        )
        .then(
            url => {
                downloadFile(url);
                model.collectDiagnosticsState.assign({ [key]: false });
            }
        )
        .done();
}

export function setServerDebugLevel(secret, hostname, level){
    logAction('setServerDebugLevel', { secret, hostname, level });

    const name = `${hostname}-${secret}`;
    api.cluster_server.set_debug_level({
        target_secret: secret,
        level: level
    })
        .then(
            () => notify(
                `Debug mode was turned ${level === 0 ? 'off' : 'on'} for server ${name}`,
                'success'
            ),
            () => notify(
                `Could not turn ${level === 0 ? 'off' : 'on'} debug mode for server ${name}`,
                'error'
            )
        )
        .then(() => action$.next(fetchSystemInfo()))
        .done();
}

export function notify(message, severity = 'info') {
    action$.next(showNotification(message, severity));
}

export function registerForAlerts() {
    logAction('registerForAlerts');
    api.redirector.register_for_alerts();
}
