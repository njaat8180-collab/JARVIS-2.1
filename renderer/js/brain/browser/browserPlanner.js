// ==========================================
// JARVIS PRO MAX
// Browser Planner V7
// PART 1 / 3
// Core Engine + Smart Plan Creation
// renderer/js/brain/browser/browserPlanner.js
// ==========================================

"use strict";


window.BrowserPlanner =
window.BrowserPlanner || {};



(function(Planner){



// ==========================================
// VERSION
// ==========================================


Planner.version = "7.1";

Planner.name =
"JARVIS Smart Browser Planner";

Planner.state =
"ONLINE";





// ==========================================
// MEMORY
// ==========================================


Planner.queue = [];

Planner.currentPlan = null;







// ==========================================
// PLAN DATABASE
// ==========================================


Planner.plans = {


    search:[

        "open_browser",

        "execute_search",

        "save_context"

    ],




    product:[

        "search_products",

        "collect_prices",

        "find_reviews",

        "compare_results"

    ],





    comparison:[

        "find_specs",

        "collect_reviews",

        "compare_features",

        "generate_summary"

    ],





    learning:[

        "find_learning_sources",

        "collect_examples",

        "create_explanation"

    ],





    research:[

        "collect_information",

        "find_sources",

        "analyze_results",

        "summarize_results"

    ],





    navigation:[

        "control_browser"

    ]


};









// ==========================================
// CREATE PLAN
// ==========================================


Planner.createPlan = function(
    command,
    query=""
){



    let intent="";





    // OBJECT COMMAND


    if(

        typeof command === "object" &&
        command !== null

    ){


        intent =

        String(
            command.intent || ""
        );



        query =

        String(
            command.query || query
        );


    }






    // STRING COMMAND


    else
    {


        intent =

        String(
            command || ""
        );


    }







    intent =
    intent.trim();



    query =
    query.trim();






    if(!intent)
    {


        console.warn(
            "⚠ Planner Empty Intent"
        );


        return null;


    }







    // DETECT TYPE


    let type =
    "research";




    if(

        typeof Planner.detectType === "function"

    ){


        type =

        Planner.detectType(

            intent,

            query

        );


    }









    // ==================================
    // SMART NAVIGATION
    // ==================================


    let steps=[];




    if(

        type==="navigation" &&

        typeof Planner.getNavigationSteps === "function"

    ){

        steps =

        Planner.getNavigationSteps(
            query
        );


    }

    else
    {


        steps =

        [

            ...(

                Planner.plans[type]

                ||

                Planner.plans.research

            )

        ];


    }








    const plan = {



        id:


        Date.now()
        +
        Math.floor(
            Math.random()*10000
        ),




        intent,



        type,



        query,




        steps,




        currentStep:0,



        completed:false,



        failed:false,



        created:

        Date.now()


    };









    console.log(

        "📋 Browser Smart Plan Created",

        plan

    );







    return plan;



};









// ==========================================
// GET CURRENT PLAN
// ==========================================


Planner.getCurrent = function(){


    return Planner.currentPlan;


};









// ==========================================
// RESET
// ==========================================


Planner.reset=function(){


    Planner.queue=[];

    Planner.currentPlan=null;



    console.log(
        "♻ Planner Reset"
    );


};









console.log(

"✅ BrowserPlanner V7 Part 1 Smart Loaded"

);





})(window.BrowserPlanner);
// ==========================================
// JARVIS PRO MAX
// Browser Planner V7
// PART 2 / 3
// Smart Detection + Queue Management
// ==========================================

"use strict";


window.BrowserPlanner =
window.BrowserPlanner || {};



