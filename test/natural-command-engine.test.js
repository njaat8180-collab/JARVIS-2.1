const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('renderer/js/brain/naturalCommandEngine.js', 'utf8');
const context = {
    console,
    window: {
        addEventListener() {},
        jarvis: {}
    }
};
vm.createContext(context);
vm.runInContext(source, context);
const engine = context.window.JARVISNaturalCommandEngine;

test('natural NLU resolves required intent examples', () => {
    const cases = [
        ['Delhi weather', 'WEATHER'],
        ['Delhi ka mausam batao', 'WEATHER'],
        ['Find India Gate', 'LOCATION'],
        ['India ke baare mein batao', 'KNOWLEDGE'],
        ['AI books', 'BOOK_SEARCH'],
        ['Breaking Bad information', 'TV_SEARCH'],
        ['Chicken recipe', 'RECIPE_SEARCH'],
        ['Tell me about Pikachu', 'POKEMON'],
        ['Latest AI news', 'NEWS'],
        ['100 dollars in rupees', 'CURRENCY'],
        ['London time', 'TIME'],
        ['Images of Taj Mahal', 'IMAGE_SEARCH'],
        ['Videos of donkey', 'VIDEO_SEARCH'],
        ['Electron GitHub repositories', 'GITHUB_SEARCH'],
        ['Open YouTube', 'OPEN_WEBSITE'],
        ['Jarvis, after ChatGPT replies shut down the system', 'SYSTEM_CONTROL'],
        ['ChatGPT ki taraf se reply aane ke baad system band kar dena', 'SYSTEM_CONTROL'],
        ['ChatGPT की तरफ से रिप्लाई आने के बाद सिस्टम बंद कर देना', 'SYSTEM_CONTROL'],
        ['Gemini se jawab aane ke baad system band kar dena', 'SYSTEM_CONTROL'],
        ['Search Google for Minecraft', 'SEARCH_WEB'],
        ['Minecraft find on Google', 'SEARCH_WEB'],
        ['RTX 5090 ETC VTC find on Google', 'SEARCH_WEB'],
        ['Find Minecraft on Google', 'SEARCH_WEB'],
        ['Search Wikipedia for Ada Lovelace', 'SITE_SEARCH'],
        ['Search Amazon for wireless headphones', 'SITE_SEARCH'],
        ['Find mechanical keyboard on Flipkart', 'SITE_SEARCH'],
        ['Reddit search for local AI', 'SITE_SEARCH'],
        ['Notepad kholo', 'OPEN_APP']
        ,['Minecraft kholo', 'MINECRAFT_LAUNCH_FLOW']
        ,['Jarvis, Minecraft open kar do', 'MINECRAFT_LAUNCH_FLOW']
        ,['माइनक्राफ्ट खोलो', 'MINECRAFT_LAUNCH_FLOW']
        ,['Minecraft खोलकर पहला survival world join करो', 'MINECRAFT_WORLD_FLOW']
        ,['Launch SKLauncher and open Minecraft then join the first Survival world', 'MINECRAFT_WORLD_FLOW']
        ,['SKLauncher launch karke Minecraft kholo aur first wala survival world join karo', 'MINECRAFT_WORLD_FLOW']
    ];

    for (const [input, expected] of cases) {
        assert.equal(engine.detect(input).intent, expected, input);
    }
    for (const input of [
        'after ChatGPT replies shut down the system',
        'ChatGPT ki taraf se reply aane ke baad system band kar dena',
        'ChatGPT की तरफ से रिप्लाई आने के बाद सिस्टम बंद कर देना',
        'Gemini se jawab aane ke baad system band kar dena'
    ]) {
        assert.equal(engine.detect(input).entities.action, 'shutdown-after-provider-reply', input);
    }
    assert.equal(engine.detect('Gemini se jawab aane ke baad system band kar dena').entities.provider, 'Gemini');
    assert.equal(engine.detect('ChatGPT की तरफ से रिप्लाई आने के बाद सिस्टम बंद कर देना').entities.provider, 'ChatGPT');
});

test('Minecraft launch flow finds a related launcher without changing the selected version', () => {
    for (const input of ['open Minecraft', 'play Minecraft', 'Minecraft chalao', 'Minecraft खोल दो']) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'MINECRAFT_LAUNCH_FLOW', input);
        assert.equal(result.entities.launcher, 'auto', input);
        assert.equal(result.entities.mode, 'launch', input);
    }
});

test('voice Computer Use commands locate semantic targets instead of requiring coordinates', () => {
    for (const [input, target] of [['click the Play button', 'Play'], ['Save button पर क्लिक करो', 'Save'], ['select the first world', 'first world']]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'COMPUTER_USE', input);
        assert.equal(result.entities.action, 'locateClick', input);
        assert.equal(result.entities.params.target, target, input);
    }
    assert.equal(engine.detect('the meeting time changed').intent, 'unknown');
    assert.notEqual(engine.detect('the release date is next week').intent, 'DATE');
    const typing = engine.detect('type Hello from JARVIS');
    assert.equal(typing.intent, 'COMPUTER_USE');
    assert.equal(typing.entities.action, 'typeText');
    assert.equal(typing.entities.params.text, 'Hello from JARVIS');
});

