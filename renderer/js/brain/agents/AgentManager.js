// ==========================================
// JARVIS V10 PRODUCTION
// Autonomous Agent Core
// AgentManager V10 PRO
// PART 1-2 / 7 (syntax-fixed, class left open — parts 3-7 still to come)
// Core Engine + Registry + Lifecycle Base
// Task Queue + Priority Scheduler + Execution Pipeline
// ==========================================

"use strict";


(function () {


class AgentManager {


    constructor() {

        this.version = "10.0.0 PRO";

        this.started = Date.now();

        this.running = true;


        // ==================================
        // AGENT REGISTRY
        // ==================================

        this.agents = new Map();


        // ==================================
        // STATES
        // ==================================

        this.states = {
            idle: "idle",
            running: "running",
            stopped: "stopped",
            error: "error",
            offline: "offline"
        };


        // ==================================
        // TASK STORAGE
        // ==================================

        this.tasks = new Map();

        this.taskCounter = 0;


        // ==================================
        // EVENT SYSTEM
        // ==================================

        this.listeners = new Map();


        // ==================================
        // MIDDLEWARE
        // ==================================

        this.middlewares = [];


        // ==================================
        // STATISTICS
        // ==================================

        this.stats = {

            agentsRegistered: 0,
            agentsRemoved: 0,
            tasksReceived: 0,
            tasksCompleted: 0,
            tasksFailed: 0,
            errors: 0

        };

        console.log("🧠 AgentManager V10 PRO Initialized");

    }


    // ==========================================
    // REGISTER AGENT
    // ==========================================

    register(name, agent, options = {}) {

        try {

            if (!name || !agent) {

                throw new Error("Invalid Agent");

            }

            if (this.agents.has(name)) {

                console.warn("⚠ Agent Already Registered:", name);

                return false;

            }

            const instance = {

                name: name,
                version: options.version || "1.0.0",
                status: this.states.idle,
                health: "healthy",
                started: Date.now(),
                lastActive: Date.now(),
                load: 0,
                agent: agent

            };

            this.agents.set(name, instance);

            this.stats.agentsRegistered++;

            console.log("🤖 Agent Registered:", name);

            this.emit("agent.registered", instance);

            return true;

        }
        catch (error) {

            console.error("❌ Register Failed", error);

            this.stats.errors++;

            return false;

        }

    }


    // ==========================================
    // REMOVE AGENT
    // ==========================================

    unregister(name) {

        const agent = this.agents.get(name);

        if (!agent)
            return false;

        this.agents.delete(name);

        this.stats.agentsRemoved++;

        this.emit("agent.removed", agent);

        console.log("🗑 Agent Removed:", name);

        return true;

    }


    // ==========================================
    // GET AGENT INSTANCE
    // ==========================================

    get(name) {

        const item = this.agents.get(name);

        return item ? item.agent : null;

    }


    // ==========================================
    // GET FULL INFO
    // ==========================================

    getInfo(name) {

        return this.agents.get(name) || null;

    }


    // ==========================================
    // CHECK EXIST
    // ==========================================

    has(name) {

        return this.agents.has(name);

    }


    // ==========================================
    // LIST
    // ==========================================

    list() {

        return [...this.agents.keys()];

    }


    // ==========================================
    // ALL
    // ==========================================

    all() {

        return [...this.agents.values()];

    }


    // ==========================================
    // START AGENT
    // ==========================================

    startAgent(name) {

        const item = this.agents.get(name);

        if (!item)
            return false;

        try {

            item.status = this.states.running;

            item.lastActive = Date.now();

            if (typeof item.agent.start === "function") {

                item.agent.start();

            }

            this.emit("agent.started", item);

            return true;

        }
        catch (error) {

            this.agentError(name, error);

            return false;

        }

    }


    // ==========================================
    // STOP AGENT
    // ==========================================

    stopAgent(name) {

        const item = this.agents.get(name);

        if (!item)
            return false;

        try {

            item.status = this.states.stopped;

            if (typeof item.agent.stop === "function") {

                item.agent.stop();

            }

            this.emit("agent.stopped", item);

            return true;

        }
        catch (error) {

            this.agentError(name, error);

            return false;

        }

    }


    // ==========================================
    // HEALTH
    // ==========================================

    health(name) {

        const item = this.agents.get(name);

        if (!item)
            return null;

        return {

            name: item.name,
            status: item.status,
            health: item.health,
            load: item.load,
            uptime: Date.now() - item.started

        };

    }


    // ==========================================
    // EVENT ON
    // ==========================================

    on(event, callback) {

        if (typeof callback !== "function")
            return false;

        if (!this.listeners.has(event)) {

            this.listeners.set(event, []);

        }

        this.listeners.get(event).push(callback);

        return true;

    }


    // ==========================================
    // EVENT OFF
    // ==========================================

    off(event) {

        this.listeners.delete(event);

    }


    // ==========================================
    // EMIT
    // ==========================================

    emit(event, data) {

        const list = this.listeners.get(event);

        if (!list)
            return;

        list.forEach(fn => {

            try {

                fn(data);

            }
            catch (error) {

                console.error("Event Error", error);

            }

        });

    }


    // ==========================================
    // ERROR HANDLER
    // ==========================================

    agentError(name, error) {

        const item = this.agents.get(name);

        if (item) {

            item.status = this.states.error;

            item.health = "failed";

        }

        this.stats.errors++;

        console.error("❌ Agent Error:", name, error);

        this.emit("agent.error", { name, error });

    }


    // ==========================================
    // STATUS
    // ==========================================

    status() {

        return {

            version: this.version,
            running: this.running,
            agents: this.agents.size,
            tasks: this.tasks.size,
            uptime: Date.now() - this.started,
            stats: this.stats

        };

    }


    // ==========================================
    // PART 2 / 7
    // Task Queue + Priority Scheduler + Execution Pipeline
    // ==========================================


    // ==========================================
    // CREATE TASK
    // ==========================================

    createTask(task = {}) {

        try {

            if (!task.action) {

                throw new Error("Task action missing");

            }

            const id = "TASK_" + (++this.taskCounter);

            const newTask = {

                id: id,
                action: task.action,
                data: task.data || {},
                agent: task.agent || null,
                priority: task.priority || "normal",
                status: "queued",
                created: Date.now(),
                started: null,
                completed: null,
                retries: 0,
                result: null,
                error: null

            };

            this.tasks.set(id, newTask);

            this.stats.tasksReceived++;

            this.addToQueue(newTask);

            this.emit("task.created", newTask);

            return newTask;

        }
        catch (error) {

            console.error("❌ Task Create Failed", error);

            this.stats.errors++;

            return null;

        }

    }


    // ==========================================
    // QUEUE INITIALIZER
    // ==========================================

    initQueues() {

        if (!this.taskQueue)
            this.taskQueue = [];

        if (!this.priorityQueue)
            this.priorityQueue = [];

        if (!this.backgroundQueue)
            this.backgroundQueue = [];

    }


    // ==========================================
    // ADD TASK TO QUEUE
    // ==========================================

    addToQueue(task) {

        this.initQueues();

        switch (task.priority) {

            case "urgent":
            case "high":

                this.priorityQueue.push(task);

                break;

            case "background":

                this.backgroundQueue.push(task);

                break;

            default:

                this.taskQueue.push(task);

        }

        this.sortQueues();

    }


    // ==========================================
    // SORT PRIORITY
    // ==========================================

    sortQueues() {

        const priority = {

            urgent: 4,
            high: 3,
            normal: 2,
            background: 1

        };

        this.priorityQueue.sort((a, b) => {

            return priority[b.priority] - priority[a.priority];

        });

    }


    // ==========================================
    // GET NEXT TASK
    // ==========================================

    nextTask() {

        this.initQueues();

        if (this.priorityQueue.length) {

            return this.priorityQueue.shift();

        }

        if (this.taskQueue.length) {

            return this.taskQueue.shift();

        }

        if (this.backgroundQueue.length) {

            return this.backgroundQueue.shift();

        }

        return null;

    }


    // ==========================================
    // UPDATE TASK
    // ==========================================

    updateTask(id, status, extra = {}) {

        const task = this.tasks.get(id);

        if (!task)
            return false;

        task.status = status;

        Object.assign(task, extra);

        this.emit("task.updated", task);

        return true;

    }


    // ==========================================
    // START TASK
    // ==========================================

    startTask(id) {

        return this.updateTask(id, "running", {

            started: Date.now()

        });

    }


    // ==========================================
    // COMPLETE TASK
    // ==========================================

    completeTask(id, result = null) {

        const task = this.tasks.get(id);

        if (!task)
            return false;

        task.status = "completed";

        task.completed = Date.now();

        task.result = result;

        this.stats.tasksCompleted++;

        this.emit("task.completed", task);

        return true;

    }


    // ==========================================
    // FAIL TASK
    // ==========================================

    failTask(id, error) {

        const task = this.tasks.get(id);

        if (!task)
            return false;

        task.status = "failed";

        task.error = error;

        this.stats.tasksFailed++;

        this.emit("task.failed", task);

        return true;

    }


    // ==========================================
    // RETRY TASK
    // ==========================================

    retryTask(id) {

        const task = this.tasks.get(id);

        if (!task)
            return false;

        task.retries++;

        task.status = "queued";

        task.error = null;

        this.addToQueue(task);

        return true;

    }


    // ==========================================
    // CANCEL TASK
    // ==========================================

    cancelTask(id) {

        const task = this.tasks.get(id);

        if (!task)
            return false;

        task.status = "cancelled";

        this.emit("task.cancelled", task);

        return true;

    }


    // ==========================================
    // EXECUTE TASK
    // ==========================================

    async executeTask(task) {

        try {

            if (!task)
                return false;

            this.startTask(task.id);

            const agent = task.agent ? this.get(task.agent) : null;

            if (!agent) {

                throw new Error("Agent Not Found");

            }

            let result;

            if (typeof agent.execute === "function") {

                result = await agent.execute(task.data);

            }
            else {

                throw new Error("Execute Method Missing");

            }

            this.completeTask(task.id, result);

            return result;

        }
        catch (error) {

            this.failTask(task.id, error.message);

            return false;

        }

    }


    // ==========================================
    // PROCESS QUEUE
    // ==========================================

    async processQueue() {

        const task = this.nextTask();

        if (!task)
            return false;

        await this.executeTask(task);

        return true;

    }


    // ==========================================
    // QUEUE STATUS
    // ==========================================

    queueStatus() {

        this.initQueues();

        return {

            normal: this.taskQueue.length,
            priority: this.priorityQueue.length,
            background: this.backgroundQueue.length,
            total: this.tasks.size

        };

    }


    // ==========================================
    // TASK INFO
    // ==========================================

    taskInfo(id) {

        return this.tasks.get(id) || null;

    }


    // ==========================================
    // CLEANUP OLD TASKS
    // ==========================================

    cleanupTasks(limit = 500) {

        if (this.tasks.size <= limit)
            return true;

        const list = [...this.tasks.values()].sort((a, b) => a.created - b.created);

        while (this.tasks.size > limit) {

            const old = list.shift();

            if (old)
                this.tasks.delete(old.id);

        }

        return true;

    }


// ==========================================
// >>> CLASS INTENTIONALLY LEFT OPEN HERE <<<
// Parts 3-7/7 continue the AgentManager class body below.
// Do not add a closing brace for the class or the IIFE
// until the final part (Part 7/7) has been pasted in.
// ==========================================
// ==========================================
// JARVIS V10 PRODUCTION
// AgentManager V10 PRO
// PART 3 / 7
// Agent Dispatch + Execution Manager
// ==========================================


// ==========================================
// DISPATCH TASK
// ==========================================

dispatch(task = {}) {


    const created =

    this.createTask(task);



    if(!created){

        return false;

    }



    console.log(

        "📤 Task Dispatched:",

        created.id

    );



    return created;


}





// ==========================================
// DISPATCH DIRECT TO AGENT
// ==========================================

dispatchToAgent(
    agentName,
    action,
    data = {},
    priority = "normal"
){


    if(
        !this.has(agentName)
    ){

        console.error(

            "❌ Agent Not Found:",

            agentName

        );

        return false;

    }



    return this.dispatch({

        agent:agentName,

        action:action,

        data:data,

        priority:priority

    });


}





// ==========================================
// RUN NEXT TASK
// ==========================================

async runNext(){


    if(!this.running)

        return false;



    const task =

    this.nextTask();



    if(!task)

        return false;



    this.runningTasks =

    this.runningTasks || new Map();



    this.runningTasks.set(

        task.id,

        task

    );



    const result =

    await this.executeTask(task);



    this.runningTasks.delete(

        task.id

    );



    return result;


}





// ==========================================
// RUN QUEUE LOOP
// ==========================================

startQueueWorker(){


    if(this.queueWorker)

        return false;



    this.queueWorker = setInterval(

        async ()=>{


            if(

                this.running

            ){

                await this.runNext();

            }


        },

        1000

    );



    console.log(

        "⚙ Task Queue Worker Started"

    );



    return true;


}





// ==========================================
// STOP QUEUE WORKER
// ==========================================

stopQueueWorker(){


    if(this.queueWorker){


        clearInterval(

            this.queueWorker

        );


        this.queueWorker = null;


    }



    console.log(

        "🛑 Task Queue Worker Stopped"

    );



    return true;


}





// ==========================================
// ACTIVE TASKS
// ==========================================

activeTasks(){


    if(!this.runningTasks)

        return [];



    return [

        ...this.runningTasks.values()

    ];


}





// ==========================================
// TASK SEARCH
// ==========================================

findTask(id){


    return (

        this.tasks.get(id)

        ||

        null

    );


}





// ==========================================
// REMOVE TASK
// ==========================================

removeTask(id){


    if(

        !this.tasks.has(id)

    )

        return false;



    this.tasks.delete(id);



    console.log(

        "🗑 Task Removed:",

        id

    );



    return true;


}





// ==========================================
// RETRY FAILED TASKS
// ==========================================

retryFailedTasks(){


    let count = 0;



    this.tasks.forEach(task=>{


        if(

            task.status === "failed"

        ){


            this.retryTask(

                task.id

            );


            count++;


        }


    });



    return count;


}





// ==========================================
// TASK STATISTICS
// ==========================================

taskStats(){


    let queued = 0;

    let running = 0;

    let completed = 0;

    let failed = 0;



    this.tasks.forEach(task=>{


        switch(task.status){


            case "queued":

                queued++;

                break;


            case "running":

                running++;

                break;


            case "completed":

                completed++;

                break;


            case "failed":

                failed++;

                break;


        }


    });



    return {


        total:

        this.tasks.size,


        queued,

        running,

        completed,

        failed


    };


}





// ==========================================
// AGENT EXECUTION CHECK
// ==========================================

canExecute(agentName){


    const agent =

    this.getInfo(agentName);



    if(!agent)

        return false;



    return (

        agent.health === "healthy"

        &&

        agent.status !== "offline"

    );


}





// ==========================================
// SAFE EXECUTE
// ==========================================

async safeExecute(
agentName,
method,
data={}
){


    try{


        const agent =

        this.get(agentName);



        if(!agent)

            throw new Error(

                "Agent Missing"

            );



        if(

            typeof agent[method] !==

            "function"

        ){

            throw new Error(

                "Method Missing"

            );

        }



        return await agent[method](data);


    }

    catch(error){


        this.agentError(

            agentName,

            error

        );


        return false;


    }


}
// ==========================================
// JARVIS V10 PRODUCTION
// AgentManager V10 PRO
// PART 4 / 7
// Middleware + Hooks + Agent Communication
// ==========================================


// ==========================================
// ADD MIDDLEWARE
// ==========================================

use(middleware){


    if(
        typeof middleware !== "function"
    ){

        console.error(

            "❌ Invalid Middleware"

        );

        return false;

    }



    this.middlewares.push(

        middleware

    );


    console.log(

        "🔗 Middleware Added"

    );


    return true;


}





// ==========================================
// REMOVE MIDDLEWARE
// ==========================================

removeMiddleware(middleware){


    const index =

    this.middlewares.indexOf(

        middleware

    );



    if(index === -1)

        return false;



    this.middlewares.splice(

        index,

        1

    );



    return true;


}





// ==========================================
// RUN MIDDLEWARE PIPELINE
// ==========================================

async runMiddleware(
task
){


    let data = task;



    for(
        const middleware of this.middlewares
    ){


        try{


            data =

            await middleware(

                data

            );


        }

        catch(error){


            console.error(

                "Middleware Error",

                error

            );


            this.stats.errors++;


        }


    }



    return data;


}





// ==========================================
// AGENT MESSAGE SEND
// ==========================================

send(
agentName,
message
){


    const agent =

    this.get(agentName);



    if(!agent){

        console.warn(

            "⚠ Agent Missing:",

            agentName

        );

        return false;

    }



    try{


        if(

            typeof agent.receive ===

            "function"

        ){


            return agent.receive(

                message

            );


        }



        if(

            typeof agent.message ===

            "function"

        ){


            return agent.message(

                message

            );


        }



        return false;


    }

    catch(error){


        this.agentError(

            agentName,

            error

        );


        return false;


    }


}





// ==========================================
// BROADCAST MESSAGE
// ==========================================

broadcast(message){


    const results = {};



    this.agents.forEach(

        (item,name)=>{


            try{


                if(

                    typeof item.agent.receive ===

                    "function"

                ){


                    results[name] =

                    item.agent.receive(

                        message

                    );


                }


            }

            catch(error){


                results[name] = false;


                this.agentError(

                    name,

                    error

                );


            }


        }

    );



    return results;


}





// ==========================================
// AGENT COMMAND
// ==========================================

command(
agentName,
command,
data={}
){


    return this.send(

        agentName,

        {

            type:"command",

            command,

            data,

            timestamp:Date.now()

        }

    );


}





// ==========================================
// AGENT EVENT TRIGGER
// ==========================================

trigger(
event,
data={}
){


    this.emit(

        event,

        {

            data,

            time:

            Date.now()

        }

    );


    return true;


}





// ==========================================
// AGENT LIFECYCLE ALL START
// ==========================================

startAll(){


    let started = 0;



    this.agents.forEach(

        (item,name)=>{


            if(

                this.startAgent(name)

            ){

                started++;

            }


        }

    );



    console.log(

        "🚀 Agents Started:",

        started

    );



    return started;


}





// ==========================================
// AGENT LIFECYCLE ALL STOP
// ==========================================

stopAll(){


    let stopped = 0;



    this.agents.forEach(

        (item,name)=>{


            if(

                this.stopAgent(name)

            ){

                stopped++;

            }


        }

    );



    console.log(

        "🛑 Agents Stopped:",

        stopped

    );



    return stopped;


}





// ==========================================
// AGENT SNAPSHOT
// ==========================================

snapshot(){


    return {


        version:this.version,


        agents:

        this.list(),


        tasks:

        this.taskStats(),


        queue:

        this.queueStatus(),


        uptime:

        Date.now() -

        this.started


    };


}// ==========================================
// JARVIS V10 PRODUCTION
// AgentManager V10 PRO
// PART 5 / 7
// Recovery + Monitoring + Fault Detection
// ==========================================


// ==========================================
// RECOVERY SYSTEM
// ==========================================

recoverAgent(name){


    const item =

    this.agents.get(name);



    if(!item)

        return false;



    try{


        item.status =

        this.states.idle;



        item.health =

        "healthy";



        item.load =

        0;



        this.stats.recovered =

        (this.stats.recovered || 0) + 1;



        console.log(

            "♻ Agent Recovered:",

            name

        );



        this.emit(

            "agent.recovered",

            item

        );



        return true;


    }

    catch(error){


        console.error(

            "❌ Recovery Failed:",

            error

        );


        return false;


    }


}





// ==========================================
// AUTO RECOVER FAILED AGENTS
// ==========================================

autoRecover(){


    let recovered = 0;



    this.agents.forEach(

        (item,name)=>{


            if(

                item.status ===

                this.states.error

            ){


                if(

                    this.recoverAgent(name)

                ){

                    recovered++;

                }


            }


        }

    );



    return recovered;


}





// ==========================================
// AGENT MONITOR
// ==========================================

monitor(){


    const report = [];



    this.agents.forEach(

        (item)=>{


            report.push({


                name:

                item.name,


                status:

                item.status,


                health:

                item.health,


                load:

                item.load,


                uptime:

                Date.now()

                -

                item.started


            });


        }

    );



    return report;


}





// ==========================================
// HEALTH CHECK ALL
// ==========================================

healthCheck(){


    let healthy = 0;

    let failed = 0;



    this.agents.forEach(

        item=>{


            if(

                item.health ===

                "healthy"

            ){

                healthy++;

            }

            else{

                failed++;

            }


        }

    );



    return {


        total:

        this.agents.size,


        healthy,

        failed,


        time:

        Date.now()


    };


}





// ==========================================
// LOAD UPDATE
// ==========================================

updateLoad(
name,
value
){


    const item =

    this.agents.get(name);



    if(!item)

        return false;



    item.load =

    Math.max(

        0,

        Math.min(

            100,

            value

        )

    );



    item.lastActive =

    Date.now();



    return true;


}





// ==========================================
// AGENT HEARTBEAT
// ==========================================

heartbeat(name){


    const item =

    this.agents.get(name);



    if(!item)

        return false;



    item.lastActive =

    Date.now();



    if(

        item.status ===

        this.states.error

    ){

        this.recoverAgent(

            name

        );

    }



    return true;


}





// ==========================================
// CHECK OFFLINE AGENTS
// ==========================================

checkTimeout(
timeout = 60000
){


    const now =

    Date.now();



    let offline = 0;



    this.agents.forEach(

        (item)=>{


            if(

                now -

                item.lastActive

                >

                timeout

            ){


                item.status =

                this.states.offline;



                offline++;


            }


        }

    );



    return offline;


}





// ==========================================
// START MONITOR LOOP
// ==========================================

startMonitor(){


    if(this.monitorTimer)

        return false;



    this.monitorTimer =

    setInterval(

        ()=>{


            this.autoRecover();


            this.checkTimeout();


        },

        30000

    );



    console.log(

        "❤️ Agent Monitor Started"

    );



    return true;


}





// ==========================================
// STOP MONITOR LOOP
// ==========================================

stopMonitor(){


    if(

        this.monitorTimer

    ){


        clearInterval(

            this.monitorTimer

        );


        this.monitorTimer =

        null;


    }



    console.log(

        "🛑 Agent Monitor Stopped"

    );



    return true;


}





// ==========================================
// ERROR REPORT
// ==========================================

errorReport(){


    const errors = [];



    this.agents.forEach(

        item=>{


            if(

                item.status ===

                this.states.error

            ){


                errors.push({

                    name:item.name,

                    health:item.health

                });


            }


        }

    );



    return {


        count:

        errors.length,


        agents:

        errors


    };


}// ==========================================
// JARVIS V10 PRODUCTION
// AgentManager V10 PRO
// PART 6 / 7
// System Integration Layer
// AgentBus + Modules + Browser + Chat + Voice
// ==========================================


// ==========================================
// CONNECT AGENT BUS
// ==========================================

connectBus(){


    if(

        !window.AgentBus

    ){

        console.warn(

            "⚠ AgentBus Missing"

        );

        return false;

    }



    try{


        this.bus =

        window.AgentBus;



        console.log(

            "📡 AgentManager Connected To AgentBus"

        );



        this.emit(

            "bus.connected",

            this.bus

        );



        return true;


    }

    catch(error){


        console.error(

            "❌ AgentBus Connection Failed",

            error

        );


        return false;


    }


}





// ==========================================
// SEND BUS MESSAGE
// ==========================================

busSend(
channel,
data={}
){


    if(

        !this.bus

    )

        return false;



    try{


        if(

            typeof this.bus.publish ===

            "function"

        ){

            return this.bus.publish(

                channel,

                data

            );

        }



        if(

            typeof this.bus.emit ===

            "function"

        ){

            return this.bus.emit(

                channel,

                data

            );

        }



        return false;


    }

    catch(error){


        console.error(

            "Bus Send Error",

            error

        );


        return false;


    }


}





// ==========================================
// CONNECT MODULE
// ==========================================

connectModule(
name,
module
){


    if(

        !name ||

        !module

    )

        return false;



    this.modules =

    this.modules || new Map();



    this.modules.set(

        name,

        module

    );



    console.log(

        "🔗 Module Connected:",

        name

    );



    return true;


}





// ==========================================
// GET MODULE
// ==========================================

getModule(name){


    if(!this.modules)

        return null;



    return (

        this.modules.get(name)

        ||

        null

    );


}





// ==========================================
// CONNECT BROWSER
// ==========================================

connectBrowser(){


    if(

        !window.BrowserAgent

    ){

        console.warn(

            "⚠ BrowserAgent Missing"

        );

        return false;

    }



    this.browser =

    window.BrowserAgent;



    this.connectModule(

        "BrowserAgent",

        this.browser

    );



    console.log(

        "🌐 Browser Agent Connected"

    );



    return true;


}





// ==========================================
// CONNECT CHAT
// ==========================================

connectChat(){


    if(

        !window.ChatEngine

    ){

        console.warn(

            "⚠ ChatEngine Missing"

        );

        return false;

    }



    this.chat =

    window.ChatEngine;



    this.connectModule(

        "ChatEngine",

        this.chat

    );



    console.log(

        "💬 Chat Engine Connected"

    );



    return true;


}





// ==========================================
// CONNECT VOICE
// ==========================================

connectVoice(){


    if(

        !window.VoiceEngine

    ){

        console.warn(

            "⚠ VoiceEngine Missing"

        );

        return false;

    }



    this.voice =

    window.VoiceEngine;



    this.connectModule(

        "VoiceEngine",

        this.voice

    );



    console.log(

        "🎤 Voice Engine Connected"

    );



    return true;


}





// ==========================================
// CONNECT LEARNING
// ==========================================

connectLearning(){


    if(

        !window.SelfLearningAgent

    ){

        console.warn(

            "⚠ SelfLearningAgent Missing"

        );

        return false;

    }



    this.learning =

    window.SelfLearningAgent;



    this.connectModule(

        "SelfLearningAgent",

        this.learning

    );



    console.log(

        "🧠 Learning System Connected"

    );



    return true;


}





// ==========================================
// CONNECT ALL SYSTEMS
// ==========================================

connectSystems(){


    return {


        bus:

        this.connectBus(),



        browser:

        this.connectBrowser(),



        chat:

        this.connectChat(),



        voice:

        this.connectVoice(),



        learning:

        this.connectLearning()


    };


}





// ==========================================
// SYSTEM STATUS
// ==========================================

systemStatus(){


    const modules = {};



    if(this.modules){


        this.modules.forEach(

            (value,key)=>{


                modules[key] = true;


            }

        );


    }



    return {


        connected:

        modules,


        agents:

        this.agents.size,


        tasks:

        this.tasks.size,


        running:

        this.running,


        uptime:

        Date.now()

        -

        this.started


    };


}





// ==========================================
// CALL MODULE SAFELY
// ==========================================

async callModule(
moduleName,
method,
data={}
){


    try{


        const module =

        this.getModule(

            moduleName

        );



        if(!module)

            throw new Error(

                "Module Missing"

            );



        if(

            typeof module[method] !==

            "function"

        )

            throw new Error(

                "Method Missing"

            );



        return await module[method](

            data

        );


    }

    catch(error){


        console.error(

            "Module Call Failed",

            error

        );


        return false;


    }


}
// ==========================================
// JARVIS V10 PRODUCTION
// AgentManager V10 PRO
// PART 7 / 7 FINAL
// Runtime + Bootstrap + Shutdown + Export
// ==========================================


// ==========================================
// START RUNTIME
// ==========================================

start(){


    if(this.running)

        return true;



    this.running = true;



    console.log(

        "🚀 AgentManager Runtime Started"

    );



    this.startQueueWorker();


    this.startMonitor();



    this.connectSystems();



    this.emit(

        "manager.started",

        this.status()

    );



    return true;


}





// ==========================================
// STOP RUNTIME
// ==========================================

stop(){


    if(!this.running)

        return false;



    this.running = false;



    this.stopQueueWorker();


    this.stopMonitor();



    this.stopAll();



    this.emit(

        "manager.stopped",

        this.status()

    );



    console.log(

        "🛑 AgentManager Runtime Stopped"

    );



    return true;


}





// ==========================================
// RESTART RUNTIME
// ==========================================

restart(){


    this.stop();



    setTimeout(()=>{


        this.start();



    },1000);



    return true;


}





// ==========================================
// BOOTSTRAP
// ==========================================

bootstrap(){


    console.log(

        "⚡ AgentManager Bootstrap Starting"

    );



    this.connectSystems();



    this.registerKnownAgents();



    this.startQueueWorker();



    this.startMonitor();



    this.emit(

        "manager.ready",

        this.status()

    );



    console.log(

        "✅ AgentManager Bootstrap Complete"

    );



    return true;


}




// ==========================================
// REGISTER KNOWN AGENTS
// AgentRegistry existed and worked, but nothing ever called
// .register() on it for any of the self-booting global agents
// (ReasoningAgent, KnowledgeAgent, etc.) -- so AgentRegistry.getAll()
// always returned an empty list, and anything depending on it
// (AgentMonitor.scanAgents(), for one) was silently useless.
// This closes that gap: best-effort register every known agent
// global that actually exists, skipping ones already registered
// (e.g. by a future explicit self-registration call).
// ==========================================

registerKnownAgents(){

    if(!window.AgentRegistry){
        console.warn("⚠ AgentRegistry Missing — skipping auto-registration");
        return 0;
    }

    const knownAgentNames = [
        "ReasoningAgent", "PlanningAgent", "DecisionAgent", "ActionAgent",
        "CoordinatorAgent", "SystemAgent", "SecurityAgent", "RecoveryAgent",
        "MonitorAgent", "SelfLearningAgent", "MemoryManagerAgent",
        "KnowledgeAgent", "TaskPlanner", "VisionAgent",
        "GoalManager", "AgentExecutor", "AgentMonitor", "LearningAgent"
    ];

    let registered = 0;

    knownAgentNames.forEach(name => {

        if(!window[name]) return;

        if(window.AgentRegistry.has(name)) return;

        try {
            if(window.AgentRegistry.register(name, window[name])){
                registered++;
            }
        } catch(error) {
            console.warn("⚠ Failed to register", name, error);
        }

    });

    console.log("🗂 AgentRegistry: auto-registered", registered, "agent(s)");

    return registered;

}





// ==========================================
// FULL SYSTEM STATUS
// ==========================================

fullStatus(){


    return {


        manager:

        this.status(),



        agents:

        this.monitor(),



        health:

        this.healthCheck(),



        tasks:

        this.taskStats(),



        queue:

        this.queueStatus(),



        modules:

        this.systemStatus()



    };


}





// ==========================================
// EXPORT STATE
// ==========================================

exportState(){


    return {


        version:

        this.version,



        started:

        this.started,



        agents:

        this.all().map(item=>({


            name:item.name,


            status:item.status,


            health:item.health



        })),



        stats:

        this.stats



    };


}





// ==========================================
// IMPORT STATE
// ==========================================

importState(data){


    if(!data)

        return false;



    try{


        if(data.stats)

            this.stats = data.stats;



        console.log(

            "📥 AgentManager State Imported"

        );



        return true;


    }

    catch(error){


        console.error(

            "❌ Import Failed",

            error

        );


        return false;


    }


}





// ==========================================
// SHUTDOWN CLEAN
// ==========================================

shutdown(){


    console.log(

        "🔻 AgentManager Shutdown"

    );



    this.stop();



    this.agents.clear();


    this.tasks.clear();


    this.listeners.clear();



    return true;


}





// ==========================================
// VERSION INFO
// ==========================================

info(){


    return {


        name:

        "JARVIS AgentManager",



        version:

        this.version,



        uptime:

        Date.now()

        -

        this.started



    };


}



}


// ==========================================
// GLOBAL EXPORT
// ==========================================

window.AgentManager =

new AgentManager();



// AUTO BOOT
// Waits for required globals (ChatEngine, SelfLearningAgent) to be
// defined before bootstrapping, instead of a single fixed-delay guess.
// Falls back to bootstrapping anyway after AGENT_BOOT_TIMEOUT_MS so
// behavior never hangs; bootstrap() is guaranteed to run exactly once.

(function autoBootAgentManager(){

    const AGENT_BOOT_POLL_MS = 25;
    const AGENT_BOOT_TIMEOUT_MS = 5000;

    let booted = false;
    const startedAt = Date.now();

    function isReady(){
        return !!(window.ChatEngine && window.SelfLearningAgent);
    }

    function runBootstrapOnce(){
        if (booted) return;
        booted = true;
        window.AgentManager.bootstrap();
    }

    (function pollReady(){
        if (isReady() || (Date.now() - startedAt) >= AGENT_BOOT_TIMEOUT_MS) {
            runBootstrapOnce();
            return;
        }
        setTimeout(pollReady, AGENT_BOOT_POLL_MS);
    })();

})();




console.log(

"✅ AgentManager V10 PRODUCTION FINAL Loaded"

);



})();