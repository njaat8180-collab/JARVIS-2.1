"use strict";

/*
====================================================
JARVIS PRO MAX

brain.js

V13 PRO MAX PRODUCTION

PART 1/5

CORE KERNEL
STATE MANAGER
AGENT FOUNDATION

Bug Fixed:
✅ Duplicate initialization
✅ Missing connectAgents()
✅ Agent timing issue
✅ Safe window access
✅ Dynamic reconnect
====================================================
*/


class JARVISBrain {


constructor(options={}){


// ================================================
// IDENTITY
// ================================================


this.name =

options.name ||

"JARVIS";


this.version =

"V13 PRO MAX";


this.author =

"JARVIS";


// ZERO AI / ZERO LLM — this local brain is fully deterministic and
// never calls any AI engine (cloud or local).




// ================================================
// STATE
// ================================================


this.status =

"offline";


this.initialized =

false;


this.booted =

false;


this.processing =

false;


this.error = null;



// ================================================
// SESSION
// ================================================


this.session = {


id:

"JARVIS-"+

Date.now()+

"-"+

Math.random()

.toString(36)

.substring(2),



start:

Date.now()


};




// ================================================
// CONTEXT
// ================================================


this.context = {};





// ================================================
// MEMORY
// ================================================


this.memory=[];


this.memoryKey =

"JARVIS_BRAIN_MEMORY_V13";





// ================================================
// AGENTS
// ================================================


this.agents={


reasoning:null,

planning:null,

decision:null,

action:null,

browser:null,

memory:null,

learning:null,

voice:null,

manager:null,

registry:null,

bus:null


};




// ================================================
// METRICS
// ================================================


this.metrics={


requests:0,

success:0,

failed:0,

lastRequest:null


};





console.log(

"🧠 JARVIS Brain V13 Kernel Created"

);



}









// =================================================
// INITIALIZE
// =================================================


async init(){


try{


if(this.initialized)

return true;



console.log(

"⚡ Brain Initialization Started"

);




// connect agents

this.connectAgents();




// load memory

await this.loadMemory();





this.initialized=true;


this.status="ready";



console.log(

"✅ Brain Core Ready"

);



return true;



}

catch(error){



this.error=error;


console.error(

"❌ Brain Init Error",

error

);



return false;


}



}









// =================================================
// DYNAMIC AGENT CONNECTOR
// =================================================


// =================================================
// PROCESS (message-handling entry point)
// Orchestrates the connected agents for a single user
// message: reason about it, decide, plan if needed,
// then hand off to ActionAgent. Returns a shape chat.js's
// getBrainMethod()/normalizeEngineResult() already understand.
// =================================================

async process(message, metadata={}){

    try{

        const reasoning = this.agents.reasoning
            ? await this.callAgent(this.agents.reasoning, "reason", message, metadata)
            : null;

        const decision = this.agents.decision
            ? await this.callAgent(this.agents.decision, "decide", reasoning || message, metadata)
            : null;

        const plan = this.agents.planning
            ? await this.callAgent(this.agents.planning, "createPlan", decision || message, metadata)
            : null;

        const action = this.agents.action
            ? await this.callAgent(this.agents.action, "execute", plan || message, metadata)
            : null;

        const result = action || plan || decision || reasoning;

        if (!result) {
            return { handled: false, response: null };
        }

        const response =
            result.response ||
            result.thought ||
            result.output ||
            (typeof result.plan === "string" ? result.plan : null) ||
            null;

        return {
            handled: Boolean(response) && result.success !== false,
            response,
            raw: { reasoning, decision, plan, action }
        };

    } catch(error) {

        console.error(
            "❌ Brain Process Failed:",
            error
        );

        return { handled: false, response: null, error };

    }

}


connectAgents(){


try{


const map={


reasoning:"ReasoningAgent",

planning:"PlanningAgent",

decision:"DecisionAgent",

action:"ActionAgent",

browser:"BrowserBrain",

memory:"MemoryManagerAgent",

learning:"SelfLearningAgent",

voice:"VoiceAgent",

manager:"AgentManager",

registry:"AgentRegistry",

bus:"AgentBus"



};






Object.entries(map)

.forEach(([key,name])=>{





if(

window[name]

){



this.agents[key]=

window[name];



console.log(

"🔗 Brain Connected:",

key

);



}





});






return true;



}

catch(error){


console.error(

"Agent Connect Error",

error

);


return false;



}



}









// =================================================
// SAFE AGENT CALL
// =================================================


async callAgent(

agent,

method,

...args

){



try{



if(

!agent ||

typeof agent[method]

!==

"function"

){



return null;



}




return await agent[method](

...args

);





}

catch(error){



console.error(

"Agent Execution Error:",

method,

error

);



return null;



}



}









// =================================================
// RECONNECT SYSTEM
// =================================================


async reconnect(){


console.log(

"🔄 Reconnecting Brain Agents..."

);



this.connectAgents();



return true;



}









// =================================================
// MEMORY LOAD
// =================================================


async loadMemory(){


try{


if(

typeof localStorage === "undefined"

)

return;



const data =

localStorage.getItem(

this.memoryKey

);




if(data){



this.memory =

JSON.parse(data);



}





console.log(

"🧠 Memory Loaded:",

this.memory.length

);



}

catch(error){



console.warn(

"Memory Load Failed",

error

);


this.memory=[];


}



}









// =================================================
// MEMORY SAVE LOCAL
// =================================================


saveLocalMemory(){


try{


if(

typeof localStorage==="undefined"

)

return;



localStorage.setItem(

this.memoryKey,

JSON.stringify(

this.memory

)

);



}

catch(error){


console.error(

"Memory Save Failed",

error

);



}



}









// =================================================
// CONTEXT SYSTEM
// =================================================


setContext(

key,

value

){


this.context[key]=value;



}




getContext(key){


return this.context[key];

}




clearContext(){


this.context={};



}









// =================================================
// STATUS
// =================================================


getStatus(){



return {


name:this.name,


version:this.version,


status:this.status,


initialized:this.initialized,


booted:this.booted,


processing:this.processing,



memory:

this.memory.length,



agents:


Object.fromEntries(


Object.entries(this.agents)

.map(([k,v])=>[

k,

!!v

])


)



};



}



}


