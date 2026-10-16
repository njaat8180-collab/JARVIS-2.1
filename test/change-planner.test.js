const test = require('node:test');
const assert = require('node:assert/strict');
const { createChangePlan } = require('../src/system/changePlanner');

test('change planner never performs the requested mutation', () => {
    const plan = createChangePlan({ from: 'whisper', to: 'vosk', request: 'replace whisper with vosk' });
    assert.equal(plan.success, true);
    assert.equal(plan.status, 'PLAN_ONLY');
    assert.equal(plan.approvalRequired, true);
    assert.equal(plan.cleanupApprovalRequired, true);
    assert.equal(plan.rollbackRequired, true);
});
