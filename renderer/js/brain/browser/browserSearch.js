// ==========================================
// JARVIS PRO MAX
// Browser V3
// Dynamic Search Engine
// ==========================================

"use strict";


window.BrowserSearch = {


    google(query){

        let url =
        "https://www.google.com/search?q="
        +
        encodeURIComponent(query);


        window.open(url);

    },


    youtube(query){

        let url =
        "https://www.youtube.com/results?search_query="
        +
        encodeURIComponent(query);


        window.open(url);

    },


    github(query){

        let url =
        "https://github.com/search?q="
        +
        encodeURIComponent(query);


        window.open(url);

    },


    reddit(query){

        let url =
        "https://www.reddit.com/search/?q="
        +
        encodeURIComponent(query);


        window.open(url);

    },


    wikipedia(query){

        let url =
        "https://en.wikipedia.org/wiki/Special:Search?search="
        +
        encodeURIComponent(query);


        window.open(url);

    },


    amazon(query){

        let url =
        "https://www.amazon.in/s?k="
        +
        encodeURIComponent(query);


        window.open(url);

    },


    flipkart(query){

        let url =
        "https://www.flipkart.com/search?q="
        +
        encodeURIComponent(query);


        window.open(url);

    },
google(query){

    if(BrowserSession)
    {

        BrowserSession.saveSearch(
            "google",
            query
        );

    }


    let url =
    "https://www.google.com/search?q="
    +
    encodeURIComponent(query);


    window.open(url);

},

    stackoverflow(query){

        let url =
        "https://stackoverflow.com/search?q="
        +
        encodeURIComponent(query);


        window.open(url);

    }


};