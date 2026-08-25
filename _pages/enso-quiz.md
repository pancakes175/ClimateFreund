---
layout: page
title: ENSO quiz
permalink: /enso-quiz/
nav: true
nav_order: 8
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
  #enso-quiz {
    background: var(--panel);
    border-radius: 12px;
    padding: 28px;
    max-width: 900px;
    width: 100%;
    color: var(--text);
  }
  h1 { font-size: 1.4rem; margin: 0 0 4px 0; color: var(--text); }
  .subtitle { color: var(--muted); font-size: 0.9rem; margin-bottom: 18px; }
  #progress { opacity: 0.8; font-size: 0.85rem; margin-bottom: 8px; color: var(--muted); }
  .question { font-size: 1.15rem; margin-bottom: 4px; color: var(--text); }
  .hint { color: var(--muted); font-size: 0.85rem; margin-bottom: 16px; }
  .maps {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 14px;
    margin-bottom: 18px;
  }
  .map-card {
    border: 2px solid #d5d9d7;
    border-radius: 10px;
    overflow: hidden;
    cursor: pointer;
    background: var(--card-bg);
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
    background: var(--card-bg);
    color: var(--text);
  }
  #submit, #next, #restart {
    padding: 10px 18px;
    border-radius: 8px;
    border: none;
    background: var(--accent);
    color: #ffffff;
    font-weight: bold;
    cursor: pointer;
    font-size: 0.95rem;
  }
  #submit:disabled { opacity: 0.4; cursor: not-allowed; }
  #next { display: none; margin-left: 10px; }
  #feedback { margin-top: 14px; font-size: 0.95rem; min-height: 1.2em; }
  #feedback.correct-text { color: var(--accent); }
  #feedback.wrong-text { color: var(--wrong); }
  #result { font-size: 1.15rem; color: var(--text); }

#enso-quiz-wrap {
  display: flex;
  justify-content: center;
  padding: 12px 0;
}

</style>

<div id="enso-quiz-wrap"><div id="enso-quiz"></div></div>

<script src="/assets/js/enso-quiz.js"></script>
