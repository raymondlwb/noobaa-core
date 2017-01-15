import template from './resource-overview.html';
import BaseViewModel from 'base-view-model';
import style from 'style';
import { systemInfo } from 'model';
import ko from 'knockout';
import { deepFreeze } from 'utils/core-utils';
import { stringifyAmount} from 'utils/string-utils';

const coutners = deepFreeze({
    ALL: 0,
    NODES_POOL: 0,
    AWS: 0,
    AZURE: 0,
    S3_COMPATIBLE: 0
});

class ResourceOverviewViewModel extends BaseViewModel {
    constructor() {
        super();

        const resourceCounters = ko.pureComputed(
            () => (systemInfo() ? systemInfo().pools : [])
                .map(
                    pool =>  pool.nodes ? 'NODES_POOL' : pool.cloud_info.endpoint_type
                )
                .reduce(
                    (counters, type) => {
                        ++counters.ALL;
                        ++counters[type];
                        return counters;
                    },
                    Object.assign({}, coutners)
                )
        );

        this.resourceCount = ko.pureComputed(
            () => resourceCounters().ALL
        );

        this.resourcesLinkText = ko.pureComputed(
            () => stringifyAmount(
                'Resource',
                resourceCounters()['ALL'],
                'No'
            )
        );

        this.nodePoolsCount = ko.pureComputed(
            () => resourceCounters().NODES_POOL
        );

        this.awsResourceIcon = ko.pureComputed(
            () => resourceCounters().AWS === 0 ?
                'aws-s3-resource' :
                'aws-s3-resource-colored'
        );

        this.awsResourceCount = ko.pureComputed(
            () => resourceCounters().AWS
        );

        this.azureResourceIcon = ko.pureComputed(
            () => resourceCounters().AZURE === 0 ?
                'azure-resource' :
                'azure-resource-colored'
        );

        this.azureResourceCount = ko.pureComputed(
            () => resourceCounters().AZURE
        );

        this.genericResourceIcon = ko.pureComputed(
            () => resourceCounters().S3_COMPATIBLE === 0 ?
                'cloud-resource' :
                'cloud-resource-colored'
        );

        this.genericResourceCount = ko.pureComputed(
            () => resourceCounters().S3_COMPATIBLE
        );

        const onlineNodesCount = ko.pureComputed(
            () => systemInfo() ? systemInfo().nodes.online : 0
        );

        const offlineNodesCount = ko.pureComputed(
            () => {
                if (!systemInfo()) {
                    return 0;
                }

                const { count, online, has_issues } = systemInfo().nodes;
                return count - (online + has_issues);
            }
        );

        const nodesWithIssuesCount = ko.pureComputed(
            () => systemInfo() ? systemInfo().nodes.has_issues : 0
        );

        this.chartValues = [
            {
                label: 'Online',
                value: onlineNodesCount,
                color: style['color12']
            },
            {
                label: 'Has issues',
                value: nodesWithIssuesCount,
                color: style['color11']
            },
            {
                label: 'Offline',
                value: offlineNodesCount,
                color: style['color10']
            }
        ];

        this.systemCapacity = ko.pureComputed(
            () => systemInfo() && systemInfo().storage.total
        )
        .extend({
            tween: { useDiscreteValues: true, resetValue: 0 },
            formatSize: true
        });

        const nodeCount = ko.pureComputed(
            () => systemInfo() ? systemInfo().nodes.count : 0
        ).extend({
            tween: { useDiscreteValues: true, resetValue: 0 },
            formatNumber: true
        });

        this.nodeCountText = ko.pureComputed(
            () => `${nodeCount()} Nodes`
        );

        this.isInstallNodeModalVisible = ko.observable(false);

    }

    showInstallNodeModal() {
        this.isInstallNodeModalVisible(true);
    }

    hideInstallNodeModal() {
        this.isInstallNodeModalVisible(false);
    }
}

export default {
    viewModel: ResourceOverviewViewModel,
    template: template
};