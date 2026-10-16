"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { createOpenAICompatibleClient, buildProviderMessages, SARVAM_JARVIS_SYSTEM_PROMPT } = require("../src/ai/openAICompatibleClient");

test("Sarvam always gets the fixed JARVIS identity and only the current user message", () => {
    const payload = buildProviderMessages("sarvam", [
        { role: "user", content: "older private question" },
        { role: "assistant", content: "older private answer" },
        { role: "user", content: "Hey Jarvis, who are you?" }
    ]);
    assert.deepEqual(payload.map(message => message.role), ["system", "user"]);
    assert.equal(payload[0].content, SARVAM_JARVIS_SYSTEM_PROMPT);
    assert.equal(payload[1].content, "Hey Jarvis, who are you?");
    assert.equal(JSON.stringify(payload).includes("older private"), false);
});

test("Sarvam remains the default while explicit Ollama selection is preserved", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-sarvam-default-"));
    const app = { getPath: () => root };
    const safeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: value => Buffer.from(`encrypted:${value}`),
        decryptString: value => value.toString().replace(/^encrypted:/, "")
    };
    const client = createOpenAICompatibleClient({ app, safeStorage });
    const priorEnvKey = process.env.SARVAM_API_KEY;
    delete process.env.SARVAM_API_KEY;
    try {
        assert.equal(client.getConfig().provider, "sarvam");
        fs.writeFileSync(path.join(root, "ai-provider.json"), JSON.stringify({
            provider: "ollama",
            providerPreferenceSet: true,
            sarvamApiKeyEncrypted: Buffer.from("encrypted:saved-sarvam-key").toString("base64")
        }));
        const migrated = client.getConfig();
        assert.equal(migrated.provider, "ollama");
        assert.equal(migrated.hasSarvamApiKey, true);
        assert.equal(migrated.model, "");
        const saved = client.saveConfig({ provider: "sarvam" });
        assert.equal(saved.success, true);
        assert.equal(saved.config.provider, "sarvam");
        assert.equal(saved.config.hasApiKey, true);
        assert.equal(client.saveConfig({ provider: "ollama" }).success, true);
        assert.equal(client.getConfig().provider, "ollama");
    } finally {
        if (priorEnvKey === undefined) delete process.env.SARVAM_API_KEY;
        else process.env.SARVAM_API_KEY = priorEnvKey;
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("Grok provider uses the xAI endpoint and stores its key encrypted", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-grok-provider-"));
    const app = { getPath: () => root };
    const safeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: value => Buffer.from(`encrypted:${value}`),
        decryptString: value => value.toString().replace(/^encrypted:/, "")
    };
    try {
        const client = createOpenAICompatibleClient({ app, safeStorage });
        const saved = client.saveConfig({ provider: "grok", apiKey: "xai-secret" });
        assert.equal(saved.success, true);
        assert.equal(saved.config.provider, "grok");
        assert.equal(saved.config.providerName, "Grok");
        assert.equal(saved.config.endpoint, "https://api.x.ai/v1");
        assert.equal(saved.config.model, "grok-4.1-fast");
        assert.equal(saved.config.hasApiKey, true);
        assert.equal(JSON.stringify(saved.config).includes("xai-secret"), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Groq provider defaults to GPT-OSS-120B and stores its key encrypted", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-groq-provider-"));
    const app = { getPath: () => root };
    const safeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: value => Buffer.from(`encrypted:${value}`),
        decryptString: value => value.toString().replace(/^encrypted:/, "")
    };
    try {
        const client = createOpenAICompatibleClient({ app, safeStorage });
        const saved = client.saveConfig({ provider: "groq", apiKey: "groq-secret" });
        assert.equal(saved.success, true);
        assert.equal(saved.config.provider, "groq");
        assert.equal(saved.config.providerName, "Groq");
        assert.equal(saved.config.endpoint, "https://api.groq.com/openai/v1");
        assert.equal(saved.config.model, "openai/gpt-oss-120b");
        assert.equal(saved.config.hasApiKey, true);
        assert.equal(JSON.stringify(saved.config).includes("groq-secret"), false);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("Sarvam chat retries the other saved credential when the first key has no credits", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-sarvam-credentials-"));
    const app = { getPath: () => root };
    const safeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: value => Buffer.from(`encrypted:${value}`),
        decryptString: value => value.toString().replace(/^encrypted:/, "")
    };
    const client = createOpenAICompatibleClient({ app, safeStorage });
    const priorEnvKey = process.env.SARVAM_API_KEY;
    const seenKeys = [];
    const server = http.createServer((req, res) => {
        seenKeys.push(req.headers["api-subscription-key"]);
        req.resume();
        req.on("end", () => {
            if (req.headers["api-subscription-key"] === "env-no-credit-key") {
                res.writeHead(402, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: { message: "No credits available" } }));
                return;
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ choices: [{ message: { content: "OK from saved key" } }] }));
        });
    });
    try {
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        process.env.SARVAM_API_KEY = "env-no-credit-key";
        const savedKey = "saved-active-key";
        fs.writeFileSync(path.join(root, "ai-provider.json"), JSON.stringify({
            provider: "sarvam",
            endpoint: `http://127.0.0.1:${server.address().port}/v1`,
            model: "sarvam-105b",
            apiKeyEncrypted: Buffer.from(`encrypted:${savedKey}`).toString("base64"),
            sarvamApiKeyEncrypted: Buffer.from(`encrypted:${savedKey}`).toString("base64"),
            providerPreferenceSet: true
        }));
        const result = await client.chatSarvam([{ role: "user", content: "Reply OK" }], { maxTokens: 32, timeoutMs: 3000 });
        assert.equal(result.success, true, JSON.stringify(result));
        assert.equal(result.text, "OK from saved key");
        assert.deepEqual(seenKeys, ["env-no-credit-key", savedKey]);
    } finally {
        if (priorEnvKey === undefined) delete process.env.SARVAM_API_KEY;
        else process.env.SARVAM_API_KEY = priorEnvKey;
        await new Promise(resolve => server.close(resolve));
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("Sarvam disables hidden reasoning by default so its token budget remains for the reply", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-sarvam-reasoning-"));
    const app = { getPath: () => root };
    const safeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: value => Buffer.from(`encrypted:${value}`),
        decryptString: value => value.toString().replace(/^encrypted:/, "")
    };
    const client = createOpenAICompatibleClient({ app, safeStorage });
    const priorKey = process.env.SARVAM_API_KEY;
    let server;
    try {
        server = http.createServer((req, res) => {
            const chunks = [];
            req.on("data", chunk => chunks.push(chunk));
            req.on("end", () => {
                const request = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                assert.equal(request.reasoning_effort, null);
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "Sarvam reply" } }] }));
            });
        });
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        delete process.env.SARVAM_API_KEY;
        fs.writeFileSync(path.join(root, "ai-provider.json"), JSON.stringify({
            provider: "sarvam", endpoint: `http://127.0.0.1:${server.address().port}/v1`, model: "sarvam-105b",
            apiKeyEncrypted: Buffer.from("encrypted:test-key").toString("base64"),
            sarvamApiKeyEncrypted: Buffer.from("encrypted:test-key").toString("base64"), providerPreferenceSet: true
        }));
        const result = await client.chatSarvam([{ role: "user", content: "Hello" }], { timeoutMs: 3000 });
        assert.equal(result.success, true, JSON.stringify(result));
        assert.equal(result.text, "Sarvam reply");
    } finally {
        if (priorKey === undefined) delete process.env.SARVAM_API_KEY;
        else process.env.SARVAM_API_KEY = priorKey;
        if (server) await new Promise(resolve => server.close(resolve));
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("Sarvam empty HTTP 200 response reports token exhaustion without exposing reasoning", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-sarvam-empty-"));
    const app = { getPath: () => root };
    const safeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: value => Buffer.from(`encrypted:${value}`),
        decryptString: value => value.toString().replace(/^encrypted:/, "")
    };
    const client = createOpenAICompatibleClient({ app, safeStorage });
    const priorKey = process.env.SARVAM_API_KEY;
    let server;
    try {
        server = http.createServer((req, res) => {
            req.resume();
            req.on("end", () => {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({
                    choices: [{ finish_reason: "length", message: { content: null, reasoning_content: "private reasoning must not be shown" } }],
                    usage: { completion_tokens: 900, completion_tokens_details: { reasoning_tokens: 900 } }
                }));
            });
        });
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        delete process.env.SARVAM_API_KEY;
        fs.writeFileSync(path.join(root, "ai-provider.json"), JSON.stringify({
            provider: "sarvam", endpoint: `http://127.0.0.1:${server.address().port}/v1`, model: "sarvam-105b",
            apiKeyEncrypted: Buffer.from("encrypted:test-key").toString("base64"),
            sarvamApiKeyEncrypted: Buffer.from("encrypted:test-key").toString("base64"), providerPreferenceSet: true
        }));
        const result = await client.chatSarvam([{ role: "user", content: "Hello" }], { timeoutMs: 3000 });
        assert.equal(result.success, false);
        assert.equal(result.finishReason, "length");
        assert.match(result.error, /900 used for reasoning/);
        assert.equal(result.error.includes("private reasoning"), false);
    } finally {
        if (priorKey === undefined) delete process.env.SARVAM_API_KEY;
        else process.env.SARVAM_API_KEY = priorKey;
        if (server) await new Promise(resolve => server.close(resolve));
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test("API provider encrypts its key, restricts remote HTTP, and parses compatible chat responses", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-api-provider-"));
    const app = { getPath: () => root };
    const safeStorage = {
        isEncryptionAvailable: () => true,
        encryptString: value => Buffer.from(`encrypted:${value}`),
        decryptString: value => value.toString().replace(/^encrypted:/, "")
    };
    const client = createOpenAICompatibleClient({ app, safeStorage });
    let server;
    try {
        assert.equal(client.saveConfig({ provider: "openai-compatible", endpoint: "http://api.example.com/v1", model: "servam-model", apiKey: "test-secret" }).success, false);
        server = http.createServer((req, res) => {
            assert.equal(req.url, "/v1/chat/completions");
            assert.equal(req.headers.authorization, "Bearer test-secret");
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ choices: [{ message: { content: "OK from test model" } }] }));
        });
        await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
        const { port } = server.address();
        const saved = client.saveConfig({ provider: "openai-compatible", providerName: "Sarvam AI", endpoint: `http://127.0.0.1:${port}/v1`, model: "test-model", apiKey: "test-secret" });
        assert.equal(saved.success, true);
        assert.equal(saved.config.providerName, "Sarvam AI");
        assert.equal(saved.config.hasApiKey, true);
        assert.equal(JSON.stringify(saved.config).includes("test-secret"), false);
        const result = await client.chat([{ role: "user", content: "Reply OK" }]);
        assert.equal(result.success, true, JSON.stringify(result));
        assert.equal(result.text, "OK from test model");
        assert.equal(result.model, "test-model");
    } finally {
        if (server) await new Promise(resolve => server.close(resolve));
        fs.rmSync(root, { recursive: true, force: true });
    }
});

