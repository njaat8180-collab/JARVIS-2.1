// ==========================================
// JARVIS PRO MAX
// Browser V3
// Advanced Browser Memory System
// browserMemory.js
// ==========================================

"use strict";


window.BrowserMemory = {



    data:{


        lastWebsite:null,


        lastSearch:null,


        lastSearchEngine:null,


        history:[],


        research:[]


    },



    maxHistory:100,





    // ==================================
    // LOAD MEMORY
    // ==================================

    init(){


        let saved =
        localStorage.getItem(
            "JARVIS_BROWSER_MEMORY"
        );



        if(saved)
        {

            try{

                this.data =
                JSON.parse(saved);

            }
            catch(error){

                console.error(
                    "Memory Load Error",
                    error
                );

            }

        }


        console.log(
            "Browser Memory Loaded"
        );


    },







    // ==================================
    // SAVE WEBSITE
    // ==================================

    saveWebsite(site){


        this.data.lastWebsite =
        site;



        this.data.history.push({


            type:"website",


            value:site,


            time:Date.now()


        });



        this.save();


    },








    // ==================================
    // SAVE SEARCH
    // ==================================

    saveSearch(engine,query){


        this.data.lastSearch =
        query;



        this.data.lastSearchEngine =
        engine;



        this.data.history.push({


            type:"search",


            engine,


            query,


            time:Date.now()


        });



        this.limit();


        this.save();



    },







    // ==================================
    // SAVE RESEARCH RESULT
    // ==================================

    saveResearch(result){


        if(!result)
            return;



        this.data.research.push({


            query:
            result.query || "",



            results:
            result.results || [],



            sources:
            result.sources || [],



            date:
            Date.now()


        });



        this.limit();


        this.save();



        console.log(
            "Research Saved",
            result
        );


    },








    // ==================================
    // FIND PREVIOUS RESEARCH
    // ==================================

    findResearch(query){


        if(!query)
            return null;



        query =
        query.toLowerCase();



        let list =
        this.data.research;



        for(
            let i=list.length-1;
            i>=0;
            i--
        )
        {


            if(

                list[i]
                .query
                .toLowerCase()
                .includes(query)

            )
            {

                return list[i];

            }


        }



        return null;


    },







    // ==================================
    // LAST RESEARCH
    // ==================================

    getLastResearch(){


        if(
            this.data.research.length===0
        )
        return null;



        return this.data.research[
            this.data.research.length-1
        ];


    },







    // ==================================
    // GET LAST WEBSITE
    // ==================================

    getLastWebsite(){


        return this.data.lastWebsite;


    },






    // ==================================
    // GET LAST SEARCH
    // ==================================

    getLastSearch(){


        return {


            engine:
            this.data.lastSearchEngine,


            query:
            this.data.lastSearch


        };


    },






    // ==================================
    // HISTORY
    // ==================================

    getHistory(){


        return this.data.history;


    },






    // ==================================
    // MEMORY LIMIT
    // ==================================

    limit(){


        if(
            this.data.history.length >
            this.maxHistory
        )
        {


            this.data.history =
            this.data.history.slice(
                -this.maxHistory
            );


        }



        if(
            this.data.research.length >
            this.maxHistory
        )
        {


            this.data.research =
            this.data.research.slice(
                -this.maxHistory
            );


        }


    },







    // ==================================
    // SAVE LOCAL STORAGE
    // ==================================

    save(){


        localStorage.setItem(

            "JARVIS_BROWSER_MEMORY",

            JSON.stringify(
                this.data
            )

        );


    },







    // ==================================
    // CLEAR MEMORY
    // ==================================

    clear(){


        this.data={


            lastWebsite:null,


            lastSearch:null,


            lastSearchEngine:null,


            history:[],


            research:[]


        };


        this.save();


        console.log(
            "Browser Memory Cleared"
        );


    }



};



// Start

BrowserMemory.init();