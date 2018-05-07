/* Copyright (C) 2016 NooBaa */

import template from './resource-overview.html';
import hostPoolsTemplate from './host-pools.html';
import cloudResourcesTemplate from './cloud-resources.html';
import internalResourcesTemplate from './internal-resources.html';
import Observer from 'observer';
import { stringifyAmount} from 'utils/string-utils';
import { realizeUri } from 'utils/browser-utils';
import { deepFreeze, keyByProperty, sumBy, assignWith, groupBy, mapValues } from 'utils/core-utils';
import { summrizeHostModeCounters } from 'utils/host-utils';
import { sumSize, formatSize } from 'utils/size-utils';
import { aggregateStorage } from 'utils/storage-utils';
import * as routes from 'routes';
import { state$, action$ } from 'state';
import { requestLocation, openInstallNodesModal, openAddCloudResrouceModal } from 'action-creators';
import ko from 'knockout';
import style from 'style';
import numeral from 'numeral';
import { getMany } from 'rx-extensions';

const resourceTypes = deepFreeze([
    {
        label: 'Pools',
        value: 'HOST_POOLS',
        template: hostPoolsTemplate
    },
    {
        label: 'Cloud',
        value: 'CLOUD_RESOURCES',
        template: cloudResourcesTemplate
    },
    {
        label: 'Internal',
        value: 'INTERNAL_RESOURCES',
        template: internalResourcesTemplate
    }
]);

const hostPoolTooltip = 'Nodes pool is a group of nodes that can be used for NooBaa\'s bucket data placement policy.';
const hostStorageTooltip = 'This number is calculated from the total capacity of all installed nodes in the system regardless to current usage or availability';
const cloudTooltip = 'Cloud resource can be an Azure blob storage, AWS bucket or any S3 compatible service and can be used for NooBaa\'s bucket data placement policy';
const cloudStorageTooltip = 'This number is an estimated aggregation of all public cloud resources connected to the system. Any cloud resource is defined as 1PB of raw storage';
const internalTooltip = 'Internal storage is a resource which resides on the local VM’s disks.  It can only be used for spilled-over data from buckets';

class ResourceOverviewViewModel extends Observer {
    constructor() {
        super();

        this.resourceTypes = resourceTypes;
        this.templates = keyByProperty(resourceTypes, 'value', meta => meta.template);
        this.pathname = '';
        this.resourcesLoaded = ko.observable();
        this.resourcesLinkText = ko.observable();
        this.resourcesLinkHref = ko.observable();
        this.selectedResourceType = ko.observable();

        // Host pools observables
        this.hostPoolTooltip = hostPoolTooltip;
        this.hostStorageTooltip= hostStorageTooltip;
        this.poolCount = ko.observable();
        this.hostCount = ko.observable();
        this.poolsCapacity = ko.observable();
        this.hostCountFormatter = nodes => stringifyAmount('node', nodes);
        this.hostCounters = [
            {
                label: 'Healthy',
                color: style['color12'],
                value: ko.observable(),
                tooltip: 'The number of fully operative storage nodes that can be used as a storage target for NooBaa'
            },
            {
                label: 'Issues',
                color: style['color11'],
                value: ko.observable(),
                tooltip: 'The number of storage nodes that are partially operative due to a current process or low spec'
            },
            {
                label: 'Offline',
                color: style['color10'],
                value: ko.observable(),
                tooltip: 'The number of storage nodes that are currently not operative and are not considered as part of NooBaa’s available storage'
            }
        ];

        // Cloud resources observables
        this.cloudTooltip = cloudTooltip;
        this.cloudStorageTooltip = cloudStorageTooltip;
        this.cloudResourceCount = ko.observable();
        this.cloudServiceCount = ko.observable();
        this.cloudCapacity = ko.observable();
        this.cloudCounters = [
            {
                label: 'AWS S3',
                color: style['color8'],
                value: ko.observable(),
                tooltip: 'AWS S3 cloud resources that were created in this system'
            },
            {
                label: 'Azure blob',
                color: style['color16'],
                value: ko.observable(),
                tooltip: 'Azure blob cloud resources that were created in this system'
            },
            {
                label: 'Google Cloud',
                color: style['color7'],
                value: ko.observable(),
                tooltip: 'Google cloud resources that were created in this system'
            },
            {
                label: 'S3 compatible',
                color: style['color6'],
                value: ko.observable(),
                tooltip: 'Any S3 compatible cloud resources that were created in this system'
            }
        ];


        // Internal resources observables
        this.internalTooltip = internalTooltip;
        this.internalResourceUsage = ko.observable();
        this.internalCounters = [
            {
                label: 'Available',
                color: style['color18'],
                value: ko.observable(),
                tooltip: 'The available storage from the internal resource which resides on the local VM’s disks'
            },
            {
                label: 'Used for spillover',
                color: style['color8'],
                value: ko.observable(),
                tooltip: 'The total amount of data uploaded to the internal resource'
            }
        ];

        this.observe(
            state$.pipe(
                getMany(
                    'location',
                    'hostPools',
                    'cloudResources',
                    'internalResources',
                    'buckets'
                )
            ),
            this.onState
        );

    }

