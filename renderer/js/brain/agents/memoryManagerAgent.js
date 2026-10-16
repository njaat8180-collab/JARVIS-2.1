// ==========================================================
// JARVIS PRO MAX
// MemoryManagerAgent V10
//
// Part 1/6
//
// Advanced Memory & Learning Storage Layer
//
// src/agents/MemoryManagerAgent.js
// ==========================================================


"use strict";





class JARVISMemoryManagerAgent {





constructor(){



    this.version = "MEMORY MANAGER AGENT V10";



    this.initialized = false;



    this.processing = false;





    // ==============================================
    // MEMORY STATE
    // ==============================================


    this.state = {



        totalMemories:0,



        shortTerm:0,



        longTerm:0,



        experiences:0,



        lastSaved:null



    };









    // ==============================================
    // CONNECTED MODULES
    // ==============================================


    this.modules = {



        brain:null,


        reasoning:null,


        decision:null,


        planning:null



    };









    // ==============================================
    // MEMORY DATABASE
    // ==============================================


    this.memory = {



        shortTerm:[],


        longTerm:[],


        experiences:[],


        knowledge:[]



    };








    console.log(

        "🧠 Memory Manager Created"

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

            "🧠 Initializing Memory Manager..."

        );







        this.connectModules();







        await this.loadMemory();







        this.initialized = true;







        console.log(

            "✅ Memory Manager Ready"

        );







        return true;



    }



