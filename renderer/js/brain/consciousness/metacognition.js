// ==========================================
// JARVIS PRO MAX
// Metacognition Engine V2 PRO MAX
// Part 1/5
// Core + State + Initialization
// ==========================================

"use strict";


(function(){


// ==========================================
// CONSTANTS
// ==========================================

const MODULE =
    "Metacognition";


const VERSION =
    "2.0.0 PRO MAX";


const DEFAULT_CONFIG = {


    monitorInterval:10000,


    maxHistory:200,


    confidenceThreshold:0.25,


    performanceThreshold:0.30,


    autoReflection:true


};



// ==========================================
// UTILITIES
// ==========================================


function now(){

    return new Date()
        .toISOString();

}



function uid(prefix="mc"){

    return (

        prefix +

        "_" +

        Date.now().toString(36) +

        "_" +

        Math.random()
        .toString(36)
        .slice(2,8)

    );

}



function clamp(value,min=0,max=1){

    let n =
        Number(value);


    if(!Number.isFinite(n))
        return min;


    return Math.max(
        min,
        Math.min(max,n)
    );

}



function clone(data){

    try{

        return JSON.parse(
            JSON.stringify(data)
        );

    }

    catch(e){

        return data;

    }

}



function safeObject(data){

    return (

        data &&

        typeof data==="object"

    )
    ?
    data
    :
    {};

}



// ==========================================
// METACOGNITION CORE
// ==========================================


const Metacognition = {



    // ======================================
    // INFO
    // ======================================


    version:VERSION,


    name:MODULE,


    status:"idle",


    initialized:false,



    // ======================================
    // STATE
    // ======================================


    state:{


        id:
            uid("metacognition"),


        createdAt:
            now(),


        updatedAt:
            now(),



        monitoring:false,



        lastReflection:null,


        lastDiagnosis:null,



        confidence:{

            average:1,

            lowCount:0,

            total:0

        },



        goals:[],


        beliefs:{},



        recentAnalyses:[]



    },



    // ======================================
    // CONFIG
    // ======================================


    config:



        Object.assign(

            {},

            DEFAULT_CONFIG

        ),



    // ======================================
    // INTERNAL
    // ======================================


    monitorTimer:null,


    debounceTimer:null,



    events:new Map(),



    hooks:new Map(),



    agentBus:null,


    ipcRenderer:null,


    ipcMain:null,



    selfModel:null,


    awareness:null,


    memory:null,



    // ======================================
    // INIT
    // ======================================


    init(options={}){


        try{


            options =
                safeObject(options);



            if(options.config){


                Object.assign(

                    this.config,

                    options.config

                );


            }



            if(options.selfModel){

                this.selfModel =
                    options.selfModel;

            }



            if(options.awareness){

                this.awareness =
                    options.awareness;

            }



            if(options.memory){

                this.memory =
                    options.memory;

            }



            this.status =
                "ready";


            this.initialized =
                true;



            this.state.updatedAt =
                now();



            this.log(

                "info",

                "Metacognition Initialized"

            );



            this.emit(

                "initialized",

                this.getState()

            );



            return {


                ok:true,


                state:this.getState()


            };



        }

        catch(error){



            this.log(

                "error",

                "Initialization Failed",

                error

            );



            return {


                ok:false,


                error:error.message


            };


        }


    },



// ======================================
// GET STATE
// ======================================


getState(){


    return clone({

        version:this.version,

        status:this.status,

        initialized:this.initialized,

        config:this.config,

        state:this.state

    });


},



// ======================================
// RESET
// ======================================


reset(){


    this.state = {


        id:
            uid("metacognition"),


        createdAt:
            now(),


        updatedAt:
            now(),


        monitoring:false,


        recentAnalyses:[]


    };



    this.status =
        "idle";



    return true;


},

// ==========================================
// MONITORING ENGINE
// ==========================================



startMonitoring(interval=null){


    try{


        if(interval){

            this.config.monitorInterval =
                Number(interval);

        }



        if(this.state.monitoring){

            return {

                ok:true,

                monitoring:true

            };

        }



        this.state.monitoring =
            true;



        this.status =
            "monitoring";



        this.monitorTimer =

            setInterval(()=>{


                this.monitorTick();


            },


            this.config.monitorInterval);



        this.log(

            "info",

            "Monitoring Started"

        );



        this.emit(

            "monitoring.start",

            {

                interval:
                    this.config.monitorInterval

            }

        );



        return {


            ok:true,


            monitoring:true


        };


    }


    catch(error){


        this.log(

            "error",

            "Monitor Start Failed",

            error

        );


        return {


            ok:false,


            error:error.message


        };


    }


},






// ==========================================
// STOP MONITORING
// ==========================================



stopMonitoring(){


    try{


        if(this.monitorTimer){


            clearInterval(

                this.monitorTimer

            );


            this.monitorTimer =
                null;


        }



        this.state.monitoring =
            false;



        this.status =
            "ready";



        this.log(

            "info",

            "Monitoring Stopped"

        );



        this.emit(

            "monitoring.stop",

            {}

        );



        return {


            ok:true


        };


    }


    catch(error){


        return {


            ok:false,


            error:error.message


        };


    }


},




// ==========================================
// MONITOR TICK
// ==========================================



monitorTick(){


    try{


        let analysis = {



            timestamp:
                now(),


            performance:
                this.checkPerformance(),


            confidence:
                this.assessBeliefConfidence()



        };



        this.recordAnalysis(

            {

                type:
                    "monitor",

                data:
                    analysis


            }

        );



        if(

            analysis.performance <

            this.config.performanceThreshold

        ){


            this.emit(

                "warning",

                {

                    type:
                        "low_performance",

                    value:
                        analysis.performance


                }

            );



            if(
                this.config.autoReflection
            ){

                this.requestReflection(

                    {

                        reason:
                            "performance_drop"

                    }

                );

            }


        }



        return analysis;



    }


    catch(error){


        this.log(

            "error",

            "Monitor Tick Failed",

            error

        );


        return null;


    }


},




// ==========================================
// PERFORMANCE CHECK
// ==========================================



checkPerformance(){


    try{


        let score =
            1;



        if(

            this.state.recentAnalyses.length >

            this.config.maxHistory

        ){

            score -= 0.2;

        }



        if(

            this.status==="error"

        ){

            score -= 0.5;

        }



        return clamp(score);



    }


    catch(e){


        return 0;


    }


},




// ==========================================
// EVENT SYSTEM
// ==========================================



on(event,callback){


    try{


        if(

            typeof callback !==
            "function"

        )
            return false;



        if(

            !this.events.has(event)

        ){

            this.events.set(

                event,

                []

            );

        }



        this.events
        .get(event)
        .push(callback);



        return true;



    }


    catch(e){


        return false;


    }


},





off(event,callback){


    try{


        if(

            !this.events.has(event)

        )
        return false;



        let list =
            this.events.get(event);



        this.events.set(

            event,

            list.filter(

                fn=>
                    fn!==callback

            )

        );



        return true;


    }


    catch(e){


        return false;


    }


},






emit(event,data={}){


    try{


        if(

            !this.events.has(event)

        )
        return;



        this.events

        .get(event)

        .forEach(fn=>{


            try{


                fn(data);


            }

            catch(e){}


        });



    }


    catch(e){}


},




// ==========================================
// SELF MODEL CONNECT
// ==========================================



attachSelfModel(model){


    if(!model)
        return false;



    this.selfModel =
        model;



    this.log(

        "info",

        "SelfModel Connected"

    );



    return true;


},




// ==========================================
// AWARENESS CONNECT
// ==========================================



attachAwareness(engine){


    if(!engine)
        return false;



    this.awareness =
        engine;



    this.log(

        "info",

        "Awareness Connected"

    );



    return true;


},



// ==========================================
// EVENT BINDING
// ==========================================



bindEngineEvents(){


    try{


        if(

            this.selfModel &&

            typeof this.selfModel.on==="function"

        ){


            this.selfModel.on(

                "evaluation",

                data=>{


                    this.handleSelfEvaluation(data);


                }

            );


        }



        if(

            this.awareness &&

            typeof this.awareness.on==="function"

        ){


            this.awareness.on(

                "perception",

                data=>{


                    this.handleAwareness(data);


                }

            );


        }



        return true;



    }


    catch(error){


        return false;


    }


},




// ==========================================
// SELF EVALUATION HANDLER
// ==========================================



handleSelfEvaluation(data){


    this.recordAnalysis(

        {

            type:
                "self_evaluation",

            data:data


        }

    );



    if(

        data &&

        data.performance <

        this.config.performanceThreshold

    ){


        this.requestReflection(

            {

                reason:
                    "self_evaluation_failure"

            }

        );


    }


},





// ==========================================
// AWARENESS HANDLER
// ==========================================



handleAwareness(data){


    this.recordAnalysis(

        {

            type:
                "awareness",

            data:data


        }

    );



    if(

        data &&

        data.salience >= 0.8

    ){


        this.requestReflection(

            {

                reason:
                    "high_salience"

            }

        );


    }


},
// ==========================================
// METACOGNITIVE OPERATIONS
// Reflection + Confidence + Error Diagnosis
// ==========================================



// ==========================================
// REQUEST REFLECTION
// ==========================================


requestReflection(options={}){


    try{


        options =
            safeObject(options);



        let reflection = {


            id:
                uid("reflection"),


            timestamp:
                now(),


            reason:
                options.reason || "manual",


            urgency:
                clamp(

                    options.urgency || 0.5

                ),



            thoughts:[],


            recommendations:[]


        };



        this.state.lastReflection =
            reflection.timestamp;



        // collect confidence report

        let confidence =

            this.assessBeliefConfidence();



        reflection.confidence =
            confidence;



        // collect goals

        if(this.selfModel){


            try{


                if(

                    typeof this.selfModel.getTopGoals ===
                    "function"

                ){


                    reflection.goals =

                        this.selfModel
                        .getTopGoals(5);


                }


            }

            catch(e){}



        }




        // generate recommendations


        reflection.recommendations =

            this.generateRecommendations(

                reflection

            );




        this.recordAnalysis(

            {


                type:
                    "reflection",


                data:
                    reflection


            }

        );



        this.emit(

            "reflection",

            reflection

        );



        return {


            ok:true,


            reflection:reflection


        };



    }


    catch(error){


        this.log(

            "error",

            "Reflection Failed",

            error

        );


        return {


            ok:false,


            error:error.message


        };


    }


},




// ==========================================
// BELIEF CONFIDENCE ANALYSIS
// ==========================================



assessBeliefConfidence(){


    try{


        let beliefs = {};



        if(

            this.selfModel &&

            typeof this.selfModel.getSnapshot==="function"

        ){


            let snapshot =

                this.selfModel
                .getSnapshot();



            beliefs =

                snapshot.beliefs || {};


        }



        let keys =
            Object.keys(beliefs);



        let total =
            keys.length;



        let confidenceSum =
            0;



        let low = [];



        keys.forEach(key=>{


            let value =

                clamp(

                    beliefs[key].confidence

                );



            confidenceSum += value;



            if(

                value <=

                this.config.confidenceThreshold

            ){


                low.push(key);


            }


        });



        let average =

            total ?

            confidenceSum / total :

            1;



        let report = {



            timestamp:
                now(),


            totalBeliefs:
                total,


            averageConfidence:
                Number(

                    average.toFixed(3)

                ),



            lowConfidenceCount:
                low.length,



            lowConfidence:
                low.slice(0,50)


        };



        this.state.confidence =

            report;



        this.emit(

            "confidence.update",

            report

        );



        return {


            ok:true,


            report:report


        };



    }


    catch(error){


        this.log(

            "error",

            "Confidence Analysis Failed",

            error

        );


        return {


            ok:false,


            error:error.message


        };


    }


},




// ==========================================
// GOAL CONFIDENCE PROPAGATION
// ==========================================



propagateGoalConfidence(){


    try{


        if(!this.selfModel)
            return false;



        let snapshot =

            this.selfModel
            .getSnapshot();



        let goals =

            snapshot.goals || [];



        let updated = [];



        goals.forEach(goal=>{


            let support =

                this.calculateGoalSupport(

                    goal,

                    snapshot.beliefs || {}

                );



            let newConfidence =

                clamp(

                    (

                        goal.confidence || 0.5

                    ) * 0.4

                    +

                    support * 0.6

                );



            if(

                Math.abs(

                    newConfidence -

                    goal.confidence

                )

                >

                0.08

            ){



                if(

                    typeof this.selfModel.updateGoal ===
                    "function"

                ){



                    this.selfModel.updateGoal(

                        goal.id,

                        {

                            confidence:

                                Number(

                                    newConfidence
                                    .toFixed(3)

                                )

                        }

                    );



                    updated.push(

                        {

                            id:
                                goal.id,


                            old:
                                goal.confidence,


                            new:
                                newConfidence


                        }

                    );



                }


            }



        });




        this.recordAnalysis(

            {


                type:
                    "goal_confidence",


                data:
                    updated


            }

        );



        return {


            ok:true,


            updated:updated


        };



    }


    catch(error){


        this.log(

            "error",

            "Goal Confidence Failed",

            error

        );


        return {


            ok:false


        };


    }


},




// ==========================================
// GOAL SUPPORT CALCULATION
// ==========================================



calculateGoalSupport(goal,beliefs){


    try{


        let score =
            0;


        let count =
            0;



        let words =

            String(

                goal.title || ""

            )

            .toLowerCase()

            .split(" ");




        Object.keys(beliefs)

        .forEach(key=>{


            let match =
                0;



            words.forEach(word=>{


                if(

                    word &&

                    key
                    .toLowerCase()
                    .includes(word)

                ){

                    match += 1;


                }


            });



            if(match){


                score +=

                    clamp(

                        beliefs[key].confidence

                    )

                    *

                    match;



                count += match;


            }



        });



        return count ?

            clamp(score/count)

            :

            0;



    }


    catch(e){


        return 0;


    }


},





// ==========================================
// ERROR ANALYSIS
// ==========================================



analyzeError(error={},options={}){


    try{


        error =
            safeObject(error);



        let message =

            error.message ||

            String(error);



        let diagnosis = {


            id:
                uid("error"),


            timestamp:
                now(),


            message:
                message,


            category:

                this.classifyError(

                    message

                ),



            severity:

                clamp(

                    options.severity || 0.5

                )

        };




        this.state.lastDiagnosis =

            diagnosis;



        this.recordAnalysis(

            {


                type:
                    "error",


                data:
                    diagnosis


            }

        );



        this.emit(

            "diagnosis",

            diagnosis

        );



        if(

            diagnosis.severity >= 0.7

        ){


            this.createRecoveryGoal(

                diagnosis

            );


        }



        return {


            ok:true,


            diagnosis:diagnosis


        };



    }


    catch(error){


        return {


            ok:false,


            error:error.message


        };


    }


},




// ==========================================
// ERROR CLASSIFIER
// ==========================================



classifyError(message){


    let text =

        String(message)

        .toLowerCase();



    if(text.includes("network"))

        return "network";



    if(text.includes("timeout"))

        return "timeout";



    if(text.includes("permission"))

        return "permission";



    if(text.includes("syntax"))

        return "syntax";



    if(text.includes("undefined"))

        return "runtime";



    return "general";


},



// ==========================================
// CREATE RECOVERY GOAL
// ==========================================



createRecoveryGoal(error){


    try{


        if(

            this.selfModel &&

            typeof this.selfModel.registerGoal==="function"

        ){


            this.selfModel.registerGoal(

                {


                    title:

                    "Fix System Error: "

                    +

                    error.category,



                    description:

                    error.message,



                    confidence:

                    0.5,



                    tags:

                    [

                        "error",

                        error.category

                    ]



                }

            );


        }



    }


    catch(e){}



},




// ==========================================
// RECOMMENDATION ENGINE
// ==========================================



generateRecommendations(reflection){


    let list=[];



    if(

        reflection.confidence &&

        reflection.confidence.report &&

        reflection.confidence.report.averageConfidence < 0.4

    ){


        list.push(

            {


                type:

                "improve_memory",


                priority:

                "high"


            }

        );


    }



    if(

        reflection.reason ===

        "performance_drop"

    ){


        list.push(

            {


                type:

                "optimize_engine",


                priority:

                "high"


            }

        );


    }



    return list;


},



// ==========================================
// RECORD ANALYSIS
// ==========================================



recordAnalysis(entry={}){


    try{


        this.state.recentAnalyses.push(

            {


                id:
                    uid("analysis"),


                time:
                    now(),


                ...entry


            }

        );



        while(

            this.state.recentAnalyses.length

            >

            this.config.maxHistory

        ){


            this.state.recentAnalyses.shift();


        }



        this.state.updatedAt =
            now();



    }


    catch(e){}



},
// ==========================================
// AGENT BUS INTEGRATION
// ==========================================



attachAgentBus(bus){


    try{


        if(!bus)
            return false;



        this.agentBus =
            bus;



        if(

            typeof bus.on==="function"

        ){


            bus.on(

                "metacognition.reflect",

                data=>{


                    this.requestReflection(

                        data || {}

                    );


                }

            );



            bus.on(

                "metacognition.error",

                data=>{


                    this.analyzeError(

                        data || {}

                    );


                }

            );


        }



        this.log(

            "info",

            "AgentBus Connected"

        );



        return true;



    }


    catch(error){


        this.log(

            "error",

            "AgentBus Attach Failed",

            error

        );


        return false;


    }


},





// ==========================================
// SEND TO AGENT BUS
// ==========================================



sendAgentEvent(event,data={}){


    try{


        if(

            this.agentBus &&

            typeof this.agentBus.emit==="function"

        ){



            this.agentBus.emit(

                event,

                data

            );


            return true;


        }


    }


    catch(e){}



    return false;


},





// ==========================================
// IPC REGISTER
// ==========================================



registerIPC(ipc){


    try{


        if(!ipc)
            return false;



        this.ipcRenderer =
            ipc;



        this.log(

            "info",

            "IPC Connected"

        );



        return true;


    }


    catch(error){


        return false;


    }


},





// ==========================================
// IPC SEND
// ==========================================



sendIPC(channel,data={}){


    try{


        if(

            this.ipcRenderer &&

            typeof this.ipcRenderer.send==="function"

        ){


            this.ipcRenderer.send(

                channel,

                data

            );


            return true;


        }


    }


    catch(e){}



    return false;


},





// ==========================================
// IPC MAIN REGISTER
// ==========================================



registerIPCMain(ipcMain){


    try{


        if(!ipcMain)
            return false;



        this.ipcMain =
            ipcMain;



        if(

            typeof ipcMain.handle==="function"

        ){



            ipcMain.handle(

                "jarvis.metacognition.state",

                async()=>{


                    return this.getState();


                }

            );




            ipcMain.handle(

                "jarvis.metacognition.reflect",

                async(event,data)=>{


                    return this.requestReflection(

                        data || {}

                    );


                }

            );




            ipcMain.handle(

                "jarvis.metacognition.error",

                async(event,data)=>{


                    return this.analyzeError(

                        data || {}

                    );


                }

            );



        }



        this.log(

            "info",

            "IPC Main Registered"

        );



        return true;


    }


    catch(error){


        this.log(

            "error",

            "IPC Main Failed",

            error

        );


        return false;


    }


},





// ==========================================
// EXPORT DATA
// ==========================================



exportData(){


    try{


        return {


            version:
                this.version,



            status:
                this.status,



            initialized:
                this.initialized,



            config:
                clone(this.config),



            state:
                clone(this.state)



        };


    }


    catch(error){


        return null;


    }


},





// ==========================================
// IMPORT DATA
// ==========================================



importData(data){


    try{


        data =
            safeObject(data);



        if(data.config){


            Object.assign(

                this.config,

                data.config

            );


        }



        if(data.state){


            this.state =

                Object.assign(

                    {},

                    this.state,

                    data.state

                );


        }



        this.state.updatedAt =
            now();



        this.log(

            "info",

            "Data Imported"

        );



        return true;



    }


    catch(error){


        this.log(

            "error",

            "Import Failed",

            error

        );


        return false;


    }


},





// ==========================================
// SERIALIZE
// ==========================================



serialize(){


    try{


        return JSON.stringify(

            this.exportData()

        );


    }


    catch(error){


        return null;


    }


},





// ==========================================
// DESERIALIZE
// ==========================================



deserialize(json){


    try{


        if(

            typeof json !==

            "string"

        ){


            return false;


        }



        let data =

            JSON.parse(json);



        return this.importData(

            data

        );


    }


    catch(error){


        return false;


    }


},





// ==========================================
// HOOK SYSTEM
// ==========================================



registerHook(name,callback){


    try{


        if(

            typeof callback !==

            "function"

        )

        return false;



        this.hooks.set(

            name,

            callback

        );



        return true;



    }


    catch(e){


        return false;


    }


},





unregisterHook(name){


    this.hooks.delete(

        name

    );


},




// ==========================================
// HOOK EMIT
// ==========================================



executeHook(name,data){


    try{


        let hook =

            this.hooks.get(

                name

            );



        if(hook){


            hook(

                data

            );


        }


    }


    catch(e){}



},

// ==========================================
// CLEANUP SYSTEM
// ==========================================



cleanup(){


    try{


        this.stopMonitoring();



        this.events.clear();



        this.hooks.clear();



        this.agentBus =
            null;



        this.ipcRenderer =
            null;



        this.ipcMain =
            null;



        this.selfModel =
            null;



        this.awareness =
            null;



        this.memory =
            null;



        this.state.recentAnalyses =
            [];



        this.status =
            "cleaned";



        this.log(

            "info",

            "Metacognition Cleanup Complete"

        );



        return true;



    }


    catch(error){


        this.log(

            "error",

            "Cleanup Failed",

            error

        );


        return false;


    }


},





// ==========================================
// DESTROY SYSTEM
// ==========================================



destroy(){


    try{


        this.cleanup();



        this.config =
            Object.assign(

                {},

                DEFAULT_CONFIG

            );



        this.initialized =
            false;



        this.status =
            "destroyed";



        this.state =
        {


            id:
                uid("metacognition"),



            createdAt:
                now(),



            updatedAt:
                now(),



            recentAnalyses:[]


        };



        this.log(

            "info",

            "Metacognition Destroyed"

        );



        return true;



    }


    catch(error){


        return false;


    }


},





// ==========================================
// GET HISTORY
// ==========================================



getHistory(){


    return clone(

        this.state.recentAnalyses

    );


},





// ==========================================
// LOGGING ENGINE
// ==========================================



log(level="info",message="",data=null){


    try{


        let prefix =

        "[JARVIS METACOGNITION]";



        let output = {


            time:
                now(),


            level:
                level,


            message:
                message,


            data:
                data


        };



        if(level==="error"){


            console.error(

                prefix,

                output

            );


        }

        else if(level==="warn"){


            console.warn(

                prefix,

                output

            );


        }

        else{


            console.log(

                prefix,

                output

            );


        }


    }


    catch(e){}



},





// ==========================================
// DEBUG INFO
// ==========================================



debug(){


    return {


        version:
            this.version,


        status:
            this.status,


        initialized:
            this.initialized,


        monitoring:
            this.state.monitoring,


        history:

            this.state
            .recentAnalyses
            .length


    };


},





// ==========================================
// SET CONFIG
// ==========================================



setConfig(config={}){


    try{


        Object.assign(

            this.config,

            safeObject(config)

        );



        this.state.updatedAt =
            now();



        return true;


    }


    catch(e){


        return false;


    }


},





// ==========================================
// GET CONFIG
// ==========================================



getConfig(){


    return clone(

        this.config

    );


},





// ==========================================
// FINAL HEALTH CHECK
// ==========================================



healthCheck(){


    return {


        module:
            MODULE,


        version:
            VERSION,


        status:
            this.status,


        initialized:
            this.initialized,


        monitoring:
            this.state.monitoring,


        timestamp:
            now()


    };


},



};




// ==========================================
// GLOBAL EXPORT
// ==========================================



window.Metacognition =

    Metacognition;




// ==========================================
// AUTO INIT
// ==========================================



try{


    Metacognition.init();



}


catch(error){


    console.error(

        "Metacognition Auto Init Failed",

        error

    );


}




// ==========================================
// LOADED
// ==========================================



console.log(

    "🧠 Metacognition V2 PRO MAX Loaded"

);



})();