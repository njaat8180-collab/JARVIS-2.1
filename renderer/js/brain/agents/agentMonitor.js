// ==========================================
// JARVIS V10
// Autonomous Agent Core
// AgentMonitor V1 PRO
// renderer/js/brain/agents/agentMonitor.js
// ==========================================


"use strict";


(function(){



const AgentMonitor = {



    version:"1.0.0 PRO",


    name:"AgentMonitor",


    status:"idle",



    storageKey:

    "jarvis_monitor_v1",



    agents:new Map(),



    reports:[],



    errors:[],



    maxReports:1000,




// ==========================================
// INIT
// ==========================================

init(){


    this.load();



    console.log(

        "📡 AgentMonitor Initialized"

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


            result =

            this.scanAgents();


        break;





        case "health":


            result =

            this.healthCheck(

                task.agent

            );


        break;





        case "report":


            result =

            this.getReport();


        break;





        case "errors":


            result =

            this.getErrors();


        break;





        case "status":


            result =

            this.getStatus();


        break;





        case "save":


            result =

            this.save();


        break;





        case "load":


            result =

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
// SCAN ALL AGENTS
// ==========================================

scanAgents(){



    const result=[];





    if(

        !window.AgentRegistry

    ){


        return [];


    }






    // BUGFIX: AgentRegistry has no getAll() method (verified: not
    // in its public API) -- this crashed every "scan"/"vision status"
    // call. filter() with no options returns every registered agent's
    // meta object, which is the real equivalent.
    const registry =

    AgentRegistry.filter();






    registry.forEach(agent=>{



        const health =

        this.healthCheck(

            agent.name

        );





        result.push(

            health

        );



    });





    this.reports.push({



        time:

        Date.now(),



        agents:

        result



    });





    this.trimReports();





    this.save();





    return result;



},





// ==========================================
// HEALTH CHECK
// ==========================================

healthCheck(agentName){



    let agent=null;





    if(

        window.AgentRegistry

    ){



        agent =

        AgentRegistry.get(

            agentName

        );



    }





    const report={



        agent:

        agentName,



        online:

        !!agent,



        status:

        agent && agent.status

        ?

        agent.status

        :

        "offline",



        time:

        Date.now()



    };






    if(

        !report.online

    ){



        this.recordError(

            agentName,

            "Agent offline"

        );



    }





    return report;



},





// ==========================================
// RECORD ERROR
// ==========================================

recordError(agent,error){



    this.errors.push({



        agent,


        error,



        time:

        Date.now()



    });





    if(

        this.errors.length >

        this.maxReports

    ){



        this.errors.shift();


    }



},





// ==========================================
// TRIM REPORTS
// ==========================================

trimReports(){



    if(

        this.reports.length >

        this.maxReports

    ){



        this.reports.shift();


    }



},// ==========================================
// PERFORMANCE MONITOR
// ==========================================

getPerformance(agentName){



    const data={



        agent:

        agentName,



        executions:

        0,



        success:

        0,



        failed:

        0



    };





    if(

        window.AgentExecutor

    ){



        const stats =

        AgentExecutor.getAgentPerformance();





        if(

            stats[agentName]

        ){



            data.executions =

            stats[agentName].total;



            data.success =

            stats[agentName].success;



            data.failed =

            stats[agentName].failed;



        }



    }





    data.score =

    data.executions > 0

    ?

    Math.round(



        (

            data.success /

            data.executions

        )

        *

        100



    )

    :

    0;






    return data;



},





// ==========================================
// ALL AGENT PERFORMANCE
// ==========================================

getAllPerformance(){



    const result=[];





    this.agents.forEach((agent)=>{



        result.push(



            this.getPerformance(

                agent.name

            )



        );



    });





    return result;



},





// ==========================================
// STATUS DASHBOARD
// ==========================================

getDashboard(){



    return {



        totalAgents:

        this.agents.size,



        reports:

        this.reports.length,



        errors:

        this.errors.length,



        performance:

        this.getAllPerformance()



    };



},





// ==========================================
// ERROR ANALYSIS
// ==========================================

analyzeErrors(){



    const result={};





    this.errors.forEach(item=>{



        if(

            !result[item.agent]

        ){



            result[item.agent]=0;



        }





        result[item.agent]++;



    });





    return result;



},





// ==========================================
// FAILURE DETECTION
// ==========================================

detectFailures(){



    const failures=[];





    this.errors.forEach(error=>{



        const count =

        this.errors.filter(



            item =>

            item.agent === error.agent



        ).length;





        if(

            count >= 3

        ){



            failures.push({



                agent:

                error.agent,



                reason:

                "Multiple failures",



                count



            });



        }



    });





    return failures;



},





// ==========================================
// MONITOR AGENT
// ==========================================

monitorAgent(agentName){



    const health =

    this.healthCheck(

        agentName

    );





    const performance =

    this.getPerformance(

        agentName

    );





    return {



        health,


        performance



    };



},





// ==========================================
// START MONITOR LOOP
// ==========================================

startMonitoring(interval=30000){



    if(

        this.timer

    )

    return false;





    this.timer =

    setInterval(()=>{



        this.scanAgents();



    },interval);





    return true;



},





// ==========================================
// STOP MONITOR LOOP
// ==========================================

stopMonitoring(){



    if(

        this.timer

    ){



        clearInterval(

            this.timer

        );



        this.timer=null;



    }





    return true;



},// ==========================================
// AUTO RECOVERY SYSTEM
// ==========================================

recoverAgent(agentName){


    if(

        !agentName

    )

    return false;





    const recovery={



        agent:

        agentName,



        action:

        "recovery",



        time:

        Date.now(),



        success:

        false



    };





    let agent=null;





    if(

        window.AgentRegistry

    ){



        agent =

        AgentRegistry.get(

            agentName

        );



    }





    if(

        agent &&

        typeof agent.reset === "function"

    ){



        agent.reset();



        recovery.success=true;



    }





    this.logRecovery(

        recovery

    );





    this.sendLearningFeedback(

        recovery

    );





    this.save();





    return recovery;



},





// ==========================================
// RECOVERY LOG
// ==========================================

logRecovery(data){



    if(

        !this.recoveries

    ){



        this.recoveries=[];



    }





    this.recoveries.push(

        data

    );





    if(

        this.recoveries.length >

        this.maxReports

    ){



        this.recoveries.shift();



    }



},





// ==========================================
// RECOVERY FAILED AGENTS
// ==========================================

recoverFailedAgents(){



    const failures =

    this.detectFailures();





    const result=[];





    failures.forEach(item=>{



        result.push(



            this.recoverAgent(

                item.agent

            )



        );



    });





    return result;



},





// ==========================================
// LEARNING FEEDBACK
// ==========================================

sendLearningFeedback(data){



    if(

        !window.LearningAgent

    )

    return false;





    LearningAgent.run({



        action:

        "feedback",



        data:{



            action:

            "agent_recovery",



            success:

            data.success,



            result:

            data.agent



        }



    });





    return true;



},





// ==========================================
// MEMORY REPORT
// ==========================================

saveMonitorMemory(){



    if(

        !window.MemoryAgent

    )

    return false;





    MemoryAgent.run({



        action:

        "remember",



        data:{



            type:

            "monitor",



            content:

            JSON.stringify(

                this.getDashboard()

            ),



            importance:

            "normal",



            tags:[


                "monitor",


                "health",


                "agents"



            ]



        }



    });





    return true;



},





// ==========================================
// SMART MONITOR RULES
// ==========================================

applyRules(){



    const rules={



        offline:

        [],



        failed:

        [],



        warning:

        []



    };





    const reports =

    this.scanAgents();





    reports.forEach(item=>{



        if(

            !item.online

        ){



            rules.offline.push(

                item.agent

            );



        }





        if(

            item.status ===

            "failed"

        ){



            rules.failed.push(

                item.agent

            );



        }





        if(

            item.status ===

            "working"

        ){



            rules.warning.push(

                item.agent

            );



        }



    });





    return rules;



},





// ==========================================
// AUTO HEALTH CYCLE
// ==========================================

healthCycle(){



    const report =

    this.scanAgents();





    const rules =

    this.applyRules();





    if(

        rules.offline.length

    ){



        this.recoverFailedAgents();



    }





    this.saveMonitorMemory();





    return {



        report,


        rules



    };



},// ==========================================
// SAVE MONITOR DATA
// ==========================================

save(){


    try{


        if(

            typeof localStorage === "undefined"

        )

        return false;





        const data={



            reports:

            this.reports,



            errors:

            this.errors,



            recoveries:

            this.recoveries || []



        };





        localStorage.setItem(


            this.storageKey,


            JSON.stringify(data)


        );





        return true;



    }


    catch(error){


        console.error(


            "Monitor Save Error",

            error


        );



        return false;



    }



},





// ==========================================
// LOAD MONITOR DATA
// ==========================================

load(){


    try{


        if(

            typeof localStorage === "undefined"

        )

        return false;





        const data =


        localStorage.getItem(


            this.storageKey


        );





        if(!data)

        return false;





        const parsed =


        JSON.parse(data);





        if(parsed.reports){



            this.reports =

            parsed.reports;



        }





        if(parsed.errors){



            this.errors =

            parsed.errors;



        }





        if(parsed.recoveries){



            this.recoveries =

            parsed.recoveries;



        }





        return true;



    }


    catch(error){


        console.error(


            "Monitor Load Error",

            error


        );



        return false;



    }



},





// ==========================================
// STATUS
// ==========================================

getStatus(){


    return {



        version:

        this.version,



        status:

        this.status,



        reports:

        this.reports.length,



        errors:

        this.errors.length,



        dashboard:

        this.getDashboard()



    };


},





// ==========================================
// RESET
// ==========================================

reset(){



    this.reports=[];



    this.errors=[];



    this.recoveries=[];



    this.stopMonitoring();



    this.save();





    return true;



},





// ==========================================
// AGENT REGISTRY REGISTER
// ==========================================

register(){



    if(

        !window.AgentRegistry

    )

    return false;





    AgentRegistry.register(



        "AgentMonitor",



        this,



        {


            type:

            "core",



            group:

            "monitoring",



            priority:

            5,



            tags:[



                "monitor",


                "health",


                "recovery",


                "analytics"



            ]



        }



    );





    return true;



},





// ==========================================
// AGENT BUS CONNECT
// ==========================================

connectBus(){



    if(

        !window.AgentBus

    )

    return false;





    AgentBus.subscribe(



        "AgentMonitor",



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

onBusMessage(message){



    if(

        !message

    )

    return false;





    switch(message.type){



        case "health_check":



            this.healthCheck(

                message.data.agent

            );


        break;





        case "monitor_cycle":



            this.healthCycle();


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


        "🚀 AgentMonitor Online"


    );



},



};




// ==========================================
// EXPORT
// ==========================================

window.AgentMonitor =

AgentMonitor;




// ==========================================
// START
// ==========================================

AgentMonitor.boot();





console.log(


"✅ AgentMonitor V1 PRO Loaded"


);



})();