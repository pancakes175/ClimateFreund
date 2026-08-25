---
layout: page
title: enso quiz
permalink: /enso-quiz/
nav: true
nav_order: 8
---

<style>

  :root {
    --bg: #0f2027;
    --panel: #16323d;
    --accent: #4fd1a5;
    --text: #eafff4;
    --wrong: #e2665c;
    --muted: #7fa6a0;
  }
  * { box-sizing: border-box; }
  #enso-quiz {
    background: var(--panel);
    border-radius: 12px;
    padding: 28px;
    max-width: 900px;
    width: 100%;
  }
  h1 { font-size: 1.4rem; margin: 0 0 4px 0; }
  .subtitle { color: var(--muted); font-size: 0.9rem; margin-bottom: 18px; }
  #progress { opacity: 0.7; font-size: 0.85rem; margin-bottom: 8px; }
  .question { font-size: 1.15rem; margin-bottom: 4px; }
  .hint { color: var(--muted); font-size: 0.85rem; margin-bottom: 16px; }
  .maps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .map-card {
    border: 2px solid #2a4c58;
    border-radius: 10px;
    overflow: hidden;
    cursor: pointer;
    background: #0c1e24;
    transition: border-color 0.15s, transform 0.15s;
  }
  .map-card:hover { border-color: var(--accent); transform: translateY(-2px); }
  .map-card.selected { border-color: var(--accent); }
  .map-card.correct { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent) inset; }
  .map-card.wrong { border-color: var(--wrong); box-shadow: 0 0 0 2px var(--wrong) inset; }
  .map-card img { width: 100%; display: block; }
  .map-label {
    text-align: center;
    font-weight: bold;
    padding: 6px;
    font-size: 1rem;
    background: #0c1e24;
  }
  #submit, #next, #restart {
    padding: 10px 18px;
    border-radius: 8px;
    border: none;
    background: var(--accent);
    color: #05201a;
    font-weight: bold;
    cursor: pointer;
    font-size: 0.95rem;
  }
  #submit:disabled { opacity: 0.4; cursor: not-allowed; }
  #next { display: none; margin-left: 10px; }
  #feedback { margin-top: 14px; font-size: 0.95rem; min-height: 1.2em; }
  #feedback.correct-text { color: var(--accent); }
  #feedback.wrong-text { color: var(--wrong); }
  #result { font-size: 1.15rem; }

#enso-quiz-wrap {
  display: flex;
  justify-content: center;
  padding: 12px 0;
}

</style>

<div id="enso-quiz-wrap"><div id="enso-quiz"></div></div>

<script>
const IMG = {
  "image1.png": "/assets/img/enso-quiz/map-a-el-nino-1.png",
  "image2.png": "/assets/img/enso-quiz/map-b-el-nino-1.png",
  "image3.png": "/assets/img/enso-quiz/map-c-shared.png",
  "image4.png": "/assets/img/enso-quiz/map-d-el-nino-1.png",
  "image5.png": "/assets/img/enso-quiz/map-a-la-nina-1.png",
  "image6.png": "/assets/img/enso-quiz/map-b-la-nina-1.png",
  "image7.png": "/assets/img/enso-quiz/map-c-la-nina-strongest.png",
  "image8.png": "/assets/img/enso-quiz/map-a-la-nina-strongest.png",
  "image9.png": "/assets/img/enso-quiz/map-b-el-nino-strongest.png",
  "image10.png": "/assets/img/enso-quiz/map-c-el-nino-strongest.png",
};

