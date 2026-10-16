
// ==========================================================
// JARVIS PRO MAX
// DecisionAgent V10
//
// Part 1/6
//
// Decision Intelligence Layer
//
// src/agents/DecisionAgent.js
// ==========================================================


"use strict";





class JARVISDecisionAgent {





constructor(){



    this.version = "DECISION AGENT V10";



    this.initialized = false;



    this.processing = false;





    // ==============================================
    // Decision State
    // ==============================================


    this.state = {



        lastDecision:null,



        confidence:0,



        totalDecisions:0,



        successful:0,



        failed:0



    };









    // ==============================================
    // Connected Modules
    // ==============================================


    this.modules = {



        reasoning:null,


        action:null,


        planning:null,


        memory:null,


        brain:null



    };









    // ==============================================
    // Decision Memory
    // ==============================================


    this.history = [];








    console.log(

        "⚖️ Decision Agent Created"

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

            "⚖️ Initializing Decision Agent..."

        );







        this.connectModules();







        this.initialized = true;







        console.log(

            "✅ Decision Agent Ready"

        );







        return true;



    }



    catch(error){



        console.error(

            "Decision Init Error:",

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





        this.modules.reasoning =

        window.ReasoningAgent ||

        null;








        this.modules.action =

        window.ActionAgent ||

        null;








        this.modules.planning =

        window.PlanningAgent ||

        null;








        this.modules.memory =

        window.MemoryManagerAgent ||

        null;








        this.modules.brain =

        window.JARVISBrain ||

        null;








        console.log(

            "🔗 Decision Modules Connected"

        );





    }



    catch(error){



        console.error(

            "Decision Module Connection Error",

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



        decisions:

        this.history.length,



        confidence:

        this.state.confidence



    };



}

// ==========================================================
// MAIN DECISION ENGINE
// ==========================================================


async decide(options, context={}){



    try{



        await this.init();





        this.processing = true;








        console.log(

            "⚖️ Decision Making:",

            options

        );








        if(

            !Array.isArray(options)

            ||

            options.length===0

        ){



            return {



                success:false,



                reason:

                "No options available."



            };



        }








        const evaluated =

        options.map(

            option=>{



                return {



                    option,



                    score:

                    this.scoreDecision(

                        option,

                        context

                    )



                };



            }

        );








        evaluated.sort(

            (a,b)=>

            b.score-a.score

        );








        const selected =

        evaluated[0];








        const confidence =

        this.calculateConfidence(

            evaluated

        );








        this.state.lastDecision =

        selected.option;








        this.state.confidence =

        confidence;








        this.state.totalDecisions++;








        this.processing = false;








        this.saveDecision({



            options,



            selected,



            confidence



        });








        return {



            success:true,



            decision:

            selected.option,



            score:

            selected.score,



            confidence,



            ranking:

            evaluated



        };






    }



    catch(error){



        this.processing=false;



        console.error(

            "Decision Error:",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// DECISION SCORING
// ==========================================================


scoreDecision(option,context={}){



    let score = 0.5;







    const text =

    String(option)

    .toLowerCase();








    // Speed preference


    if(

        text.includes(

            "fast"

        )

    ){



        score +=0.15;



    }








    // Safety preference


    if(

        text.includes(

            "safe"

        )

    ){



        score +=0.15;



    }








    // Efficiency


    if(

        text.includes(

            "efficient"

        )

    ){



        score +=0.1;



    }








    // Context priority


    if(

        context.priority==="high"

    ){



        score +=0.1;



    }








    return Math.min(

        score,

        1

    );



}









// ==========================================================
// CONFIDENCE CALCULATOR
// ==========================================================


calculateConfidence(results){



    if(

        !results.length

    )

    return 0;








    const best =

    results[0].score;








    const second =

    results[1]

    ?

    results[1].score

    :

    0;








    let confidence =

    best-second;








    confidence +=0.5;








    return Math.min(

        confidence,

        1

    );



}

// ==========================================================
// RISK ANALYSIS ENGINE
// ==========================================================


analyzeRisk(decision, context={}){


    try{


        let risk = 0;







        const text =

        String(decision)

        .toLowerCase();








        // Dangerous operations


        if(

            text.includes("delete")

            ||

            text.includes("remove")

            ||

            text.includes("shutdown")

        ){



            risk +=0.4;



        }








        // System level actions


        if(

            text.includes("system")

            ||

            text.includes("admin")

        ){



            risk +=0.2;



        }








        // Unknown context


        if(

            !context

        ){



            risk +=0.1;



        }








        return {



            level:

            risk>0.7

            ?

            "high"

            :

            risk>0.4

            ?

            "medium"

            :

            "low",



            score:

            Math.min(

                risk,

                1

            )



        };





    }



    catch(error){



        return {



            level:"unknown",



            score:1



        };



    }



}









// ==========================================================
// PRIORITY ENGINE
// ==========================================================


calculatePriority(task,context={}){



    try{



        let priority = "normal";







        const text =

        String(task)

        .toLowerCase();








        if(

            text.includes("urgent")

            ||

            text.includes("important")

        ){



            priority="high";



        }








        if(

            text.includes("background")

            ||

            text.includes("later")

        ){



            priority="low";



        }








        if(

            context.priority

        ){



            priority =

            context.priority;



        }








        return priority;



    }



    catch(error){



        return "normal";



    }



}









// ==========================================================
// DECISION VALIDATION
// ==========================================================


validateDecision(decision,context={}){



    try{



        const risk =

        this.analyzeRisk(

            decision,

            context

        );








        if(

            risk.level==="high"

        ){



            return {



                approved:false,



                reason:

                "High risk action requires confirmation.",



                risk



            };



        }








        return {



            approved:true,



            risk



        };







    }



    catch(error){



        return {



            approved:false



        };



    }



}









// ==========================================================
// SAFETY CHECK
// ==========================================================


async safetyCheck(action){



    try{



        console.log(

            "🛡️ Safety Check:",

            action

        );








        const blocked=[



            "format disk",



            "delete all files",



            "remove system"

        ];








        const text =

        String(action)

        .toLowerCase();








        for(

            const item of blocked

        ){



            if(

                text.includes(item)

            ){



                return {



                    safe:false,



                    reason:

                    "Blocked dangerous action."



                };



            }



        }








        return {



            safe:true



        };





    }



    catch(error){



        return {



            safe:false



        };



    }



}

// ==========================================================
// ACTION EXECUTION APPROVAL
// ==========================================================


async approveAction(action, context={}){


    try{


        console.log(

            "⚖️ Approving Action:",

            action

        );








        const validation =

        this.validateDecision(

            action,

            context

        );








        if(

            !validation.approved

        ){



            return {



                success:false,



                approved:false,



                reason:

                validation.reason,



                risk:

                validation.risk



            };



        }








        const safety =

        await this.safetyCheck(

            action

        );








        if(

            !safety.safe

        ){



            return {



                success:false,



                approved:false,



                reason:

                safety.reason



            };



        }








        return {



            success:true,



            approved:true,



            action



        };






    }



    catch(error){



        console.error(

            "Approval Error:",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// ACTION AGENT CONNECTION
// ==========================================================


async executeAction(action,data={}){



    try{



        const approval =

        await this.approveAction(

            action,

            data

        );








        if(

            !approval.approved

        ){



            return approval;



        }








        if(


            this.modules.action &&


            typeof this.modules.action.execute==="function"


        ){



            const result =

            await this.modules.action.execute(

                action,

                data

            );








            this.updateResult(

                result

            );








            return {



                success:true,



                result



            };



        }








        return {



            success:false,



            reason:

            "ActionAgent unavailable."



        };






    }



    catch(error){



        this.state.failed++;



        console.error(

            "Action Execute Error:",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// BRAIN COMMUNICATION
// ==========================================================


async sendToBrain(data){



    try{



        if(


            this.modules.brain &&


            typeof this.modules.brain.process==="function"


        ){



            return await this.modules.brain.process(

                data

            );



        }







        return null;





    }



    catch(error){



        console.error(

            "Brain Communication Error",

            error

        );



        return null;



    }



}









// ==========================================================
// DECISION PIPELINE
// ==========================================================


async pipeline(request,context={}){



    try{



        console.log(

            "🔄 Decision Pipeline:",

            request

        );








        const decision =

        await this.decide(

            request,

            context

        );








        if(

            !decision.success

        ){



            return decision;



        }








        const approval =

        await this.approveAction(

            decision.decision,

            context

        );








        return {



            decision,



            approval



        };






    }



    catch(error){



        console.error(

            "Pipeline Error:",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// RESULT UPDATE
// ==========================================================


updateResult(result){



    try{



        if(

            result.success

        ){



            this.state.successful++;



        }

        else{



            this.state.failed++;



        }








    }



    catch(error){



        console.error(

            "Result Update Error",

            error

        );



    }



}

// ==========================================================
// DECISION MEMORY SYSTEM
// ==========================================================


saveDecision(data){


    try{



        const record = {



            ...data,



            timestamp:Date.now()



        };








        this.history.push(

            record

        );








        if(

            this.history.length > 300

        ){



            this.history.shift();



        }








        if(


            this.modules.memory &&


            typeof this.modules.memory.save==="function"


        ){



            this.modules.memory.save(

                record

            );



        }








        return true;



    }



    catch(error){



        console.error(

            "Decision Save Error:",

            error

        );



        return false;



    }


}









// ==========================================================
// EXPERIENCE LEARNING
// ==========================================================


async learnExperience(data){



    try{



        console.log(

            "📚 Decision Experience:",

            data

        );








        const experience = {



            type:

            "decision_experience",



            decision:

            data.decision || null,



            result:

            data.result || null,



            success:

            data.success || false,



            time:

            Date.now()



        };








        this.saveDecision(

            experience

        );








        if(


            this.modules.memory &&


            typeof this.modules.memory.learn==="function"


        ){



            await this.modules.memory.learn(

                experience

            );



        }








        return {



            success:true



        };





    }



    catch(error){



        console.error(

            "Decision Learning Error",

            error

        );



        return {



            success:false



        };



    }



}









// ==========================================================
// FIND PREVIOUS DECISION
// ==========================================================


findPreviousDecision(query){



    try{



        const text =

        String(query)

        .toLowerCase();








        return this.history

        .filter(

            item =>



            JSON.stringify(item)

            .toLowerCase()

            .includes(text)



        )

        .slice(-5);







    }



    catch(error){



        return [];



    }



}









// ==========================================================
// SUCCESS FAILURE ANALYSIS
// ==========================================================


analyzePerformance(){



    try{



        const total =

        this.state.successful +

        this.state.failed;








        return {



            totalDecisions:

            total,



            successful:

            this.state.successful,



            failed:

            this.state.failed,



            accuracy:

            total

            ?

            (

                this.state.successful /

                total

            ).toFixed(2)

            :

            0



        };






    }



    catch(error){



        return null;



    }



}









// ==========================================================
// ADAPTIVE IMPROVEMENT
// ==========================================================


improveDecision(){



    try{



        const performance =

        this.analyzePerformance();








        if(

            !performance

        )

        return null;








        let recommendation =

        "Maintain current strategy.";








        if(

            performance.accuracy < 0.5

        ){



            recommendation =

            "Increase validation and reasoning depth.";



        }








        else if(

            performance.accuracy > 0.8

        ){



            recommendation =

            "Decision model performing well.";



        }








        return {



            performance,



            recommendation



        };





    }



    catch(error){



        return null;



    }



}









// ==========================================================
// DECISION SUMMARY
// ==========================================================


summary(){



    return {



        lastDecision:

        this.state.lastDecision,



        confidence:

        this.state.confidence,



        total:

        this.state.totalDecisions,



        performance:

        this.analyzePerformance()



    };



}

// ==========================================================
// DECISION AGENT BOOT SYSTEM
// ==========================================================


async boot(){


    try{


        console.log(

            "🚀 Decision Agent Booting..."

        );





        await this.init();







        this.connectModules();








        window.dispatchEvent(


            new CustomEvent(

                "JARVIS_DECISION_READY",

                {

                    detail:{


                        version:this.version,


                        status:"online"


                    }


                }


            )



        );








        console.log(

            "⚖️ Decision Agent V10 ONLINE"

        );








        return true;



    }



    catch(error){



        console.error(

            "Decision Boot Error:",

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



        decisions:

        this.history.length,



        confidence:

        this.state.confidence,



        success:

        this.state.successful,



        failed:

        this.state.failed,



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


window.DecisionAgent =

new JARVISDecisionAgent();









// ==========================================================
// AUTO START
// ==========================================================


window.addEventListener(


    "DOMContentLoaded",


    async()=>{


        await window.DecisionAgent.boot();



        console.log(

            "✅ DecisionAgent V10 Loaded"

        );



    }


);