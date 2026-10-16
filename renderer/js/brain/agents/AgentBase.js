// ==========================================
// JARVIS V10 PRODUCTION
// Autonomous Agent Framework
// AgentBase V3
// PART 1 / 5
// Core Engine + Lifecycle
// ==========================================


"use strict";


(function(){



class AgentBase {



constructor(config={}){


    this.id =

    config.id ||

    (

        "AGENT_" +

        Date.now() +

        "_" +

        Math.floor(

            Math.random()*9999

        )

    );



    this.name =

    config.name ||

    "UnknownAgent";



    this.version =

    config.version ||

    "3.0.0";



    this.type =

    config.type ||

    "generic";



    this.description =

    config.description ||

    "";





    // ==================================
    // LIFECYCLE
    // ==================================


    this.status =

    "created";


    this.enabled = true;


    this.running = false;


    this.started = null;


    this.stopped = null;


    this.created = Date.now();





    // ==================================
    // CONNECTIONS
    // ==================================


    this.bus = null;


    this.manager = null;


    this.registry = null;


    this.memoryEngine = null;





    // ==================================
    // EVENT SYSTEM
    // ==================================


    this.listeners = new Map();





    // ==================================
    // MEMORY
    // ==================================


    this.memory = [];


    this.maxMemory =

    config.maxMemory ||

    1000;





    // ==================================
    // METRICS
    // ==================================


    this.metricsData = {


        tasks:0,


        success:0,


        failed:0,


        errors:0,


        totalTime:0,


        averageTime:0


    };





    // ==================================
    // ERROR
    // ==================================


    this.lastError = null;


    this.lastTask = null;





    // ==================================
    // CONFIG
    // ==================================


    this.config = config;





    console.log(

        "🤖 AgentBase V3 Created:",

        this.name

    );


}






// ==========================================
// INITIALIZE
// ==========================================


initialize(context={}){


    this.manager =

    context.manager ||

    null;



    this.bus =

    context.bus ||

    null;



    this.registry =

    context.registry ||

    null;



    this.memoryEngine =

    context.memory ||

    null;



    this.status =

    "initialized";



    this.emit(

        "initialized",

        this

    );



    return true;


}






// ==========================================
// START
// ==========================================


start(){


    if(

        this.running

    )

        return true;




    if(

        !this.enabled

    ){

        return false;

    }




    try{


        this.running = true;


        this.status =

        "online";



        this.started =

        Date.now();




        this.onStart();




        this.emit(

            "started",

            this

        );



        console.log(

            "🟢 Agent Started:",

            this.name

        );



        return true;


    }


    catch(error){


        this.reportError(error);


        return false;


    }


}






// ==========================================
// STOP
// ==========================================


stop(){


    if(

        !this.running

    )

        return true;




    try{


        this.running = false;


        this.status =

        "offline";



        this.stopped =

        Date.now();




        this.onStop();




        this.emit(

            "stopped",

            this

        );



        console.log(

            "🔴 Agent Stopped:",

            this.name

        );



        return true;


    }


    catch(error){


        this.reportError(error);


        return false;


    }


}






// ==========================================
// RESTART
// ==========================================


restart(){


    this.stop();



    return this.start();


}






// ==========================================
// ENABLE
// ==========================================


enable(){


    this.enabled = true;


    return true;


}






// ==========================================
// DISABLE
// ==========================================


disable(){


    this.enabled = false;


    this.stop();


    return true;


}






// ==========================================
// CHILD HOOKS
// ==========================================


onStart(){}



onStop(){}






// ==========================================
// STATUS CHECK
// ==========================================


isRunning(){


    return this.running;


}




isEnabled(){


    return this.enabled;


}
// ==========================================
// EXECUTE TASK ENGINE
// ==========================================


async execute(task = {}){


    if(!this.enabled){


        return {

            success:false,

            error:"Agent Disabled"

        };


    }




    if(!this.running){


        return {

            success:false,

            error:"Agent Offline"

        };


    }




    const startTime =

    Date.now();




    this.metricsData.tasks++;

    this.lastTask = task;



    try{



        const result =

        await this.process(task);




        const executionTime =

        Date.now()

        -

        startTime;




        this.updateMetrics(

            executionTime,

            true

        );





        this.onTaskComplete(

            result

        );




        return {


            success:true,


            result:result,


            executionTime:executionTime



        };



    }


    catch(error){



        this.updateMetrics(

            Date.now() - startTime,

            false

        );




        this.onTaskFailed(

            error

        );




        this.reportError(

            error

        );




        return {


            success:false,


            error:error.message



        };



    }


}






// ==========================================
// PROCESS TASK
// CHILD AGENT OVERRIDE
// ==========================================


async process(task){



    console.warn(

        "⚠ Process not implemented:",

        this.name

    );



    return {


        success:false,


        error:

        "process() not implemented"



    };


}






// ==========================================
// RECEIVE MESSAGE
// ==========================================


async receive(message={}){


    return this.execute(

        message

    );


}






// ==========================================
// UPDATE METRICS
// ==========================================


updateMetrics(

time,

success

){



    this.metricsData.totalTime += time;




    this.metricsData.averageTime =


    this.metricsData.totalTime

    /

    this.metricsData.tasks;





    if(success){


        this.metricsData.success++;


    }

    else{


        this.metricsData.failed++;


    }



}






// ==========================================
// HEARTBEAT SYSTEM
// ==========================================


heartbeat(){



    this.lastHeartbeat =

    Date.now();




    this.emit(

        "heartbeat",

        {

            agent:this.name,

            time:this.lastHeartbeat

        }

    );



    return true;


}






// ==========================================
// HEALTH CHECK
// ==========================================


health(){



    return {


        id:this.id,


        name:this.name,


        version:this.version,


        status:this.status,


        enabled:this.enabled,


        running:this.running,



        uptime:


        this.started

        ?

        Date.now() -

        this.started

        :

        0,



        heartbeat:


        Date.now()

        -

        this.lastHeartbeat,



        metrics:


        this.metrics()



    };


}






// ==========================================
// METRICS REPORT
// ==========================================


metrics(){



    return {


        tasks:

        this.metricsData.tasks,



        success:

        this.metricsData.success,



        failed:

        this.metricsData.failed,



        errors:

        this.metricsData.errors,



        averageTime:

        this.metricsData.averageTime



    };


}






// ==========================================
// TASK COMPLETE HOOK
// ==========================================


onTaskComplete(result){



    this.remember({


        type:

        "task_success",



        result:result



    });



}






// ==========================================
// TASK FAILED HOOK
// ==========================================


onTaskFailed(error){



    this.remember({



        type:

        "task_failed",



        error:

        error.message || error



    });



}
// ==========================================
// MEMORY ENGINE
// ==========================================


// ==========================================
// STORE MEMORY
// ==========================================

remember(data = {}){


    if(!data)

        return false;




    const memory = {


        id:

        this.generateMemoryID(),



        timestamp:

        Date.now(),



        data:data



    };




    this.memory.push(

        memory

    );




    if(

        this.memory.length >

        this.maxMemory

    ){


        this.memory.shift();


    }




    return memory;


}






// ==========================================
// RECALL MEMORY
// ==========================================

recall(limit = 20){



    return this.memory.slice(

        -limit

    );


}






// ==========================================
// SEARCH MEMORY
// ==========================================

searchMemory(query){



    if(!query)

        return [];




    const text =


    String(query)

    .toLowerCase();




    return this.memory.filter(

        item =>



        JSON.stringify(

            item.data

        )

        .toLowerCase()

        .includes(text)



    );


}






// ==========================================
// REMOVE MEMORY
// ==========================================

forget(){



    this.memory = [];




    console.log(

        "🧹 Memory Cleared:",

        this.name

    );




    return true;


}






// ==========================================
// MEMORY STATS
// ==========================================

memoryStats(){



    return {


        total:

        this.memory.length,



        limit:

        this.maxMemory,



        latest:


        this.memory[

            this.memory.length - 1

        ]

        ||

        null



    };


}






// ==========================================
// LEARNING SYSTEM
// ==========================================

learn(experience = {}){



    const data = {


        agent:

        this.name,



        timestamp:

        Date.now(),



        experience:

        experience



    };




    this.remember(

        data

    );




    this.emit(

        "learned",

        data

    );




    return true;


}






// ==========================================
// EXPERIENCE QUERY
// ==========================================

getExperience(type){



    return this.memory.filter(

        item =>


        item.data &&

        item.data.experience &&

        item.data.experience.type === type



    );


}






// ==========================================
// MEMORY ID
// ==========================================

generateMemoryID(){



    return (

        "MEM_" +

        Date.now()

        +

        "_" +

        Math.floor(

            Math.random()*9999

        )

    );


}






// ==========================================
// CONNECT AGENT BUS
// ==========================================

connectBus(bus){



    if(!bus){


        console.warn(

            "⚠ AgentBus Missing:",

            this.name

        );


        return false;


    }




    this.bus = bus;




    if(

        typeof bus.registerAgent ===

        "function"

    ){


        bus.registerAgent(

            this.name,

            this

        );


    }




    this.emit(

        "bus.connected",

        {

            agent:this.name

        }

    );




    console.log(

        "📡 Bus Connected:",

        this.name

    );




    return true;


}






// ==========================================
// SEND MESSAGE
// ==========================================

send(

type,

data = {},

priority = "normal"

){



    if(!this.bus)

        return false;




    if(

        typeof this.bus.publish ===

        "function"

    ){


        return this.bus.publish({


            type:type,


            sender:this.name,


            priority:priority,


            data:data



        });



    }




    return false;


}






// ==========================================
// BROADCAST
// ==========================================

broadcast(message = {}){


    if(

        !message.type

    )

        return false;




    return this.send(


        message.type,


        message.data || {},


        message.priority || "normal"



    );


}






// ==========================================
// RECEIVE BUS MESSAGE
// ==========================================

async onMessage(message = {}){


    console.log(

        "📩",

        this.name,

        "received",

        message.type

    );




    return this.receive(

        message

    );


}
// ==========================================
// EVENT SYSTEM
// ==========================================


// ==========================================
// ON EVENT
// ==========================================

on(

event,

callback

){



    if(

        !event ||

        typeof callback !== "function"

    ){

        return false;

    }




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






// ==========================================
// OFF EVENT
// ==========================================

off(event){



    if(

        !event

    )

        return false;




    return this.events.delete(

        event

    );


}






// ==========================================
// EMIT EVENT
// ==========================================

emit(

event,

data = {}

){



    const listeners =

    this.events.get(event);




    if(!listeners)

        return false;




    listeners.forEach(fn=>{


        try{


            fn(data);



        }

        catch(error){


            console.error(

                "Event Handler Error:",

                error

            );


        }



    });




    return true;


}






// ==========================================
// ERROR REPORT SYSTEM
// ==========================================

reportError(error){



    this.metricsData.errors++;



    this.lastError = error;




    const report = {


        agent:

        this.name,



        message:

        error.message || error,



        time:

        Date.now()



    };




    this.remember({


        type:

        "error",



        report:report



    });




    this.emit(

        "error",

        report

    );




    console.error(

        "❌ Agent Error:",

        report

    );



    return report;


}






// ==========================================
// CONFIG MANAGEMENT
// ==========================================

updateConfig(config = {}){



    this.config = {


        ...this.config,

        ...config



    };




    this.emit(

        "config.updated",

        this.config

    );




    console.log(

        "⚙ Config Updated:",

        this.name

    );




    return this.config;


}






// ==========================================
// GET CONFIG
// ==========================================

getConfig(key=null){



    if(!key)

        return this.config;




    return this.config[key] ?? null;


}






// ==========================================
// AGENT ENABLE
// ==========================================

enable(){



    this.enabled = true;



    if(

        this.status === "disabled"

    ){


        this.status = "offline";


    }




    this.emit(

        "enabled",

        {

            agent:this.name

        }

    );




    return true;


}






// ==========================================
// AGENT DISABLE
// ==========================================

disable(){



    this.enabled = false;



    this.status = "disabled";




    this.emit(

        "disabled",

        {

            agent:this.name

        }

    );




    return true;


}






// ==========================================
// RESTART
// ==========================================

restart(){



    try{



        this.stop();



        return this.start();



    }

    catch(error){


        this.reportError(

            error

        );


        return false;


    }


}






// ==========================================
// SAFE SHUTDOWN
// ==========================================

shutdown(){



    try{



        this.stop();




        if(

            this.bus &&

            typeof this.bus.unregisterAgent ===

            "function"

        ){



            this.bus.unregisterAgent(

                this.name

            );


        }




        this.emit(

            "shutdown",

            {

                agent:this.name

            }

        );




        console.log(

            "🔻 Agent Shutdown:",

            this.name

        );




        return true;



    }

    catch(error){


        this.reportError(

            error

        );


        return false;


    }


}






// ==========================================
// SUMMARY REPORT
// ==========================================

summary(){



    return {


        id:

        this.id,



        name:

        this.name,



        version:

        this.version,



        type:

        this.type,



        status:

        this.status,



        enabled:

        this.enabled,



        metrics:

        this.metrics(),



        memory:

        this.memoryStats()



    };


}
// ==========================================
// HEALTH REPORT
// ==========================================

health(){


    return {


        id:

        this.id,


        name:

        this.name,


        version:

        this.version,


        type:

        this.type,


        status:

        this.status,


        enabled:

        this.enabled,


        uptime:

        this.started

        ?

        Date.now() -

        this.started

        :

        0,


        metrics:

        this.metrics(),


        memory:

        this.memoryStats(),


        config:

        this.config



    };


}





// ==========================================
// DIAGNOSTIC CHECK
// ==========================================

diagnose(){



    const problems = [];




    if(

        !this.enabled

    ){

        problems.push(

            "Agent Disabled"

        );

    }




    if(

        this.status !== "online"

    ){

        problems.push(

            "Agent Offline"

        );

    }




    if(

        this.errors > 0

    ){

        problems.push(

            "Agent Has Errors"

        );

    }




    return {


        healthy:

        problems.length === 0,


        problems:problems,


        checked:

        Date.now()



    };


}






// ==========================================
// METRICS REPORT
// ==========================================

metrics(){


    return {


        tasks:

        this.tasks,


        success:

        this.success,


        failures:

        this.failures,


        errors:

        this.errors,


        averageTime:

        this.averageTime,


        lastTask:

        this.lastTask,


        lastError:

        this.lastError



    };


}






// ==========================================
// DEBUG INFO
// ==========================================

debug(){



    return {


        identity:


        {

            id:this.id,

            name:this.name,

            version:this.version,

            type:this.type

        },



        state:


        {

            status:this.status,

            enabled:this.enabled

        },



        performance:

        this.metrics(),



        memory:

        this.memoryStats(),



        health:

        this.diagnose()



    };


}






// ==========================================
// SERIALIZE AGENT
// ==========================================

toJSON(){



    return {


        id:

        this.id,


        name:

        this.name,


        version:

        this.version,


        type:

        this.type,


        status:

        this.status,


        enabled:

        this.enabled



    };


}






// ==========================================
// VERSION INFO
// ==========================================

info(){



    return {


        framework:

        "JARVIS Autonomous Agent Core",



        agent:

        this.name,



        version:

        this.version,



        created:

        this.started



    };


}





// ==========================================
// CLASS END
// ==========================================


}




// ==========================================
// GLOBAL EXPORT
// ==========================================

window.AgentBase = AgentBase;




console.log(

    "🤖 AgentBase V3 Production Loaded"

);





})();