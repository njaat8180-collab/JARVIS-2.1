// ==========================================
// JARVIS PRO MAX
// Browser Entity Intelligence V10
// Part 2
// Entity Extraction Engine
// ==========================================

"use strict";


(function(){


const BrowserEntityIntelligence = {



    // ======================================
    // TECH ENTITIES
    // ======================================


    techWords:[

        "rtx",
        "gtx",
        "rx",
        "intel",
        "ryzen",
        "core",
        "iphone",
        "samsung",
        "pixel",
        "macbook"

    ],




    // ======================================
    // ENTITY EXTRACTOR
    // ======================================


    extract(text=""){


        let input =
        text.toLowerCase();



        let entities=[];



        // numbers + models

        let models =
        input.match(
            /\b[a-z]+\s?\d{2,5}\b/gi
        );



        if(models){


            entities.push(
                ...models
            );


        }





        // GPU / CPU style


        this.techWords.forEach(word=>{


            if(
                input.includes(word)
            ){


                let parts =
                input.split(" ");



                parts.forEach((p,i)=>{


                    if(
                        p.includes(word)
                    ){

                        entities.push(
                            parts
                            .slice(
                                i,
                                i+2
                            )
                            .join(" ")
                        );

                    }


                });


            }


        });





        return [

            ...new Set(
                entities
            )

        ];



    },





    // ======================================
    // COMPARE ENTITY EXTRACT
    // ======================================


    extractCompare(text=""){


        let words =
        text
        .toLowerCase()
        .split(
            /\s+and\s+|\s+vs\s+|\s+versus\s+/
        );



        if(
            words.length >= 2
        ){

            return {

                first:
                words[0].trim(),


                second:
                words[1].trim()

            };

        }



        return null;


    }



};





window.BrowserEntityIntelligence =
BrowserEntityIntelligence;



console.log(
"✅ Browser Entity Intelligence V10 Part 2 Loaded"
);



})();