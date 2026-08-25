const IMG = {
  "image1.png": "/assets/img/enso-/map-a-el-nino-1.png",
  "image2.png": "/assets/img/enso-/map-b-el-nino-1.png",
  "image3.png": "/assets/img/enso-/map-c-shared.png",
  "image4.png": "/assets/img/enso-/map-d-el-nino-1.png",
  "image5.png": "/assets/img/enso-/map-a-la-nina-1.png",
  "image6.png": "/assets/img/enso-/map-b-la-nina-1.png",
  "image7.png": "/assets/img/enso-/map-c-la-nina-strongest.png",
  "image8.png": "/assets/img/enso-/map-a-la-nina-strongest.png",
  "image9.png": "/assets/img/enso-/map-b-el-nino-strongest.png",
  "image10.png": "/assets/img/enso-/map-c-el-nino-strongest.png",
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
  if (!el) return;
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

document.addEventListener("DOMContentLoaded", renderQuiz);
if (document.readyState === "complete" || document.readyState === "interactive") {
  renderQuiz();
}