// END CLASS PART 1
/*
====================================================
JARVIS PRO MAX

brain.js

V13 PRO MAX PRODUCTION

PART 2/5

PROCESS PIPELINE
INTENT ENGINE
SMART ROUTER

====================================================
*/



// ==================================================
// MAIN PROCESS PIPELINE
// ==================================================


JARVISBrain.prototype.process = async function(input){


// === USER CONTEXT — load the active user's personalization ===
try {
    if (window.jarvis && window.jarvis.users && window.jarvis.users.context) {
        var userCtx = await window.jarvis.users.context();
        if (userCtx && userCtx.success && userCtx.context) {
            this.currentUserContext = userCtx.context;
            this.currentUserMemoryBlock = userCtx.memoryBlock || "";
        }
    }
} catch(_ucErr) {}
// === END USER CONTEXT ===


// === LEARNING INTEGRATION: check for user corrections / command teaching ===
try {
    if (window.JARVISLearningManager) {
        var lmResult = await window.JARVISLearningManager.handleUserMessage(input);
        if (lmResult && lmResult.handled) {
            return {
                success: true,
                response: lmResult.action === "correction_learned"
                    ? ("Got it. I'll remember that correction.")
                    : lmResult.action === "command_learned"
                    ? ("Command learned.")
                    : ("I noted your correction. Would you like me to remember it?"),
                source: "learning-manager",
                learningAction: lmResult.action,
            };
        }
    }
} catch(_lmErr) {}
// === END LEARNING INTEGRATION ===




try{


if(!input){


return {

success:false,

response:"Empty command"

};


}




if(!this.initialized){


await this.init();


}




this.processing=true;


this.metrics.requests++;


this.metrics.lastRequest=

Date.now();





let text =


typeof input === "string"

?

input.trim()

:

input.text || "";





console.log(

"🧠 Brain Processing:",

text

);





const intent =

await this.detectIntent(text);





console.log(

"🎯 Intent:",

intent.name

);






const result =

await this.route(

text,

intent

);






this.processing=false;






if(result?.success){


this.metrics.success++;


}

else{


this.metrics.failed++;


}





return result;




}

catch(error){



this.processing=false;


this.metrics.failed++;



console.error(

"Brain Process Error",

error

);



return {


success:false,


response:

"Brain processing failed."

};



}



};









