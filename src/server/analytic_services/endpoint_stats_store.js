/* Copyright (C) 2016 NooBaa */
'use strict';

const _ = require('lodash');
const P = require('../../util/promise');
const dbg = require('../../util/debug_module')(__filename);
const mongo_client = require('../../util/mongo_client');
const s3_usage_schema = require('./s3_usage_schema');
const usage_report_schema = require('./usage_report_schema');
const endpoint_group_report_schema = require('./endpoint_group_report_schema.js');
const { ENDPOINT_MONITOR_INTERVAL } = require('../../../config');

class EndpointStatsStore {
    static get instance() {
        if (!this._instance) {
            this._instance = new EndpointStatsStore();
        }
        return this._instance;
    }

    constructor() {
        this._s3_ops_counters = mongo_client.instance()
            .define_collection({
                name: 'objectstats',
                schema: s3_usage_schema,
                db_indexes: [{
                    fields: {
                        system: 1,
                    },
                    options: {
                        unique: true,
                    }
                }],
            });

       this._bandwidth_reports = mongo_client.instance()
           .define_collection({
                name: 'usagereports',
                schema: usage_report_schema,
                db_indexes: [{
                    fields: {
                        start_time: 1,
                        aggregated_time: -1,
                        aggregated_time_range: 1,
                    }
                }],
            });

        this._endpoint_group_reports = mongo_client.instance()
            .define_collection({
                name: 'endpointgroupreports',
                schema: endpoint_group_report_schema,
                db_indexes: [{
                    fields: {
                        start_time: 1,
                        aggregated_time: -1,
                        aggregated_time_range: 1,
                    }
                }]
            });
    }

    async accept_endpoint_report(system, report) {
        await Promise.all([
            this._update_s3_ops_counters(system, report),
            this._update_bandwidth_reports(system, report),
            this._update_endpoint_group_reports(system, report)
        ]);
    }

    //--------------------------------------------
    // S3 ops counters
    //--------------------------------------------

    async get_s3_ops_counters(system) {
        dbg.log1('get_s3_ops_counters');
        const res = await this._s3_ops_counters.col().findOne({ system: system._id });
        return _.pick(res, 's3_usage_info', 's3_errors_info');
    }

    async reset_s3_ops_counters(system) {
        dbg.log1('reset_s3_ops_counters');
        await this._s3_ops_counters.col().removeMany({ system: system._id });
    }

    async _update_s3_ops_counters(system, report) {
        const { usage = {}, errors = {} } = report.s3_ops;
        const selector = {
            system: system._id
        };
        const update = {
            $inc: {
                ..._.mapKeys(usage, (unused, key) => `s3_usage_info.${key}`),
                ..._.mapKeys(errors, (unused, key) => `s3_errors_info.${key}`)
            }
        };
        const options = {
            upsert: true,
            returnOriginal: false
        };

        const res = await this._s3_ops_counters.col()
            .findOneAndUpdate(selector, update, options);

        this._s3_ops_counters.validate(res.value, 'warn');
    }

    //--------------------------------------------
    // bandwidth reports
    //--------------------------------------------

    async get_bandwidth_reports(params) {
        dbg.log1('get_bandwidth_reports', params);
        const query = this._format_bandwidth_report_query(params);
        return this._bandwidth_reports.col()
            .find(query)
            .toArray();
    }

    async clean_bandwidth_reports(params) {
        dbg.log1('clean_bandwidth_reports', params);
        const query = this._format_bandwidth_report_query(params);
        return this._bandwidth_reports.col().removeMany(query);
    }

    async _format_bandwidth_report_query(params) {
        const { endpoint_groups, buckets, accounts, since, till } = params;
        const query = {};
        if (endpoint_groups) _.set(query, ['endpoint_group', '$in'], _.castArray(endpoint_groups));
        if (buckets) _.set(query, ['bucket', '$in'], _.castArray(buckets));
        if (accounts) _.set(query, ['account', '$in'], _.castArray(accounts));
        if (since) _.set(query, ['start_time', '$gte'], since);
        if (till) _.set(query, ['end_time', '$lte'], till);
        return query;
    }

    async _update_bandwidth_reports(system, report) {
        const start_time = Math.floor(report.timestamp / ENDPOINT_MONITOR_INTERVAL) * ENDPOINT_MONITOR_INTERVAL;
        const end_time = start_time + ENDPOINT_MONITOR_INTERVAL - 1;

        await P.map(report.bandwidth, async record => {
            const selector = {
                start_time,
                end_time,
                system: system._id,
                endpoint_group: report.endpoint_group,
                bucket: record.bucket,
                account: record.account
            };
            const update = {
                $inc: _.pick(record, [
                    'read_bytes',
                    'write_bytes',
                    'read_count',
                    'write_count'
                ])
            };
            const options = {
                upsert: true,
                returnOriginal: false
            };

            const res = await this._bandwidth_reports.col()
                .findOneAndUpdate(selector, update, options);

            this._bandwidth_reports.validate(res.value, 'warn');
        }, {
            concurrency: 10
        });
    }

    //--------------------------------------------
    // Endpoint Group Reports
    //--------------------------------------------

    async get_endpoint_group_reports(params) {
        dbg.log1('get_endpoint_group_reports', params);
        const query = this._format_endpoint_gorup_report_query(params);
        return this._endpoint_group_reports.col()
            .find(query)
            .toArray();
    }

    async clean_endpoint_group_reports(params) {
        dbg.log1('clean_endpoint_group_reports', params);
        const query = this._format_endpoint_gorup_report_query(params);
        return this._endpoint_group_reports.col().removeMany(query);
    }

    _format_endpoint_gorup_report_query(params) {
        const { groups, since, till} = params;
        const query = {};
        if (groups) _.set(query, ['group_name', '$in'], _.castArray(groups));
        if (since) _.set(query, ['start_time', '$gte'], since);
        if (till) _.set(query, ['end_time', '$lte'], till);
        return query;
    }

    async _update_endpoint_group_reports(system, report) {
        const start_time = Math.floor(report.timestamp / ENDPOINT_MONITOR_INTERVAL) * ENDPOINT_MONITOR_INTERVAL;
        const end_time = start_time + ENDPOINT_MONITOR_INTERVAL - 1;
        const selector = {
            start_time,
            end_time,
            system: system._id,
            group_name: report.endpoint_group,
        };
        const update = {
            $push: {
                endpoints: _.pick(report, [
                    'hostname',
                    'cpu',
                    'memory'
                ])
            }
        };
        const options = {
            upsert: true,
            returnOriginal: false
        };

        const res = await this._endpoint_group_reports.col()
            .findOneAndUpdate(selector, update, options);

        this._endpoint_group_reports.validate(res.value, 'warn');
    }
}

exports.EndpointStatsStore = EndpointStatsStore;
