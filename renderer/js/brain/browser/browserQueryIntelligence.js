// ==========================================
// JARVIS PRO MAX
// Browser Query Intelligence V10
// Part 1
// Advanced Query Cleaning + Extraction
// ==========================================

"use strict";


(function(){


const BrowserQueryIntelligence = {



    fillerWords:[

        "pe",
        "par",
        "ka",
        "ki",
        "ke",
        "karo",
        "karo",
        "do",
        "dhoondo",
        "dhundo",
        "find",
        "search",
        "please",
        "jarvis",
        "mujhe",
        "batao",
        "chahiye",
        "hai"

    ],



    platforms:[

        "youtube",
        "google",
        "github",
        "amazon",
        "flipkart",
        "reddit"

    ],



    clean(query=""){


        let text =
        query
        .toLowerCase()
        .trim();



        // remove jarvis

        text =
        text.replace(
            /\bjarvis\b/g,
            ""
        );



        // remove platform names

        this.platforms.forEach(p=>{

            text =
            text.replace(
                new RegExp(
                    "\\b"+p+"\\b",
                    "gi"
                ),
                ""
            );

        });



        // remove filler words

        this.fillerWords.forEach(word=>{


            text =
            text.replace(

                new RegExp(
                    "\\b"+word+"\\b",
                    "gi"
                ),

                " "

            );


        });



        return text

        .replace(
            /\s+/g,
            " "
        )

        .trim();


    },





    extractPlatform(text=""){


        text =
        text.toLowerCase();



        for(
            const p of this.platforms
        ){

            if(
                text.includes(p)
            ){

                return p;

            }

        }


        return null;


    }





};





window.BrowserQueryIntelligence =
BrowserQueryIntelligence;



console.log(
"✅ Browser Query Intelligence V10 Part 1 Loaded"
);



})();