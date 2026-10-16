const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createFileOperationsPlanner } = require('../src/system/fileOperationsPlanner');

test('downloads cleanup previews candidates and preserves launcher entries', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-downloads-'));
    await fs.writeFile(path.join(root, 'old.zip'), 'x');
    await fs.writeFile(path.join(root, 'SKLauncher.exe'), 'x');
    const planner = createFileOperationsPlanner({ metadataPath: path.join(root, 'labels.json'), allowedRoots: [root] });
    const result = await planner.downloadsCleanup({ folder: root });
    assert.equal(result.code, 'APPROVAL_REQUIRED');
    assert.equal(result.candidateCount, 1);
    assert.equal(result.preserved[0].name, 'SKLauncher.exe');
});

test('backup planner is plan-only', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-backup-'));
    const planner = createFileOperationsPlanner({ metadataPath: path.join(root, 'labels.json'), allowedRoots: [root] });
    const result = await planner.backupPlan({ source: root, destination: path.join(root, 'backup') });
    assert.equal(result.status, 'PLAN_ONLY');
    assert.equal(result.copyOnly, true);
});
