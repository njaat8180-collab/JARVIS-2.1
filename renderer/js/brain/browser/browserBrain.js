// ==========================================================
// JARVIS PRO MAX
// Browser Brain V10
//
// Part 1/6
//
// Core Browser Intelligence Layer
//
// src/browser/browserBrain.js
// ==========================================================


"use strict";





class JARVISBrowserBrain {





constructor(){


    this.version = "BROWSER BRAIN V10";



    this.initialized = false;



    this.processing = false;





    // ==============================================
    // Browser State
    // ==============================================


    this.state = {


        currentURL:null,


        lastSearch:null,


        history:[],


        active:false



    };








    // ==============================================
    // Browser Modules
    // ==============================================


    this.modules = {



        parser:null,


        planner:null,


        execution:null,


        session:null,


        memory:null



    };








    // ==============================================
    // Browser Memory
    // ==============================================


    this.memory = [];





    console.log(

        "🌐 Browser Brain Created"

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

            "🌐 Initializing Browser Brain..."

        );








        this.connectModules();








        this.initialized = true;








        console.log(

            "✅ Browser Brain Ready"

        );






        return true;





    }



    catch(error){



        console.error(

            "Browser Init Error:",

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





        this.modules.parser =

        window.BrowserParser ||

        null;








        this.modules.planner =

        window.BrowserPlanner ||

        null;








        this.modules.execution =

        window.BrowserExecution ||

        null;








        this.modules.session =

        window.BrowserSession ||

        null;








        this.modules.memory =

        window.BrowserMemory ||

        null;








        console.log(

            "🔗 Browser Modules Connected"

        );





    }



    catch(error){



        console.error(

            "Module Connection Error",

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



        memory:this.memory.length,



        modules:{



            parser:

            !!this.modules.parser,



            planner:

            !!this.modules.planner,



            execution:

            !!this.modules.execution,



            session:

            !!this.modules.session,



            memory:

            !!this.modules.memory



        }



    };



}
// ==========================================================
// BROWSER COMMAND PROCESSOR
// ==========================================================


async process(input){


    try{


        await this.init();


        this.processing = true;



        const text =

        this.normalize(input);




        console.log(

            "🌐 Browser Processing:",

            text

        );







        const command =

        this.parseCommand(

            text

        );







        this.processing = false;





        return command;





    }



    catch(error){



        this.processing = false;



        console.error(

            "Browser Process Error:",

            error

        );



        return {



            success:false,


            action:"unknown"


        };



    }



}









// ==========================================================
// TEXT NORMALIZER
// ==========================================================


normalize(text){



    return String(text)

    .toLowerCase()

    .trim()

    .replace(

        /\s+/g,

        " "

    );



}









// ==========================================================
// COMMAND PARSER
// ==========================================================


parseCommand(text){



    try{



        let action = "search";


        let query = text;






        // ==========================
        // OPEN WEBSITE
        // ==========================


        if(

            text.includes(

                "open"

            )

        ){


            action = "open";



        }







        // ==========================
        // SEARCH
        // ==========================


        if(

            text.includes(

                "search"

            )

            ||

            text.includes(

                "find"

            )

            ||

            text.includes(

                "google"

            )

        ){



            action = "search";



            query = text

            .replace(

                /search|find|google/gi,

                ""

            )

            .trim();



        }









        // ==========================
        // YOUTUBE
        // ==========================


        if(

            text.includes(

                "youtube"

            )

        ){



            action = "youtube";



            query = text

            .replace(

                /youtube/gi,

                ""

            )

            .trim();



        }









        // ==========================
        // URL DETECTION
        // ==========================


        const url =

        this.extractURL(

            text

        );





        if(url){



            action = "open";


        }









        return {



            success:true,


            action,


            query,


            url,


            original:text



        };





    }



    catch(error){



        console.error(

            "Parse Error:",

            error

        );



        return {



            success:false,


            action:"unknown"



        };



    }


}









// ==========================================================
// URL EXTRACTOR
// ==========================================================


extractURL(text){



    try{



        const pattern =

        /(https?:\/\/[^\s]+)/g;





        const match =

        text.match(

            pattern

        );





        if(match){



            return match[0];



        }







        // common websites


        const sites=[



            "youtube.com",

            "google.com",

            "github.com",

            "facebook.com"



        ];






        for(

            const site of sites

        ){



            if(

                text.includes(site)

            ){



                return (

                    "https://" +

                    site

                );



            }



        }





        return null;




    }



    catch(error){



        return null;



    }



}

// ==========================================================
// SEARCH INTELLIGENCE ENGINE
// ==========================================================


async search(query,engine="google"){



    try{



        await this.init();





        const cleanQuery =

        this.normalize(

            query

        );







        console.log(

            "🔎 Browser Search:",

            cleanQuery

        );









        const url =

        this.buildSearchURL(

            cleanQuery,

            engine

        );









        this.state.lastSearch =

        cleanQuery;








        this.memory.push({



            type:"search",



            query:cleanQuery,



            engine,



            time:Date.now()



        });








        if(

            this.memory.length > 100

        ){



            this.memory.shift();



        }








        return {



            success:true,



            action:"search",



            engine,



            query:cleanQuery,



            url



        };






    }



    catch(error){



        console.error(

            "Search Error:",

            error

        );



        return {



            success:false,



            error:error.message



        };



    }


}









// ==========================================================
// SEARCH URL BUILDER
// ==========================================================


buildSearchURL(query,engine){



    const encoded =

    encodeURIComponent(

        query

    );







    switch(engine){





        case "bing":


            return (

                "https://www.bing.com/search?q="

                +

                encoded

            );








        case "duckduckgo":


            return (

                "https://duckduckgo.com/?q="

                +

                encoded

            );









        case "youtube":


            return (

                "https://www.youtube.com/results?search_query="

                +

                encoded

            );









        default:


            return (

                "https://www.google.com/search?q="

                +

                encoded

            );



    }



}









// ==========================================================
// YOUTUBE SEARCH
// ==========================================================


async youtubeSearch(query){



    try{



        const url =

        this.buildSearchURL(

            query,

            "youtube"

        );







        this.memory.push({



            type:"youtube",



            query,



            time:Date.now()



        });









        return {



            success:true,



            action:"youtube",



            url,



            query



        };






    }



    catch(error){



        console.error(

            "YouTube Search Error",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// SMART SEARCH ROUTER
// ==========================================================


async smartSearch(text){



    try{



        const input =

        this.normalize(

            text

        );








        if(

            input.includes(

                "youtube"

            )

        ){



            return await this.youtubeSearch(

                input

                .replace(

                    "youtube",

                    ""

                )

                .trim()

            );



        }







        return await this.search(

            input

        );






    }



    catch(error){



        console.error(

            "Smart Search Error",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// SEARCH HISTORY
// ==========================================================


getSearchHistory(limit=20){



    return this.memory

    .filter(


        item =>

        item.type==="search"


    )

    .slice(

        -limit

    );



}

// ==========================================================
// BROWSER TASK PLANNER
// ==========================================================


async plan(task){


    try{


        await this.init();




        const command =

        typeof task === "string"

        ?

        await this.process(task)

        :

        task;







        console.log(

            "📋 Browser Planning:",

            command

        );








        let steps=[];







        switch(command.action){





            case "open":



                steps.push({



                    action:"open_url",



                    url:

                    command.url || command.query



                });



            break;








            case "search":



                steps.push({



                    action:"search",



                    query:

                    command.query



                });



            break;









            case "youtube":



                steps.push({



                    action:"youtube_search",



                    query:

                    command.query



                });



            break;









            default:



                steps.push({



                    action:"unknown",



                    data:command



                });



        }








        return {



            success:true,



            steps



        };





    }



    catch(error){



        console.error(

            "Planning Error:",

            error

        );



        return {



            success:false,



            steps:[]

        };



    }


}









// ==========================================================
// EXECUTION PIPELINE
// ==========================================================


async execute(task){



    try{



        console.log(

            "⚡ Browser Execute:",

            task

        );








        const plan =

        await this.plan(

            task

        );








        if(

            !plan.success

        ){



            return plan;



        }









        let results=[];







        for(

            const step of plan.steps

        ){



            const result =

            await this.executeStep(

                step

            );





            results.push(

                result

            );



        }









        return {



            success:true,



            plan,



            results



        };







    }



    catch(error){



        console.error(

            "Execution Error",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// STEP EXECUTOR
// ==========================================================


async executeStep(step){



    try{



        console.log(

            "▶ Browser Step:",

            step.action

        );








        // Browser Execution Module



        if(


            this.modules.execution &&


            typeof this.modules.execution.execute === "function"


        ){



            return await this.modules.execution.execute(

                step

            );



        }









        // Electron fallback



        if(

            window.jarvis &&

            typeof window.jarvis.openURL === "function"

        ){



            if(

                step.action==="open_url"

            ){



                await window.jarvis.openURL(

                    step.url

                );





                return {



                    success:true,



                    action:"open_url"



                };



            }








            if(

                step.action==="search"

            ){



                const url =

                this.buildSearchURL(

                    step.query,

                    "google"

                );





                await window.jarvis.openURL(

                    url

                );





                return {



                    success:true,



                    action:"search"



                };



            }






        }







        return {



            success:false,



            message:

            "Execution module unavailable"



        };





    }



    catch(error){



        console.error(

            "Step Error",

            error

        );



        return {



            success:false



        };



    }



}

// ==========================================================
// BROWSER MEMORY SYSTEM
// ==========================================================


saveMemory(data){


    try{


        const memory = {


            ...data,


            timestamp:Date.now()


        };





        this.memory.push(

            memory

        );








        // Keep memory size controlled


        if(

            this.memory.length > 200

        ){


            this.memory.shift();


        }






        // External Memory Module


        if(


            this.modules.memory &&


            typeof this.modules.memory.save === "function"


        ){



            this.modules.memory.save(

                memory

            );



        }







        return true;



    }



    catch(error){



        console.error(

            "Browser Memory Error",

            error

        );



        return false;



    }



}









// ==========================================================
// MEMORY SEARCH
// ==========================================================


recall(query){



    try{



        const text =

        this.normalize(

            query

        );






        return this.memory.filter(

            item =>


            JSON.stringify(item)

            .toLowerCase()

            .includes(text)



        );





    }



    catch(error){



        return [];



    }



}









// ==========================================================
// BROWSER SESSION MANAGER
// ==========================================================


createSession(){



    this.state.active = true;



    const session = {



        id:

        Date.now(),



        started:

        new Date(),

        

        url:

        this.state.currentURL



    };






    this.state.history.push(

        session

    );






    return session;



}









// ==========================================================
// UPDATE CURRENT PAGE
// ==========================================================


updateURL(url){



    try{



        this.state.currentURL = url;





        this.saveMemory({



            type:"navigation",



            url



        });






        return true;



    }



    catch(error){



        return false;



    }



}









// ==========================================================
// LEARNING SYSTEM
// ==========================================================


async learn(data){



    try{



        console.log(

            "📚 Browser Learning:",

            data

        );






        this.saveMemory({



            type:"learning",



            data



        });








        if(


            this.modules.memory &&


            typeof this.modules.memory.learn === "function"


        ){



            await this.modules.memory.learn(

                data

            );



        }







        return {



            success:true



        };




    }



    catch(error){



        console.error(

            "Browser Learn Error",

            error

        );



        return {



            success:false



        };



    }


}









// ==========================================================
// LAST ACTION
// ==========================================================


lastAction(){



    try{



        return this.memory

        .filter(

            item =>

            item.action

        )

        .slice(

            -1

        )[0] || null;





    }



    catch(error){



        return null;



    }



}









// ==========================================================
// CLEAR MEMORY
// ==========================================================


clearMemory(){



    this.memory=[];



    console.log(

        "🧹 Browser Memory Cleared"

    );



}

// ==========================================================
// BROWSER BRAIN BOOT SYSTEM
// ==========================================================


async boot(){


    try{


        console.log(

            "🚀 Browser Brain Booting..."

        );





        await this.init();







        this.connectModules();







        window.dispatchEvent(


            new CustomEvent(

                "JARVIS_BROWSER_READY",

                {

                    detail:{


                        version:this.version,


                        status:"online"


                    }

                }


            )



        );







        console.log(

            "🌐 Browser Brain V10 ONLINE"

        );







        return true;



    }



    catch(error){



        console.error(

            "Browser Boot Error:",

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



        version:this.version,



        initialized:this.initialized,



        processing:this.processing,



        currentURL:

        this.state.currentURL,



        lastSearch:

        this.state.lastSearch,



        memorySize:

        this.memory.length,



        modules:{



            parser:

            !!this.modules.parser,



            planner:

            !!this.modules.planner,



            execution:

            !!this.modules.execution,



            session:

            !!this.modules.session,



            memory:

            !!this.modules.memory



        },



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


window.BrowserBrain =

new JARVISBrowserBrain();









// ==========================================================
// AUTO START
// ==========================================================


window.addEventListener(


    "DOMContentLoaded",


    async()=>{


        await window.BrowserBrain.boot();



        console.log(

            "✅ BrowserBrain V10 Loaded"

        );



    }


);