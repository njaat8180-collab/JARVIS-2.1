// ==========================================
// JARVIS V10
// Autonomous Agent Core
// InternalMonologue V1 PRO
// Part 1
// ==========================================

"use strict";

(function () {

const InternalMonologue = {

    version: "1.0.0 PRO",

    name: "InternalMonologue",

    status: "idle",

    initialized: false,

    running: false,

    storageKey: "jarvis_internal_monologue",

    maxHistory: 500,

    processDelay: 100,

    history: [],

    queue: [],

    renderers: new Map(),

    filters: {},

    voiceEngine: null,

    chatEngine: null,

    agentBus: null,

    ipcRenderer: null,

    ipcMain: null,

    processing: false,

    debounceTimer: null,

    currentThought: null,

// ==========================================
// LOAD
// ==========================================

    load(){

        try{

            const data =
                localStorage.getItem(this.storageKey);

            if(!data)
                return;

            const save =
                JSON.parse(data);

            this.history =
                save.history || [];

            this.filters =
                save.filters || {};

            console.log(
                "🧠 InternalMonologue Memory Loaded"
            );

        }

        catch(err){

            console.error(err);

        }

    },

// ==========================================
// SAVE
// ==========================================

    save(){

        try{

            localStorage.setItem(

                this.storageKey,

                JSON.stringify({

                    history:this.history,

                    filters:this.filters

                })

            );

        }

        catch(err){

            console.error(err);

        }

    },

// ==========================================
// INIT
// ==========================================

    init(){

        if(this.initialized)
            return;

        this.load();

        this.initialized = true;

        this.status = "ready";

        console.log(
            "🧠 InternalMonologue Initialized"
        );

    },

// ==========================================
// START
// ==========================================

    start(){

        if(this.running)
            return;

        this.running = true;

        this.status = "running";

        console.log(
            "🧠 InternalMonologue Started"
        );

    },

// ==========================================
// STOP
// ==========================================

    stop(){

        if(!this.running)
            return;

        this.running = false;

        this.status = "stopped";

        console.log(
            "🧠 InternalMonologue Stopped"
        );

    },

// ==========================================
// IS READY
// ==========================================

    isReady(){

        return this.initialized;

    },

// ==========================================
// STATUS
// ==========================================

    getStatus(){

        return{

            initialized:this.initialized,

            running:this.running,

            status:this.status,

            queue:this.queue.length,

            history:this.history.length

        };

    },

// ==========================================
// PLACEHOLDER
// Part-2 continues...
// ==========================================
// ==========================================
// QUEUE
// ==========================================

    enqueue(thought){

        if(!thought)
            return false;

        this.queue.push({

            id:
                Date.now()+
                "_" +
                Math.random()
                .toString(36)
                .substring(2,8),

            text:
                String(thought),

            created:
                new Date()
                .toISOString()

        });

        return true;

    },

// ==========================================
// NEXT
// ==========================================

    next(){

        if(this.queue.length===0)
            return null;

        return this.queue.shift();

    },

// ==========================================
// CLEAR QUEUE
// ==========================================

    clearQueue(){

        this.queue=[];

    },

// ==========================================
// QUEUE SIZE
// ==========================================

    queueSize(){

        return this.queue.length;

    },

// ==========================================
// PROCESS
// ==========================================

    process(){

        if(this.processing)
            return;

        this.processing=true;

        const item=
            this.next();

        if(!item){

            this.processing=false;

            return;

        }

        this.currentThought=item;

        this.render(item);

        this.processing=false;

    },

// ==========================================
// PROCESS NOW
// ==========================================

    processNow(text){

        this.enqueue(text);

        this.process();

    },

// ==========================================
// CURRENT
// ==========================================

    getCurrentThought(){

        return this.currentThought;

    },

// ==========================================
// RESET CURRENT
// ==========================================

    clearCurrentThought(){

        this.currentThought=null;

    },

// ==========================================
// Part-3 Continues...
// ==========================================
// ==========================================
// HISTORY
// ==========================================

addHistory(text, type = "thought") {

    if (!text) return;

    this.history.push({

        id: Date.now() + "_" + Math.random(),

        text,

        type,

        time: new Date().toISOString()

    });

    if (this.history.length > this.maxHistory) {

        this.history.shift();

    }

},

getHistory() {

    return [...this.history];

},

clearHistory() {

    this.history = [];

},

// ==========================================
// RENDERERS
// ==========================================

registerRenderer(name, fn) {

    if (!name || typeof fn !== "function")
        return false;

    this.renderers.set(name, fn);

    return true;

},

removeRenderer(name) {

    this.renderers.delete(name);

},

render(text, renderer = "default") {

    if (this.renderers.has(renderer)) {

        return this.renderers.get(renderer)(text);

    }

    return text;

},

// ==========================================
// FILTERS
// ==========================================

setFilters(filters = {}) {

    this.filters = Object.assign(

        this.filters,

        filters

    );

},

applyFilters(text) {

    if (!text)
        return "";

    let output = String(text);

    if (this.filters.trim !== false) {

        output = output.trim();

    }

    if (this.filters.maxLength) {

        output = output.substring(

            0,

            this.filters.maxLength

        );

    }

    return output;

},

// ==========================================
// SERIALIZATION
// ==========================================

serialize() {

    return JSON.stringify({

        history: this.history,

        filters: this.filters

    });

},

deserialize(data) {

    try {

        const obj = JSON.parse(data);

        this.history = obj.history || [];

        this.filters = obj.filters || {};

    }

    catch (err) {

        console.error(err);

    }

},
// ==========================================
// VOICE ENGINE
// ==========================================

registerVoiceEngine(engine){

    if(!engine)
        return false;

    this.voiceEngine=engine;

    return true;

},

speak(text){

    if(!this.voiceEngine)
        return false;

    if(typeof this.voiceEngine.speak==="function"){

        this.voiceEngine.speak(

            this.applyFilters(text)

        );

        return true;

    }

    return false;

},

// ==========================================
// CHAT ENGINE
// ==========================================

registerChatEngine(engine){

    if(!engine)
        return false;

    this.chatEngine=engine;

    return true;

},

send(text){

    if(!this.chatEngine)
        return false;

    if(typeof this.chatEngine.send==="function"){

        this.chatEngine.send(

            this.applyFilters(text)

        );

        return true;

    }

    return false;

},

// ==========================================
// AGENT BUS
// ==========================================

attachAgentBus(bus){

    if(!bus)
        return false;

    this.agentBus=bus;

    return true;

},

emit(event,data={}){

    if(

        this.agentBus &&

        typeof this.agentBus.emit==="function"

    ){

        this.agentBus.emit(

            event,

            data

        );

    }

},

// ==========================================
// IPC
// ==========================================

registerIPC(ipc){

    if(!ipc)
        return false;

    this.ipcRenderer=ipc;

    return true;

},

sendIPC(channel,data={}){

    if(

        this.ipcRenderer &&

        typeof this.ipcRenderer.send==="function"

    ){

        this.ipcRenderer.send(

            channel,

            data

        );

    }

},

// ==========================================
// CLEANUP
// ==========================================

cleanup(){

    this.queue=[];

    this.currentThought=null;

    this.processing=false;

    this.debounceTimer=null;

    this.voiceEngine=null;

    this.chatEngine=null;

    this.agentBus=null;

    this.ipcRenderer=null;

    this.ipcMain=null;

    console.log(

        "🧠 InternalMonologue Cleaned"

    );

},

// ==========================================
// RESET
// ==========================================

reset(){

    this.cleanup();

    this.history=[];

    this.filters={};

    this.status="idle";

    this.running=false;

    this.save();

},
// ==========================================
// EXPORT DATA
// ==========================================

exportData(){

    return{

        version:this.version,

        status:this.status,

        initialized:this.initialized,

        running:this.running,

        history:this.getHistory(),

        queue:this.queue.slice(),

        filters:Object.assign({},this.filters)

    };

},

// ==========================================
// IMPORT DATA
// ==========================================

importData(data){

    if(!data)
        return false;

    try{

        this.history=
            Array.isArray(data.history)
            ? data.history
            : [];

        this.queue=
            Array.isArray(data.queue)
            ? data.queue
            : [];

        this.filters=
            data.filters || {};

        this.status=
            data.status || "idle";

        return true;

    }

    catch(err){

        console.error(err);

        return false;

    }

},

// ==========================================
// DESTROY
// ==========================================

destroy(){

    this.stop();

    this.cleanup();

    this.history=[];

    this.queue=[];

    this.renderers.clear();

    this.voiceEngine=null;

    this.chatEngine=null;

    this.agentBus=null;

    this.ipcRenderer=null;

    this.ipcMain=null;

    this.currentThought=null;

    this.initialized=false;

    this.status="destroyed";

    console.log(

        "🧠 InternalMonologue Destroyed"

    );

}

};

// ==========================================
// GLOBAL EXPORT
// ==========================================

window.InternalMonologue =
    InternalMonologue;

// ==========================================
// AUTO INIT
// ==========================================

try{

    InternalMonologue.init();

}

catch(err){

    console.error(err);

}

// ==========================================
// LOADED
// ==========================================

console.log(

    "✅ InternalMonologue V1 PRO Loaded"

);

})();