test('combined app typing commands stay local and preserve the exact text', () => {
    for (const [input, app, text] of [
        ['Open Notepad and type Hello, I am JARVIS, your personal AI assistant.', 'Notepad', 'Hello, I am JARVIS, your personal AI assistant.'],
        ['Notepad खोलो और लिखो Hello from JARVIS', 'Notepad', 'Hello from JARVIS']
    ]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'APP_TASK_FLOW', input);
        assert.equal(result.entities.app, app, input);
        assert.equal(result.entities.action, 'type', input);
        assert.equal(result.entities.text, text, input);
        assert.equal(result.entities.approvalRequired, true, input);
    }
});

test('foundation commands route to workflow recorder and permission profiles', () => {
    assert.equal(engine.detect('save this workflow as Minecraft launch').intent, 'WORKFLOW_RECORDER');
    assert.equal(engine.detect('show saved workflows').intent, 'WORKFLOW_RECORDER');
    assert.equal(engine.detect('set permission mode restricted').intent, 'PERMISSION_PROFILE');
    assert.equal(engine.detect('permission mode status').intent, 'PERMISSION_PROFILE');
});

test('voice regressions route Hindi presentation, AccessOS aliases, Minecraft, and local app search', () => {
    assert.equal(engine.detect('tum mere liye ek achchhee se peepeetee janaret kar').intent, 'CREATE_PRESENTATION');
    assert.equal(engine.detect('Start Axis OS').intent, 'COMPUTER_USE');
    assert.equal(engine.detect('एक्सिस मोड चालू करो').intent, 'COMPUTER_USE');
    assert.equal(engine.detect('Access mode चालू करो').intent, 'COMPUTER_USE');
    assert.equal(engine.detect('esake laॉn्char play aur mera pehla minecraft ka sar्vaival var्l्d jaॉin kar').intent, 'MINECRAFT_WORLD_FLOW');
    assert.equal(engine.detect('Microsoft Store खोलकर Cloud search करो').intent, 'APP_TASK_FLOW');
    assert.equal(engine.detect('Microsoft Store खोलकर Cloud search करो').entities.action, 'search');
});

test('AccessOS voice mode remains a local, approval-gated Computer Use command', () => {
    assert.equal(engine.detect('start JARVIS AccessOS').intent, 'COMPUTER_USE');
    assert.equal(engine.detect('start JARVIS AccessOS').entities.action, 'access-start');
    assert.equal(engine.detect('Access mode बंद करो').entities.action, 'access-stop');
    assert.equal(engine.detect('Jarvis activate Autopilot Mode').entities.action, 'access-start');
    assert.equal(engine.detect('Jarvis Autopilot Mode off').entities.action, 'access-stop');
    assert.equal(engine.detect('pause Autopilot Mode').entities.action, 'access-pause');
    assert.equal(engine.detect('resume Autopilot Mode').entities.action, 'access-resume');
    assert.equal(engine.detect('next button').entities.params.key, 'TAB');
    assert.equal(Array.from(engine.detect('go back').entities.params.keys).join(','), 'ALT,LEFT');
});

test('voice engine migration commands stay local and require a safe preflight', () => {
    for (const input of [
        'Whisper हटाके Vosk लगा दो',
        'switch from Whisper to Vosk',
        'use Vosk instead of Whisper'
    ]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'VOICE_ENGINE_MIGRATION', input);
        assert.equal(result.entities.target, 'vosk', input);
        assert.equal(result.entities.approvalRequired, true, input);
    }
});

test('generic change language creates a reviewable local plan', () => {
    const result = engine.detect('replace whisper with vosk');
    assert.equal(result.intent, 'VOICE_ENGINE_MIGRATION');
    const generic = engine.detect('remove old launcher and install new launcher');
    assert.equal(generic.intent, 'SYSTEM_CHANGE_PLAN');
    assert.equal(generic.entities.approvalRequired, true);
});

test('photo organizer commands stay local and approval-gated', () => {
    const result = engine.detect('find all matching photos and save them in a new folder named family matches');
    assert.equal(result.intent, 'PHOTO_ORGANIZER');
    assert.equal(result.entities.approvalRequired, true);
    assert.equal(result.entities.identityInference, false);
});

test('destructive file commands become local approval-gated plans', () => {
    const cleanup = engine.detect('delete everything in Downloads except Minecraft Launcher');
    assert.equal(cleanup.intent, 'FILE_OPERATIONS');
    assert.equal(cleanup.entities.action, 'downloads-cleanup');
    assert.equal(cleanup.entities.approvalRequired, true);
    const backup = engine.detect('backup drive C to drive H');
    assert.equal(backup.intent, 'FILE_OPERATIONS');
    assert.equal(backup.entities.action, 'backup-plan');
});

test('folder creation commands support English, Hindi, Hinglish, and safe locations', () => {
    for (const [input, name, location] of [
        ['create a folder name nakul', 'nakul', 'desktop'],
        ['make a new folder called Project Files', 'Project Files', 'desktop'],
        ['create a folder called New Folder on your desktop', 'New Folder', 'desktop'],
        ['नकुल के नाम से एक folder बनाओ', 'नकुल', 'desktop'],
        ['Nakul naam ka folder banao', 'Nakul', 'desktop'],
        ['downloads में Nakul नाम का folder बनाओ', 'Nakul', 'downloads'],
        ['नकुल के नाम से डेस्कटॉप पर एक फोल्डर बनाओ', 'नकुल', 'desktop']
    ]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'CREATE_FOLDER', input);
        assert.equal(result.entities.action, 'create-folder', input);
        assert.equal(result.entities.folderName, name, input);
        assert.equal(result.entities.location, location, input);
    }
});

