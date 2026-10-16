// ==========================================
// JARVIS PRO MAX
// Browser Context Engine V10
// PART 11
// Conversation Context Understanding
// ==========================================


"use strict";


(function(){



const BrowserContextEngine = {



    key:
    "JARVIS_BROWSER_CONTEXT",





    current:null,





    // ======================================
    // SAVE CONTEXT
    // ======================================


    save(command){


        if(!command)
            return;



        this.current = {


            query:
            command.query || "",


            intent:
            command.intent || "search",


            engine:
            command.engine || null,


            time:
            Date.now()



        };



        localStorage.setItem(

            this.key,

            JSON.stringify(
                this.current
            )

        );



        console.log(
            "🧠 Context Updated:",
            this.current
        );


    },







    // ======================================
    // LOAD CONTEXT
    // ======================================


    load(){


        try{


            let data =
            localStorage.getItem(
                this.key
            );


            if(data){

                this.current =
                JSON.parse(data);

            }



        }

        catch(error){


            this.current=null;


        }



        return this.current;


    },







    // ======================================
    // CHECK FOLLOW UP
    // ======================================


    isFollowUp(text=""){



        let words=[


            "isko",
            "isko open karo",
            "iska",
            "uska",
            "same",
            "again",
            "dobara",
            "review",
            "price",
            "open karo"


        ];



        text =
        text.toLowerCase();



        return words.some(

            word =>
            text.includes(word)

        );


    },







    // ======================================
    // RESOLVE CONTEXT
    // ======================================


    resolve(text=""){



        if(
            !this.isFollowUp(text)
        ){

            return null;

        }




        let old =
        this.load();



        if(!old)
            return null;





        return {


            original:text,


            context:old,


            mergedQuery:


            old.query +
            " " +
            text



        };


    },







    clear(){


        localStorage.removeItem(
            this.key
        );


        this.current=null;


    }



};





window.BrowserContextEngine =
BrowserContextEngine;



console.log(
"✅ Browser Context Engine V10 Part 11 Loaded"
);



})();