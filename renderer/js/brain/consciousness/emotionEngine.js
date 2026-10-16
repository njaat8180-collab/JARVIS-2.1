// ==========================================
// JARVIS V10
// Autonomous Agent Core
// EmotionEngine V1 PRO
// Part 1
// ==========================================

"use strict";

(function () {

const EmotionEngine = {

    version: "1.0.0 PRO",

    name: "EmotionEngine",

    status: "idle",

    storageKey: "jarvis_emotion_v1",

    initialized: false,

    running: false,

    heartbeat: null,

    heartbeatInterval: 5000,

    decayRate: 0.03,

    influenceStrength: 0.08,

    maxHistory: 200,

    history: [],

    hooks: [],

    agentBus: null,

    emotions: {},

    defaults: {

        joy:{
            intensity:0,
            valence:0.90,
            arousal:0.50
        },

        sadness:{
            intensity:0,
            valence:-0.90,
            arousal:0.20
        },

        anger:{
            intensity:0,
            valence:-0.60,
            arousal:0.80
        },

        fear:{
            intensity:0,
            valence:-0.80,
            arousal:0.90
        },

        disgust:{
            intensity:0,
            valence:-0.70,
            arousal:0.50
        },

        surprise:{
            intensity:0,
            valence:0,
            arousal:0.70
        },

        interest:{
            intensity:0.30,
            valence:0.30,
            arousal:0.60
        },

        curiosity:{
            intensity:0.60,
            valence:0.35,
            arousal:0.65
        },

        confidence:{
            intensity:0.70,
            valence:0.60,
            arousal:0.30
        },

        calm:{
            intensity:0.40,
            valence:0.40,
            arousal:0.20
        },

        frustration:{
            intensity:0,
            valence:-0.40,
            arousal:0.60
        }

    },

// ==========================================
// LOAD
// ==========================================

    load(){

        try{

            const raw=localStorage.getItem(this.storageKey);

            if(!raw){

                return false;

            }

            const data=JSON.parse(raw);

            this.emotions=data.emotions||{};

            this.history=Array.isArray(data.history)
                ?data.history
                :[];

            console.log("💙 Emotion Memory Loaded");

            return true;

        }

        catch(err){

            console.error(err);

            return false;

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

                    emotions:this.emotions,

                    history:this.history

                })

            );

            return true;

        }

        catch(err){

            console.error(err);

            return false;

        }

    },

// ==========================================
// RESET DEFAULTS
// ==========================================

    resetDefaults(){

        const now=new Date().toISOString();

        this.emotions={};

        Object.keys(this.defaults).forEach(name=>{

            this.emotions[name]={

                intensity:this.defaults[name].intensity,

                valence:this.defaults[name].valence,

                arousal:this.defaults[name].arousal,

                updatedAt:now

            };

        });

    },

// ==========================================
// INIT
// ==========================================

    init(){

        if(this.initialized){

            return;

        }

        const loaded=this.load();

        if(!loaded){

            this.resetDefaults();

        }

        this.initialized=true;

        this.status="ready";

        console.log("💙 EmotionEngine Initialized");

    },
    // ==========================================
// START
// ==========================================

    start(){

        if(this.running){

            return;

        }

        this.running=true;

        this.status="running";

        this.heartbeat=setInterval(()=>{

            this.tick();

        },this.heartbeatInterval);

        console.log("💙 Emotion Engine Started");

    },

// ==========================================
// STOP
// ==========================================

    stop(){

        if(!this.running){

            return;

        }

        clearInterval(this.heartbeat);

        this.heartbeat=null;

        this.running=false;

        this.status="stopped";

        console.log("💙 Emotion Engine Stopped");

    },

// ==========================================
// HEARTBEAT
// ==========================================

    tick(){

        this.decay();

        this.applyInfluence();

        this.save();

    },

// ==========================================
// GET EMOTION
// ==========================================

    getEmotion(name){

        if(!name){

            return null;

        }

        return this.emotions[name]||null;

    },

// ==========================================
// GET ALL EMOTIONS
// ==========================================

    getAllEmotions(){

        return JSON.parse(

            JSON.stringify(

                this.emotions

            )

        );

    },

// ==========================================
// SET EMOTION
// ==========================================

    setEmotion(name,intensity,valence,arousal){

        if(!name){

            return;

        }

        if(!this.emotions[name]){

            this.emotions[name]={};

        }

        this.emotions[name].intensity=

            Math.max(

                0,

                Math.min(

                    1,

                    Number(intensity)||0

                )

            );

        this.emotions[name].valence=

            Math.max(

                -1,

                Math.min(

                    1,

                    Number(valence)||0

                )

            );

        this.emotions[name].arousal=

            Math.max(

                0,

                Math.min(

                    1,

                    Number(arousal)||0

                )

            );

        this.emotions[name].updatedAt=

            new Date().toISOString();

        this.addHistory(

            "set",

            name,

            this.emotions[name].intensity

        );

        this.save();

    },

