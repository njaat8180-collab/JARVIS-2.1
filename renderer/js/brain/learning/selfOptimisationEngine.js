// ==========================================
// JARVIS V10
// Self Optimisation Engine V1
// brain/learning/selfOptimisationEngine.js
// ==========================================

"use strict";


(function(){


const SelfOptimisationEngine = {


    version:"1.0.0",

    status:"idle",



    config:{


        maxMemory:5000,


        removeFailed:false,


        optimizeInterval:300000


    },




// ==========================================
// INIT
// ==========================================

init(){

    this.status="ready";


    console.log(
        "⚙ SelfOptimisationEngine Initialized"
    );


    return true;

},




// ==========================================
// GET MEMORY ENGINE
// ==========================================

getMemory(){


    if(
        window.SelfLearningAgent
    ){

        return SelfLearningAgent.load();

    }


    return [];

},




// ==========================================
// SAVE MEMORY
// ==========================================

saveMemory(memory=[]){


    if(
        window.SelfLearningAgent
    ){

        SelfLearningAgent.save(memory);

        return true;

    }


    return false;

},




// ==========================================
// REMOVE DUPLICATES
// ==========================================

removeDuplicates(memory=[]){


    const map={};


    return memory.filter(item=>{


        const key =

        String(item.query||"")
        .toLowerCase()
        +
        "_"
        +
        String(item.intent||"");



        if(map[key]){

            return false;

        }


        map[key]=true;


        return true;


    });


},




// ==========================================
// SORT BEST MEMORY
// ==========================================

rankMemory(memory=[]){


    return memory.sort((a,b)=>{


        const scoreA =

        (a.success ? 10 : -5)

        +

        (a.successCount || 0)

        -

        (a.failureCount || 0);



        const scoreB =

        (b.success ? 10 : -5)

        +

        (b.successCount || 0)

        -

        (b.failureCount || 0);



        return scoreB-scoreA;


    });


},




// ==========================================
// REMOVE WEAK DATA
// ==========================================

removeWeak(memory=[]){


    if(
        !this.config.removeFailed
    ){

        return memory;

    }



    return memory.filter(item=>{


        return (

            item.success !== false

            ||

            item.successCount > 0

        );


    });


},




// ==========================================
// LIMIT MEMORY SIZE
// ==========================================

limitMemory(memory=[]){


    if(

        memory.length >

        this.config.maxMemory

    ){

        return memory.slice(

            0,

            this.config.maxMemory

        );

    }


    return memory;

},




// ==========================================
// OPTIMIZE MEMORY
// ==========================================

optimizeMemory(){


    let memory =

    this.getMemory();



    memory =

    this.removeDuplicates(

        memory

    );



    memory =

    this.rankMemory(

        memory

    );



    memory =

    this.removeWeak(

        memory

    );



    memory =

    this.limitMemory(

        memory

    );



    this.saveMemory(

        memory

    );



    return {


        optimized:true,


        records:

        memory.length


    };


},




// ==========================================
// IMPROVE KNOWLEDGE
// ==========================================

optimizeKnowledge(){


    if(
        !window.SelfLearningAgent
    )
        return false;



    const knowledge =

    SelfLearningAgent.knowledge;



    Object.keys(
        knowledge
    )
    .forEach(key=>{


        if(
            !knowledge[key]
        ){

            delete knowledge[key];

        }


    });



    return true;

},




// ==========================================
// PERFORMANCE ANALYSIS
// ==========================================

performance(){


    const memory =

    this.getMemory();



    const success =

    memory.filter(item=>

        item.success===true

    ).length;



    return {


        total:

        memory.length,


        success,


        failed:

        memory.length-success,


        accuracy:


        memory.length

        ?

        Math.round(

            success /

            memory.length

            *

            100

        )

        :

        0


    };


},




// ==========================================
// AUTO IMPROVE
// ==========================================

autoImprove(){


    const memory =

    this.optimizeMemory();



    this.optimizeKnowledge();



    console.log(

        "🧠 Self Optimisation Complete"

    );



    return {


        success:true,


        memory,


        performance:

        this.performance()


    };


},




// ==========================================
// START OPTIMIZER
// ==========================================

start(){


    this.status="running";



    console.log(

        "⚙ Self Optimisation Started"

    );



    return true;

},




// ==========================================
// STOP OPTIMIZER
// ==========================================

stop(){


    this.status="stopped";


    console.log(

        "🛑 Self Optimisation Stopped"

    );


    return true;

},




// ==========================================
// HEALTH
// ==========================================

health(){


    return {


        version:

        this.version,


        status:

        this.status,


        performance:

        this.performance()


    };


}



};




// ==========================================
// EXPORT
// ==========================================

window.SelfOptimisationEngine =
SelfOptimisationEngine;



SelfOptimisationEngine.init();



console.log(
"✅ SelfOptimisationEngine Loaded"
);



})();