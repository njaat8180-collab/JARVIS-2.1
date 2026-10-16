// ==========================================================
// JARVIS PRO MAX
// SystemController V10
//
// Part 1/6
//
// Master Integration & Boot Controller
// ==========================================================


"use strict";





class JARVISSystemController {



constructor(){



    this.version =

    "SYSTEM CONTROLLER V10";



    this.initialized=false;



    this.booting=false;



    this.status="offline";







    // ==============================================
    // MODULE REGISTRY
    // ==============================================


    this.modules = {



        brain:null,



        intent:null,



        reasoning:null,



        decision:null,



        planning:null,



        memory:null,



        action:null,



        browser:null,



        voice:null,



        // Phase 2: Final Goal Registry (Persistent Self-Improvement
        // system). Phase 4 wires this slot to the actual Background
        // Evolution Engine bridge in registerModules() below; this
        // constructor value is just the initial placeholder before
        // that first runs, same as every other module slot here.
        evolution:null



    };








    // ==============================================
    // BOOT INFORMATION
    // ==============================================


    this.bootLog=[];



    this.errors=[];








    console.log(

        "⚙️ System Controller Created"

    );



}

async waitForModules(timeout = 15000){

    console.log("⏳ Waiting For JARVIS Modules...");

    const start = Date.now();

    while(Date.now() - start < timeout){

        const status = {

            brain: !!window.JARVISBrain,

            intent: !!(
    window.IntentEngine ||
    window.JARVISIntentEngine
),

            reasoning: !!window.ReasoningAgent,

            planning: !!window.PlanningAgent,

            decision: !!window.DecisionAgent,

            memory: !!window.MemoryManagerAgent,

            action: !!window.ActionAgent,

            browser: !!window.BrowserBrain,

            voice: !!window.VoiceAgent

        };

        const missing = Object.entries(status)
            .filter(([key, ready]) => !ready)
            .map(([key]) => key);

        if(missing.length === 0){

            console.log(
                "✅ All JARVIS Modules Detected"
            );

            this.registerModules();

            return true;

        }

        console.log(
            "⏳ Waiting for:",
            missing.join(", ")
        );

        await new Promise(
            resolve => setTimeout(resolve, 100)
        );

    }

    console.warn(
        "⚠️ Module wait timeout"
    );

    this.registerModules();

    return this.checkModules();

}





// ==========================================================
// INITIALIZE
// ==========================================================


async init(){



    try{



        if(this.initialized)

            return true;







        console.log(

            "⚙️ Initializing System Controller..."

        );







        this.registerModules();







        this.initialized=true;







        console.log(

            "✅ System Controller Ready"

        );







        return true;



    }



    catch(error){



        console.error(

            "System Init Error:",

            error

        );



        return false;



    }



}









// ==========================================================
// MODULE REGISTRY
// ==========================================================

registerModules(){

    try{

        this.modules = {

            brain:
                window.JARVISBrain || null,

          intent :
    window.IntentEngine ||
    window.JARVISIntentEngine ||
    null,
   

            reasoning:
                window.ReasoningAgent || null,

            decision:
                window.DecisionAgent || null,

            planning:
                window.PlanningAgent || null,

            memory:
                window.MemoryManagerAgent || null,

            action:
                window.ActionAgent || null,

            browser:
                window.BrowserBrain || null,

            voice:
                window.VoiceAgent || null,

            // Phase 4: the actual Background Evolution Engine integration.
            // The engine itself runs in the main process (see
            // src/evolution/EvolutionEngine.js) — this slot holds the
            // renderer-side bridge to it exposed by preload.js
            // (window.jarvis.evolution), the same way every other slot
            // here holds whatever global that module exposes on window.
            evolution:
                (window.jarvis && window.jarvis.evolution) || null

        };

        console.log(
            "🔗 JARVIS Modules Registered"
        );

        console.table({

            brain: !!this.modules.brain,

            intent: !!this.modules.intent,

            reasoning: !!this.modules.reasoning,

            decision: !!this.modules.decision,

            planning: !!this.modules.planning,

            memory: !!this.modules.memory,

            action: !!this.modules.action,

            browser: !!this.modules.browser,

            voice: !!this.modules.voice,

            evolution: !!this.modules.evolution

        });

        return this.checkModules();

    }

    catch(error){

        console.error(
            "❌ Module Register Error:",
            error
        );

        return false;

    }

}
// ==========================================================
// BOOT SEQUENCE MANAGER
// ==========================================================


async boot(){
await this.waitForModules();

    try{


        if(this.booting)

            return false;







        this.booting=true;








        console.log(

            "🚀 JARVIS System Boot Starting..."

        );








        this.logBoot(

            "System Boot Started"

        );








        const order=[



            "memory",



            "intent",



            "reasoning",



            "decision",



            "planning",



            "action",



            "browser",



            "brain",



            "voice"



        ];








        for(

            const module of order

        ){



            await this.startModule(

                module

            );



        }








        const ready =

        this.checkModules();
        this.registerModules();







        if(ready){



            this.status="online";








            window.dispatchEvent(


                new CustomEvent(

                    "JARVIS_ONLINE",

                    {

                        detail:{


                            version:

                            this.version,


                            status:

                            "ONLINE"


                        }

                    }

                )


            );








            console.log(

                "🟢 JARVIS ONLINE"

            );



        }

        else{



            console.warn(

                "⚠️ JARVIS Started With Missing Modules"

            );



        }








        this.booting=false;








        return ready;



    }



    catch(error){



        this.booting=false;



        this.errors.push(

            error.message

        );



        console.error(

            "Boot Error:",

            error

        );



        return false;



    }



}









// ==========================================================
// START MODULE
// ==========================================================


async startModule(name){



    try{



        const module =

        this.modules[name];








        if(!module){



            this.logBoot(

                name +

                " Missing"

            );



            return false;



        }








        if(

            typeof module.boot==="function"

        ){



            await module.boot();



        }








        else if(

            typeof module.init==="function"

        ){



            await module.init();



        }








        this.logBoot(

            name +

            " Started"

        );








        return true;



    }



    catch(error){



        console.error(

            "Module Start Error:",

            name,

            error

        );








        this.errors.push(

            {

                module:name,

                error:error.message

            }

        );








        return false;



    }



}









// ==========================================================
// MODULE READY CHECK
// ==========================================================


checkModules(){

    const missing = [];

    for(const key in this.modules){

        if(!this.modules[key]){

            missing.push(key);

        }

    }

    if(missing.length){

        console.warn(
            "⚠️ Missing Modules:",
            missing.join(", ")
        );

        return false;

    }

    console.log(
        "🟢 All Required Modules Ready"
    );

    return true;

}









// ==========================================================
// BOOT LOGGER
// ==========================================================


logBoot(message){



    this.bootLog.push(



        {

            message,

            time:

            new Date()

            .toISOString()

        }



    );








    console.log(

        "BOOT:",

        message

    );



}

// ==========================================================
// DEPENDENCY CHECKER
// ==========================================================


checkDependencies(){


    try{


        console.log(

            "🔍 Checking Dependencies..."

        );








        const report = {



            total:0,



            available:0,



            missing:[],



            status:"unknown"



        };








        for(

            const key in this.modules

        ){



            report.total++;








            if(

                this.modules[key]

            ){



                report.available++;



            }

            else{



                report.missing.push(

                    key

                );



            }



        }








        report.status =

        report.missing.length===0

        ?

        "healthy"

        :

        "warning";








        return report;



    }



    catch(error){



        console.error(

            "Dependency Check Error:",

            error

        );



        return {



            status:"error"



        };



    }



}









// ==========================================================
// VERSION CHECK
// ==========================================================


checkVersions(){



    try{



        const versions={};








        for(

            const key in this.modules

        ){



            const module =

            this.modules[key];








            if(

                module &&

                module.version

            ){



                versions[key]=

                module.version;



            }

            else{



                versions[key]="unknown";



            }



        }








        return versions;



    }



    catch(error){



        return {};



    }



}









// ==========================================================
// AGENT CONNECTION VERIFY
// ==========================================================


verifyConnections(){



    try{



        const result={};








        Object.keys(

            this.modules

        )

        .forEach(

            key=>{



                const module =

                this.modules[key];








                result[key]={



                    connected:

                    !!module,



                    ready:

                    module

                    ?

                    (

                        module.initialized

                        ||

                        true

                    )

                    :

                    false



                };



            }



        );








        return result;



    }



    catch(error){



        return {};



    }



}









// ==========================================================
// AUTO REPAIR SYSTEM
// ==========================================================


async repairModule(name){



    try{



        console.log(

            "🔧 Repairing Module:",

            name

        );








        let module =

        this.modules[name];








        if(module){



            return {



                success:true,



                message:

                "Module already active."



            };



        }








        this.registerModules();








        module =

        this.modules[name];








        if(module){



            this.logBoot(

                name +

                " Reconnected"

            );








            return {



                success:true



            };



        }








        return {



            success:false,



            reason:

            "Module unavailable."



        };






    }



    catch(error){



        console.error(

            "Repair Error:",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// SYSTEM SELF TEST
// ==========================================================


async selfTest(){



    try{



        const dependencies =

        this.checkDependencies();








        const versions =

        this.checkVersions();








        const connections =

        this.verifyConnections();








        return {



            dependencies,



            versions,



            connections,



            healthy:

            dependencies.status ===

            "healthy"



        };





    }



    catch(error){



        return {



            healthy:false



        };



    }



}

// ==========================================================
// SYSTEM HEALTH MONITOR
// ==========================================================


monitorHealth(){


    try{


        const health = {



            status:

            "healthy",



            modules:{},



            errors:

            this.errors.length,



            timestamp:

            Date.now()



        };








        for(

            const key in this.modules

        ){



            const module =

            this.modules[key];








            health.modules[key]={



                online:

                !!module,



                initialized:

                module

                ?

                (

                    module.initialized

                    ||

                    false

                )

                :

                false



            };



            if(

                !module

            ){



                health.status=

                "warning";



            }



        }








        if(

            this.errors.length > 10

        ){



            health.status=

            "unstable";



        }








        return health;



    }



    catch(error){



        console.error(

            "Health Monitor Error:",

            error

        );



        return {



            status:

            "error"



        };



    }



}









// ==========================================================
// RUNTIME ERROR TRACKING
// ==========================================================


captureError(module,error){



    try{



        const entry={



            module,



            message:

            error.message ||

            error,



            time:

            new Date()

            .toISOString()



        };








        this.errors.push(

            entry

        );








        console.error(

            "JARVIS Error:",

            entry

        );








        if(

            this.errors.length > 100

        ){



            this.errors.shift();



        }








        return entry;



    }



    catch(err){



        return null;



    }



}









// ==========================================================
// AUTO RECOVERY SYSTEM
// ==========================================================


async autoRecover(){



    try{



        console.log(

            "🔄 Auto Recovery Started..."

        );








        const health =

        this.monitorHealth();








        const repaired=[];








        for(

            const key in health.modules

        ){



            if(

                !health.modules[key].online

            ){



                const result =

                await this.repairModule(

                    key

                );








                if(

                    result.success

                ){



                    repaired.push(

                        key

                    );



                }



            }



        }








        return {



            success:true,



            repaired



        };





    }



    catch(error){



        this.captureError(

            "Recovery",

            error

        );








        return {



            success:false



        };



    }



}









// ==========================================================
// STABILITY CHECK
// ==========================================================


stabilityCheck(){



    try{



        const health =

        this.monitorHealth();








        return {



            stable:

            health.status ===

            "healthy",



            status:

            health.status,



            errors:

            this.errors.length



        };





    }



    catch(error){



        return {



            stable:false



        };



    }



}









// ==========================================================
// PERIODIC MONITOR
// ==========================================================


startMonitoring(interval=30000){



    console.log(

        "📡 Health Monitor Started"

    );








    this.monitorTimer =

    setInterval(

        ()=>{



            const health =

            this.monitorHealth();








            console.log(

                "💓 JARVIS Health:",

                health

            );








            if(

                health.status !==

                "healthy"

            ){



                this.autoRecover();



            }



        },

        interval

    );



}









// ==========================================================
// STOP MONITOR
// ==========================================================


stopMonitoring(){



    if(

        this.monitorTimer

    ){



        clearInterval(

            this.monitorTimer

        );



        this.monitorTimer=null;



    }



}

// ==========================================================
// SYSTEM STATUS DASHBOARD
// ==========================================================


getStatus(){


    try{


        return {



            version:

            this.version,



            status:

            this.status,



            initialized:

            this.initialized,



            booting:

            this.booting,



            modules:

            Object.keys(

                this.modules

            )

            .map(

                key=>({



                    name:key,



                    online:

                    !!this.modules[key]



                })

            ),



            errors:

            this.errors.length,



            bootLogs:

            this.bootLog.length



        };



    }



    catch(error){



        return null;



    }



}









// ==========================================================
// FULL DIAGNOSTICS REPORT
// ==========================================================


diagnostics(){



    try{



        return {



            system:



            this.getStatus(),



            health:



            this.monitorHealth(),



            dependencies:



            this.checkDependencies(),



            versions:



            this.checkVersions(),



            connections:



            this.verifyConnections(),



            stability:



            this.stabilityCheck(),



            timestamp:

            new Date()

            .toISOString()



        };





    }



    catch(error){



        return {



            error:

            error.message



        };



    }



}









// ==========================================================
// BOOT HISTORY
// ==========================================================


getBootHistory(limit=50){



    try{



        return this.bootLog

        .slice(-limit);



    }



    catch(error){



        return [];



    }



}









// ==========================================================
// ERROR REPORT
// ==========================================================


getErrors(limit=50){



    try{



        return this.errors

        .slice(-limit);



    }



    catch(error){



        return [];



    }



}









// ==========================================================
// PERFORMANCE METRICS
// ==========================================================


performance(){



    try{



        const uptime =



        Date.now();



        return {



            uptime,



            modules:

            Object.keys(

                this.modules

            )

            .length,



            activeModules:

            Object.values(

                this.modules

            )

            .filter(

                m=>m

            )

            .length,



            errors:

            this.errors.length,



            status:

            this.status



        };





    }



    catch(error){



        return null;



    }



}









// ==========================================================
// JARVIS SUMMARY
// ==========================================================


summary(){



    try{



        const health =

        this.monitorHealth();








        return {



            name:

            "JARVIS PRO MAX",



            version:

            this.version,



            online:

            this.status==="online",



            health:

            health.status,



            modules:

            Object.keys(

                this.modules

            ),



            ready:

            this.initialized



        };





    }



    catch(error){



        return null;



    }



}

// ==========================================================
// FINAL SYSTEM START
// ==========================================================


async start(){


    try{


        console.log(

            "🚀 Starting JARVIS PRO MAX..."

        );








        const ready =

        await this.boot();








        if(

            ready

        ){



            this.startMonitoring();



            console.log(

                "🟢 JARVIS SYSTEM FULLY ONLINE"

            );



        }

        else{



            console.warn(

                "⚠️ JARVIS Started With Warnings"

            );



        }








        return ready;



    }



    catch(error){



        this.captureError(

            "SystemStart",

            error

        );



        return false;



    }



}









// ==========================================================
// SHUTDOWN SYSTEM
// ==========================================================


shutdown(){



    try{



        console.log(

            "🛑 JARVIS Shutdown"

        );








        this.stopMonitoring();








        this.status=

        "offline";








        window.dispatchEvent(



            new CustomEvent(

                "JARVIS_OFFLINE"

            )



        );








        return true;



    }



    catch(error){



        return false;



    }



}









// ==========================================================
// FINAL CLASS CLOSE
// ==========================================================

}









// ==========================================================
// GLOBAL INSTANCE
// ==========================================================


window.SystemController =

new JARVISSystemController();









// ==========================================================
// AUTO BOOT
// ==========================================================


window.addEventListener(


    "DOMContentLoaded",


    async()=>{


        await window.SystemController.start();



        console.log(

            "✅ SystemController V10 Loaded"

        );



    }


);









// ==========================================================
// READY MESSAGE
// ==========================================================


window.addEventListener(


    "JARVIS_ONLINE",


    (event)=>{


        console.log(

            "🤖 JARVIS ONLINE EVENT",

            event.detail

        );



    }


);