// ==========================================
// UPDATE EMOTION
// ==========================================

    updateEmotion(name,delta){

        if(!this.emotions[name]){

            return;

        }

        this.emotions[name].intensity=

            Math.max(

                0,

                Math.min(

                    1,

                    this.emotions[name].intensity+

                    (Number(delta)||0)

                )

            );

        this.emotions[name].updatedAt=

            new Date().toISOString();

        this.addHistory(

            "update",

            name,

            this.emotions[name].intensity

        );

        this.save();

    },

// ==========================================
// DAMPEN EMOTION
// ==========================================

    dampenEmotion(name,factor=0.5){

        if(!this.emotions[name]){

            return;

        }

        this.emotions[name].intensity*=

            (1-factor);

        if(this.emotions[name].intensity<0){

            this.emotions[name].intensity=0;

        }

        this.emotions[name].updatedAt=

            new Date().toISOString();

        this.addHistory(

            "decay",

            name,

            this.emotions[name].intensity

        );

        this.save();

    },
    // ==========================================
// APPRAISE PERCEPT
// ==========================================

    appraisePercept(percept={}){

        if(!percept){

            return;

        }

        const tags=Array.isArray(percept.tags)

            ?percept.tags

            :[];

        if(tags.includes("success")){

            this.updateEmotion("joy",0.15);

            this.updateEmotion("confidence",0.10);

        }

        if(tags.includes("failure")){

            this.updateEmotion("sadness",0.12);

            this.updateEmotion("frustration",0.10);

        }

        if(tags.includes("error")){

            this.updateEmotion("anger",0.08);

            this.updateEmotion("frustration",0.12);

        }

        if(tags.includes("alert")){

            this.updateEmotion("fear",0.15);

            this.updateEmotion("surprise",0.10);

        }

        if(tags.includes("interesting")){

            this.updateEmotion("curiosity",0.12);

            this.updateEmotion("interest",0.10);

        }

        this.calculateMood();

    },

// ==========================================
// APPRAISE THOUGHT
// ==========================================

    appraiseThought(thought={}){

        if(!thought.text){

            return;

        }

        const text=

            thought.text.toLowerCase();

        if(

            text.includes("good")||

            text.includes("great")||

            text.includes("success")

        ){

            this.updateEmotion("joy",0.08);

            this.updateEmotion("confidence",0.06);

        }

        if(

            text.includes("error")||

            text.includes("problem")||

            text.includes("bug")||

            text.includes("fail")

        ){

            this.updateEmotion("frustration",0.08);

            this.updateEmotion("sadness",0.05);

        }

        if(

            text.includes("learn")||

            text.includes("new")||

            text.includes("discover")

        ){

            this.updateEmotion("curiosity",0.08);

            this.updateEmotion("interest",0.05);

        }

        this.calculateMood();

    },

// ==========================================
// APPLY EMOTION DELTA
// ==========================================

    applyEmotionDelta(name,delta){

        if(!this.emotions[name]){

            return;

        }

        this.updateEmotion(

            name,

            delta

        );

        this.cascadeEmotion(

            name,

            delta

        );

    },

// ==========================================
// CASCADE EMOTION
// ==========================================

    cascadeEmotion(name,delta){

        switch(name){

            case "joy":

                this.updateEmotion(

                    "confidence",

                    delta*0.50

                );

                break;

            case "confidence":

                this.updateEmotion(

                    "calm",

                    delta*0.30

                );

                break;

            case "anger":

                this.updateEmotion(

                    "frustration",

                    delta*0.40

                );

                break;

            case "fear":

                this.updateEmotion(

                    "surprise",

                    delta*0.30

                );

                break;

            case "curiosity":

                this.updateEmotion(

                    "interest",

                    delta*0.50

                );

                break;

        }

    },

// ==========================================
// CALCULATE VALENCE
// ==========================================

    calculateValence(){

        let total=0;

        let count=0;

        Object.values(

            this.emotions

        ).forEach(emotion=>{

            total+=

                emotion.valence*

                emotion.intensity;

            count++;

        });

        return count

            ?total/count

            :0;

    },

// ==========================================
// CALCULATE AROUSAL
// ==========================================

    calculateArousal(){

        let total=0;

        let count=0;

        Object.values(

            this.emotions

        ).forEach(emotion=>{

            total+=

                emotion.arousal*

                emotion.intensity;

            count++;

        });

        return count

            ?total/count

            :0;

    },

// ==========================================
// CALCULATE MOOD
// ==========================================

    calculateMood(){

        return{

            valence:

                this.calculateValence(),

            arousal:

                this.calculateArousal(),

            dominant:

                this.getDominantEmotion()

        };

    },

