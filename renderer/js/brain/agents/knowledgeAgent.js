// ==========================================
// JARVIS V10
// Autonomous Agent Core
// KnowledgeAgent V1 PRO
// renderer/js/brain/agents/knowledgeAgent.js
// ==========================================

"use strict";

(function(){

const KnowledgeAgent = {

    version:"1.0.0 PRO",

    name:"KnowledgeAgent",

    status:"idle",

    storageKey:"jarvis_knowledge_v1",

    knowledge:new Map(),

    history:[],

    maxHistory:1000,



// ==========================================
// INIT
// ==========================================

init(){

    this.load();

    console.log(
        "📚 KnowledgeAgent Initialized"
    );

    return true;

},



// ==========================================
// RUN
// ==========================================

run(task={}){

    this.status="working";

    let result;

    switch(task.action){

        case "add":

            result =
            this.addKnowledge(
                task.data
            );

        break;


        case "search":

            result =
            this.searchKnowledge(
                task.query
            );

        break;


        case "get":

            result =
            this.getKnowledge(
                task.id
            );

        break;


        case "status":

            result =
            this.getStatus();

        break;


        case "save":

            result =
            this.save();

        break;


        case "load":

            result =
            this.load();

        break;


        default:

            result={

                success:false,

                error:
                "Unknown Knowledge Action"

            };

    }

    this.status="idle";

    return result;

},



// ==========================================
// RECEIVE
// ==========================================

receive(message={}){

    return this.run(
        message
    );

},



// ==========================================
// ADD KNOWLEDGE
// ==========================================

addKnowledge(data={}){

    if(

        !data.title ||

        !data.content

    ){

        return{

            success:false,

            error:
            "Knowledge data missing"

        };

    }

    const item={

        id:
        this.generateID(),

        title:
        data.title,

        content:
        data.content,

        category:
        data.category || "general",

        tags:
        data.tags || [],

        source:
        data.source || "manual",

        confidence:
        data.confidence || 100,

        created:
        Date.now(),

        updated:
        Date.now(),

        accessed:0

    };

    this.knowledge.set(

        item.id,

        item

    );

    this.log(

        "add",

        item

    );

    this.save();

    return{

        success:true,

        knowledge:item

    };

},



// ==========================================
// SEARCH KNOWLEDGE
// ==========================================

searchKnowledge(query){

    if(!query)

        return [];

    const text =
    query.toLowerCase();

    const results=[];

    this.knowledge.forEach(item=>{

        const target=(

            item.title +

            " " +

            item.content +

            " " +

            item.tags.join(" ")

        )

        .toLowerCase();

        if(

            target.includes(text)

        ){

            item.accessed++;

            results.push(item);

        }

    });

    return results;

},



// ==========================================
// GET KNOWLEDGE
// ==========================================

getKnowledge(id){

    if(

        !this.knowledge.has(id)

    )

    return null;

    const item=

    this.knowledge.get(id);

    item.accessed++;

    return item;

},



// ==========================================
// GENERATE ID
// ==========================================

generateID(){

    return(

        "KNOW_"

        +

        Date.now()

        +

        "_"

        +

        Math.floor(

            Math.random()*9999

        )

    );

},



// ==========================================
// LOG
// ==========================================

log(action,data){

    this.history.push({

        action,

        data,

        time:

        Date.now()

    });

    if(

        this.history.length >

        this.maxHistory

    ){

        this.history.shift();

    }

},
// ==========================================
// GET BY CATEGORY
// ==========================================

getCategory(category){


    return [

        ...this.knowledge.values()

    ]

    .filter(

        item =>

        item.category === category

    );


},





// ==========================================
// UPDATE KNOWLEDGE
// ==========================================

updateKnowledge(id,data={}){


    if(

        !this.knowledge.has(id)

    ){

        return {

            success:false,

            error:

            "Knowledge not found"

        };

    }





    const item =

    this.knowledge.get(id);





    if(data.title)

        item.title =

        data.title;





    if(data.content)

        item.content =

        data.content;





    if(data.category)

        item.category =

        data.category;





    if(data.tags)

        item.tags =

        data.tags;





    if(data.confidence !== undefined)

        item.confidence =

        data.confidence;





    item.updated =

    Date.now();





    this.knowledge.set(

        id,

        item

    );





    this.log(

        "update",

        item

    );





    this.save();





    return {

        success:true,

        knowledge:item

    };


},





// ==========================================
// DELETE KNOWLEDGE
// ==========================================

deleteKnowledge(id){


    if(

        !this.knowledge.has(id)

    )

    return false;





    const item =

    this.knowledge.get(id);





    this.knowledge.delete(

        id

    );





    this.log(

        "delete",

        item

    );





    this.save();





    return true;


},





// ==========================================
// ENTITY GRAPH
// ==========================================

buildEntityGraph(){


    const graph={};





    this.knowledge.forEach(item=>{



        item.tags.forEach(tag=>{



            if(

                !graph[tag]

            ){

                graph[tag]=[];

            }





            graph[tag].push(

                item.id

            );



        });



    });





    return graph;


},





// ==========================================
// SIMILAR SEARCH
// ==========================================

findSimilar(query){


    if(!query)

        return [];





    const words =

    query

    .toLowerCase()

    .split(/\s+/);





    const results=[];





    this.knowledge.forEach(item=>{



        let score=0;





        const target=(



            item.title +

            " " +

            item.content +

            " " +

            item.tags.join(" ")



        )

        .toLowerCase();





        words.forEach(word=>{



            if(

                target.includes(word)

            ){

                score++;

            }



        });





        if(score>0){



            results.push({



                score,



                knowledge:item



            });



        }



    });





    results.sort(

        (a,b)=>

        b.score-a.score

    );





    return results;


},





// ==========================================
// KNOWLEDGE INDEX
// ==========================================

buildIndex(){


    const index={};





    this.knowledge.forEach(item=>{



        const words=(



            item.title +

            " " +

            item.content



        )

        .toLowerCase()

        .split(/\W+/);





        words.forEach(word=>{



            if(

                !word

            )

            return;





            if(

                !index[word]

            ){

                index[word]=[];

            }





            if(

                !index[word].includes(item.id)

            ){

                index[word].push(

                    item.id

                );

            }



        });



    });





    return index;


},
// ==========================================
// LEARNING INTEGRATION
// ==========================================

learn(data={}){


    if(

        !window.LearningAgent ||

        !data.title

    )

    return false;





    LearningAgent.run({


        action:

        "learn",



        data



    });





    return true;


},





// ==========================================
// MEMORY INTEGRATION
// ==========================================

remember(item){



    if(

        !window.MemoryAgent ||

        !item

    )

    return false;





    MemoryAgent.run({



        action:

        "remember",



        data:{



            type:

            "knowledge",



            content:

            item.title,



            importance:

            "normal",



            tags:

            item.tags || []



        }



    });





    return true;



},





// ==========================================
// KNOWLEDGE ANALYTICS
// ==========================================

getAnalytics(){



    const analytics={



        total:

        this.knowledge.size,



        categories:{},



        sources:{},



        averageConfidence:0



    };





    let confidence=0;





    this.knowledge.forEach(item=>{



        confidence +=

        item.confidence;





        analytics.categories[

            item.category

        ] =

        (

            analytics.categories[

                item.category

            ] || 0

        ) + 1;





        analytics.sources[

            item.source

        ] =

        (

            analytics.sources[

                item.source

            ] || 0

        ) + 1;



    });





    if(

        analytics.total

    ){

        analytics.averageConfidence =

        Math.round(

            confidence /

            analytics.total

        );

    }





    return analytics;



},





// ==========================================
// SMART RANKING
// ==========================================

rankResults(results=[]){



    return results

    .sort((a,b)=>{



        const scoreA =

        (

            (a.knowledge.confidence || 0)

            +

            (a.score * 10)

            +

            (a.knowledge.accessed || 0)

        );





        const scoreB =

        (

            (b.knowledge.confidence || 0)

            +

            (b.score * 10)

            +

            (b.knowledge.accessed || 0)

        );





        return scoreB-scoreA;



    });



},





// ==========================================
// KNOWLEDGE SUGGESTIONS
// ==========================================

suggest(query){



    const results =

    this.findSimilar(

        query

    );





    return this.rankResults(

        results

    )

    .slice(0,5);



},





// ==========================================
// AUTO LEARNING
// ==========================================

autoLearn(data={}){



    const result =

    this.addKnowledge(

        data

    );





    if(

        result.success

    ){



        this.learn(

            data

        );





        this.remember(

            result.knowledge

        );



    }





    return result;



},





// ==========================================
// TOP KNOWLEDGE
// ==========================================

getTopKnowledge(limit=10){



    return [



        ...this.knowledge.values()



    ]

    .sort((a,b)=>{



        return (

            b.accessed -

            a.accessed

        );



    })

    .slice(

        0,

        limit

    );





},





// ==========================================
// KNOWLEDGE SUMMARY
// ==========================================

getSummary(){



    return {



        analytics:

        this.getAnalytics(),



        topKnowledge:

        this.getTopKnowledge(5),



        entityGraph:

        Object.keys(

            this.buildEntityGraph()

        ).length



    };



},// ==========================================
// SAVE KNOWLEDGE
// ==========================================

save(){

    try{

        if(

            typeof localStorage==="undefined"

        )

        return false;

        const data={

            knowledge:[

                ...this.knowledge.values()

            ],

            history:this.history

        };

        localStorage.setItem(

            this.storageKey,

            JSON.stringify(data)

        );

        return true;

    }

    catch(error){

        console.error(

            "Knowledge Save Error",

            error

        );

        return false;

    }

},




// ==========================================
// LOAD KNOWLEDGE
// ==========================================

load(){

    try{

        if(

            typeof localStorage==="undefined"

        )

        return false;

        const data=

        localStorage.getItem(

            this.storageKey

        );

        if(!data)

        return false;

        const parsed=

        JSON.parse(data);

        if(parsed.knowledge){

            parsed.knowledge.forEach(item=>{

                this.knowledge.set(

                    item.id,

                    item

                );

            });

        }

        if(parsed.history){

            this.history=

            parsed.history;

        }

        return true;

    }

    catch(error){

        console.error(

            "Knowledge Load Error",

            error

        );

        return false;

    }

},




// ==========================================
// STATUS
// ==========================================

getStatus(){

    return{

        version:

        this.version,

        status:

        this.status,

        knowledge:

        this.knowledge.size,

        history:

        this.history.length,

        analytics:

        this.getAnalytics()

    };

},




// ==========================================
// RESET
// ==========================================

reset(){

    this.knowledge.clear();

    this.history=[];

    this.save();

    return true;

},




// ==========================================
// AGENT REGISTRY
// ==========================================

register(){

    if(

        !window.AgentRegistry

    )

    return false;

    AgentRegistry.register(

        "KnowledgeAgent",

        this,

        {

            type:"core",

            group:"knowledge",

            priority:12,

            tags:[

                "knowledge",

                "facts",

                "graph",

                "learning"

            ]

        }

    );

    return true;

},




// ==========================================
// CONNECT BUS
// ==========================================

connectBus(){

    if(

        !window.AgentBus

    )

    return false;

    AgentBus.subscribe(

        "KnowledgeAgent",

        (message)=>{

            this.onBusMessage(

                message

            );

        }

    );

    return true;

},




// ==========================================
// BUS HANDLER
// ==========================================

onBusMessage(message){

    if(

        !message

    )

    return false;

    switch(message.type){

        case "knowledge_add":

            this.addKnowledge(

                message.data

            );

        break;


        case "knowledge_search":

            this.searchKnowledge(

                message.data.query

            );

        break;


        case "knowledge_update":

            this.updateKnowledge(

                message.data.id,

                message.data

            );

        break;


        case "knowledge_delete":

            this.deleteKnowledge(

                message.data.id

            );

        break;

    }

    return true;

},




// ==========================================
// BOOT
// ==========================================

boot(){

    this.init();

    this.register();

    this.connectBus();

    console.log(

        "📚 KnowledgeAgent Online"

    );

},



};




// ==========================================
// EXPORT
// ==========================================

window.KnowledgeAgent=

KnowledgeAgent;




// ==========================================
// START
// ==========================================

KnowledgeAgent.boot();




console.log(

"✅ KnowledgeAgent V1 PRO Loaded"

);



})();