const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function load(file, window = {}) { const source = fs.readFileSync(file, 'utf8'); const context = { console, localStorage: { data: new Map(), getItem(k) { return this.data.get(k) || null; }, setItem(k, v) { this.data.set(k, v); }, removeItem(k) { this.data.delete(k); } }, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } }, window }; window.localStorage = context.localStorage; window.dispatchEvent = window.dispatchEvent || (() => {}); vm.createContext(context); vm.runInContext(source, context); return context.window; }

test('permission profiles default to Safe and fail closed in Restricted mode', () => { const w = load('renderer/js/brain/permissionProfiles.js', {}); assert.equal(w.JARVISPermissionProfiles.get().key, 'SAFE'); assert.equal(w.JARVISPermissionProfiles.set('restricted').success, true); assert.equal(w.JARVISPermissionProfiles.allows('delete files'), false); });
test('mission audit log records bounded explainable events', () => { const w = load('renderer/js/brain/missionAuditLog.js', {}); const entry = w.JARVISMissionAudit.record({ type: 'workflow', state: 'completed', summary: 'Minecraft launch', confidence: 0.94 }); assert.equal(entry.summary, 'Minecraft launch'); assert.equal(w.JARVISMissionAudit.list(1).length, 1); });
