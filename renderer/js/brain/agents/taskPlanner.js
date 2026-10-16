// ==========================================
// JARVIS V10
// Autonomous Agent Core
// TaskPlanner V1 PRO
// renderer/js/brain/agents/taskPlanner.js
// ==========================================


"use strict";


(function(){



const TaskPlanner = {



    version:"1.0.0 PRO",


    name:"TaskPlanner",


    status:"idle",



    storageKey:

    "jarvis_tasks_v1",



    tasks:new Map(),



    queue:[],



    history:[],



    maxHistory:1000,




// ==========================================
// INIT
// ==========================================

init(){


    this.load();



    console.log(

        "📋 TaskPlanner Initialized"

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



        case "create":


            result =

            this.createTask(

                task.data

            );


        break;





        case "get":


            result =

            this.getTask(

                task.id

            );


        break;





        case "list":


            result =

            this.getAllTasks();


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

                "Unknown Task Action"



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
// CREATE TASK
// ==========================================

createTask(data={}){


    if(

        !data.title

    ){


        return {


            success:false,


            error:

            "Task title required"



        };


    }






    const task={



        id:

        this.generateID(),



        title:

        data.title,



        description:

        data.description || "",



        priority:

        data.priority || "normal",



        status:

        "pending",



        source:

        data.source || "manual",



        dependencies:

        data.dependencies || [],



        created:

        Date.now(),



        updated:

        Date.now()



    };






    this.tasks.set(


        task.id,


        task


    );






    this.queue.push(

        task.id

    );






    this.log(

        "create",

        task


    );






    this.save();






    return {



        success:true,


        task



    };



},





// ==========================================
// GET TASK
// ==========================================

getTask(id){



    if(

        !id

    )

    return null;





    return (


        this.tasks.get(id)

        ||

        null


    );



},





// ==========================================
// GET ALL TASKS
// ==========================================

getAllTasks(){



    return [



        ...this.tasks.values()



    ];



},





// ==========================================
// GET QUEUE
// ==========================================

getQueue(){



    return this.queue.map(


        id =>

        this.tasks.get(id)


    )

    .filter(Boolean);



},





// ==========================================
// GENERATE ID
// ==========================================

generateID(){



    return (



        "TASK_"

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
// UPDATE TASK
// ==========================================

updateTask(id, data={}){


    if(

        !this.tasks.has(id)

    ){


        return {


            success:false,


            error:

            "Task not found"



        };


    }





    const task =

    this.tasks.get(id);






    if(data.title)

        task.title =

        data.title;





    if(data.description)

        task.description =

        data.description;





    if(data.priority)

        task.priority =

        data.priority;





    if(data.status)

        task.status =

        data.status;





    if(data.dependencies)

        task.dependencies =

        data.dependencies;





    task.updated =

    Date.now();






    this.tasks.set(

        id,

        task

    );





    this.log(

        "update",

        task

    );





    this.save();





    return {


        success:true,


        task



    };


},





// ==========================================
// COMPLETE TASK
// ==========================================

completeTask(id){



    if(

        !this.tasks.has(id)

    )

    return false;





    const task =

    this.tasks.get(id);





    task.status =

    "completed";





    task.completed =

    Date.now();





    task.updated =

    Date.now();






    this.tasks.set(

        id,

        task

    );





    this.removeFromQueue(

        id

    );





    this.log(

        "complete",

        task

    );





    this.save();





    return true;



},





// ==========================================
// DELETE TASK
// ==========================================

deleteTask(id){



    if(

        !this.tasks.has(id)

    )

    return false;





    const task =

    this.tasks.get(id);





    this.tasks.delete(

        id

    );





    this.removeFromQueue(

        id

    );





    this.log(

        "delete",

        task

    );





    this.save();





    return true;



},





// ==========================================
// REMOVE FROM QUEUE
// ==========================================

removeFromQueue(id){



    this.queue =

    this.queue.filter(

        taskID =>

        taskID !== id

    );



},





// ==========================================
// PRIORITY ENGINE
// ==========================================

getPriorityTasks(){



    const priority = {



        urgent:4,


        high:3,


        normal:2,


        low:1



    };





    return [



        ...this.tasks.values()



    ]

    .filter(


        task =>

        task.status !== "completed"


    )

    .sort(

        (a,b)=>{


            return (

                priority[b.priority]

                -

                priority[a.priority]

            );


        }

    );



},





// ==========================================
// GET NEXT TASK
// ==========================================

getNextTask(){



    const tasks =

    this.getPriorityTasks();





    for(

        let task of tasks

    ){



        if(

            this.checkDependencies(

                task

            )

        ){



            return task;


        }



    }





    return null;



},





// ==========================================
// CHECK DEPENDENCIES
// ==========================================

checkDependencies(task){



    if(

        !task.dependencies ||

        task.dependencies.length===0

    )

    return true;





    for(

        let id of task.dependencies

    ){



        const dependency =

        this.tasks.get(id);





        if(

            !dependency ||

            dependency.status !== "completed"

        ){



            return false;


        }



    }





    return true;



},// ==========================================
// CONNECT GOAL MANAGER
// ==========================================

syncGoals(){


    if(

        !window.GoalManager

    )

    return false;





    const goals =

    GoalManager.run({


        action:

        "list"



    });





    if(

        !Array.isArray(goals)

    )

    return false;





    goals.forEach(goal=>{



        const exists =



        [...this.tasks.values()]

        .some(

            task =>

            task.goalID === goal.id

        );





        if(

            !exists &&

            goal.status==="active"

        ){



            this.createTask({



                title:

                goal.title,



                description:

                goal.description,



                priority:

                goal.priority,



                source:

                "GoalManager",



                goalID:

                goal.id



            });



        }



    });





    return true;



},





// ==========================================
// SEND TASK TO SCHEDULER
// ==========================================

sendToScheduler(task){



    if(

        !window.AgentScheduler

    )

    return false;





    AgentScheduler.receive({



        action:

        "schedule",



        data:

        task



    });





    return true;



},





// ==========================================
// EXECUTION PIPELINE
// ==========================================

executeNext(){



    const task =

    this.getNextTask();





    if(

        !task

    ){



        return {


            success:false,


            message:

            "No executable task"



        };


    }





    task.status =

    "running";





    task.started =

    Date.now();





    this.tasks.set(

        task.id,

        task

    );





    this.sendToScheduler(

        task

    );





    this.log(

        "execute",

        task

    );





    this.save();





    return {


        success:true,


        task



    };



},





// ==========================================
// TASK RESULT HANDLER
// ==========================================

handleResult(data={}){



    if(

        !data.id

    )

    return false;





    const task =

    this.tasks.get(

        data.id

    );





    if(

        !task

    )

    return false;





    if(

        data.success === true

    ){



        task.status =

        "completed";



        task.completed =

        Date.now();



    }

    else{


        task.status =

        "failed";


        task.error =

        data.error || "";



    }






    task.updated =

    Date.now();





    this.tasks.set(

        task.id,

        task

    );





    this.log(

        "result",

        task

    );





    this.save();





    return task;



},





// ==========================================
// SMART PLANNER
// ==========================================

plan(){



    const queue =

    this.getPriorityTasks();





    const plan=[];





    queue.forEach(task=>{



        if(

            this.checkDependencies(

                task

            )

        ){



            plan.push(task);


        }



    });





    return plan;



},





// ==========================================
// TASK ANALYSIS
// ==========================================

analyze(){



    const tasks =

    [

        ...this.tasks.values()

    ];





    return {



        total:

        tasks.length,



        pending:

        tasks.filter(

            t=>

            t.status==="pending"

        ).length,



        running:

        tasks.filter(

            t=>

            t.status==="running"

        ).length,



        completed:

        tasks.filter(

            t=>

            t.status==="completed"

        ).length,



        failed:

        tasks.filter(

            t=>

            t.status==="failed"

        ).length



    };





},





// ==========================================
// DEPENDENCY GRAPH
// ==========================================

getDependencyGraph(){



    const graph={};





    this.tasks.forEach(task=>{



        graph[task.id] =

        task.dependencies || [];



    });





    return graph;



},// ==========================================
// SAVE TASK DATA
// ==========================================

save(){


    try{


        if(

            typeof localStorage === "undefined"

        )

        return false;





        const data = {


            tasks:


            [

                ...this.tasks.values()

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


            "Task Save Error",

            error


        );



        return false;



    }



},





// ==========================================
// LOAD TASK DATA
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






        if(parsed.tasks){



            parsed.tasks.forEach(task=>{



                this.tasks.set(


                    task.id,


                    task


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


            "Task Load Error",

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



        totalTasks:

        this.tasks.size,



        queueSize:

        this.queue.length,



        history:

        this.history.length



    };


},





// ==========================================
// RESET
// ==========================================

reset(){



    this.tasks.clear();



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



        "TaskPlanner",



        this,



        {


            type:

            "core",



            group:

            "planning",



            priority:

            20,



            tags:[


                "tasks",


                "planner",


                "execution",


                "automation"



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



        "TaskPlanner",



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



        case "task_result":



            this.handleResult(

                message.data

            );


        break;





        case "goal_update":



            this.syncGoals();


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


        "🚀 TaskPlanner Online"


    );



},



};




// ==========================================
// EXPORT
// ==========================================

window.TaskPlanner =

TaskPlanner;




// ==========================================
// START
// ==========================================

TaskPlanner.boot();





console.log(


"✅ TaskPlanner V1 PRO Loaded"


);



})();