// ==========================================================
// JARVIS PRO MAX
// PlanningAgent V10
//
// Part 1/6
//
// Advanced Planning & Workflow Intelligence Layer
//
// src/agents/PlanningAgent.js
// ==========================================================


"use strict";





class JARVISPlanningAgent {





constructor(){



    this.version = "PLANNING AGENT V10";



    this.initialized = false;



    this.processing = false;





    // ==============================================
    // Planning State
    // ==============================================


    this.state = {



        currentGoal:null,



        currentPlan:null,



        totalPlans:0,



        completedPlans:0,



        failedPlans:0



    };









    // ==============================================
    // Connected Modules
    // ==============================================


    this.modules = {



        reasoning:null,


        decision:null,


        action:null,


        memory:null,


        brain:null



    };









    // ==============================================
    // Planning Memory
    // ==============================================


    this.plans = [];








    console.log(

        "📋 Planning Agent Created"

    );



}









// ==========================================================
// INITIALIZE
// ==========================================================


async init(){



    try{



        if(this.initialized)

            return true;







        console.log(

            "📋 Initializing Planning Agent..."

        );







        this.connectModules();







        this.initialized = true;







        console.log(

            "✅ Planning Agent Ready"

        );







        return true;



    }



    catch(error){



        console.error(

            "Planning Init Error:",

            error

        );



        return false;



    }



}









// ==========================================================
// MODULE CONNECTION
// ==========================================================


connectModules(){



    try{





        this.modules.reasoning =

        window.ReasoningAgent ||

        null;








        this.modules.decision =

        window.DecisionAgent ||

        null;








        this.modules.action =

        window.ActionAgent ||

        null;








        this.modules.memory =

        window.MemoryManagerAgent ||

        null;








        this.modules.brain =

        window.JARVISBrain ||

        null;








        console.log(

            "🔗 Planning Modules Connected"

        );





    }



    catch(error){



        console.error(

            "Planning Module Connection Error",

            error

        );



    }



}









// ==========================================================
// STATUS
// ==========================================================


status(){



    return {



        version:this.version,



        initialized:this.initialized,



        processing:this.processing,



        plans:

        this.plans.length,



        currentGoal:

        this.state.currentGoal



    };



}

// ==========================================================
// MAIN PLANNING ENGINE
// ==========================================================


async createPlan(goal, context={}){


    try{


        await this.init();





        this.processing = true;








        const objective =

        this.analyzeGoal(

            goal,

            context

        );








        const steps =

        this.generateSteps(

            objective

        );








        const plan = {



            id:

            Date.now(),



            goal,



            objective,



            steps,



            status:

            "created",



            created:

            new Date().toISOString()



        };








        this.state.currentGoal =

        goal;








        this.state.currentPlan =

        plan;








        this.state.totalPlans++;








        this.processing=false;








        this.savePlan(

            plan

        );








        return {



            success:true,



            plan



        };






    }



    catch(error){



        this.processing=false;



        console.error(

            "Plan Creation Error:",

            error

        );



        return {



            success:false,



            error:error.message



        };



    }



}









// ==========================================================
// GOAL ANALYSIS
// ==========================================================


analyzeGoal(goal,context={}){



    const text =

    String(goal)

    .toLowerCase()

    .trim();








    const objective = {



        goal:text,



        type:"general",



        priority:"normal",



        complexity:"medium",



        context



    };








    if(

        text.includes("build")

        ||

        text.includes("create")

    ){



        objective.type =

        "creation";



    }








    if(

        text.includes("fix")

        ||

        text.includes("repair")

    ){



        objective.type =

        "problem_solving";



        objective.priority =

        "high";



    }








    if(

        text.includes("learn")

        ||

        text.includes("study")

    ){



        objective.type =

        "learning";



    }








    if(

        text.includes("fast")

        ||

        text.includes("urgent")

    ){



        objective.priority =

        "high";



    }








    return objective;



}









// ==========================================================
// STEP GENERATOR
// ==========================================================


generateSteps(objective){



    const steps=[];








    switch(

        objective.type

    ){





        case "creation":



            steps.push(

                "Analyze requirements",

                "Design solution",

                "Build components",

                "Test system",

                "Deploy result"

            );



        break;








        case "problem_solving":



            steps.push(

                "Understand issue",

                "Find root cause",

                "Generate fixes",

                "Apply solution",

                "Verify result"

            );



        break;








        case "learning":



            steps.push(

                "Collect information",

                "Understand concepts",

                "Practice",

                "Evaluate progress"

            );



        break;








        default:



            steps.push(

                "Analyze goal",

                "Create approach",

                "Execute task",

                "Review outcome"

            );



    }








    return steps;



}

// ==========================================================
// TASK BREAKDOWN SYSTEM
// ==========================================================


breakdownTask(task){


    try{


        const text =

        String(task)

        .toLowerCase();








        const subtasks=[];








        if(

            text.includes("build")

        ){



            subtasks.push(

                "Collect requirements",

                "Prepare architecture",

                "Implement modules",

                "Test components"

            );



        }








        else if(

            text.includes("fix")

        ){



            subtasks.push(

                "Analyze error",

                "Find cause",

                "Apply fix",

                "Verify system"

            );



        }








        else{



            subtasks.push(

                "Analyze task",

                "Execute task",

                "Review result"

            );



        }








        return subtasks;



    }



    catch(error){



        console.error(

            "Task Breakdown Error",

            error

        );



        return [];



    }



}









// ==========================================================
// CREATE TASK OBJECTS
// ==========================================================


createTasks(steps=[]){



    return steps.map(

        (step,index)=>({



            id:index+1,



            name:step,



            status:"pending",



            progress:0,



            dependency:

            index===0

            ?

            null

            :

            index,



            created:

            Date.now()



        })

    );



}









// ==========================================================
// TASK SCHEDULER
// ==========================================================


scheduleTasks(tasks=[]){



    try{



        return tasks.sort(

            (a,b)=>{



                if(

                    a.dependency===null

                )

                return -1;



                return a.id-b.id;



            }

        );





    }



    catch(error){



        return tasks;



    }



}









// ==========================================================
// DEPENDENCY CHECK
// ==========================================================


checkDependency(task,tasks=[]){



    try{



        if(

            task.dependency===null

        ){



            return true;



        }








        const previous =

        tasks.find(

            item =>

            item.id===task.dependency

        );








        return previous &&

        previous.status==="completed";







    }



    catch(error){



        return false;



    }



}









// ==========================================================
// PROGRESS TRACKING
// ==========================================================


updateProgress(planId,taskId,status){



    try{



        const plan =

        this.plans.find(

            item=>

            item.id===planId

        );








        if(!plan)

        return false;








        const task =

        plan.tasks?.find(

            item=>

            item.id===taskId

        );








        if(task){



            task.status=status;








            if(

                status==="completed"

            ){



                task.progress=100;



            }








        }








        return true;



    }



    catch(error){



        return false;



    }



}









// ==========================================================
// EXECUTION STATUS
// ==========================================================


getPlanStatus(plan){



    try{



        const total =

        plan.tasks?.length || 0;








        const completed =

        plan.tasks?.filter(

            task=>

            task.status==="completed"

        ).length || 0;








        return {



            total,



            completed,



            progress:

            total

            ?

            Math.round(

                (

                    completed /

                    total

                )*100

            )

            :

            0



        };





    }



    catch(error){



        return null;



    }



}

// ==========================================================
// EXECUTION PLANNER
// ==========================================================


async prepareExecution(plan){


    try{


        console.log(

            "⚙️ Preparing Execution:",

            plan

        );








        if(!plan){



            return {



                success:false,



                reason:

                "Plan missing."



            };



        }








        const tasks =

        this.createTasks(

            plan.steps || []

        );








        const scheduled =

        this.scheduleTasks(

            tasks

        );








        plan.tasks =

        scheduled;








        plan.status =

        "ready";








        return {



            success:true,



            plan



        };





    }



    catch(error){



        console.error(

            "Execution Prepare Error",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// ACTION AGENT COORDINATION
// ==========================================================


async executeTask(task){



    try{



        console.log(

            "🚀 Executing Task:",

            task.name

        );








        if(


            this.modules.action &&


            typeof this.modules.action.execute==="function"


        ){



            const result =

            await this.modules.action.execute(

                task.name

            );








            task.status =

            result.success

            ?

            "completed"

            :

            "failed";








            return result;



        }








        return {



            success:false,



            reason:

            "ActionAgent unavailable."



        };






    }



    catch(error){



        console.error(

            "Task Execution Error",

            error

        );



        task.status="failed";



        return {



            success:false



        };



    }



}









// ==========================================================
// DECISION AGENT SUPPORT
// ==========================================================


async chooseBestPlan(plans=[]){



    try{



        if(

            !this.modules.decision

        ){



            return plans[0] || null;



        }








        const result =

        await this.modules.decision.decide(

            plans,

            {

                priority:"normal"

            }

        );








        return result.decision || plans[0];





    }



    catch(error){



        console.error(

            "Plan Decision Error",

            error

        );



        return plans[0] || null;



    }



}









// ==========================================================
// WORKFLOW RUNNER
// ==========================================================


async runWorkflow(plan){



    try{



        if(!plan.tasks){



            await this.prepareExecution(

                plan

            );



        }








        plan.status=

        "running";








        for(

            const task of plan.tasks

        ){



            const allowed =

            this.checkDependency(

                task,

                plan.tasks

            );








            if(!allowed){



                continue;



            }








            const result =

            await this.executeTask(

                task

            );








            if(

                !result.success

            ){



                plan.status=

                "failed";



                return {



                    success:false,



                    plan



                };



            }



        }








        plan.status=

        "completed";








        this.state.completedPlans++;








        return {



            success:true,



            plan



        };







    }



    catch(error){



        this.state.failedPlans++;








        console.error(

            "Workflow Error",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// BRAIN COMMUNICATION
// ==========================================================


async sendToBrain(data){



    try{



        if(


            this.modules.brain &&


            typeof this.modules.brain.process==="function"


        ){



            return await this.modules.brain.process(

                data

            );



        }








        return null;



    }



    catch(error){



        return null;



    }



}

// ==========================================================
// PLAN MEMORY SYSTEM
// ==========================================================


savePlan(plan){


    try{



        this.plans.push(

            plan

        );








        if(

            this.plans.length > 200

        ){



            this.plans.shift();



        }








        if(


            this.modules.memory &&


            typeof this.modules.memory.save==="function"


        ){



            this.modules.memory.save(

                {

                    type:"plan",

                    data:plan

                }

            );



        }








        return true;



    }



    catch(error){



        console.error(

            "Plan Save Error",

            error

        );



        return false;



    }


}









// ==========================================================
// EXPERIENCE LEARNING
// ==========================================================


async learnExperience(data){



    try{



        console.log(

            "📚 Planning Experience:",

            data

        );








        const experience = {



            type:

            "planning_experience",



            goal:

            data.goal || null,



            result:

            data.result || null,



            success:

            data.success || false,



            timestamp:

            Date.now()



        };








        this.savePlan(

            experience

        );








        if(


            this.modules.memory &&


            typeof this.modules.memory.learn==="function"


        ){



            await this.modules.memory.learn(

                experience

            );



        }








        return {



            success:true



        };





    }



    catch(error){



        console.error(

            "Planning Learning Error",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// FIND PREVIOUS PLANS
// ==========================================================


findPreviousPlans(goal){



    try{



        const text =

        String(goal)

        .toLowerCase();








        return this.plans

        .filter(

            plan =>



            JSON.stringify(plan)

            .toLowerCase()

            .includes(text)



        )

        .slice(-10);







    }



    catch(error){



        return [];



    }



}









// ==========================================================
// PLAN PERFORMANCE ANALYSIS
// ==========================================================


analyzePlan(plan){



    try{



        const status =

        this.getPlanStatus(

            plan

        );








        return {



            goal:

            plan.goal,



            status:

            plan.status,



            progress:

            status

            ?

            status.progress

            :

            0,



            tasks:

            status

            ?

            status.total

            :

            0



        };





    }



    catch(error){



        return null;



    }



}









// ==========================================================
// ADAPTIVE PLANNING
// ==========================================================


adaptPlan(plan){



    try{



        const analysis =

        this.analyzePlan(

            plan

        );








        if(

            !analysis

        )

        return null;








        let recommendation =

        "Plan is stable.";








        if(

            analysis.progress < 50

        ){



            recommendation =

            "Break tasks into smaller steps.";





        }








        else if(

            analysis.progress >= 100

        ){



            recommendation =

            "Plan completed successfully.";





        }








        return {



            analysis,



            recommendation



        };





    }



    catch(error){



        return null;



    }



}









// ==========================================================
// PLANNING SUMMARY
// ==========================================================


summary(){



    return {



        currentGoal:

        this.state.currentGoal,



        totalPlans:

        this.state.totalPlans,



        completed:

        this.state.completedPlans,



        failed:

        this.state.failedPlans,



        memory:

        this.plans.length



    };



}

// ==========================================================
// PLANNING AGENT BOOT SYSTEM
// ==========================================================


async boot(){


    try{


        console.log(

            "🚀 Planning Agent Booting..."

        );





        await this.init();







        this.connectModules();








        window.dispatchEvent(


            new CustomEvent(

                "JARVIS_PLANNING_READY",

                {

                    detail:{


                        version:this.version,


                        status:"online"


                    }


                }


            )



        );








        console.log(

            "📋 Planning Agent V10 ONLINE"

        );








        return true;



    }



    catch(error){



        console.error(

            "Planning Boot Error:",

            error

        );



        return false;



    }



}









// ==========================================================
// DIAGNOSTICS
// ==========================================================


diagnostics(){



    return {



        version:

        this.version,



        initialized:

        this.initialized,



        processing:

        this.processing,



        plans:

        this.plans.length,



        currentGoal:

        this.state.currentGoal,



        completed:

        this.state.completedPlans,



        failed:

        this.state.failedPlans,



        status:

        this.initialized

        ?

        "ONLINE"

        :

        "OFFLINE"



    };



}









// ==========================================================
// FINAL CLASS CLOSE
// ==========================================================

}









// ==========================================================
// GLOBAL INSTANCE
// ==========================================================


window.PlanningAgent =

new JARVISPlanningAgent();









// ==========================================================
// AUTO START
// ==========================================================


window.addEventListener(


    "DOMContentLoaded",


    async()=>{


        await window.PlanningAgent.boot();



        console.log(

            "✅ PlanningAgent V10 Loaded"

        );



    }


);