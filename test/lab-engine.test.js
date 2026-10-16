"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../renderer/js/labEngine.js"), "utf8");
const sandbox = {};
vm.runInNewContext(source, sandbox);
const engine = sandbox.JARVISLabEngine;

test("Lab rejects unverified knowledge", () => {
    assert.equal(engine.createExperiment({ id: "x", knowledge: "Use a loop", verificationStatus: "pending" }), null);
});

test("Lab creates a bounded coding design challenge with source provenance", () => {
    const item = engine.createExperiment({ id: "c1", topic: "Programming loops", knowledge: "A loop repeats a block of instructions.", category: "coding", verificationStatus: "verified", sourceTitle: "Approved lesson" }, 10);
    assert.equal(item.type, "coding-challenge");
    assert.ok(engine.getCodeForExperiment(item).length > 100);
    assert.match(engine.getPreviewForExperiment(item), /connect-src 'none'/);
    assert.equal(item.source.title, "Programming loops");
    assert.equal(item.source.excerpt, "A loop repeats a block of instructions.");
    assert.ok(item.prompt.length > 20);
});

test("Lab only offers a formula exploration when the trusted source has a matching topic", () => {
    const item = engine.createExperiment({ id: "s1", topic: "Newton's second law", knowledge: "Force depends on mass and acceleration.", category: "science", approvedByUser: true }, 11);
    assert.equal(item.template, "force-mass-acceleration");
    assert.match(item.prompt, /double mass/i);
});

test("general knowledge becomes a source-grounded reflection, not an invented fact", () => {
    const item = engine.createExperiment({ id: "g1", topic: "Taj Mahal", knowledge: "The monument is made primarily of white marble.", verificationStatus: "verified" }, 12);
    assert.equal(item.template, "reflection");
    assert.equal(item.source.excerpt, "The monument is made primarily of white marble.");
});

test("Lab accepts verified background-learning records", () => {
    const item = engine.createExperiment({ id: "b1", topic: "Minecraft", content: "Minecraft is a sandbox video game.", verified: true, source: "Wikipedia" }, 13);
    assert.equal(item.source.title, "Minecraft");
    assert.match(item.source.excerpt, /sandbox video game/);
});

test("Lab provides a clearly labeled safe starter when no verified knowledge exists", () => {
    const item = engine.createStarterExperiment(0, 14);
    assert.match(item.source.title, /Built-in/);
    assert.match(item.prompt, /does not claim to come from saved knowledge/i);
    assert.equal(item.createdAt, 14);
});
