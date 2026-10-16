// ==========================================
// JARVIS PRO MAX
// Browser V3
// Smart Browser Context Engine
// browserContext.js
// ==========================================

"use strict";


window.BrowserContext = {


    data:{


        currentSite:null,


        currentQuery:null,


        currentEngine:null,


        lastAction:null,


        lastResult:null


    },



    // ==========================
    // SAVE SEARCH CONTEXT
    // ==========================


    saveSearch(engine,query){


        this.data.currentEngine =
        engine;


        this.data.currentQuery =
        query;


        this.data.lastAction =
        "search";



        console.log(
            "Context Saved:",
            engine,
            query
        );


    },



    // ==========================
    // SAVE WEBSITE
    // ==========================


    saveSite(site){


        this.data.currentSite =
        site;


        this.data.lastAction =
        "open";


        console.log(
            "Current Site:",
            site
        );


    },



    // ==========================
    // SAVE RESULT
    // ==========================


    saveResult(result){


        this.data.lastResult =
        result;


    },



    // ==========================
    // GET CONTEXT
    // ==========================


    get(){


        return this.data;


    },



    // ==========================
    // CLEAR
    // ==========================


    clear(){


        this.data = {


            currentSite:null,

            currentQuery:null,

            currentEngine:null,

            lastAction:null,

            lastResult:null


        };


    }



};