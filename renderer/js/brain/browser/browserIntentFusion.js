// ==========================================
// JARVIS PRO MAX
// Browser Intent Fusion V10
// Part 7
// Smart Intent Priority System
// ==========================================


"use strict";


(function(){



const BrowserIntentFusion = {



    priority:[

        "compare",

        "product",

        "review",

        "open",

        "search"

    ],





    // ======================================
    // FUSE INTENT
    // ======================================


    detect(text=""){


        let languageIntent = null;



        if(
            window.BrowserLanguageIntelligence
        ){

            languageIntent =
            BrowserLanguageIntelligence.detectIntent(
                text
            );

        }





        let finalIntent =
        languageIntent;





        // compare override


        if(
            /vs|versus|compare|difference|muqabla/i
            .test(text)
        ){

            finalIntent="compare";

        }






        // product override


        if(
            /buy|price|cost|rate|daam|kharid/i
            .test(text)
        ){

            finalIntent="product";

        }





        // open override


        if(
            /open|open karo|khol|launch/i
            .test(text)
        ){

            finalIntent="open";

        }






        if(!finalIntent){

            finalIntent="search";

        }



        return finalIntent;


    }



};






window.BrowserIntentFusion =
BrowserIntentFusion;



console.log(
"✅ Browser Intent Fusion V10 Part 7 Loaded"
);



})();