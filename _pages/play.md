---
layout: page
title: play
permalink: /play/
nav: true
nav_order: 8
description: A collection of small interactive games and quizzes.
---

<style>

  :root {
    --bg: #f5f5f5;
    --panel: #ffffff;
    --accent: #2a9d78;
    --text: #1a1a1a;
    --wrong: #d64545;
    --muted: #5a5a5a;
    --card-bg: #f0f2f1;
  }
  * { box-sizing: border-box; }

  /* --- game picker --- */
  #game-picker {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 16px;
    margin-bottom: 28px;
  }
  .game-tile {
    background: var(--card-bg);
    border: 2px solid #d5d9d7;
    border-radius: 12px;
    padding: 18px;
    cursor: pointer;
    transition: border-color 0.15s, transform 0.15s;
  }
  .game-tile:hover { border-color: var(--accent); transform: translateY(-2px); }
  .game-tile.active { border-color: var(--accent); }
  .game-tile h3 { margin: 0 0 6px 0; font-size: 1.05rem; color: var(--text); }
  .game-tile p { margin: 0; font-size: 0.85rem; color: var(--muted); }
  .game-tile .status {
    display: inline-block;
    margin-top: 8px;
    font-size: 0.75rem;
    font-weight: bold;
    padding: 2px 8px;
    border-radius: 6px;
    background: var(--accent);
    color: #fff;
  }
  .game-tile .status.soon {
    background: #d5d9d7;
    color: var(--muted);
  }

  /* --- enso quiz styles (scoped) --- */
  #enso-quiz {
    background: var(--panel);
    border-radius: 12px;
    padding: 28px;
    max-width: 900px;
    width: 100%;
    color: var(--text);
  }
  #enso-quiz h1 { font-size: 1.4rem; margin: 0 0 4px 0; color: var(--text); }
  #enso-quiz .subtitle { color: var(--muted); font-size: 0.9rem; margin-bottom: 18px; }
  #enso-quiz #progress { opacity: 0.8; font-size: 0.85rem; margin-bottom: 8px; color: var(--muted); }
  #enso-quiz .question { font-size: 1.15rem; margin-bottom: 4px; color: var(--text); }
  #enso-quiz .hint { color: var(--muted); font-size: 0.85rem; margin-bottom: 16px; }
  #enso-quiz .maps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  #enso-quiz .map-card {
    border: 2px solid #d5d9d7;
    border-radius: 10px;
    overflow: hidden;
    cursor: pointer;
    background: var(--card-bg);
    transition: border-color 0.15s, transform 0.15s;
  }
  #enso-quiz .map-card:hover { border-color: var(--accent); transform: translateY(-2px); }
  #enso-quiz .map-card.selected { border-color: var(--accent); }
  #enso-quiz .map-card.correct { border-color: var(--accent); box-shadow: 0 0 0 2px var(--accent) inset; }
  #enso-quiz .map-card.wrong { border-color: var(--wrong); box-shadow: 0 0 0 2px var(--wrong) inset; }
  #enso-quiz .map-card img { width: 100%; display: block; }
  #enso-quiz .map-label {
    text-align: center;
    font-weight: bold;
    padding: 6px;
    font-size: 1rem;
    background: var(--card-bg);
    color: var(--text);
  }
  #enso-quiz #submit, #enso-quiz #next, #enso-quiz #restart {
    padding: 10px 18px;
    border-radius: 8px;
    border: none;
    background: var(--accent);
    color: #ffffff;
    font-weight: bold;
    cursor: pointer;
    font-size: 0.95rem;
  }
  #enso-quiz #submit:disabled { opacity: 0.4; cursor: not-allowed; }
  #enso-quiz #next { display: none; margin-left: 10px; }
  #enso-quiz #feedback { margin-top: 14px; font-size: 0.95rem; min-height: 1.2em; }
  #enso-quiz #feedback.correct-text { color: var(--accent); }
  #enso-quiz #feedback.wrong-text { color: var(--wrong); }
  #enso-quiz #result { font-size: 1.15rem; color: var(--text); }

  #enso-quiz-wrap {
    display: none;
    justify-content: center;
    padding: 12px 0;
  }
  #enso-quiz-wrap.visible { display: flex; }

</style>

<div id="game-picker">
  <div class="game-tile active" id="tile-enso" onclick="showGame('enso')">
    <h3>Spot the ENSO Years</h3>
    <p>Guess El Niño and La Niña years from Australian rainfall maps.</p>
    <span class="status">Play now</span>
  </div>
</div>

<div id="enso-quiz-wrap" class="visible"><div id="enso-quiz"></div></div>

<script>
function showGame(name) {
  // placeholder for future multi-game switching logic
  document.getElementById('enso-quiz-wrap').classList.add('visible');
}
</script>
<script src="/assets/js/enso-quiz.js"></script>
