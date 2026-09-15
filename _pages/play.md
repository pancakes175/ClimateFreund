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

  /* --- ocean drift game (scoped) --- */
  #ocean-drift {
    background: var(--panel);
    border-radius: 12px;
    padding: 28px;
    max-width: 900px;
    width: 100%;
    color: var(--text);
  }
  #ocean-drift .od-tabs {
    display: flex;
    gap: 10px;
    margin-bottom: 18px;
  }
  #ocean-drift .od-tab {
    padding: 8px 16px;
    border-radius: 8px;
    border: 2px solid #d5d9d7;
    background: var(--card-bg);
    color: var(--text);
    font-weight: bold;
    cursor: pointer;
    font-size: 0.9rem;
  }
  #ocean-drift .od-tab.active {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;
  }
  #ocean-drift .od-title { font-size: 1.4rem; margin: 0 0 2px 0; }
  #ocean-drift .od-subtitle { color: var(--muted); font-size: 0.9rem; margin-bottom: 14px; }
  #ocean-drift .od-intro {
    font-size: 0.92rem;
    background: var(--card-bg);
    border-radius: 8px;
    padding: 12px 14px;
    margin-bottom: 16px;
  }
  #ocean-drift .od-map-wrap {
    border-radius: 10px;
    overflow: hidden;
    border: 2px solid #d5d9d7;
    margin-bottom: 12px;
  }
  #ocean-drift #od-map {
    width: 100%;
    height: auto;
    display: block;
    --od-ocean: #cfe3e0;
    --od-ocean-dark: #b7d2ce;
  }
  #ocean-drift .od-route {
    fill: none;
    stroke: #6b8f89;
    stroke-width: 2;
    stroke-dasharray: 6 5;
    opacity: 0.8;
  }
  #ocean-drift .od-route-warm {
    fill: none;
    stroke: #d64545;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-dasharray: none;
    opacity: 0.85;
  }
  #ocean-drift .od-route-cold {
    fill: none;
    stroke: #3d7fd6;
    stroke-width: 3;
    stroke-linecap: round;
    stroke-dasharray: none;
    opacity: 0.85;
  }
  #ocean-drift .od-route-grad {
    fill: none;
    stroke-width: 3.5;
    stroke-linecap: round;
    opacity: 0.9;
  }
  #ocean-drift .od-marker { stroke: #ffffff; stroke-width: 1.5; }
  #ocean-drift .od-marker.done { fill: var(--accent); }
  #ocean-drift .od-marker.current { fill: var(--wrong); }
  #ocean-drift .od-marker.upcoming { fill: #b9c2be; }
  #ocean-drift .od-token {
    font-size: 26px;
    text-anchor: middle;
    dominant-baseline: middle;
    transition: x 1s ease, y 1s ease;
  }
  #ocean-drift .od-progress {
    font-size: 0.85rem;
    color: var(--muted);
    margin-bottom: 8px;
  }
  #ocean-drift .od-fact {
    background: var(--card-bg);
    border-left: 4px solid var(--accent);
    border-radius: 6px;
    padding: 12px 14px;
    margin-bottom: 12px;
  }
  #ocean-drift .od-fact-head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 4px;
  }
  #ocean-drift .od-fact-label { font-weight: bold; font-size: 1rem; }
  #ocean-drift .od-fact-time {
    font-size: 0.8rem;
    color: var(--accent);
    font-weight: bold;
  }
  #ocean-drift .od-fact p { margin: 0; font-size: 0.92rem; }
  #ocean-drift .od-closing {
    font-size: 0.88rem;
    color: var(--muted);
    margin-bottom: 14px;
  }
  #ocean-drift .od-controls {
    display: flex;
    gap: 10px;
    margin-bottom: 14px;
  }
  #ocean-drift .od-controls button {
    padding: 10px 18px;
    border-radius: 8px;
    border: none;
    background: var(--accent);
    color: #fff;
    font-weight: bold;
    cursor: pointer;
    font-size: 0.95rem;
  }
  #ocean-drift .od-controls button:disabled {
    background: #d5d9d7;
    color: var(--muted);
    cursor: not-allowed;
  }
  #ocean-drift .od-source {
    font-size: 0.75rem;
    color: var(--muted);
    border-top: 1px solid #e2e5e3;
    padding-top: 10px;
  }

  #ocean-drift-wrap {
    display: none;
    justify-content: center;
    padding: 12px 0;
  }
  #ocean-drift-wrap.visible { display: flex; }

  #ocean-drift .od-atmosphere { fill: #eaf2fb; }
  #ocean-drift .od-atmo-label {
    text-anchor: middle;
    font-size: 11px;
    fill: #6b8bb0;
    font-family: system-ui, sans-serif;
    font-style: italic;
  }
  #ocean-drift .od-land-path { fill: #eef1ef; stroke: #c3cac7; stroke-width: 0.6; }
  #ocean-drift .od-ocean-label {
    text-anchor: middle;
    font-size: 12px;
    font-style: italic;
    fill: #3d6a63;
    font-family: system-ui, sans-serif;
    pointer-events: none;
  }
  #ocean-drift .od-map-wrap { position: relative; }
  #ocean-drift .od-badge {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(255,255,255,0.92);
    border: 1px solid #c3cac7;
    border-radius: 8px;
    padding: 6px 12px;
    font-size: 0.85rem;
    font-weight: bold;
    color: var(--text);
    box-shadow: 0 1px 4px rgba(0,0,0,0.12);
  }
  #ocean-drift .od-marker { stroke: #ffffff; stroke-width: 1.5; cursor: pointer; transition: r 0.15s; }
  #ocean-drift .od-marker:hover { r: 9; }

  #ocean-drift .od-canvas-holder { pointer-events: none; }
  #ocean-drift #od-canvas { width: 100%; height: 100%; display: block; }
  #ocean-drift .od-view-toggle {
    display: flex;
    gap: 8px;
    margin-bottom: 14px;
  }
  #ocean-drift .od-view-btn {
    padding: 7px 14px;
    border-radius: 999px;
    border: 2px solid #d5d9d7;
    background: var(--card-bg);
    color: var(--text);
    font-weight: bold;
    cursor: pointer;
    font-size: 0.85rem;
  }
  #ocean-drift .od-view-btn.active {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;
  }
  #ocean-drift #od-map { cursor: default; }
  #ocean-drift .od-explore-status {
    font-size: 0.9rem;
    font-weight: bold;
    color: var(--accent);
    margin: 4px 0 12px 0;
  }
  #ocean-drift .od-explore-route {
    stroke: #d64545;
    stroke-dasharray: none;
    opacity: 0.7;
  }

  #ocean-drift .od-explore-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
    gap: 10px;
  }
  #ocean-drift .od-direction-toggle { display: flex; gap: 8px; }
  #ocean-drift #od-plume-reset {
    padding: 7px 14px;
    border-radius: 8px;
    border: 2px solid #d5d9d7;
    background: var(--card-bg);
    color: var(--text);
    font-weight: bold;
    cursor: pointer;
    font-size: 0.85rem;
  }
  #ocean-drift #od-plume-reset:hover { border-color: var(--wrong); }

  #ocean-drift .od-journey-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  #ocean-drift #od-journey-play,
  #ocean-drift #od-journey-restart {
    padding: 8px 14px;
    border-radius: 8px;
    border: none;
    background: var(--accent);
    color: #fff;
    font-weight: bold;
    cursor: pointer;
    font-size: 0.9rem;
    white-space: nowrap;
  }
  #ocean-drift #od-journey-restart {
    background: var(--card-bg);
    color: var(--text);
    border: 2px solid #d5d9d7;
  }
  #ocean-drift #od-journey-slider {
    flex: 1;
    accent-color: var(--accent);
    cursor: pointer;
  }

</style>

<div id="game-picker">
  <div class="game-tile active" id="tile-enso" onclick="showGame('enso')">
    <h3>Spot the ENSO Years</h3>
    <p>Guess El Niño and La Niña years from Australian rainfall maps.</p>
    <span class="status">Play now</span>
  </div>
  <div class="game-tile" id="tile-drift" onclick="showGame('drift')">
    <h3>Ocean Drift</h3>
    <p>Follow a rubber duck through surface currents, or a deep-sea fish through the thermohaline circulation.</p>
    <span class="status">Play now</span>
  </div>
</div>

<div id="enso-quiz-wrap" class="visible"><div id="enso-quiz"></div></div>
<div id="ocean-drift-wrap"><div id="ocean-drift"></div></div>

<script>
function showGame(name) {
  document.getElementById('enso-quiz-wrap').classList.toggle('visible', name === 'enso');
  document.getElementById('ocean-drift-wrap').classList.toggle('visible', name === 'drift');
  document.getElementById('tile-enso').classList.toggle('active', name === 'enso');
  document.getElementById('tile-drift').classList.toggle('active', name === 'drift');
}
</script>
<script src="/assets/js/enso-quiz.js"></script>
<script src="/assets/js/ocean-drift.js"></script>
