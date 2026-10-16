// ==========================================
// JARVIS V10
// Autonomous Agent Core
// VisionAgent V1 PRO
// renderer/js/brain/agents/visionAgent.js
// ==========================================

"use strict";

(function(){

const VisionAgent={

    version:"1.0.0 PRO",

    name:"VisionAgent",

    status:"idle",

    storageKey:"jarvis_vision_v1",

    captures:new Map(),

    history:[],

    maxHistory:1000,




// ==========================================
// INIT
// ==========================================

init(){

    this.load();

    console.log(

        "👁️ VisionAgent Initialized"

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

        case "capture":

            result=

            this.capture(

                task.data

            );

        break;



        case "analyze":

            result=

            this.analyzeImage(

                task.image

            );

        break;



        case "ocr":

            result=

            this.extractText(

                task.image

            );

        break;



        case "status":

            result=

            this.getStatus();

        break;



        case "save":

            result=

            this.save();

        break;



        case "load":

            result=

            this.load();

        break;



        default:

            result={

                success:false,

                error:

                "Unknown Vision Action"

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
// CAPTURE SCREEN
// ==========================================

capture(data={}){

    const capture={

        id:

        this.generateID(),

        window:

        data.window ||

        "desktop",

        region:

        data.region ||

        "full",

        timestamp:

        Date.now(),

        image:

        data.image ||

        null,

        status:

        "captured"

    };



    this.captures.set(

        capture.id,

        capture

    );



    this.log(

        "capture",

        capture

    );



    this.save();



    return{

        success:true,

        capture

    };

},




// ==========================================
// ANALYZE IMAGE
// ==========================================

analyzeImage(image){

    if(

        window.ImageAnalyzer

    ){

        return ImageAnalyzer.analyze(

            image

        );

    }



    return{

        success:true,

        objects:[],

        faces:0,

        text:false,

        width:0,

        height:0

    };

},




// ==========================================
// OCR
// ==========================================

extractText(image){

    if(

        window.OCREngine

    ){

        return OCREngine.read(

            image

        );

    }



    return{

        success:true,

        text:"",

        confidence:0

    };

},




// ==========================================
// GET CAPTURE
// ==========================================

getCapture(id){

    return this.captures.get(

        id

    ) || null;

},




// ==========================================
// GENERATE ID
// ==========================================

generateID(){

    return(

        "VIS_"

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

        this.history.length>

        this.maxHistory

    ){

        this.history.shift();

    }

},// ==========================================
// UI ELEMENT DETECTION
// ==========================================

detectUI(image){

    if(

        window.UIDetector

    ){

        return UIDetector.detect(

            image

        );

    }



    return{

        success:true,

        buttons:[],

        inputs:[],

        links:[],

        menus:[]

    };

},




// ==========================================
// WINDOW DETECTION
// ==========================================

detectWindow(image){

    if(

        window.WindowDetector

    ){

        return WindowDetector.detect(

            image

        );

    }



    return{

        success:true,

        title:"",

        application:"",

        active:false

    };

},




// ==========================================
// ICON RECOGNITION
// ==========================================

detectIcons(image){

    if(

        window.IconDetector

    ){

        return IconDetector.detect(

            image

        );

    }



    return{

        success:true,

        icons:[]

    };

},




// ==========================================
// SCREEN REGION ANALYSIS
// ==========================================

analyzeRegion(region={}){

    return{

        x:

        region.x || 0,



        y:

        region.y || 0,



        width:

        region.width || 0,



        height:

        region.height || 0,



        center:{

            x:

            (

                region.x || 0

            ) +

            (

                region.width || 0

            ) / 2,



            y:

            (

                region.y || 0

            ) +

            (

                region.height || 0

            ) / 2

        }

    };

},




// ==========================================
// VISUAL MEMORY
// ==========================================

saveVisualMemory(capture){

    if(

        !window.MemoryAgent ||

        !capture

    )

    return false;



    MemoryAgent.run({

        action:"remember",

        data:{

            type:"vision",

            content:

            JSON.stringify({

                id:

                capture.id,



                window:

                capture.window,



                region:

                capture.region

            }),

            importance:"normal",

            tags:[

                "vision",

                "screen",

                capture.window ||

                "desktop"

            ]

        }

    });



    return true;

},




// ==========================================
// SMART SCREEN SEARCH
// ==========================================

findCapture(query=""){

    const results=[];



    const text=

    query.toLowerCase();



    this.captures.forEach(capture=>{

        const target=(

            capture.window +

            " " +

            capture.region

        )

        .toLowerCase();



        if(

            target.includes(text)

        ){

            results.push(

                capture

            );

        }

    });



    return results;

},




// ==========================================
// GET LATEST CAPTURES
// ==========================================

getRecentCaptures(limit=10){

    return[

        ...this.captures.values()

    ]

    .sort(

        (a,b)=>

        b.timestamp-

        a.timestamp

    )

    .slice(

        0,

        limit

    );

},




// ==========================================
// SCREEN SUMMARY
// ==========================================

getCaptureSummary(){

    return{

        total:

        this.captures.size,



        recent:

        this.getRecentCaptures(5),



        history:

        this.history.length

    };

},// ==========================================
// SAVE
// ==========================================

save(){

    try{

        if(

            typeof localStorage==="undefined"

        )

        return false;



        const data={

            captures:[

                ...this.captures.values()

            ],

            history:

            this.history

        };



        localStorage.setItem(

            this.storageKey,

            JSON.stringify(data)

        );



        return true;

    }

    catch(error){

        console.error(

            "VisionAgent Save Error",

            error

        );



        return false;

    }

},




// ==========================================
// LOAD
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



        if(parsed.captures){

            parsed.captures.forEach(capture=>{

                this.captures.set(

                    capture.id,

                    capture

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

            "VisionAgent Load Error",

            error

        );



        return false;

    }

},




// ==========================================
// ANALYTICS
// Was referenced by getStatus() below but never defined anywhere in
// this file (verified: no other getAnalytics() in visionAgent.js) —
// calling "vision status" crashed with "getAnalytics is not a
// function" before this fix. Modeled on the working analytics shape
// used by the sibling knowledgeAgent.js/voiceAgent.js agents.
// ==========================================

getAnalytics(){

    const analytics={

        totalCaptures:
        this.captures.size,

        totalHistory:
        this.history.length,

        types:{}

    };

    this.history.forEach(item=>{

        const type = (item && item.action) || "unknown";

        analytics.types[type] =
        (analytics.types[type] || 0) + 1;

    });

    return analytics;

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



        captures:

        this.captures.size,



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

    this.captures.clear();



    this.history=[];



    this.save();



    this.status="idle";



    return true;

},




// ==========================================
// REGISTER
// ==========================================

register(){

    if(

        !window.AgentRegistry

    )

    return false;



    AgentRegistry.register(

        "VisionAgent",

        this,

        {

            type:"specialized",

            group:"vision",

            priority:22,

            tags:[

                "vision",

                "ocr",

                "screen",

                "image",

                "ui"

            ]

        }

    );



    return true;

},




// ==========================================
// CONNECT AGENT BUS
// ==========================================

connectBus(){

    if(

        !window.AgentBus

    )

    return false;



    AgentBus.subscribe(

        "VisionAgent",

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

onBusMessage(message={}){

    if(

        !message

    )

    return false;



    switch(message.type){



        case "vision_capture":

            this.capture(

                message.data

            );

        break;



        case "vision_analyze":

            this.analyzeImage(

                message.data.image

            );

        break;



        case "vision_ocr":

            this.extractText(

                message.data.image

            );

        break;



        case "vision_ui":

            this.detectUI(

                message.data.image

            );

        break;



        case "vision_window":

            this.detectWindow(

                message.data.image

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

        "👁️ VisionAgent Online"

    );

},



};




// ==========================================
// EXPORT
// ==========================================

window.VisionAgent=

VisionAgent;




// ==========================================
// START
// ==========================================

VisionAgent.boot();




console.log(

"✅ VisionAgent V1 PRO Loaded"

);



})();