test('folder creation execution uses the safe system path and file bridges', async () => {
    const previous = context.window.jarvis;
    const calls = [];
    context.window.jarvis = {
        system: { paths: async () => ({ success: true, paths: { desktop: 'C:\\\\Users\\\\Nakul\\\\Desktop' } }) },
        files: { createFolder: async target => { calls.push(target); return { success: true, path: target }; } }
    };
    try {
        const result = await engine.execute(engine.detect('create a folder name nakul'));
        assert.equal(result.handled, true);
        assert.equal(result.intent, 'CREATE_FOLDER');
        assert.equal(calls.length, 1);
        assert.equal(calls[0].toLowerCase().endsWith('desktop\\nakul'), true);
        assert.match(result.response, /folder.*nakul.*desktop/i);
    } finally {
        context.window.jarvis = previous;
    }
});

test('generic app task requests become approval-gated workflows', () => {
    for (const input of [
        'open Microsoft Store and search cloud and download it',
        'Microsoft Store खोल के उधर cloud search करके cloud download कर दो'
    ]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'APP_TASK_FLOW', input);
        assert.match(result.entities.app, /Microsoft Store/i, input);
        assert.equal(result.entities.query, 'cloud', input);
        assert.equal(result.entities.approvalRequired, true, input);
    }
});

test('natural app search and copy requests become bounded visual workflows', () => {
    for (const [input, app, query] of [
        ['open Google Chrome and search Minecraft and copy the text of the first result', 'Google Chrome', 'Minecraft'],
        ['Chrome खोलो Minecraft सर्च करो और पहला रिजल्ट का टेक्स्ट कॉपी करो', 'Chrome', 'Minecraft']
    ]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'APP_TASK_FLOW', input);
        assert.equal(result.entities.app, app, input);
        assert.equal(result.entities.query, query, input);
        assert.equal(result.entities.action, 'searchCopyFirst', input);
        assert.equal(result.entities.approvalRequired, true, input);
    }
});

test('combined English app search keeps the app and query separate', () => {
    const result = engine.detect('Open Chrome and search for high');
    assert.equal(result.intent, 'APP_TASK_FLOW');
    assert.equal(result.entities.app, 'chrome');
    assert.equal(result.entities.query, 'high');
    assert.equal(result.entities.action, 'search');
});

test('direct download requests use the official Microsoft Store flow', () => {
    const result = engine.detect('download Minecraft');
    assert.equal(result.intent, 'APP_TASK_FLOW');
    assert.equal(result.entities.app, 'Microsoft Store');
    assert.equal(result.entities.query, 'Minecraft');
    assert.equal(result.entities.approvalRequired, true);
});

test('task memory commands resolve to safe replay and cleanup actions', () => {
    assert.equal(engine.detect('repeat the last task').intent, 'TASK_MEMORY');
    assert.equal(engine.detect('do that again').entities.action, 'replay-last');
    assert.equal(engine.detect('पिछला काम फिर से करो').entities.action, 'replay-last');
    assert.equal(engine.detect('forget the last task').entities.action, 'forget-last');
});

test('Google search extracts the subject regardless of word order', () => {
    for (const [input, query] of [
        ['Minecraft find on Google', 'minecraft'],
        ['RTX 5090 ETC VTC find on Google', 'rtx 5090 etc vtc'],
        ['Find Minecraft on Google', 'minecraft'],
        ['Search Google for Minecraft', 'minecraft']
    ]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'SEARCH_WEB', input);
        assert.equal(result.entities.query, query, input);
    }
});

test('currency tools are selected only for an actual currency conversion or rate request', () => {
    assert.equal(engine.detect('Create a PPT about Minecraft currency systems').intent, 'CREATE_PRESENTATION');
    assert.notEqual(engine.detect('Convert this image to PDF').intent, 'CURRENCY');
    assert.equal(engine.detect('100 dollars in rupees').intent, 'CURRENCY');
    assert.equal(engine.detect('What is the exchange rate?').intent, 'CURRENCY');
});

test('presentation requests extract arbitrary topics and exact total slide counts', () => {
    for (const [input, topic, slideCount] of [
        ['Create a PPT on Minecraft PvP', 'minecraft pvp', 10],
        ['Jarvis, create a 5-slide PPT on Minecraft PvP', 'minecraft pvp', 5],
        ['Create a 15-slide presentation on cybersecurity', 'cybersecurity', 15],
        ['Make a presentation about Windows 7 for Class 9', 'windows 7 for class 9', 10]
    ]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'CREATE_PRESENTATION', input);
        assert.equal(result.entities.topic, topic, input);
        assert.equal(result.entities.slideCount, slideCount, input);
    }
});

