// ==========================================
// JARVIS V10
// Prediction Engine V1
// brain/learning/predictionEngine.js
// ==========================================

"use strict";


(function(){


const PredictionEngine = {


    version:"1.0.0",


    status:"idle",




// ==========================================
// INIT
// ==========================================

init(){

    this.status="ready";

    console.log(
        "🔮 PredictionEngine Initialized"
    );

    return true;

},




// ==========================================
// PREDICT AGENT
// ==========================================

predictAgent(query="",memory=[]){


    if(
        !query ||
        !Array.isArray(memory)
    )
        return null;



    const matches =

    memory.filter(item=>{


        return String(

            item.query || ""

        )

        .toLowerCase()

        .includes(

            String(query)

            .toLowerCase()

        );


    });



    if(!matches.length)
        return null;



    const agents={};



    matches.forEach(item=>{


        const agent =

        item.agent || "Unknown";



        agents[agent]=

        (agents[agent]||0)+1;


    });



    return Object

    .entries(agents)

    .sort(

        (a,b)=>

        b[1]-a[1]

    )[0][0];


},




// ==========================================
// PREDICT INTENT
// ==========================================

predictIntent(query="",memory=[]){


    if(
        !Array.isArray(memory)
    )
        return null;



    const matches =

    memory.filter(item=>{


        return String(

            item.query || ""

        )

        .toLowerCase()

        .includes(

            String(query)

            .toLowerCase()

        );


    });



    if(!matches.length)
        return null;



    const intents={};



    matches.forEach(item=>{


        const intent =

        item.intent || "unknown";


        intents[intent]=

        (intents[intent]||0)+1;


    });



    return Object

    .entries(intents)

    .sort(

        (a,b)=>

        b[1]-a[1]

    )[0][0];


},




// ==========================================
// SUCCESS PROBABILITY
// ==========================================

successProbability(query="",memory=[]){


    const records =

    memory.filter(item=>{


        return String(

            item.query || ""

        )

        .toLowerCase()

        .includes(

            String(query)

            .toLowerCase()

        );


    });



    if(!records.length)
        return 0;



    const success =

    records.filter(item=>

        item.success===true

    ).length;



    return Math.round(

        (

            success /

            records.length

        ) * 100

    );


},




// ==========================================
// PREDICT NEXT ACTION
// ==========================================

predictNextAction(query="",memory=[]){


    const agent =

    this.predictAgent(

        query,

        memory

    );



    const intent =

    this.predictIntent(

        query,

        memory

    );



    const confidence =

    this.successProbability(

        query,

        memory

    );



    if(!agent){


        return {


            found:false,


            action:"AI",


            confidence:0


        };


    }



    return {


        found:true,


        action:agent,


        intent,


        confidence,


        execute:

        confidence>=80


    };


},




// ==========================================
// FULL PREDICTION REPORT
// ==========================================

report(query="",memory=[]){


    const prediction =

    this.predictNextAction(

        query,

        memory

    );



    return {


        query,


        agent:

        prediction.action || null,


        intent:

        prediction.intent || null,


        confidence:

        prediction.confidence,


        autoExecute:

        prediction.execute || false


    };


},




// ==========================================
// LEARN FROM RESULT
// ==========================================

learnFeedback(result={},memory=[]){


    if(
        !result.query
    )
        return memory;



    memory.unshift({


        query:

        result.query,


        agent:

        result.agent || "",


        intent:

        result.intent || "",


        success:

        result.success !== false,


        timestamp:

        Date.now()


    });



    return memory;


},




// ==========================================
// SHOULD TRUST
// ==========================================

shouldTrust(query="",memory=[]){


    return (

        this.successProbability(

            query,

            memory

        )

        >=

        85

    );


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

window.PredictionEngine =
PredictionEngine;



PredictionEngine.init();



console.log(
"✅ PredictionEngine Loaded"
);



})();