    onState([ location, hostPools, cloudResources, internalResources, buckets ]) {
        if (!hostPools || !cloudResources, !internalResources) {
            this.resourcesLoaded(false);
            return;
        }

        const { pathname, params } = location;
        const { selectedResourceType = resourceTypes[0].value } = location.query;
        const resourceCount = sumBy(
            [ hostPools, cloudResources, internalResources ],
            collection => Object.keys(collection).length
        );
        const resourcesLinkText = stringifyAmount('resource', resourceCount);
        const resourcesLinkHref = realizeUri(routes.resources, { system: params.system });

        this.pathname = pathname;
        this.baseQuery = location.query;
        this.resourcesLoaded(true);
        this.selectedResourceType(selectedResourceType);
        this.resourcesLinkText(resourcesLinkText);
        this.resourcesLinkHref(resourcesLinkHref);

        // Host pools:
        if (selectedResourceType === 'HOST_POOLS') {
            const poolList = Object.values(hostPools);
            const aggregate = assignWith(
                {},
                ...poolList.map(pool => pool.hostsByMode),
                (sum = 0, count) =>  sum + count
            );
            const hostCounters  = summrizeHostModeCounters(aggregate);
            const poolsCapacity = sumSize(
                ...poolList.map(pool => pool.storage.total)
            );

            this.poolCount(numeral(poolList.length).format('0,0'));
            this.hostCount(numeral(hostCounters.all).format('0,0'));
            this.hostCounters[0].value(hostCounters.healthy);
            this.hostCounters[1].value(hostCounters.hasIssues);
            this.hostCounters[2].value(hostCounters.offline);
            this.poolsCapacity(formatSize(poolsCapacity));
        }

        // Cloud resources
        if (selectedResourceType === 'CLOUD_RESOURCES') {
            const resourceList = Object.values(cloudResources);
            const { AWS = 0, AZURE = 0, GOOGLE = 0, S3_COMPATIBLE = 0 } = mapValues(
                groupBy(resourceList, resource => resource.type),
                resources => resources.length
            );
            const serviceCount = sumBy([AWS, AZURE, GOOGLE, S3_COMPATIBLE], Boolean);
            const cloudCapacity = sumSize(
                ...resourceList.map(resource => resource.storage.total)
            );

            this.cloudResourceCount(numeral(resourceList.length).format('0,0'));
            this.cloudServiceCount(numeral(serviceCount).format('0,0'));
            this.cloudCounters[0].value(AWS);
            this.cloudCounters[1].value(AZURE);
            this.cloudCounters[2].value(GOOGLE);
            this.cloudCounters[3].value(S3_COMPATIBLE);
            this.cloudCapacity(formatSize(cloudCapacity));
        }

        if (selectedResourceType === 'INTERNAL_RESOURCES') {
            const resourceList = Object.values(internalResources);
            const bucketsUsingSpillover = Object.values(buckets)
                .filter(bucket => Boolean(bucket.spillover))
                .length;
            const usage = bucketsUsingSpillover ?
                `Used by ${stringifyAmount('bucket', bucketsUsingSpillover)}` :
                'Not in use by any bucket';
            const aggregated = aggregateStorage(
                ...resourceList.map(resource => resource.storage)
            );

            this.internalResourceUsage(usage);
            this.internalCounters[0].value(aggregated.free);
            this.internalCounters[1].value(aggregated.used);
        }
    }

    onSelectResourceType(type) {
        const query = { ...this.baseQuery, selectedResourceType: type };
        const uri = realizeUri(this.pathname, {}, query);
        action$.next(requestLocation(uri, true));
    }

    onInstallNodes() {
        action$.next(openInstallNodesModal());
    }

    onAddCloudResource() {
        action$.next(openAddCloudResrouceModal());
    }
}

export default {
    viewModel: ResourceOverviewViewModel,
    template: template
};
