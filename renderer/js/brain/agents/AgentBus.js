// ==========================================
// JARVIS V10
// Autonomous Agent Core
// AgentBus V2 Production
// renderer/js/brain/agents/agentBus.js
// ==========================================


"use strict";


(function(){



const AgentBus = {


    version:"2.0.0",


    name:"AgentBus",


    initialized:false,


    debug:true,



    listeners:new Map(),


    history:[],


    maxHistory:1000,


    queue:[],


    agents:new Map(),




// ==========================================
// INIT
// ==========================================


init(){


    if(this.initialized)

        return true;



    this.initialized=true;



    console.log(

        "📡 AgentBus V2 Initialized"

    );


    return true;


},





// ==========================================
// REGISTER AGENT
// ==========================================


register(

    name,

    agent

){


    if(

        !name ||

        !agent

    )

        return false;



    if(

        this.agents.has(name)

    ){

        console.warn(

            "♻ Updating Agent:",

            name

        );

        this.agents.set(

            name,

            agent

        );

        return true;

    }



    this.agents.set(

        name,

        agent

    );



    if(this.debug)

        console.log(

            "🤖 Bus Registered:",

            name

        );



    return true;


},




// ==========================================
// REMOVE AGENT
// ==========================================


unregister(name){


    return this.agents.delete(

        name

    );


},




// ==========================================
// GET AGENT
// ==========================================


getAgent(name){


    return (

        this.agents.get(name)

        ||

        null

    );


},
// ==========================================
// SAFE CALL (TIMEOUT + ASYNC SAFETY)
// Wraps an agent call so that:
//  - a synchronous return value is treated the
//    same as an async one (always resolves via
//    Promise.race, so callers can always await it)
//  - a hung/never-resolving agent doesn't block
//    the bus forever — it times out instead
// ==========================================


async safeCall(

    fn,

    timeout=5000

){


    return Promise.race([


        fn(),


        new Promise(

            (_,reject)=>{


                setTimeout(

                    ()=>{


                        reject(

                            new Error(
                                "Agent Timeout"
                            )

                        );


                    },

                    timeout

                );


            }

        )


    ]);


},




// ==========================================
// SECURITY — MESSAGE SIGNATURE
// Lightweight tamper-evidence for packets moving
// through the bus, so a fake/injected message
// (e.g. something pushed directly onto this.queue
// from outside send()/sendPriority()) can be
// detected and rejected. This is a deterministic
// checksum, not real cryptography — if stronger
// guarantees are ever needed, swap the hash body
// for the Web Crypto API (crypto.subtle.digest) or
// Node's crypto module.
// ==========================================


generateSignature(packet){


    // Sign everything except any existing signature field, so this
    // works uniformly whether the packet came from send() (from/to/
    // message/time), sendPriority() (+priority/retries/created), or
    // emit() (event/data/time).

    const {

        signature,

        ...rest

    } = packet;



    const payload =

    JSON.stringify(rest);



    let hash = 0;



    for(

        let i=0;

        i<payload.length;

        i++

    ){


        hash =

        (hash << 5) -

        hash +

        payload.charCodeAt(i);



        hash |= 0;


    }



    return (

        "SIG_" +

        Math.abs(hash).toString(16)

    );


},




// ==========================================
// VERIFY SIGNATURE
// ==========================================


verifySignature(packet){


    if(

        !packet ||

        !packet.signature

    )

        return false;



    const expected =

    this.generateSignature(packet);



    return (

        expected === packet.signature

    );


},


send(

    from,

    to,

    message={}

){


    if(

        !to ||

        !message

    ){

        console.warn(

            "⚠ Invalid Message"

        );


        return false;

    }



    const packet = {


        id:

        this.generateID(),



        from,



        to,



        message,



        time:

        Date.now()



    };


    packet.signature =

    this.generateSignature(

        packet

    );



    this.saveHistory(

        packet

    );




    const agent =

    this.getAgent(

        to

    );



    if(

        !agent

    ){


        console.warn(

            "⚠ Receiver Missing:",

            to

        );


        return false;

    }




    try{


        if(

            typeof agent.receive === "function"

        ){


            return this.safeCall(

                ()=> agent.receive(packet)

            );


        }



        if(

            typeof agent.onMessage === "function"

        ){


            return this.safeCall(

                ()=> agent.onMessage(packet)

            );


        }


    }


    catch(error){


        console.error(

            "❌ Agent Message Error:",

            to,

            error

        );


    }



    return false;


},




// ==========================================
// BROADCAST MESSAGE
// ==========================================


broadcast(

    from,

    message={}

){


    this.agents.forEach(

        (agent,name)=>{


            if(

                name === from

            )

                return;



            this.send(

                from,

                name,

                message

            );


        }

    );



    return true;


},




// ==========================================
// SUBSCRIBE EVENT
// ==========================================


// ==========================================
// SUBSCRIBE EVENT V2 COMPATIBLE
// Supports:
// subscribe(event, agent, callback)
// subscribe(event, callback)
// ==========================================

subscribe(

    event,

    agent,

    callback

){


    // OLD FORMAT SUPPORT

    if(

        typeof agent === "function"

    ){

        callback = agent;

        agent = "AnonymousAgent";

    }



    if(

        !event ||

        typeof callback !== "function"

    ){

        console.warn(

            "⚠ Invalid Subscription"

        );

        return false;

    }



    if(

        !this.listeners.has(event)

    ){

        this.listeners.set(

            event,

            []

        );

    }



    const list =

    this.listeners.get(

        event

    );



    const alreadySubscribed = list.some(

        (entry) =>
            entry.agent === agent &&
            entry.callback === callback

    );

    if (alreadySubscribed) {

        console.warn(

            "⚠ Duplicate Subscription Ignored:",

            agent,

            event

        );

        return false;

    }



    list.push({

        agent,

        callback

    });



    if(this.debug)

    console.log(

        "📡 Listening:",

        agent,

        event

    );



    return true;


},




// ==========================================
// UNSUBSCRIBE EVENT
// ==========================================


unsubscribe(

    event,

    agent

){


    if(

        !this.listeners.has(event)

    )

        return false;



    const list =

    this.listeners.get(

        event

    );



    const filtered =

    list.filter(

        item =>

        item.agent !== agent

    );



    this.listeners.set(

        event,

        filtered

    );



    return true;


},




// ==========================================
// EMIT EVENT
// ==========================================


emit(

    event,

    data={}

){


    const packet = {


        event,


        data,


        time:

        Date.now()


    };


    packet.signature =

    this.generateSignature(

        packet

    );



    this.saveHistory(

        packet

    );



    const listeners =

    this.listeners.get(

        event

    );



    if(

        !listeners

    )

        return false;




    listeners.forEach(

        listener=>{


            try{


                listener.callback(

                    data

                );


            }

            catch(error){


                console.error(

                    "❌ Event Error:",

                    listener.agent,

                    error

                );


            }


        }

    );



    return true;


},
// ==========================================
// PRIORITY MESSAGE SEND
// ==========================================


sendPriority(

    from,

    to,

    message={},

    priority="normal"

){


    const task = {


        id:

        this.generateID(),



        from,


        to,


        message,


        priority,


        retries:0,


        created:

        Date.now()


    };



    this.queue.push(

        task

    );



    this.sortQueue();



    this.processQueue();



    return true;


},




// ==========================================
// SORT QUEUE
// ==========================================


sortQueue(){


    const level = {


        high:3,


        normal:2,


        low:1


    };



    this.queue.sort(

        (a,b)=>{


            return (

                level[b.priority || "normal"]

                -

                level[a.priority || "normal"]

            );


        }

    );


},




// ==========================================
// PROCESS QUEUE
// ==========================================


async processQueue(){


    if(

        this.processing

    )

        return;



    this.processing = true;




    while(

        this.queue.length > 0

    ){



        const task =

        this.queue.shift();




        try{


            await this.deliverTask(

                task

            );


        }


        catch(error){


            console.error(

                "❌ Queue Error:",

                error

            );



        }




        await this.delay(

            0

        );


    }



    this.processing = false;


},




// ==========================================
// DELIVER TASK
// ==========================================


async deliverTask(task){


    const agent =

    this.getAgent(

        task.to

    );



    if(

        !agent

    ){


        return this.retryTask(

            task

        );


    }



    try{


        if(

            typeof agent.receive === "function"

        ){


            await agent.receive(

                task

            );


            return true;


        }



        return false;



    }


    catch(error){


        console.error(

            "❌ Delivery Failed:",

            task.to,

            error

        );



        return this.retryTask(

            task

        );


    }


},




// ==========================================
// RETRY SYSTEM
// ==========================================


retryTask(task){


    if(

        task.retries >= 3

    ){


        console.error(

            "❌ Message Abandoned:",

            task.id

        );


        return false;


    }




    task.retries++;



    this.queue.push(

        task

    );



    this.sortQueue();



    console.warn(

        "♻ Retrying Message:",

        task.id,

        "Attempt:",

        task.retries

    );



    return true;


},




// ==========================================
// DELAY
// ==========================================


// ==========================================
// DELAY
// ==========================================


delay(ms){


    return new Promise(

        resolve =>

        setTimeout(

            resolve,

            ms

        )

    );


},




// ==========================================
// GENERATE ID
// ==========================================


generateID(){


    return (

        "MSG_" +

        Date.now()

        +

        "_"

        +

        Math.floor(
            Math.random()*9999
        )

    );


},




// ==========================================
// SAVE HISTORY
// ==========================================


saveHistory(data){


    this.history.push(

        data

    );


    if(

        this.history.length >

        this.maxHistory

    ){

        this.history.shift();

    }


    return true;


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


    console.log(

        "🗑 AgentBus History Cleared"

    );


    return true;


},

// ==========================================
// REQUEST / RESPONSE SYSTEM
// ==========================================


requests:new Map(),



request(

    from,

    to,

    message={},

    timeout=5000

){


    const id=

    this.generateID();



    const packet={


        id,


        from,


        to,


        message,


        type:

        "request",


        time:

        Date.now()



    };



    return new Promise((resolve,reject)=>{


        this.requests.set(

            id,

            {

                resolve,

                reject,

                time:

                Date.now()

            }

        );



        this.send(

            from,

            to,

            packet

        );



        setTimeout(()=>{


            if(

                this.requests.has(id)

            ){


                this.requests.delete(id);



                reject(

                    new Error(

                        "Request Timeout"

                    )

                );


            }



        },timeout);



    });


},




// ==========================================
// RESPONSE HANDLER
// ==========================================


respond(

    requestID,

    data={}

){


    const request=

    this.requests.get(

        requestID

    );



    if(

        !request

    )

    return false;



    request.resolve(

        data

    );



    this.requests.delete(

        requestID

    );



    return true;


},




// ==========================================
// MESSAGE ACK SYSTEM
// ==========================================


acknowledge(packet){


    if(

        !packet ||

        !packet.id

    )

    return false;



    this.emit(

        "message.ack",

        {

            id:

            packet.id,


            time:

            Date.now()

        }

    );



    return true;


},




// ==========================================
// HEARTBEAT SYSTEM
// ==========================================


heartbeats:new Map(),




heartbeat(agentName,data={}){


    this.heartbeats.set(

        agentName,

        {


            status:

            "online",


            data,


            time:

            Date.now()


        }

    );



    return true;


},




// ==========================================
// AGENT ONLINE CHECK
// ==========================================


isAgentOnline(agentName){


    const beat=

    this.heartbeats.get(

        agentName

    );



    if(

        !beat

    )

    return false;



    return(

        Date.now()

        -

        beat.time

    )

    <

    15000;


},




// ==========================================
// AGENT HEALTH SCAN
// ==========================================


scanAgents(){


    const report=[];



    this.agents.forEach(

        (agent,name)=>{


            report.push({


                name,


                online:

                this.isAgentOnline(

                    name

                ),


                status:

                agent.status ||

                "unknown"



            });



        }

    );



    return report;


},




// ==========================================
// COMMUNICATION ANALYTICS
// ==========================================


getCommunicationStats(){


    let sent=0;

    let failed=0;



    this.history.forEach(item=>{


        if(

            item.id

        ){

            sent++;

        }



        if(

            item.status==="failed"

        ){

            failed++;

        }



    });



    return{


        messages:

        sent,


        failed,


        agents:

        this.agents.size,


        pendingRequests:

        this.requests.size,


        heartbeats:

        this.heartbeats.size



    };


},




// ==========================================
// AUTO FAILURE DETECTION
// ==========================================


detectFailures(){


    const failed=[];



    this.agents.forEach(

        (agent,name)=>{


            if(

                !this.isAgentOnline(

                    name

                )

            ){


                failed.push(

                    name

                );


            }


        }

    );



    if(

        failed.length &&

        window.RecoveryAgent

    ){


        RecoveryAgent.run({

            action:

            "recover",


            data:{

                agents:

                failed

            }

        });


    }



    return failed;


},
// ==========================================
// AGENT PERMISSION SYSTEM
// ==========================================


permissions:new Map(),



setPermission(

    agent,

    actions=[]

){


    this.permissions.set(

        agent,

        actions

    );



    return true;


},




// ==========================================
// CHECK PERMISSION
// ==========================================


hasPermission(

    agent,

    action

){


    const list=

    this.permissions.get(

        agent

    );



    if(

        !list

    )

    return false;



    return list.includes(

        action

    );


},




// ==========================================
// SECURE ROUTE CHECK
// ==========================================


secureRoute(packet){


    if(

        !packet

    )

    return false;



    const from=

    packet.from;



    const action=

    packet.message.action;



    if(

        !action

    )

    return true;



    return this.hasPermission(

        from,

        action

    );


},




// ==========================================
// PRIORITY LEVEL ENGINE
// ==========================================


priorityLevel(level="normal"){


    const levels={


        emergency:5,


        critical:4,


        high:3,


        normal:2,


        low:1



    };



    return levels[level] || 2;


},




// ==========================================
// ADVANCED PRIORITY QUEUE
// ==========================================


addPriorityTask(task={}){


    task.score=

    this.priorityLevel(

        task.priority

    );



    this.queue.push(

        task

    );



    this.queue.sort(

        (a,b)=>{


            return b.score-a.score;


        }

    );



    return true;


},




// ==========================================
// BROADCAST GROUPS
// ==========================================


groups:new Map(),




createGroup(

    name,

    agents=[]

){


    this.groups.set(

        name,

        agents

    );



    return true;


},




// ==========================================
// GROUP MESSAGE
// ==========================================


broadcastGroup(

    group,

    from,

    message={}

){


    const agents=

    this.groups.get(

        group

    );



    if(

        !agents

    )

    return false;



    agents.forEach(name=>{


        if(

            name!==from

        ){


            this.send(

                from,

                name,

                message

            );


        }


    });



    return true;


},




// ==========================================
// EVENT ANALYTICS
// ==========================================


getEventStats(){


    const stats={


        total:0,


        events:{}


    };



    this.history.forEach(item=>{


        if(

            item.event

        ){


            stats.total++;



            if(

                !stats.events[item.event]

            ){


                stats.events[item.event]=0;


            }



            stats.events[item.event]++;


        }


    });



    return stats;


},




// ==========================================
// COMMUNICATION REPORT
// ==========================================


communicationReport(){


    return{


        agents:

        this.agents.size,


        queue:

        this.queue.length,


        listeners:

        this.listeners.size,


        requests:

        this.requests.size,


        heartbeat:

        this.heartbeats.size,


        events:

        this.getEventStats()



    };


},
// ==========================================
// SAVE STATE
// ==========================================


saveState(){


    try{


        if(

            typeof localStorage==="undefined"

        )

        return false;



        const data={


            history:

            this.history,


            queue:

            this.queue



        };



        localStorage.setItem(

            "jarvis_agentbus_state",

            JSON.stringify(data)

        );



        return true;


    }

    catch(error){


        console.error(

            "AgentBus Save Error",

            error

        );


        return false;


    }


},




// ==========================================
// LOAD STATE
// ==========================================


loadState(){


    try{


        if(

            typeof localStorage==="undefined"

        )

        return false;



        const data=

        localStorage.getItem(

            "jarvis_agentbus_state"

        );



        if(!data)

        return false;



        const parsed=

        JSON.parse(

            data

        );



        if(parsed.history)

            this.history=

            parsed.history;



        if(parsed.queue)

            this.queue=

            parsed.queue;



        return true;


    }

    catch(error){


        console.error(

            "AgentBus Load Error",

            error

        );


        return false;


    }


},




// ==========================================
// AUTO AGENT DISCOVERY
// ==========================================


discoverAgents(){


    if(

        !window.AgentRegistry

    )

    return false;



    if(

        typeof AgentRegistry.list !== "function"

    )

    return false;



    const list=

    AgentRegistry.list();



    list.forEach(name=>{


        const agent=

        AgentRegistry.get(

            name

        );



        if(agent){


            this.register(

                name,

                agent

            );


        }


    });



    console.log(

        "🔎 Agent Discovery Completed"

    );



    return true;


},




// ==========================================
// COORDINATOR CONNECTION
// ==========================================


connectCoordinator(){


    if(

        !window.CoordinatorAgent

    )

    return false;



    this.register(

        "CoordinatorAgent",

        CoordinatorAgent

    );



    return true;


},




// ==========================================
// RECOVERY CONNECTION
// ==========================================


connectRecovery(){


    if(

        !window.RecoveryAgent

    )

    return false;



    this.register(

        "RecoveryAgent",

        RecoveryAgent

    );



    return true;


},




// ==========================================
// FINAL DASHBOARD
// ==========================================


dashboard(){


    return{


        version:

        this.version,


        status:

        this.initialized

        ?

        "online"

        :

        "offline",



        agents:

        this.agents.size,



        queue:

        this.queue.length,



        listeners:

        this.listeners.size,



        history:

        this.history.length,



        communication:

        this.getCommunicationStats()



    };


},




// ==========================================
// AUTO START SERVICES
// ==========================================


startServices(){


    this.loadState();



    this.discoverAgents();



    this.connectCoordinator();



    this.connectRecovery();



    console.log(

        "🚀 AgentBus V2.1 Services Started"

    );


    return true;


},
// ==========================================
// HEALTH
// ==========================================


health(){


    return {


        version:

        this.version,


        initialized:

        this.initialized,


        agents:

        this.agents.size,


        listeners:

        this.listeners.size,


        history:

        this.history.length,


        queue:

        this.queue.length


    };


},};
// ==========================================
// GLOBAL EXPORT
// ==========================================


window.AgentBus =

AgentBus;



// Compatibility With Communication Bus


window.AgentCommunicationBus =

AgentBus;




// ==========================================
// AUTO INITIALIZE
// ==========================================


AgentBus.init();

AgentBus.startServices();


// ==========================================
// CONNECT AGENT REGISTRY
// AgentRegistry V3 PRO is the main agent source
// in the current architecture (replaces the old
// AgentManager wiring).
// ==========================================


function connectAgentRegistry(){


    if(

        !window.AgentRegistry

    ){


        console.warn(

            "⚠ AgentRegistry Not Available"

        );


        return false;

    }




    if(

        typeof AgentRegistry.list !== "function"

    ){


        return false;

    }




    const agents =

    AgentRegistry.list();




    agents.forEach(name=>{


        const agent =

        AgentRegistry.get(

            name

        );



        if(

            agent

        ){


            AgentBus.register(

                name,

                agent

            );


        }


    });




    console.log(

        "🤝 AgentRegistry Connected To AgentBus"

    );



    return true;


}




// ==========================================
// DELAYED CONNECT
// ==========================================


setTimeout(()=>{


    connectAgentRegistry();



},500);




// ==========================================
// FINAL TEST
// ==========================================


AgentBus.emit(

    "bus.ready",

    {

        version:

        AgentBus.version,


        time:

        Date.now()

    }

);




// ==========================================
// FINAL LOG
// ==========================================


console.log(

    "📡 AgentBus V2 Production Loaded"

);// ==========================================
// CLOSE EXPORT WRAPPER
// ==========================================


})();