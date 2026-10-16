// ==========================================
// JARVIS PRO MAX
// Browser V3
// Dynamic Command Router
// Part 1
// ==========================================

"use strict";

window.BrowserRouter = {

    execute(command) {

        try {

            if (!command)
                return false;

            const intent = command.intent || "";
            const query = command.query || "";

            console.log("🌐 Browser Router:", intent);

            switch (intent) {

                // =====================================
                // GOOGLE SEARCH
                // =====================================

                case "google_search":

                    if (
                        window.BrowserSearch &&
                        typeof BrowserSearch.google === "function"
                    ) {

                        BrowserSearch.google(query);
                        return true;

                    }

                    break;

                // =====================================
                // YOUTUBE SEARCH
                // =====================================

                case "youtube_search":

                    if (
                        window.BrowserSearch &&
                        typeof BrowserSearch.youtube === "function"
                    ) {

                        BrowserSearch.youtube(query);
                        return true;

                    }

                    break;

                // =====================================
                // GITHUB SEARCH
                // =====================================

                case "github_search":

                    if (
                        window.BrowserSearch &&
                        typeof BrowserSearch.github === "function"
                    ) {

                        BrowserSearch.github(query);
                        return true;

                    }

                    break;

                // =====================================
                // REDDIT SEARCH
                // =====================================

                case "reddit_search":

                    if (
                        window.BrowserSearch &&
                        typeof BrowserSearch.reddit === "function"
                    ) {

                        BrowserSearch.reddit(query);
                        return true;

                    }

                    break;

                // =====================================
                // AMAZON SEARCH
                // =====================================

                case "amazon_search":

                    if (
                        window.BrowserSearch &&
                        typeof BrowserSearch.amazon === "function"
                    ) {

                        BrowserSearch.amazon(query);
                        return true;

                    }

                    break;

                // =====================================
                // FLIPKART SEARCH
                // =====================================

                case "flipkart_search":

                    if (
                        window.BrowserSearch &&
                        typeof BrowserSearch.flipkart === "function"
                    ) {

                        BrowserSearch.flipkart(query);
                        return true;

                    }

                    break;

                // =====================================
                // STACKOVERFLOW SEARCH
                // =====================================

                case "stackoverflow_search":

                    if (
                        window.BrowserSearch &&
                        typeof BrowserSearch.stackoverflow === "function"
                    ) {

                        BrowserSearch.stackoverflow(query);
                        return true;

                    }

                    break;

                // =====================================
                // OPEN WEBSITE
                // =====================================

                case "open_site":

                case "voice_open_site":

                    if (
                        window.BrowserActions &&
                        typeof BrowserActions.open === "function"
                    ) {

                        BrowserActions.open(command.site);
                        return true;

                    }

                    break;

                // =====================================
                // NAVIGATION
                // =====================================

                case "browser_back":

                    if (
                        window.BrowserNavigation &&
                        typeof BrowserNavigation.back === "function"
                    ) {

                        BrowserNavigation.back();
                        return true;

                    }

                    break;

                case "browser_forward":

                    if (
                        window.BrowserNavigation &&
                        typeof BrowserNavigation.forward === "function"
                    ) {

                        BrowserNavigation.forward();
                        return true;

                    }

                    break;

                case "browser_refresh":

                    if (
                        window.BrowserNavigation &&
                        typeof BrowserNavigation.refresh === "function"
                    ) {

                        BrowserNavigation.refresh();
                        return true;

                    }

                    break;

                case "browser_new_tab":

                    if (
                        window.BrowserNavigation &&
                        typeof BrowserNavigation.newTab === "function"
                    ) {

                        BrowserNavigation.newTab();
                        return true;

                    }

                    break;

                case "browser_close_tab":

                    if (
                        window.BrowserNavigation &&
                        typeof BrowserNavigation.closeTab === "function"
                    ) {

                        BrowserNavigation.closeTab();
                        return true;

                    }

                    break;
                                        // =====================================
                // LAST SEARCH
                // =====================================

                case "browser_last_search":

                    if (
                        window.BrowserContext &&
                        typeof BrowserContext.get === "function"
                    ) {

                        const data = BrowserContext.get();

                        if (
                            data &&
                            data.currentEngine &&
                            data.currentQuery &&
                            window.BrowserSearch &&
                            typeof BrowserSearch[data.currentEngine] === "function"
                        ) {

                            BrowserSearch[data.currentEngine](
                                data.currentQuery
                            );

                            return true;

                        }

                    }

                    break;



                // =====================================
                // REPEAT SEARCH
                // =====================================

                case "browser_repeat":

                    if (
                        window.BrowserMemory &&
                        typeof BrowserMemory.getLastSearch === "function"
                    ) {

                        const last =
                            BrowserMemory.getLastSearch();

                        if (
                            last &&
                            last.engine &&
                            last.query &&
                            window.BrowserSearch &&
                            typeof BrowserSearch[last.engine] === "function"
                        ) {

                            BrowserSearch[last.engine](
                                last.query
                            );

                            return true;

                        }

                    }

                    break;



                // =====================================
                // MULTI SEARCH
                // =====================================

                case "multi_search":

                    if (
                        window.BrowserMultiSearch &&
                        typeof BrowserMultiSearch.multiSearch === "function"
                    ) {

                        BrowserMultiSearch.multiSearch(

                            command.engines,

                            command.query

                        );

                        return true;

                    }

                    break;



                // =====================================
                // SMART SEARCH
                // =====================================

                case "smart_search":

                    if (
                        window.BrowserSearch &&
                        typeof BrowserSearch.google === "function"
                    ) {

                        BrowserSearch.google(

                            command.query

                        );

                        return true;

                    }

                    break;



                // =====================================
                // RESEARCH MODE
                // =====================================

                case "research_mode":

                    if (
                        window.BrowserResearch &&
                        typeof BrowserResearch.research === "function"
                    ) {

                        BrowserResearch.research(

                            command.query

                        );

                        return true;

                    }

                    break;



                // =====================================
                // PRODUCT RESEARCH
                // =====================================

                case "product_research":

                case "comparison_research":

                case "learning_research":

                    if (
                        window.BrowserAgent &&
                        typeof BrowserAgent.execute === "function"
                    ) {

                        BrowserAgent.execute(command);

                        return true;

                    }

                    break;



                // =====================================
                // BROWSER CONTEXT
                // =====================================

                case "browser_context":

                case "browser_current":

                    if (
                        window.BrowserContext &&
                        typeof BrowserContext.get === "function"
                    ) {

                        console.log(

                            BrowserContext.get()

                        );

                        return true;

                    }

                    break;
                                    // =====================================
                // BROWSER PLANNER
                // =====================================

                case "browser_plan":

                    if (
                        window.BrowserPlanner &&
                        typeof BrowserPlanner.createPlan === "function"
                    ) {

                        const plan =
                            BrowserPlanner.createPlan(command);

                        console.log(
                            "📋 Browser Plan:",
                            plan
                        );

                        return true;

                    }

                    break;



                // =====================================
                // BROWSER EXECUTION
                // =====================================

                case "browser_execute":

                    if (
                        window.BrowserExecution &&
                        typeof BrowserExecution.execute === "function"
                    ) {

                        return BrowserExecution.execute(command);

                    }

                    break;



                // =====================================
                // BROWSER KNOWLEDGE
                // =====================================

                case "browser_knowledge":

                    if (
                        window.BrowserKnowledge &&
                        typeof BrowserKnowledge.learn === "function"
                    ) {

                        BrowserKnowledge.learn(command);

                        return true;

                    }

                    break;



                // =====================================
                // BROWSER MEMORY
                // =====================================

                case "browser_memory":

                    if (
                        window.BrowserMemory &&
                        typeof BrowserMemory.save === "function"
                    ) {

                        BrowserMemory.save(command);

                        return true;

                    }

                    break;



                // =====================================
                // BROWSER FUSION
                // =====================================

                case "browser_fusion":

                    if (
                        window.BrowserFusion &&
                        typeof BrowserFusion.process === "function"
                    ) {

                        return BrowserFusion.process(command);

                    }

                    break;



                // =====================================
                // BROWSER RECOMMENDATION
                // =====================================

                case "browser_recommendation":

                    if (
                        window.BrowserRecommendation &&
                        typeof BrowserRecommendation.recommend === "function"
                    ) {

                        return BrowserRecommendation.recommend(command);

                    }

                    break;



                // =====================================
                // BROWSER SESSION
                // =====================================

                case "browser_session":

                    if (
                        window.BrowserSession &&
                        typeof BrowserSession.get === "function"
                    ) {

                        console.log(
                            BrowserSession.get()
                        );

                        return true;

                    }

                    break;



                // =====================================
                // UNKNOWN COMMAND
                // =====================================

                default:

                    console.warn(
                        "⚠ Unknown Browser Intent:",
                        intent
                    );

                    return false;
            }

            return false;

        }

        catch (error) {

            console.error(
                "Browser Router Error:",
                error
            );

            return false;

        }

    }

};