// ==========================================
// JARVIS V10
// Experience Replay Engine V1
// brain/learning/experienceReplayEngine.js
// ==========================================

"use strict";


(function(){


const ExperienceReplayEngine = {


    version:"1.0.0",

    status:"idle",

    maxReplay:50,




// ==========================================
// INIT
// ==========================================

init(){

    this.status="ready";

    console.log(
        "🔁 ExperienceReplayEngine Initialized"
    );

    return true;

},




// ==========================================
// CREATE EXPERIENCE
// ==========================================

create(data={}){


    if(!data.query)
        return null;



    return {


        id:

        Date.now(),


        query:

        data.query,


        task:

        data.task || "",


        agent:

        data.agent || "",


        intent:

        data.intent || "",


        result:

        data.result || "",


        success:

        data.success !== false,


        reward:

        data.success !== false

        ? 1

        : -1,


        executionTime:

        data.executionTime || 0,


        timestamp:

        Date.now()


    };


},




// ==========================================
// STORE EXPERIENCE
// ==========================================

store(experience,memory=[]){


    if(!experience)
        return memory;



    memory.unshift(
        experience
    );



    if(
        memory.length >
        this.maxReplay
    ){

        memory =

        memory.slice(

            0,

            this.maxReplay

        );

    }



    return memory;


},




// ==========================================
// GET EXPERIENCES
// ==========================================

get(memory=[],limit=20){


    if(!Array.isArray(memory))
        return [];



    return memory.slice(

        0,

        limit

    );


},




// ==========================================
// SUCCESS EXPERIENCES
// ==========================================

successful(memory=[]){


    return memory.filter(item=>


        item.success===true


    );


},




// ==========================================
// FAILED EXPERIENCES
// ==========================================

failed(memory=[]){


    return memory.filter(item=>


        item.success===false


    );


},




// ==========================================
// FIND EXPERIENCE
// ==========================================

find(query="",memory=[]){


    if(!query)
        return null;



    return memory.find(item=>


        String(item.query)

        .toLowerCase()

        ===

        String(query)

        .toLowerCase()


    ) || null;


},




// ==========================================
// REPLAY
// ==========================================

replay(query="",memory=[]){


    const experience =

    this.find(

        query,

        memory

    );



    if(!experience){


        return {


            found:false,


            message:

            "Experience Not Found"


        };


    }



    return {


        found:true,


        experience


    };


},




// ==========================================
// BEST EXPERIENCE
// ==========================================

best(memory=[]){


    if(!memory.length)
        return null;



    let best=null;

    let score=-999;



    memory.forEach(item=>{


        const value =

        item.reward || 0;



        if(value > score){


            score=value;

            best=item;


        }


    });



    return best;


},




// ==========================================
// EXPERIENCE SCORE
// ==========================================

score(query="",memory=[]){


    const item =

    this.find(

        query,

        memory

    );



    if(!item)
        return 0;



    return item.reward || 0;


},




// ==========================================
// LEARN FROM EXPERIENCE
// ==========================================

learn(experience,memory=[]){


    const created =

    this.create(

        experience

    );



    return this.store(

        created,

        memory

    );


},




// ==========================================
// REPLAY TRAINING
// ==========================================

train(memory=[]){


    const success =

    this.successful(

        memory

    ).length;



    const failed =

    this.failed(

        memory

    ).length;



    return {


        trained:true,


        total:

        memory.length,


        success,


        failed,


        accuracy:


        memory.length

        ?

        Math.round(

            (

                success /

                memory.length

            )

            *

            100

        )

        :

        0


    };


},




// ==========================================
// OPTIMIZE EXPERIENCE
// ==========================================

optimize(memory=[]){


    return memory.sort(

        (a,b)=>

        (

            b.reward || 0

        )

        -

        (

            a.reward || 0

        )

    );


},




// ==========================================
// REMOVE BAD EXPERIENCE
// ==========================================

cleanup(memory=[]){


    return memory.filter(item=>


        item.reward >= -1


    );


},




// ==========================================
// STATISTICS
// ==========================================

stats(memory=[]){


    return {


        total:

        memory.length,


        successful:

        this.successful(memory).length,


        failed:

        this.failed(memory).length,


        best:

        this.best(memory)


    };


},




// ==========================================
// HEALTH
// ==========================================

health(){


    return {


        version:

        this.version,


        status:

        this.status


    };


}



};




// ==========================================
// EXPORT
// ==========================================

window.ExperienceReplayEngine =
ExperienceReplayEngine;



ExperienceReplayEngine.init();



console.log(
"✅ ExperienceReplayEngine Loaded"
);



})();