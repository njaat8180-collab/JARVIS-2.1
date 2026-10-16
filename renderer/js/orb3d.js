"use strict";

/**
 * ============================================================
 * J.A.R.V.I.S — 3D ENERGY CORE (Holographic Reactor)
 * ============================================================
 * Canvas-rendered futuristic energy core / digital sun that
 * replaces the old flat CSS 2D orb. Rendered with layered
 * 2D-canvas pseudo-3D (projected orbits, tilted ellipse rings,
 * volumetric gradient glow, plasma surface movement) — no
 * Three.js / WebGL dependency, smooth 60 FPS on normal desktop
 * hardware.
 *
 * Visual structure (inside .orb-container):
 *   - atmospheric halo (pulsing, expands/contracts)
 *   - soft light rays (slow rotation)
 *   - outer energy field (wavy plasma ring band)
 *   - rotating energy rings (3 tilted rings, different speeds)
 *   - orbiting energy particles (3D-projected, depth faded)
 *   - translucent shell + fresnel rim
 *   - central glowing energy sphere with plasma surface
 *   - bright pulsing nucleus
 *
 * State machine (driven by voice.js):
 *   idle | listening | thinking | speaking | error
 *   — states smoothly cross-fade (parameters are lerped).
 *
 * Public API (kept backward-compatible with the old orb3d):
 *   window.JarvisOrb3D  — legacy alias
 *   window.JarvisCore3D — canonical
 *     .setState(state)
 *     .setListening(bool) .setThinking(bool) .setSpeaking(bool)
 *     .setError(bool)
 *     .setZoom(z) .reset()
 *
 * Mouse: drag to rotate, wheel to zoom (same as before).
 * ============================================================
 */

