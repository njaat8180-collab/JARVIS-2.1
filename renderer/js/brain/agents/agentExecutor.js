// ==========================================
// JARVIS V10
// Autonomous Agent Core
// AgentExecutor V1 PRO
// renderer/js/brain/agents/agentExecutor.js
// ==========================================


"use strict";


(function(){



const AgentExecutor = {



    version:"1.0.0 PRO",


    name:"AgentExecutor",


    status:"idle",



    storageKey:

    "jarvis_executor_v1",



    executions:new Map(),



    queue:[],



    history:[],



    maxHistory:1000,




// ==========================================
// INIT
// ==========================================

init(){


    this.load();



    console.log(

        "⚙️ AgentExecutor Initialized"

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



        case "execute":


            result =

            this.execute(

                task.data

            );


        break;





        case "result":


            result =

            this.handleResult(

                task.data

            );


        break;





        case "queue":


            result =

            this.getQueue();


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

                "Unknown Executor Action"



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
// EXECUTE TASK
// ==========================================

execute(task={}){


    if(

        !task.id

    ){


        return {


            success:false,


            error:

            "Task ID missing"



        };


    }






    const execution={



        id:

        this.generateID(),



        taskID:

        task.id,



        agent:

        this.selectAgent(

            task

        ),



        status:

        "running",



        started:

        Date.now()



    };






    this.executions.set(


        execution.id,


        execution


    );






    this.queue.push(


        execution.id


    );






    this.log(

        "execute",

        execution

    );






    this.dispatch(

        execution,

        task

    );






    this.save();






    return {



        success:true,


        execution



    };



},





// ==========================================
// SELECT AGENT
// ==========================================

selectAgent(task){



    if(

        task.agent

    )

    return task.agent;





    const title =

    (

        task.title ||

        ""

    )

    .toLowerCase();





    if(

        title.includes("browser")

    )

    return "BrowserAgent";





    if(

        title.includes("file")

    )

    return "FileAgent";





    if(

        title.includes("app")

    )

    return "AppAgent";





    if(

        title.includes("search")

    )

    return "BrowserAgent";





    return "GeneralAgent";



},





// ==========================================
// DISPATCH EXECUTION
// ==========================================

dispatch(execution,task){

    if(!window.AgentBus) return false;

    // BUGFIX: AgentBus.send() takes 3 positional args (from, to, message),
    // not one object literal -- the previous call here always resolved
    // "to" as undefined, so AgentBus silently rejected every dispatch
    // ("Invalid Message") and no execution was ever actually delivered.
    // AgentBus.emit(event, data) is what subscribed agents actually
    // listen on via AgentBus.subscribe(agentName, callback) -- emitting
    // to the target agent's own name is what those subscriptions expect.
    if(typeof AgentBus.emit === "function"){

        AgentBus.emit(execution.agent, {
            from: this.name,
            type: "execute_task",
            data: { execution, task }
        });

    } else {

        AgentBus.send(this.name, execution.agent, {
            type: "execute_task",
            execution,
            task
        });

    }

    return true;

},





// ==========================================
// GENERATE ID
// ==========================================

generateID(){



    return (


        "EXEC_"

        +

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
// LOG
// ==========================================

log(action,data){



    this.history.push({



        action,



        data,



        time:

        Date.now()



    });






    if(

        this.history.length >

        this.maxHistory

    ){


        this.history.shift();


    }



},// ==========================================
// AGENT ROUTING
// ==========================================

routeTask(task){



    const agent =

    this.selectAgent(

        task

    );





    return {


        task,


        agent



    };



},





// ==========================================
// QUEUE MANAGEMENT
// ==========================================

getQueue(){



    return this.queue.map(


        id =>


        this.executions.get(id)


    )

    .filter(Boolean);



},





// ==========================================
// REMOVE EXECUTION
// ==========================================

removeFromQueue(id){



    this.queue =

    this.queue.filter(


        item =>

        item !== id


    );



},





// ==========================================
// RESULT HANDLER
// ==========================================

handleResult(data={}){



    if(

        !data.executionID

    ){



        return {


            success:false,


            error:

            "Execution ID missing"



        };



    }






    const execution =

    this.executions.get(


        data.executionID


    );






    if(

        !execution

    ){



        return false;


    }





    if(

        data.success === true

    ){



        execution.status =

        "completed";



        execution.result =

        data.result || "";



        execution.completed =

        Date.now();



    }

    else{



        execution.status =

        "failed";



        execution.error =

        data.error || "Unknown Error";



        execution.failed =

        Date.now();



        this.handleFailure(

            execution

        );



    }






    this.executions.set(


        execution.id,


        execution


    );






    this.removeFromQueue(


        execution.id


    );






    this.log(

        "result",

        execution


    );






    this.save();






    this.sendFeedback(

        execution

    );






    return execution;



},





// ==========================================
// FAILURE DETECTION
// ==========================================

checkFailure(execution){



    if(

        !execution

    )

    return false;





    return (

        execution.status ===

        "failed"

    );



},





// ==========================================
// FAILURE RECOVERY
// ==========================================

handleFailure(execution){



    if(

        !execution

    )

    return false;





    const recovery={



        executionID:

        execution.id,



        action:

        "retry",



        attempts:

        execution.retry || 0



    };





    execution.retry =

    recovery.attempts + 1;





    if(

        execution.retry <= 3

    ){



        execution.status =

        "retry_pending";



        this.queue.push(

            execution.id

        );



    }

    else{



        execution.status =

        "permanent_failure";



    }






    this.log(

        "recovery",

        recovery


    );






    return recovery;



},





// ==========================================
// RETRY EXECUTION
// ==========================================

retry(executionID){



    const execution =

    this.executions.get(

        executionID

    );





    if(

        !execution

    )

    return false;






    execution.status =

    "running";





    execution.started =

    Date.now();





    this.executions.set(


        executionID,


        execution


    );






    this.queue.push(

        executionID

    );





    return true;



},





// ==========================================
// SEND FEEDBACK
// ==========================================

sendFeedback(execution){



    if(

        !window.LearningAgent

    )

    return false;





    LearningAgent.run({



        action:

        "feedback",



        data:{



            action:

            execution.agent,



            success:

            execution.status==="completed",



            result:

            execution.result || execution.error



        }



    });





    return true;



},// ==========================================
// MEMORY LOGGING
// ==========================================

saveExecutionMemory(execution){


    if(

        !window.MemoryAgent

    )

    return false;





    MemoryAgent.run({



        action:

        "remember",



        data:{



            type:

            "execution",



            content:

            JSON.stringify(

                execution

            ),



            importance:

            "normal",



            tags:[


                "agent",


                "execution",


                execution.agent



            ]



        }



    });





    return true;


},





// ==========================================
// AGENT PERFORMANCE
// ==========================================

getAgentPerformance(){



    const result={};





    this.executions.forEach(execution=>{



        const agent =

        execution.agent;





        if(

            !result[agent]

        ){



            result[agent]={



                total:0,


                success:0,


                failed:0



            };


        }





        result[agent].total++;





        if(

            execution.status ===

            "completed"

        ){



            result[agent].success++;


        }





        if(

            execution.status ===

            "failed"

        ){



            result[agent].failed++;


        }



    });





    return result;



},





// ==========================================
// AGENT SCORE
// ==========================================

getAgentScore(agent){



    const stats =

    this.getAgentPerformance()[agent];





    if(

        !stats ||

        stats.total===0

    )

    return 0;





    return Math.round(



        (

            stats.success /

            stats.total

        )

        *

        100



    );



},





// ==========================================
// BEST AGENT
// ==========================================

getBestAgent(){



    let best=null;


    let score=0;





    const agents =

    this.getAgentPerformance();





    Object.keys(agents)

    .forEach(agent=>{



        const value =

        this.getAgentScore(

            agent

        );





        if(

            value > score

        ){



            score=value;


            best=agent;



        }



    });





    return {



        agent:best,


        score



    };



},





// ==========================================
// SMART ROUTER
// ==========================================

smartRoute(task){



    const route =

    this.routeTask(

        task

    );





    const best =

    this.getBestAgent();





    if(

        best.agent &&

        best.score >= 80

    ){



        route.agent =

        best.agent;



    }





    return route;



},





// ==========================================
// EXECUTION ANALYTICS
// ==========================================

getAnalytics(){



    const executions =

    [

        ...this.executions.values()

    ];





    return {



        total:

        executions.length,



        running:

        executions.filter(

            e=>

            e.status==="running"

        ).length,



        completed:

        executions.filter(

            e=>

            e.status==="completed"

        ).length,



        failed:

        executions.filter(

            e=>

            e.status==="failed"

        ).length,



        retry:

        executions.filter(

            e=>

            e.status==="retry_pending"

        ).length



    };



},





// ==========================================
// AUTO OPTIMIZE
// ==========================================

optimize(){



    const best =

    this.getBestAgent();





    this.log(


        "optimization",


        best


    );





    return best;



},// ==========================================
// SAVE EXECUTOR DATA
// ==========================================

save(){


    try{


        if(

            typeof localStorage === "undefined"

        )

        return false;





        const data = {


            executions:


            [

                ...this.executions.values()

            ],



            queue:

            this.queue,



            history:

            this.history



        };





        localStorage.setItem(


            this.storageKey,


            JSON.stringify(data)


        );





        return true;



    }


    catch(error){


        console.error(


            "Executor Save Error",

            error


        );



        return false;



    }



},





// ==========================================
// LOAD EXECUTOR DATA
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






        if(parsed.executions){



            parsed.executions.forEach(item=>{



                this.executions.set(


                    item.id,


                    item


                );



            });



        }






        if(parsed.queue){



            this.queue =

            parsed.queue;



        }






        if(parsed.history){



            this.history =

            parsed.history;



        }





        return true;



    }


    catch(error){


        console.error(


            "Executor Load Error",

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



        executions:

        this.executions.size,



        queue:

        this.queue.length,



        analytics:

        this.getAnalytics()



    };


},





// ==========================================
// RESET
// ==========================================

reset(){



    this.executions.clear();



    this.queue=[];



    this.history=[];



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



        "AgentExecutor",



        this,



        {


            type:

            "core",



            group:

            "execution",



            priority:

            30,



            tags:[


                "executor",


                "routing",


                "automation",


                "recovery"



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



        "AgentExecutor",



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



        case "execute":



            this.execute(

                message.data

            );


        break;





        case "execution_result":



            this.handleResult(

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


        "🚀 AgentExecutor Online"


    );



},



};




// ==========================================
// EXPORT
// ==========================================

window.AgentExecutor =

AgentExecutor;




// ==========================================
// START
// ==========================================

AgentExecutor.boot();





console.log(


"✅ AgentExecutor V1 PRO Loaded"


);



})();