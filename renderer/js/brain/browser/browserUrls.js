// ==========================================
// JARVIS PRO MAX
// Browser V3
// URL Database
// ==========================================

"use strict";


window.BrowserUrls = {


    sites: {


        google:
            "https://www.google.com",


        youtube:
            "https://www.youtube.com",


        github:
            "https://github.com",


        reddit:
            "https://www.reddit.com",


        wikipedia:
            "https://www.wikipedia.org",


        amazon:
            "https://www.amazon.in",


        flipkart:
            "https://www.flipkart.com",


        stackoverflow:
            "https://stackoverflow.com",


        mdn:
            "https://developer.mozilla.org",


        npm:
            "https://www.npmjs.com",


        chatgpt:
            "https://chat.openai.com",


        gemini:
            "https://gemini.google.com",


        discord:
            "https://discord.com",


        instagram:
            "https://www.instagram.com",


        facebook:
            "https://www.facebook.com",


        twitter:
            "https://x.com",


        linkedin:
            "https://www.linkedin.com",


        netflix:
            "https://www.netflix.com",


        spotify:
            "https://open.spotify.com",


        gmail:
            "https://mail.google.com",


        whatsapp:
            "https://web.whatsapp.com",


        maps:
            "https://maps.google.com",


        telegram:
            "https://web.telegram.org",


        quora:
            "https://www.quora.com",


        pinterest:
            "https://www.pinterest.com",


        paytm:
            "https://paytm.com",


        zomato:
            "https://www.zomato.com",


        swiggy:
            "https://www.swiggy.com",


        hotstar:
            "https://www.hotstar.com",


        bing:
            "https://www.bing.com",


        duckduckgo:
            "https://duckduckgo.com"


    }

};
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


    stackoverflow(query){

        let url =
        "https://stackoverflow.com/search?q="
        +
        encodeURIComponent(query);


        window.open(url);

    }


};
