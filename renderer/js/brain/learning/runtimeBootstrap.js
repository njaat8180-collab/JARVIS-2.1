// ==========================================
// JARVIS V10
// Learning Runtime Bootstrap
// runtimeBootstrap.js
// ==========================================

"use strict";


(function(){



const RuntimeBootstrap = {



    version:"1.0.0",



    started:false,



// ==========================================
// INIT ENGINE LIST
// ==========================================

engines:[

    "SelfLearningAgent",

    "ReinforcementEngine",

    "PredictionEngine",

    "ExperienceReplayEngine",

    "AdaptiveIntelligence",

    "SelfOptimisationEngine",

    "BackgroundLearningEngine",

    "BackupRecoveryEngine",

    "AnalyticsEngine",

    "HealthMonitor"

],





// ==========================================
// INIT ALL ENGINES
// ==========================================

init(){



    console.log(

        "🚀 Learning Runtime Initializing..."

    );



    this.loadEngines();



    this.connectEngines();



    this.startEngines();



    this.started=true;



    console.log(

        "✅ Learning Runtime Started"

    );



    return true;


},





// ==========================================
// LOAD ENGINE CHECK
// ==========================================

loadEngines(){



    this.engines.forEach(engine=>{



        if(window[engine]){


            console.log(

                "✔ Loaded:",

                engine

            );


        }

        else{


            console.warn(

                "⚠ Missing:",

                engine

            );


        }



    });



},





// ==========================================
// CONNECT ENGINES
// ==========================================

connectEngines(){



    console.log(

        "🔗 Connecting Learning Engines..."

    );



    if(window.SelfLearningAgent){



        if(

            typeof SelfLearningAgent.connectBus

            ===

            "function"

        ){

            SelfLearningAgent.connectBus();

        }



        if(

            typeof SelfLearningAgent.connectManager

            ===

            "function"

        ){

            SelfLearningAgent.connectManager();

        }



    }






    console.log(

        "🔗 Learning Engines Connected"

    );



},





// ==========================================
// START ENGINES
// ==========================================

startEngines(){



// Background Learning

if(

    window.BackgroundLearningEngine

){


    BackgroundLearningEngine.init();


    BackgroundLearningEngine.start();


}




// Backup

if(

    window.BackupRecoveryEngine

){


    BackupRecoveryEngine.init();


    BackupRecoveryEngine.start();


}





// Analytics

if(

    window.AnalyticsEngine

){


    AnalyticsEngine.init();


}





// Health Monitor

if(

    window.HealthMonitor

){


    HealthMonitor.init();


}




},





// ==========================================
// STOP RUNTIME
// ==========================================

stop(){



    if(

        window.BackgroundLearningEngine

    ){


        BackgroundLearningEngine.stop();


    }




    if(

        window.BackupRecoveryEngine

    ){


        BackupRecoveryEngine.stop();


    }



    this.started=false;



    console.log(

        "🛑 Learning Runtime Stopped"

    );



    return true;


},





// ==========================================
// STATUS
// ==========================================

status(){



    return{


        version:this.version,


        running:this.started,


        engines:this.engines.map(engine=>({


            name:engine,


            loaded:

            !!window[engine]


        }))



    };


},





// ==========================================
// HEALTH
// ==========================================

health(){



    if(

        window.HealthMonitor

    ){


        return HealthMonitor.report();


    }



    return{


        status:"offline"


    };


},





// ==========================================
// RESTART
// ==========================================

restart(){


    this.stop();


    setTimeout(()=>{


        this.init();



    },1000);



    return true;


}



};




// ==========================================
// GLOBAL EXPORT
// ==========================================

window.RuntimeBootstrap =

RuntimeBootstrap;




// ==========================================
// AUTO START
// ==========================================

setTimeout(()=>{


    RuntimeBootstrap.init();


},1000);




console.log(

"✅ RuntimeBootstrap Loaded"

);



})();