// ==========================================
// GET DOMINANT EMOTION
// ==========================================

    getDominantEmotion(){

        let winner=null;

        let highest=-1;

        Object.keys(

            this.emotions

        ).forEach(name=>{

            if(

                this.emotions[name].intensity>

                highest

            ){

                highest=

                    this.emotions[name].intensity;

                winner=name;

            }

        });

        return winner;

    },
    // ==========================================
// DECAY EMOTIONS
// ==========================================

    decay(){

        Object.keys(

            this.emotions

        ).forEach(name=>{

            const emotion=

                this.emotions[name];

            emotion.intensity*=

                (1-this.decayRate);

            if(

                emotion.intensity<0.001

            ){

                emotion.intensity=0;

            }

            emotion.updatedAt=

                new Date().toISOString();

        });

    },

// ==========================================
// APPLY INFLUENCE
// ==========================================

    applyInfluence(){

        const mood=

            this.calculateMood();

        if(

            window.SelfModel&&

            typeof window.SelfModel.updateEmotion==="function"

        ){

            window.SelfModel.updateEmotion(

                mood

            );

        }

        if(

            window.Identity&&

            typeof window.Identity.setMood==="function"

        ){

            window.Identity.setMood(

                mood

            );

        }

    },

// ==========================================
// ADD HISTORY
// ==========================================

    addHistory(type,name,value){

        this.history.push({

            type:type,

            emotion:name,

            value:value,

            time:new Date().toISOString()

        });

        if(

            this.history.length>

            this.maxHistory

        ){

            this.history.shift();

        }

    },

// ==========================================
// GET HISTORY
// ==========================================

    getHistory(limit=50){

        return this.history.slice(

            -limit

        );

    },

// ==========================================
// CLEAR HISTORY
// ==========================================

    clearHistory(){

        this.history=[];

        this.save();

    },

// ==========================================
// EXPORT STATE
// ==========================================

    exportState(){

        return{

            emotions:

                JSON.parse(

                    JSON.stringify(

                        this.emotions

                    )

                ),

            history:

                JSON.parse(

                    JSON.stringify(

                        this.history

                    )

                ),

            mood:

                this.calculateMood(),

            running:

                this.running,

            status:

                this.status

        };

    },

// ==========================================
// IMPORT STATE
// ==========================================

    importState(state){

        if(!state){

            return;

        }

        if(state.emotions){

            this.emotions=

                JSON.parse(

                    JSON.stringify(

                        state.emotions

                    )

                );

        }

        if(

            Array.isArray(

                state.history

            )

        ){

            this.history=

                state.history;

        }

        this.save();

    },
    // ==========================================
// AGENT BUS
// ==========================================

    attachToAgentBus(agentBus){

        if(!agentBus){

            return false;

        }

        this.agentBus=agentBus;

        console.log("💙 EmotionEngine Connected To AgentBus");

        return true;

    },

// ==========================================
// DETACH AGENT BUS
// ==========================================

    detachFromAgentBus(){

        this.agentBus=null;

        console.log("💙 EmotionEngine Disconnected");

    },

// ==========================================
// REGISTER HOOK
// ==========================================

    registerHook(callback){

        if(typeof callback!=="function"){

            return;

        }

        this.hooks.push(callback);

    },

// ==========================================
// REMOVE HOOK
// ==========================================

    removeHook(callback){

        this.hooks=

            this.hooks.filter(

                hook=>hook!==callback

            );

    },

// ==========================================
// EMIT HOOKS
// ==========================================

    emitHooks(event,data){

        this.hooks.forEach(hook=>{

            try{

                hook(event,data);

            }

            catch(err){

                console.error(err);

            }

        });

    },

// ==========================================
// RESET
// ==========================================

    reset(){

        this.stop();

        this.history=[];

        this.resetDefaults();

        this.status="ready";

        this.save();

        console.log("💙 EmotionEngine Reset");

    },

// ==========================================
// DESTROY
// ==========================================

    destroy(){

        this.stop();

        this.detachFromAgentBus();

        this.hooks=[];

        this.history=[];

        this.initialized=false;

        this.status="destroyed";

        console.log("💙 EmotionEngine Destroyed");

    },

// ==========================================
// IS RUNNING
// ==========================================

    isRunning(){

        return this.running;

    },

// ==========================================
// GET STATUS
// ==========================================

    getStatus(){

        return{

            name:this.name,

            version:this.version,

            status:this.status,

            initialized:this.initialized,

            running:this.running,

            emotionCount:Object.keys(this.emotions).length,

            history:this.history.length

        };

    }

// ==========================================
// END OBJECT
// ==========================================

};

window.EmotionEngine=EmotionEngine;

console.log("✅ EmotionEngine V1 PRO Loaded");

})();