test('presentation parser accepts conversational requests, count ranges and image targets', () => {
    for (const [input, topic, slideCount, imageCount] of [
        ['Jarvis make me a PPT about Minecraft, I need 15-20 images, 8-9 slides', 'minecraft', 9, 20],
        ['Jarvis tum mere liye Minecraft ke upar PPT banao, mujhe 15-20 images chahiye, 8-9 slides', 'minecraft', 9, 20],
        ['Minecraft के ऊपर PPT बनाओ, मुझे 15-20 images चाहिए, 8-9 slides', 'minecraft', 9, 20],
        ['Minecraft के ऊपर PPT बनाओ, मुझे 15-20 images चाहिए, 8-9 slides', 'minecraft', 9, 20],
        ['Create a 5-slide PPT on Minecraft PvP', 'minecraft pvp', 5, 0],
        ['Minecraft ke upar 10-11 slides ki PPT bana do', 'minecraft', 11, 0]
    ]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'CREATE_PRESENTATION', input);
        assert.equal(result.entities.topic, topic, input);
        assert.equal(result.entities.slideCount, slideCount, input);
        assert.equal(result.entities.imageCount, imageCount, input);
    }
});

test('presentation and PDF parsers accept natural voice-first phrasing', () => {
    const ppt = engine.detect('Jarvis mere liye na tum ek PPT bana do How to use ChatGPT');
    assert.equal(ppt.intent, 'CREATE_PRESENTATION');
    assert.equal(ppt.entities.topic, 'how to use chatgpt');

    const pdf = engine.detect('Jarvis mere liye na tum ek PDF bana do How to use ChatGPT');
    assert.equal(pdf.intent, 'CREATE_PDF');
    assert.equal(pdf.entities.topic, 'how to use chatgpt');
});

test('artifact and native app commands stay out of the browser route', () => {
    assert.equal(engine.detect('Jarvis mere liye ek PPT bana do How to use ChatGPT').intent, 'CREATE_PRESENTATION');
    assert.equal(engine.detect('Jarvis mere liye ek PDF bana do How to use ChatGPT').intent, 'CREATE_PDF');
    assert.equal(engine.detect('Open Google Chrome').intent, 'OPEN_APP');
    assert.equal(engine.detect('Open Notepad').intent, 'OPEN_APP');
});

test('natural Hindi, Hinglish and English PPT requests retain topic, slide and visual requirements', () => {
    for (const [input, topic, slideCount, wantsImages] of [
        ['Minecraft ke upar ek achhi si PPT banao.', 'minecraft', 10, false],
        ['Minecraft par ek detailed presentation banao aur bahut saari images lagao.', 'minecraft', 10, true],
        ['Mujhe Minecraft ke upar 10 slides ki PPT bana kar do, images aur achhe design ke saath.', 'minecraft', 10, true],
        ['Minecraft ke baare mein presentation taiyar karo.', 'minecraft', 10, false],
        ['Minecraft पर एक शानदार PPT बनाओ, जिसमें बहुत सारी images हों।', 'minecraft', 10, true],
        ['Create a PPT on Minecraft', 'minecraft', 10, false]
    ]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'CREATE_PRESENTATION', input);
        assert.equal(result.entities.topic, topic, input);
        assert.equal(result.entities.slideCount, slideCount, input);
        assert.equal(result.entities.wantsImages, wantsImages, input);
        if (input.includes('10 slides')) assert.ok(result.entities.designPreferences.includes('good visual design'), input);
    }
});

test('real-world Roman Hindi STT errors still route to PPT creation with the full image request', () => {
    const request = 'minecraft ke upar ek achchhee se peepeetee bao aur usamen but saree imejes lagan';
    const result = engine.detect(request);
    assert.equal(result.intent, 'CREATE_PRESENTATION');
    assert.equal(result.entities.topic, 'minecraft');
    assert.equal(result.entities.wantsImages, true);
    assert.ok(result.entities.imageCount >= 1);
    assert.equal(result.entities.language, 'hinglish');
    assert.equal(result.entities.userRequest, request);
    assert.match(result.normalizedText, /ppt banao aur usmein bahut saari images lagana/);

    const devanagari = engine.detect('माइनक्राफ्ट पर 10 स्लाइड की PPT बनाओ और हर स्लाइड में relevant images लगाओ।');
    assert.equal(devanagari.intent, 'CREATE_PRESENTATION');
    assert.equal(devanagari.entities.topic, 'माइनक्राफ्ट');
    assert.equal(devanagari.entities.slideCount, 10);
    assert.equal(devanagari.entities.wantsImages, true);
});

test('exact Roman Hindi STT request invokes the existing presentation bridge with original preferences', async () => {
    const previous = context.window.jarvis;
    const calls = [];
    context.window.jarvis = {
        presentations: {
            create: async (topic, options) => {
                calls.push({ topic, options });
                return { success: true, opened: true, verified: true, path: 'verified-test-path.pptx' };
            }
        }
    };
    const request = 'minecraft ke upar ek achchhee se peepeetee bao aur usamen but saree imejes lagan';
    try {
        const result = await engine.execute(engine.detect(request));
        assert.equal(result.handled, true);
        assert.equal(result.intent, 'CREATE_PRESENTATION');
        assert.equal(calls.length, 1);
        assert.equal(calls[0].topic, 'minecraft');
        assert.equal(calls[0].options.wantsImages, true);
        assert.equal(calls[0].options.userRequest, request);
        assert.equal(result.response, 'PPT बन गई है।');
    } finally {
        context.window.jarvis = previous;
    }
});

