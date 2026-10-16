// ==========================================
// JARVIS PRO MAX
// Browser V3
// Smart Recommendation Engine
// browserRecommendation.js
// ==========================================

"use strict";


window.BrowserRecommendation = {



    // ==================================
    // ANALYZE RESULTS
    // ==================================

    recommend(results, query){


        if(
            !results ||
            results.length === 0
        )
        {

            return [];

        }



        let ranked =
        results.map(item=>{


            return {


                ...item,


                score:
                this.calculateScore(
                    item,
                    query
                )


            };


        });





        ranked.sort(
            (a,b)=>
            b.score-a.score
        );



        console.log(
            "Recommended Results:",
            ranked
        );



        return ranked;


    },






    // ==================================
    // SCORE CALCULATION
    // ==================================

    calculateScore(item,query){


        let score = 0;



        let text =
        JSON.stringify(item)
        .toLowerCase();



        let search =
        query.toLowerCase();




        // Query Match

        if(
            text.includes(search)
        )
        {

            score += 30;

        }





        // Category Match

        if(
            window.BrowserKnowledge
        )
        {


            let profile =
            BrowserKnowledge.getProfile();



            Object.keys(
                profile.categories
            )
            .forEach(category=>{


                if(
                    text.includes(category)
                )
                {

                    score += 20;

                }


            });


        }





        // Trusted Sources

        if(
            window.BrowserKnowledge
        )
        {


            let sources =
            BrowserKnowledge
            .getProfile()
            .sources;



            Object.keys(
                sources
            )
            .forEach(source=>{


                if(
                    text.includes(
                        source
                    )
                )
                {

                    score +=
                    sources[source];

                }


            });


        }



        return score;


    },







    // ==================================
    // PICK BEST
    // ==================================

    best(results,query){


        let ranked =
        this.recommend(
            results,
            query
        );



        return ranked[0] || null;


    },








    // ==================================
    // GENERATE RESPONSE DATA
    // ==================================

    summary(results){


        return {


            total:
            results.length,


            top:
            results.slice(
                0,
                5
            )


        };


    }





};