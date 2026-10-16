

// ==========================================
// JARVIS PRO MAX
// Browser Search Memory V10
// PART 10
// Learning + History Layer
// ==========================================


"use strict";


(function(){



const BrowserSearchMemory = {



    key:
    "JARVIS_BROWSER_MEMORY",




    maxItems:500,






    // ======================================
    // LOAD MEMORY
    // ======================================


   load(){


    try{


        let data =
        localStorage.getItem(
            this.key
        );



        if(!data){

            return [];

        }



        let parsed =
        JSON.parse(data);



        if(!Array.isArray(parsed)){

            return [];

        }



        return parsed;



    }
    catch(error){


        console.error(
            "❌ Memory Load Error",
            error
        );


        return [];


    }


},







    // ======================================
    // SAVE MEMORY
    // ======================================


    save(data){


        try{


            localStorage.setItem(

                this.key,

                JSON.stringify(data)

            );


        }

        catch(error){


            console.error(
                "Memory Save Error",
                error
            );


        }


    },







    // ======================================
    // ADD SEARCH
    // ======================================


   remember(
    query,
    engine,
    intent="search"
){


    let memory =
    this.load();



    // ======================================
    // MEMORY ARRAY SAFETY
    // ======================================

    if(!Array.isArray(memory)){

        console.warn(
            "⚠ Memory corrupted. Resetting..."
        );

        memory = [];

    }



    memory.unshift({


        query: query,


        engine: engine,


        intent: intent,


        time:
        Date.now()



    });





    if(
        memory.length >
        this.maxItems
    ){

        memory =
        memory.slice(
            0,
            this.maxItems
        );

    }





    this.save(
        memory
    );



    console.log(
        "🧠 Browser Memory Saved:",
        query
    );



    return true;


},







    // ======================================
    // FIND OLD QUERY
    // ======================================


    find(query=""){


    let memory =
this.load();


if(!Array.isArray(memory)){

    memory=[];

}



        query =
        query.toLowerCase();




        return memory.find(
            item =>

            item.query
            .toLowerCase()
            .includes(query)

        ) || null;


    },







    // ======================================
    // CLEAR MEMORY
    // ======================================


    clear(){


        localStorage.removeItem(
            this.key
        );


        console.log(
            "🗑 Browser Memory Cleared"
        );


    },







    // ======================================
    // STATS
    // ======================================


    stats(){


        return {


            total:
            this.load().length,


            storage:
            "localStorage"



        };


    }





};






window.BrowserSearchMemory =
BrowserSearchMemory;



console.log(
"✅ Browser Search Memory V10 Part 10 Loaded"
);



})();