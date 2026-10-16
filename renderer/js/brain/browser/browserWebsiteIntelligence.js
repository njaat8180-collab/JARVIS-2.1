// ==========================================
// JARVIS PRO MAX
// Browser Website Intelligence V10
// Part 3
// Smart Website + Search Engine Router
// ==========================================

"use strict";


(function(){



const BrowserWebsiteIntelligence = {



    // ======================================
    // WEBSITE DATABASE
    // ======================================


    websites:{


        youtube:{

            category:"video",

            engine:"youtube",

            keywords:[

                "video",
                "song",
                "music",
                "gaming",
                "tutorial",
                "live"

            ]

        },



        google:{

            category:"search",

            engine:"google",

            keywords:[

                "search",
                "find",
                "look"

            ]

        },



        github:{

            category:"code",

            engine:"github",

            keywords:[

                "code",
                "repository",
                "repo",
                "project"

            ]

        },



        amazon:{

            category:"shopping",

            engine:"amazon",

            keywords:[

                "buy",
                "price",
                "product"

            ]

        },



        flipkart:{

            category:"shopping",

            engine:"flipkart",

            keywords:[

                "buy",
                "mobile",
                "laptop"

            ]

        }



    },





    // ======================================
    // DETECT WEBSITE
    // ======================================


    detect(text=""){


        text =
        text.toLowerCase();



        for(
            const site in this.websites
        ){


            let data =
            this.websites[site];



            if(
                text.includes(site)
            ){

                return {

                    website:site,

                    ...data

                };

            }



            for(
                const key of data.keywords
            ){

                if(
                    text.includes(key)
                ){


                    return {

                        website:site,

                        ...data

                    };


                }

            }


        }



        return null;


    },






    // ======================================
    // ROUTE SEARCH
    // ======================================


    route(text=""){


        const result =
        this.detect(text);



        if(result){

            return result;

        }



        return {


            website:"google",

            category:"search",

            engine:"google"


        };


    }



};





window.BrowserWebsiteIntelligence =
BrowserWebsiteIntelligence;



console.log(
"✅ Browser Website Intelligence V10 Part 3 Loaded"
);



})();