// ==================================================
// INTENT DETECTION ENGINE
// ==================================================


JARVISBrain.prototype.getCurrentUser = function() {
    return this.currentUserContext || null;
};

JARVISBrain.prototype.getCurrentUserName = function() {
    var ctx = this.currentUserContext;
    if (ctx && ctx.profile) {
        if (ctx.profile.preferredName) return ctx.profile.preferredName;
        if (ctx.profile.name) return ctx.profile.name;
    }
    return "";
};

JARVISBrain.prototype.getUserMemoryBlock = function() {
    return this.currentUserMemoryBlock || "";
};

JARVISBrain.prototype.shouldUseName = function() {
    var ctx = this.currentUserContext;
    if (!ctx || !ctx.preferences) return false;
    return ctx.preferences.useNameInResponses !== false;
};

JARVISBrain.prototype.getPreferredLanguage = function() {
    var ctx = this.currentUserContext;
    if (ctx && ctx.profile && ctx.profile.language && ctx.profile.language !== "auto") {
        return ctx.profile.language;
    }
    return null;
};

JARVISBrain.prototype.detectIntent = async function(text){


try{


const input =

text.toLowerCase();





// External Intent Engine


if(

window.IntentEngine &&

typeof window.IntentEngine.detect==="function"

){



return await window.IntentEngine.detect(

text

);



}








// Greeting


if(

/^(hi|hello|hey|jarvis)/i

.test(text)

){


return {


name:"greeting",


confidence:0.95


};



}








// Open Apps


if(

input.startsWith("open ")

){


return {


name:"open",


confidence:0.9


};



}








// Browser Search


if(

input.startsWith("search ")

||

input.includes("google")

||

input.includes("find")

){


return {


name:"search",


confidence:0.9


};



}








// Time


if(

 /^(?:what(?:'s| is)\s+(?:the\s+)?(?:current\s+)?time|what\s+time\s+is\s+it|current\s+time|local\s+time|tell\s+me\s+(?:the\s+)?time|time\s+(?:batao|bata\s+do)|samay\s+(?:batao|bata\s+do)|abhi\s+kitne\s+baje)$/iu.test(input)

){


return {


name:"time",


confidence:0.8


};



}








// Date


if(

 /^(?:what(?:'s| is)\s+(?:today's\s+date|the\s+current\s+date|the\s+date)|today's\s+date|current\s+date|tell\s+me\s+(?:today's\s+date|the\s+current\s+date|the\s+date)|date\s+(?:batao|bata\s+do)|aaj\s+ki\s+date)$/iu.test(input)

){


return {


name:"date",


confidence:0.8


};



}








// System Commands


if(

input.includes("shutdown")

||

input.includes("restart")

){


return {


name:"system",

confidence:0.8


};



}








return {


name:"chat",


confidence:0.5


};



}

catch(error){



console.error(

"Intent Detection Error",

error

);



return {


name:"unknown",

confidence:0


};



}



};









// ==================================================
// SMART ROUTER
// ==================================================


JARVISBrain.prototype.getDynamicGreeting = async function () {
    try {
        const api = window.jarvis?.users || window.JarvisBridge?.users;
        const active = await api?.getActive?.();
        const name = active?.profile?.preferredName || active?.user?.name;
        return name ? `Hello ${name}. JARVIS is online. How may I assist you?`
                    : "Hello. JARVIS is online. How may I assist you?";
    } catch (_) {
        return "Hello. JARVIS is online. How may I assist you?";
    }
};

JARVISBrain.prototype.route = async function(

text,

intent

){


try{


switch(intent.name){





case "greeting":


return {


success:true,


response:
await this.getDynamicGreeting()

};



 




case "open":


return await this.executeAction(

text

);








case "search":


return await this.executeBrowser(

text

);








case "time":


return {


success:true,


response:

new Date()

.toLocaleTimeString()



};








case "date":


return {


success:true,


response:

new Date()

.toDateString()



};








case "system":


return await this.executeSystem(

text

);








default:


return await this.chatFallback(

text

);



}



}

catch(error){



console.error(

"Router Error",

error

);



return {


success:false,


response:

"Routing failed."

};



}



};









// ==================================================
// ACTION EXECUTOR
// ==================================================


JARVISBrain.prototype.executeAction = async function(text){



console.log(

"⚡ Action:",

text

);





// Action Agent


let result =

await this.callAgent(

this.agents.action,

"execute",

text,

this.context

);






if(result){


return result;


}







// Electron fallback


if(

window.jarvis &&

typeof window.jarvis.openApp==="function"

){


let app =

text

.replace(

/open/gi,

""

)

.trim();




await window.jarvis.openApp(

app

);





return {


success:true,


response:

`${app} opened`

};



}








return {


success:false,


response:

"Action system unavailable."

};



};









// ==================================================
// BROWSER EXECUTOR
// ==================================================


JARVISBrain.prototype.executeBrowser = async function(text){



console.log(

"🌐 Browser:",

text

);






let result =

await this.callAgent(

this.agents.browser,

"process",

text

);






if(result){


return result;


}






result =

await this.callAgent(

this.agents.browser,

"search",

text

);







if(result){


return result;


}






// Electron URL fallback


if(

window.jarvis &&

typeof window.jarvis.openURL==="function"

){


let query =

text

.replace(

/search/gi,

""

)

.trim();




let url =

"https://www.google.com/search?q="+

encodeURIComponent(query);





await window.jarvis.openURL(url);





return {


success:true,


response:

"Searching for "+query



};



}








return {


success:false,


response:

"Browser unavailable."

};



};









// ==================================================
// SYSTEM EXECUTOR
// ==================================================


JARVISBrain.prototype.executeSystem = async function(text){



let result =

await this.callAgent(

this.agents.action,

"execute",

text

);





if(result)

return result;






return {


success:false,


response:

"System command unavailable."

};



};





/*
====================================================
END PART 2/5
====================================================
*/
/*
====================================================
JARVIS PRO MAX

brain.js

V13 PRO MAX PRODUCTION

PART 3/5

REASONING
PLANNING
DECISION
AI INTELLIGENCE

====================================================
*/






// ==================================================
// CHAT FALLBACK PIPELINE
// ==================================================


JARVISBrain.prototype.chatFallback = async function(text){


try{


console.log(

"💬 Chat Pipeline:",

text

);






// ================================================
// STEP 1
// REASONING AGENT
// ================================================


let reasoning =

await this.callAgent(

this.agents.reasoning,

"think",

text,

this.context

);







if(reasoning){



return {


success:true,


response:

this.extractResponse(reasoning)



};



}








// ================================================
// STEP 2
// PLANNING AGENT
// ================================================


let plan =

await this.callAgent(

this.agents.planning,

"createPlan",

text,

this.context

);







if(plan){



return {


success:true,


response:

this.extractResponse(plan)



};



}








// ================================================
// STEP 3
// CHAT ENGINE BRIDGE
// ================================================


if(

window.ChatEngine &&

typeof window.ChatEngine.send==="function"

){



let chat =

await window.ChatEngine.send(

text

);





if(chat){



return {


success:true,


response:

this.extractResponse(chat)



};



}



}

















return {


success:true,


response:

"I am ready. Please provide more details."

};



}



catch(error){



console.error(

"Chat Pipeline Error",

error

);



return {


success:false,


response:

"Unable to process request."

};



}



};











// ==================================================
// RESPONSE EXTRACTOR
// ==================================================


JARVISBrain.prototype.extractResponse = function(data){



try{



if(

typeof data==="string"

)

return data;






return (

data.response ||

data.message ||

data.text ||

JSON.stringify(data)

);



}

catch(error){



return "Processing completed.";

}



};









// ==================================================
// THINKING PIPELINE
// ==================================================


JARVISBrain.prototype.think = async function(input){



try{



console.log(

"🤔 Brain Thinking:",

input

);






const intent =

await this.detectIntent(

input

);







const result =

await this.route(

input,

intent

);







const decision =

await this.makeDecision(

input,

intent,

result

);







return await this.generateResponse({


input,


intent,


result,


decision



});






}

catch(error){



console.error(

"Thinking Error",

error

);



return {


success:false,


response:

"Thinking failed."

};



}



};









// ==================================================
// DECISION ENGINE
// ==================================================


JARVISBrain.prototype.makeDecision = async function(

input,

intent,

result

){



try{



let decision = {



action:

"respond",



confidence:

this.calculateConfidence(result),



priority:

"normal"



};









let agentDecision =

await this.callAgent(

this.agents.decision,

"analyze",

{


input,


intent,


result,


context:this.context



}

);







if(agentDecision){



decision={


...decision,


...agentDecision



};



}







return decision;



}

catch(error){



console.error(

"Decision Error",

error

);



return {


action:"fallback",


confidence:0



};



}



};









// ==================================================
// CONFIDENCE CALCULATOR
// ==================================================


JARVISBrain.prototype.calculateConfidence = function(result){



try{



if(!result)

return 0;






if(

result.success===true &&

result.response

)

return 0.95;








if(result.response)

return 0.7;








return 0.3;





}

catch(error){



return 0;



}



};











// ==================================================
// RESPONSE GENERATOR
// ==================================================


JARVISBrain.prototype.generateResponse = async function(data){



try{



const {


input,


result,


decision



}=data;







let response =

this.extractResponse(result);








if(

decision.confidence < 0.4

){



response=

"I need more information to complete this task.";



}









await this.saveMemory({


type:

"conversation",



input,


response,



confidence:

decision.confidence



});








return {


success:true,


response,


confidence:

decision.confidence



};






}

catch(error){



console.error(

"Response Generation Error",

error

);



return {


success:false,


response:

"Response generation failed."

};



}



};







/*
====================================================
END PART 3/5
====================================================
*/
/*
====================================================
JARVIS PRO MAX

brain.js

V13 PRO MAX PRODUCTION

PART 4/5

MEMORY
LEARNING
SELF IMPROVEMENT

====================================================
*/







// ==================================================
// SAVE MEMORY SYSTEM
// ==================================================


JARVISBrain.prototype.saveMemory = async function(data){


try{



const memoryObject={


id:

Date.now(),



session:

this.session.id,



type:

data.type || "general",



...data,



timestamp:

Date.now()



};







this.memory.push(

memoryObject

);








// Memory limit


if(

this.memory.length > 500

){



this.memory.shift();



}









// Local backup


this.saveLocalMemory();








// External Memory Agent


await this.callAgent(

this.agents.memory,

"save",

memoryObject

);








return true;



}

catch(error){



console.error(

"Memory Save Error",

error

);



return false;



}



};











// ==================================================
// MEMORY SEARCH ENGINE
// ==================================================


JARVISBrain.prototype.searchMemory = async function(query=null){



try{



let memories =

this.memory;








// External memory search


let external =

await this.callAgent(

this.agents.memory,

"search",

query

);







if(external){


memories = external;


}








if(!query)


return memories;








return memories.filter(item=>



JSON.stringify(item)

.toLowerCase()

.includes(

query

.toLowerCase()

)



);





}

catch(error){



console.error(

"Memory Search Error",

error

);



return [];



}



};









// ==================================================
// GET RECENT MEMORY
// ==================================================


JARVISBrain.prototype.getRecentMemory = function(limit=20){



return this.memory.slice(

-limit

);



};











// ==================================================
// CLEAR MEMORY
// ==================================================


JARVISBrain.prototype.clearMemory=function(){



try{



this.memory=[];



if(

typeof localStorage !== "undefined"

){



localStorage.removeItem(

this.memoryKey

);



}






console.log(

"🧹 Memory Cleared"

);




return true;



}

catch(error){



console.error(

"Clear Memory Error",

error

);



return false;



}



};











// ==================================================
// LEARNING SYSTEM BRIDGE
// ==================================================


JARVISBrain.prototype.learn = async function(data){



try{



console.log(

"📚 Learning Data:",

data

);






// Save learning experience


await this.saveMemory({


type:

"learning",



data



});








// Self Learning Agent


await this.callAgent(

this.agents.learning,

"learn",

data

);







// Learning Engines


if(

window.ReinforcementEngine

){



await this.callAgent(

window.ReinforcementEngine,

"learn",

data

);



}






if(

window.ExperienceReplayEngine

){



await this.callAgent(

window.ExperienceReplayEngine,

"store",

data

);



}







return {


success:true



};



}

catch(error){



console.error(

"Learning Error",

error

);



return {


success:false



};



}



};












// ==================================================
// EXPERIENCE REPLAY SYSTEM
// ==================================================


JARVISBrain.prototype.replayExperience = async function(){



try{



console.log(

"🔄 Experience Replay Started"

);







const experiences =

this.memory.slice(

-50

);








for(

const exp of experiences

){



await this.callAgent(

this.agents.learning,

"learn",

exp

);



}









// External replay engine


await this.callAgent(

window.ExperienceReplayEngine,

"replay",

experiences

);








console.log(

"✅ Experience Replay Complete"

);







return true;



}

catch(error){



console.error(

"Replay Error",

error

);



return false;



}



};











// ==================================================
// SELF IMPROVEMENT ENGINE
// ==================================================


JARVISBrain.prototype.selfImprove = async function(){



try{



console.log(

"⚙️ Brain Self Improvement Running"

);







await this.replayExperience();









let result =

await this.callAgent(

this.agents.learning,

"optimize"

);








// Self Optimisation Engine


await this.callAgent(

window.SelfOptimisationEngine,

"optimize"

);







console.log(

"🧠 Optimization:",

result

);








return {


success:true,


message:

"JARVIS Brain optimized."

};



}

catch(error){



console.error(

"Self Improvement Error",

error

);



return {


success:false



};



}



};












// ==================================================
// KNOWLEDGE UPDATE SYSTEM
// ==================================================


JARVISBrain.prototype.updateKnowledge = async function(data){



try{



console.log(

"📖 Knowledge Update:",

data

);







await this.saveMemory({


type:

"knowledge",


data



});








await this.callAgent(

this.agents.learning,

"updateKnowledge",

data

);








if(

this.agents.bus

){



await this.callAgent(

this.agents.bus,

"emit",

"knowledge.update",

data

);



}







return true;



}

catch(error){



console.error(

"Knowledge Update Error",

error

);



return false;



}



};












// ==================================================
// MEMORY STATISTICS
// ==================================================


JARVISBrain.prototype.getMemoryStats=function(){



return {


total:

this.memory.length,



session:

this.session.id,



latest:

this.memory

[this.memory.length-1]

|| null



};



};









/*
====================================================
END PART 4/5
====================================================
*/
/*
====================================================
JARVIS PRO MAX

brain.js

V13 PRO MAX PRODUCTION

PART 5/5

BOOT
DIAGNOSTICS
EXPORT
RUNTIME LOADER

====================================================
*/







// ==================================================
// SHUTDOWN SYSTEM
// ==================================================


JARVISBrain.prototype.shutdown=function(){


try{


this.processing=false;


this.status="offline";


this.booted=false;



console.log(

"🛑 JARVIS Brain Shutdown"

);



return true;



}

catch(error){



console.error(

"Shutdown Error",

error

);



return false;



}



};











// ==================================================
// BOOT MANAGER
// ==================================================


class JARVISBrainBoot{


constructor(brain){



this.brain=brain;


this.started=false;



this.version=

"Brain Boot V13";



console.log(

"🚀 Brain Boot Manager Created"

);



}








async start(){



try{



if(this.started)

return true;






console.log(

"🚀 Starting JARVIS Brain..."

);






await this.brain.init();







await this.brain.reconnect();







this.registerEvents();






this.brain.status="online";


this.brain.booted=true;



this.started=true;







console.log(

"🧠 JARVIS Brain Online"

);







return true;



}

catch(error){



console.error(

"Brain Boot Failed",

error

);



return false;



}



}









registerEvents(){



try{



window.dispatchEvent(


new CustomEvent(

"JARVIS_BRAIN_READY",

{


detail:{


version:

this.brain.version,


status:

"online",


time:

Date.now()


}



}


)



);





}

catch(error){



console.error(

"Brain Event Error",

error

);



}



}








shutdown(){


this.brain.shutdown();


this.started=false;



}



}











// ==================================================
// DIAGNOSTICS SYSTEM
// ==================================================


class BrainDiagnostics{


constructor(brain){


this.brain=brain;



}








report(){



return {


name:

"JARVIS Brain",



version:

this.brain.version,



status:

this.brain.status,



initialized:

this.brain.initialized,



booted:

this.brain.booted,



processing:

this.brain.processing,



memory:

this.brain.memory.length,



agents:

this.checkAgents(),



metrics:

this.brain.metrics,



time:

new Date()

.toISOString()



};



}








checkAgents(){



let result={};





Object.entries(

this.brain.agents

)

.forEach(([key,value])=>{


result[key]=!!value;



});




return result;



}








health(){



let score=100;





if(!this.brain.initialized)

score-=30;



if(!this.brain.booted)

score-=20;







Object.values(

this.checkAgents()

)

.forEach(x=>{


if(!x)

score-=5;


});






return {


score,


status:

score>=80

?

"GOOD"

:

"WARNING"



};



}



}











// ==================================================
// REGISTER SYSTEM
// ==================================================


function registerBrainSystem(){



try{



if(

window.JARVISBrain

){



console.warn(

"Brain already exists"

);



return;



}






window.JARVISBrain =

new JARVISBrain({

name:"JARVIS"

});








window.BrainBoot =

new JARVISBrainBoot(

window.JARVISBrain

);








window.BrainDiagnostics =

new BrainDiagnostics(

window.JARVISBrain

);









window.JARVIS =

window.JARVIS || {};







window.JARVIS.brain =

window.JARVISBrain;







window.JARVIS.status =

()=>{


return window.BrainDiagnostics.report();


};







console.log(

"🧠 Brain System Registered"

);



}

catch(error){



console.error(

"Brain Register Error",

error

);



}



}












// ==================================================
// SAFE AUTO BOOT
// ==================================================


function startBrainBoot(){



try{



registerBrainSystem();






if(

window.BrainBoot

){



window.BrainBoot.start();



}






}

catch(error){



console.error(

"Auto Boot Error",

error

);



}



}











// Electron Safe Startup


if(

document.readyState === "loading"

){



window.addEventListener(

"DOMContentLoaded",

startBrainBoot

);



}

else{


startBrainBoot();



}











// ==================================================
// FINAL LOG
// ==================================================


console.log(

"🧠 brain.js V13 PRO MAX FINAL Loaded"

);
