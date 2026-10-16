// ==========================================
// JARVIS V10 PRODUCTION
// Autonomous Agent Core
// Monitor Agent V3 PRO
// renderer/js/brain/agents/monitorAgent.js
// ==========================================


"use strict";


(function(){



const MonitorAgent = {


name:"MonitorAgent",


version:"3.0.0 PRO",


type:"system",


priority:10,


status:"idle",


enabled:true,



running:false,


timer:null,


interval:5000,



history:[],


alerts:[],



metrics:{


scans:0,

healthy:0,

warnings:0,

failures:0


},





// ==========================================
// INIT
// ==========================================


init(){


console.log(
"👁 MonitorAgent Initialized"
);


this.status="ready";


return true;


},






// ==========================================
// START
// ==========================================


start(){


if(this.running)
return false;



this.running=true;


this.status="monitoring";



console.log(
"👁 MonitorAgent Started"
);



this.timer=setInterval(()=>{


this.scan();



},this.interval);



return true;


},






// ==========================================
// STOP
// ==========================================


stop(){



this.running=false;


this.status="idle";



if(this.timer){


clearInterval(this.timer);


this.timer=null;


}



console.log(
"⛔ MonitorAgent Stopped"
);



return true;


},






// ==========================================
// RECEIVE
// ==========================================


async receive(message={}){


return await this.run(message);


},






// ==========================================
// RUN
// ==========================================


async run(task={}){


switch(task.action){



case "start":

return this.start();



case "stop":

return this.stop();



case "scan":

return this.scan();



case "health":

return this.healthReport();



default:


return {

success:false,

error:"Unknown Action"

};


}



},






// ==========================================
// SCAN
// ==========================================


scan(){



this.metrics.scans++;



if(!window.AgentRegistry)

return;



const agents=
AgentRegistry.list();



agents.forEach(name=>{


this.checkAgent(name);



});



return this.healthReport();



},






// ==========================================
// CHECK AGENT
// ==========================================


checkAgent(name){



const info=
AgentRegistry.getInfo(name);



if(!info)
return;



let state=info.status;



const report={


agent:name,


status:state,


time:Date.now()


};



this.history.push(report);



if(this.history.length>500)

this.history.shift();





switch(state){



case "running":


this.metrics.healthy++;


break;



case "error":


this.metrics.failures++;


this.alert(

"critical",

name,

"Agent Error State"

);



this.recover(name);



break;



case "idle":


break;



default:


this.metrics.warnings++;


this.alert(

"warning",

name,

"Unknown State"

);



}



},






// ==========================================
// HEALTH REPORT
// ==========================================


healthReport(){


return{


agentCount:
window.AgentRegistry ?
AgentRegistry.count():0,


metrics:this.metrics,


lastScan:
Date.now()


};



},






// ==========================================
// ALERT SYSTEM
// ==========================================


alert(level,agent,message){



const alert={


level,

agent,

message,

time:Date.now()


};



this.alerts.push(alert);



if(this.alerts.length>200)

this.alerts.shift();




this.emit(

"monitor.alert",

alert

);



},






// ==========================================
// AUTO RECOVERY
// ==========================================


recover(name){



console.warn(

"♻ Recovery Requested:",

name

);



if(window.RecoveryAgent){



RecoveryAgent.run({

action:"recover",

agent:name


});



}


else if(window.AgentRegistry){



AgentRegistry.recover(name);


}



},






// ==========================================
// EVENT BUS
// ==========================================


emit(event,data){



if(window.AgentBus){



AgentBus.emit(

event,

{


agent:this.name,


data,


time:Date.now()


}



);


}



},






// ==========================================
// STATUS
// ==========================================


getStatus(){



return{


name:this.name,


version:this.version,


status:this.status,


running:this.running,


history:this.history.length,


alerts:this.alerts.length,


metrics:this.metrics



};


},






// ==========================================
// RESET
// ==========================================


reset(){



this.stop();


this.history=[];


this.alerts=[];


this.metrics={


scans:0,

healthy:0,

warnings:0,

failures:0


};



}





};






// ==========================================
// GLOBAL
// ==========================================


window.MonitorAgent=
MonitorAgent;






// ==========================================
// REGISTER
// ==========================================


if(window.AgentRegistry){



AgentRegistry.register(


"MonitorAgent",


MonitorAgent,


{


type:"system",


priority:10,


group:"core",


tags:[


"monitor",


"health",


"recovery",


"system"


],



dependencies:[

"AgentRegistry"

],



permissions:{


read:true,


write:false,


execute:true


}



}



);



}






MonitorAgent.init();




console.log(
"✅ MonitorAgent V3 PRO Loaded"
);




})();