test('PPT completion is never claimed unless the bridge confirms a verified saved file', async () => {
    const previous = context.window.jarvis;
    context.window.jarvis = {
        presentations: { create: async () => ({ success: true, path: 'unverified.pptx', opened: true }) }
    };
    try {
        const result = await engine.execute(engine.detect('Create a PPT on Minecraft'));
        assert.match(result.response, /couldn't create the PPT/i);
    } finally {
        context.window.jarvis = previous;
    }
});

test('ChatEngine voice entry prefers the raw transcript and bypasses generic chat for PPT requests', async () => {
    const previousWindow = global.window;
    const calls = [];
    context.window.jarvis = {
        presentations: {
            create: async (topic, options) => {
                calls.push({ topic, options });
                return { success: true, opened: true, verified: true, path: 'verified-test-path.pptx' };
            }
        }
    };
    context.window.JARVISNaturalCommandEngine = engine;
    global.window = context.window;
    try {
        const ChatEngine = require('../renderer/js/chat.js');
        const chat = new ChatEngine();
        chat.booted = true;
        chat.config.autoSave = false;
        chat.config.preventDuplicate = false;
        chat.shouldUseAI = () => false;
        chat._publishActivity = () => {};
        chat.addHistory = () => {};
        chat.emit = () => {};
        chat.processBrainRouter = async () => { throw new Error('generic chat handler must not receive a valid PPT intent'); };

        const raw = 'minecraft ke upar ek achchhee se peepeetee bao aur usamen but saree imejes lagan';
        const canonical = 'minecraft ke upar ek achhi si ppt banao aur usmein bahut saari images lagana';
        const result = await chat.send(canonical, { source: 'voice', spokenText: raw });

        assert.equal(result.success, true);
        assert.equal(result.intent, 'CREATE_PRESENTATION');
        assert.equal(result.source, 'natural-intent');
        assert.equal(calls.length, 1);
        assert.equal(calls[0].topic, 'minecraft');
        assert.equal(calls[0].options.wantsImages, true);
        assert.equal(calls[0].options.userRequest, raw);

        const fallbackRequest = 'uh Minecraft please';
        const fallbackResult = await chat.send('Create a PPT on Minecraft', { source: 'voice', spokenText: fallbackRequest });
        assert.equal(fallbackResult.intent, 'CREATE_PRESENTATION');
        assert.equal(calls.length, 2);
        assert.equal(calls[1].options.userRequest, fallbackRequest);
    } finally {
        global.window = previousWindow;
        context.window.jarvis = {};
    }
});

test('all supported natural-language examples execute through the existing PPT bridge', async () => {
    const previous = context.window.jarvis;
    const calls = [];
    context.window.jarvis = {
        presentations: {
            create: async (topic, options) => {
                calls.push({ topic, options });
                return { success: true, opened: true, verified: true, path: 'verified-test-path.pptx' };
            }
        }
    };
    const requests = [
        'Minecraft ke upar ek achhi si PPT banao.',
        'Minecraft par ek detailed presentation banao aur bahut saari images lagao.',
        'Mujhe Minecraft ke upar 10 slides ki PPT bana kar do, images aur achhe design ke saath.',
        'Minecraft ke baare mein presentation taiyar karo.',
        'Minecraft पर एक शानदार PPT बनाओ, जिसमें बहुत सारी images हों।',
        'Create a PPT on Minecraft'
    ];
    try {
        for (const request of requests) {
            const detected = engine.detect(request);
            const result = await engine.execute(detected);
            assert.equal(result.handled, true, request);
            assert.equal(result.intent, 'CREATE_PRESENTATION', request);
        }
        assert.equal(calls.length, requests.length);
        assert.ok(calls.every(call => call.topic === 'minecraft'));
        assert.equal(calls[2].options.slideCount, 10);
        assert.equal(calls[1].options.wantsImages, true);
        assert.equal(Array.from(calls[2].options.designPreferences).join(','), 'good visual design');
        assert.equal(Array.from(calls[1].options.designPreferences).join(','), 'detailed');
        assert.equal(calls[2].options.userRequest, requests[2]);
    } finally {
        context.window.jarvis = previous;
    }
});

test('PDF requests extract arbitrary topics in English and Hindi', () => {
    for (const [input, topic] of [
        ['Create a PDF on Minecraft', 'minecraft'],
        ['Make a smart PDF about computer safety', 'computer safety'],
        ['Minecraft की PDF बना दो', 'minecraft']
    ]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'CREATE_PDF', input);
        assert.equal(result.entities.topic, topic, input);
    }
});

