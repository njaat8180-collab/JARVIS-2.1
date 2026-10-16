"use strict";

(function installJarvisLabEngine(root) {
    const MAX_EXCERPT = 900;

    function normalizedRecord(record) {
        if (!record || !(record.approvedByUser || record.verificationStatus === "verified" || record.verified === true)) return null;
        const knowledge = String(record.knowledge || record.content || record.text || "").trim();
        if (!knowledge) return null;
        return {
            id: String(record.id || `${record.source || "verified"}:${record.topic || record.title || "knowledge"}`),
            title: String(record.topic || record.title || "Knowledge experiment"),
            excerpt: knowledge.slice(0, MAX_EXCERPT),
            category: String(record.category || "general"),
            tags: Array.isArray(record.tags) ? record.tags.map(String) : [],
            sourceTitle: String(record.sourceTitle || record.source || "Local knowledge"),
            sourceUrl: String(record.sourceUrl || "")
        };
    }

    const CODE_TEMPLATES = {
        "calculator-starter": `"use strict";

const readline = require("node:readline");
const input = readline.createInterface({ input: process.stdin, output: process.stdout });

input.question("Enter a calculation (example: 12 * 3): ", (line) => {
  const match = line.trim().match(/^(-?\\d+(?:\\.\\d+)?)\\s*([+*/-])\\s*(-?\\d+(?:\\.\\d+)?)$/);
  if (!match) {
    console.log("Use two numbers and one operator: +, -, *, or /");
    input.close();
    return;
  }

  const left = Number(match[1]);
  const right = Number(match[3]);
  const operations = {
    "+": (a, b) => a + b,
    "-": (a, b) => a - b,
    "*": (a, b) => a * b,
    "/": (a, b) => b === 0 ? "Cannot divide by zero." : a / b
  };
  console.log("Result:", operations[match[2]](left, right));
  input.close();
});`,
        "number-guessing-starter": `"use strict";

const readline = require("node:readline");
const input = readline.createInterface({ input: process.stdin, output: process.stdout });
const secret = Math.floor(Math.random() * 100) + 1;
let guesses = 0;

console.log("I picked a number from 1 to 100. Try to guess it!");

function askForGuess() {
  input.question("Your guess: ", (answer) => {
    const guess = Number(answer.trim());

    if (!Number.isInteger(guess) || guess < 1 || guess > 100) {
      console.log("Enter a whole number from 1 to 100.");
      return askForGuess();
    }

    guesses += 1;
    if (guess < secret) {
      console.log("Too low — try a higher number.");
      return askForGuess();
    }
    if (guess > secret) {
      console.log("Too high — try a lower number.");
      return askForGuess();
    }

    console.log("You got it in " + guesses + " guess" + (guesses === 1 ? "" : "es") + "!");
    input.close();
  });
}

askForGuess();`,
        "racing-car-game": `"use strict";

// Runnable browser game source. The local preview is the playable build.
const canvas = document.querySelector("canvas");
const ctx = canvas.getContext("2d");
let lane = 1;
let score = 0;
let running = true;
const obstacles = [];
function reset() { score = 0; running = true; obstacles.length = 0; }
function draw() {
  ctx.fillStyle = "#101827"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#26364e"; ctx.fillRect(55, 0, 210, canvas.height);
  ctx.strokeStyle = "#8aa1bd"; ctx.setLineDash([24, 18]);
  [125, 195].forEach(x => { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); });
  ctx.setLineDash([]);
  ctx.fillStyle = "#55e6ff"; ctx.fillRect(72 + lane * 70, 360, 34, 58);
  obstacles.forEach(car => { ctx.fillStyle = "#ff6484"; ctx.fillRect(car.x, car.y, 34, 58); });
  ctx.fillStyle = "#fff"; ctx.font = "16px system-ui"; ctx.fillText("Score: " + score, 12, 24);
}
function tick() {
  if (running) {
    obstacles.forEach(car => car.y += 4);
    if (Math.random() < 0.035) obstacles.push({ x: 72 + Math.floor(Math.random() * 3) * 70, y: -60 });
    if (obstacles.some(car => car.y > 315 && car.y < 425 && car.x === 72 + lane * 70)) running = false;
    while (obstacles[0]?.y > canvas.height) { obstacles.shift(); score += 1; }
  }
  draw(); requestAnimationFrame(tick);
}
window.addEventListener("keydown", event => { if (event.key === "ArrowLeft") lane = Math.max(0, lane - 1); if (event.key === "ArrowRight") lane = Math.min(2, lane + 1); if (event.key.toLowerCase() === "r") reset(); });
tick();`
        ,"ludo-game": `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;background:#101827;color:#eef;padding:24px;text-align:center}h1{color:#64e4ff}.board{display:grid;grid-template-columns:repeat(4,64px);gap:8px;justify-content:center;margin:20px auto}.cell{height:64px;border:1px solid #3abbd6;border-radius:10px;background:#17324a;color:#fff;font-size:22px;cursor:pointer}.cell.player{background:#1d9b78}.cell.finish{background:#bb6b33}button{padding:10px 16px;border-radius:8px;border:1px solid #64e4ff;background:#12384a;color:#fff}</style></head><body><h1>Mini Ludo</h1><p id="status">Roll the dice and move your token.</p><div id="board" class="board"></div><button id="roll">Roll dice</button><script>let position=0,roll=0;const board=document.querySelector('#board'),status=document.querySelector('#status');function paint(){board.replaceChildren(...Array.from({length:16},(_,i)=>{const b=document.createElement('button');b.className='cell '+(i===position?'player':'')+(i===15?' finish':'');b.textContent=i===position?'●':i+1;b.onclick=()=>{if(i===position)status.textContent='Your token is here. Roll again.'};return b}))}document.querySelector('#roll').onclick=()=>{roll=Math.floor(Math.random()*6)+1;position=Math.min(15,position+roll);status.textContent='You rolled '+roll+'. '+(position===15?'You reached the finish!':'Token moved.');paint()};paint()</script></body></html>`,
        "chess-board": `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font:16px system-ui;background:#101827;color:#eef;padding:24px;text-align:center}h1{color:#64e4ff}.board{display:grid;grid-template-columns:repeat(8,44px);justify-content:center;margin:20px auto}.sq{width:44px;height:44px;border:0;font-size:26px;cursor:pointer}.light{background:#d7c7a7}.dark{background:#6f8d6b}.selected{outline:3px solid #64e4ff;outline-offset:-3px}</style></head><body><h1>Chess Board</h1><p id="status">Click a piece, then a square to move it locally.</p><div id="board" class="board"></div><script>const start=['♜','♞','♝','♛','♚','♝','♞','♜','♟','♟','♟','♟','♟','♟','♟','♟'];let pieces=Array(64).fill('');start.forEach((p,i)=>pieces[i]=p);start.forEach((p,i)=>pieces[56+i]=['♖','♘','♗','♕','♔','♗','♘','♖'][i]);for(let i=48;i<56;i++)pieces[i]='♙';let selected=-1;function paint(){const root=document.querySelector('#board');root.replaceChildren(...pieces.map((p,i)=>{const b=document.createElement('button');b.className='sq '+((Math.floor(i/8)+i)%2?'dark':'light')+(i===selected?' selected':'');b.textContent=p;b.onclick=()=>{if(selected<0&&p){selected=i;document.querySelector('#status').textContent='Choose a destination square.'}else if(selected>=0){pieces[i]=pieces[selected];pieces[selected]='';selected=-1;document.querySelector('#status').textContent='Local move applied.'}paint()};return b}))}paint()</script></body></html>`,
        "website-starter": `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;font:16px system-ui;color:#142033;background:#f2f7fb}header{padding:24px 8%;display:flex;justify-content:space-between;align-items:center;background:#102b46;color:#fff}nav a{color:#b9efff;margin-left:18px;text-decoration:none}.hero{padding:80px 8%;background:linear-gradient(120deg,#d9f7ff,#f8fbff)}h1{font-size:clamp(38px,7vw,72px);margin:0 0 16px;color:#102b46}.hero p{max-width:560px;line-height:1.7}.cta{padding:12px 18px;border:0;border-radius:9px;background:#13a4b8;color:#fff;cursor:pointer}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;padding:34px 8%}.card{padding:20px;background:#fff;border:1px solid #cbe0ea;border-radius:14px;box-shadow:0 8px 24px #18405c12}</style></head><body><header><strong>JARVIS STUDIO</strong><nav><a href="#work">Work</a><a href="#about">About</a></nav></header><main><section class="hero"><h1>Build something useful.</h1><p>A complete responsive landing page generated inside JARVIS Lab. Edit the HTML and preview your changes locally.</p><button class="cta" id="demo">Try the interaction</button><output id="status"></output></section><section id="work" class="cards"><article class="card"><h2>Plan</h2><p>Turn an idea into a clear first version.</p></article><article class="card"><h2>Build</h2><p>Use focused tools and test every interaction.</p></article><article class="card"><h2>Ship</h2><p>Preview locally before sharing the result.</p></article></section></main><script>document.querySelector('#demo').onclick=()=>document.querySelector('#status').textContent=' It works locally — nice!'</script></body></html>`
    };

    const CODING_PROJECTS = Object.freeze([
        { template: "calculator-starter", headline: "Make a working calculator", prompt: "Build a complete calculator and test addition, subtraction, multiplication, division, invalid input, and division by zero in the local preview." },
        { template: "number-guessing-starter", headline: "Build a number guessing game", prompt: "Play the complete number-guessing game locally, test invalid input, and use New game to start another round." },
        { template: "todo-list-starter", headline: "Build a tiny to-do list", prompt: "Use the working to-do list locally: add tasks, mark them done, remove them, and verify the UI updates." },
        { template: "quiz-starter", headline: "Create a short quiz game", prompt: "Play the complete quiz locally, answer all questions, and test the score summary and restart behavior." },
        { template: "racing-car-game", headline: "Build a racing car game", prompt: "Play the runnable racing game locally. Use the left and right arrow keys to change lanes, avoid traffic, and press R to restart after a collision." },
        { template: "ludo-game", headline: "Build a mini Ludo game", prompt: "Play the runnable local Ludo prototype: roll the dice, move the token, and reach the finish." },
        { template: "chess-board", headline: "Build a local chess board", prompt: "Use the local chess board to select pieces and apply moves. This is a playable board prototype, not an online chess server." },
        { template: "website-starter", headline: "Build a responsive website", prompt: "Open the complete responsive landing page locally and test its interaction button and navigation." },
        { template: "portfolio-website", headline: "Build a portfolio website", prompt: "Open a different complete portfolio website locally and test its call-to-action interaction." },
        { template: "event-website", headline: "Build an event website", prompt: "Open a different complete event landing page locally and test its call-to-action interaction." },
        { template: "random-website", headline: "Generate a random website", prompt: "JARVIS chooses a fresh website concept and generates a new layout, colors, copy, and interaction for the local preview." },
        { template: "password-generator-starter", headline: "Create a password generator", prompt: "A complete password generator is ready below. Inspect how it validates length and uses cryptographic randomness. The preview generates a sample only; do not reuse it for real accounts." },
        { template: "stopwatch-starter", headline: "Build a working stopwatch", prompt: "Start, pause, reset, and inspect a small stopwatch with an updating display." },
        { template: "unit-converter-starter", headline: "Make a unit converter", prompt: "Convert kilometers, miles, kilograms, pounds, Celsius, and Fahrenheit with input validation." },
        { template: "tic-tac-toe-starter", headline: "Create a Tic-Tac-Toe game", prompt: "Play X against a simple computer opponent, see wins and draws, and restart the board." },
        { template: "expense-tracker-starter", headline: "Build a mini expense tracker", prompt: "Add expenses, list entries, remove an entry, and calculate the total. Data stays in this preview only." },
        { template: "dice-roller-starter", headline: "Create a dice roller", prompt: "Roll one or more dice, see each result, and inspect the total." }
    ]);

    // Saved starter experiments from earlier versions also receive full code.
    CODE_TEMPLATES["todo-list-starter"] = `"use strict";

const readline = require("node:readline");
const input = readline.createInterface({ input: process.stdin, output: process.stdout });
const tasks = [];
console.log("Commands: add <task>, list, done <number>, remove <number>, quit");

function prompt() {
  input.question("> ", (line) => {
    const [command, ...parts] = line.trim().split(/\\s+/);
    const value = parts.join(" ");
    const index = Number(value) - 1;
    if (command === "add" && value) tasks.push({ text: value, done: false });
    else if (command === "list") tasks.forEach((task, i) => console.log((task.done ? "✓" : "○") + " " + (i + 1) + ". " + task.text));
    else if (command === "done" && tasks[index]) tasks[index].done = true;
    else if (command === "remove" && tasks[index]) tasks.splice(index, 1);
    else if (command === "quit") return input.close();
    else if (command !== "add") console.log("Unknown command or task number.");
    prompt();
  });
}
prompt();`;
    CODE_TEMPLATES["quiz-starter"] = `"use strict";

const readline = require("node:readline");
const input = readline.createInterface({ input: process.stdin, output: process.stdout });
const questions = [
  { question: "Which planet is known as the Red Planet?", answer: "mars" },
  { question: "How many sides does a hexagon have?", answer: "6" },
  { question: "What is 8 × 7?", answer: "56" }
];
let score = 0;
let index = 0;

function ask() {
  if (index >= questions.length) {
    console.log("Final score: " + score + "/" + questions.length);
    return input.close();
  }
  const current = questions[index++];
  input.question(current.question + " ", (answer) => {
    if (answer.trim().toLowerCase() === current.answer) {
      score += 1;
      console.log("Correct!");
    } else console.log("The answer was: " + current.answer);
    ask();
  });
}
ask();`;
    CODE_TEMPLATES["password-generator-starter"] = `"use strict";

const { randomInt } = require("node:crypto");
const length = Number(process.argv[2] || 20);
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";

if (!Number.isInteger(length) || length < 8 || length > 128) {
  console.error("Choose a password length from 8 to 128.");
  process.exitCode = 1;
} else {
  let password = "";
  for (let i = 0; i < length; i += 1) password += alphabet[randomInt(alphabet.length)];
  console.log(password);
}`;
    CODE_TEMPLATES["stopwatch-starter"] = `"use strict";

const readline = require("node:readline");
const input = readline.createInterface({ input: process.stdin, output: process.stdout });
let startedAt = 0;
let elapsedMs = 0;
function show() { console.log("Elapsed:", ((elapsedMs + (startedAt ? Date.now() - startedAt : 0)) / 1000).toFixed(1), "seconds"); }
console.log("Commands: start, pause, reset, status, quit");
function prompt() {
  input.question("> ", (line) => {
    const command = line.trim().toLowerCase();
    if (command === "start" && !startedAt) startedAt = Date.now();
    else if (command === "pause" && startedAt) { elapsedMs += Date.now() - startedAt; startedAt = 0; }
    else if (command === "reset") { startedAt = 0; elapsedMs = 0; }
    else if (command === "status") show();
    else if (command === "quit") return input.close();
    else if (!["start", "pause", "reset", "status"].includes(command)) console.log("Choose start, pause, reset, status, or quit.");
    show(); prompt();
  });
}
prompt();`;
    CODE_TEMPLATES["unit-converter-starter"] = `"use strict";

const readline = require("node:readline");
const input = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log("Convert with: <value> <km|mi|kg|lb|c|f> <km|mi|kg|lb|c|f>");
input.question("> ", (line) => {
  const match = line.trim().toLowerCase().match(/^(-?\\d+(?:\\.\\d+)?)\\s+(km|mi|kg|lb|c|f)\\s+(km|mi|kg|lb|c|f)$/);
  if (!match) { console.log("Example: 5 km mi, 70 f c, or 2 kg lb."); input.close(); return; }
  const value = Number(match[1]), from = match[2], to = match[3];
  const pairs = { "km-mi": n => n * .621371, "mi-km": n => n / .621371, "kg-lb": n => n * 2.20462, "lb-kg": n => n / 2.20462, "c-f": n => n * 9 / 5 + 32, "f-c": n => (n - 32) * 5 / 9 };
  const convert = pairs[from + "-" + to];
  if (from === to) console.log(value + " " + to);
  else if (!convert) console.log("Those unit types cannot be converted directly.");
  else console.log(value + " " + from + " = " + convert(value).toFixed(2) + " " + to);
  input.close();
});`;
    CODE_TEMPLATES["tic-tac-toe-starter"] = `"use strict";

const readline = require("node:readline");
const input = readline.createInterface({ input: process.stdin, output: process.stdout });
const board = Array(9).fill(" ");
const wins = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function show() { console.log("\\n" + [0,1,2].map(r => board.slice(r*3,r*3+3).map((v,c) => v || String(r*3+c+1)).join(" | ")).join("\\n---------\\n")); }
function winner(mark) { return wins.some(line => line.every(i => board[i] === mark)); }
function turn() {
  show();
  if (winner("X")) { console.log("You win!"); return input.close(); }
  if (winner("O")) { console.log("Computer wins."); return input.close(); }
  const free = board.map((v,i) => v === " " ? i : -1).filter(i => i >= 0);
  if (!free.length) { console.log("Draw!"); return input.close(); }
  input.question("Pick a square (1-9, q to quit): ", value => {
    if (value.trim().toLowerCase() === "q") return input.close();
    const index = Number(value) - 1;
    if (!Number.isInteger(index) || index < 0 || index > 8 || board[index] !== " ") { console.log("That square is not available."); return turn(); }
    board[index] = "X";
    if (!winner("X")) { const choices = board.map((v,i) => v === " " ? i : -1).filter(i => i >= 0); if (choices.length) board[choices[Math.floor(Math.random()*choices.length)]] = "O"; }
    turn();
  });
}
turn();`;
    CODE_TEMPLATES["expense-tracker-starter"] = `"use strict";

const readline = require("node:readline");
const input = readline.createInterface({ input: process.stdin, output: process.stdout });
const expenses = [];
console.log("Commands: add <amount> <note>, list, total, remove <number>, quit");
function prompt() {
  input.question("> ", line => {
    const [command, first, ...rest] = line.trim().split(/\\s+/);
    if (command === "add" && Number.isFinite(Number(first)) && Number(first) > 0) expenses.push({ amount: Number(first), note: rest.join(" ") || "Expense" });
    else if (command === "list") expenses.forEach((item,i) => console.log((i+1) + ". " + item.note + " — " + item.amount.toFixed(2)));
    else if (command === "total") console.log("Total:", expenses.reduce((sum,item) => sum + item.amount, 0).toFixed(2));
    else if (command === "remove" && expenses[Number(first)-1]) expenses.splice(Number(first)-1, 1);
    else if (command === "quit") return input.close();
    else console.log("Use add 12.50 lunch, list, total, remove 1, or quit.");
    prompt();
  });
}
prompt();`;
    CODE_TEMPLATES["dice-roller-starter"] = `"use strict";

const { randomInt } = require("node:crypto");
const count = Number(process.argv[2] || 2);
if (!Number.isInteger(count) || count < 1 || count > 20) {
  console.error("Choose 1 to 20 dice, for example: node dice.js 3");
  process.exitCode = 1;
} else {
  const rolls = Array.from({ length: count }, () => randomInt(1, 7));
  console.log("Rolls:", rolls.join(", "));
  console.log("Total:", rolls.reduce((sum, value) => sum + value, 0));
}`;
    CODE_TEMPLATES["portfolio-website"] = CODE_TEMPLATES["website-starter"]
        .replace("JARVIS STUDIO", "NOVA PORTFOLIO")
        .replace("Build something useful.", "A portfolio that feels like you.")
        .replace("Try the interaction", "View selected work");
    CODE_TEMPLATES["event-website"] = CODE_TEMPLATES["website-starter"]
        .replace("JARVIS STUDIO", "NEXT EVENT")
        .replace("Build something useful.", "Make your next event memorable.")
        .replace("Try the interaction", "Reserve a seat");

    function getCodeForExperiment(experiment) {
        if (typeof experiment?.code === "string" && experiment.code.trim()) return experiment.code;
        const template = String(experiment?.template || "");
        if (template.startsWith("random-website-")) return CODE_TEMPLATES["website-starter"] || "";
        return CODE_TEMPLATES[template] || "";
    }

    // Render a self-contained, interactive browser version of each Lab app.
    // The Lab runs this document in a sandboxed iframe (no JARVIS bridge,
    // filesystem access, or network access), never as Node code.
    function getPreviewForExperiment(experiment) {
        const htmlSource = typeof experiment?.previewHtml === "string" && experiment.previewHtml.length <= 100000
            ? experiment.previewHtml
            : typeof experiment?.code === "string" && experiment.code.length <= 100000 && /<(?:!doctype\s+html|html\b)/i.test(experiment.code)
                ? experiment.code : "";
        if (htmlSource) {
            const policy = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; media-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'">`;
            return /<head\b[^>]*>/i.test(htmlSource)
                ? htmlSource.replace(/<head\b[^>]*>/i, match => `${match}${policy}`)
                : `<!doctype html><html><head>${policy}</head><body>${htmlSource}</body></html>`;
        }
        const template = String(experiment?.template || "");
        const apps = {
            "calculator-starter": `<h1>Quick Calculator</h1><p>Enter two numbers and an operator: +, −, ×, or ÷.</p><div class="controls"><input id="expression" value="12 * 3" aria-label="Calculation"><button id="calculate" type="button">Calculate</button></div><output id="result" aria-live="polite">Result appears here</output><script>function calculate(){const m=document.querySelector('#expression').value.trim().match(/^(-?\\d+(?:\\.\\d+)?)\\s*([+*/-])\\s*(-?\\d+(?:\\.\\d+)?)$/),o=document.querySelector('#result');if(!m){o.textContent='Enter two numbers and one operator.';return}const a=Number(m[1]),b=Number(m[3]),f={'+':()=>a+b,'-':()=>a-b,'*':()=>a*b,'/':()=>b===0?'Cannot divide by zero.':a/b};o.textContent='Result: '+f[m[2]]()}document.querySelector('#calculate').addEventListener('click',calculate);document.querySelector('#expression').addEventListener('keydown',e=>{if(e.key==='Enter')calculate()})</script>`,
            "number-guessing-starter": `<h1>Number Quest</h1><p>Guess a number from 1 to 100.</p><div class="controls"><input id="number" type="number" min="1" max="100" aria-label="Your guess"><button id="guess" type="button">Guess</button></div><output id="hint" aria-live="polite">Make your first guess!</output><button id="again" type="button">New game</button><script>let answer=Math.floor(Math.random()*100)+1,tries=0;function guess(){const n=Number(document.querySelector('#number').value),o=document.querySelector('#hint');if(!Number.isInteger(n)||n<1||n>100){o.textContent='Choose a whole number from 1 to 100.';return}tries++;o.textContent=n===answer?'You got it in '+tries+' guesses!':n<answer?'Too low — try higher.':'Too high — try lower.'}document.querySelector('#guess').onclick=guess;document.querySelector('#number').addEventListener('keydown',e=>{if(e.key==='Enter')guess()});document.querySelector('#again').onclick=()=>{answer=Math.floor(Math.random()*100)+1;tries=0;document.querySelector('#hint').textContent='New number chosen. Good luck!';document.querySelector('#number').value='';document.querySelector('#number').focus()}</script>`,
            "todo-list-starter": `<h1>Task Board</h1><p>Add a task, then mark it complete.</p><form id="add"><input id="task" placeholder="What needs doing?" required><button>Add task</button></form><ul id="tasks"></ul><script>document.querySelector('#add').addEventListener('submit',e=>{e.preventDefault();const text=document.querySelector('#task').value.trim();if(!text)return;const li=document.createElement('li'),label=document.createElement('span'),done=document.createElement('button'),remove=document.createElement('button');label.textContent=text;done.textContent='Done';remove.textContent='Remove';done.onclick=()=>{label.classList.toggle('done')};remove.onclick=()=>li.remove();li.append(label,done,remove);document.querySelector('#tasks').append(li);document.querySelector('#task').value=''});</script>`,
            "quiz-starter": `<h1>Mini Quiz</h1><p id="question"></p><div id="answers"></div><output id="score">Question 1 of 3</output><script>const qs=[['Which planet is called the Red Planet?',['Mars','Venus','Jupiter'],0],['How many sides has a hexagon?',['5','6','8'],1],['What is 8 × 7?',['54','56','64'],1]];let i=0,s=0;function show(){if(i>=qs.length){document.querySelector('#question').textContent='Quiz complete!';document.querySelector('#answers').replaceChildren();document.querySelector('#score').textContent='Final score: '+s+'/'+qs.length;return}document.querySelector('#question').textContent=qs[i][0];document.querySelector('#score').textContent='Question '+(i+1)+' of '+qs.length;const a=document.querySelector('#answers');a.replaceChildren(...qs[i][1].map((x,n)=>{const b=document.createElement('button');b.textContent=x;b.onclick=()=>{if(n===qs[i][2])s++;i++;show()};return b}))}show()</script>`,
            "password-generator-starter": `<h1>Password Studio</h1><p>Generate a sample locally in this isolated preview. Do not reuse it for an account.</p><label>Length <input id="length" type="number" min="8" max="64" value="16"></label><button id="make" type="button">Generate</button><output id="password" aria-live="polite">Your sample appears here.</output><script>document.querySelector('#make').onclick=()=>{const n=Math.max(8,Math.min(64,Number(document.querySelector('#length').value)||16)),chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*',bytes=new Uint32Array(n);crypto.getRandomValues(bytes);let s='';for(let i=0;i<n;i++)s+=chars[bytes[i]%chars.length];document.querySelector('#password').textContent=s}</script>`,
            "stopwatch-starter": `<h1>Stopwatch</h1><p>Start, pause, and reset the timer.</p><output id="time" class="big-output">00:00.0</output><div class="controls"><button id="toggle" type="button">Start</button><button id="reset" type="button">Reset</button></div><script>let elapsed=0,started=0,timer=0;const out=document.querySelector('#time');function paint(){const ms=elapsed+(started?performance.now()-started:0),s=ms/1000;out.textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(Math.floor(s%60)).padStart(2,'0')+'.'+Math.floor(s%1*10)}document.querySelector('#toggle').onclick=()=>{if(started){elapsed+=performance.now()-started;started=0;clearInterval(timer);timer=0;document.querySelector('#toggle').textContent='Resume'}else{started=performance.now();document.querySelector('#toggle').textContent='Pause';timer=setInterval(paint,80)}paint()};document.querySelector('#reset').onclick=()=>{elapsed=0;started=0;clearInterval(timer);timer=0;document.querySelector('#toggle').textContent='Start';paint()};paint()</script>`,
            "unit-converter-starter": `<h1>Unit Converter</h1><p>Convert common length, weight, and temperature units.</p><div class="controls"><input id="value" type="number" value="5" aria-label="Value"><select id="from"><option>km</option><option>mi</option><option>kg</option><option>lb</option><option>c</option><option>f</option></select><span>to</span><select id="to"><option>mi</option><option>km</option><option>lb</option><option>kg</option><option>f</option><option>c</option></select><button id="convert" type="button">Convert</button></div><output id="converted" aria-live="polite">5 km = 3.11 mi</output><script>const f={ 'km-mi':n=>n*.621371,'mi-km':n=>n/.621371,'kg-lb':n=>n*2.20462,'lb-kg':n=>n/2.20462,'c-f':n=>n*9/5+32,'f-c':n=>(n-32)*5/9};document.querySelector('#convert').onclick=()=>{const n=Number(document.querySelector('#value').value),a=document.querySelector('#from').value,b=document.querySelector('#to').value,fn=f[a+'-'+b];document.querySelector('#converted').textContent=Number.isFinite(n)?a===b?n+' '+b:fn?n+' '+a+' = '+fn(n).toFixed(2)+' '+b:'These units cannot be converted directly.':'Enter a valid number.'}</script>`,
            "tic-tac-toe-starter": `<h1>Tic-Tac-Toe</h1><p id="status" aria-live="polite">Your turn — you are X.</p><div id="board" class="board"></div><button id="restart" type="button">New game</button><script>const wins=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]],board=Array(9).fill('');let over=false;function winner(mark){return wins.some(row=>row.every(i=>board[i]===mark))}function render(){const root=document.querySelector('#board');root.replaceChildren(...board.map((mark,i)=>{const b=document.createElement('button');b.type='button';b.className='square';b.textContent=mark;b.disabled=over||Boolean(mark);b.onclick=()=>play(i);return b}))}function finish(){if(winner('X')){over=true;document.querySelector('#status').textContent='You win!'}else if(winner('O')){over=true;document.querySelector('#status').textContent='Computer wins.'}else if(board.every(Boolean)){over=true;document.querySelector('#status').textContent='It is a draw.'}}function play(i){if(over||board[i])return;board[i]='X';finish();if(!over){const free=board.map((v,n)=>v?'':n).filter(v=>v!=='');if(free.length)board[free[Math.floor(Math.random()*free.length)]]='O';finish()}render()}document.querySelector('#restart').onclick=()=>{board.fill('');over=false;document.querySelector('#status').textContent='Your turn — you are X.';render()};render()</script>`,
            "expense-tracker-starter": `<h1>Mini Expense Tracker</h1><p>Track sample entries in this preview. Data is not saved after closing it.</p><div class="controls"><input id="note" placeholder="Expense name" aria-label="Expense name"><input id="amount" type="number" min="0.01" step="0.01" placeholder="Amount" aria-label="Amount"><button id="add" type="button">Add</button></div><ul id="items"></ul><output id="total" aria-live="polite">Total: 0.00</output><script>const items=[];function render(){const ul=document.querySelector('#items');ul.replaceChildren(...items.map((item,i)=>{const li=document.createElement('li'),span=document.createElement('span'),b=document.createElement('button');span.textContent=item.note+' — '+item.amount.toFixed(2);b.type='button';b.textContent='Remove';b.onclick=()=>{items.splice(i,1);render()};li.append(span,b);return li}));document.querySelector('#total').textContent='Total: '+items.reduce((sum,x)=>sum+x.amount,0).toFixed(2)}document.querySelector('#add').onclick=()=>{const note=document.querySelector('#note').value.trim()||'Expense',amount=Number(document.querySelector('#amount').value);if(!Number.isFinite(amount)||amount<=0){document.querySelector('#total').textContent='Enter an amount greater than zero.';return}items.push({note,amount});document.querySelector('#note').value='';document.querySelector('#amount').value='';render()}</script>`,
            "dice-roller-starter": `<h1>Dice Roller</h1><p>Roll between one and six standard dice.</p><div class="controls"><label>Dice <input id="dice-count" type="number" min="1" max="6" value="2"></label><button id="roll" type="button">Roll dice</button></div><div id="rolls" class="dice-list" aria-live="polite"></div><output id="dice-total">Total: —</output><script>document.querySelector('#roll').onclick=()=>{const n=Number(document.querySelector('#dice-count').value);if(!Number.isInteger(n)||n<1||n>6){document.querySelector('#dice-total').textContent='Choose 1 to 6 dice.';return}const values=Array.from({length:n},()=>Math.floor(Math.random()*6)+1);document.querySelector('#rolls').textContent=values.map(v=>'⚄ '+v).join('   ');document.querySelector('#dice-total').textContent='Total: '+values.reduce((a,b)=>a+b,0)}</script>`,
            "racing-car-game": `<h1>Neon Lane Racer</h1><p>Use ← and → to change lanes. Avoid traffic. Press R to restart.</p><canvas id="game" width="320" height="440" style="display:block;width:min(100%,320px);height:auto;border:1px solid #3abbd6;border-radius:12px;background:#101827" aria-label="Playable racing game"></canvas><button id="restart" type="button">Restart game</button><script>const c=document.querySelector('#game'),x=c.getContext('2d');let lane=1,score=0,run=true,cars=[];function reset(){lane=1;score=0;run=true;cars=[]}function draw(){x.fillStyle='#101827';x.fillRect(0,0,320,440);x.fillStyle='#26364e';x.fillRect(55,0,210,440);x.strokeStyle='#8aa1bd';x.setLineDash([24,18]);[125,195].forEach(n=>{x.beginPath();x.moveTo(n,0);x.lineTo(n,440);x.stroke()});x.setLineDash([]);x.fillStyle='#55e6ff';x.fillRect(72+lane*70,360,34,58);cars.forEach(car=>{x.fillStyle='#ff6484';x.fillRect(car.x,car.y,34,58)});x.fillStyle='#fff';x.font='16px system-ui';x.fillText('Score: '+score,12,24)}function tick(){if(run){cars.forEach(car=>car.y+=4);if(Math.random()<.035)cars.push({x:72+Math.floor(Math.random()*3)*70,y:-60});if(cars.some(car=>car.y>315&&car.y<425&&car.x===72+lane*70))run=false;while(cars[0]?.y>440){cars.shift();score++}}draw();requestAnimationFrame(tick)}addEventListener('keydown',e=>{if(e.key==='ArrowLeft')lane=Math.max(0,lane-1);if(e.key==='ArrowRight')lane=Math.min(2,lane+1);if(e.key.toLowerCase()==='r')reset()});document.querySelector('#restart').onclick=reset;tick()</script>`
        };
        if (template === "force-mass-acceleration") return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'"><style>body{font:16px system-ui;padding:28px;background:#0b1725;color:#eef}h1{color:#64e4ff}label{display:block;margin:18px 0}input{width:75%;accent-color:#42c6e4}output{display:block;color:#8ff0ff;font-size:24px}</style></head><body><h1>Force Explorer</h1><p>Adjust mass and acceleration to explore F = m × a.</p><label>Mass: <span id="mval">5</span> kg<br><input id="m" type="range" min="1" max="20" value="5"></label><label>Acceleration: <span id="aval">2</span> m/s²<br><input id="a" type="range" min="1" max="10" value="2"></label><output id="f">Force: 10 N</output><script>function update(){const m=+document.querySelector('#m').value,a=+document.querySelector('#a').value;document.querySelector('#mval').textContent=m;document.querySelector('#aval').textContent=a;document.querySelector('#f').textContent='Force: '+m*a+' N'}document.querySelectorAll('input').forEach(x=>x.oninput=update)</script></body></html>`;
        if (template === "distance-time-speed") return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'"><style>body{font:16px system-ui;padding:28px;background:#0b1725;color:#eef}h1{color:#64e4ff}label{display:block;margin:18px 0}input{padding:10px;border-radius:8px}output{display:block;color:#8ff0ff;font-size:22px;margin-top:18px}</style></head><body><h1>Speed Lab</h1><p>Change distance and time to calculate average speed.</p><label>Distance (km) <input id="d" type="number" min="0" value="12"></label><label>Time (hours) <input id="t" type="number" min="0.01" step="0.1" value="2"></label><output id="s">Speed: 6 km/h</output><script>function update(){const d=Number(document.querySelector('#d').value),t=Number(document.querySelector('#t').value);document.querySelector('#s').textContent='Speed: '+(t>0?(d/t).toFixed(2):'—')+' km/h'}document.querySelectorAll('input').forEach(x=>x.oninput=update)</script></body></html>`;
        const app = apps[template];
        if (!app && experiment?.type === "coding-challenge") {
            const title = String(experiment.topic || "JARVIS Coding Challenge").replace(/[<>&\"']/g, "");
            return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; form-action 'none'"><style>body{font:16px system-ui;padding:28px;background:#0b1725;color:#eef}h1{color:#64e4ff}code{display:block;white-space:pre-wrap;background:#07111e;border:1px solid #34536d;border-radius:10px;padding:16px;color:#b9ecff}</style></head><body><h1>${title}</h1><p>This isolated local preview is ready. The generated code is shown below as data.</p><code>${String(getCodeForExperiment(experiment) || "").replace(/[<>&\"']/g, value => ({"<":"&lt;",">":"&gt;","&":"&amp;","\"":"&quot;","'":"&#039;"}[value]))}</code></body></html>`;
        }
        if (!app) return "";
        return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'"><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;padding:clamp(18px,5vw,36px);font:16px/1.5 system-ui,Segoe UI,sans-serif;color:#eaf5ff;background:linear-gradient(145deg,#102137,#07111e)}h1{margin:0 0 8px;color:#64e4ff}p{color:#b5c9d9}.controls,form{display:flex;gap:8px;flex-wrap:wrap;align-items:center}input,select{min-width:100px;padding:12px;border-radius:9px;border:1px solid #34536d;background:#091421;color:#fff}input{flex:1}button{padding:10px 14px;border:1px solid #3abbd6;border-radius:9px;color:#eafaff;background:#12384a;cursor:pointer;margin:4px}button:hover:not(:disabled){background:#18546a}button:disabled{opacity:.5;cursor:default}output{display:block;margin-top:18px;padding:14px;border-radius:10px;background:#091421;color:#8ff0ff;overflow-wrap:anywhere}.big-output{font-size:clamp(30px,8vw,52px);font-variant-numeric:tabular-nums;text-align:center}ul{padding:0;list-style:none}li{display:flex;gap:8px;align-items:center;padding:8px;margin:8px 0;background:#091421;border-radius:8px}li span{flex:1}.done{text-decoration:line-through;opacity:.6}label{display:flex;align-items:center;gap:10px}.board{display:grid;grid-template-columns:repeat(3,minmax(60px,90px));gap:8px;margin:18px 0}.square{height:76px;font-size:32px}.dice-list{font-size:24px;color:#8ff0ff;padding:12px}</style></head><body>${app}</body></html>`;
    }

    function createStarterExperiment(_index = 0, createdAt = Date.now(), avoidTemplates = []) {
        const avoid = new Set(Array.isArray(avoidTemplates) ? avoidTemplates.map(String) : []);
        const freshProjects = CODING_PROJECTS.filter(project => !avoid.has(String(project.template)));
        const lastTemplate = Array.isArray(avoidTemplates) && avoidTemplates.length ? String(avoidTemplates[avoidTemplates.length - 1]) : "";
        const noImmediateRepeat = freshProjects.filter(project => String(project.template) !== lastTemplate);
        const pool = noImmediateRepeat.length ? noImmediateRepeat : (freshProjects.length ? freshProjects : CODING_PROJECTS);
        const starter = pool[Math.floor(Math.random() * pool.length)];
        const randomSeed = Math.floor(Math.random() * 0x7fffffff);
        const experiment = {
            id: `lab-starter-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
            createdAt,
            type: "coding-challenge",
            randomTask: true,
            randomSeed,
            ...starter,
            prompt: `${starter.prompt} This built-in exercise does not claim to come from saved knowledge.`,
            source: { title: "Built-in Lab prompt", excerpt: "A safe starter exercise included with JARVIS Lab.", sourceUrl: "" },
            reflection: ""
        };
        if (starter.template === "random-website") {
            const names = ["Orbit Studio", "Greenlight Market", "Quiet Hours", "Pixel Pantry", "Northstar Club", "Kindred Coffee", "Signal Notes", "Trail Finder"];
            const colors = ["#19b5a5", "#f26b5b", "#7c6cff", "#efad4d", "#32a7e2", "#d45792"];
            const name = names[randomSeed % names.length];
            const accent = colors[(randomSeed >> 3) % colors.length];
            const tagline = ["Make space for better ideas.", "Small tools for a brighter day.", "Find your next useful thing.", "Turn a good plan into momentum."][randomSeed % 4];
            const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#f7fbff;color:#152236;font:16px/1.6 system-ui,Segoe UI,sans-serif}header{padding:22px 8%;display:flex;justify-content:space-between;border-bottom:1px solid #d8e4ea}nav a{margin-left:18px;color:#152236;text-decoration:none}.hero{padding:78px 8%;background:linear-gradient(135deg,#f7fbff,#fff)}h1{max-width:720px;font-size:clamp(40px,8vw,76px);line-height:1.02;margin:0 0 18px}.eyebrow{color:${accent};font-weight:700;letter-spacing:1.5px;text-transform:uppercase}.hero p{max-width:580px;color:#4c5f73;font-size:19px}.cta{padding:13px 20px;border:0;border-radius:9px;background:${accent};color:#fff;font-weight:700;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:16px;padding:20px 8% 54px}.card{background:#fff;padding:22px;border:1px solid #dbe5ea;border-radius:16px;box-shadow:0 8px 24px #19324c14}</style></head><body><header><strong>${name}</strong><nav><a href="#ideas">Ideas</a><a href="#about">About</a></nav></header><main><section class="hero"><div class="eyebrow">JARVIS LAB / RANDOM BUILD</div><h1>${tagline}</h1><p>${name} is a freshly generated local website concept with its own layout, color accent, copy, and interaction.</p><button class="cta" id="action">Try the interaction</button><span id="status" role="status"></span></section><section id="ideas" class="grid"><article class="card"><strong>01</strong><h2>Discover</h2><p>Start with a clear question and a small experiment.</p></article><article class="card"><strong>02</strong><h2>Shape</h2><p>Turn the idea into a flow people can understand.</p></article><article class="card"><strong>03</strong><h2>Share</h2><p>Preview the result locally before publishing.</p></article></section></main><script>document.querySelector('#action').onclick=function(){document.querySelector('#status').textContent=' It works locally — concept confirmed.'}</script></body></html>`;
            experiment.template = `random-website-${randomSeed}`;
            experiment.headline = `Random website: ${name}`;
            experiment.prompt = "This website was generated fresh for this run. Test the button, navigation, responsive layout, and inspect the complete HTML/CSS/JavaScript source.";
            experiment.code = html;
            experiment.previewHtml = html;
        }
        return experiment;
    }

    function createExperiment(record, createdAt = Date.now()) {
        const source = normalizedRecord(record);
        if (!source) return null;
        const haystack = `${source.category} ${source.tags.join(" ")} ${source.title} ${source.excerpt}`.toLowerCase();
        let type = "reflection";
        let headline = "Turn this into a testable question";
        let prompt = "Write one prediction that could be checked, then compare it with the saved note.";
        let template = "reflection";

        if (/\b(code|coding|program|algorithm|javascript|python|software)\b/.test(haystack)) {
            const project = CODING_PROJECTS[Math.floor(Math.random() * CODING_PROJECTS.length)];
            type = "coding-challenge";
            headline = project.headline;
            prompt = project.prompt;
            template = project.template;
        } else if (/\b(force|mass|acceleration|newton)\b/.test(haystack)) {
            type = "formula-exploration";
            headline = "Explore the relationship F = m × a";
            prompt = "For a thought experiment, double mass while keeping acceleration constant. Predict how force changes, then explain your reasoning from the source note.";
            template = "force-mass-acceleration";
        } else if (/\b(speed|velocity|distance|time)\b/.test(haystack)) {
            type = "formula-exploration";
            headline = "Explore speed = distance ÷ time";
            prompt = "Keep distance fixed and double the travel time. Predict how average speed changes, then compare with the source note.";
            template = "distance-time-speed";
        }

        return {
            id: `lab-${createdAt}-${Math.random().toString(36).slice(2, 8)}`,
            createdAt,
            type,
            headline,
            prompt,
            template,
            source,
            reflection: ""
        };
    }

    root.JARVISLabEngine = Object.freeze({ createExperiment, createStarterExperiment, normalizedRecord, getCodeForExperiment, getPreviewForExperiment });
})(typeof window !== "undefined" ? window : globalThis);
