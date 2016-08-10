import template from './test-node-modal.html';
import TestRowViewModel from './test-row';
import Disposable from 'disposable';
import ko from 'knockout';
import { nodeTestInfo } from 'model';
import { testNode, abortNodeTest } from 'actions';
import { deepFreeze } from 'utils';
import moment from 'moment';

const testTypes = Object.freeze([
    {
        name: 'Full test',
        tests: ['connectivity', 'bandwidth']
    },
    {
        name: 'Connectivity',
        tests: ['connectivity']
    },
    {
        name: 'Bandwidth',
        tests: ['bandwidth']
    }
]);

const columns = deepFreeze([
    'test',
    'sourceNode',
    'targetNode',
    'time',
    'speed',
    'progress'
]);

class TestNodeModalViewModel extends Disposable {
    constructor({ nodeName, sourceRpcAddress, onClose }) {
        super();

        this.onClose = onClose;
        this.columns = columns;

        this.testTypeOptions = testTypes.map(
            ({ name, tests }) => {
                return { label: name, value: tests };
            }
        );

        this.nodeName = nodeName;
        this.sourceRpcAddress = sourceRpcAddress;
        this.selectedTests = ko.observable(testTypes[0].tests);

        this.results = ko.pureComputed(
            () => nodeTestInfo() && nodeTestInfo().results
        );

        this.lastTestTime = ko.pureComputed(
            () => nodeTestInfo() &&
                `( Last test results from: ${
                    moment(nodeTestInfo().timestemp).format('HH:mm:ss')
            } )`
        );

        this.testing = ko.pureComputed(
            () => !!nodeTestInfo() && nodeTestInfo().state === 'IN_PROGRESS'
        );

        this.summary = ko.pureComputed(
            () => this.results() && this._summarizeResults(this.results())
        );

        this.bandwidthSummary = ko.pureComputed(
            () => this._getTestSummary(this.results(), 'bandwidth')
        );

        this.closeBtnText = ko.pureComputed(
            () => this.testing() ? 'Run in background' : 'close'
        );
    }

    _summarizeResults(results) {
        return results.reduce(
            (summary, { state }) => {
                summary.inProcess += Number(state === 'RUNNING' || state === 'WAITING');
                summary.completed += Number(state === 'COMPLETED');
                summary.failed += Number(state === 'FAILED');
                summary.aborted += Number(state === 'ABORTED');
                return summary;
            }, {
                inProcess: 0,
                completed: 0,
                failed: 0,
                aborted: 0
            }
        );
    }

    createTestRow(test) {
        return new TestRowViewModel(this.nodeName, test);
    }

    runTest() {
        testNode(ko.unwrap(this.sourceRpcAddress), this.selectedTests());
    }

    abortTest() {
        abortNodeTest();
    }

    close() {
        this.onClose();
    }
}

export default {
    viewModel: TestNodeModalViewModel,
    template: template
};