    catch(error){



        console.error(

            "Memory Init Error:",

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








        this.modules.reasoning =

        window.ReasoningAgent ||

        null;








        this.modules.decision =

        window.DecisionAgent ||

        null;








        this.modules.planning =

        window.PlanningAgent ||

        null;








        console.log(

            "🔗 Memory Modules Connected"

        );





    }



    catch(error){



        console.error(

            "Memory Connection Error",

            error

        );



    }



}









// ==========================================================
// LOAD MEMORY
// ==========================================================


async loadMemory(){



    try{



        if (window.jarvis && typeof window.jarvis.loadMemory === "function") {
            try {
                const saved = await window.jarvis.loadMemory("JARVIS_AGENT_MEMORY_V1");
                if (saved) {
                    const parsed = typeof saved === "string" ? JSON.parse(saved) : saved;
                    for (const key of ["longTerm", "experiences", "knowledge"]) {
                        if (Array.isArray(parsed?.[key])) this.memory[key] = parsed[key].slice(-500);
                    }
                    this.state.longTerm = this.memory.longTerm.length;
                    this.state.experiences = this.memory.experiences.length;
                    this.state.knowledge = this.memory.knowledge.length;
                    this.state.totalMemories = this.state.shortTerm + this.state.longTerm + this.state.experiences + this.state.knowledge;
                }
            } catch (storageError) {
                console.warn("⚠️ Saved agent memory could not be restored; continuing with chat history.", storageError?.message || storageError);
            }
        }

        if(

            window.jarvis &&

            typeof window.jarvis.loadChat==="function"

        ){

            const response = await window.jarvis.loadChat();
            // chat:load returns { success: true, data: [...] }. Accept the
            // legacy raw-array response too.
            const data = Array.isArray(response)
                ? response
                : (Array.isArray(response?.data) ? response.data : []);

            if (data.length || Array.isArray(response) || response?.success) {
                this.memory.shortTerm = data;
                this.state.shortTerm = data.length;
            } else {
                console.warn("⚠️ Invalid chat memory response. Resetting shortTerm memory.");
                this.memory.shortTerm = [];
                this.state.shortTerm = 0;
            }

        }

        return true;

    }

    catch(error){



        console.error(

            "Memory Persist Error",

            error

        );



        return false;



    }



}









// ==========================================================
// CLEAR SHORT TERM MEMORY
// ==========================================================


clearShortTerm(){



    this.memory.shortTerm=[];



    this.state.shortTerm=0;



    return true;



}

// ==========================================================
// MEMORY RECALL ENGINE
// ==========================================================


async recall(query, limit=5){


    try{


        await this.init();








        const results = [];








        const sources = [



            ...this.memory.shortTerm,



            ...this.memory.longTerm,



            ...this.memory.experiences,



            ...this.memory.knowledge



        ];








        const searchText =

        String(query)

        .toLowerCase();








        for(

            const item of sources

        ){



            const content =

            JSON.stringify(item)

            .toLowerCase();








            if(

                content.includes(searchText)

            ){



                results.push(



                    {

                        ...item,

                        relevance:

                        this.calculateRelevance(

                            searchText,

                            content

                        )

                    }



                );



            }



        }








        results.sort(

            (a,b)=>

            b.relevance-a.relevance

        );








        return results.slice(

            0,

            limit

        );





    }



    catch(error){



        console.error(

            "Recall Error:",

            error

        );



        return [];



    }



}









// ==========================================================
// RELEVANCE CALCULATION
// ==========================================================


calculateRelevance(query,text){



    try{



        let score=0;








        const words =

        query.split(

            " "

        );








        for(

            const word of words

        ){



            if(

                word.length>2 &&

                text.includes(word)

            ){



                score +=0.2;



            }



        }








        return Math.min(

            score,

            1

        );





    }



    catch(error){



        return 0;



    }



}









// ==========================================================
// CONTEXT RETRIEVAL
// ==========================================================


async getContext(topic){



    try{



        const memories =

        await this.recall(

            topic,

            10

        );








        return {



            topic,



            memories,



            count:

            memories.length



        };






    }



    catch(error){



        return {



            topic,



            memories:[]



        };



    }



}









// ==========================================================
// SMART MEMORY SEARCH
// ==========================================================


searchMemory(query){



    try{



        const all = [



            ...this.memory.shortTerm,



            ...this.memory.longTerm,



            ...this.memory.experiences,



            ...this.memory.knowledge



        ];








        return all.filter(

            item=>



            JSON.stringify(item)

            .toLowerCase()

            .includes(

                String(query)

                .toLowerCase()

            )



        );





    }



    catch(error){



        return [];



    }



}









// ==========================================================
// LAST MEMORY
// ==========================================================


getLastMemory(type=null){



    try{



        if(type && this.memory[type]){



            const list =

            this.memory[type];








            return list[

                list.length-1

            ];



        }








        return this.memory.shortTerm[

            this.memory.shortTerm.length-1

        ];







    }



    catch(error){



        return null;



    }



}

// ==========================================================
// LEARNING INTEGRATION
// ==========================================================


async persistMemory(){
    if (!window.jarvis || typeof window.jarvis.saveMemory !== "function") return false;
    const payload = {
        version: 1,
        longTerm: this.memory.longTerm.slice(-500),
        experiences: this.memory.experiences.slice(-500),
        knowledge: this.memory.knowledge.slice(-500)
    };
    const saved = await window.jarvis.saveMemory("JARVIS_AGENT_MEMORY_V1", payload);
    if (saved === true || saved?.success === true) {
        this.state.lastSaved = Date.now();
        return true;
    }
    return false;
}


async learn(data){


    try{


        console.log(

            "📚 Learning Memory:",

            data

        );








        const experience = {



            id:

            Date.now(),



            type:

            "learning",



            input:

            data.input || null,



            output:

            data.output || null,



            result:

            data.result || null,



            success:

            data.success || false,



            timestamp:

            Date.now()



        };








        this.memory.experiences.push(

            experience

        );








        this.state.experiences++;








        this.state.totalMemories++;








        await this.persistMemory();








        return {



            success:true,



            experience



        };





    }



    catch(error){



        console.error(

            "Learning Error:",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// EXPERIENCE REPLAY
// ==========================================================


replayExperience(limit=10){



    try{



        return this.memory.experiences

        .slice(-limit)

        .reverse();







    }



    catch(error){



        return [];



    }



}









// ==========================================================
// AGENT FEEDBACK STORAGE
// ==========================================================


async storeFeedback(agent,feedback){



    try{



        const data = {



            type:

            "agent_feedback",



            agent,



            feedback,



            timestamp:

            Date.now()



        };








        return await this.save(

            data,

            "experience"

        );





    }



    catch(error){



        console.error(

            "Feedback Save Error",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// PATTERN EXTRACTION
// ==========================================================


extractPatterns(){



    try{



        const patterns = {};








        for(

            const item of this.memory.experiences

        ){



            const key =

            item.input || "unknown";








            if(

                !patterns[key]

            ){



                patterns[key]=0;



            }








            patterns[key]++;



        }








        return patterns;





    }



    catch(error){



        return {};



    }



}









// ==========================================================
// MEMORY IMPORTANCE SCORE
// ==========================================================


calculateImportance(memory){



    try{



        let score=0.5;








        const text =

        JSON.stringify(memory)

        .toLowerCase();








        if(

            text.includes("important")

        ){



            score+=0.2;



        }








        if(

            text.includes("success")

        ){



            score+=0.1;



        }








        if(

            text.includes("user")

        ){



            score+=0.1;



        }








        return Math.min(

            score,

            1

        );





    }



    catch(error){



        return 0;



    }



}









// ==========================================================
// MEMORY CONSOLIDATION
// ==========================================================


consolidate(){



    try{



        const important =

        this.memory.shortTerm.filter(

            item=>



            this.calculateImportance(

                item

            )>0.7



        );








        this.memory.longTerm.push(

            ...important

        );








        this.state.longTerm =

        this.memory.longTerm.length;








        return {



            moved:

            important.length



        };





    }



    catch(error){



        return {



            moved:0



        };



    }



}

// ==========================================================
// MEMORY OPTIMIZATION SYSTEM
// ==========================================================


optimizeMemory(){


    try{


        console.log(

            "⚙️ Optimizing Memory..."

        );








        this.removeDuplicates();








        this.cleanupOldMemory();








        this.compressMemory();








        return {



            success:true,



            status:

            this.health()



        };





    }



    catch(error){



        console.error(

            "Memory Optimization Error",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// REMOVE DUPLICATE MEMORY
// ==========================================================


removeDuplicates(){



    try{



        const clean = (list)=>{



            const unique=[];



            const map=new Set();








            for(

                const item of list

            ){



                const key =

                JSON.stringify(item);








                if(

                    !map.has(key)

                ){



                    map.add(key);



                    unique.push(item);



                }



            }








            return unique;



        };








        this.memory.shortTerm =

        clean(

            this.memory.shortTerm

        );








        this.memory.longTerm =

        clean(

            this.memory.longTerm

        );








        this.memory.experiences =

        clean(

            this.memory.experiences

        );








        this.memory.knowledge =

        clean(

            this.memory.knowledge

        );








        return true;



    }



    catch(error){



        return false;



    }



}









// ==========================================================
// OLD MEMORY CLEANUP
// ==========================================================


cleanupOldMemory(days=30){



    try{



        const limit =

        Date.now()

        -

        (

            days *

            24 *

            60 *

            60 *

            1000

        );








        const cleanup=(list)=>{



            return list.filter(

                item=>{



                    return item.timestamp

                    >

                    limit;



                }

            );



        };








        this.memory.shortTerm =

        cleanup(

            this.memory.shortTerm

        );








        this.memory.experiences =

        cleanup(

            this.memory.experiences

        );








        return true;



    }



    catch(error){



        return false;



    }



}









// ==========================================================
// MEMORY COMPRESSION
// ==========================================================


compressMemory(){



    try{



        const maxShortTerm = 100;



        const maxExperience = 300;








        if(

            this.memory.shortTerm.length

            >

            maxShortTerm

        ){



            this.memory.shortTerm =

            this.memory.shortTerm.slice(

                -maxShortTerm

            );



        }








        if(

            this.memory.experiences.length

            >

            maxExperience

        ){



            this.memory.experiences =

            this.memory.experiences.slice(

                -maxExperience

            );



        }








        return true;



    }



    catch(error){



        return false;



    }



}









// ==========================================================
// MEMORY HEALTH CHECK
// ==========================================================


health(){



    try{



        return {



            shortTerm:

            this.memory.shortTerm.length,



            longTerm:

            this.memory.longTerm.length,



            experiences:

            this.memory.experiences.length,



            knowledge:

            this.memory.knowledge.length,



            total:

            this.memory.shortTerm.length

            +

            this.memory.longTerm.length

            +

            this.memory.experiences.length

            +

            this.memory.knowledge.length



        };





    }



    catch(error){



        return null;



    }



}









// ==========================================================
// RESET MEMORY
// ==========================================================


resetMemory(){



    this.memory = {



        shortTerm:[],


        longTerm:[],


        experiences:[],


        knowledge:[]



    };








    this.state.totalMemories=0;



    this.state.shortTerm=0;



    this.state.longTerm=0;



    this.state.experiences=0;








    return true;



}

// ==========================================================
// MEMORY MANAGER BOOT SYSTEM
// ==========================================================


async boot(){


    try{


        console.log(

            "🚀 Memory Manager Booting..."

        );





        await this.init();







        this.connectModules();








        window.dispatchEvent(


            new CustomEvent(

                "JARVIS_MEMORY_READY",

                {

                    detail:{


                        version:this.version,


                        status:"online"


                    }


                }


            )



        );








        console.log(

            "🧠 Memory Manager V10 ONLINE"

        );








        return true;



    }



    catch(error){



        console.error(

            "Memory Boot Error:",

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



        total:

        this.state.totalMemories,



        shortTerm:

        this.memory.shortTerm.length,



        longTerm:

        this.memory.longTerm.length,



        experiences:

        this.memory.experiences.length,



        knowledge:

        this.memory.knowledge.length,



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


window.MemoryManagerAgent =

new JARVISMemoryManagerAgent();









// ==========================================================
// AUTO START
// ==========================================================


window.addEventListener(


    "DOMContentLoaded",


    async()=>{


        await window.MemoryManagerAgent.boot();



        console.log(

            "✅ MemoryManagerAgent V10 Loaded"

        );



    }


);
