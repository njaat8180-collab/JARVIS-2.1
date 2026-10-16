// ==========================================
// JARVIS V10
// Autonomous Agent Core
// MonitorAgent V1 PRO
// renderer/js/brain/agents/monitorAgent.js
// ==========================================

"use strict";

(function(){

const MonitorAgent={

    version:"1.0.0 PRO",

    name:"MonitorAgent",

    status:"idle",

    storageKey:"jarvis_monitor_v1",

    agentsHealth:new Map(),

    history:[],

    alerts:[],

    maxHistory:2000,




// ==========================================
// INIT
// ==========================================

init(){

    this.load();

    this.scanAgents();

    console.log(

        "📊 MonitorAgent Initialized"

    );

    return true;

},




// ==========================================
// RUN
// ==========================================

run(task={}){

    this.status="working";


    let result;



    switch(task.action){



        case "scan":

            result=

            this.scanAgents();

        break;



        case "health":

            result=

            this.getHealth(

                task.agent

            );

        break;



        case "monitor":

            result=

            this.monitorSystem();

        break;



        case "alerts":

            result=

            this.getAlerts();

        break;



        case "status":

            result=

            this.getStatus();

        break;



        case "save":

            result=

            this.save();

        break;



        case "load":

            result=

            this.load();

        break;



        default:

            result={

                success:false,

                error:

                "Unknown Monitor Action"

            };

    }



    this.status="idle";


    return result;

},




// ==========================================
// RECEIVE
// ==========================================

receive(message={}){

    return this.run(

        message

    );

},




// ==========================================
// AGENT SCANNER
// ==========================================

scanAgents(){


    const agents=[


        "CoordinatorAgent",

        "SecurityAgent",

        "RecoveryAgent",

        "MemoryManagerAgent",

        "LearningAgent",

        "KnowledgeAgent",

        "DecisionAgent",

        "ReasoningAgent",

        "PlanningAgent",

        "ActionAgent",

        "CodingAgent",

        "BrowserAgent",

        "SystemAgent",

        "VoiceAgent",

        "VisionAgent"



    ];



    agents.forEach(name=>{


        const agent=

        window[name];



        const health={


            name,


            exists:

            !!agent,


            status:

            agent &&

            agent.status

            ?

            agent.status

            :

            "offline",


            checked:

            Date.now()



        };



        this.agentsHealth.set(

            name,

            health

        );


    });



    this.history.push({

        action:

        "agent_scan",


        count:

        this.agentsHealth.size,


        time:

        Date.now()

    });



    return{


        success:true,


        agents:

        [

            ...this.agentsHealth.values()

        ]

    };

},




// ==========================================
// GET HEALTH
// ==========================================

getHealth(agentName){


    return this.agentsHealth.get(

        agentName

    ) || null;

},




// ==========================================
// ADD ALERT
// ==========================================

addAlert(type,message,data={}){


    const alert={


        type,


        message,


        data,


        time:

        Date.now()


    };



    this.alerts.push(

        alert

    );



    return alert;

},




// ==========================================
// GET ALERTS
// ==========================================

getAlerts(){


    return this.alerts

    .slice()

    .reverse();


},// ==========================================
// PERFORMANCE MONITOR
// ==========================================

checkPerformance(agentName){


    const agent=

    window[agentName];



    if(

        !agent

    ){

        return{


            agent:

            agentName,


            score:0,


            status:

            "offline"


        };

    }



    let score=100;



    if(

        agent.status==="working"

    ){

        score-=10;

    }



    if(

        typeof agent.run !==

        "function"

    ){

        score-=30;

    }



    if(

        typeof agent.receive !==

        "function"

    ){

        score-=20;

    }



    return{


        agent:

        agentName,


        score,


        status:

        score>70

        ?

        "healthy"

        :

        "warning"



    };

},




// ==========================================
// ERROR DETECTION
// ==========================================

detectErrors(agentName){


    const errors=[];



    const agent=

    window[agentName];



    if(

        !agent

    ){

        errors.push(

            "Agent unavailable"

        );

    }



    if(

        agent &&

        !agent.version

    ){

        errors.push(

            "Version missing"

        );

    }



    if(

        agent &&

        !agent.name

    ){

        errors.push(

            "Name missing"

        );

    }



    return{


        agent:

        agentName,


        errors,


        safe:

        errors.length===0



    };

},




// ==========================================
// CRASH DETECTION
// ==========================================

detectCrash(agentName){


    const health=

    this.getHealth(

        agentName

    );



    if(

        !health

    ){

        return{

            crashed:true,

            reason:

            "No health record"

        };

    }



    if(

        health.status==="offline"

    ){

        return{


            crashed:true,


            reason:

            "Agent offline"



        };

    }



    return{


        crashed:false


    };

},




// ==========================================
// RESOURCE TRACKING
// ==========================================

trackResources(){


    const memory=

    typeof performance !==

    "undefined"

    &&

    performance.memory

    ?

    performance.memory

    :

    null;



    return{


        memory:


        memory

        ?


        {

            used:

            memory.usedJSHeapSize,


            total:

            memory.totalJSHeapSize

        }


        :

        null,



        timestamp:

        Date.now()



    };

},




// ==========================================
// HEALTH SCORE ENGINE
// ==========================================

calculateHealth(agentName){


    const performance=

    this.checkPerformance(

        agentName

    );



    const errors=

    this.detectErrors(

        agentName

    );



    const crash=

    this.detectCrash(

        agentName

    );



    let score=

    performance.score;



    if(

        !errors.safe

    ){

        score-=20;

    }



    if(

        crash.crashed

    ){

        score=0;

    }



    if(

        score<0

    ){

        score=0;

    }



    const result={


        agent:

        agentName,


        score,


        stable:

        score>=70,


        errors:

        errors.errors,


        crash:

        crash.crashed



    };



    this.agentsHealth.set(

        agentName,

        {

            ...result,

            checked:

            Date.now()

        }

    );



    return result;

},




// ==========================================
// FULL STABILITY CHECK
// ==========================================

analyzeStability(){


    const report=[];



    this.agentsHealth.forEach(

        (health,name)=>{


            report.push(

                this.calculateHealth(

                    name

                )

            );


        }

    );



    return report;

},




// ==========================================
// SYSTEM MONITOR
// ==========================================

monitorSystem(){


    const stability=

    this.analyzeStability();



    const resources=

    this.trackResources();



    return{


        success:true,


        stability,


        resources,


        alerts:

        this.alerts.length



    };

},// ==========================================
// RECOVERY AGENT INTEGRATION
// ==========================================

requestRecovery(agentName,reason){


    if(

        !window.RecoveryAgent

    ){

        return false;

    }



    const request={


        agent:

        agentName,


        reason,


        source:

        "MonitorAgent",


        time:

        Date.now()



    };



    RecoveryAgent.run({

        action:

        "recover",


        data:

        request

    });



    this.addAlert(

        "recovery",

        "Recovery requested",

        request

    );



    return true;

},




// ==========================================
// COORDINATOR INTEGRATION
// ==========================================

notifyCoordinator(data={}){


    if(

        !window.CoordinatorAgent

    ){

        return false;

    }



    CoordinatorAgent.receive({

        type:

        "monitor_alert",


        data

    });



    return true;

},




// ==========================================
// AUTO FAILURE CHECK
// ==========================================

checkFailures(){


    const failures=[];



    this.agentsHealth.forEach(

        (health,name)=>{


            const result=

            this.calculateHealth(

                name

            );



            if(

                result.score < 50

            ){

                const failure={


                    agent:

                    name,


                    score:

                    result.score,


                    reason:

                    result.errors



                };



                failures.push(

                    failure

                );



                this.addAlert(

                    "agent_failure",

                    "Agent health critical",

                    failure

                );



                this.requestRecovery(

                    name,

                    "Low health score"

                );

            }


        }

    );



    return failures;

},




// ==========================================
// MONITORING CYCLE
// ==========================================

startMonitoring(){


    this.scanAgents();



    const report=

    this.monitorSystem();



    const failures=

    this.checkFailures();



    const result={


        report,


        failures,


        time:

        Date.now()



    };



    if(

        failures.length>0

    ){

        this.notifyCoordinator(

            result

        );

    }



    this.save();



    return result;

},




// ==========================================
// STOP MONITORING
// ==========================================

stopMonitoring(){


    this.status="idle";



    this.addAlert(

        "monitor",

        "Monitoring stopped"

    );



    return true;

},




// ==========================================
// SECURITY INTEGRATION
// ==========================================

securityCheck(data={}){


    if(

        !window.SecurityAgent

    ){

        return true;

    }



    const result=

    SecurityAgent.audit(

        data

    );



    if(

        !result.secure

    ){

        this.addAlert(

            "security",

            "Security issue detected",

            result

        );

    }



    return result.secure;

},




// ==========================================
// ADVANCED ANALYTICS
// ==========================================

getAnalytics(){


    let healthy=0;

    let warning=0;

    let offline=0;



    this.agentsHealth.forEach(

        agent=>{


            if(

                agent.status==="healthy"

            ){

                healthy++;

            }

            else if(

                agent.status==="warning"

            ){

                warning++;

            }

            else if(

                agent.status==="offline"

            ){

                offline++;

            }


        }

    );



    return{


        totalAgents:

        this.agentsHealth.size,


        healthy,


        warning,


        offline,


        alerts:

        this.alerts.length,


        history:

        this.history.length



    };

},




// ==========================================
// DASHBOARD
// ==========================================

getDashboard(){


    return{


        status:

        this.status,


        analytics:

        this.getAnalytics(),


        resources:

        this.trackResources(),


        alerts:

        this.getAlerts().slice(

            0,

            10

        )


    };

},// ==========================================
// SAVE
// ==========================================

save(){

    try{


        if(

            typeof localStorage==="undefined"

        )

        return false;



        const data={


            agentsHealth:[

                ...this.agentsHealth.entries()

            ],


            history:

            this.history,


            alerts:

            this.alerts


        };



        localStorage.setItem(

            this.storageKey,

            JSON.stringify(data)

        );



        return true;


    }

    catch(error){


        console.error(

            "MonitorAgent Save Error",

            error

        );


        return false;


    }

},




// ==========================================
// LOAD
// ==========================================

load(){

    try{


        if(

            typeof localStorage==="undefined"

        )

        return false;



        const data=

        localStorage.getItem(

            this.storageKey

        );



        if(!data)

        return false;



        const parsed=

        JSON.parse(

            data

        );




        if(

            parsed.agentsHealth

        ){

            parsed.agentsHealth.forEach(item=>{


                this.agentsHealth.set(

                    item[0],

                    item[1]

                );


            });

        }




        if(

            parsed.history

        ){

            this.history=

            parsed.history;

        }




        if(

            parsed.alerts

        ){

            this.alerts=

            parsed.alerts;

        }



        return true;


    }

    catch(error){


        console.error(

            "MonitorAgent Load Error",

            error

        );


        return false;


    }

},




// ==========================================
// STATUS
// ==========================================

getStatus(){


    return{


        version:

        this.version,


        status:

        this.status,


        agents:

        this.agentsHealth.size,


        alerts:

        this.alerts.length,


        analytics:

        this.getAnalytics()



    };

},




// ==========================================
// RESET
// ==========================================

reset(){


    this.agentsHealth.clear();


    this.history=[];


    this.alerts=[];



    this.save();



    this.status="idle";



    return true;

},




// ==========================================
// REGISTER
// ==========================================

register(){


    if(

        !window.AgentRegistry

    )

    return false;



    AgentRegistry.register(

        "MonitorAgent",

        this,

        {

            type:"core",

            group:"monitoring",

            priority:6,

            tags:[


                "monitor",

                "health",

                "diagnostic",

                "recovery",

                "performance"


            ]

        }

    );



    return true;

},




// ==========================================
// CONNECT AGENT BUS
// ==========================================

connectBus(){


    if(

        !window.AgentBus

    )

    return false;



    AgentBus.subscribe(

        "MonitorAgent",

        (message)=>{


            this.onBusMessage(

                message

            );


        }

    );



    return true;

},




// ==========================================
// BUS MESSAGE HANDLER
// ==========================================

onBusMessage(message={}){


    if(

        !message

    )

    return false;



    switch(

        message.type

    ){



        case "monitor_scan":


            this.scanAgents();


        break;




        case "monitor_health":


            this.getHealth(

                message.agent

            );


        break;




        case "monitor_start":


            this.startMonitoring();


        break;




        case "monitor_alert":


            this.addAlert(

                message.data.type,

                message.data.message,

                message.data

            );


        break;



    }



    return true;

},




// ==========================================
// BOOT
// ==========================================

boot(){


    this.init();


    this.register();


    this.connectBus();



    console.log(

        "📊 MonitorAgent Online"

    );


},



};




// ==========================================
// EXPORT
// ==========================================

window.MonitorAgent=

MonitorAgent;




// ==========================================
// START
// ==========================================

MonitorAgent.boot();




console.log(

"✅ MonitorAgent V1 PRO Loaded"

);



})();