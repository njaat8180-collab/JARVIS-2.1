// ==========================================
// JARVIS PRO MAX
// Browser Execution Engine V9
// PART 1 / 4
// Core Engine + Router + Navigation
// Production Build
// ==========================================


"use strict";


(function(){



const BrowserExecution = {


    version:"9.0.0",


    running:false,


    currentPlan:null,


    currentStep:0,


    history:[],


    locked:false,





// ==========================================
// START
// ==========================================

start(plan){

    return this.execute(plan);

},




// ==========================================
// EXECUTE
// ==========================================

execute(plan){


    if(!plan){

        console.error(
            "❌ Execution Plan Missing"
        );

        return false;

    }



    if(
        this.running
    ){

        console.warn(
            "⚠ Execution Already Running"
        );

        return false;

    }




    console.log(
        "🚀 BrowserExecution V9 Started",
        plan
    );



    this.running=true;


    this.currentPlan=plan;


    this.currentStep=0;


    this.history=[];



    this.runNext();



    return true;


},





// ==========================================
// RUN NEXT
// ==========================================

runNext(){


    if(
        !this.running
    )
        return;



    if(
        !this.currentPlan ||
        !Array.isArray(
            this.currentPlan.steps
        )
    ){

        return this.finish();

    }




    if(
        this.currentStep >=
        this.currentPlan.steps.length
    ){

        return this.finish();

    }




    const step =
    this.currentPlan.steps[
        this.currentStep
    ];



    console.log(
        "⚙ Executing Step:",
        step
    );



    this.history.push(step);



    try{


        switch(step){



            // ==========================
            // WEBSITE CONTROL
            // ==========================


            case "open_youtube":

                return this.openYoutube();



            case "open_browser":

                return this.openBrowser();



            case "open_chrome":

                return this.openChrome();



            case "control_browser":

                return this.controlBrowser();





            // ==========================
            // SEARCH
            // ==========================


            case "execute_search":

                return this.executeSearch();

case "save_context":

    return this.saveContext();



case "search_products":

    return this.searchProducts();



case "collect_prices":

    return this.collectPrices();



case "find_reviews":

    return this.findReviews();



case "compare_results":

    return this.compareResults();



case "find_specs":

    return this.findSpecs();



case "collect_reviews":

    return this.collectReviews();



case "compare_features":

    return this.compareFeatures();



case "generate_summary":

    return this.generateSummary();

            case "open_search":

                return this.openSearch();





            // ==========================
            // APPS
            // ==========================


            case "open_notepad":

                return this.openNotepad();



            case "open_vscode":

                return this.openVSCode();



            case "open_calculator":

                return this.openCalculator();



            case "open_explorer":

                return this.openExplorer();



            case "lock_pc":

                return this.lockPC();





            default:


                console.warn(
                    "⚠ Unknown Execution Step:",
                    step
                );


                return this.next();



        }



    }
    catch(error){


        console.error(
            "❌ Execution Crash:",
            error
        );


        return this.next();


    }



},







// ==========================================
// NEXT STEP
// ==========================================


next(delay=300){


    this.currentStep++;



    setTimeout(()=>{


        this.runNext();


    },delay);



},







// ==========================================
// GET QUERY SAFE
// ==========================================


getQuery(){


    if(
        !this.currentPlan
    )
        return "";



    return String(
        this.currentPlan.query ||
        ""
    )
    .trim();



},







// ==========================================
// OPEN YOUTUBE SMART
// ==========================================


openYoutube(){


    const query =
    this.getQuery();



    console.log(
        "▶ YouTube Search:",
        query
    );



    let cleanQuery =
    query
    .replace(
        /youtube|video|dhoondo|search|find/gi,
        ""
    )
    .trim();




    const url =

    cleanQuery

    ?

    "https://www.youtube.com/results?search_query="
    +
    encodeURIComponent(
        cleanQuery
    )

    :

    "https://www.youtube.com";





    this.openURL(url);



    return this.next();


},







// ==========================================
// OPEN URL SAFE
// ==========================================


async openURL(url){


    try{

        // Prefer the in-app embedded Browser panel (dashboard section)
        // over the OS-level external browser. Falls back only if the
        // panel isn't available for some reason.
        if(
            typeof window !== "undefined" &&
            window.BrowserUI &&
            typeof window.BrowserUI.showPanel === "function" &&
            typeof window.BrowserUI.navigate === "function"
        ){

            // BUG FIX (JARVIS search karta hai par browser screen load
            // nahi hoti): showPanel() is async — internally it may still
            // be creating the very first tab (await createNewTab()) when
            // this returns if not awaited. Calling navigate(url) right
            // after, without waiting, raced against that: navigate() saw
            // no active tab yet and created a SECOND tab of its own with
            // the search URL, while the panel kept the original blank tab
            // attached/visible. Net effect: JARVIS reported "searching",
            // a tab really was created in the background, but the
            // on-screen browser view stayed blank. Awaiting showPanel()
            // first guarantees a tab already exists before navigate(url)
            // runs, so navigate() reuses it instead of racing to make a
            // second one.
            await window.BrowserUI.showPanel();
            await window.BrowserUI.navigate(url);
            return;

        }

        if(
            window.jarvis &&
            typeof window.jarvis.openURL==="function"
        ){


            window.jarvis.openURL(
                url
            );


        }
        else{


            window.open(
                url,
                "_blank"
            );


        }



    }
    catch(error){


        console.error(
            "❌ URL Open Error:",
            error
        );


    }


},







// ==========================================
// CONTROL BROWSER
// ==========================================


controlBrowser(){


    const query =
    this.getQuery()
    .toLowerCase();



    if(
        query.includes(
            "youtube"
        )
    ){

        return this.openYoutube();

    }



    if(
        query.includes(
            "chrome"
        )
    ){

        return this.openChrome();

    }



    return this.next();


},







// ==========================================
// OPEN BROWSER
// ==========================================


openBrowser(){


    console.log(
        "🌐 Browser Ready"
    );


    return this.next();


},







// ==========================================
// OPEN SEARCH
// ==========================================


openSearch(){


    const query =
    this.getQuery();



    const url =

    "https://www.google.com/search?q="
    +
    encodeURIComponent(
        query
    );



    this.openURL(url);



    return this.next();


},







// ==========================================
// EXECUTE SEARCH
// ==========================================


executeSearch(){


    return this.openSearch();


}






};





window.BrowserExecution =
BrowserExecution;



console.log(
"✅ BrowserExecution V9 PART 1 Loaded"
);



})();
// ==========================================
// JARVIS PRO MAX
// Browser Execution Engine V9
// PART 2 / 4
// Product + Search + Memory System
// ==========================================




