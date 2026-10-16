// ==========================================
// JARVIS PRO MAX
// Browser V3
// Autonomous Research Loop
// browserResearchLoop.js
// ==========================================

"use strict";


window.BrowserResearchLoop = {



    running:false,


    maxCycles:5,


    cycle:0,


    memory:[],




    // ==================================
    // START RESEARCH
    // ==================================

    start(query){


        if(!query)
            return false;



        this.running=true;


        this.cycle=0;


        this.memory=[];



        console.log(
            "Autonomous Research Started:",
            query
        );



        this.runCycle(query);



        return true;


    },






    // ==================================
    // RESEARCH CYCLE
    // ==================================

    runCycle(query){



        if(
            !this.running
        )
            return;



        if(
            this.cycle >=
            this.maxCycles
        )
        {


            this.complete(query);

            return;

        }



        this.cycle++;



        console.log(

            "Research Cycle:",
            this.cycle

        );





        let missing =
        this.detectMissing();



        let searchQuery =
        query;



        if(missing)
        {


            searchQuery =
            query +
            " " +
            missing;


        }




        this.search(

            searchQuery

        );



    },







    // ==================================
    // SEARCH HANDLER
    // ==================================

    search(query){



        console.log(

            "Research Search:",
            query

        );



        if(
            window.BrowserSearch
        )
        {


            BrowserSearch.google(
                query
            );


        }



        setTimeout(()=>{


            this.collect({

                query,

                result:
                "Collected Data"


            });



        },1500);



    },








    // ==================================
    // COLLECT INFORMATION
    // ==================================

    collect(data){



        this.memory.push(
            data
        );



        setTimeout(()=>{


            this.runCycle(
                data.query
            );


        },1000);



    },







    // ==================================
    // FIND MISSING DATA
    // ==================================

    detectMissing(){



        let count =
        this.memory.length;



        if(count===0)
        {

            return "specifications";

        }



        if(count===1)
        {

            return "reviews";

        }



        if(count===2)
        {

            return "comparison";

        }



        return null;


    },







    // ==================================
    // COMPLETE
    // ==================================

    complete(query){



        this.running=false;



        let report={


            query,


            cycles:
            this.cycle,


            data:
            this.memory,


            time:
            Date.now()


        };



        console.log(

            "Research Complete:",
            report

        );




        if(
            window.BrowserMemory
        )
        {


            BrowserMemory.saveResearch(
                report
            );


        }




        if(
            window.TTSEngine
        )
        {


            TTSEngine.speak(
                "Research completed"
            );


        }


    }




};
