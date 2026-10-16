// ==========================================================
// JARVIS PRO MAX
// ActionAgent V10
//
// Part 1/6
//
// Advanced Action Execution Layer
//
// src/agents/ActionAgent.js
// ==========================================================


"use strict";





class JARVISActionAgent {





constructor(){



    this.version = "ACTION AGENT V10";



    this.initialized = false;



    this.processing = false;





    // ==============================================
    // EXECUTION STATE
    // ==============================================


    this.state = {



        currentAction:null,



        totalActions:0,



        successful:0,



        failed:0,



        lastResult:null



    };









    // ==============================================
    // CONNECTED MODULES
    // ==============================================


    this.modules = {



        brain:null,


        planning:null,


        decision:null,


        memory:null,


        browser:null



    };









    // ==============================================
    // ACTION MEMORY
    // ==============================================


    this.history = [];








    // ==============================================
    // AVAILABLE ACTIONS
    // ==============================================


    this.actions = {



        system:[],


        applications:[],


        browser:[],


        files:[],


        utilities:[]



    };








    console.log(

        "⚡ Action Agent Created"

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

            "⚡ Initializing Action Agent..."

        );







        this.connectModules();







        this.registerActions();







        this.initialized=true;







        console.log(

            "✅ Action Agent Ready"

        );







        return true;



    }