// ==========================================
// SAFE SEARCH ENGINE
// ==========================================


BrowserExecution.safeSearch = function(
    engine,
    query
){


    if(
        !engine ||
        !query
    ){

        console.warn(
            "⚠ Search Data Missing"
        );

        return false;

    }



    try{


        console.log(
            "🔎 Search:",
            engine,
            query
        );



        if(
            window.BrowserMultiSearch &&
            typeof BrowserMultiSearch.search==="function"
        ){


            return BrowserMultiSearch.search(
                engine,
                query
            );


        }




        if(
            window.BrowserSession &&
            typeof BrowserSession.search==="function"
        ){


            return BrowserSession.search(
                engine,
                query
            );


        }




        // fallback


        let url="";



        switch(engine){


            case "youtube":

                url =
                "https://youtube.com/results?search_query="
                +
                encodeURIComponent(query);

            break;



            case "amazon":

                url =
                "https://www.amazon.in/s?k="
                +
                encodeURIComponent(query);

            break;



            case "flipkart":

                url =
                "https://www.flipkart.com/search?q="
                +
                encodeURIComponent(query);

            break;



            default:

                url =
                "https://www.google.com/search?q="
                +
                encodeURIComponent(query);


        }




        this.openURL(url);



        return true;



    }
    catch(error){


        console.error(
            "❌ Safe Search Error",
            error
        );


        return false;


    }


};









