// ==========================================
// JARVIS V10
// Analytics Engine
// analyticsEngine.js
// ==========================================

"use strict";


(function(){



const AnalyticsEngine = {



    version:"1.0.0",



// ==========================================
// INIT
// ==========================================

init(){


    console.log(
        "📊 Analytics Engine Ready"
    );


    return true;

},




// ==========================================
// TOTAL LEARNING RECORDS
// ==========================================

totalRecords(){


    if(!window.SelfLearningAgent)

        return 0;



    return SelfLearningAgent.count();


},




// ==========================================
// SUCCESS COUNT
// ==========================================

successCount(){


    if(!window.SelfLearningAgent)

        return 0;



    return SelfLearningAgent
    .load()
    .filter(item=>

        item.success===true

    )
    .length;


},




// ==========================================
// FAILURE COUNT
// ==========================================

failureCount(){


    if(!window.SelfLearningAgent)

        return 0;



    return SelfLearningAgent
    .load()
    .filter(item=>

        item.success===false

    )
    .length;


},




// ==========================================
// SUCCESS RATE
// ==========================================

successRate(){


    const total =

    this.totalRecords();



    if(!total)

        return 0;



    return Math.round(


        (

            this.successCount()

            /

            total

        )

        *

        100


    );


},




// ==========================================
// FAILURE RATE
// ==========================================

failureRate(){


    return 100 - this.successRate();


},




// ==========================================
// AGENT PERFORMANCE
// ==========================================

agentPerformance(){



    const result={};



    if(!window.SelfLearningAgent)

        return result;



    SelfLearningAgent.load()

    .forEach(item=>{


        const agent =

        item.agent || "Unknown";



        if(!result[agent]){


            result[agent]={


                total:0,


                success:0,


                failed:0,


                rate:0


            };


        }




        result[agent].total++;



        if(item.success)

            result[agent].success++;

        else

            result[agent].failed++;



        result[agent].rate = Math.round(

            (

                result[agent].success

                /

                result[agent].total

            )

            *

            100

        );



    });



    return result;


},




// ==========================================
// TOP USED QUERIES
// ==========================================

topQueries(limit=10){



    if(!window.SelfLearningAgent)

        return [];



    return SelfLearningAgent.topQueries(

        limit

    );


},




// ==========================================
// INTENT ANALYTICS
// ==========================================

intentAnalytics(){


    const data={};



    if(!window.SelfLearningAgent)

        return data;



    SelfLearningAgent.load()

    .forEach(item=>{


        const intent =

        item.intent || "unknown";



        if(!data[intent]){


            data[intent]={


                total:0,


                success:0,


                failed:0


            };


        }



        data[intent].total++;



        if(item.success)

            data[intent].success++;

        else

            data[intent].failed++;



    });



    return data;


},




// ==========================================
// LEARNING TREND
// ==========================================

learningTrend(){



    if(!window.SelfLearningAgent)

        return [];



    const memory =

    SelfLearningAgent.load();



    const trend={};



    memory.forEach(item=>{


        const date =

        new Date(

            item.timestamp

        )

        .toLocaleDateString();



        if(!trend[date]){


            trend[date]={


                total:0,


                success:0,


                failed:0


            };


        }



        trend[date].total++;



        if(item.success)

            trend[date].success++;

        else

            trend[date].failed++;


    });



    return trend;


},




// ==========================================
// INTELLIGENCE SCORE
// ==========================================

intelligenceScore(){



    if(!window.SelfLearningAgent)

        return 0;



    const score =

    (

        SelfLearningAgent.learningScore()

        +

        SelfLearningAgent.getSuccessRate()

        +

        SelfLearningAgent.knowledgeCount()

    );



    return Math.round(

        score / 3

    );


},




// ==========================================
// FULL REPORT
// ==========================================

report(){



    return{


        version:this.version,


        records:this.totalRecords(),


        success:this.successCount(),


        failure:this.failureCount(),


        successRate:this.successRate(),


        failureRate:this.failureRate(),


        agents:this.agentPerformance(),


        intents:this.intentAnalytics(),


        topQueries:this.topQueries(),


        trend:this.learningTrend(),


        intelligence:

        this.intelligenceScore()


    };


},




// ==========================================
// EXPORT ANALYTICS
// ==========================================

export(){


    return JSON.stringify(

        this.report(),

        null,

        4

    );


}




};




// ==========================================
// GLOBAL EXPORT
// ==========================================

window.AnalyticsEngine =

AnalyticsEngine;




console.log(

"✅ AnalyticsEngine Loaded"

);



})();