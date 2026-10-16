/* JARVIS health metric classification — renderer + Node-test safe. */
"use strict";
(function (root) {
    const thresholds = {
        cpu: { warnBelow: 40, criticalBelow: 15 },
        memory: { warnBelow: 40, criticalBelow: 15 },
        disk: { warnBelow: 40, criticalBelow: 15 },
        network: { warnBelow: 40, criticalBelow: 15 },
        overall: { warnBelow: 40, criticalBelow: 15 }
    };
    const listeners = new Set();
    const alerted = new Set();

    function statusFor(metric, value) {
        const n = Number(value);
        const t = thresholds[metric] || thresholds.overall;
        if (!Number.isFinite(n)) return { status:"unknown", badge:"UNKNOWN", value:null };
        if (n < t.criticalBelow) return { status:"critical", badge:"CRITICAL", value:n };
        if (n < t.warnBelow) return { status:"warn", badge:"WARN", value:n };
        return { status:"nominal", badge:"NOMINAL", value:n };
    }
    function classifyMetric(metric, value) {
        const key = String(metric || "").toLowerCase();
        const r = statusFor(key, value);
        if (r.status === "critical" && !alerted.has(key)) {
            alerted.add(key);
            const alert = { metric:key, value:r.value, status:r.status, badge:r.badge, timestamp:Date.now() };
            listeners.forEach(fn => { try { fn(alert); } catch (_) {} });
        }
        return { metric:key, ...r };
    }
    function classify(metrics) {
        const input = metrics && typeof metrics === "object" ? metrics : {};
        const out = {};
        const vals = [];
        for (const [key, value] of Object.entries(input)) {
            out[key] = classifyMetric(key, value);
            if (Number.isFinite(Number(value))) vals.push(Number(value));
        }
        const avg = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
        out.overall = classifyMetric("overall", avg);
        return out;
    }
    function statusClass(status) {
        return ({nominal:"fx-health-nominal", warn:"fx-health-warn", critical:"fx-health-critical"})[status] || "fx-health-unknown";
    }
    function onAlert(fn) { if (typeof fn === "function") listeners.add(fn); return () => listeners.delete(fn); }
    function resetAlerts() { alerted.clear(); }
    function getThresholds() { return JSON.parse(JSON.stringify(thresholds)); }
    function setThreshold(metric, warnBelow, criticalBelow) {
        const key=String(metric||"").toLowerCase();
        if (!thresholds[key]) return {success:false,error:"Unknown metric"};
        const w=Number(warnBelow), c=Number(criticalBelow);
        if (!Number.isFinite(w)||!Number.isFinite(c)||c>=w) return {success:false,error:"Invalid thresholds"};
        thresholds[key]={warnBelow:w,criticalBelow:c};
        resetAlerts();
        return {success:true,threshold: {...thresholds[key]}};
    }
    const api={classifyMetric,classify,statusClass,onAlert,resetAlerts,getThresholds,setThreshold};
    if (typeof module !== "undefined" && module.exports) module.exports=api;
    root.JARVISHealthThresholds=api;
})(typeof globalThis !== "undefined" ? globalThis : window);
