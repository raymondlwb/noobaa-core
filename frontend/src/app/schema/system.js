/* Copyright (C) 2016 NooBaa */

export default {
    type: 'object',
    required: [
        'ipAddress',
        'version',
        'maintenanceMode',
        'vmTools',
        'p2pSettings'
    ],
    properties: {
        version: {
            type: 'string'
        },
        ipAddress: {
            type: 'string'
        },
        dnsName: {
            type: 'string'
        },
        sslCert: {
            type: 'object'
        },
        upgrade: {
            type: 'object',
            properties: {
                lastUpgrade: {
                    type: 'object',
                    required: [
                        'time',
                        'initiator'
                    ],
                    properties: {
                        time: {
                            type: 'integer'
                        },
                        initiator: {
                            type: 'string'
                        }
                    }
                },
                preconditionFailure:  {
                    type: 'string',
                    enum: [
                        'NOT_ALL_MEMBERS_UP',
                        'NOT_ENOUGH_SPACE',
                        'VERSION_MISMATCH'
                    ]
                }
            }
        },
        releaseNotes: {
            type: 'object',
            additionalProperties: {
                type: 'object',
                required: [
                    'fetching'
                ],
                properties: {
                    fetching: {
                        type: 'boolean'
                    },
                    error: {
                        type: 'boolean'
                    },
                    text: {
                        type: 'string'
                    }
                }
            }
        },
        remoteSyslog: {
            type: 'object',
            required: [
                'protocol',
                'address',
                'port'
            ],
            properties: {
                protocol: {
                    type: 'string'
                },
                address: {
                    type: 'string'
                },
                port: {
                    $ref: '#/def/common/port'
                }
            }
        },
        maintenanceMode: {
            type: 'object',
            required: [
                'till'
            ],
            properties: {
                till: {
                    type: 'integer'
                }
            }
        },
        vmTools: {
            type: 'string',
            enum: [
                'NOT_INSTALLED',
                'INSTALLING',
                'INSTALLED'
            ]
        },
        p2pSettings: {
            type: 'object',
            required: [
                'tcpPortRange'
            ],
            properties: {
                tcpPortRange: {
                    type: 'object',
                    required: [
                        'start',
                        'end'
                    ],
                    properties: {
                        start: {
                            type: 'integer',
                            min: 1,
                            max: 65536
                        },
                        end: {
                            type: 'integer',
                            min: 1,
                            max: 65536
                        }
                    }
                }
            }
        }
    }
};
