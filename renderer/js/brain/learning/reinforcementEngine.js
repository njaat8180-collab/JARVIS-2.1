// ==========================================
// JARVIS V10
// Reinforcement Learning Engine V1
// brain/learning/reinforcementEngine.js
// ==========================================

"use strict";


(function(){


const ReinforcementEngine = {


    version:"1.0.0",


    storageKey:
    "jarvis_reinforcement_memory",



// ==========================================
// INIT
// ==========================================

init(){

    console.log(
        "🧠 ReinforcementEngine Initialized"
    );

    return true;

},




// ==========================================
// LOAD MEMORY
// ==========================================

load(){

    try{

        const data =
        localStorage.getItem(
            this.storageKey
        );


        if(!data)
            return [];


        return JSON.parse(data);


    }
    catch(error){

        console.error(
            "Reinforcement Load Error",
            error
        );

        return [];

    }

},




// ==========================================
// SAVE MEMORY
// ==========================================

save(data=[]){

    localStorage.setItem(

        this.storageKey,

        JSON.stringify(data)

    );

},




// ==========================================
// RECORD EXPERIENCE
// ==========================================

record(data={}){


    if(!data.query)
        return false;



    const memory =
    this.load();



    memory.unshift({

        id:
        Date.now(),


        query:
        data.query,


        agent:
        data.agent || "",


        intent:
        data.intent || "",


        success:
        data.success !== false,


        reward:
        data.success !== false
        ? 1
        : -1,


        timestamp:
        Date.now()

    });



    this.save(memory);


    return true;


},




// ==========================================
// APPLY REWARD
// ==========================================

reward(query="",value=1){


    const memory =
    this.load();



    const item =
    memory.find(x=>

        x.query===query

    );



    if(!item)
        return false;



    item.reward += value;


    item.timestamp =
    Date.now();



    this.save(memory);


    return true;


},




// ==========================================
// PENALTY
// ==========================================

penalty(query="",value=1){


    return this.reward(

        query,

        -value

    );


},




// ==========================================
// GET SCORE
// ==========================================

score(query=""){


    const memory =
    this.load();



    const records =
    memory.filter(x=>

        x.query===query

    );



    if(!records.length)
        return 0;



    let total=0;


    records.forEach(item=>{


        total += item.reward;


    });



    return total;


},




// ==========================================
// CONFIDENCE
// ==========================================

confidence(query=""){


    const memory =
    this.load();



    const records =
    memory.filter(x=>

        x.query===query

    );



    if(!records.length)
        return 0;



    const success =

    records.filter(x=>

        x.reward>0

    ).length;



    return Math.round(

        (

            success /

            records.length

        ) * 100

    );


},




// ==========================================
// BEST EXPERIENCE
// ==========================================

best(query=""){


    const memory =
    this.load();



    const list =

    memory.filter(x=>

        x.query===query

    );



    if(!list.length)
        return null;



    return list.sort(

        (a,b)=>

        b.reward-a.reward

    )[0];


},




// ==========================================
// SHOULD REUSE
// ==========================================

shouldReuse(query=""){


    return (

        this.confidence(query)

        >=

        80

    );


},




// ==========================================
// TRAIN
// ==========================================

train(){


    const memory =
    this.load();



    return{


        trained:true,


        experiences:
        memory.length,


        positive:

        memory.filter(x=>

            x.reward>0

        ).length,


        negative:

        memory.filter(x=>

            x.reward<0

        ).length


    };


},




// ==========================================
// CLEAR
// ==========================================

clear(){

    localStorage.removeItem(

        this.storageKey

    );


    return true;

},




// ==========================================
// HEALTH
// ==========================================

health(){


    return{


        version:
        this.version,


        records:
        this.load().length,


        status:
        "active"


    };


}



};




// ==========================================
// EXPORT
// ==========================================

window.ReinforcementEngine =
ReinforcementEngine;



ReinforcementEngine.init();



console.log(
"✅ ReinforcementEngine Loaded"
);



})();