// ==========================================
// JARVIS V10
// Autonomous Agent Core
// GoalManager V1 PRO
// renderer/js/brain/agents/goalManager.js
// ==========================================


"use strict";


(function(){



const GoalManager = {



    version:"1.0.0 PRO",


    name:"GoalManager",


    status:"idle",



    storageKey:

    "jarvis_goals_v1",



    goals:new Map(),



    history:[],



    maxHistory:1000,




// ==========================================
// INIT
// ==========================================

init(){


    this.load();



    console.log(

        "🎯 GoalManager Initialized"

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

            this.createGoal(

                task.data

            );


        break;




        case "get":


            result =

            this.getGoal(

                task.id

            );


        break;




        case "list":


            result =

            this.getAllGoals();


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

                "Unknown Goal Action"



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
// CREATE GOAL
// ==========================================

createGoal(data={}){


    if(

        !data.title

    ){


        return {


            success:false,


            error:

            "Goal title required"



        };


    }






    const goal={



        id:

        this.generateID(),



        title:

        data.title,



        description:

        data.description || "",



        priority:

        data.priority || "normal",



        status:

        "active",



        progress:

        0,



        created:

        Date.now(),



        updated:

        Date.now()



    };






    this.goals.set(


        goal.id,


        goal


    );






    this.log(

        "create",


        goal


    );





    this.save();






    return {



        success:true,


        goal



    };



},





// ==========================================
// GET SINGLE GOAL
// ==========================================

getGoal(id){



    if(

        !id

    )

    return null;





    return (

        this.goals.get(id)

        ||

        null

    );



},





// ==========================================
// GET ALL GOALS
// ==========================================

getAllGoals(){



    return [


        ...this.goals.values()


    ];



},





// ==========================================
// GENERATE ID
// ==========================================

generateID(){



    return (

        "GOAL_"

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
// HISTORY LOG
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



},
// ==========================================
// UPDATE GOAL
// ==========================================

updateGoal(id, data={}){


    if(

        !this.goals.has(id)

    ){


        return {


            success:false,


            error:

            "Goal not found"



        };


    }





    const goal =

    this.goals.get(id);






    if(data.title)

        goal.title = data.title;




    if(data.description)

        goal.description = data.description;




    if(data.priority)

        goal.priority = data.priority;




    if(

        typeof data.progress === "number"

    ){


        goal.progress =

        Math.min(

            100,

            Math.max(

                0,

                data.progress

            )

        );


    }






    goal.updated =

    Date.now();






    this.goals.set(

        id,

        goal

    );






    this.log(

        "update",

        goal

    );






    this.save();






    return {



        success:true,


        goal



    };


},





// ==========================================
// COMPLETE GOAL
// ==========================================

completeGoal(id){



    if(

        !this.goals.has(id)

    )


    return false;





    const goal =

    this.goals.get(id);





    goal.status =

    "completed";




    goal.progress =

    100;




    goal.completed =

    Date.now();





    goal.updated =

    Date.now();






    this.goals.set(

        id,

        goal

    );






    this.log(

        "complete",

        goal

    );





    this.save();





    return true;


},





// ==========================================
// DELETE GOAL
// ==========================================

deleteGoal(id){



    if(

        !this.goals.has(id)

    )

    return false;





    const goal =

    this.goals.get(id);





    this.goals.delete(id);





    this.log(

        "delete",

        goal

    );





    this.save();





    return true;


},





// ==========================================
// SEARCH GOAL
// ==========================================

searchGoal(query){



    if(

        !query

    )

    return [];





    const text =

    query.toLowerCase();





    const result=[];





    this.goals.forEach(goal=>{



        const target =


        (

            goal.title

            +

            " "

            +

            goal.description

        )

        .toLowerCase();





        if(

            target.includes(text)

        ){


            result.push(goal);


        }



    });





    return result;



},





// ==========================================
// GET ACTIVE GOALS
// ==========================================

getActiveGoals(){



    return [


        ...this.goals.values()


    ]

    .filter(


        goal =>

        goal.status === "active"


    );


},





// ==========================================
// PRIORITY ENGINE
// ==========================================

getPriorityGoals(){



    const priority={



        high:3,


        normal:2,


        low:1



    };





    return [


        ...this.goals.values()


    ]

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
// FIND NEXT GOAL
// ==========================================

getNextGoal(){



    const goals =

    this.getPriorityGoals();





    return (

        goals.find(

            goal =>

            goal.status==="active"

        )

        ||

        null

    );



},// ==========================================
// CONVERT GOAL TO TASK
// ==========================================

createTaskFromGoal(id){


    const goal =

    this.getGoal(id);




    if(!goal)

    return false;





    const task={



        id:

        "TASK_" +

        Date.now(),



        source:

        "GoalManager",



        goalID:

        goal.id,



        title:

        goal.title,



        description:

        goal.description,



        priority:

        goal.priority,



        status:

        "pending",



        created:

        Date.now()



    };





    this.sendToPlanner(

        task

    );





    this.log(

        "task_created",

        task

    );





    return task;



},





// ==========================================
// TASK PLANNER CONNECT
// ==========================================

sendToPlanner(task){



    if(

        !window.TaskPlanner

    ){


        return false;


    }






    TaskPlanner.receive({



        action:

        "create",



        data:

        task



    });






    return true;



},





// ==========================================
// UPDATE PROGRESS
// ==========================================

updateProgress(id,value){



    const goal =

    this.getGoal(id);





    if(!goal)

    return false;





    goal.progress =

    Math.min(

        100,

        Math.max(

            0,

            value

        )

    );





    goal.updated =

    Date.now();





    if(

        goal.progress === 100

    ){


        goal.status =

        "completed";


    }






    this.goals.set(

        id,

        goal

    );





    this.log(

        "progress",

        goal

    );





    this.save();





    return goal;



},





// ==========================================
// GOAL ANALYSIS
// ==========================================

analyzeGoals(){



    const all =

    [

        ...this.goals.values()

    ];





    return {



        total:

        all.length,



        active:

        all.filter(

            g=>

            g.status==="active"

        ).length,



        completed:

        all.filter(

            g=>

            g.status==="completed"

        ).length,



        highPriority:

        all.filter(

            g=>

            g.priority==="high"

        ).length



    };



},





// ==========================================
// GOAL RECOMMENDATION
// ==========================================

recommend(){



    const next =

    this.getNextGoal();





    if(!next)

    return {



        success:false,


        message:

        "No active goal"



    };





    return {



        success:true,



        recommendation:

        next



    };



},





// ==========================================
// AGENT BUS SEND
// ==========================================

sendToBus(data){

    if(!window.AgentBus) return false;

    // BUGFIX: same AgentBus.send() misuse as agentExecutor.js's dispatch()
    // -- send() needs (from, to, message) as 3 args, not one object, so
    // this call always failed silently and TaskPlanner's syncGoals()
    // (which listens for a "goal_update" message on its own "TaskPlanner"
    // channel) never actually received anything from here.
    if(typeof AgentBus.emit === "function"){

        AgentBus.emit("TaskPlanner", {
            from: this.name,
            type: "goal_update",
            data
        });

    } else {

        AgentBus.send(this.name, "TaskPlanner", {
            type: "goal_update",
            data
        });

    }

    return true;

},





// ==========================================
// AGENT BUS RECEIVE
// ==========================================

onBusMessage(message){



    if(

        !message

    )

    return false;





    if(

        message.type ===

        "goal_progress"

    ){



        this.updateProgress(


            message.data.id,


            message.data.progress


        );


    }





    return true;



},// ==========================================
// SAVE GOALS
// ==========================================

save(){


    try{


        if(

            typeof localStorage === "undefined"

        )

        return false;





        const data = {


            goals:


            [

                ...this.goals.values()

            ],



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


            "Goal Save Error",


            error


        );



        return false;



    }



},





// ==========================================
// LOAD GOALS
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





        if(parsed.goals){



            parsed.goals.forEach(goal=>{



                this.goals.set(


                    goal.id,


                    goal


                );



            });



        }






        if(parsed.history){



            this.history =

            parsed.history;



        }





        return true;



    }


    catch(error){


        console.error(


            "Goal Load Error",


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



        totalGoals:

        this.goals.size,



        activeGoals:

        this.getActiveGoals().length,



        history:

        this.history.length



    };


},





// ==========================================
// RESET
// ==========================================

reset(){



    this.goals.clear();



    this.history=[];



    this.save();



    return true;



},





// ==========================================
// REGISTER AGENT
// ==========================================

register(){



    if(

        !window.AgentRegistry

    )

    return false;





    AgentRegistry.register(



        "GoalManager",



        this,



        {


            type:

            "core",



            group:

            "planning",



            priority:

            15,



            tags:[


                "goal",


                "planning",


                "task",


                "autonomous"



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



        "GoalManager",



        (message)=>{



            this.onBusMessage(


                message


            );



        }



    );





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


        "🚀 GoalManager Online"


    );



},



};




// ==========================================
// EXPORT
// ==========================================

window.GoalManager =

GoalManager;




// ==========================================
// START
// ==========================================

GoalManager.boot();





console.log(


"✅ GoalManager V1 PRO Loaded"


);



})();