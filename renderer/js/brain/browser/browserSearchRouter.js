// ==========================================
// JARVIS PRO MAX
// Browser Search Router V10
// PART 9
// Advanced Search Engine Selection
// ==========================================


"use strict";


(function(){



const BrowserSearchRouter = {



    engines:{


        youtube:{

            keywords:[

                "video",
                "youtube",
                "watch",
                "tutorial",
                "gameplay"

            ]

        },



        github:{

            keywords:[

                "code",
                "github",
                "repository",
                "project",
                "source"

            ]

        },



        stackoverflow:{

            keywords:[

                "error",
                "bug",
                "javascript",
                "python",
                "fix"

            ]

        },



        amazon:{

            keywords:[

                "buy",
                "purchase",
                "product",
                "order"

            ]

        },



        flipkart:{

            keywords:[

                "mobile",
                "laptop",
                "price",
                "deal"

            ]

        },



        wikipedia:{

            keywords:[

                "who",
                "history",
                "meaning",
                "definition"

            ]

        },



        google:{

            keywords:[]

        }


    },







    // ======================================
    // DETECT ENGINE
    // ======================================


    detect(query=""){


        query =
        query.toLowerCase();



        let best =
        "google";


        let score = 0;



        for(
            let engine in this.engines
        ){


            let current =
            this.engines[engine];



            let count = 0;



            current.keywords.forEach(
                word=>{


                    if(
                        query.includes(word)
                    ){

                        count++;

                    }


                }
            );



            if(
                count > score
            ){

                score=count;

                best=engine;

            }



        }




        return {


            engine:best,


            score,


            query



        };


    }





};






window.BrowserSearchRouter =
BrowserSearchRouter;



console.log(
"✅ Browser Search Router V10 Part 9 Loaded"
);



})();