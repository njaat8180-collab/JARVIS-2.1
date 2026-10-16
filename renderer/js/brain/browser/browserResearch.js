// ==========================================
// JARVIS PRO MAX
// Browser V3
// AI Research Mode
// browserResearch.js
// ==========================================

"use strict";


window.BrowserResearch = {


    topics:{


        programming:[

            "google",
            "github",
            "stackoverflow",
            "mdn",
            "reddit"

        ],


        gaming:[

            "google",
            "youtube",
            "reddit"

        ],


        shopping:[

            "google",
            "amazon",
            "flipkart"

        ],


        general:[

            "google",
            "wikipedia",
            "reddit"

        ]


    },



    detectCategory(query){


        let text =
        query.toLowerCase();



        if(

            text.includes("code")
            ||
            text.includes("javascript")
            ||
            text.includes("python")
            ||
            text.includes("programming")
            ||
            text.includes("api")
            ||
            text.includes("software")

        )

        return "programming";



        if(

            text.includes("game")
            ||
            text.includes("minecraft")
            ||
            text.includes("valorant")
            ||
            text.includes("gaming")

        )

        return "gaming";



        if(

            text.includes("buy")
            ||
            text.includes("price")
            ||
            text.includes("best")
            ||
            text.includes("laptop")

        )

        return "shopping";



        return "general";


    },



    research(query){


        if(!query)
            return false;



        let category =
        this.detectCategory(
            query
        );



        let engines =
        this.topics[category];



        console.log(

            "Research Mode:",
            category,
            engines

        );



        BrowserMultiSearch.multiSearch(

            engines,

            query

        );



        if(
            window.BrowserContext
        ){

            BrowserContext.saveSearch(

                "research",

                query

            );

        }



        return true;


    }



};