test('vision requests use the separate model while normal chat keeps its model', async t => {
 const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jarvis-vision-routing-'));
 const payloads = [];
 const server = http.createServer((req,res)=>{
  let body=''; req.on('data', chunk=>body+=chunk); req.on('end',()=>{
   payloads.push(JSON.parse(body)); res.writeHead(200, {'Content-Type':'application/json'});
   res.end(JSON.stringify({choices:[{message:{content:'visible'}}]}));
  });
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 t.after(async()=>{await new Promise(resolve=>server.close(resolve));
  if (path.dirname(root) === os.tmpdir() && path.basename(root).startsWith('jarvis-vision-routing-')) fs.rmSync(root,{recursive:true,force:true});
 });
 const client=createOpenAICompatibleClient({app:{getPath:()=>root},safeStorage:{isEncryptionAvailable:()=>true,encryptString:v=>Buffer.from(v),decryptString:v=>v.toString()}});
 client.saveConfig({provider:'openai-compatible',endpoint:`http://127.0.0.1:${server.address().port}/v1`,model:'text-model',visionModel:'image-model',apiKey:'test-only'});
 const parts=[{type:'text',text:'Inspect'},{type:'image_url',image_url:{url:'data:image/jpeg;base64,YQ=='}}];
 assert.equal((await client.chat([{role:'user',content:parts}],{vision:true})).model,'image-model');
 assert.equal((await client.chat([{role:'user',content:'Hello'}])).model,'text-model');
 assert.equal(payloads[0].messages[0].content[1].image_url.url, parts[1].image_url.url);
 assert.equal(client.getConfig().model,'text-model');
 client.saveConfig({provider:'openai-compatible',endpoint:`http://127.0.0.1:${server.address().port}/v1`,model:'openai/gpt-oss-120b',visionModel:'openai/gpt-oss-120b'});
 const failed=await client.chat([{role:'user',content:parts}],{vision:true});
 assert.equal(failed.success,false);
 assert.match(failed.error,/cannot read screenshots/);
 assert.equal(payloads.length,2);
});