test('office-file requests route DOCX, CSV, and ZIP creation in English and Hindi', () => {
    for (const [input, format, request] of [
        ['Create a Word document about computer safety', 'docx', 'computer safety'],
        ['create a study guide about Minecraft and save it as Minecraft Guide', 'docx', 'Minecraft'],
        ['Create study guide on ChatGPT', 'docx', 'ChatGPT'],
        ['Create a study guide as ChatGPT', 'docx', 'ChatGPT'],
        ['Create a stady guide about ChatGPT', 'docx', 'ChatGPT'],
        ['Create me a study guide on ChatGPT', 'docx', 'ChatGPT'],
        ['Write me a study guide about ChatGPT', 'docx', 'ChatGPT'],
        ['Please create a study guide on ChatGPT', 'docx', 'ChatGPT'],
        ['Make me notes on photosynthesis', 'docx', 'photosynthesis'],
        ['Make notes on photosynthesis', 'docx', 'photosynthesis'],
        ['Create a document about computer safety', 'docx', 'computer safety'],
        ['Make a DOCX on study skills', 'docx', 'study skills'],
        ['Create a CSV for monthly expenses', 'csv', 'monthly expenses'],
        ['खर्चों की CSV बना दो', 'csv', 'खर्चों की'],
        ['Create a Word document about computer safety named Safety Plan in Downloads', 'docx', 'computer safety'],
        ['Create a ZIP archive', 'zip', '']
    ]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'CREATE_OFFICE_FILE', input);
        assert.equal(result.entities.format, format, input);
        assert.equal(result.entities.request, request, input);
    }
    const named = engine.detect('Create a Word document about computer safety named Safety Plan in Downloads');
    assert.equal(named.entities.fileName, 'Safety Plan');
    assert.equal(named.entities.outputLocation, 'downloads');
    const studyGuide = engine.detect('create a study guide about Minecraft and save it as Minecraft Guide');
    assert.equal(studyGuide.entities.fileName, 'Minecraft Guide');
});

test('office-file execution calls the secure document bridge and reports cancellation honestly', async () => {
    const calls = [];
    context.window.jarvis.documents = {
        async createOfficeFile(format, request, options) {
            calls.push({ format, request, options });
            return { success: true, data: { success: true, format, verified: true, path: `C:\\Documents\\${format}` } };
        }
    };
    const created = await engine.process('Create a CSV for monthly expenses');
    assert.equal(calls[0].format, 'csv');
    assert.equal(calls[0].request, 'monthly expenses');
    assert.equal(calls[0].options.language, 'en');
    assert.equal(calls[0].options.fileName, '');
    assert.equal(calls[0].options.outputLocation, '');
    assert.match(created.response, /CSV was created and verified/i);
    assert.match(created.response, /C:\\Documents\\csv/i);

    context.window.jarvis.documents.createOfficeFile = async () => ({ success: true, data: { success: true, format: 'docx' } });
    const unverified = await engine.process('Create a study guide about Minecraft');
    assert.match(unverified.response, /couldn't create the DOCX/i);
    assert.match(unverified.response, /verified saved-file path/i);

    context.window.jarvis.documents.createOfficeFile = async () => ({ success: true, data: { success: true, cancelled: true } });
    const cancelled = await engine.process('Create a ZIP archive');
    assert.match(cancelled.response, /cancelled/i);
});


test('AI queue voice commands preserve message text and route control actions', () => {
    for (const [input, action, message, provider] of [
        ['Jarvis, add this message to the queue: Hello, ChatGPT!', 'add', 'Hello, ChatGPT!', ''],
        ['queue message for ChatGPT: Please summarize this report.', 'add', 'Please summarize this report.', 'ChatGPT'],
        ['add this message for Gemini queue: Translate this.', 'add', 'Translate this.', 'Gemini']
    ]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'AI_MESSAGE_QUEUE', input);
        assert.equal(result.entities.action, action, input);
        assert.equal(result.entities.message, message, input);
        assert.equal(result.entities.provider, provider, input);
    }
    assert.equal(engine.detect('start message queue for ChatGPT').entities.action, 'start');
    assert.equal(engine.detect('pause message queue').entities.action, 'pause');
    assert.equal(engine.detect('open message queue').entities.action, 'open');
});

test('AI queue command adds the original unmodified message text', async () => {
    let received = null;
    context.window.JARVISAIMessageQueue = { enqueue(message, provider) { received = { message, provider }; return 1; } };
    const result = await engine.process('Jarvis, add this message to the queue: Hello, ChatGPT!');
    assert.deepEqual(received, { message: 'Hello, ChatGPT!', provider: '' });
    assert.match(result.response, /1 message added/i);
});

test('reply-triggered shutdown command arms only the selected provider', async () => {
    let armed = null;
    context.window.jarvis.system = {};
    context.window.JARVISDeferredShutdown = { arm(provider) { armed = provider; return true; } };
    const result = await engine.process('ChatGPT ki taraf se reply aane ke baad system band kar dena');
    assert.equal(armed, 'ChatGPT');
    assert.match(result.response, /next reply from ChatGPT/i);
});

test('targeted site searches retain a site and query', () => {
    for (const [input, site, query] of [
        ['search wikipedia for Ada Lovelace', 'wikipedia', 'ada lovelace'],
        ['search wireless headphones on amazon', 'amazon', 'wireless headphones'],
        ['flipkart search mechanical keyboard', 'flipkart', 'mechanical keyboard'],
        ['find local AI on reddit', 'reddit', 'local ai']
    ]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'SITE_SEARCH', input);
        assert.equal(result.entities.site, site, input);
        assert.equal(result.entities.query, query, input);
    }
});

