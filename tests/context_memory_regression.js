const assert = require('assert');
const { ConversationContextManager } = require('../renderer/js/context/ConversationContextManager.js');
const { PendingIntentManager } = require('../renderer/js/context/PendingIntentManager.js');
const { ReferenceResolver } = require('../renderer/js/context/ReferenceResolver.js');

const ctx = new ConversationContextManager();
ctx.setTopic('Mumbai, Maharashtra, India', { intent: 'WEATHER' });
ctx.setActiveIntent('WEATHER', { entities: { location: 'Mumbai' } });
assert.strictEqual(ctx.getTopic().subject, 'Mumbai, Maharashtra, India');

const pending = new PendingIntentManager(ctx);
pending.setPending({ intent:'WEATHER', skill:'data.weather', missingParameter:'city', prompt:'Kis city?', resolver: x => /^[A-Za-z .'-]{2,60}$/.test(String(x).trim()) ? String(x).trim() : null });
let r = pending.tryResolve('Delhi');
assert.equal(r.resolved, true);
assert.equal(r.parameters.city, 'Delhi');

ctx.setTopic('Delhi', { intent:'WEATHER' });
const rr = new ReferenceResolver(ctx).resolve('what about it');
assert.equal(rr.resolved, true, 'reference resolver should resolve literal pronoun references');

console.log('Context/memory regression tests: PASS');
