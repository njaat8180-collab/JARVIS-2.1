"use strict";

/* JARVIS PRO MAX - Command Center
 * Fast local command layer. No cloud/AI call is required for these commands.
 * Real system telemetry is obtained from the secure Electron preload bridge.
 */
(function () {
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const clean = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9\u0900-\u097f ]+/g, " ").replace(/\s+/g, " ").trim();

    function sayAndRun(text, fn, wait = 650) {
        try { window.VoiceEngine?.speak?.(text); } catch (_) {}
        setTimeout(() => { try { Promise.resolve(fn?.()).catch(e => console.error("[CommandCenter] action failed", e)); } catch (e) { console.error("[CommandCenter] action failed", e); } }, wait);
        return { handled: true, source: "command-center", response: text, command: "action" };
    }

    function fmtBytes(bytes) {
        const n = Number(bytes || 0); if (!n) return "0 B";
        const units = ["B", "GB", "TB"]; let i = 0, x = n;
        while (x >= 1024 && i < units.length - 1) { x /= 1024; i++; }
        return `${x.toFixed(i ? 1 : 0)} ${units[i]}`;
    }

    function makeChapterNotes(message) {
        const text = clean(message);
        const asksForNotes = /\b(notes?|short notes?|summary|revision notes?)\b/.test(text) || /नोट्स|संक्षिप्त नोट्स|शॉर्ट नोट्स/.test(text);
        if (!asksForNotes || !/working with windows 7|windows 7|विंडोज़? 7/.test(text)) return null;
        return {
            handled: true,
            source: "chapter-notes",
            response: "तुम्हारे short notes तैयार हैं। नीचे पढ़ लो—मैंने इन्हें बोलकर नहीं पढ़ा है।",
            richContent: {
                type: "notes",
                title: "Class 9 CBSE IT — Working with Windows 7",
                sections: [
                    { heading: "1. Windows 7 क्या है?", body: "Windows 7, Microsoft का graphical operating system है। यह कंप्यूटर के hardware और software को manage करता है और files, folders तथा applications के साथ काम करने के लिए desktop interface देता है।" },
                    { heading: "2. Desktop के मुख्य भाग", items: ["Desktop: sign-in के बाद दिखाई देने वाला मुख्य work area।", "Icons: files, folders और programs के shortcuts या items।", "Taskbar: खुले programs, pinned apps और notification area दिखाता है।", "Start button / Start menu: programs, settings, search और power options तक पहुँच।", "Notification area: clock, volume, network और system notifications।"] },
                    { heading: "3. Windows, files और folders", items: ["Window में आम तौर पर title bar, minimize, maximize/restore और close buttons होते हैं।", "Windows Explorer से drives, folders और files देखे तथा व्यवस्थित किए जाते हैं।", "Copy/Paste की shortcut keys Ctrl+C और Ctrl+V; Cut Ctrl+X; Undo Ctrl+Z।", "Delete item को Recycle Bin में भेजता है; वहाँ से restore या स्थायी रूप से delete किया जा सकता है।"] },
                    { heading: "4. Personalization और सहायता", items: ["Desktop background, window appearance और screen resolution को Personalization से बदला जा सकता है।", "Control Panel से user accounts, devices, programs और system settings manage होते हैं।", "Help and Support में Windows से जुड़े सहायता विषय खोजे जा सकते हैं।"] },
                    { heading: "5. याद रखने योग्य बातें", items: ["OS का पूरा नाम Operating System है।", "Shortcut icon मूल file/program तक जल्दी पहुँच देता है।", "Recycle Bin से हटाई गई file वापस मिल सकती है, जब तक उसे permanently delete न किया गया हो।", "ये सामान्य Windows 7 revision notes हैं; आपके textbook के edition में दिए विशेष शब्दों/चित्रों को भी साथ मिलाकर पढ़ें।"] }
                ]
            }
        };
    }

    async function makeDailyBriefing() {
        let snapshot = {}, clock = {};
        try {
            const result = await window.jarvis?.info?.info?.();
            snapshot = result?.data || result || {};
        } catch (error) { console.warn("[Briefing] system snapshot unavailable", error); }
        try { clock = window.jarvis?.info?.now?.() || {}; } catch (_) {}
        const time = clock.time || new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date());
        const date = clock.date || new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "full" }).format(new Date());
        const metrics = [
            { heading: "Local time", body: `${time} · ${date} (India Standard Time)` },
            { heading: "Processor", body: snapshot.cpu?.percent == null ? "Telemetry unavailable" : `${snapshot.cpu.percent}% usage${snapshot.cpu.model ? ` · ${snapshot.cpu.model}` : ""}` },
            { heading: "Memory", body: snapshot.memory?.percent == null ? "Telemetry unavailable" : `${snapshot.memory.percent}% in use (${fmtBytes(snapshot.memory.usedBytes)} of ${fmtBytes(snapshot.memory.totalBytes)})` },
            { heading: "Power", body: snapshot.battery?.percent == null ? "No battery telemetry" : `${snapshot.battery.percent}%${snapshot.battery.charging ? " · charging" : ""}` },
            { heading: "JARVIS", body: window.ChatEngine?.healthCheck?.()?.online ? "Online and ready" : "Ready · response engine status unavailable" }
        ];
        const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(new Date()));
        const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        const summary = `${greeting}. It is ${time} in Delhi. ${snapshot.cpu?.percent == null ? "System telemetry is unavailable." : `CPU usage is ${snapshot.cpu.percent} percent.`} ${snapshot.memory?.percent == null ? "" : `Memory usage is ${snapshot.memory.percent} percent.`}`.trim();
        return { handled: true, source: "daily-briefing", response: summary, richContent: { type: "notes", title: "JARVIS · Daily Briefing", sections: metrics.map(item => ({ ...item, heading: item.heading })) } };
    }

    function getAgentSnapshot() {
        const registry = window.AgentRegistry;
        if (!registry || typeof registry.filter !== "function") return { available: false, agents: [] };
        const agents = registry.filter();
        const enabled = agents.filter(agent => agent.enabled !== false && agent.status !== "disabled");
        const running = enabled.filter(agent => /^(running|working|busy|executing)$/i.test(String(agent.status || "")));
        const errors = agents.filter(agent => /^(error|offline|failed)$/i.test(String(agent.status || "")));
        return { available: true, agents, enabled, running, errors };
    }

    async function agentStatus() {
        const snapshot = getAgentSnapshot();
        if (!snapshot.available) return { handled: true, source: "agent-status", response: "JARVIS का agent registry अभी उपलब्ध नहीं है; मैं कोई अनुमानित संख्या नहीं बताऊँगा।" };
        const total = snapshot.agents.length;
        const names = snapshot.running.map(agent => agent.name);
        const response = `${total} agents registered हैं; ${snapshot.enabled.length} enabled हैं और ${snapshot.running.length} अभी actively running ${snapshot.running.length === 1 ? "है" : "हैं"}${names.length ? ` (${names.slice(0, 5).join(", ")}${names.length > 5 ? ", …" : ""})` : ""}. ${snapshot.errors.length ? `${snapshot.errors.length} agent${snapshot.errors.length === 1 ? "" : "s"} error/offline status में ${snapshot.errors.length === 1 ? "है" : "हैं"}.` : "कोई registered agent error/offline नहीं दिख रहा."}`;
        return { handled: true, source: "agent-status", response, data: { total, enabled: snapshot.enabled.length, running: snapshot.running.length, errors: snapshot.errors.length, agents: snapshot.agents.map(agent => ({ name: agent.name, status: agent.status || "unknown", enabled: agent.enabled !== false })) } };
    }

    async function diagnostics() {
        let info = null;
        try { info = await window.jarvis?.info?.info?.(); } catch (e) { console.error("[Diagnostics] info failed", e); }
        const d = info?.data || info || {};
        const cpu = d.cpu || {}, mem = d.memory || {}, gpu = d.gpu || {}, bat = d.battery || {}, storage = d.storage || {};
        const net = Array.isArray(d.network) ? d.network : [];
        const agents = getAgentSnapshot();
        const platform = d.platform || (typeof navigator !== "undefined" ? navigator.platform : "unknown");
        const sections = [
            { heading: "System", items: [`Platform: ${platform}.`, `CPU: ${cpu.model || "unknown"}; ${cpu.cores || "?"} cores; ${Number.isFinite(cpu.percent) ? `${cpu.percent}% usage` : "usage unavailable"}.`, `Memory: ${Number.isFinite(mem.percent) ? `${mem.percent}% in use` : "usage unavailable"}; ${fmtBytes(mem.usedBytes)} of ${fmtBytes(mem.totalBytes)}.`, `GPU: ${gpu.model || "unavailable"}${Number.isFinite(gpu.usagePercent) ? ` · ${gpu.usagePercent}% usage` : ""}.`, storage.totalBytes ? `Storage: ${fmtBytes(storage.totalBytes - storage.freeBytes)} used of ${fmtBytes(storage.totalBytes)}.` : "Storage telemetry unavailable.", bat.percent != null ? `Battery: ${bat.percent}%${bat.charging ? " · charging" : ""}.` : "Battery telemetry unavailable.", `Network interfaces: ${net.length}.`, `Uptime: ${Math.round(Number(d.uptimeSeconds || 0) / 60)} minutes.`] },
            { heading: "JARVIS agents", body: agents.available ? `${agents.agents.length} registered · ${agents.enabled.length} enabled · ${agents.running.length} running now · ${agents.errors.length} error/offline` : "Agent registry unavailable." },
            ...(agents.available ? [{ heading: "Agent status", items: agents.agents.slice(0, 20).map(agent => `${agent.name}: ${agent.status || "unknown"}${agent.enabled === false ? " · disabled" : ""}`) }] : [])
        ];
        const response = agents.available
            ? `JARVIS diagnosis complete. ${agents.agents.length} agents are registered, ${agents.enabled.length} enabled, ${agents.running.length} currently running, and ${agents.errors.length} in error/offline state. CPU ${Number.isFinite(cpu.percent) ? `${cpu.percent}%` : "unavailable"}; memory ${Number.isFinite(mem.percent) ? `${mem.percent}%` : "unavailable"}. Full report is on screen.`
            : `JARVIS diagnosis complete. CPU ${Number.isFinite(cpu.percent) ? `${cpu.percent}%` : "unavailable"}; memory ${Number.isFinite(mem.percent) ? `${mem.percent}%` : "unavailable"}. Agent registry unavailable. Full report is on screen.`;
        return { handled: true, source: "system-diagnostics", response, diagnostics: d, data: agents, richContent: { type: "notes", title: "JARVIS · Diagnostic Report", sections } };
    }

    const rules = [
        { names:["start diagnosis","start diagnostics","run diagnosis","run diagnostics","begin diagnosis","jarvis self diagnosis","self diagnosis","jarvis diagnosis","jarvis diagnostics","डायग्नोसिस शुरू करो","डायग्नोस्टिक्स शुरू करो","जार्विस की जांच करो"], fn:()=>diagnostics() },
        { names:["how many agents","agent count","agents working","agents running","active agents","agent status","agent health","जार्विस के कितने एजेंट","कितने एजेंट काम कर रहे","कितने एजेंट्स काम कर रहे","एजेंट्स की स्थिति"], fn:()=>agentStatus() },
        { names:["brief me","daily briefing","system briefing","morning briefing","give me a briefing","स्थिति बताओ","आज की जानकारी दो","डेली ब्रीफिंग"], fn:()=>makeDailyBriefing() },
        { names:["shutdown","shut down","shutdown pc","computer shutdown","system shutdown","pc band karo","system band karo","computer band karo","startdoune"], fn:()=>sayAndRun("Understood. Shutting down the system.",()=>window.jarvis?.system?.shutdown?.()) },
        { names:["restart","restart pc","restart computer","system restart","pc restart karo","computer restart karo"], fn:()=>sayAndRun("Understood. Restarting the system.",()=>window.jarvis?.system?.restart?.()) },
        { names:["sleep","sleep pc","sleep computer","system sleep","pc ko sleep karo","computer sleep karo"], fn:()=>sayAndRun("Understood. Putting the system to sleep.",()=>window.jarvis?.system?.sleep?.()) },
        { names:["lock","lock pc","lock computer","system lock","pc lock karo","computer lock karo"], fn:()=>sayAndRun("Locking the computer now.",()=>window.jarvis?.system?.lock?.()) },
        { names:["system diagnosis","system diagnostics","run system diagnosis","run system diagnostics","jarvis diagnosis","jarvis diagnostics","system check","full system check","system health check","diagnose system","system ko diagnose karo"], fn:()=>diagnostics() },
        { names:["open chrome","chrome kholo","google chrome kholo","launch chrome"], fn:()=>sayAndRun("Opening Chrome.",()=>window.jarvis?.apps?.chrome?.(),200) },
        { names:["open vscode","vscode kholo","visual studio code kholo","launch vscode"], fn:()=>sayAndRun("Opening Visual Studio Code.",()=>window.jarvis?.apps?.vscode?.(),200) },
        { names:["open notepad","notepad kholo","launch notepad"], fn:()=>sayAndRun("Opening Notepad.",()=>window.jarvis?.apps?.notepad?.(),200) },
        { names:["open calculator","calculator kholo","launch calculator"], fn:()=>sayAndRun("Opening Calculator.",()=>window.jarvis?.apps?.calculator?.(),200) },
        { names:["open file explorer","open explorer","explorer kholo","files kholo"], fn:()=>sayAndRun("Opening File Explorer.",()=>window.jarvis?.apps?.explorer?.(),200) },
        { names:["open settings","settings kholo","windows settings kholo"], fn:()=>sayAndRun("Opening Settings.",()=>window.jarvis?.apps?.settings?.(),200) },
        { names:["minimize window","window minimize","minimize jarvis"], fn:()=>({handled:true,source:"command-center",response:"Minimizing the window.",action:window.jarvis?.window?.minimize?.()}) },
        { names:["maximize window","window maximize","maximize jarvis"], fn:()=>({handled:true,source:"command-center",response:"Maximizing the window.",action:window.jarvis?.window?.maximize?.()}) },
        { names:["close jarvis","close window","exit jarvis","quit jarvis"], fn:()=>sayAndRun("Closing JARVIS.",()=>window.jarvis?.window?.close?.()) },
        { names:["stop speaking","stop talking","be quiet","quiet jarvis","silence jarvis"], fn:()=>{window.VoiceEngine?.stopSpeaking?.(); return {handled:true,source:"command-center",response:"Okay."};} },
        { names:["mute microphone","mute mic","mic mute","microphone mute"], fn:()=>{window.VoiceEngine?.mute?.(); return {handled:true,source:"command-center",response:"Microphone muted."};} },
        { names:["unmute microphone","unmute mic","mic unmute","microphone unmute"], fn:()=>{window.VoiceEngine?.unmute?.(); return {handled:true,source:"command-center",response:"Microphone unmuted."};} },
        { names:["start listening","listen","listen to me","jarvis listen"], fn:()=>{window.VoiceEngine?.startListening?.(); return {handled:true,source:"command-center",response:"Listening."};} },
        { names:["stop listening","stop microphone","stop mic"], fn:()=>{window.VoiceEngine?.stopListening?.(); return {handled:true,source:"command-center",response:"Listening stopped."};} },
        { names:["what time is it","current time","time now","time batao","kitne baje hain"], fn:()=>{const x=window.jarvis?.info?.now?.()||{}; return {handled:true,source:"command-center",response:`The time is ${x.time||new Date().toLocaleTimeString()}.`};} },
        { names:["what is today's date","today's date","current date","date today","aaj ki date"], fn:()=>{const x=window.jarvis?.info?.now?.()||{}; return {handled:true,source:"command-center",response:`Today's date is ${x.date||new Date().toLocaleDateString()}.`};} },
        { names:["system info","computer info","pc information","computer information","system information"], fn:async()=>{const r=await window.jarvis?.info?.info?.(); const d=r?.data||r||{}; return {handled:true,source:"system-info",response:`This computer is running ${d.platform||"an unknown platform"} with ${d.cpu?.cores||"unknown"} CPU cores and RAM usage at ${d.memory?.percent ?? "unknown"} percent.`,data:d};} },
        { names:["cpu usage","cpu check","processor usage"], fn:async()=>{const r=await window.jarvis?.info?.info?.(); const d=r?.data||r||{}; return {handled:true,source:"system-info",response:`Current CPU usage is ${d.cpu?.percent ?? "unavailable"} percent.`,data:d.cpu};} },
        { names:["ram usage","memory usage","ram check","memory check"], fn:async()=>{const r=await window.jarvis?.info?.info?.(); const d=r?.data||r||{}; return {handled:true,source:"system-info",response:`Current memory usage is ${d.memory?.percent ?? "unavailable"} percent.`,data:d.memory};} },
        { names:["gpu usage","gpu check","graphics usage"], fn:async()=>{const r=await window.jarvis?.info?.info?.(); const d=r?.data||r||{}; return {handled:true,source:"system-info",response:`GPU is ${d.gpu?.model||"unavailable"}${d.gpu?.usagePercent != null ? ` with usage at ${d.gpu.usagePercent} percent` : ""}.`,data:d.gpu};} },
        { names:["storage usage","disk usage","disk space","storage check"], fn:async()=>{const r=await window.jarvis?.info?.info?.(); const d=r?.data||r||{}; return {handled:true,source:"system-info",response:d.storage?.totalBytes ? `Storage usage is ${d.storage.percent} percent, with ${fmtBytes(d.storage.freeBytes)} free.` : "Storage telemetry is unavailable.",data:d.storage};} },
        { names:["battery status","battery check","battery percentage","battery batao"], fn:async()=>{const r=await window.jarvis?.info?.info?.(); const d=r?.data||r||{}; return {handled:true,source:"system-info",response:d.battery?.percent != null ? `Battery is at ${d.battery.percent} percent${d.battery.charging ? " and charging" : ""}.` : "Battery telemetry is unavailable.",data:d.battery};} },
        { names:["network status","network check","internet status","network batao"], fn:async()=>{const r=await window.jarvis?.info?.info?.(); const d=r?.data||r||{}; return {handled:true,source:"system-info",response:`I detected ${Array.isArray(d.network)?d.network.length:0} non-internal network interfaces.`,data:d.network};} },
        { names:["uptime","system uptime","pc uptime"], fn:async()=>{const r=await window.jarvis?.info?.info?.(); const d=r?.data||r||{}; return {handled:true,source:"system-info",response:`System uptime is ${Math.round(Number(d.uptimeSeconds||0)/60)} minutes.`};} },
        { names:["health status","jarvis health","health check"], fn:()=>{const h=window.SystemController?.getStatus?.()||window.SystemController?.diagnostics?.(); return {handled:true,source:"health",response:h?.health?.status ? `JARVIS health is ${h.health.status}.` : "JARVIS health telemetry is available.",data:h};} },
        { names:["run health diagnostics","health diagnostics","full health report"], fn:()=>{const d=window.SystemController?.diagnostics?.(); return {handled:true,source:"health-diagnostics",response:"Full JARVIS health diagnostics are complete. The detailed report is available in the console.",data:d};} },
        { names:["show diagnostics","show diagnostic report","diagnostic report"], fn:()=>{const d=window.SystemController?.diagnostics?.(); console.log("🩺 JARVIS DIAGNOSTIC REPORT",d); return {handled:true,source:"diagnostics",response:"Diagnostic report generated. I have logged the detailed real-time report to the console.",data:d};} },
        { names:["open youtube","youtube kholo","youtube open karo"], fn:()=>sayAndRun("Opening YouTube.",()=>window.jarvis?.browser?.open?.("https://www.youtube.com"),200) },
        { names:["open google","google kholo","google open karo"], fn:()=>sayAndRun("Opening Google.",()=>window.jarvis?.browser?.open?.("https://www.google.com"),200) },
        { names:["new browser tab","new tab","naya tab kholo"], fn:()=>sayAndRun("Opening a new browser tab.",()=>window.jarvis?.browser?.newTab?.(),200) },
        { names:["reload browser","reload page","page reload karo"], fn:()=>({handled:true,source:"command-center",response:"Reloading the page.",action:window.jarvis?.browser?.reload?.()}) },
        { names:["browser back","go back","peeche jao"], fn:()=>({handled:true,source:"command-center",response:"Going back.",action:window.jarvis?.browser?.back?.()}) },
        { names:["browser forward","go forward","aage jao"], fn:()=>({handled:true,source:"command-center",response:"Going forward.",action:window.jarvis?.browser?.forward?.()}) },
        { names:["cancel request","cancel task","stop task","cancel everything","stop everything"], fn:()=>{window.ChatEngine?.cancel?.(); window.VoiceEngine?.stopSpeaking?.(); return {handled:true,source:"command-center",response:"Current task cancelled."};} },
        { names:["clear chat","clear conversation","chat clear karo"], fn:()=>{window.ChatEngine?.clearHistory?.(); return {handled:true,source:"command-center",response:"Chat history cleared."};} },
        { names:["reset session","reset chat session","new session"], fn:()=>{window.ChatEngine?.resetSession?.(); return {handled:true,source:"command-center",response:"Session reset."};} },
        { names:["show last response","last response batao"], fn:()=>{const r=window.ChatEngine?.getLastResponse?.(); return {handled:true,source:"command-center",response:r?.text||"There is no previous response."};} },
        { names:["show last command","last command batao"], fn:()=>{const r=window.ChatEngine?.getLastRequest?.(); return {handled:true,source:"command-center",response:r?.message||"There is no previous command."};} },
        { names:["jarvis status","assistant status","status check"], fn:()=>{const c=window.ChatEngine?.healthCheck?.(); return {handled:true,source:"command-center",response:`JARVIS is ${c?.online?"online":"offline"}, with ${c?.engines??0} connected engines.`};} },
        { names:["version","jarvis version","what version are you"], fn:()=>({handled:true,source:"command-center",response:`JARVIS is running the current application build.`}) },
        { names:["help commands","show commands","list commands","what can you do"], fn:()=>({handled:true,source:"command-center",response:"I can control system power, lock and sleep the PC, open apps, control the browser, report real CPU RAM GPU storage battery and network telemetry, run diagnostics, control the microphone, and manage the chat session."}) },
        { names:["open task manager","task manager kholo","launch task manager"], fn:()=>sayAndRun("Opening Task Manager.",()=>window.jarvis?.system?.openApp?.("taskmgr.exe"),200) },
        { names:["open powershell","powershell kholo","launch powershell"], fn:()=>sayAndRun("Opening PowerShell.",()=>window.jarvis?.system?.openApp?.("powershell.exe"),200) },
        { names:["open command prompt","open cmd","cmd kholo","launch cmd"], fn:()=>sayAndRun("Opening Command Prompt.",()=>window.jarvis?.system?.openApp?.("cmd.exe"),200) },
        { names:["open paint","paint kholo","launch paint"], fn:()=>sayAndRun("Opening Paint.",()=>window.jarvis?.system?.openApp?.("mspaint.exe"),200) },
        { names:["open wordpad","wordpad kholo"], fn:()=>sayAndRun("Opening WordPad.",()=>window.jarvis?.system?.openApp?.("write.exe"),200) },
        { names:["open control panel","control panel kholo"], fn:()=>sayAndRun("Opening Control Panel.",()=>window.jarvis?.system?.openApp?.("control.exe"),200) },
        { names:["open device manager","device manager kholo"], fn:()=>sayAndRun("Opening Device Manager.",()=>window.jarvis?.system?.openApp?.("devmgmt.msc"),200) },
        { names:["open services","services kholo","windows services kholo"], fn:()=>sayAndRun("Opening Windows Services.",()=>window.jarvis?.system?.openApp?.("services.msc"),200) },
        { names:["open event viewer","event viewer kholo"], fn:()=>sayAndRun("Opening Event Viewer.",()=>window.jarvis?.system?.openApp?.("eventvwr.msc"),200) },
        { names:["open resource monitor","resource monitor kholo"], fn:()=>sayAndRun("Opening Resource Monitor.",()=>window.jarvis?.system?.openApp?.("resmon.exe"),200) },
        { names:["open control center","open windows settings","windows settings"], fn:()=>sayAndRun("Opening Windows Settings.",()=>window.jarvis?.apps?.settings?.(),200) }
    ];

    async function handle(message) {
        const text = clean(message).replace(/^(?:jarvis|hey jarvis)\s+/, "");
        if (!text) return {handled:false};
        const focusResult = window.JARVISFocusSprint?.handle?.(text);
        if (focusResult?.handled) return focusResult;
        const notes = makeChapterNotes(text);
        if (notes) return notes;
        const viewAliases = [
            { view: "dashboard", label: "Dashboard", re: /^(?:(?:open|show|go to|switch to|navigate to) )?(?:jarvis )?(?:main )?dashboard(?: kholo| open)?$|^(?:dashboard|डैशबोर्ड)(?: खोलो| खोल दो| दिखाओ)?$/ },
            { view: "voice", label: "Voice", re: /^(?:(?:open|show|go to|switch to|navigate to) )?(?:jarvis )?(?:voice|voice mode|voice option|voice settings)(?: section| page| tab| wala option)?(?: kholo| khol do| open)?$|^(?:voice|वॉइस|आवाज़)(?: वाला| वाली)?(?: option| section| ऑप्शन| सेक्शन)?(?: खोलो| खोल दो| दिखाओ)$/ },
            { view: "chat", label: "Chat", re: /^(?:(?:open|show|go to|switch to|navigate to) )?(?:jarvis )?(?:chat|chat screen|chat section)(?: kholo| khol do| open)?$|^(?:chat|चैट)(?: खोलो| खोल दो| दिखाओ)$/ },
            { view: "browser", label: "Browser", re: /^(?:(?:open|show|go to|switch to|navigate to) )?(?:jarvis )?(?:browser|browser system|browser section)(?: kholo| khol do| open| mein jao)?$|^(?:browser|ब्राउज़र)(?: खोलो| खोल दो| में जाओ| सिस्टम खोलो)$/ },
            { view: "settings", label: "Settings", re: /^(?:(?:open|show|go to|switch to|navigate to) )?(?:jarvis )?(?:app )?settings(?: kholo| khol do| open)?$|^(?:settings|सेटिंग्स?)(?: खोलो| खोल दो| दिखाओ)$/ },
            { view: "files", label: "Files", re: /^(?:(?:open|show|go to|switch to|navigate to) )?(?:jarvis )?(?:files|file manager|workspace files)(?: kholo| open)?$|^(?:files|फाइल्स?)(?: खोलो| खोल दो)$/ },
            { view: "documents", label: "Documents", re: /^(?:(?:open|show|go to|switch to|navigate to) )?(?:jarvis )?(?:documents|document gallery)(?: kholo| open)?$|^(?:documents|डॉक्यूमेंट्स?)(?: खोलो| खोल दो)$/ },
            { view: "health", label: "Health", re: /^(?:(?:open|show|go to|switch to|navigate to) )?(?:jarvis )?(?:health|health page|diagnostics page)(?: kholo| open)?$/ },
            { view: "lab", label: "Lab", re: /^(?:(?:open|show|go to|switch to|navigate to) )?(?:jarvis )?(?:jarvis )?lab(?: kholo| open)?$/ }
        ];
        const targetView = viewAliases.find(item => item.re.test(text));
        if (targetView) {
            try {
                if (targetView.view === "browser") {
                    if (!window.BrowserUI?.showPanel) throw new Error("JARVIS Browser is unavailable.");
                    await window.BrowserUI.showPanel();
                } else {
                    const button = document.querySelector(`.menu-item[data-view="${targetView.view}"]`);
                    if (!button) throw new Error(`${targetView.label} screen is unavailable.`);
                    button.click();
                }
                return { handled: true, source: "app-navigation", response: `Opening JARVIS ${targetView.label}.`, data: { view: targetView.view } };
            } catch (error) {
                return { handled: true, source: "app-navigation", response: `I could not open JARVIS ${targetView.label}: ${error?.message || "screen unavailable"}.` };
            }
        }
        if (/^(?:start|run|begin)\s+(?:system\s+)?diagnos(?:is|tics?)$/.test(text) || /^(?:jarvis\s+)?(?:self\s+)?diagnos(?:is|tics)$/.test(text) || /^diagnose (?:the )?system$/.test(text) || /^(?:जार्विस\s+)?स्टार्ट\s+डायग्नोसिस$/.test(text) || /डायग्नोसिस शुरू करो|डायग्नोस्टिक्स? शुरू करो|जार्विस की जांच करो/.test(text)) return diagnostics();
        // Generic app discovery: main.js checks known launchers and then
        // searches installed Start Menu shortcuts, so new apps need no code edit.
        const openMatch = text.match(/^(?:open|launch|start)\s+(.+?)(?:\s+please)?$/);
        if (openMatch) {
            const appName = openMatch[1].trim();
            if (/^gemini\s+(?:on\s+google|in\s+(?:the\s+)?browser|website|web)$/i.test(appName)) {
                return sayAndRun("Opening Gemini in the browser.", () => window.jarvis?.browser?.newTab?.("https://gemini.google.com"), 0);
            }
            if (/^outlook(?:\.com|\s+com|\s+dot\s+com)$/i.test(appName)) {
                return sayAndRun("Opening Outlook.com.", async () => {
                    await window.BrowserUI?.showPanel?.();
                    return window.BrowserUI?.navigateActiveTab?.("https://outlook.live.com/mail/");
                }, 0);
            }
            try {
                const result = await window.jarvis?.system?.openApp?.(appName);
                if (result?.success) return {handled:true,source:"app-launcher",response:`Opening ${appName}.`,data:result};
                return {handled:true,source:"app-launcher",response:result?.error || `I could not find ${appName} installed on this PC.`,data:result};
            } catch (error) {
                return {handled:true,source:"app-launcher",response:`I could not open ${appName}: ${error?.message || "unknown error"}.`};
            }
        }
        const productIntent = text.match(/^(?:i want|i need|compare prices? for|track prices? for|check prices? for|price of|how much is|what is the price of|research|find (?:information|info|prices?) (?:about|for)|mujhe)\s+(.+?)(?:\s+chahiye)?$/);
        if (productIntent) {
            const product = productIntent[1].trim();
            try {
                const result = await window.jarvis?.data?.productResearch?.(product);
                if (!result?.success) {
                    return {handled:true,source:"product-research",response:result?.error || `I could not research ${product}.`};
                }
                // These URLs are constructed by main-process code for fixed
                // retailer domains; Reddit/Wikipedia results never control a URL.
                let openedRetailerPages = 0;
                for (const url of [result.retailers.googleShoppingUrl, result.retailers.amazonSearchUrl]) {
                    try {
                        const opened = await window.jarvis?.browser?.newTab?.(url);
                        if (opened?.success) openedRetailerPages++;
                    } catch (_) {}
                }
                const facts = result.wikipedia?.summary
                    ? `${result.wikipedia.title}: ${result.wikipedia.summary.slice(0, 900)}`
                    : "Wikipedia did not return a matching article.";
                const discussions = result.reddit?.length
                    ? `Reddit discussions include: ${result.reddit.slice(0, 2).map(post => `${post.title} (r/${post.subreddit})`).join("; ")}.`
                    : "Reddit did not return usable discussions.";
                const retailerStatus = openedRetailerPages === 2
                    ? "I opened Google Shopping and Amazon India in Jarvis so you can compare current listings."
                    : `I opened ${openedRetailerPages} of 2 shopping pages; direct search links are in the attached research data.`;
                const response = `Product research for ${result.query}. ${facts} ${discussions} ${retailerStatus} I could not confirm the cheapest exact listing: live marketplace offer data is not configured. I have not added anything to a cart or placed an order.`;
                return {handled:true,source:"product-research",response,data:result};
            } catch (error) {
                return {handled:true,source:"product-research",response:`Product research failed: ${error?.message || "network unavailable"}.`};
            }
        }
        // Exact or near-exact matching. Longer aliases win to avoid short collisions.
        const sorted = [...rules].sort((a,b)=>Math.max(...b.names.map(x=>x.length))-Math.max(...a.names.map(x=>x.length)));
        for (const rule of sorted) {
            if (rule.names.some(n => text === clean(n) || text.includes(clean(n)))) {
                try { return await rule.fn(); } catch (e) { console.error("[CommandCenter]", e); return {handled:true,source:"command-center",response:"I could not complete that local command.",error:e?.message||String(e)}; }
            }
        }
        return {handled:false};
    }

    window.JARVISCommandCenter = Object.freeze({ handle, diagnostics });
})();