// ==========================================
// PRODUCT SEARCH
// ==========================================


BrowserExecution.searchProducts = function(){


    const query =
    this.getQuery();



    console.log(
        "🛒 Product Search:",
        query
    );



    this.safeSearch(
        "google",
        query
    );



    return this.next();


};









// ==========================================
// COLLECT PRICES
// ==========================================


BrowserExecution.collectPrices = function(){


    const query =
    this.getQuery();



    console.log(
        "💰 Price Search:",
        query
    );



    this.safeSearch(
        "amazon",
        query
    );



    setTimeout(()=>{


        this.safeSearch(
            "flipkart",
            query
        );


    },500);



    return this.next();


};









// ==========================================
// FIND REVIEWS
// ==========================================


BrowserExecution.findReviews = function(){


    const query =
    this.getQuery();



    console.log(
        "⭐ Review Search:",
        query
    );



    this.safeSearch(
        "youtube",
        query + " review"
    );



    return this.next();


};









// ==========================================
// COMPARE RESULTS
// ==========================================


BrowserExecution.compareResults = function(){


    const query =
    this.getQuery();



    console.log(
        "⚖ Compare:",
        query
    );



    this.safeSearch(
        "google",
        query + " comparison"
    );



    return this.next();


};









// ==========================================
// SMART SPEC SEARCH
// ==========================================


BrowserExecution.findSpecs = function(){


    const query =
    this.getQuery();



    console.log(
        "📊 Specs:",
        query
    );



    this.safeSearch(
        "google",
        query + " specifications"
    );



    return this.next();


};









// ==========================================
// COLLECT REVIEWS
// ==========================================


BrowserExecution.collectReviews = function(){


    const query =
    this.getQuery();



    this.safeSearch(
        "youtube",
        query + " review"
    );



    this.safeSearch(
        "google",
        query + " user experience"
    );



    return this.next();


};









// ==========================================
// COMPARE FEATURES
// ==========================================


BrowserExecution.compareFeatures = function(){


    const query =
    this.getQuery();



    this.safeSearch(
        "google",
        query + " features comparison"
    );



    return this.next();


};









// ==========================================
// SUMMARY MEMORY
// ==========================================


BrowserExecution.generateSummary = function(){


    console.log(
        "📝 Saving Summary"
    );



    this.saveMemory({

        type:
        "browser_summary",


        query:
        this.getQuery(),


        steps:
        [
            ...this.history
        ],


        time:
        Date.now()


    });



    return this.next();


};









// ==========================================
// SAVE MEMORY
// ==========================================


BrowserExecution.saveMemory = function(
    data
){


    try{


        if(
            window.BrowserSearchMemory &&
            typeof BrowserSearchMemory.remember==="function"
        ){


            BrowserSearchMemory.remember(
                data
            );


            console.log(
                "💾 Search Memory Saved"
            );


            return;


        }




        if(
            window.BrowserMemory &&
            typeof BrowserMemory.save==="function"
        ){


            BrowserMemory.save(
                data
            );


            console.log(
                "💾 Browser Memory Saved"
            );


        }



    }
    catch(error){


        console.warn(
            "⚠ Memory Save Failed",
            error
        );


    }


};








// ==========================================
// OPEN GOOGLE DIRECT
// ==========================================


BrowserExecution.openGoogle = function(){


    this.openURL(
        "https://google.com"
    );


    return this.next();


};





console.log(
"✅ BrowserExecution V9 PART 2 Loaded"
);
// ==========================================
// JARVIS PRO MAX
// Browser Execution Engine V9
// PART 3 / 4
// Research + Apps + System Control
// ==========================================