const questions = [
  {
    q: "Which ones are the El Niño years?",
    hint: "Select all that apply",
    multi: true,
    options: [
      { label: "A", img: "image1.png" },
      { label: "B", img: "image2.png" },
      { label: "C", img: "image3.png" },
      { label: "D", img: "image4.png" }
    ],
    correct: [0, 1, 3]
  },
  {
    q: "Which ones are the La Niña years?",
    hint: "Select all that apply",
    multi: true,
    options: [
      { label: "A", img: "image5.png" },
      { label: "B", img: "image6.png" },
      { label: "C", img: "image3.png" }
    ],
    correct: [0, 1, 2]
  },
  {
    q: "Which La Niña was the strongest?",
    hint: "Select one",
    multi: false,
    options: [
      { label: "A", img: "image8.png" },
      { label: "B", img: "image3.png" },
      { label: "C", img: "image7.png" }
    ],
    correct: [0]
  },
  {
    q: "Which El Niño was the strongest?",
    hint: "Select one",
    multi: false,
    options: [
      { label: "A", img: "image1.png" },
      { label: "B", img: "image9.png" },
      { label: "C", img: "image10.png" }
    ],
    correct: [1]
  }
];

let current = 0;
let score = 0;
let selected = [];
let answered = false;

function renderQuiz() {
  const el = document.getElementById("enso-quiz");
  if (current >= questions.length) {
    el.innerHTML = `
      <h1>Quiz complete 🌏</h1>
      <p id="result">You scored ${score} / ${questions.length}</p>
      <button id="restart" onclick="restartQuiz()">Try again</button>
    `;
    return;
  }
  const item = questions[current];
  selected = [];
  answered = false;

  el.innerHTML = `
    <div id="progress">Question ${current + 1} / ${questions.length}</div>
    <h1>Spot the ENSO Years</h1>
    <div class="subtitle">Australian rainfall decile maps — Bureau of Meteorology</div>
    <div class="question">${item.q}</div>
    <div class="hint">${item.hint}</div>
    <div class="maps">
      ${item.options.map((opt, i) => `
        <div class="map-card" id="card-${i}" onclick="toggleOption(${i})">
          <img src="${IMG[opt.img]}" alt="Map ${opt.label}">
          <div class="map-label">${opt.label}</div>
        </div>
      `).join("")}
    </div>
    <button id="submit" onclick="submitAnswer()" disabled>Submit</button>
    <button id="next" onclick="nextQuestion()">Next</button>
    <div id="feedback"></div>
  `;
}

function toggleOption(i) {
  if (answered) return;
  const item = questions[current];
  const card = document.getElementById(`card-${i}`);
  if (!item.multi) {
    selected.forEach(idx => document.getElementById(`card-${idx}`).classList.remove("selected"));
    selected = [i];
    card.classList.add("selected");
  } else {
    const pos = selected.indexOf(i);
    if (pos >= 0) {
      selected.splice(pos, 1);
      card.classList.remove("selected");
    } else {
      selected.push(i);
      card.classList.add("selected");
    }
  }
  document.getElementById("submit").disabled = selected.length === 0;
}

function submitAnswer() {
  if (answered) return;
  answered = true;
  const item = questions[current];
  const correctSet = new Set(item.correct);
  const selectedSet = new Set(selected);
  const isCorrect = correctSet.size === selectedSet.size &&
    [...correctSet].every(x => selectedSet.has(x));

  item.options.forEach((opt, i) => {
    const card = document.getElementById(`card-${i}`);
    card.classList.remove("selected");
    if (correctSet.has(i)) card.classList.add("correct");
    else if (selectedSet.has(i)) card.classList.add("wrong");
  });

  const feedback = document.getElementById("feedback");
  if (isCorrect) {
    score++;
    feedback.textContent = "Correct!";
    feedback.className = "correct-text";
  } else {
    feedback.textContent = "Not quite — correct answer(s) highlighted in green.";
    feedback.className = "wrong-text";
  }

  document.getElementById("submit").style.display = "none";
  document.getElementById("next").style.display = "inline-block";
}

function nextQuestion() {
  current++;
  renderQuiz();
}

function restartQuiz() {
  current = 0;
  score = 0;
  renderQuiz();
}

renderQuiz();
</script>
