/* JARVIS Command Center: renderer-only orchestration layer. */
"use strict";
(function (root) {
    const $ = id => document.getElementById(id);
    let timer = null, observer = null;

    function setText(id, value) { const el=$(id); if(el) el.textContent = value == null || value === "" ? "—" : String(value); }
    function pushFeed(message, type="info") {
        const list=$("ccFeedList"); if(!list) return;
        const item=document.createElement("div"); item.className=`cc-feed-item cc-feed-${type}`;
        item.textContent=String(message); list.prepend(item);
        while(list.children.length>40) list.removeChild(list.lastChild);
    }
    async function refreshAgents() {
        const h=root.JARVISBootHealth;
        try {
            const r=await h?.runBootSequence?.();
            setText("ccSystemStatus", r?.ready ? "ONLINE" : "DEGRADED");
            if(r?.criticalFailures?.length) pushFeed(`Boot checks failed: ${r.criticalFailures.join(", ")}`,"warn");
            return r;
        } catch(e) { pushFeed("Boot health unavailable","warn"); return null; }
    }
    async function refreshSources() {
        const chain=root.JARVISKnowledgeSourceChain;
        try {
            const s=chain?.getStatus?.() || chain?.getStats?.();
            setText("ccSrcGrid", s ? JSON.stringify(s) : "OFFLINE");
            return s;
        } catch(e) { setText("ccSrcGrid","OFFLINE"); return null; }
    }
    async function refreshMemory() {
        try {
            const r=await root.jarvis?.memory?.stats?.();
            const d=r?.data||r||{};
            setText("ccMemFacts",d.facts ?? d.count ?? "—");
            setText("ccMemTurns",d.turns ?? "—");
            setText("ccMemWebCalls",d.webCalls ?? "—");
            return d;
        } catch(e) { return null; }
    }
    async function refreshProfile() {
        try {
            const r=await root.jarvis?.users?.getCurrent?.();
            const p=r?.profile||r?.data||r||{};
            setText("ccProfileName",p.name||p.displayName||"Guest");
            return p;
        } catch(e) { setText("ccProfileName","Guest"); return null; }
    }
    async function refresh() {
        await Promise.allSettled([refreshAgents(),refreshSources(),refreshMemory(),refreshProfile()]);
    }
    function sendViaChat(text) {
        const input=$("chatInput"); if(!input) return {success:false,error:"Chat input unavailable"};
        input.value=String(text||"").trim();
        if(!input.value) return {success:false,error:"Empty message"};
        input.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",code:"Enter",bubbles:true}));
        return {success:true};
    }
    function start() { /* STANDBY */ if(timer) return; refresh(); timer=setInterval(refresh,5000); return {started:true}; }
    function stop() { if(timer) clearInterval(timer); timer=null; if(observer) observer.disconnect(); observer=null; return {stopped:true}; }
    function initObserver() {
        if(typeof MutationObserver==="undefined" || observer) return;
        observer=new MutationObserver(()=>{ const ids=["cpuPercent","ramPercent","diskPercent","netSpeed"]; ids.forEach(id=>{const src=$(id); const dst=$(`cc${id[0].toUpperCase()+id.slice(1)}`); if(src&&dst) dst.textContent=src.textContent||"—";}); });
        const host=$("ccSystemMonitor")||document.body; if(host) observer.observe(host,{subtree:true,childList:true,characterData:true});
    }
    const CommandCenter={
        start:start,
        stop:stop,
        pushFeed:pushFeed,
        refreshAgents:refreshAgents,
        refreshSources:refreshSources,
        sendViaChat:sendViaChat,
        refresh:refresh
    };
    // Public browser API. Keep the explicit window assignment for legacy integrations.
    if (typeof window !== "undefined") window.JARVISCommandCenter = CommandCenter;
    root.JARVISCommandCenter=CommandCenter;
    // Real-data integrations intentionally remain bridge-backed.
    const _memoryBridge = window.jarvis?.memory; // window.jarvis.memory is the live memory IPC bridge
    const _currentUser = window.jarvis?.users?.getCurrent; // getCurrent + jarvis.users
    const _knowledgeStore = window.JARVISKnowledgeStore; // JARVISKnowledgeStore
    const _bootHealth = window.JARVISBootHealth;
    if(typeof module!=="undefined"&&module.exports) module.exports = CommandCenter;
    function boot(){initObserver();start();}
    if(document?.readyState==="loading") document.addEventListener("DOMContentLoaded",boot); else boot();
})(typeof window!=="undefined"?window:globalThis);