// ==========================================
// RESEARCH ENGINE
// ==========================================


BrowserExecution.collectInformation = function(){


    const query =
    this.getQuery();



    console.log(
        "📚 Collecting Information:",
        query
    );



    this.safeSearch(
        "google",
        query
    );



    return this.next();


};









// ==========================================
// FIND SOURCES
// ==========================================


BrowserExecution.findSources = function(){


    const query =
    this.getQuery();



    console.log(
        "🌐 Finding Sources:",
        query
    );



    this.safeSearch(
        "google",
        query + " sources"
    );



    this.safeSearch(
        "wikipedia",
        query
    );



    return this.next();


};









// ==========================================
// ANALYZE RESULTS
// ==========================================


BrowserExecution.analyzeResults = function(){


    console.log(
        "🧠 Analyzing Browser Results"
    );



    this.saveMemory({

        type:
        "analysis",


        query:
        this.getQuery(),


        steps:
        [
            ...this.history
        ],


        time:
        Date.now()


    });



    return this.next();


};









// ==========================================
// SUMMARIZE RESULTS
// ==========================================


BrowserExecution.summarizeResults = function(){


    console.log(
        "📝 Creating Research Summary"
    );



    this.saveMemory({

        type:
        "research_summary",


        query:
        this.getQuery(),


        history:
        [
            ...this.history
        ],


        time:
        Date.now()


    });



    return this.next();


};









// ==========================================
// LEARNING ENGINE
// ==========================================


BrowserExecution.findLearningSources = function(){


    const query =
    this.getQuery();



    console.log(
        "📖 Learning Sources:",
        query
    );



    this.safeSearch(
        "google",
        query + " tutorial"
    );



    this.safeSearch(
        "youtube",
        query + " explained"
    );



    return this.next();


};









// ==========================================
// EXAMPLES FINDER
// ==========================================


BrowserExecution.collectExamples = function(){


    const query =
    this.getQuery();



    this.safeSearch(
        "google",
        query + " examples"
    );



    return this.next();


};









// ==========================================
// CREATE EXPLANATION
// ==========================================


BrowserExecution.createExplanation = function(){


    console.log(
        "📘 Explanation Created"
    );



    this.saveMemory({

        type:
        "learning",


        query:
        this.getQuery(),


        time:
        Date.now()


    });



    return this.next();


};









// ==========================================
// OPEN NOTEPAD
// ==========================================


BrowserExecution.openNotepad = function(){


    console.log(
        "📝 Opening Notepad"
    );



    try{


        if(
            window.jarvis &&
            typeof window.jarvis.openApp==="function"
        ){


            window.jarvis.openApp(
                "notepad"
            );


        }



    }
    catch(error){


        console.error(
            "❌ Notepad Error",
            error
        );


    }



    return this.next();


};









// ==========================================
// OPEN CHROME
// ==========================================


BrowserExecution.openChrome = function(){


    console.log(
        "🌐 Opening Chrome"
    );



    try{


        if(
            window.jarvis &&
            typeof window.jarvis.openApp==="function"
        ){


            window.jarvis.openApp(
                "chrome"
            );


        }



    }
    catch(error){


        console.error(
            "❌ Chrome Error",
            error
        );


    }



    return this.next();


};









// ==========================================
// OPEN VS CODE
// ==========================================


BrowserExecution.openVSCode = function(){


    console.log(
        "💻 Opening VS Code"
    );



    try{


        if(
            window.jarvis &&
            typeof window.jarvis.openVSCode==="function"
        ){


            window.jarvis.openVSCode();


        }
        else if(
            window.jarvis &&
            typeof window.jarvis.openApp==="function"
        ){


            window.jarvis.openApp(
                "vscode"
            );


        }



    }
    catch(error){


        console.error(
            "❌ VS Code Error",
            error
        );


    }



    return this.next();


};









// ==========================================
// OPEN CALCULATOR
// ==========================================


