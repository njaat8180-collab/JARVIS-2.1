// ==========================================
// JARVIS PRO MAX
// Browser V3
// Smart Query Understanding Engine
// browserQueryEngine.js
// ==========================================

"use strict";


window.BrowserQueryEngine = {



    analyze(text){


        if(!text)
            return null;



        let query =
        text
        .toLowerCase()
        .trim();



        // Remove Jarvis word

        query =
        query.replace(
            "jarvis",
            ""
        ).trim();



        /*
        ==================================
        SEARCH INTENT
        ==================================
        */


        let searchWords = [

            "search",
            "find",
            "show",
            "look for",
            "dikhao",
            "dhoondo",
            "batao",
            "chahiye"

        ];



        let isSearch =
        searchWords.some(
            word =>
            query.includes(word)
        );





        /*
        ==================================
        PRODUCT INTENT
        ==================================
        */


        if(

            query.includes("chahiye")
            ||
            query.includes("buy")
            ||
            query.includes("price")
            ||
            query.includes("under")
            ||
            query.includes("best")

        )
        {


            return {


                intent:
                "product_research",


                query:
                this.cleanQuery(query)


            };


        }





        /*
        ==================================
        COMPARISON INTENT
        ==================================
        */


        if(

            query.includes("vs")
            ||
            query.includes("versus")
            ||
            query.includes("compare")
            ||
            query.includes("difference")
            ||
            query.includes("kaun best")

        )
        {


            return {


                intent:
                "comparison_research",


                query:
                this.cleanQuery(query)


            };


        }





        /*
        ==================================
        NORMAL SEARCH
        ==================================
        */


        if(isSearch)
        {


            return {


                intent:
                "smart_search",


                query:
                this.cleanQuery(query)


            };


        }





        return null;


    },





    cleanQuery(text){


        let remove = [

            "mujhe",
            "please",
            "jarvis",
            "dikhao",
            "dhoondo",
            "show me",
            "find",
            "search",
            "batao",
            "chahiye"

        ];



        remove.forEach(
            word=>{


                text =
                text.replace(
                    word,
                    ""
                );


            }
        );



        return text.trim();


    }




};