test('natural image requests resolve to a clean image search query', () => {
    for (const [input, query] of [
        ['show me an image of the Taj Mahal', 'taj mahal'],
        ['show me images of the Taj Mahal', 'taj mahal'],
        ['find a picture of the Taj Mahal', 'taj mahal'],
        ['search images for Taj Mahal', 'taj mahal'],
        ['find photos of the Taj Mahal', 'taj mahal'],
        ['JARVIS, show Taj Mahal images', 'taj mahal'],
        ['show me pictures of a car', 'car']
    ]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'IMAGE_SEARCH', input);
        assert.equal(result.entities.query, query, input);
    }
});

test('image searches return a rich gallery for the chat renderer', async () => {
    let requestedQuery = "";
    context.window.jarvis.data = {
        async imageSearch(query) {
            requestedQuery = query;
            return { success: true, data: { success: true, query, source: "Google Images", images: [
                { url: "https://images.example/taj.jpg", thumbUrl: "https://images.example/taj-thumb.jpg", title: "Taj Mahal" }
            ] } };
        }
    };
    const result = await engine.process('Images of Taj Mahal');
    assert.equal(requestedQuery, 'taj mahal');
    assert.equal(result.richContent.type, 'images');
    assert.equal(result.richContent.images.length, 1);
    assert.equal(result.richContent.source, 'Google Images');
});

test('image requests still offer a Google Images link when previews are unavailable', async () => {
    context.window.jarvis.data = { async imageSearch(query) { return { success: false, error: "offline", query }; } };
    const result = await engine.process('Show me images of Minecraft');
    assert.equal(result.intent, 'IMAGE_SEARCH');
    assert.equal(result.richContent.type, 'images');
    assert.equal(result.richContent.images.length, 0);
    assert.match(result.richContent.searchUrl, /tbm=isch.*Minecraft/i);
});

test("targeted site searches open the matching site's search URL", async () => {
    const opened = [];
    context.window.jarvis.browser = { async open(url) { opened.push(url); return { success: true }; } };
    for (const [input, domain] of [
        ['search wikipedia for Ada Lovelace', 'en.wikipedia.org/w/index.php?search=ada%20lovelace'],
        ['search headphones on amazon', 'amazon.in/s?k=headphones'],
        ['search keyboards on flipkart', 'flipkart.com/search?q=keyboards'],
        ['search local AI on reddit', 'reddit.com/search/?q=local%20ai']
    ]) {
        const result = await engine.process(input);
        assert.equal(result.intent, 'SITE_SEARCH', input);
        assert.ok(opened.at(-1).includes(domain), opened.at(-1));
    }
});

test("combined spoken site commands stay local and preserve the search query", async () => {
    const opened = [];
    context.window.jarvis.browser = { async open(url) { opened.push(url); return { success: true }; } };
    const result = await engine.process("Amazon kholo aur ek accha sa mouse search karo");
    assert.equal(result.intent, "SITE_SEARCH");
    assert.equal(result.entities.site, "amazon");
    assert.match(result.entities.query, /mouse/i);
    assert.ok(opened.at(-1).includes("amazon.in/s?k="), opened.at(-1));
});

test('volume commands resolve to a bounded system-volume intent', () => {
    for (const [input, percent] of [
        ['Set volume to 50%', 50],
        ['Jarvis, volume 35 percent kar do', 35],
        ['आवाज़ 65 प्रतिशत कर दो', 65],
        ['Mute volume', 0]
    ]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'SET_VOLUME', input);
        assert.equal(result.entities.percent, percent, input);
    }
});

test('volume action calls only the narrow system.setVolume bridge and reports failure honestly', async () => {
    const calls = [];
    context.window.jarvis.system = {
        async setVolume(percent) {
            calls.push(percent);
            return { success: true, data: { success: true, volume: percent } };
        }
    };
    const result = await engine.process('set volume to 50%');
    assert.equal(calls[0], 50);
    assert.match(result.response, /50%/);

    context.window.jarvis.system.setVolume = async () => ({ success: false, error: 'Audio endpoint unavailable' });
    const failed = await engine.process('volume 30 percent kar do');
    assert.match(failed.response, /Audio endpoint unavailable/);
});

test('currency entities are extracted with aliases', () => {
    const result = engine.detect('100 dollars ko rupees mein convert karo');
    assert.equal(result.intent, 'CURRENCY');
    assert.equal(result.entities.amount, 100);
    assert.equal(result.entities.fromCurrency, 'USD');
    assert.equal(result.entities.toCurrency, 'INR');
});

test('wake word is normalized without losing the command', () => {
    const result = engine.detect('JARVIS, Delhi ka weather batao!');
    assert.equal(result.normalizedText, 'delhi ka weather batao');
    assert.equal(result.intent, 'WEATHER');
    assert.equal(result.entities.location, 'delhi');
});

test('delayed shutdown commands recognize English, Hinglish, Hindi words, and Hindi digits', () => {
    for (const [input, delayMs] of [
        ['Jarvis, shut my system down in five minutes', 5 * 60 * 1000],
        ['Jarvis, 5 minutes later turn the system off', 5 * 60 * 1000],
        ['Jarvis, पाँच मिनट में सिस्टम बंद कर देना', 5 * 60 * 1000],
        ['Jarvis, ५ मिनट में सिस्टम बंद कर देना', 5 * 60 * 1000],
        ['Jarvis, after 10 minutes shut my computer down', 10 * 60 * 1000]
    ]) {
        const result = engine.detect(input);
        assert.equal(result.intent, 'SYSTEM_CONTROL', input);
        assert.equal(result.entities.action, 'schedule-shutdown', input);
        assert.equal(result.entities.delayMs, delayMs, input);
    }
});