(function () {

    const CONTAINER_SELECTOR = ".orb-container";

    /* ---------------- state parameters ---------------- */

    const STATES = {
        idle: {
            glow: 0.55, halo: 0.45, spin: 0.35, plasma: 0.4,
            particleSpeed: 0.35, particleCount: 12,
            pulseAmp: 0.010, pulseHz: 0.25, ringAlpha: 0.55,
            rayAlpha: 0.05, tint: [56, 220, 255]
        },
        listening: {
            glow: 1.0, halo: 0.8, spin: 0.7, plasma: 0.8,
            particleSpeed: 1.0, particleCount: 20,
            pulseAmp: 0.030, pulseHz: 0.9, ringAlpha: 0.85,
            rayAlpha: 0.10, tint: [125, 227, 255]
        },
        thinking: {
            glow: 0.9, halo: 0.75, spin: 2.0, plasma: 1.9,
            particleSpeed: 1.6, particleCount: 18,
            pulseAmp: 0.022, pulseHz: 1.6, ringAlpha: 0.8,
            rayAlpha: 0.12, tint: [56, 220, 255]
        },
        speaking: {
            glow: 1.0, halo: 0.85, spin: 0.6, plasma: 1.0,
            particleSpeed: 1.2, particleCount: 20,
            pulseAmp: 0.075, pulseHz: 3.2, ringAlpha: 0.9,
            rayAlpha: 0.12, tint: [157, 243, 255]
        },
        error: {
            glow: 0.9, halo: 0.7, spin: 0.5, plasma: 0.5,
            particleSpeed: 0.5, particleCount: 12,
            pulseAmp: 0.05, pulseHz: 1.2, ringAlpha: 0.7,
            rayAlpha: 0.08, tint: [255, 94, 71]
        }
    };

    /* ---------------- internals ---------------- */

    let canvas = null;
    let ctx = null;
    let container = null;
    let width = 220;
    let height = 220;
    let dpr = 1;

    let stateName = "idle";
    // current (lerped) parameters
    let P = { ...STATES.idle };

    let time = 0;                 // seconds
    let lastFrame = 0;
    let rafId = null;
    let running = false;

    // camera (mouse)
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let rotX = -0.35;              // radians
    let rotY = 0;
    let velX = 0;
    let velY = 0.06;               // gentle auto-spin
    let zoom = 1;
    let zoomTarget = 1;

    // particles
    const particles = [];
    const MAX_PARTICLES = 24;
    for (let i = 0; i < MAX_PARTICLES; i++) {
        particles.push({
            orbit: 0.62 + Math.random() * 0.46,   // relative orbit radius
            theta: Math.random() * Math.PI * 2,    // position on orbit
            speed: 0.35 + Math.random() * 0.5,    // angular speed factor
            inc: (Math.random() * 0.9 + 0.25),     // orbit inclination
            size: 1.2 + Math.random() * 1.8
        });
    }

    // plasma blobs (surface movement on the sphere)
    const blobs = [
        { r: 0.42, theta: 0, speed: 0.55, size: 0.34 },
        { r: 0.42, theta: 2.1, speed: -0.4, size: 0.28 },
        { r: 0.42, theta: 4.2, speed: 0.8, size: 0.22 }
    ];

    // adaptive quality
    let slowFrames = 0;
    let quality = 1;               // 1 = full, 0.5 = reduced

    /* ---------------- helpers ---------------- */

    function lerp(a, b, t) { return a + (b - a) * t; }

    function rgba(rgb, a) {
        return `rgba(${rgb[0] | 0}, ${rgb[1] | 0}, ${rgb[2] | 0}, ${a})`;
    }

    function mixRGB(c1, c2, t) {
        return [
            lerp(c1[0], c2[0], t),
            lerp(c1[1], c2[1], t),
            lerp(c1[2], c2[2], t)
        ];
    }

    // Rotate a 3D point by global rotY (around Y) then rotX (around X).
    function project(x, y, z, cx, cy, scale) {
        // rotY
        const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
        let x1 = x * cosY - z * sinY;
        let z1 = x * sinY + z * cosY;
        // rotX
        const cosX = Math.cos(rotX), sinX = Math.sin(rotX);
        let y1 = y * cosX - z1 * sinX;
        let z2 = y * sinX + z1 * cosX;
        // perspective
        const persp = 1.6 / (1.6 + z2);
        return {
            x: cx + x1 * scale * persp,
            y: cy + y1 * scale * persp,
            z: z2,
            persp
        };
    }

    /* ---------------- build / init ---------------- */

    function build() {
        container = document.querySelector(CONTAINER_SELECTOR);
        if (!container) return false;

        container.innerHTML = `
            <div class="orb-stage3d" id="orbStage3d">
                <canvas id="orbCanvas3d"></canvas>
            </div>
        `;

        canvas = document.getElementById("orbCanvas3d");
        ctx = canvas.getContext("2d");
        const stage = document.getElementById("orbStage3d");

        // ---- mouse interaction (kept from the old orb) ----
        stage.style.cursor = "grab";
        stage.addEventListener("mousedown", (e) => {
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            stage.style.cursor = "grabbing";
            e.preventDefault();
        });
        window.addEventListener("mousemove", (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            velY = dx * 0.004;
            velX = dy * 0.004;
            rotY += dx * 0.006;
            rotX = Math.max(-1.2, Math.min(1.2, rotX + dy * 0.006));
            startX = e.clientX;
            startY = e.clientY;
        });
        window.addEventListener("mouseup", () => {
            isDragging = false;
            stage.style.cursor = "grab";
        });
        stage.addEventListener("wheel", (e) => {
            e.preventDefault();
            zoomTarget = Math.max(0.6, Math.min(1.8, zoomTarget + (e.deltaY < 0 ? 0.08 : -0.08)));
        }, { passive: false });
        stage.addEventListener("touchstart", (e) => {
            if (e.touches.length === 1) {
                isDragging = true;
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }
        }, { passive: true });
        window.addEventListener("touchmove", (e) => {
            if (!isDragging || !e.touches.length) return;
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            rotY += dx * 0.006;
            rotX = Math.max(-1.2, Math.min(1.2, rotX + dy * 0.006));
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }, { passive: true });
        window.addEventListener("touchend", () => { isDragging = false; });

        resize();
        if (typeof window.ResizeObserver === "function") {
            new ResizeObserver(resize).observe(container);
        } else {
            window.addEventListener("resize", resize);
        }

        // pause when tab hidden — free performance
        document.addEventListener("visibilitychange", () => {
            if (document.hidden) {
                stop();
            } else {
                start();
            }
        });

        return true;
    }

    function resize() {
        if (!container || !canvas) return;
        const rect = container.getBoundingClientRect();
        width = Math.max(120, Math.round(rect.width || 220));
        height = Math.max(120, Math.round(rect.height || 220));
        dpr = Math.min(window.devicePixelRatio || 1, 2) * quality;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = width + "px";
        canvas.style.height = height + "px";
    }

    /* ---------------- render layers ---------------- */

    function drawHalo(cx, cy, R, t) {
        const breathe = 1 + Math.sin(t * 1.1) * 0.04 * (P.halo + 0.4);
        const r = R * 1.75 * breathe;
        const g = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, r);
        g.addColorStop(0, rgba(P.tint, 0.16 * P.halo));
        g.addColorStop(0.45, rgba(P.tint, 0.07 * P.halo));
        g.addColorStop(1, rgba(P.tint, 0));
        ctx.fillStyle = g;
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    function drawRays(cx, cy, R, t) {
        const count = 12;
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.translate(cx, cy);
        ctx.rotate(t * 0.05);
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            const len = R * (1.5 + 0.35 * Math.sin(t * 0.7 + i * 1.7));
            const g = ctx.createLinearGradient(
                Math.cos(a) * R * 0.9, Math.sin(a) * R * 0.9,
                Math.cos(a) * len, Math.sin(a) * len
            );
            g.addColorStop(0, rgba(P.tint, P.rayAlpha));
            g.addColorStop(1, rgba(P.tint, 0));
            ctx.strokeStyle = g;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92);
            ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawOuterField(cx, cy, R, t) {
        // wavy plasma ring band — an outer energy boundary
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.beginPath();
        const steps = 90;
        for (let i = 0; i <= steps; i++) {
            const a = (i / steps) * Math.PI * 2;
            const wob =
                Math.sin(a * 5 + t * 1.3) * 0.030 +
                Math.sin(a * 8 - t * 0.9) * 0.015;
            const r = R * (1.24 + wob);
            const x = cx + Math.cos(a) * r;
            const y = cy + Math.sin(a) * r * 0.985;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = rgba(P.tint, 0.10 + 0.08 * P.glow);
        ctx.lineWidth = R * 0.10;
        ctx.stroke();
        ctx.strokeStyle = rgba(P.tint, 0.16 + 0.10 * P.glow);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.restore();
    }

    function drawRing(cx, cy, R, t, idx) {
        // 3D tilted ellipse ring, rotating with the global camera.
        // Segmented arcs (alternating opacity) give the tech feel while
        // remaining one continuous circle path.
        const radii = [0.86, 1.02, 1.14];
        const incs = [0.32, 0.86, 0.55];
        const speeds = [0.9, -0.6, 0.45];
        const rBase = R * radii[idx];
        const inc = incs[idx];
        const spin = t * speeds[idx] * P.spin;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        const segments = 36;
        for (let s = 0; s < segments; s++) {
            const a0 = (s / segments) * Math.PI * 2 + spin;
            const a1 = ((s + 0.62) / segments) * Math.PI * 2 + spin; // gaps
            const depth = Math.sin(a0) ; // -1..1 (behind/front)
            const alpha = (0.10 + 0.30 * (0.5 + depth * 0.5)) * P.ringAlpha;

            ctx.beginPath();
            for (let k = 0; k <= 6; k++) {
                const a = a0 + ((a1 - a0) * k) / 6;
                // circle in ring plane
                const x = Math.cos(a) * rBase;
                const z = Math.sin(a) * rBase;
                const y = Math.sin(a) * rBase * inc * Math.sin(inc + spin * 0.3);
                const p = project(x, y, z, cx, cy, 1);
                if (k === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
            }
            ctx.strokeStyle = rgba(P.tint, alpha);
            ctx.lineWidth = idx === 0 ? 2.2 : 1.4;
            ctx.stroke();
        }
        ctx.restore();
    }

    function drawParticles(cx, cy, R, t) {
        const count = Math.round(P.particleCount);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        for (let i = 0; i < count; i++) {
            const p = particles[i % particles.length];
            p.theta += 0.016 * p.speed * P.particleSpeed;
            const or = R * p.orbit;
            const x = Math.cos(p.theta) * or;
            const z = Math.sin(p.theta) * or;
            const y = Math.sin(p.theta * 1.0 + p.inc * 3) * or * p.inc * 0.35;
            const pt = project(x, y, z, cx, cy, 1);
            const depth = 0.5 + pt.z / (R * 1.6);   // 0..1
            const alpha = Math.max(0.05, 0.75 * depth) * (0.5 + 0.5 * P.glow);
            const size = p.size * (0.6 + depth * 0.8);

            ctx.fillStyle = rgba(P.tint, alpha);
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
            ctx.fill();

            // small glow
            const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, size * 4);
            g.addColorStop(0, rgba(P.tint, alpha * 0.5));
            g.addColorStop(1, rgba(P.tint, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, size * 4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    function drawSphere(cx, cy, R, t) {
        const pulse = 1 + Math.sin(t * Math.PI * 2 * P.pulseHz) * P.pulseAmp;
        const r = R * 0.52 * pulse;

        // ---- translucent outer shell ----
        const shell = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.2, cx, cy, r * 1.12);
        shell.addColorStop(0, rgba(P.tint, 0.10));
        shell.addColorStop(0.8, rgba(P.tint, 0.05));
        shell.addColorStop(1, rgba(P.tint, 0.0));
        ctx.fillStyle = shell;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 1.12, 0, Math.PI * 2);
        ctx.fill();

        // ---- main sphere body ----
        const body = ctx.createRadialGradient(
            cx - r * 0.35, cy - r * 0.4, r * 0.05,
            cx, cy, r
        );
        body.addColorStop(0, "#ffffff");
        body.addColorStop(0.25, rgba(mixRGB(P.tint, [255, 255, 255], 0.35), 0.95));
        body.addColorStop(0.65, rgba(P.tint, 0.85));
        body.addColorStop(1, rgba(mixRGB(P.tint, [8, 26, 46], 0.55), 0.95));
        ctx.fillStyle = body;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // ---- plasma surface movement (clipped to sphere) ----
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.985, 0, Math.PI * 2);
        ctx.clip();
        ctx.globalCompositeOperation = "lighter";
        for (const b of blobs) {
            b.theta += 0.02 * b.speed * P.plasma;
            const bx = cx + Math.cos(b.theta + rotY) * r * 0.55;
            const by = cy + Math.sin(b.theta * 1.3 + rotX) * r * 0.45;
            const br = r * b.size * (0.85 + 0.25 * Math.sin(t * 1.7 + b.theta));
            const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
            g.addColorStop(0, rgba(mixRGB(P.tint, [255, 255, 255], 0.4), 0.16 * P.plasma));
            g.addColorStop(1, rgba(P.tint, 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fill();
        }

        // dark plasma currents (subtractive swirl)
        ctx.globalCompositeOperation = "source-over";
        for (let i = 0; i < 2; i++) {
            const a = t * 0.35 * (i ? -1 : 1) + i * 2.4;
            const bx = cx + Math.cos(a) * r * 0.4;
            const by = cy + Math.sin(a * 1.2) * r * 0.35;
            const br = r * 0.3;
            const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
            g.addColorStop(0, "rgba(4, 20, 38, 0.20)");
            g.addColorStop(1, "rgba(4, 20, 38, 0)");
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        // ---- fresnel rim light ----
        const rim = ctx.createRadialGradient(cx, cy, r * 0.82, cx, cy, r);
        rim.addColorStop(0, rgba(P.tint, 0));
        rim.addColorStop(0.85, rgba(P.tint, 0.12));
        rim.addColorStop(1, rgba(mixRGB(P.tint, [255, 255, 255], 0.5), 0.45));
        ctx.fillStyle = rim;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();

        // ---- bright nucleus ----
        const nucleus = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 0.42);
        nucleus.addColorStop(0, `rgba(255, 255, 255, ${0.55 + 0.25 * P.glow})`);
        nucleus.addColorStop(0.4, rgba(mixRGB(P.tint, [255, 255, 255], 0.55), 0.55));
        nucleus.addColorStop(1, rgba(P.tint, 0));
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = nucleus;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.42, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    /* ---------------- frame loop ---------------- */

    function frame(ts) {
        if (!running) return;
        if (!lastFrame) lastFrame = ts;
        const dt = Math.min(0.05, (ts - lastFrame) / 1000);
        lastFrame = ts;
        time += dt;

        // adaptive quality: if consistently slow, drop DPR once
        if (dt > 0.028) { slowFrames++; } else { slowFrames = Math.max(0, slowFrames - 1); }
        if (slowFrames > 60 && quality > 0.5) {
            quality = 0.5;
            resize();
            slowFrames = 0;
        }

        // lerp parameters toward the target state (smooth transitions)
        const target = STATES[stateName] || STATES.idle;
        const k = 1 - Math.pow(0.001, dt); // ~time-constant lerp
        for (const key of Object.keys(target)) {
            if (key === "tint") {
                P.tint = mixRGB(P.tint, target.tint, k);
            } else {
                P[key] = lerp(P[key], target[key], k);
            }
        }

        // camera inertia
        if (!isDragging) {
            velY += (0.06 - velY) * 0.02;
            velX *= 0.95;
            rotY += velY * dt * 3;
            rotX = Math.max(-1.2, Math.min(1.2, rotX + velX * dt * 3));
        }
        zoom += (zoomTarget - zoom) * 0.12;

        // ---- draw ----
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        const cx = width / 2;
        const cy = height / 2;
        const R = (Math.min(width, height) / 2) * 0.82 * zoom;

        drawHalo(cx, cy, R, time);
        drawRays(cx, cy, R, time);
        drawOuterField(cx, cy, R, time);
        drawSphere(cx, cy, R, time);
        drawRing(cx, cy, R, time, 0);
        drawRing(cx, cy, R, time, 1);
        drawParticles(cx, cy, R, time);
        drawRing(cx, cy, R, time, 2);

        rafId = requestAnimationFrame(frame);
    }

    function start() {
        if (running) return;
        running = true;
        lastFrame = 0;
        rafId = requestAnimationFrame(frame);
    }

    function stop() {
        running = false;
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
    }

    /* ---------------- public API ---------------- */

    function setState(next) {
        const s = String(next || "idle").toLowerCase();
        if (!STATES[s]) return false;
        stateName = s;
        return true;
    }

    const api = {
        setState,
        setListening(active) { setState(active ? "listening" : "idle"); },
        setThinking(active) { setState(active ? "thinking" : "idle"); },
        setSpeaking(active) { setState(active ? "speaking" : "idle"); },
        setError(active) { setState(active ? "error" : "idle"); },
        getState() { return stateName; },
        setZoom(z) {
            zoomTarget = Math.max(0.6, Math.min(1.8, Number(z) || 1));
        },
        reset() {
            rotX = -0.35;
            rotY = 0;
            velX = 0;
            velY = 0.06;
            zoomTarget = 1;
            setState("idle");
        },
        // expose for diagnostics
        _start: start,
        _stop: stop
    };

    window.JarvisCore3D = api;
    window.JarvisOrb3D = api;   // legacy alias (old voice.js calls)

    /* ---------------- boot ---------------- */

    function init() {
        if (!build()) return;
        start();
        console.log("🔵 [CORE] 3D energy core initialized (state: idle)");
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }

})();
