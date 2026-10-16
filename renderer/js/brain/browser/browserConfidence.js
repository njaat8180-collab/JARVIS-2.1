// ==========================================
// JARVIS PRO MAX
// Browser Confidence Engine V10
// PART 8
// Confidence + Ambiguity Resolver
// ==========================================


"use strict";


(function(){



const BrowserConfidence = {



    keywords:{


        search:[

            "search",
            "find",
            "dhundo",
            "dhoondo",
            "lookup",
            "find karo"

        ],



        open:[

            "open",
            "khol",
            "launch",
            "start"

        ],



        compare:[

            "compare",
            "vs",
            "versus",
            "difference"

        ],



        product:[

            "price",
            "buy",
            "cost",
            "rate",
            "purchase"

        ]



    },






    // ======================================
    // CALCULATE SCORE
    // ======================================


    score(
        text="",
        intent=""
    ){


        text =
        text.toLowerCase();



        let score = 0;



        let words =
        this.keywords[intent] || [];





        words.forEach(word=>{


            if(
                text.includes(word)
            ){

                score += 0.25;

            }


        });





        if(
            text.length > 15
        ){

            score += 0.15;

        }





        if(
            score > 1
        ){

            score = 1;

        }



        return Number(
            score.toFixed(2)
        );


    },







    // ======================================
    // RESOLVE
    // ======================================


    resolve(
        text,
        intent
    ){


        let confidence =
        this.score(
            text,
            intent
        );



        let level;



        if(
            confidence >= 0.75
        ){

            level="high";

        }

        else if(
            confidence >=0.45
        ){

            level="medium";

        }

        else{

            level="low";

        }



        return {


            intent,

            confidence,

            level,


            text



        };


    }





};






window.BrowserConfidence =
BrowserConfidence;



console.log(
"✅ Browser Confidence Engine V10 Part 8 Loaded"
);



})();