test('delayed shutdown calls the existing system bridge and reports the scheduled time', async () => {
    let scheduledDelay = null;
    context.window.jarvis.system = {
        async scheduleShutdown(delayMs) {
            scheduledDelay = delayMs;
            return { success: true, shutdownAt: new Date(Date.now() + delayMs).toISOString() };
        }
    };
    const result = await engine.process('Jarvis, shut down in five minutes');
    assert.equal(scheduledDelay, 5 * 60 * 1000);
    assert.match(result.response, /5 minutes/i);
});

test('missing entities produce clarification', () => {
    const result = engine.detect('What is the weather?');
    assert.equal(result.intent, 'WEATHER');
    assert.match(engine.clarification(result), /city/i);
});

test('window close commands stay local and preserve exclusions', () => {
    const one = engine.detect('close notepad');
    assert.equal(one.intent, 'WINDOW_CONTROL');
    assert.deepEqual(Array.from(one.entities.targets), ['notepad']);
    const all = engine.detect('close all open windows except jarvis and visual studio code');
    assert.equal(all.intent, 'WINDOW_CONTROL');
    assert.equal(all.entities.all, true);
    assert.deepEqual(Array.from(all.entities.except), ['jarvis', 'visual studio code']);
});

test('app workflows await Autopilot readiness before launching and submit searches', async () => {
    const events = []; const plans = [];
    const ctx = {console: {log(){}}, setTimeout: fn => {fn();}, window: {
        addEventListener() {},
        jarvis: {system: {openApp: async () => {events.push('open'); return {success:true};}}},
        JARVISComputerUse: {isActive:()=>true, setAccessMode:async()=>{await Promise.resolve(); events.push('ready'); return {success:true};}, locateAndApproveType(){}},
        JARVISScreenShare: {isActive:()=>true, understandState:async()=>({success:true, screen:'current app', visibleControls:['Search']})},
        JARVISVisualWorkflow: {run:async plan=>{plans.push(plan);return {success:true};}}
    }};
    vm.createContext(ctx);vm.runInContext(source,ctx);
    const engine = ctx.window.JARVISNaturalCommandEngine;
    const typed = await engine.process('Open Notepad and type Hello World');
    assert.deepEqual(events, ['ready','open']);
    assert.equal(plans[0].steps[0].text,'Hello World');
    assert.match(typed.response,/verified/);
    const followUp = engine.detect('search Minecraft');
    assert.equal(followUp.intent, 'APP_TASK_FLOW');
    assert.equal(followUp.entities.app, 'Notepad');
    assert.equal(followUp.entities.action, 'search');
    await engine.process('Open Chrome and search Minecraft and copy the first result text');
    const steps = plans[1].steps;
    assert.equal(steps[1].key,'ENTER');
    assert.equal(steps[1].verify.target,'search results for Minecraft');
    assert.deepEqual(Array.from(steps.at(-2).keys),['CTRL','A']);
    assert.deepEqual(Array.from(steps.at(-1).keys),['CTRL','C']);
    const opensBeforeFollowUps = events.filter(event => event === 'open').length;
    const selected = await engine.process('select Nakul profile');
    assert.equal(selected.intent, 'APP_TASK_FLOW');
    assert.equal(selected.entities.action, 'click');
    assert.equal(selected.entities.target, 'Nakul profile');
    assert.equal(events.filter(event => event === 'open').length, opensBeforeFollowUps, 'follow-up selection must stay in the already open app');
    const typedFollowUp = await engine.process('type YouTube');
    assert.equal(typedFollowUp.intent, 'APP_TASK_FLOW');
    assert.equal(typedFollowUp.entities.contextual, true);
    assert.equal(plans.at(-1).steps[0].text, 'YouTube');
    assert.equal(events.filter(event => event === 'open').length, opensBeforeFollowUps, 'follow-up typing must not relaunch the app');
    const delayedType = engine.detect('now type cloud');
    assert.equal(delayedType.intent, 'APP_TASK_FLOW');
    assert.equal(delayedType.entities.action, 'type');
    assert.equal(delayedType.entities.text, 'cloud');
    const newTab = engine.detect('click on new tab');
    assert.equal(newTab.intent, 'APP_TASK_FLOW');
    assert.equal(newTab.entities.action, 'hotkey');
    assert.deepEqual(Array.from(newTab.entities.keys), ['CTRL', 'T']);
});

test("app and Minecraft workflows allow native controls without a media stream", () => {
    const source = fs.readFileSync("renderer/js/brain/naturalCommandEngine.js", "utf8");
    assert.doesNotMatch(source, /SKLauncher is open\. Share the full desktop/);
    assert.doesNotMatch(source, /The Minecraft launcher is open\. Share the full desktop/);
    assert.match(source, /typeof computer\.locateAndApproveClick !== "function"/);
});
