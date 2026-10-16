// ==========================================
// JARVIS V10
// Health Monitor Engine
// healthMonitor.js
// ==========================================

"use strict";


(function(){



const HealthMonitor = {



    version:"1.0.0",



    status:"idle",




// ==========================================
// INIT
// ==========================================

init(){


    this.status="ready";


    console.log(

        "❤️ Health Monitor Engine Ready"

    );


    return true;


},




// ==========================================
// CHECK SELF LEARNING
// ==========================================

checkLearning(){


    if(!window.SelfLearningAgent){


        return{


            status:"offline",

            message:
            "SelfLearningAgent Missing"


        };


    }



    return{


        status:"online",


        records:

        SelfLearningAgent.count(),


        score:

        SelfLearningAgent.learningScore(),


        successRate:

        SelfLearningAgent.getSuccessRate()



    };


},




// ==========================================
// CHECK BACKUP
// ==========================================

checkBackup(){


    if(!window.BackupRecoveryEngine){


        return{


            status:"offline"

        };


    }



    return{


        status:"online",


        backup:

        BackupRecoveryEngine.info(),


        running:

        BackupRecoveryEngine.timer!==null


    };


},




// ==========================================
// CHECK ANALYTICS
// ==========================================

checkAnalytics(){


    if(!window.AnalyticsEngine){


        return{


            status:"offline"

        };


    }



    return{


        status:"online",


        intelligence:

        AnalyticsEngine.intelligenceScore()



    };


},




// ==========================================
// CHECK AGENT MANAGER
// ==========================================

checkAgentManager(){


    if(!window.AgentManager){


        return{


            status:"offline"

        };


    }



    return{


        status:"online"



    };


},




// ==========================================
// CHECK AGENT BUS
// ==========================================

checkAgentBus(){


    if(!window.AgentBus){


        return{


            status:"offline"

        };


    }



    return{


        status:"online"



    };


},




// ==========================================
// MEMORY HEALTH
// ==========================================

memoryHealth(){


    if(!window.SelfLearningAgent)

        return null;



    const memory =

    SelfLearningAgent.load();



    return{


        total:

        memory.length,


        size:

        JSON.stringify(memory).length,


        healthy:

        memory.length <

        SelfLearningAgent.maxItems



    };


},




// ==========================================
// FULL SYSTEM CHECK
// ==========================================

scan(){



    return{


        version:this.version,


        time:Date.now(),


        learning:

        this.checkLearning(),



        backup:

        this.checkBackup(),



        analytics:

        this.checkAnalytics(),



        agentManager:

        this.checkAgentManager(),



        agentBus:

        this.checkAgentBus(),



        memory:

        this.memoryHealth()



    };


},




// ==========================================
// QUICK STATUS
// ==========================================

isHealthy(){



    const report =

    this.scan();



    return(


        report.learning.status

        ===

        "online"


    );


},




// ==========================================
// REPAIR CHECK
// ==========================================

diagnose(){


    const issues=[];



    const report=

    this.scan();



    Object.keys(report)

    .forEach(key=>{


        if(

            report[key]

            &&

            report[key].status

            ===

            "offline"

        ){


            issues.push(key);


        }


    });



    return{


        healthy:

        issues.length===0,


        issues


    };


},




// ==========================================
// HEALTH REPORT
// ==========================================

report(){



    return{


        engine:

        "HealthMonitor",


        version:

        this.version,


        status:

        this.status,


        system:

        this.scan(),


        diagnosis:

        this.diagnose()



    };


}



};




// ==========================================
// EXPORT
// ==========================================

window.HealthMonitor =

HealthMonitor;




console.log(

"✅ HealthMonitor Loaded"

);



})();