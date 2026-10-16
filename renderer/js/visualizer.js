// ==========================================
// JARVIS 4.0
// Audio Visualizer
// renderer/js/visualizer.js
// ==========================================

"use strict";

window.Visualizer = {

    canvas: null,
    ctx: null,
    animation: null,
    active: false,

    init() {

        this.canvas = document.getElementById("visualizer");

        if (!this.canvas) {
            console.warn("Visualizer canvas not found");
            return;
        }

        this.ctx = this.canvas.getContext("2d");

        this.draw();

        console.log("✅ Visualizer Initialized");
    },


    start() {

        this.active = true;

        console.log("🎤 Visualizer Started");

    },


    stop() {

        this.active = false;

        if (this.animation) {
            cancelAnimationFrame(this.animation);
        }

        if (this.ctx && this.canvas) {

            this.ctx.clearRect(
                0,
                0,
                this.canvas.width,
                this.canvas.height
            );

        }

        console.log("🛑 Visualizer Stopped");

    },


    draw() {

        if (!this.ctx) return;


        const ctx = this.ctx;
        const canvas = this.canvas;


        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );


        if (this.active) {

            const time = Date.now() / 200;


            ctx.beginPath();


            for (let x = 0; x < canvas.width; x++) {

                let y =
                    canvas.height / 2 +
                    Math.sin(x * 0.05 + time) * 20;


                ctx.lineTo(x, y);

            }


            ctx.stroke();

        }


        this.animation = requestAnimationFrame(
            () => this.draw()
        );

    }

};