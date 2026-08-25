---
layout: page
title: quiz
permalink: /quiz/
nav: true
nav_order: 7
---

<style>
  #quiz-wrap {
    --bg: #0f2027;
    --panel: #16323d;
    --accent: #4fd1a5;
    --text: #eafff4;
    --wrong: #e2665c;
    display: flex;
    justify-content: center;
    padding: 20px 0;
  }
  #quiz-wrap * { box-sizing: border-box; }
  #quiz {
    background: var(--panel);
    border-radius: 12px;
    padding: 28px;
    max-width: 480px;
    width: 100%;
    color: var(--text);
    font-family: system-ui, sans-serif;
  }
  #quiz h1 { font-size: 1.3rem; margin-top: 0; color: var(--text); }
  #quiz .question { font-size: 1.05rem; margin-bottom: 16px; }
  #quiz .options button {
    display: block;
    width: 100%;
    text-align: left;
    padding: 12px 14px;
    margin-bottom: 10px;
    border-radius: 8px;
    border: 1px solid #2a4c58;
    background: #10262e;
    color: var(--text);
    cursor: pointer;
    font-size: 0.95rem;
  }
  #quiz .options button:hover { border-color: var(--accent); }
  #quiz .options button.correct { background: var(--accent); color: #05201a; }
  #quiz .options button.wrong { background: var(--wrong); color: #fff; }
  #quiz #next {
    margin-top: 14px;
    padding: 10px 16px;
    border-radius: 8px;
    border: none;
    background: var(--accent);
    color: #05201a;
    font-weight: bold;
    cursor: pointer;
    display: none;
  }
  #quiz #result { font-size: 1.1rem; }
  #quiz #progress { opacity: 0.7; font-size: 0.85rem; margin-bottom: 8px; }
</style>

<div id="quiz-wrap">
  <div id="quiz"></div>
</div>

<script>
const questions = [
  {
    q: "Which gas is the largest contributor to human-caused global warming?",
    options: ["Carbon dioxide (CO₂)", "Oxygen (O₂)", "Nitrogen (N₂)", "Argon (Ar)"],
    correct: 0
  },
  {
    q: "What is ENSO short for?",
    options: ["Earth's Natural Storm Origin", "El Niño–Southern Oscillation", "Extreme Northern Snow Onset", "European National Storm Office"],
    correct: 1
  },
  {
    q: "Which of these best describes La Niña conditions in the tropical Pacific?",
    options: ["Warmer than average sea surface temperatures", "Cooler than average sea surface temperatures", "No change in sea surface temperatures", "Only affects the Atlantic Ocean"],
    correct: 1
  },
  {
    q: "Roughly how much has global average surface temperature risen since pre-industrial times?",
    options: ["~0.1°C", "~1.1°C", "~5°C", "~10°C"],
    correct: 1
  },
  {
    q: "Which climate archive can scientists use to reconstruct rainfall over centuries?",
    options: ["Tree rings", "Smartphone weather apps", "Satellite selfies", "Traffic cameras"],
    correct: 0
  }
];

let current = 0;
let score = 0;

function renderQuiz() {
  const el = document.getElementById("quiz");
  if (current >= questions.length) {
    el.innerHTML = `
      <h1>Quiz complete 🌍</h1>
      <p id="result">You scored ${score} / ${questions.length}</p>
      <button id="next" style="display:inline-block" onclick="restartQuiz()">Try again</button>
    `;
    return;
  }
  const item = questions[current];
  el.innerHTML = `
    <div id="progress">Question ${current + 1} / ${questions.length}</div>
    <h1>Climate Quiz</h1>
    <div class="question">${item.q}</div>
    <div class="options">
      ${item.options.map((opt, i) => `<button onclick="answerQuiz(${i})">${opt}</button>`).join("")}
    </div>
    <button id="next" onclick="nextQuizQuestion()">Next</button>
  `;
}

function answerQuiz(i) {
  const item = questions[current];
  const buttons = document.querySelectorAll("#quiz .options button");
  buttons.forEach((b, idx) => {
    b.disabled = true;
    if (idx === item.correct) b.classList.add("correct");
    else if (idx === i) b.classList.add("wrong");
  });
  if (i === item.correct) score++;
  document.getElementById("next").style.display = "inline-block";
}

function nextQuizQuestion() {
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
