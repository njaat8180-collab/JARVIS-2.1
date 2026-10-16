// ==========================================
// JARVIS V10
// Autonomous Agent Core
// SystemAgent V1 PRO
// renderer/js/brain/agents/systemAgent.js
// ==========================================

"use strict";

(function(){

const SystemAgent={

    version:"1.0.0 PRO",

    name:"SystemAgent",

    status:"idle",

    storageKey:"jarvis_system_v1",

    processes:new Map(),

    history:[],

    maxHistory:1000,




// ==========================================
// INIT
// ==========================================

init(){

    this.load();

    console.log(

        "🖥️ SystemAgent Initialized"

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


        case "launch":

            result=

            this.launchApp(

                task.data

            );

        break;



        case "close":

            result=

            this.closeApp(

                task.data

            );

        break;



        case "process":

            result=

            this.getProcesses();

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

                "Unknown System Action"

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
// LAUNCH APPLICATION
// ==========================================

launchApp(data={}){

    const process={

        id:

        this.generateID(),

        app:

        data.app ||

        "",

        command:

        data.command ||

        "",

        status:

        "running",

        started:

        Date.now()

    };



    if(

        window.SystemCommands

    ){

        SystemCommands.launch(

            data.app,

            data.command

        );

    }



    this.processes.set(

        process.id,

        process

    );



    this.log(

        "launch",

        process

    );



    this.save();



    return{

        success:true,

        process

    };

},




// ==========================================
// CLOSE APPLICATION
// ==========================================

closeApp(data={}){

    if(

        window.SystemCommands

    ){

        SystemCommands.close(

            data.app

        );

    }



    this.log(

        "close",

        data

    );



    return{

        success:true

    };

},




// ==========================================
// PROCESS LIST
// ==========================================

getProcesses(){

    return[

        ...this.processes.values()

    ];

},




// ==========================================
// GET PROCESS
// ==========================================

getProcess(id){

    return this.processes.get(

        id

    ) || null;

},




// ==========================================
// GENERATE ID
// ==========================================

generateID(){

    return(

        "SYS_"

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
// FILE OPERATIONS
// ==========================================

fileOperation(data={}){

    if(

        !window.SystemCommands

    ){

        return{

            success:false,

            error:

            "SystemCommands unavailable"

        };

    }



    switch(data.action){



        case "copy":

            return SystemCommands.copyFile(

                data.source,

                data.destination

            );



        case "move":

            return SystemCommands.moveFile(

                data.source,

                data.destination

            );



        case "delete":

            return SystemCommands.deleteFile(

                data.path

            );



        case "rename":

            return SystemCommands.renameFile(

                data.path,

                data.name

            );



        default:

            return{

                success:false,

                error:

                "Unknown file operation"

            };

    }

},




// ==========================================
// FOLDER OPERATIONS
// ==========================================

folderOperation(data={}){

    if(

        !window.SystemCommands

    ){

        return{

            success:false,

            error:

            "SystemCommands unavailable"

        };

    }



    switch(data.action){



        case "create":

            return SystemCommands.createFolder(

                data.path

            );



        case "delete":

            return SystemCommands.deleteFolder(

                data.path

            );



        case "open":

            return SystemCommands.openFolder(

                data.path

            );



        default:

            return{

                success:false,

                error:

                "Unknown folder operation"

            };

    }

},




// ==========================================
// SYSTEM MONITOR
// ==========================================

getSystemInfo(){

    if(

        window.SystemMonitor

    ){

        return SystemMonitor.getInfo();

    }



    return{

        cpu:0,

        ram:0,

        disk:0,

        uptime:0

    };

},




// ==========================================
// CPU / RAM / DISK
// ==========================================

getResources(){

    const info=

    this.getSystemInfo();



    return{

        cpu:

        info.cpu ||

        0,



        ram:

        info.ram ||

        0,



        disk:

        info.disk ||

        0,



        uptime:

        info.uptime ||

        0

    };

},




// ==========================================
// POWER MANAGEMENT
// ==========================================

power(action=""){


    if(

        !window.SystemCommands

    ){

        return{

            success:false,

            error:

            "SystemCommands unavailable"

        };

    }



    switch(action){



        case "shutdown":

            return SystemCommands.shutdown();



        case "restart":

            return SystemCommands.restart();



        case "sleep":

            return SystemCommands.sleep();



        case "lock":

            return SystemCommands.lock();



        default:

            return{

                success:false,

                error:

                "Unknown power action"

            };

    }

},




// ==========================================
// SYSTEM HEALTH
// ==========================================

getHealth(){

    const info=

    this.getResources();



    let score=100;

    const warnings=[];



    if(

        info.cpu>90

    ){

        score-=25;

        warnings.push(

            "High CPU usage"

        );

    }



    if(

        info.ram>90

    ){

        score-=25;

        warnings.push(

            "High RAM usage"

        );

    }



    if(

        info.disk>95

    ){

        score-=30;

        warnings.push(

            "Disk almost full"

        );

    }



    return{

        score,

        warnings,

        resources:

        info

    };

},// ==========================================
// DECISION INTEGRATION
// ==========================================

requestDecision(task={}){

    if(

        !window.DecisionAgent

    )

    return null;



    return DecisionAgent.run({

        action:"decide",

        data:{

            task:

            task.name ||

            "system_task",

            type:

            "system",

            priority:

            task.priority ||

            "normal",

            data:

            task

        }

    });

},




// ==========================================
// RECOVERY INTEGRATION
// ==========================================

requestRecovery(reason={}){

    if(

        !window.RecoveryAgent

    )

    return false;



    return RecoveryAgent.run({

        action:"recover",

        data:reason

    });

},




// ==========================================
// MEMORY INTEGRATION
// ==========================================

saveSystemMemory(event={}){

    if(

        !window.MemoryAgent

    )

    return false;



    MemoryAgent.run({

        action:"remember",

        data:{

            type:"system",

            content:

            JSON.stringify(event),

            importance:

            "normal",

            tags:[

                "system",

                event.type ||

                "event"

            ]

        }

    });



    return true;

},




// ==========================================
// SYSTEM ANALYTICS
// ==========================================

getAnalytics(){

    const analytics={

        totalProcesses:

        this.processes.size,



        running:0,



        stopped:0,



        history:

        this.history.length

    };



    this.processes.forEach(process=>{

        if(

            process.status===

            "running"

        ){

            analytics.running++;

        }

        else{

            analytics.stopped++;

        }

    });



    return analytics;

},




// ==========================================
// AUTONOMOUS MAINTENANCE
// ==========================================

autoMaintain(){

    const health=

    this.getHealth();



    if(

        health.score < 70

    ){

        this.requestRecovery({

            reason:

            "Low system health",

            health

        });

    }



    this.saveSystemMemory({

        type:

        "maintenance",

        score:

        health.score,

        time:

        Date.now()

    });



    return health;

},




// ==========================================
// RESOURCE OPTIMIZATION
// ==========================================

optimizeResources(){

    const health=

    this.getHealth();



    const actions=[];



    if(

        health.resources.cpu > 85

    ){

        actions.push(

            "Reduce CPU load"

        );

    }



    if(

        health.resources.ram > 85

    ){

        actions.push(

            "Free memory"

        );

    }



    if(

        health.resources.disk > 90

    ){

        actions.push(

            "Clean temporary files"

        );

    }



    return{

        success:true,

        actions,

        health

    };

},




// ==========================================
// SYSTEM DASHBOARD
// ==========================================

getDashboard(){

    return{

        status:

        this.status,



        analytics:

        this.getAnalytics(),



        resources:

        this.getResources(),



        health:

        this.getHealth()

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

            processes:[

                ...this.processes.values()

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

            "SystemAgent Save Error",

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



        if(parsed.processes){

            parsed.processes.forEach(process=>{

                this.processes.set(

                    process.id,

                    process

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

            "SystemAgent Load Error",

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



        processes:

        this.processes.size,



        history:

        this.history.length,



        analytics:

        this.getAnalytics(),



        resources:

        this.getResources()

    };

},




// ==========================================
// RESET
// ==========================================

reset(){

    this.processes.clear();



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

        "SystemAgent",

        this,

        {

            type:"core",

            group:"system",

            priority:15,

            tags:[

                "system",

                "windows",

                "process",

                "hardware",

                "automation"

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

        "SystemAgent",

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

    switch(message.type){



        case "system_launch":

            this.launchApp(

                message.data

            );

        break;



        case "system_close":

            this.closeApp(

                message.data

            );

        break;



        case "system_power":

            this.power(

                message.data.action

            );

        break;



        case "system_monitor":

            this.autoMaintain();

        break;



        case "system_optimize":

            this.optimizeResources();

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

        "🖥️ SystemAgent Online"

    );

},



};




// ==========================================
// EXPORT
// ==========================================

window.SystemAgent=

SystemAgent;




// ==========================================
// START
// ==========================================

SystemAgent.boot();




console.log(

"✅ SystemAgent V1 PRO Loaded"

);



})();