(function(Planner){



// ==========================================
// DETECT PLAN TYPE
// ==========================================


Planner.detectType = function(
    intent,
    query=""
){


    const text =

    (
        String(intent)
        +
        " "
        +
        String(query)

    ).toLowerCase();




    // ===============================
    // APP CONTROL
    // ===============================


    if(
        Planner.hasAny(
            text,
            [
                "notepad",
                "calculator",
                "chrome",
                "edge",
                "vs code",
                "vscode",
                "file explorer"
            ]
        )
    ){

        return "navigation";

    }





    // ===============================
    // YOUTUBE
    // ===============================


    if(

        text.includes("youtube")

    ){

        return "navigation";

    }





    // ===============================
    // PRODUCT
    // ===============================


    if(

        Planner.hasAny(
            text,
            [
                "buy",
                "product",
                "price",
                "amazon",
                "flipkart",
                "shopping",
                "review"
            ]
        )

    ){

        return "product";

    }





    // ===============================
    // COMPARISON
    // ===============================


    if(

        Planner.hasAny(
            text,
            [
                "compare",
                "vs",
                "difference",
                "better"
            ]
        )

    ){

        return "comparison";

    }





    // ===============================
    // LEARNING
    // ===============================


    if(

        Planner.hasAny(
            text,
            [
                "learn",
                "study",
                "tutorial",
                "course",
                "explain"
            ]
        )

    ){

        return "learning";

    }





    // ===============================
    // SEARCH
    // ===============================


    if(

        Planner.hasAny(
            text,
            [
                "search",
                "find",
                "look"
            ]
        )

    ){

        return "search";

    }




    return "research";


};







// ==========================================
// OVERRIDE NAVIGATION STEPS
// ==========================================


Planner.getNavigationSteps = function(query)
{


    const text =
        String(query)
        .toLowerCase();



    if(
        text.includes("youtube")
    ){

        return [

            "open_youtube"

        ];

    }





    if(
        text.includes("notepad")
    ){

        return [

            "open_notepad"

        ];

    }





    if(
        text.includes("calculator")
    ){

        return [

            "open_calculator"


        ];

    }




    if(
        text.includes("chrome")
    ){

        return [

            "open_chrome"

        ];

    }





    return [

        "control_browser"

    ];


};







// ==========================================
// CHECK WORDS
// ==========================================


Planner.hasAny = function(
    text,
    words
){

    if(
        !text ||
        !Array.isArray(words)
    )
    {
        return false;
    }



    return words.some(

        word =>

        text.includes(
            word
        )

    );


};







// ==========================================
// ADD STEP
// ==========================================


Planner.addStep = function(
    plan,
    step
){


    if(
        !plan ||
        !step
    )
    return false;



    if(
        !Array.isArray(plan.steps)
    )
    {

        plan.steps=[];

    }



    if(
        !plan.steps.includes(step)
    )
    {

        plan.steps.push(step);

    }



    return true;


};







// ==========================================
// REMOVE STEP
// ==========================================


Planner.removeStep = function(
    plan,
    step
){

    if(
        !plan ||
        !Array.isArray(plan.steps)
    )
    return false;



    plan.steps =

    plan.steps.filter(

        item => item !== step

    );



    return true;


};







// ==========================================
// QUEUE
// ==========================================


Planner.clearQueue=function(){

    Planner.queue=[];


    console.log(
        "🧹 Planner Queue Cleared"
    );


    return true;

};





Planner.queuePlan=function(plan){


    if(!plan)
        return false;



    Planner.queue.push(plan);


    console.log(
        "📥 Plan Queued:",
        plan.id
    );


    return true;


};







Planner.nextPlan=function(){


    if(
        Planner.queue.length===0
    )
    return null;



    return Planner.queue.shift();


};







Planner.queueStatus=function(){


    return {

        pending:
        Planner.queue.length,


        current:
        Planner.currentPlan

    };


};







console.log(
"✅ BrowserPlanner V7 Part 2 Smart Loaded"
);



})(window.BrowserPlanner);
// ==========================================
// JARVIS PRO MAX
// Browser Planner V7
// PART 3 / 3
// Execution + Status + Control
// ==========================================

"use strict";


window.BrowserPlanner =
window.BrowserPlanner || {};



(function(Planner){



// ==========================================
// EXECUTE PLAN
// ==========================================

Planner.execute = function(plan)
{


    if(!plan)
    {

        console.warn(
            "⚠ No Plan Received"
        );

        return false;

    }



    // Duplicate execution protection

    if(
        window.BrowserExecution &&
        typeof BrowserExecution.isRunning === "function" &&
        BrowserExecution.isRunning()
    )
    {

        console.warn(
            "⚠ Browser Execution Already Running"
        );


        return false;

    }




    Planner.currentPlan = plan;



    console.log(
        "🚀 Executing Browser Plan",
        plan
    );





    // Send to BrowserExecution

    if(
        window.BrowserExecution &&
        typeof BrowserExecution.start === "function"
    )
    {

        BrowserExecution.start(
            plan
        );


        return true;

    }





    // Fallback mode

    Planner.runSteps(
        plan
    );



    return true;


};






// ==========================================
// STEP EXECUTOR
// ==========================================

Planner.runSteps = function(plan)
{


    if(
        !plan ||
        !Array.isArray(plan.steps)
    )
    {
        return false;
    }




    function next()
    {


        if(
            plan.currentStep >=
            plan.steps.length
        )
        {

            Planner.complete(
                plan
            );


            return;

        }




        const step =
            plan.steps[
                plan.currentStep
            ];



        console.log(
            "▶ Running Step:",
            step
        );



        plan.currentStep++;




        setTimeout(
            next,
            300
        );


    }




    next();



    return true;


};






// ==========================================
// COMPLETE PLAN
// ==========================================

Planner.complete = function(plan)
{


    if(!plan)
    {
        return false;
    }



    plan.completed = true;



    console.log(
        "✅ Plan Completed:",
        plan.id
    );



    Planner.currentPlan = null;



    return true;


};






// ==========================================
// FAIL PLAN
// ==========================================

Planner.fail = function(
    plan,
    error
)
{


    if(plan)
    {

        plan.failed = true;

        plan.error =
            error;

    }



    console.error(
        "❌ Browser Plan Failed:",
        error
    );



    Planner.currentPlan = null;



    return false;


};






// ==========================================
// STOP PLANNER
// ==========================================

Planner.stop = function()
{


    console.log(
        "🛑 Browser Planner Stopped"
    );



    Planner.queue = [];

    Planner.currentPlan = null;



    if(
        window.BrowserExecution &&
        typeof BrowserExecution.stop === "function"
    )
    {

        BrowserExecution.stop();

    }



    return true;


};






// ==========================================
// STATUS
// ==========================================

Planner.status = function()
{


    return {


        version:
            Planner.version,


        state:
            Planner.state,


        queue:
            Planner.queue.length,


        running:
            Planner.currentPlan !== null,


        current:
            Planner.currentPlan


    };


};






// ==========================================
// QUICK EXECUTE
// ==========================================

Planner.planAndExecute = function(
    intent,
    query=""
)
{


    const plan =
        Planner.createPlan(
            intent,
            query
        );



    if(!plan)
    {
        return false;
    }



    return Planner.execute(
        plan
    );


};






console.log(
    "✅ BrowserPlanner V7 Final Loaded"
);



})(window.BrowserPlanner);