BrowserExecution.openCalculator = function(){


    console.log(
        "🧮 Opening Calculator"
    );



    try{


        if(
            window.jarvis &&
            typeof window.jarvis.openCalculator==="function"
        ){


            window.jarvis.openCalculator();


        }



    }
    catch(error){


        console.error(
            "❌ Calculator Error",
            error
        );


    }



    return this.next();


};









// ==========================================
// OPEN FILE EXPLORER
// ==========================================


BrowserExecution.openExplorer = function(){


    console.log(
        "📂 Opening Explorer"
    );



    try{


        if(
            window.jarvis &&
            typeof window.jarvis.openExplorer==="function"
        ){


            window.jarvis.openExplorer();


        }



    }
    catch(error){


        console.error(
            "❌ Explorer Error",
            error
        );


    }



    return this.next();


};









// ==========================================
// LOCK PC
// ==========================================


BrowserExecution.lockPC = function(){


    console.log(
        "🔒 Locking PC"
    );



    try{


        if(
            window.jarvis &&
            typeof window.jarvis.lockPC==="function"
        ){


            window.jarvis.lockPC();


        }



    }
    catch(error){


        console.error(
            "❌ Lock Error",
            error
        );


    }



    return this.next();


};









console.log(
"✅ BrowserExecution V9 PART 3 Loaded"
);
// ==========================================
// JARVIS PRO MAX
// Browser Execution Engine V9
// PART 4 / 4
// Finish + Status + Recovery + Export
// ==========================================







// ==========================================
// FINISH EXECUTION
// ==========================================


BrowserExecution.finish = function(){


    console.log(
        "✅ Browser Task Completed"
    );



    this.running=false;



    this.saveMemory({

        type:
        "execution_complete",


        query:
        this.getQuery(),


        history:
        [
            ...this.history
        ],


        time:
        Date.now()


    });



    this.reset();



    return true;


};









// ==========================================
// STOP EXECUTION
// ==========================================


BrowserExecution.stop = function(){


    console.log(
        "🛑 Browser Execution Stopped"
    );



    this.running=false;



    this.reset();



    return true;


};









// ==========================================
// RESET ENGINE
// ==========================================


BrowserExecution.reset = function(){


    this.currentPlan=null;


    this.currentStep=0;


    this.history=[];


    this.locked=false;


};









// ==========================================
// RUNNING CHECK
// ==========================================


BrowserExecution.isRunning = function(){


    return (
        this.running === true
    );


};









// ==========================================
// STATUS API
// ==========================================


BrowserExecution.status = function(){



    return {


        version:
        this.version,



        running:
        this.running,



        locked:
        this.locked,



        step:
        this.currentStep,



        totalSteps:

        this.currentPlan

        ?

        this.currentPlan.steps.length

        :

        0,



        history:
        [
            ...this.history
        ]

    };


};









// ==========================================
// EXPORT RESULT
// ==========================================


BrowserExecution.export = function(){



    return {


        version:
        this.version,



        plan:
        this.currentPlan,



        history:
        [
            ...this.history
        ],



        timestamp:
        Date.now()


    };


};









// ==========================================
// ERROR RECOVERY
// ==========================================


BrowserExecution.recover = function(error){


    console.error(
        "♻ Browser Recovery:",
        error
    );



    this.running=false;



    this.reset();



    return false;


};









// ==========================================
// HEALTH CHECK
// ==========================================


BrowserExecution.health = function(){



    return {


        engine:
        "BrowserExecution",



        version:
        this.version,



        status:
        "online",



        memory:

        !!window.BrowserMemory,



        search:

        !!window.BrowserMultiSearch,



        planner:

        !!window.BrowserPlanner



    };


};









// ==========================================
// FINAL GLOBAL EXPORT
// ==========================================


window.BrowserExecution =
BrowserExecution;



console.log(
"🚀 BrowserExecution V9 PRODUCTION FINAL Loaded"
);



