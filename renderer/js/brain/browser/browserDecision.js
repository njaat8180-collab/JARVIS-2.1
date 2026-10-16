// ==========================================
// JARVIS PRO MAX
// Browser V3
// Smart Decision Engine
// browserDecision.js
// ==========================================

"use strict";


window.BrowserDecision = {


    rules:{



        product:{

            priority:[

                "amazon",
                "flipkart",
                "youtube",
                "reddit",
                "google"

            ]

        },



        gaming:{

            priority:[

                "youtube",
                "reddit",
                "google"

            ]

        },



        programming:{

            priority:[

                "github",
                "stackoverflow",
                "mdn",
                "youtube",
                "google"

            ]

        },



        news:{

            priority:[

                "google",
                "reddit",
                "wikipedia"

            ]

        },



        general:{

            priority:[

                "google",
                "wikipedia",
                "reddit"

            ]

        }


    },





    detectCategory(query){


        let text =
        query.toLowerCase();



        if(

            text.includes("buy")
            ||
            text.includes("price")
            ||
            text.includes("best")
            ||
            text.includes("under")

        )

        return "product";




        if(

            text.includes("minecraft")
            ||
            text.includes("valorant")
            ||
            text.includes("game")
            ||
            text.includes("gaming")

        )

        return "gaming";




        if(

            text.includes("code")
            ||
            text.includes("javascript")
            ||
            text.includes("python")
            ||
            text.includes("api")
            ||
            text.includes("programming")

        )

        return "programming";




        if(

            text.includes("news")
            ||
            text.includes("latest")

        )

        return "news";



        return "general";


    },





    decide(query){


        let category =
        this.detectCategory(
            query
        );



        let sources =
        this.rules[category]
        .priority;



        console.log(

            "Decision:",
            category,
            sources

        );



        return {


            category,

            sources


        };


    }



};