    catch(error){



        console.error(

            "Action Init Error:",

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





        this.modules.brain =

        window.JARVISBrain ||

        null;








        this.modules.planning =

        window.PlanningAgent ||

        null;








        this.modules.decision =

        window.DecisionAgent ||

        null;








        this.modules.memory =

        window.MemoryManagerAgent ||

        null;








        this.modules.browser =

        window.BrowserBrain ||

        null;








        console.log(

            "🔗 Action Modules Connected"

        );





    }



    catch(error){



        console.error(

            "Action Connection Error",

            error

        );



    }



}









// ==========================================================
// ACTION REGISTRATION
// ==========================================================


registerActions(){



    this.actions.system=[



        "shutdown",


        "restart",


        "sleep",


        "lock"



    ];








    this.actions.applications=[



        "chrome",


        "vscode",


        "notepad",


        "calculator"



    ];








    this.actions.browser=[



        "open url",


        "search web"



    ];








    console.log(

        "📦 Actions Registered"

    );



}









// ==========================================================
// STATUS
// ==========================================================


status(){



    return {



        version:this.version,



        initialized:this.initialized,



        processing:this.processing,



        actions:this.state.totalActions,



        success:this.state.successful,



        failed:this.state.failed



    };



}

// ==========================================================
// MAIN ACTION EXECUTION ENGINE
// ==========================================================


async execute(action, data={}){


    try{


        await this.init();







        this.processing = true;








        console.log(

            "⚡ Executing Action:",

            action

        );








        this.state.currentAction =

        action;








        const parsed =

        this.parseAction(

            action,

            data

        );








        const result =

        await this.routeAction(

            parsed

        );








        this.saveResult(

            result

        );








        this.processing=false;








        return result;






    }



    catch(error){



        this.processing=false;



        this.state.failed++;








        console.error(

            "Execution Error:",

            error

        );








        return {



            success:false,



            error:error.message



        };



    }



}









// ==========================================================
// ACTION PARSER
// ==========================================================


parseAction(action,data={}){



    const text =

    String(action)

    .toLowerCase()

    .trim();








    return {



        original:action,



        text,



        data,



        type:

        this.detectActionType(

            text

        )



    };



}









// ==========================================================
// ACTION TYPE DETECTION
// ==========================================================


detectActionType(text){



    if(

        this.actions.applications.some(

            app=>

            text.includes(app)

        )

    ){



        return "application";



    }








    if(

        text.includes("open")

        ||

        text.includes("search")

    ){



        return "browser";



    }








    if(

        this.actions.system.some(

            sys=>

            text.includes(sys)

        )

    ){



        return "system";



    }








    return "utility";



}









// ==========================================================
// ACTION ROUTER
// ==========================================================


async routeAction(parsed){



    try{



        switch(

            parsed.type

        ){





            case "application":



                return await this.openApplication(

                    parsed.text

                );







            case "browser":



                return await this.browserAction(

                    parsed.text

                );







            case "system":



                return await this.systemAction(

                    parsed.text

                );







            default:



                return await this.utilityAction(

                    parsed.text

                );



        }



    }



    catch(error){



        console.error(

            "Action Route Error",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// RESULT STORAGE
// ==========================================================


saveResult(result){



    try{



        this.history.push(



            {

                action:

                this.state.currentAction,



                result,



                timestamp:

                Date.now()

            }



        );








        this.state.totalActions++;








        if(

            result.success

        ){



            this.state.successful++;



        }

        else{



            this.state.failed++;



        }








        this.state.lastResult =

        result;








        if(


            this.modules.memory &&


            typeof this.modules.memory.learn==="function"


        ){



            this.modules.memory.learn(

                {

                    input:

                    this.state.currentAction,



                    result,



                    success:

                    result.success



                }

            );



        }








    }



    catch(error){



        console.error(

            "Save Result Error",

            error

        );



    }



}

// ==========================================================
// APPLICATION CONTROL SYSTEM
// ==========================================================


async openApplication(name){


    try{


        console.log(

            "🖥️ Opening Application:",

            name

        );








        let app =

        String(name)

        .toLowerCase();








        if(

            app.includes("chrome")

        ){



            return await this.sendSystemCommand(

                "system:chrome"

            );



        }








        if(

            app.includes("vscode")

            ||

            app.includes("visual studio")

        ){



            return await this.sendSystemCommand(

                "system:vscode"

            );



        }








        if(

            app.includes("notepad")

        ){



            return await this.sendSystemCommand(

                "system:notepad"

            );



        }








        if(

            app.includes("calculator")

            ||

            app.includes("calc")

        ){



            return await this.sendSystemCommand(

                "system:calculator"

            );



        }








        return {



            success:false,



            reason:

            "Application not found."



        };






    }



    catch(error){



        console.error(

            "Application Error:",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// SYSTEM ACTION EXECUTION
// ==========================================================


async systemAction(command){



    try{



        const text =

        command.toLowerCase();








        if(

            text.includes("shutdown")

        ){



            return await this.sendSystemCommand(

                "system:shutdown"

            );



        }








        if(

            text.includes("restart")

        ){



            return await this.sendSystemCommand(

                "system:restart"

            );



        }








        if(

            text.includes("sleep")

        ){



            return await this.sendSystemCommand(

                "system:sleep"

            );



        }








        if(

            text.includes("lock")

        ){



            return await this.sendSystemCommand(

                "system:lock"

            );



        }








        return {



            success:false,



            reason:

            "Unknown system command."



        };





    }



    catch(error){



        console.error(

            "System Action Error",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// FILE OPERATIONS
// ==========================================================


async fileAction(command){



    try{



        console.log(

            "📁 File Action:",

            command

        );








        return {



            success:false,



            reason:

            "File engine not connected."



        };





    }



    catch(error){



        return {



            success:false



        };



    }



}









// ==========================================================
// SYSTEM COMMAND BRIDGE
// ==========================================================


async sendSystemCommand(channel){



    try{



        if(

            window.jarvis &&

            typeof window.jarvis[channel.split(":")[1]]

            ===

            "function"

        ){



            return await window.jarvis[

                channel.split(":")[1]

            ]();



        }








        return {



            success:false,



            reason:

            "System bridge unavailable."



        };





    }



    catch(error){



        console.error(

            "System Bridge Error:",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// UTILITY ACTION
// ==========================================================


async utilityAction(command){



    try{



        if(

            command.includes("time")

        ){



            return {



                success:true,



                response:

                new Date()

                .toLocaleTimeString()



            };



        }








        if(

            command.includes("date")

        ){



            return {



                success:true,



                response:

                new Date()

                .toLocaleDateString()



            };



        }








        return {



            success:false,



            reason:

            "Utility action unavailable."



        };





    }



    catch(error){



        return {



            success:false



        };



    }



}


async browserAction(command){


    try{


        console.log(

            "🌐 Browser Action:",

            command

        );








        if(

            this.modules.browser &&

            typeof this.modules.browser.execute==="function"

        ){



            return await this.modules.browser.execute(

                command

            );



        }








        if(

            window.jarvis &&

            typeof window.jarvis.openURL==="function"

        ){



            const url =

            this.extractURL(

                command

            );








            if(url){



                await window.jarvis.openURL(

                    url

                );








                return {



                    success:true,



                    action:

                    "open_url"



                };



            }



        }








        return {



            success:false,



            reason:

            "Browser engine unavailable."



        };






    }



    catch(error){



        console.error(

            "Browser Action Error:",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// URL EXTRACTION
// ==========================================================


extractURL(text){



    try{



        const match =

        text.match(

            /(https?:\/\/[^\s]+)/

        );








        return match

        ?

        match[1]

        :

        null;





    }



    catch(error){



        return null;



    }



}









// ==========================================================
// WORKFLOW EXECUTION
// ==========================================================


async executeWorkflow(tasks=[]){



    try{



        console.log(

            "🔄 Workflow Started:",

            tasks.length

        );








        const results=[];








        for(

            const task of tasks

        ){



            const result =

            await this.execute(

                task.action ||

                task.name ||

                task

            );








            results.push(

                {

                    task,

                    result

                }

            );








            if(

                !result.success

            ){



                console.warn(

                    "Workflow Task Failed",

                    task

                );



            }



        }








        return {



            success:true,



            results



        };





    }



    catch(error){



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
// PLANNING AGENT INTEGRATION
// ==========================================================


async executePlan(plan){



    try{



        console.log(

            "📋 Executing Plan:",

            plan

        );








        if(

            !plan

        ){



            return {



                success:false,



                reason:

                "Plan missing."



            };



        }








        const tasks =

        plan.tasks ||

        plan.steps ||

        [];








        const result =

        await this.executeWorkflow(

            tasks

        );








        if(

            this.modules.memory

        ){



            await this.modules.memory.learn(

                {

                    input:

                    "plan execution",



                    output:

                    result,



                    success:

                    result.success



                }

            );



        }








        return result;






    }



    catch(error){



        console.error(

            "Plan Execution Error",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// TASK RUNNER
// ==========================================================


async runTask(task){



    try{



        if(

            typeof task==="string"

        ){



            return await this.execute(

                task

            );



        }








        return await this.execute(

            task.action,

            task.data || {}

        );






    }



    catch(error){



        return {



            success:false,



            error:error.message



        };



    }



}









// ==========================================================
// ACTION HISTORY
// ==========================================================


getHistory(limit=20){



    return this.history

    .slice(-limit)

    .reverse();



}

// ==========================================================
// ACTION AGENT BOOT SYSTEM
// ==========================================================


async boot(){


    try{


        console.log(

            "🚀 Action Agent Booting..."

        );








        await this.init();








        window.dispatchEvent(


            new CustomEvent(

                "JARVIS_ACTION_READY",

                {

                    detail:{



                        version:this.version,



                        status:"online"



                    }


                }


            )


        );








        console.log(

            "⚡ ActionAgent V10 ONLINE"

        );








        return true;



    }



    catch(error){



        console.error(

            "Action Boot Error:",

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



        totalActions:

        this.state.totalActions,



        successful:

        this.state.successful,



        failed:

        this.state.failed,



        currentAction:

        this.state.currentAction,



        history:

        this.history.length,



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


window.ActionAgent =

new JARVISActionAgent();









// ==========================================================
// AUTO START
// ==========================================================


window.addEventListener(


    "DOMContentLoaded",


    async()=>{


        await window.ActionAgent.boot();



        console.log(

            "✅ ActionAgent V10 Loaded"

        );



    }


);
