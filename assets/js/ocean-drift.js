(function () {
  const WX = {
    duck_spill: [670, 143],
    duck_sitka: [787, 112],
    duck_washington: [813, 137],
    duck_japan: [580, 155],
    duck_bering: [703, 91],
    duck_arctic_ice: [475, 43],
    duck_greenland_sea: [200, 68],
    duck_atlantic_land: [175, 118]
  };

  const GYRES = [
    {cx:750,cy:180,r:140,sign:1,k:1.0},
    {cx:125,cy:180,r:120,sign:1,k:1.0},
    {cx:800,cy:318,r:140,sign:-1,k:0.8},
    {cx:163,cy:318,r:110,sign:-1,k:0.8},
    {cx:400,cy:318,r:110,sign:-1,k:0.7},
    {cx:663,cy:130,r:90,sign:-1,k:0.6},
    {cx:125,cy:118,r:70,sign:-1,k:0.5}
  ];

  // ---------- named western-boundary current jets ----------
  // Explicit curved paths for named real currents, built from their real
  // lat/lon routes (not implied by a circular vortex, which can't follow how
  // these currents actually curve). Gulf Stream speed is calibrated against
  // real plasticadrift.science.uu.nl transition-matrix data: a parcel released
  // at 43N,41W moves roughly 9 px/month in this map's scale over its first two
  // months. All coordinates re-derived after moving the map's seam to keep
  // both this route and the thermohaline loop clear of it.
  const CURRENT_JETS = [
    { path: [[25, 193], [28, 175], [37, 165], [63, 155], [100, 143], [150, 135], [175, 118], [195, 130]], width: 26, strength: 1.3 }, // Gulf Stream -> N. Atlantic Current
    { path: [[530, 195], [550, 180], [575, 173], [600, 165], [650, 160], [700, 155], [725, 155]], width: 24, strength: 1.2 },   // Kuroshio -> Kuroshio Extension
    { path: [[608, 323], [608, 330], [605, 339], [600, 348], [613, 355], [638, 360]], width: 20, strength: 1.1 },        // East Australian Current
    { path: [[500, 305], [505, 315], [505, 325], [530, 343], [550, 343]], width: 12, strength: 0.5 },    // Leeuwin Current (WA) - small, unusual warm poleward current
    { path: [[313, 318], [308, 330], [295, 343], [285, 350]], width: 12, strength: 0.6 }     // Agulhas Current (SE Africa) - small
  ];

  function jetContribution(x, y) {
    let vx = 0, vy = 0;
    for (const jet of CURRENT_JETS) {
      let bestDist = Infinity, bestTx = 0, bestTy = 0;
      for (let i = 0; i < jet.path.length - 1; i++) {
        const [ax, ay] = jet.path[i], [bx, by] = jet.path[i + 1];
        const dx = bx - ax, dy = by - ay;
        const segLenSq = dx * dx + dy * dy || 1;
        let t = ((x - ax) * dx + (y - ay) * dy) / segLenSq;
        t = Math.max(0, Math.min(1, t));
        const px = ax + t * dx, py = ay + t * dy;
        const dist = Math.hypot(x - px, y - py);
        if (dist < bestDist) {
          bestDist = dist;
          const len = Math.hypot(dx, dy) || 1;
          bestTx = dx / len; bestTy = dy / len;
        }
      }
      const falloff = Math.exp(-(bestDist * bestDist) / (2 * jet.width * jet.width));
      vx += bestTx * jet.strength * falloff;
      vy += bestTy * jet.strength * falloff;
    }
    return { vx, vy };
  }

  const ACC_Y = 405, ACC_SIGMA = 22, ACC_STRENGTH = 0.9;
  const EQ_Y = 255, EQ_SIGMA = 30, EQ_STRENGTH = 0.5;
  const MAP_W = 900, MAP_H = 480;

  function monthsYM(m) {
    if (m <= 0) return "Day 0";
    const y = Math.floor(m / 12);
    const mo = m % 12;
    const parts = [];
    if (y > 0) parts.push(y + " year" + (y !== 1 ? "s" : ""));
    if (mo > 0) parts.push(mo + " month" + (mo !== 1 ? "s" : ""));
    return parts.length ? parts.join(", ") : "Day 0";
  }

  // ---------- analytic surface-current vector field ----------
  // Built from approximate real gyre centers/rotation directions, explicit named
  // western-boundary current jets, the Antarctic Circumpolar Current (eastward
  // band) and equatorial currents (westward band). This is an illustrative
  // schematic field, not a physical ocean model.
  function fieldAt(x, y) {
    let vx = 0, vy = 0;
    for (const g of GYRES) {
      const dx = x - g.cx, dy = y - g.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > g.r * 3 || dist < 0.001) continue;
      const norm = dist / g.r;
      let mag = norm * Math.exp(1 - norm) * g.k;
      // Western boundary intensification: real subtropical gyres have a narrow,
      // fast jet on their western edge (Gulf Stream, Kuroshio, East Australian
      // Current, Agulhas, Brazil Current) and a broad, weak return flow on the
      // eastern edge (California/Canary/Peru/Benguela/W. Australian Currents).
      const westness = Math.max(0, -dx / dist); // 1 = due west of gyre centre, 0 = due east
      mag *= (1 + 2.2 * westness);
      const tx = g.sign > 0 ? -dy / dist : dy / dist;
      const ty = g.sign > 0 ? dx / dist : -dx / dist;
      vx += tx * mag;
      vy += ty * mag;
    }
    // Antarctic Circumpolar Current: eastward band
    vx += ACC_STRENGTH * Math.exp(-((y - ACC_Y) ** 2) / (2 * ACC_SIGMA * ACC_SIGMA));
    // Equatorial currents: westward band
    vx -= EQ_STRENGTH * Math.exp(-((y - EQ_Y) ** 2) / (2 * EQ_SIGMA * EQ_SIGMA));
    // Named western-boundary current jets (Gulf Stream, Kuroshio, EAC)
    const jet = jetContribution(x, y);
    vx += jet.vx; vy += jet.vy;
    return { vx, vy };
  }

  // ---------- precomputed ocean/land mask ----------
  // Built offline from the real Natural Earth coastline data using d3.geoContains
  // at 2px resolution (450x240 cells), so straits, peninsulas
  // and archipelagos are resolved accurately — not sampled at runtime.
  const MASK_COLS = 450;
  const MASK_ROWS = 240;
  const MASK_CELL = 2;
  const MASK_B64 = "////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////5/////8YAAD/////////////////////////////////////////////////////////////DwEAAPj/PQAAAPD///////////////////////////////////////////////////////////8DAADADwAAAAAAgAP4/////////////////////////////////////////////////////////xMAAIADAAAAAAAAAPz////////////z////////gf////////////////////////////////9/MAIAwAcAAAAAAAAA//////8TAP7///////////8D+P////////////////////////////////8AMAD8DwAAAAAAAAD+////PwD8/////////////z9A/P////////////////////////////9//x8QAHAAAAAAAAAAAPz/////A7z////////////////A//////////////////////////////+B4TAA+B8AAAAAAAAA8P////8/fPz//////////////z//////////////////////////////8f8/fgDgPwAAAAAAAADw///////z//////////H/////H/D//////////////////////////4H//3/4/////x8AAAAAAAD///////////////8H8P///x8CAID///8f/P//////////////////88HxAz8CgP///wEAAAAAAP7//////////////4H/////AQAAAP///z+Awf//////////////////AwA/jLH/////HwAAAAAA8P//////////////w/////8AAADA/////////////////////////5///v///znh////AAAAAADg///////////////D////BwAAAAAQ+Pn/P/7/////////////////HwD/54OBIND///8PAAAAAPD//////////////4P/f7gfAAAAAAAAAP7//v////////////////8/gMjFG8YDAOD//x8AAAAA4P//////////////B///4IIAAAAAAAAA+P8BwP///////////////3/AACA+8D8AAPj//wMAAAAA/v////////////9/+P+AAAAAAAAAAACAAQAA/P///w/////z/////48fAPA/+AAAAP7/AwAAAMD/////////D+D//////wMGAAAAAAAAAAAAAAAAwP//////fwDA/////v8PAP/AP/4A8P8PAQAAAPz///////8AgPz///+PDxgAAAAAAAAAAAAAAAAAxh/A//9/AAAA+Bug8QEAMAzz4Afg//8DAAAA/v///////wAAAP7/n3/gwQAAAAAAAAAAAAAAAAAAQADw/x8AAAAAAAAAIPDvf8jBjwH8/wMAAPD///////9/AAAAgI8HAAAAAwAAAAAAAAAAAAAAAAAAAAD+/wAAAAAAAACAf8BHAAA+D4D/BwAA4P////////8AAAAAnAcAAAAGAAAAAAAAAAAAAAAAAAAAAMD/DwAAAAAAAAAAAAAAIP8PAPg/AADg///P/////wEAADjYAAAAAAQAAAAAAAAAAAAAAAAAAAAAAOHPAAAAAAAAAAAAAABA/z/A8f8AAPz/DwD+////AcADwA8AAAAAAAAAAAAAAAAAAAAAAAAAAAAQgAcAAAAAAAAAAAAAAIDhBwD8/wcA/P9/APj///8DgAcAYwAAAAAAAAAAAAAAAAAAAAAAAAAAAOCHPwAAAAAAAAAAAAAAwEP8B+D/PwDw//8D/P///wMABwAQAAAAAAAAAAAAAAAAAAAAAAAAAAAA4P//fwAAAAAAAAAAAAAA3/9/EP//AfD/////////AwAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/z9/AAAAAAAAAAAAAAD++/mP//8P4P////////8BAB4AAAAAAAAAAAAAAAAAAAAAAAAAAACAAAD7/z8AAAAAAAAAAAAAAP7/B/j//3+A/////////wcAfAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwB4P//fwAAAAAAAAAAAAAA/P8fAP///x/+////////HwDgAQAAAAAAAAAAAAAAAAAAAAAAAAAAvgPg////AwAIAQAAAAAAAAD4//8AfP////////////9/AACfHwAAAAAAAAAAAAAAAAAAAAAAAAD8g97///8bABD+AQAAAAAAAPD//wHw+P////////////+BAP4AAAAAAAAAAAAAAAAAAAAAAADA//CD//////8D8P9/AAAAAAAAwP//BwDB//////////8//48H/gMAAAAAAAAAAAAAAAAAAAAAAOD//4f////////D//8HAAAAAAAA/P8/AAD+/////////3/y/xf4GwAAAAAAAAAAAAAAAAAAAAAA4P//A/z//////8f8//8BAAAAAADg/v8BAPD//////////8H/5+AHAAAAAAAAAAAAAAAAAAAAAADA//8H8P//////z////w8AAAAAAADg/wMAwP//////////h/+f4R8AAAAAAAAAAAAAAAAAAAAAAMD//x/g///////P////fwAAAAAAAADgBwAA/P////////8/+H/2fwAAAAAAAAAAAAAAAAAAAAAAwP//f4D///////P/////BwAAAAAAAIAHAACA/////////4/D//EDAAAAAAAAAAAAAAAAAAAAAAAA/P//gf////////////8fAAAAAAAAADwAAAD8////////Hx7+AQAAAAAAAAAAAAAAAAAAAAAAAAAA+/8H/v///////////88BAAAAAAAA8AAAAOD///////9/GPAAAAAAAAAAAAAAAAAAAAAAAAAAAADI/z/+////////////fwcAAAAAAACAAwAAgP////////84wAMAAAAAAAAAAAAAAAAAAAAAAAAAAAD///z/////////////fwAAAAAAAAAAAABA/v////////8BAwAAAAAAAAAAAAAAAAAAAAAAAAAAwPz/+///////////////AQAAAAAAAAAAAMD9//////////MDAAAAAAAAAAAAAAAAAAAAAAAAAAAA8/////////////////8zAAAAAAAAAACA9+P//////////wIAAAAAAAAAAAAAAAAAAAAAAAAAAACM/////////////////z8BAAAAAAAAAMDwB/7/////////AgAAAAAAAAAAAAAAAAAAAAAAAAAAALD//////////////////xMAAAAAAAAAgOAP8P////////8BAAAAAAAAAAAAAAAAAAAAAAAAAAAA4P7/////////////////HwAAAAAAAAAAgf/X/////////x8AAAAAAAAAAAAAAAAAAAAAAAAAAADA+/////////////////9/AAAAAAAAAAAAoP///////////wEAAAAAggMAHwAAAAAAAAAAAAAAAIDP//////////////////8BAAAAAAAAAAAA/v//////////BwAgAAA8BwB/AAAAAAAAAAAAAAAAAP///////////////////w8AAAAAAAAAABj///////////8fAMABAPgcAH4AAAAAAAAAAAAAAAAA/v7/////////////////PwAAAAAAAAAAPP///////////38AGA8A8P8B8AAAAAAAAAAAAAAAAAD8wf////////////////9/AAAAAAAAAAD8//////////9/AID78ADg/x/ABwAAAAAAAAAAAAAAAPgD//////////////////8BAAAAAAAAAPD///////////8BAH+DD4D//wA+AAAAAAAAAAAAAAAA/yf//////////////////wcAAAAAAAAAgP///////////wcA/D18AHzwA/gCAAAAAAAAAAAAAAD+n///////////////////HwAAAAAAAADA////////////PwD+94OBGQAAwA8AAAAAAAAAAAAAAfz//v////////////////9/AAAAAAAAAMD///////////9/APifv4cOAAAAHwAAAAAAAAAAAAAH/P/x//////////////////8BAAAAAAAAwP////////////8B8H/+PDwAAAB8AAAAAAAAAAAAAO/x/8f//////////////////w8AAAAAAAAA/v///////////wfA///78QAAAPADAAAAAAAAAAAA/If/n///////////////////PwAAAAAAAAD+////////////P4D///DHAwAAwA8AAAAAAAAAAABgP/w//v//////////////////AQAAAAAAAPD/////////////A38A/78fAAAAGAAAAAAAAAAAAAD48R/4//////////////////8PAAAAAAAAwP/////////////fHwD8////AwAAAAAAAAAAAAAAAPjHP/D//////////////////38AAAAAAACA/////////////38IAPD/n/8GAAAAAAAAAAAAAAAA8B8PwP///////////////////wMAAAAAAAD//////////////wAA4P///x8AAAAAAAAAAAAAAACA/5/x////////////////////HwAAAAAAAP//////////////AQAA////fwAAAAAAAAAAAAAAAAD+n/j/////////////////////AQAAAAAA/v////////////8BAADgf///AAAAAAAAAAAAAAAAAPB/+v////////////////////8PAAAAAAD+/////////////wcAAAB84P8DAAAAAAAAAAAAAAAAgP/5/////////////////////z8AAAAAAPj/////////////DwAAAOABOAcAAAAAAAAAAAAAAAAA/v///////////////////////xkAAABA4P////////////8/AAAAAAQAAAAAAAAAAAAAAAAAAAD8////////////////////////ZwAAAOCP//////////////8AAAAAAAAAAAAOAAAAAAAAAAAAAOD///////////////////////8/AwAAzn/8/////////////wEAAAAAAIAAADgAAAAAAAAAAAAAgP////////////////////////8JAAD+//H/////////////AQAAAAAAAAgA4AEAAAAAAAAAAAAA/////////////////////////28AAP7/x/////////////8DAAAAAAAAcAAAHwAAAAAAAAAAAAD+////////////////////////HwMA+P8//////////////wcAAAAAAACAAwD4DwAAAAAAAAAAAPz/////////////////////////OQDg///9////////////DwAAAAAAAAAcAKDvAAAAAAAAAAAA8P/////////////////////////PAID///////////////8/AAAAAAAAAHAAAJ7/DwAAAAAAAADg/v///////////////////////z8HAP7///3//////////38AAAAAAAAAgAMAAPx/AAAAAAAAAMD5/////////////////////////zsA/P///////////////wAAAAAAAAAAHgAAwP8HAAAAAAAAwPf/////////////////////////3wHw/5/g////////////AwAAAAAAAABwAAAA/h8AAAABAADg3///////////////////////////D8D//x////////////8HAAAAAAAAAIABAAD4/wAAwA8AAPH///////////////////////////9/AP7D//H//////////x8AAAAAAAAAAA4AAPD/FwCAPwAA7/////////////////////////////8B+I//j////////////wAAAAAAAAAAeAAA4P//AAD/AQC+/////////////////////////////wfAH/7/D///////////AwAAAAAAAADgAwCA//8DAP8PADj+////////////////////////////PwB//H8HyP////////8PAAAAAAAAAAAPAID//w8A/D8A4P1/////////////////////////////ARDw/////////////z8AAAAAAAAAAHgAAP//PwD8/wEA///5//////////////////////////8/AMD//////////////wAAAAAAAAAA4AMA////APj/BwD4/8f///////////////////////////8DgP//////////////AwAAAAAAAAAADwD///8D8P/PAcD/j////////////////////////////38GAP////////////8HAAAAAAAAAAA4AP7//x/g//8HAP4//////////////////////////////z8A/P///////////x8AAAAAAAAAAMAA/////4D//x8A+P/7/////////////////////////////wHw/////////////wAAAAAAAAAAAAb/////A/7/fwDg/5///////////////////////////////8H/////////////AwAAAAAAAAAAkP////8P+P//E4D/3/3/////////////////////////////D/+///////////8PAAAAAAAAAACA/////3/w///vAf7/7/////////////////////////////9//D/i/////////38AAAAAAAAAAAB+/P///8H//78H/P83///////////////////////////////xPwBM/////////wMAAAAAAAAAAADw////D////374/73+/////////////////////////////5//IAD8////////HwAAAAAAAAAAAMD///8//v////P/+/b//////////////////////////////yABAOD/////////AAAAAAAAAAAAgP/////M///H///3z///////////////////////////////zwAAAP7///////8DAAAAAAAAAAAA/v///z///z////8H/v//////////////////////////////BwAA+P///////x8AAAAAAAAAAAD4//////j///3//9/4//////////////////////////////8/AADA/////////wEAAAAAAAAAAPD/////9///z////Pv///////////////////////////////8AAADA////////DwB+AAAAAAAA4P////////8//v/h/////////////////////////////////wMAAAD+//////9/+P8BAAAAAACA/////////+Pw/4P/////////////////////////////////DwAAAPD///////////8AAAAAAAD/////////H8P/B/////////////////////////////////8/AAAAgP///////////wcAAAAAAP7/////////GP8P/v///////////////////////////////z8AAAAA/v//////////HwAAAAAA/P/////////H/A/w/////////////////////////////////wAAAADw//////////8/AAAAAAD4/////////z/kB8D/+///////////////////////////////AAAAAMD///////////8AAAAAAPj//////////+AfAAfv//////////////////////////////8DAAAAgP///////////wMAAAAA8P//////////B38A7r///////////////////////////////w8AAAAAwP//////////DwAAAADg//////////8//AG4+R//////////////////////////////HwAAAAAA/P////////8/AAAAAID////////////gD/D4f/z/////////////////////////////AQAAAADg//////////8BAAAAgP///////////wc/wOH/f/j///////////////////////////8DAAAAAADg/////////wcAAAAA/v//////////P/gDJy+MAP7v/////////////////////////wcAAAAAAAD+////////PwAAAAD8////////////4f+//P8B4H//////////////////////////HwAAAAAAAPD/////////AQAAAPj///////////+P///+/x8A/v7///////////////////////9/AAAAAAAAAP7///////8PAAAA4P///////////3/+//v//wE4/P////////////////////////8DAAAAAAAA+P///////z8AAACA/////////////8f///+/D4D//v///////////////////////x8AAAAAAADg/////////wEAAAD8////////////H+D///8/AP//////////////////////////fwAAAAAAAID/////////BwAAAPD/////////////D/z//3/A8f/9////////////////////////AwAAAAAAAP7///////8fAAAAwP//////////////f+L5/w/P/9////////////////////////8PAAAAAAAA/P///////38AAAAA////////////////5/n//3/8v/7//////////////////////38AAAAAAAD4/////////wEAAAD4/////////////////////+//+////////////////////////wEAAAAAAPD/////////DwAAAOD////////////////////v////////////////////////////DwAAAAAAwP////////8/AAAAgP//////////////////s7////////////////////////////9/AAAAAACA/////////38AAAAA/u////////////////8D/vz///////////////////////////8BAAAAAAD//////////wAAAAD4n////////////////wf48f///////////////////////////wcAAAAAAPz/////////AwAAAOA//v//////////////DPDP////////////////////////////PwAAAAAA8P////////8PAAAAgH/w//////////////8AwD/8////////////////////////////AwAAAADA/////////x8AAAAAfuD//////////////wMAfPD///////////////////////////8/AAAAAAD/////////fwAAAAD8gP//////////////AwDggf///////v////////////////////8BAAAAAP7/////////AQAAAP4B//////////////8HAAAC/v/////8/////////////////////x8AAAAA+P////////8PAAAA/A/8/////////////x8AAAD4////////////////////////////fwAAAADg/////////z8AAAD4P/D/////////////PwAAAMD/////////////////////////////AQAAAMD//////////wEAAPD/4P////////////8fAAAAAPz///////////////////////////8HAAAAAP//////////BwAAwP+B/////////////w8AAAAA4P///v///////////////////////x8AAAAA/v////////8/AAAA/gf+////////////HwAAAACA///n////////////////////////fwAAAAD8//////////8AAAD4H/z///////////8fAAAAAAD8////////////////////////////AQAAAP7//////////wMAAOB/8P///////////38AAAAAAOD///////////////////////////8DAAAA/v//////////HwAAgP/B/////////////wAAAAAAAP///////////////////////////w8AAAD+//////////9/AACA/4f/////////////BwAAAAAA+P//////////////////////////PwAAAPz///////////8BAID///////////////8fAAAAAADA////////////////////////////AAAA8P///////////wcAAPz//////////////z8AAAAAAAD///////////////////////////8DAADA////////////PwAA+P///////////////wEAAAAAAPz//////////////////////////w8AAAD/////////////AADg////////////////BwAAAAAA8P//////////////////////////HwAAAP7///////////8HAID///////////////8/AAAAAADA//////////////////////////9/AAAA/P///////////z8AgP////////////////8AAAAAAAD///////////////////////////8BAADw/////////////wAA/v///////////////wMAAAAAAPz//////////////////////////wcAAOD/////////////BwD8////////////////HwAAAAAA8P//////////////////////////HwAAwP////////////8fAPj///////////////9/AIAPAADg//////////////////////////9/AACA/////////////38A8P////////////////8B4P8AAID///////////////////////////8BAAD//////////////wHw/////////////////wPg/0cAAP///////////////////////////wMACP7/////////////z///////////////////H/z/vwAA/v//////////////////////////DwCA////////////////////////////////////////BwD4//9///////////////////////8/AAD+//////////////////////////////////////9/APD////7/////////////////////38AAPD///////////////////////////////////////8BwP///+///////////////////////wEA4P///////////////////////////////////////w8A////f/7/////////////////////BwDA/////////////////////////////////////////8j/////4f////////////////////8fAPj////////////////////////////////////////////////D/////////////////////z8A4P///////////////////////////////////////////////x///////////////////////wCA///////////////////////////////////////////9////b/7/////////////////////A+D//////////////////////////////////////////w////8f/f////////////////////8vAP7/////////////////////////////////////////P/z//z/8/////////////////////38A/P//////////////////////////////////////////+f//f/j//////////////////////wH4//////////////////////////////////////////////9/8P//////////////////////AeD////////////////////////////////////////////////g//////////////////////8H8P///////////////////////////////////////////////8H//////////////////////w/A////////////////////////////////////////////////j///////////////////////fwD8////////////////////////////////////////////////////////////////////////APD///////////////////////////////////////////////////////////////////////8D8P///////////////////////////////////////////////////////////////////////w/A/////////////////////////////P//////////////////////////////////////////P8D/////////////////////////////////////////////////////////////////////////Af/f//////////////////////////////////////////////////////////////////////8H+K///////////////////////////////////////////////////////////////////////z/k/////////////////////////////////////////////////////////////////////////wD/////////////////////////////////////////////////////////////////////////D/j/////////////////////////////////////////////////////////////////////////kf/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////H//////////////////////////////////////////////////////////////////////////n/////////////////////////////////////////////////////////////////////////8/////////////////////////////////////////f////////////////////////////////D//////////////////////8f8P/////7/wd/8P//gf///////////////////////////////+P//////////////////////wcA/////4DoAQAAGAAAAOD/////////////////////////////z///////////////////////AQBAgP8fAAAAAAAAAAAAAP////////////////////////////8//P//////////////////zz8AAAAA/g8AAAAAAAAAAAAAAPb//////////////////////////0fA//////////////////8fMAAAAAD4DwAAAAAAAAAAAAAAAPj/////////////////////////HwH+////////////fzgA/AEAAAAAAPgDAAAAAAAAAAAAAAAAAP////////////////////////8fCPD/////////f74DAAAAAAAAAAAAwAcAAAAAAAAAAAAAAAAAAPD//////////////////////x9gwP////////8PAAAAAAAAAAAAAAAABwAAAAAAAAAAAAAAAAAAAP////////////////8f9v////8A/////////wcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v///////////////5/8P4DBAwD8////////AwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD8////////////c/T//wAAAAAAAPj///////8fAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP///////////8nxH+D/DwAAAAAA/P///////w8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v////////8HAAAAAABAAAAAAID/////////AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+/////////wAAAAAAAAAAAADA/////////wMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPj///////9/AAAAAAAAAAAAAADw////////AQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAwP//////HwAAAAAAAAAAAAAAAP7///8f+D8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA+P/////4AAAAAAAAAAAAAAAA+P///z/A/wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAID//////4d/AAAAAAAAAAAAAACA///zHwD//wMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//////////AQAAAAAAAAAAAAAAf+A/8P//AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/v////////8DAAAAAAAAAAAAAAAA/P//PwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADw////////BwAAAAAAAAAAAAAAAAAA/AEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD///////8BAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAID//4///z8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAID///8DAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  function decodeOceanMask(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  const oceanMaskBytes = decodeOceanMask(MASK_B64);

  function isOcean(x, y) {
    if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
    const col = Math.min(MASK_COLS - 1, Math.max(0, Math.floor(x / MASK_CELL)));
    const row = Math.min(MASK_ROWS - 1, Math.max(0, Math.floor(y / MASK_CELL)));
    const idx = row * MASK_COLS + col;
    return ((oceanMaskBytes[idx >> 3] >> (idx & 7)) & 1) === 1;
  }

  function randomOceanPoint() {
    for (let tries = 0; tries < 200; tries++) {
      const x = Math.random() * MAP_W;
      const y = 30 + Math.random() * (MAP_H - 30);
      if (isOcean(x, y)) return { x, y };
    }
    return { x: MAP_W / 2, y: MAP_H / 2 };
  }

  // ---------- ambient particle system (Ventusky-style flow animation) ----------
  const PARTICLE_COUNT = 220;
  let particles = [];
  let animId = null;
  let ctx = null;

  // ---------- thermohaline ambient field (Deep-Sea Fish tab only) ----------
  // Unlike the surface gyres/jets used elsewhere, this follows the actual
  // conveyor-belt path itself, so the background animation on this tab shows
  // the thermohaline circulation rather than wind-driven surface currents.
  let THERMOHALINE_PATH = null; // built lazily from scenarios.fish.loopPoints

  function buildThermohalinePath() {
    THERMOHALINE_PATH = scenarios.fish.loopPoints.map(p => ({ x: p.x, y: p.y, temp: p.temp }));
  }

  function thermohalineFieldAt(x, y) {
    const path = THERMOHALINE_PATH;
    const n = path.length;
    let bestDist = Infinity, bestTx = 0, bestTy = 0, bestTemp = "warm";
    for (let i = 0; i < n; i++) {
      const a = path[i], b = path[(i + 1) % n];
      const dx = b.x - a.x, dy = b.y - a.y;
      const segLenSq = dx * dx + dy * dy || 1;
      let t = ((x - a.x) * dx + (y - a.y) * dy) / segLenSq;
      t = Math.max(0, Math.min(1, t));
      const px = a.x + t * dx, py = a.y + t * dy;
      const dist = Math.hypot(x - px, y - py);
      if (dist < bestDist) {
        bestDist = dist;
        const len = Math.hypot(dx, dy) || 1;
        bestTx = dx / len; bestTy = dy / len;
        bestTemp = a.temp;
      }
    }
    const width = 34;
    const falloff = Math.exp(-(bestDist * bestDist) / (2 * width * width));
    return { vx: bestTx * 1.4 * falloff, vy: bestTy * 1.4 * falloff, dist: bestDist, temp: bestTemp };
  }

  function randomPointNearThermohalinePath() {
    const path = THERMOHALINE_PATH;
    const i = Math.floor(Math.random() * path.length);
    const a = path[i], b = path[(i + 1) % path.length];
    const t = Math.random();
    const bx = a.x + (b.x - a.x) * t, by = a.y + (b.y - a.y) * t;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len; // perpendicular
    const spread = (Math.random() - 0.5) * 30;
    const x = bx + nx * spread, y = by + ny * spread;
    const temp = a.temp;
    return isOcean(x, y) ? { x, y, temp } : { x: bx, y: by, temp };
  }

  function seedThermohalineParticles() {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = randomPointNearThermohalinePath();
      particles.push({ x: p.x, y: p.y, age: Math.random() * 200, temp: p.temp });
    }
  }

  function stepThermohalineParticles() {
    for (const p of particles) {
      const f = thermohalineFieldAt(p.x, p.y);
      p.x += f.vx;
      p.y += f.vy + (Math.random() - 0.5) * 0.3;
      p.temp = f.temp;
      p.age++;
      if (p.age > 220 || !isOcean(p.x, p.y) || f.dist > 45) {
        const np = randomPointNearThermohalinePath();
        p.x = np.x; p.y = np.y; p.age = 0; p.temp = np.temp;
      }
    }
  }

  // ---------- plume system (free-explore, Duck Drift only) ----------
  // A plume is many small particles released from one clicked point that spread
  // apart as the current field (plus a little random eddy diffusion) carries them.
  const PLUME_COUNT = 220;
  const MONTHS_PER_SEC = 8; // simulated months of drift per real second of animation
  let plume = null; // { origin:{x,y}, particles:[...], startTime, elapsedMonths }

  // ---------- journey system (smooth scrubbable playback for guided routes) ----------
  const JOURNEY_DURATION_SEC = 14; // real seconds for a full play-through, regardless of simulated time span
  let journey = null; // { waypoints, token, subject, totalMonths, elapsedMonths, playing, lastIdx, lastTs }

  function setupJourney(waypoints, token, subject) {
    journey = {
      waypoints, token, subject,
      totalMonths: waypoints[waypoints.length - 1].months,
      elapsedMonths: 0,
      playing: false,
      lastIdx: -1,
      lastTs: null
    };
  }

  function journeyPosition(months) {
    const wps = journey.waypoints;
    if (months <= wps[0].months) return { x: wps[0].x, y: wps[0].y, idx: 0 };
    for (let i = 0; i < wps.length - 1; i++) {
      if (months <= wps[i + 1].months) {
        const span = (wps[i + 1].months - wps[i].months) || 1;
        const frac = (months - wps[i].months) / span;
        return {
          x: wps[i].x + (wps[i + 1].x - wps[i].x) * frac,
          y: wps[i].y + (wps[i + 1].y - wps[i].y) * frac,
          idx: i
        };
      }
    }
    return { x: wps[wps.length - 1].x, y: wps[wps.length - 1].y, idx: wps.length - 1 };
  }

  function stepJourneyFrame() {
    if (!journey) return;
    if (journey.playing) {
      const now = performance.now();
      if (journey.lastTs == null) journey.lastTs = now;
      const dtSec = (now - journey.lastTs) / 1000;
      journey.lastTs = now;
      const monthsPerSec = journey.totalMonths / JOURNEY_DURATION_SEC;
      journey.elapsedMonths = Math.min(journey.totalMonths, journey.elapsedMonths + dtSec * monthsPerSec);
      if (journey.elapsedMonths >= journey.totalMonths) journey.playing = false;
    } else {
      journey.lastTs = null;
    }
    updateJourneyUI();
  }

  function updateJourneyUI() {
    if (!journey) return;
    const pos = journeyPosition(journey.elapsedMonths);

    const tokenEl = document.getElementById("od-token");
    if (tokenEl) { tokenEl.setAttribute("x", pos.x); tokenEl.setAttribute("y", pos.y); tokenEl.textContent = journey.token; }

    const badge = document.querySelector("#ocean-drift .od-badge");
    if (badge) badge.textContent = journey.subject + " \u2014 " + monthsYM(Math.round(journey.elapsedMonths));

    const slider = document.getElementById("od-journey-slider");
    if (slider && document.activeElement !== slider) slider.value = Math.round(journey.elapsedMonths);

    const playBtn = document.getElementById("od-journey-play");
    if (playBtn) playBtn.textContent = journey.playing ? "\u23F8 Pause" : "\u25B6 Play";

    if (pos.idx !== journey.lastIdx) {
      journey.lastIdx = pos.idx;
      const wp = journey.waypoints[pos.idx];
      const labelEl = document.getElementById("od-fact-label");
      const timeEl = document.getElementById("od-fact-time");
      const textEl = document.getElementById("od-fact-text");
      if (labelEl) labelEl.textContent = wp.label;
      if (timeEl) timeEl.textContent = wp.time;
      if (textEl) textEl.textContent = wp.text;

      const markerLayer = document.getElementById("od-marker-layer");
      if (markerLayer) {
        markerLayer.querySelectorAll("circle").forEach(c => {
          const i = parseInt(c.dataset.index, 10);
          c.classList.remove("done", "current", "upcoming");
          c.classList.add(i < pos.idx ? "done" : (i === pos.idx ? "current" : "upcoming"));
        });
      }
    }

    const closingEl = document.getElementById("od-journey-closing");
    if (closingEl) closingEl.style.display = (journey.elapsedMonths >= journey.totalMonths) ? "block" : "none";
  }

  function drawRouteStatic(token, waypoints) {
    const tokenEl = document.getElementById("od-token");
    const pathLayer = document.getElementById("od-path-layer");
    const markerLayer = document.getElementById("od-marker-layer");
    if (!tokenEl) return;
    tokenEl.textContent = token;

    let pathD = "";
    waypoints.forEach((w, i) => { pathD += (i === 0 ? "M" : "L") + w.x + "," + w.y + " "; });
    pathLayer.innerHTML = `<path d="${pathD}" class="od-route" />`;

    markerLayer.innerHTML = waypoints.map((w, i) =>
      `<circle cx="${w.x}" cy="${w.y}" r="7" class="od-marker upcoming" data-index="${i}"></circle>`
    ).join("");

    markerLayer.querySelectorAll("circle").forEach(c => {
      c.addEventListener("click", () => {
        const i = parseInt(c.dataset.index, 10);
        journey.playing = false;
        journey.elapsedMonths = waypoints[i].months;
        journey.lastIdx = -1;
        updateJourneyUI();
      });
    });

    updateJourneyUI();
  }

  function renderJourneyChrome(bodyEl, opts) {
    setupJourney(opts.waypoints, opts.token, opts.subject);
    const wp0 = opts.waypoints[0];

    bodyEl.innerHTML = `
      ${opts.headerHtml || ""}
      ${opts.intro ? `<p class="od-intro">${opts.intro}</p>` : ""}
      <div class="od-map-wrap">
        ${mapSVG()}
        <div class="od-badge">${opts.subject} \u2014 Day 0</div>
      </div>
      <div class="od-journey-controls">
        <button id="od-journey-play">\u25B6 Play</button>
        <input type="range" id="od-journey-slider" min="0" max="${journey.totalMonths}" value="0" />
        <button id="od-journey-restart" title="Restart">\u21BA Restart</button>
      </div>
      <p class="od-progress">Drag the slider, press Play, or click a marker \u2014 the map updates live</p>
      <div class="od-fact">
        <div class="od-fact-head">
          <span class="od-fact-label" id="od-fact-label">${wp0.label}</span>
          <span class="od-fact-time" id="od-fact-time">${wp0.time}</span>
        </div>
        <p id="od-fact-text">${wp0.text}</p>
      </div>
      <p class="od-closing" id="od-journey-closing" style="display:none">${opts.closing || ""}</p>
      ${opts.backButtonHtml || ""}
      <p class="od-source">${opts.sourceNote}</p>
    `;

    initMapCanvas();
    drawRouteStatic(opts.token, opts.waypoints);

    el("od-journey-play").addEventListener("click", () => {
      journey.playing = !journey.playing;
      journey.lastTs = null;
      updateJourneyUI();
    });
    el("od-journey-slider").addEventListener("input", (e) => {
      journey.playing = false;
      journey.elapsedMonths = parseInt(e.target.value, 10);
      journey.lastIdx = -1;
      updateJourneyUI();
    });
    el("od-journey-restart").addEventListener("click", () => {
      journey.elapsedMonths = 0;
      journey.playing = false;
      journey.lastIdx = -1;
      updateJourneyUI();
    });

    if (opts.wireBack) opts.wireBack();
  }

  function seedParticles() {
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = randomOceanPoint();
      particles.push({ x: p.x, y: p.y, age: Math.random() * 200 });
    }
  }

  function stepParticles() {
    for (const p of particles) {
      const { vx, vy } = fieldAt(p.x, p.y);
      p.x += vx * 0.9;
      p.y += vy * 0.9;
      p.age++;
      if (p.age > 260 || !isOcean(p.x, p.y)) {
        const np = randomOceanPoint();
        p.x = np.x; p.y = np.y; p.age = 0;
      }
    }
  }

  function startPlumeFrom(x, y) {
    const pts = [];
    for (let i = 0; i < PLUME_COUNT; i++) {
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * 3;
      const jx = x + Math.cos(ang) * r;
      const jy = y + Math.sin(ang) * r;
      // guard: never seed a particle on land even after jitter, fall back to the exact click point
      pts.push(isOcean(jx, jy) ? { x: jx, y: jy } : { x, y });
    }
    plume = { origin: { x, y }, particles: pts, startTime: performance.now(), elapsedMonths: 0 };

    const markerLayer = document.getElementById("od-marker-layer");
    if (markerLayer) markerLayer.innerHTML = `<circle cx="${x}" cy="${y}" r="6" class="od-marker current"></circle>`;
    const status = document.getElementById("od-explore-status");
    if (status) status.textContent = "Watching the plume spread\u2026";
  }

  function stepPlume() {
    if (!plume) return;
    const dir = state.exploreDirection === "back" ? -1 : 1;
    for (const p of plume.particles) {
      const { vx, vy } = fieldAt(p.x, p.y);
      const nx = p.x + vx * 1.1 * dir + (Math.random() - 0.5) * 4;
      const ny = p.y + vy * 1.1 * dir + (Math.random() - 0.5) * 4;
      if (isOcean(nx, ny)) { p.x = nx; p.y = ny; }
    }
    plume.elapsedMonths = Math.round((performance.now() - plume.startTime) / 1000 * MONTHS_PER_SEC);
    const badge = document.getElementById("od-explore-badge");
    if (badge) {
      const verb = state.exploreDirection === "back" ? "traced back" : "drifted";
      badge.textContent = "Marine plastic " + verb + " \u2014 " + monthsYM(plume.elapsedMonths);
    }
  }

  function drawFrame() {
    if (!ctx) return;
    if (state.mode === "fish") {
      stepThermohalineParticles();
    } else {
      stepParticles();
    }
    stepJourneyFrame();
    stepFishLoopFrame();

    ctx.fillStyle = "rgba(207,227,224,0.14)";
    ctx.fillRect(0, 0, MAP_W, MAP_H);

    if (state.mode === "fish") {
      for (const p of particles) {
        ctx.fillStyle = p.temp === "warm" ? "rgba(214,69,69,0.6)" : "rgba(61,127,214,0.6)";
        ctx.fillRect(p.x, p.y, 1.8, 1.8);
      }
    } else {
      ctx.fillStyle = "rgba(61,106,99,0.5)";
      for (const p of particles) {
        ctx.fillRect(p.x, p.y, 1.6, 1.6);
      }
    }

    if (plume) {
      stepPlume();
      ctx.fillStyle = "rgba(224,168,29,0.85)";
      for (const p of plume.particles) {
        ctx.fillRect(p.x - 1, p.y - 1, 2.6, 2.6);
      }
      ctx.fillStyle = "#d64545";
      ctx.beginPath();
      ctx.arc(plume.origin.x, plume.origin.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    animId = requestAnimationFrame(drawFrame);
  }

  function initMapCanvas() {
    if (animId) cancelAnimationFrame(animId);
    const canvas = document.getElementById("od-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    ctx.fillStyle = "#cfe3e0";
    ctx.fillRect(0, 0, MAP_W, MAP_H);
    if (state.mode === "fish") {
      if (!THERMOHALINE_PATH) buildThermohalinePath();
      seedThermohalineParticles();
    } else {
      seedParticles();
    }
    animId = requestAnimationFrame(drawFrame);
  }

  function mapClickToSvgCoords(evt, svg) {
    const rect = svg.getBoundingClientRect();
    const fracX = (evt.clientX - rect.left) / rect.width;
    const fracY = (evt.clientY - rect.top) / rect.height;
    return { x: fracX * MAP_W, y: fracY * MAP_H };
  }

  function wireExploreClicks() {
    const svg = document.getElementById("od-map");
    if (!svg) return;
    svg.addEventListener("click", (evt) => {
      if (!(state.mode === "duck" && state.duckView === "explore")) return;
      const { x, y } = mapClickToSvgCoords(evt, svg);
      if (!isOcean(x, y)) {
        const status = document.getElementById("od-explore-status");
        if (status) status.textContent = "That's land \u2014 click somewhere in the ocean instead.";
        return;
      }
      startPlumeFrom(x, y);
    });
  }


  function mapSVG() {
    return `
    <svg viewBox="0 0 900 480" id="od-map">
      <rect x="0" y="0" width="900" height="30" class="od-atmosphere" />
      <text x="450" y="20" class="od-atmo-label">Atmosphere</text>
      <rect x="0" y="30" width="900" height="450" fill="#cfe3e0" />
      <foreignObject x="0" y="0" width="900" height="480" class="od-canvas-holder">
        <canvas id="od-canvas" xmlns="http://www.w3.org/1999/xhtml" width="900" height="480"></canvas>
      </foreignObject>
      <path d="M76.071,455.101L75.333,456.375L74.604,457.501L69.366,457.158L63.777,457.306L60.645,456.472L60.645,456.375L59.277,455.639L64.902,455.736L70.293,455.981L72.156,454.953L73.479,454.073ZM726.976,453.743L722.178,454.086L718.902,453.206L717.435,452.321L717.336,452.173L715.716,451.488L717.237,450.557L721.89,450.95L724.383,451.733L726.292,452.617ZM112.116,450.117L115.194,451.196L116.274,452.715L116.571,453.79L116.67,455.063L112.8,455.85L108.732,456.485L104.034,457.073L98.796,457.564L92.874,457.416L89.589,456.582L90.03,455.554L95.367,454.869L97.518,454.035L99.084,452.96L100.218,452.029L101.73,451.145L103.35,450.117L104.619,450.117L108.345,449.579ZM821.971,438.751L825.203,439.145L828.191,438.705L826.769,439.585L824.419,440.224L820.945,440.025L818.443,439.145L818.983,438.311ZM811.099,438.705L814.924,439.682L813.448,439.585L810.217,439.339L806.788,438.654L808.606,438.116ZM877.547,434.833L880.292,435.176L883.028,434.884L884.495,436.301L882.542,436.107L879.509,436.204L876.422,436.107L873.038,436.255L870.491,435.764L869.177,434.736L870.743,434.296L873.92,434.638ZM53.868,432.391L54.165,433.517L53.724,434.494L53.04,435.425L50.106,435.768L47.307,436.259L44.031,436.212L45.255,435.231L42.312,435.573L39.522,435.916L37.614,435.18L37.47,434.152L40.215,433.174L41.925,432.878L44.814,432.975L45.552,431.702L45.696,430.775L45.642,428.765L47.064,427.589L49.368,427.195L50.691,428.126L51.276,429.057L52.356,430.187L53.184,431.262ZM0,438.117L1.928,436.399L3.944,437.524L6.833,437.964L9.965,437.719L12.017,438.7L15.302,438.798L18.335,439.09L21.323,439.631L23.285,438.7L24.257,437.816L26.76,438.798L30.189,438.552L32.736,439.09L34.446,439.923L37.776,439.678L40.368,439.14L42.915,438.502L45.948,438.159L49.476,437.867L52.662,437.524L55.11,436.987L56.577,436.2L57.162,435.125L56.874,434.092L56.091,433.115L55.209,432.133L54.426,431.156L53.787,430.271L53.643,429.294L53.886,428.312L55.056,427.381L56.037,426.353L56.433,425.376L55.938,424.297L55.65,423.315L56.874,422.189L58.242,421.457L59.862,420.527L61.572,419.74L63.579,419.007L64.56,417.928L65.928,417.243L67.494,416.604L69.897,416.46L71.463,415.673L73.227,415.187L75.279,414.89L77.097,414.256L78.51,413.469L80.472,413.177L81.939,413.816L81.012,414.645L78.465,415.381L77.385,415.919L75.531,415.529L73.47,415.775L71.76,416.363L69.942,416.998L68.718,417.734L68.376,418.711L68.529,419.642L69.699,420.476L67.989,421.064L65.64,421.259L64.263,422.092L62.796,422.875L61.23,423.954L60.834,424.885L61.716,425.913L63.039,426.696L65.1,427.284L67.008,428.067L68.034,429.049L68.574,429.979L69.312,430.961L70.482,431.791L71.22,432.721L71.562,435.023L72.291,435.954L72.489,436.936L73.272,437.913L72.93,439.238L71.562,440.266L70.095,441.1L66.765,441.442L65.64,442.322L64.119,443.156L60.348,444.087L57.018,444.48L53.886,445.018L50.502,445.56L48.495,446.588L44.481,446.685L40.08,446.588L36.111,446.782L31.899,446.782L32.682,447.764L36.498,448.204L39.297,448.89L40.863,449.77L38.073,450.553L33.762,450.307L30.189,450.946L30.036,451.974L29.937,452.956L32.88,453.785L33.42,454.716L36.597,455.647L41.889,456.041L46.389,456.726L49.971,457.509L54.525,458.296L60.735,458.685L66.864,459.371L71.121,460.107L75.774,460.941L78.222,462.117L79.446,463.048L82.479,462.164L86.592,461.431L90.948,460.644L96.141,460.01L100.596,459.324L106.815,459.273L112.935,459.616L117.975,460.204L119.595,459.125L123.069,458.393L129.388,458.343L134.338,457.805L139.036,457.264L144.229,456.921L149.755,456.481L153.625,455.846L151.861,454.962L150.79,454.082L150.79,453.151L145.939,453.248L140.8,453.641L135.904,453.641L135.211,452.711L135.562,450.849L136.687,450.307L140.26,449.723L144.472,449.135L147.505,448.399L150.538,447.663L152.797,446.685L156.217,446.245L159.601,445.902L161.311,445.703L165.181,445.606L168.853,445.263L171.94,444.772L174.973,444.184L177.718,443.596L181.192,442.813L183.397,441.98L185.746,441.248L186.484,440.266L183.838,439.678L184.72,438.65L186.385,437.867L188.977,437.376L191.722,436.788L194.269,436.005L196.222,435.023L197.446,433.851L199.264,433.162L202.243,433.31L203.467,434.143L206.455,434.241L206.554,433.31L207.832,432.332L210.523,432.578L211.162,433.508L214.141,433.652L217.381,433.212L220.513,432.92L223.348,433.064L224.428,434.092L227.174,433.263L229.721,432.819L232.556,432.476L235.346,432.133L237.893,431.545L240.683,431.156L242.843,430.614L244.355,429.734L246.218,430.373L248.81,430.03L250.628,431.202L252.041,432.087L254.885,431.596L256.01,430.614L258.557,429.929L261.842,430.077L262.814,431.008L264.875,430.077L267.566,429.785L270.5,429.688L273.146,429.734L275.936,430.03L278.636,430.174L279.806,431.008L281.426,431.744L284.162,431.304L287.105,431.202L289.94,431.202L292.73,431.156L295.232,430.813L297.878,430.517L300.083,429.831L302.432,429.391L304.979,429.146L306.887,428.46L308.255,427.089L309.677,426.256L312.269,426.649L313.25,427.53L315.401,428.118L318.002,427.923L319.766,428.803L321.62,429.442L324.167,428.854L325.05,427.775L327.3,427.335L329.901,426.501L332.349,426.159L335.283,425.668L337.245,425.13L339.297,424.542L341.259,424.005L343.608,424.297L345.858,423.417L347.478,422.731L349.827,422.778L351.888,422.189L352.374,421.309L354.48,420.624L356.532,420.133L359.034,419.74L361.338,419.545L363.534,419.693L365.892,419.938L367.899,420.624L368.142,421.699L370.347,422.532L371.859,423.218L374.847,423.514L376.512,424.199L378.573,424.885L380.967,425.033L382.974,424.542L385.134,423.514L387.483,424.051L389.931,424.348L392.28,424.639L394.728,424.834L397.221,424.834L399.282,427.432L399.183,428.067L398.886,429.197L396.492,429.831L394.53,430.762L394.872,431.744L397.662,431.693L397.32,432.675L396.051,433.606L394.872,434.634L396.78,435.417L399.669,435.662L402.558,435.222L403.935,434.241L404.763,433.31L406.14,432.527L407.706,431.791L408.336,430.91L409.659,429.688L411.225,429.442L414.069,429.341L416.562,429.049L419.109,428.655L420.333,427.678L421.071,426.747L422.781,425.816L425.23,425.177L427.336,424.69L428.713,423.857L430.126,423.417L431.944,423.023L434.437,423.269L436.687,423.023L439.135,422.731L441.88,422.875L443.689,422.189L444.967,420.527L445.894,421.212L447.073,422.388L449.179,422.875L451.573,423.074L453.976,422.778L456.523,422.972L458.872,423.023L460.438,422.778L462.544,422.926L464.452,423.463L466.702,423.12L469.402,423.12L471.697,422.778L474.298,423.12L475.963,422.287L477.232,421.457L478.951,420.768L482.083,418.91L483.694,419.253L485.602,419.938L487.267,420.819L490.453,422.338L492.901,422.388L495.205,422.388L497.896,422.092L500.587,421.749L502.648,421.064L504.358,420.328L507.148,420.23L509.011,419.693L510.973,420.184L512.242,420.967L514.006,421.749L516.751,421.652L518.461,422.287L521.449,422.926L524.581,423.171L527.174,422.972L529.136,422.189L530.801,421.407L533.051,421.212L535.31,421.555L537.902,421.8L540.251,421.407L542.501,421.407L544.706,421.652L547.01,421.898L549.26,421.457L551.951,421.064L554.498,420.967L557.342,420.967L559.637,420.721L561.896,420.527L562.58,419.299L562.679,418.271L564.245,418.957L564.686,420.082L565.514,421.115L566.549,421.944L568.655,422.388L571.49,422.24L574.775,422.189L577.025,422.041L580.301,422.041L582.659,421.995L585.935,422.092L588.725,422.287L590.489,423.074L590.003,424.005L591.614,424.737L594.305,425.325L597.095,425.964L600.335,426.404L603.71,426.793L606.257,427.187L609.092,427.238L610.712,426.404L612.917,427.089L614.825,427.872L617.03,428.46L620.063,428.706L622.952,428.998L624.176,429.979L627.021,430.568L628.929,431.448L631.719,431.841L634.608,431.791L637.299,431.939L640.287,431.888L643.275,432.087L646.065,432.429L648.657,433.018L651.258,433.508L653.013,434.241L652.725,435.222L651.402,436.102L650.277,437.228L649.395,438.112L648.216,439.14L644.94,439.534L643.473,440.414L640.233,440.952L639.108,441.933L637.398,442.864L635.589,443.647L634.554,444.675L633.924,445.606L633.672,446.732L633.726,447.663L635.148,448.644L635.688,449.575L636.858,450.455L641.511,450.798L642.492,451.877L637.983,452.27L634.167,452.808L629.415,452.905L627.309,454.327L626.868,455.503L625.797,456.434L624.473,457.365L627.804,458.194L629.073,459.227L631.224,460.154L634.266,460.987L637.74,461.774L641.511,462.557L647.235,463.34L648.513,464.563L655.713,465.104L656.19,465.295L658.062,466.035L664.965,465.396L670.689,466.183L675,466.784L675,466.784L675.144,466.805L677.349,465.35L681.858,466.133L682.146,466.044L682.848,465.836L683.694,465.578L684.423,465.358L684.792,465.248L685.161,465.252L685.422,465.295L689.04,466.336L692.208,465.295L692.775,465.151L700.119,464.711L702.504,465.295L703.674,465.595L707.445,466.425L714.546,467.063L720.171,467.846L729.82,468.434L737.02,467.749L747.649,468.24L753.67,469.023L760.276,468.286L767.233,467.601L767.773,466.425L757.927,466.327L749.845,465.739L747.739,464.762L741.034,464.22L741.475,463.094L742.402,462.066L743.338,461.135L742.843,460.107L738.685,459.422L736.777,458.537L732.907,457.754L738.982,457.902L744.76,457.509L748.378,458.343L752.833,457.611L756.946,456.68L758.953,455.846L758.071,454.818L754.84,454.132L751.168,453.396L746.029,453.248L741.529,452.905L736.678,452.66L735.058,451.729L731.827,450.946L729.874,450.066L729.091,447.222L730.315,447.468L732.565,448.251L736.678,448.005L740.647,447.663L742.699,448.742L746.668,448.496L749.998,447.959L753.13,447.273L755.965,446.44L759.736,446.194L759.637,445.263L758.764,444.332L759.493,443.452L762.724,443.012L764.191,443.842L768.016,443.355L770.905,442.716L774.478,442.665L777.853,442.424L781.237,441.836L783.928,441.294L786.961,440.757L788.923,440.905L790.633,441.1L794.359,440.757L797.689,441.197L801.118,441.15L804.394,440.808L807.769,441.049L811.495,441.294L814.969,441.197L818.596,441.248L822.313,441.294L825.743,441.197L828.29,440.461L831.323,440.071L834.464,440.609L837.443,440.169L840.143,439.289L841.754,440.071L842.636,440.952L844.256,441.785L846.848,441.049L849.836,441.98L853.211,442.276L856.1,442.961L859.628,442.813L862.814,442.373L866.576,442.471L869.96,442.813L873.389,443.253L874.712,442.179L873.092,441.345L871.868,440.461L868.637,440.266L867.215,439.335L866.675,438.404L865.793,436.542L867.71,436.885L870.986,437.033L874.217,436.885L877.16,437.279L879.707,438.015L880.778,438.895L884.162,439.043L887.393,438.7L890.822,438.21L893.9,437.913L896.447,438.502L899.777,438.307L900,438.117L900,480L450,480L0,480ZM55.623,389.625L58.872,391.127L62.373,391.749L61.248,393.001L58.872,393.124L57.603,392.244L56.775,393.255L54.633,394.03L51.924,393.746L50.106,392.997L47.487,392.633L44.337,391.237L41.79,389.895L38.343,387.094L40.404,387.619L43.914,389.29L47.235,390.187L48.522,389.041L49.332,387.327L51.636,386.295L53.418,386.591L54.372,387.75ZM78.627,382.749L80.625,383.874L79.878,384.75L76.503,385.499L75.378,384.623L73.254,385.749L72.003,384.623L75,383.125L77.124,383.751ZM400.704,379.275L396.861,379.435L396.798,378.107L397.167,377.074L397.338,376.562L398.949,377.349L401.316,377.663L401.397,378.136ZM588.491,356.979L590.912,357.843L592.271,357.5L594.224,357.022L595.718,357.187L595.898,360.157L595.043,361.016L594.782,363.03L593.909,362.345L592.172,364.088L591.659,363.953L590.12,363.872L588.581,361.736L588.239,360.085L586.799,357.906L586.862,356.759ZM657.549,357.297L658.116,358.329L659.898,357.318L660.618,358.372L660.618,359.425L659.691,360.585L658.053,362.425L656.775,363.432L657.702,364.634L655.776,364.664L653.634,365.607L652.959,367.245L651.546,369.771L649.575,370.888L648.333,371.603L646.029,371.548L644.409,370.727L641.691,370.55L641.277,369.631L642.618,367.778L645.759,365.311L647.37,364.841L649.17,363.889L651.312,362.578L652.815,361.283L653.922,359.417L654.876,358.786L655.245,357.39L657,356.235ZM661.527,345.39L663.345,348.022L663.39,346.316L664.524,346.998L664.893,348.889L666.909,349.701L668.601,349.905L670.023,348.948L671.292,349.24L670.689,351.457L669.924,352.917L668.016,352.867L667.35,353.624L667.584,354.699L667.215,355.164L666.27,356.514L665.028,358.223L663.102,359.222L662.67,358.566L661.626,358.207L663.066,356.15L662.247,354.771L659.556,353.772L659.628,352.867L661.437,351.995L661.86,350.07L661.743,348.453L660.726,346.778L660.798,346.337L659.601,345.305L657.639,343.092L656.586,341.323L657.522,341.129L658.881,342.517L660.825,343.164ZM642.798,310.4L641.853,311.001L640.476,310.324L638.685,309.199L637.074,307.874L635.418,306.114L635.076,305.263L636.147,305.301L637.551,306.152L638.649,306.998L639.45,307.701L641.502,309.249ZM670.932,298.349L671.796,299.073L671.382,300.376L669.834,300.719L668.457,300.41L668.214,299.31L669.177,298.451L670.311,298.764ZM675,296.39L673.407,297.004L671.814,297.528L671.49,296.597L672.741,296.085L673.533,295.946L675,295.167L675.513,295.053L675.207,296.255ZM644.616,296.166L643.788,296.496L642.951,295.4L643.041,294.731ZM642.771,292.336L643.176,294.351L642.501,294.037L641.979,294.173L641.628,293.483L641.574,291.566ZM350.142,288.888L350.547,291.896L351.195,293.064L350.943,294.266L350.502,295.002L349.656,293.534L349.179,294.274L349.656,296.128L349.44,297.186L348.747,297.765L348.585,299.881L347.604,302.796L346.371,306.241L344.823,310.98L343.869,314.454L342.744,317.352L340.71,317.945L338.523,319.003L337.083,318.364L335.103,317.471L334.41,316.151L334.248,313.933L333.366,311.94L333.132,310.142L333.582,308.34L334.734,307.908L334.743,307.074L335.94,305.183L336.165,303.588L335.58,302.403L335.112,300.829L334.905,298.527L335.778,297.126L336.12,295.54L337.362,295.446L338.757,294.934L339.684,294.482L340.782,294.452L342.204,293.026L344.265,291.486L345.012,290.229L344.67,289.159L345.732,289.459L347.109,287.724L347.163,286.218L347.991,285.101L348.855,286.175L349.521,287.238ZM583.901,289.408L584.801,291.372L586.412,290.428L587.24,291.486L588.437,292.463L588.176,293.572L588.716,295.713L589.094,296.961L589.724,297.266L590.399,299.403L590.156,300.702L590.966,302.394L593.675,303.702L595.448,304.891L597.122,305.978L596.789,306.584L598.22,308.153L599.192,310.857L600.191,310.307L601.208,311.39L601.82,311.005L602.252,313.654L604.025,315.19L605.186,316.146L607.139,318.169L607.841,320.179L607.904,321.605L607.733,323.149L608.921,325.274L608.777,327.487L608.345,328.646L607.67,330.876L607.724,332.31L607.229,334.1L606.122,336.377L604.277,337.604L603.359,339.542L602.522,340.777L601.784,342.935L600.821,344.179L600.191,346.05L599.867,347.772L599.993,348.563L598.562,349.431L595.763,349.524L593.45,350.548L592.307,351.517L590.795,352.591L588.725,351.483L587.195,351.043L587.582,349.74L586.214,350.213L584.027,352.024L581.867,351.347L580.445,350.95L579.014,350.772L576.593,350.048L574.982,348.508L574.514,346.608L573.938,345.347L572.705,344.332L570.302,344.031L571.121,342.817L570.518,340.964L569.294,342.69L567.071,343.151L568.385,341.768L568.763,340.325L569.726,339.102L569.528,337.248L567.494,339.381L565.928,340.236L564.974,342.225L563.021,341.196L563.102,339.872L561.536,338.057L560.213,337.122L560.681,336.542L557.477,335.027L555.722,334.955L553.319,333.741L548.837,333.978L545.606,334.87L542.753,335.704L540.368,335.539L537.722,336.821L535.553,337.401L535.076,338.708L534.149,339.724L532.025,339.787L530.459,340.007L528.245,339.555L526.454,339.825L524.734,339.94L523.249,341.273L522.52,341.162L521.26,341.869L520.063,342.66L518.236,342.563L516.562,342.563L513.907,340.968L512.566,340.49L512.62,339.059L513.862,338.717L514.285,338.15L514.195,337.253L514.501,335.514L514.222,334.033L512.899,331.502L512.494,330.076L512.602,328.654L511.603,327.025L511.54,326.289L510.433,325.295L510.118,323.336L508.696,321.36L508.345,320.293L509.443,321.372L508.606,319.053L509.839,319.777L510.586,320.746L510.541,319.464L509.299,317.496L509.065,316.709L508.48,315.96L508.759,314.517L509.263,313.9L509.605,312.651L509.344,311.187L510.37,309.389L510.559,311.293L511.621,309.575L513.646,308.737L514.87,307.671L516.778,306.753L517.912,306.558L518.605,306.867L520.576,305.936L522.088,305.657L522.466,305.111L523.132,304.882L524.509,304.942L527.138,304.21L528.497,303.101L529.136,301.764L530.603,300.495L530.72,299.496L530.783,298.138L532.529,296.013L533.582,298.171L534.653,297.672L533.762,296.492L534.545,295.277L535.643,295.819L535.949,293.919L537.317,292.688L537.92,291.702L539.18,291.274L539.216,290.576L540.314,290.868L540.359,290.242L541.457,289.882L542.663,289.544L544.508,290.69L545.903,292.171L547.46,292.188L549.053,292.425L548.522,291.05L549.719,289.049L550.853,288.393L550.457,287.771L551.546,286.341L553.058,285.46L554.336,285.757L556.442,285.287L556.397,284.009L554.561,283.184L555.893,282.82L557.549,283.442L558.881,284.466L560.987,285.105L561.698,284.851L563.246,285.621L564.704,284.906L565.649,285.122L566.234,284.644L567.377,285.879L566.711,287.216L565.766,288.228L564.902,288.312L565.19,289.311L564.461,290.559L563.57,291.791L563.75,292.493L565.739,293.877L567.665,294.676L568.952,295.54L570.761,297.021L571.463,297.016L572.768,297.655L573.155,298.43L575.54,299.276L577.187,298.421L577.682,297.08L578.186,295.971L578.492,294.6L579.257,292.611L578.906,291.401L579.086,290.678L578.798,289.243L579.131,287.36L579.608,286.853L579.221,286.019L579.824,284.694L580.292,283.319L580.355,282.608L581.291,281.669L581.993,282.892L582.164,284.462L582.794,284.762L582.893,285.816L583.802,287.085L583.991,288.503ZM630.297,281.208L630.999,282.067L629.253,282.05L628.299,280.514L629.793,281.115ZM526.787,280.599L525.734,280.645L522.421,278.893L524.752,278.402L526.067,279.164L526.94,279.926ZM627.129,279.68L626.157,279.74L624.626,279.486L624.104,279.101L624.257,278.106L625.905,278.5L626.724,279.024ZM629.199,278.999L628.821,279.46L626.967,277.294L626.454,275.8L627.3,275.8L628.2,277.802ZM536.093,280.349L533.951,280.899L533.654,280.599L533.879,279.748L534.95,278.225L537.425,277.23L537.713,276.642L539.864,276.079L541.61,275.995L542.393,275.682L543.338,275.995L542.42,276.672L539.819,277.763L537.722,278.483ZM519.748,275.237L520.648,275.906L522.196,275.703L522.817,276.765L519.928,277.268L518.191,277.603L516.85,277.582L517.705,276.143L519.082,276.122ZM532.259,275.237L531.89,276.625L528.137,277.336L524.806,277.027L524.806,276.113L526.787,275.593L528.353,276.342L530.018,276.151ZM624.689,275.842L624.797,276.346L622.835,275.284L621.467,274.387L620.531,273.553L620.9,273.299L622.052,273.9L624.104,275.051ZM618.848,273.371L618.344,273.511L617.255,272.944L616.229,271.916L616.355,271.497L617.849,272.555ZM496.555,271.945L501.352,272.195L501.901,271.162L506.536,272.364L507.445,273.985L511.198,274.442L514.267,275.927L511.414,276.879L508.66,275.872L506.401,275.94L503.809,275.754L501.469,275.305L498.571,274.353L496.735,274.103L495.691,274.416L491.137,273.388L490.705,272.313L488.41,272.127L490.129,269.741L493.162,269.889L495.178,270.866L496.213,271.057ZM561.815,270.536L560.528,272.237L560.285,270.354L560.726,269.457L561.248,268.611L561.815,269.343ZM614.699,272.051L613.997,272.301L612.917,271.34L611.819,269.753L611.288,267.849L611.63,267.608L611.9,268.349L612.656,268.916L613.871,270.502L615.05,271.349ZM604.961,268.696L603.647,268.899L603.251,269.601L601.883,270.21L600.605,270.794L599.273,270.79L597.221,270.067L595.799,269.368L596.006,268.594L598.247,268.958L599.615,268.763L599.993,267.566L600.353,267.502L600.596,268.831L602.018,268.641L602.72,267.786L604.115,266.893L603.845,265.42L605.339,265.374L605.843,265.784L605.798,267.168ZM543.122,263.648L542.186,264.477L540.458,264.02L539.972,262.945L542.501,262.822ZM551.177,262.734L552.086,264.646L549.98,263.614L547.892,263.406L546.479,263.571L544.751,263.483L545.336,262.107L548.432,262.006ZM607.85,266.25L607.067,266.914L606.599,265.442L606.014,264.473L604.88,263.656L603.458,262.59L601.658,261.853L602.351,261.248L603.701,261.951L604.547,262.501L605.6,263.102L606.599,264.151L607.553,264.951ZM560.357,257.88L561.059,261.921L563.642,263.419L565.73,260.766L568.601,259.26L570.824,259.255L572.966,260.127L574.82,261.024L577.502,261.502L581.84,263.224L586.457,264.655L588.185,265.932L589.571,267.189L589.958,268.666L594.116,270.21L594.728,271.535L592.424,271.806L592.982,273.469L595.214,275.11L596.834,277.763L598.265,277.679L598.166,278.787L600.101,279.211L599.345,279.68L602,280.734L601.73,281.457L600.074,281.631L599.453,280.984L597.311,280.704L594.782,280.328L592.838,278.732L591.416,277.357L590.12,275.17L586.862,274.074L584.747,274.789L583.217,275.614L583.532,277.459L581.57,278.318L580.175,277.899L577.583,277.793L575.36,275.741L572.822,275.242L572.201,275.952L569.033,276.029L570.095,273.993L571.67,273.299L571.022,270.583L569.816,268.484L564.974,266.368L562.913,266.157L559.16,263.846L558.422,265.061L557.459,265.281L556.892,264.367L556.883,263.279L554.975,262.052L557.666,261.151L559.448,261.198L559.241,260.537L555.578,260.533L554.588,259.044L552.356,258.583L551.303,257.343L554.669,256.738L555.947,255.925L559.961,256.949ZM538.1,251.448L536.093,253.932L534.212,254.41L531.809,253.924L527.642,254.046L525.455,254.406L525.104,256.298L527.336,258.523L528.686,257.389L533.348,256.539L533.15,257.69L532.061,257.326L530.972,258.794L528.767,259.763L531.134,262.966L530.684,263.825L532.925,266.711L532.907,268.353L531.575,269.085L530.594,268.209L531.8,266.161L529.343,267.13L528.722,266.436L529.046,265.471L527.246,264.007L527.435,261.57L525.761,262.327L525.977,265.243L526.076,268.823L524.491,269.182L523.42,268.45L524.131,266.148L523.744,263.736L522.691,263.719L521.917,262.006L522.952,260.368L523.312,258.384L524.563,254.614L525.086,253.585L527.219,251.728L529.172,252.464L532.322,252.811L535.193,252.705L537.668,250.89ZM546.722,252.168L546.587,254.355L545.3,254.11L544.922,255.629L545.948,256.949L545.246,257.25L544.238,255.667L543.5,252.472L544.004,250.475L544.832,249.565L545.012,250.928L546.488,251.148ZM489.544,269.631L486.772,269.682L484.666,267.591L481.462,265.552L480.391,264.037L478.501,262.002L477.259,260.127L475.351,256.628L473.155,254.542L472.426,252.392L471.499,250.441L469.249,248.867L467.944,246.726L466.063,245.33L463.453,242.571L463.237,241.302L464.839,241.403L468.709,241.885L470.923,244.327L472.858,246.024L474.235,247.065L476.602,249.752L479.149,249.79L481.246,251.503L482.695,253.598L484.594,254.74L483.595,256.78L485.026,257.647L485.926,257.711L486.349,259.454L487.222,260.851L489.058,261.071L490.273,262.653L489.643,265.763ZM519.685,250.433L522.493,252.743L519.532,253.039L518.695,254.745L518.803,257.008L516.4,258.718L516.337,261.21L515.374,265.031L515.005,264.143L512.161,265.268L511.171,263.741L509.389,263.597L508.138,262.797L505.168,263.694L504.259,262.488L502.621,262.624L500.56,262.336L500.173,258.98L498.931,258.286L497.725,256.149L497.383,253.962L497.671,251.643L499.156,249.984L500.992,250.839L502.918,250.374L503.422,248.258L504.493,247.784L507.49,247.242L509.281,245.266L510.514,243.684L511.504,242.749L513.628,241.382L515.554,239.643L516.814,237.688L517.822,237.679L519.109,238.945L519.226,240.032L520.873,240.73L522.952,241.479L522.772,242.461L521.098,242.584L521.548,243.807L519.703,244.657L518.281,246.912L520.117,249.282ZM540.944,233.964L541.196,235.623L541.34,237.028L540.494,239.313L539.576,236.765L538.406,238.035L539.207,239.876L538.496,241.048L535.553,239.596L534.851,237.785L535.607,236.6L534.023,235.416L533.24,236.452L532.061,236.355L530.216,237.751L529.802,237.019L530.783,234.912L532.358,234.21L533.717,233.266L534.599,234.4L536.507,233.715L536.912,232.598L538.676,232.534L538.532,230.6L540.557,231.785L540.764,233.042ZM428.047,239.507L425.869,240.079L424.68,238.09L424.239,234.497L425.374,230.44L427.102,231.827L428.263,233.588L429.469,236.194L429.091,238.797ZM72.66,229.724L70.572,229.999L70.122,229.775L70.851,229.085L70.797,228.1L72.237,227.774L72.759,227.863ZM534.959,229.301L534.059,230.126L533.276,231.705L532.493,232.445L530.954,230.715L531.467,230.046L532.097,229.348L532.367,227.795L533.744,227.647L533.348,229.331L535.193,226.919ZM521.26,231.709L517.939,234.083L519.163,232.331L520.963,230.791L522.466,229.06L523.78,226.576L524.221,228.616L522.574,229.991ZM529.712,225.269L531.206,226.043L532.799,226.039L532.754,227.084L531.593,228.146L530.009,228.899L529.919,227.736L530.099,226.462ZM538.757,224.592L539.459,227.384L537.533,226.72L537.578,227.562L538.19,229.102L537.002,229.665L536.903,227.905L536.147,227.774L535.76,226.263L537.227,226.462L537.191,225.514L535.67,223.606L538.064,223.661ZM528.821,222.328L528.155,224.486L527.084,223.238L525.806,221.334L527.948,221.427ZM528.308,208.741L529.847,209.452L530.612,208.804L530.846,209.439L530.432,210.476L531.287,212.266L530.63,214.343L529.154,215.173L528.767,217.187L529.325,219.18L530.648,219.455L531.755,219.159L534.878,220.547L534.635,221.905L535.454,222.506L535.193,223.657L533.249,222.43L532.322,221.118L531.683,222.036L530.09,220.538L527.813,220.906L526.571,220.356L526.697,219.324L527.48,218.685L526.733,218.109L526.409,219.011L525.176,217.572L524.806,216.484L524.707,214.089L525.716,214.915L525.977,211L526.787,208.737ZM61.023,209.431L60.384,210.061L58.503,210.044L57.036,210.133L56.892,209.063L57.252,208.699L59.295,208.711L60.573,208.931ZM32.745,210.328L31.989,210.747L30.585,210.345L29.154,209.435L29.46,208.864L30.504,208.69L31.08,208.775L32.763,208.999L34.086,209.6L34.5,210.281ZM43.554,205.322L45.723,205.715L46.029,205.288L47.982,205.301L49.467,205.944L50.124,205.881L50.574,206.765L51.942,206.718L51.861,207.463L52.977,207.552L54.201,208.47L53.274,209.486L52.086,208.944L50.943,209.05L50.115,208.931L49.665,209.384L48.711,209.541L48.324,208.931L47.496,209.291L46.497,211.005L45.858,210.607L45.732,209.888L44.067,209.465L42.888,209.638L41.367,209.456L40.197,209.921L38.856,209.143L39.072,208.339L41.376,208.686L43.266,208.885L44.166,208.33L43.023,207.247L43.041,206.291L41.466,205.902L42.024,205.212ZM500.848,208.305L498.688,209.507L496.636,208.732L496.564,206.579L497.797,205.449L500.533,204.746L501.964,204.806L502.522,205.762L501.424,206.862ZM736.147,207.29L735.778,207.708L735.157,207.353L735.229,206.655L734.815,205.741L734.941,205.466L735.373,205.055L735.202,204.565L735.346,204.332L735.535,204.378L736.498,204.802L736.939,205.017L737.344,205.352L737.983,206.227L737.92,206.367L736.948,206.9ZM734.806,203.388L733.96,203.57L733.537,203.041L733.249,202.838L733.222,202.682L733.465,202.47L734.356,202.707L735.013,203.088ZM733.105,202.06L733.024,202.326L731.683,202.254L731.872,201.95ZM730.864,201.696L730.729,201.84L730.558,201.806L729.685,201.717L729.37,201.154L729.271,201.052L729.937,200.706L730.144,200.866ZM726.634,200.045L726.337,200.291L725.5,199.838L725.626,199.656L726.013,199.411L726.589,199.461ZM25.806,198.086L26.796,199L29.136,198.721L30.018,199.305L32.133,200.854L33.69,201.983L34.518,201.95L36.003,202.457L35.823,203.164L37.668,203.266L39.558,204.29L39.261,204.873L37.596,205.191L35.913,205.314L34.194,205.119L30.612,205.36L32.286,203.968L31.269,203.316L29.658,203.151L28.794,202.428L28.2,201.006L26.787,201.103L24.455,200.43L23.708,199.906L20.45,199.521L19.577,199.034L20.513,198.408L18.056,198.281L16.265,199.58L15.23,199.614L14.87,200.223L13.628,200.498L12.566,200.261L13.88,199.487L14.42,198.586L15.554,198.031L16.832,197.54L18.722,197.303L19.325,197.028L21.485,197.206L23.456,197.236ZM31.161,195.602L30.549,195.725L29.919,194.286L28.983,193.563L29.523,191.976L30.279,192.073L31.152,194.151ZM527.939,198.023L526.868,200.075L525.554,197.964L525.266,196.11L526.733,193.652L528.74,191.76L529.883,192.505L529.442,194.016ZM30.45,188.549L27.723,188.951L27.552,188.024L28.722,187.825L30.378,187.901ZM32.502,188.523L32.07,190.301L31.611,189.983L31.647,188.676L30.531,187.686L30.522,187.402ZM561.599,169.626L561.914,170.485L560.51,171.995L559.484,171.196L558.197,171.775L557.54,173.24L555.911,172.529L555.929,171.34L557.315,169.85L558.737,170.138L559.763,169.089ZM311.441,165.822L309.749,166.884L309.938,167.354L310.01,167.557L307.445,168.572L306.221,168.246L305.645,167.244L306.833,167.151L307.004,167.138L307.364,166.533L309.164,166.567ZM284.252,165.737L285.62,166.579L287.564,166.435L289.427,166.613L289.364,167.049L290.723,166.749L290.408,167.489L286.808,167.701L286.835,167.286L283.784,166.799ZM263.804,159.424L262.904,161.392L263.273,162.166L262.751,163.448L260.834,162.509L259.565,162.238L256.082,160.968L256.424,159.682L259.349,159.911L261.905,159.64ZM248.027,151.977L249.521,153.75L249.17,157.059L248.036,156.898L247.019,157.731L246.074,157.071L245.975,154.054L245.399,152.624L246.776,152.751ZM577.439,162.145L576.503,164.142L576.935,165.395L575.63,167.155L572.435,168.331L568.043,168.483L564.479,171.34L562.805,170.379L562.697,168.509L558.35,169.059L555.389,170.239L552.464,170.286L555.002,172.127L553.328,176.375L551.717,177.424L550.502,176.455L551.123,174.2L549.539,173.472L548.522,171.759L550.889,170.988L552.194,169.419L554.714,168.124L556.541,166.419L561.518,165.67L564.191,166.182L566.81,161.739L568.475,162.932L572.147,160.431L573.569,159.462L575.135,156.403L574.712,153.593L575.765,152.011L578.42,151.554L579.788,155.019L579.707,157.046L577.403,159.564ZM248.9,149.62L248.072,151.549L246.938,151.042L246.362,149.358L246.866,148.431L248.477,147.475ZM584.774,144.563L586.529,145.096L588.302,144.039L588.86,146.844L585.152,147.53L582.956,150.013L579.032,148.304L577.664,151.037L574.892,151.075L574.541,148.592L575.783,146.666L578.447,146.527L579.176,143.07L579.923,141.123L582.857,143.726ZM65.838,138.627L67.656,138.961L69.969,138.893L68.736,139.917L67.818,140.078L64.641,139.02L64.02,138.182L64.965,137.408ZM70.482,132.237L69.267,132.284L66.027,131.497L63.705,130.316L64.569,130.109L67.854,130.735L70.41,131.78ZM816.229,133.727L814.969,134.074L810.865,132.935L810.109,132.051L807.877,131.175L807.427,130.464L804.853,130.012L803.89,128.653L804.106,128.074L806.725,128.619L808.264,128.996L810.613,129.263L811.459,130.126L812.701,131.311L815.194,132.343ZM84.666,128.281L83.01,130.469L84.639,129.627L86.322,130.16L85.44,131.031L87.663,131.717L88.815,131.108L91.308,131.878L90.534,133.71L92.28,133.282L92.604,134.607L93.378,136.16L92.325,138.36L91.2,138.453L89.553,137.984L90.093,135.936L89.4,135.618L86.502,137.789L85.008,137.7L86.772,136.528L84.369,135.919L81.687,136.067L76.836,135.991L76.449,135.25L78.006,134.37L76.917,133.693L79.023,132.187L81.606,128.205L83.154,126.783L85.323,125.92L86.484,126.03L85.998,126.707ZM793.225,119.899L795.628,119.7L794.872,122.539L797.05,124.549L796.051,124.545L794.548,123.402L793.621,122.251L792.361,121.473L791.902,120.372L792.046,119.577ZM584.117,128.133L586.637,132.559L582.938,131.734L581.399,135.347L583.838,137.907L583.766,139.655L581.867,138.149L580.229,140.082L579.77,137.984L580.049,135.55L579.761,132.851L580.337,130.964L580.454,127.621L578.987,125.162L579.203,121.743L581.516,120.597L580.526,119.437L581.633,119.086L582.29,120.741L583.154,123.148L583.091,125.607ZM208.03,124.35L203.593,125.827L200.056,125.45L202.081,122.839L200.776,120.296L204.178,118.337L206.068,117.169L208.165,117.068L210.847,118.612L209.506,120.33L209.92,122.116ZM256.721,115.976L255.227,117.999L252.608,116.59L252.257,115.549L255.929,114.724ZM742.483,112.21L739.99,113.162L738.712,112.519L738.325,111.347L740.593,110.458L741.925,110.077L743.59,110.247L744.643,111.021ZM217.489,108.415L214.816,111.118L217.363,110.776L220.099,110.788L219.451,112.824L217.201,115.066L219.784,115.227L222.214,118.439L223.924,118.841L225.464,121.688L226.175,122.674L229.208,123.152L228.902,124.752L227.624,125.484L228.623,126.775L226.373,128.086L223.033,128.061L218.776,128.751L217.606,128.26L215.959,129.428L213.646,129.144L211.891,130.1L210.559,129.601L214.222,126.973L216.463,126.436L212.539,126.017L211.828,125.023L214.447,124.248L213.079,122.899L213.547,121.261L217.273,121.49L217.633,120.038L215.923,118.464L212.89,118.024L212.296,117.347L213.205,116.23L212.377,115.54L211.036,116.721L210.883,114.313L209.623,113.039L210.532,110.454L212.476,108.423L214.474,108.622ZM711.054,105.224L709.515,105.613L707.877,105.148L706.365,104.467L708.831,104.039L710.811,104.268ZM26.832,99.605L25.86,100.916L24.752,100.705L24.095,99.96L24.212,99.787L25.176,99.038L26.202,99.093ZM20.252,98.221L17.327,99.601L15.563,99.546L15.014,98.868L16.877,97.713L20.306,97.739ZM695.673,95.543L697.212,96.021L698.769,95.763L700.794,96.423L703.278,96.757L703.071,97.028L701.172,97.557L699.273,97.015L698.319,96.562L696.114,96.706L695.52,96.486ZM12.098,90.858L12.557,91.954L13.844,91.569L15.293,92.225L18.029,93.084L20.891,93.863L21.116,95.052L22.952,94.857L24.743,95.686L22.52,96.474L18.632,95.873L17.228,94.747L14.753,96.076L11.189,97.371L10.334,95.907L6.941,96.148L9.119,94.912L9.434,92.945L10.289,90.651ZM188.725,88.861L188.149,90.478L190.975,92.183L187.726,94.091L180.517,95.805L178.357,96.258L175.072,95.89L168.097,95.098L170.554,93.994L165.109,92.771L169.537,92.289L169.429,91.552L164.182,90.973L165.874,89.344L169.663,88.975L173.56,90.668L177.358,89.31L180.499,90.016L184.576,88.684ZM35.337,87.126L32.529,87.253L31.908,86.03L32.97,84.63L35.265,84.283L37.218,84.973L37.245,86.043L36.957,86.39ZM675,82.59L681.129,84.499L687.681,86.987L687.465,88.54L689.148,89.162L688.572,87.346L695.358,87.719L700.254,90.059L697.77,91.146L693.675,91.404L693.612,93.85L692.613,94.366L690.273,94.294L688.365,93.423L685.044,92.695L684.486,91.607L681.939,91.201L679.104,91.523L677.745,90.647L678.285,89.72L675.288,90.313L676.422,91.489L675,92.551L674.982,92.564L671.769,93.664L668.529,93.478L670.779,94.811L672.273,96.871L673.425,97.544L673.713,98.577L673.074,99.241L668.412,98.695L661.419,100.578L659.196,100.87L655.371,102.626L651.744,104.158L650.826,105.296L647.253,103.565L640.737,105.529L639.603,104.598L637.191,105.673L633.852,105.33L633.042,106.972L630.045,109.392L630.135,110.403L632.979,110.962L632.646,114.601L630.324,114.694L629.253,116.784L630.297,117.863L625.923,119.137L625.059,121.993L621.323,122.602L620.576,125.141L616.976,127.473L616.049,125.751L614.978,122.103L613.583,116.547L614.789,113.082L616.895,111.588L617.03,110.42L620.909,109.862L625.374,106.713L629.685,104.141L634.176,102.148L636.183,98.623L633.15,98.835L631.647,100.895L625.302,103.637L623.258,100.565L616.805,101.416L610.541,105.605L612.611,107.137L607.031,107.788L603.161,108.046L603.341,106.24L599.462,105.859L596.366,107.09L588.716,106.658L580.499,107.399L572.399,112.278L562.814,118.176L566.756,118.489L567.98,120.055L570.41,120.614L572.012,119.361L574.757,119.526L578.366,122.277L578.447,124.401L576.494,126.901L576.287,129.885L575.153,133.883L571.391,137.501L570.545,139.232L567.152,142.143L563.786,145.029L562.175,146.506L558.845,147.97L557.27,148.003L555.695,146.789L552.338,148.617L551.951,149.451L550.997,149.298L549.917,150.149L549.17,150.999L549.26,152.793L547.973,153.343L547.523,153.788L546.587,154.524L544.922,154.934L543.833,155.607L543.752,156.691L543.464,156.966L544.463,157.372L545.876,158.468L548.036,161.417L548.648,163.038L548.675,165.919L547.73,167.294L545.462,167.773L543.464,168.809L541.214,169.025L540.935,167.663L541.403,165.788L540.296,163.186L542.15,162.767L540.44,160.626L539.225,160.148L538.919,160.621L538.19,160.829L538.1,160.355L537.452,160.126L536.777,159.729L537.47,158.629L538.055,158.337L537.83,157.88L538.469,156.53L538.307,156.119L536.84,155.848L535.661,155.18L532.169,155.903L530.333,157.076L527.633,157.757L528.965,156.597L528.443,155.624L530.423,153.944L529.1,152.633L526.922,153.517L524.095,155.256L522.556,156.868L520.108,156.991L518.83,158.155L520.153,159.847L522.196,160.258L522.277,161.379L524.257,162.107L527.057,160.325L529.28,161.299L530.891,161.362L531.305,162.674L527.759,163.372L526.589,164.722L524.158,165.974L522.88,167.726L525.572,169.097L526.553,171.56L528.074,173.849L529.775,175.77L529.73,177.627L528.164,178.309L528.758,179.642L530.234,180.42L529.847,182.455L529.208,184.436L527.813,184.66L525.986,187.368L523.96,190.647L521.638,193.631L518.2,195.937L514.726,198.044L511.909,198.332L510.379,199.44L509.515,198.628L508.102,199.872L504.61,201.124L501.964,201.505L501.109,204.146L499.723,204.294L499.066,202.478L499.66,201.514L496.303,200.71L495.124,201.12L491.785,203.257L489.706,205.618L489.157,207.353L491.065,209.989L493.405,213.256L495.673,214.8L497.194,216.81L498.337,221.435L498.004,225.832L495.916,227.478L493.054,229.09L491.011,231.172L487.897,233.499L486.988,231.899L487.69,230.203L485.836,228.785L483.739,228.417L482.731,227.118L481.462,224.533L479.221,223.386L477.079,223.432L477.448,221.469L475.243,221.482L475.045,224.232L473.695,227.884L472.885,230.093L473.056,231.904L474.685,231.98L475.702,234.26L476.152,236.427L477.547,237.857L479.059,238.149L480.355,239.444L480.931,239.681L482.407,241.187L483.451,242.863L483.595,244.547L483.334,245.685L483.577,246.544L483.757,248.021L484.639,248.711L485.62,250.924L485.575,251.766L483.802,251.935L481.435,250.082L478.474,248.097L478.186,246.824L476.737,245.152L476.395,243.083L475.495,241.72L475.765,239.897L475.216,238.839L474.226,237.878L473.803,236.643L472.471,235.229L471.256,234.045L470.851,235.513L470.374,234.125L470.644,232.564L471.382,230.169L471.139,228.311L471.913,226.399L471.067,224.918L471.274,222.193L470.257,220.898L469.447,217.906L468.997,214.75L467.908,212.676L466.261,213.933L463.426,215.714L462.022,215.49L460.474,214.906L461.338,211.809L460.816,209.465L458.854,206.583L459.16,205.682L457.693,205.36L455.92,203.325L455.209,202.017L455.065,200.744L454.588,199.542L453.544,198.086L451.24,197.989L451.465,199.017L450.682,200.409L449.62,199.902L449.251,200.359L448.549,200.083L447.577,199.859L447.226,200.773L445.525,200.744L442.438,201.26L442.582,203.143L441.25,204.62L437.65,206.304L434.851,209.244L432.97,210.823L430.486,212.456L430.477,213.607L429.235,214.225L426.985,215.122L425.815,215.253L425.059,217.157L425.581,220.411L425.716,222.485L424.653,224.858L424.644,229.107L423.348,229.229L422.214,231.133L422.97,231.959L420.693,232.665L419.856,234.366L418.848,235.086L416.481,232.75L415.329,229.251L414.366,226.729L413.493,225.548L412.161,223.145L411.54,220.018L411.108,218.456L408.831,215.025L407.796,210.18L407.049,206.981L407.058,203.951L406.572,201.611L402.936,203.105L401.172,202.809L397.914,199.779L399.111,198.873L398.373,197.892L395.439,195.772L393.612,195.137L392.865,193.339L390.93,191.439L386.322,191.908L382.263,191.955L378.744,192.306L374.037,191.549L371.319,190.973L368.493,190.652L367.431,187.584L366.234,187.14L364.308,187.588L361.788,188.798L358.737,187.969L356.208,186.048L353.805,185.337L352.131,182.963L350.286,179.629L348.945,180.035L347.352,179.206L346.425,180.183L344.94,180.061L345.462,181.165L345.237,181.736L346.038,183.619L347.019,185.777L348.252,186.348L348.675,187.224L350.385,188.274L350.529,189.306L350.286,190.14L350.601,190.982L351.321,191.68L351.654,192.501L352.023,193.114L351.861,191.295L352.536,189.983L353.22,189.712L353.976,190.499L354.021,191.959L353.472,193.432L353.949,194.388L354.39,194.265L354.489,194.951L356.442,194.557L358.512,194.621L360.024,194.697L361.734,193.004L363.597,191.401L365.181,189.86L365.901,189.01L366.216,189.226L365.982,190.258L365.649,190.715L365.991,192.687L367.116,194.396L368.511,195.302L370.347,195.632L371.823,196.085L372.948,197.519L373.623,198.349L374.523,198.666L374.514,199.225L373.605,200.714L373.209,201.416L372.156,202.216L371.22,203.926L370.086,203.794L369.564,204.391L369.168,205.66L369.474,207.332L369.24,207.637L368.088,207.628L366.522,208.563L366.279,209.782L365.712,210.311L364.155,210.29L363.174,210.92L363.183,211.931L361.977,212.625L360.6,212.388L358.926,213.23L357.774,213.37L355.965,214.043L355.479,215.156L355.425,216.006L352.932,217.06L348.936,218.228L346.695,219.992L345.597,220.128L344.85,219.984L343.383,221.02L341.79,221.499L339.693,221.63L339.063,221.774L338.514,222.434L337.857,222.616L337.479,223.25L336.237,223.195L335.436,223.534L333.708,223.407L333.06,221.947L333.132,220.58L332.718,219.844L332.232,217.995L331.512,216.967L332.016,216.844L331.755,215.702L332.061,215.219L331.953,214.132L331.629,213.061L330.873,212.312L330.675,211.314L329.388,210.417L328.056,208.322L327.345,206.282L325.617,204.565L324.5,204.154L322.844,201.772L322.556,200.033L322.664,198.552L321.233,195.78L320.063,194.803L318.713,194.286L317.885,192.852L318.02,192.289L317.327,190.99L316.598,190.436L315.626,188.574L314.096,186.56L312.827,184.842L311.576,184.855L311.972,183.479L312.08,182.608L312.386,181.609L312.305,181.245L311.603,182.252L311.063,184.14L310.388,185.443L309.803,185.879L308.966,185.071L307.841,183.958L306.059,180.374L305.798,180.598L306.833,183.238L308.372,185.752L310.262,189.645L311.18,191.003L311.99,192.416L314.231,195.184L313.736,195.619L313.817,197.244L316.724,199.487L317.165,199.999L317.975,202.453L317.426,202.906L317.786,205.479L318.704,208.466L319.658,209.079L321.026,210.006L322.475,212.896L323.168,215.194L324.536,216.412L327.948,218.774L329.334,220.195L330.693,221.638L331.476,222.497L332.7,223.25L333.294,224.025L333.213,225.061L331.791,225.662L332.862,226.344L333.681,226.805L334.167,227.837L335.292,228.887L336.534,228.895L338.892,228.256L341.61,227.96L343.815,227.181L345.057,227.016L345.948,226.559L347.37,226.475L348.171,226.424L349.323,226.052L350.646,225.802L351.834,224.947L352.779,224.939L352.833,225.628L352.608,227.084L352.617,228.396L352.086,229.301L351.384,232.005L350.178,234.794L348.63,237.988L346.488,241.653L344.355,244.45L341.412,247.86L338.91,249.887L335.175,252.367L332.844,254.271L330.108,257.296L329.532,258.616L328.965,259.209L327.21,260.207L326.598,261.248L325.662,261.435L325.302,263.195L324.5,264.202L324.014,265.865L323.006,266.69L321.854,269.77L321.998,271.188L323.6,272.102L323.672,272.749L322.988,274.26L323.132,275.022L322.97,276.215L323.843,277.78L324.878,280.247L325.788,280.793L326.193,281.914L326.094,284.403L326.4,286.599L326.499,290.504L326.94,291.731L326.193,293.517L325.221,295.252L323.627,296.801L321.341,297.753L318.524,298.967L315.707,301.65L314.744,302.107L312.998,303.884L311.963,304.459L311.756,306.241L312.944,308.136L313.43,309.6L313.466,310.349L313.907,310.227L313.835,312.677L313.43,313.836L314.015,314.268L313.646,315.309L312.602,316.197L310.541,317.039L307.535,318.393L306.437,319.32L306.653,320.369L307.292,320.539L307.076,321.855L306.446,323.674L306.158,325.752L305.51,326.882L303.8,328.142L303.314,328.506L302.252,329.776L301.559,331.058L300.137,332.852L297.311,335.429L295.547,336.931L293.666,338.069L291.047,339.038L289.778,339.169L289.454,339.863L287.933,339.491L286.691,339.969L283.982,339.487L282.47,339.792L281.435,339.66L278.861,340.646L276.719,341.044L275.18,341.988L274.037,342.047L272.984,341.158L272.138,341.112L271.058,339.995L270.941,340.342L270.608,339.669L270.626,338.205L269.816,336.529L270.617,336.072L270.554,334.155L268.916,331.815L267.665,329.695L267.656,329.691L265.865,326.441L264.002,324.554L263.03,322.726L262.472,320.293L261.86,318.482L261.023,314.632L260.96,311.64L260.645,310.278L259.673,309.249L258.377,307.18L257.063,304.184L256.523,302.614L254.489,300.173L254.336,298.256L254.102,296.682L254.444,294.486L255.308,292.197L255.443,291.122L256.253,288.871L256.847,287.843L258.278,286.209L259.088,285.096L259.349,283.243L259.214,281.826L258.467,280.933L257.801,279.418L257.189,277.916L257.324,277.4L258.089,276.405L257.333,273.993L256.82,272.318L255.569,270.735L255.803,270.249L255.452,269.474L254.786,267.595L252.734,264.947L250.169,262.425L248.513,260.36L246.992,257.779L247.073,256.949L247.622,256.149L248.225,254.33L248.729,252.477L248.261,252.096L249.125,249.29L249.485,247.314L248.513,245.664L247.37,245.241L246.866,244.12L246.227,243.76L246.254,243.07L243.653,243.972L242.708,243.836L241.745,244.399L239.747,244.344L238.406,242.778L237.587,240.971L235.814,239.321L233.933,239.355L231.728,239.351L229.667,239.643L227.651,240.176L223.726,241.64L222.34,242.499L220.09,243.223L217.858,242.512L216.724,242.541L214.978,242.05L213.376,242.08L210.415,242.516L208.678,243.235L206.203,244.153L205.717,244.09L205.06,244.111L202.486,242.918L200.218,241.014L198.085,239.647L196.402,238.035L195.727,237.849L193.927,236.842L192.631,235.505L192.19,234.591L191.884,232.741L190.786,231.265L189.814,230.283L189.175,229.961L188.554,229.462L188.266,228.358L187.897,227.808L187.177,227.397L185.836,226.352L184.783,226.187L184.216,225.485L184.225,225.104L183.469,224.575L183.307,224.037L182.893,222.121L183.217,221.012L182.182,219.066L180.94,218.177L182.038,217.703L183.244,215.947L183.838,214.661L183.622,213.315L184.324,212.084L184.63,209.727L184.36,207.26L184.054,206.016L184.306,204.768L183.658,203.579L182.344,202.5L182.452,201.446L182.569,200.287L183.523,199.605L184.342,198.302L184.18,197.456L185.044,195.691L186.439,194.1L187.276,193.698L187.942,192.243L187.996,190.91L188.896,189.365L190.561,188.451L192.154,185.9L193.45,184.905L195.781,184.626L197.752,182.921L199.003,182.252L201.091,180.166L200.461,177.056L201.415,174.907L201.748,173.586L203.359,171.898L205.861,170.756L207.715,169.723L209.389,167.134L210.172,165.602L212.017,165.61L213.52,166.672L215.896,166.499L218.488,167.053L219.577,167.079L221.98,165.712L224.68,165.28L226.256,164.248L228.668,163.486L232.907,163.042L237.038,162.839L238.298,163.207L240.656,162.225L243.329,162.204L244.346,162.784L246.056,162.636L248.774,161.624L250.529,161.925L250.448,163.19L252.572,162.272L252.752,162.75L251.501,163.973L251.483,165.132L252.347,165.754L252.023,167.916L250.376,169.173L250.853,170.536L252.14,170.578L252.77,171.767L253.724,172.156L256.658,173.019L257.711,172.804L259.799,173.218L263.111,174.335L264.281,176.561L266.531,177.044L270.05,178.093L272.714,179.333L273.938,178.685L275.135,177.534L274.55,175.622L275.333,174.403L277.133,173.231L278.861,172.893L282.236,173.405L283.091,174.522L284.027,174.53L284.819,174.957L287.303,175.249L287.915,176.079L291.236,176.036L293.648,176.697L296.123,177.437L297.284,177.826L299.21,177.031L300.236,176.316L302.441,176.108L304.223,176.426L304.898,177.666L305.483,176.849L307.481,177.441L309.434,177.581L310.667,176.95L311.387,176.13L311.216,175.986L311.882,174.818L312.386,172.931L312.746,172.3L312.818,172.275L313.709,170.235L314.951,168.475L314.996,168.386L314.762,166.474L315.374,165.445L314.456,164.311L315.401,163.372L313.88,163.588L311.783,163.012L310.064,164.451L306.275,164.73L304.25,163.389L301.55,163.304L300.974,164.341L299.246,164.641L296.834,163.308L294.107,163.351L292.622,160.867L290.795,159.479L292.01,157.537L290.426,156.339L293.198,153.949L297.05,153.851L298.103,151.951L302.864,152.281L305.87,150.661L308.786,149.954L312.917,149.899L317.282,151.659L320.873,152.628L323.78,152.243L325.932,152.468L328.884,151.16L329.262,150.094L328.632,148.389L327.192,147.466L325.806,147.178L324.887,146.412L321.701,144.301L318.848,143.357L316.688,141.889L318.506,141.487L320.585,139.397L319.181,138.407L322.871,137.387L322.799,136.841L320.558,137.243L318.56,137.446L316.895,138.254L314.555,138.386L312.404,139.316L312.548,140.874L313.772,141.474L316.328,141.326L315.833,142.215L313.097,142.651L309.704,144.098L308.318,143.586L308.867,142.414L306.131,141.682L306.581,141.204L308.966,140.37L308.246,139.799L304.358,139.168L304.187,138.233L301.874,138.542L300.947,139.917L299.012,141.766L299.066,142.41L297.851,142.951L297.095,142.714L296.393,145.731L295.097,146.768L294.188,148.554L294.989,149.98L295.286,150.944L297.473,151.748L297.014,152.362L294.044,152.501L292.982,153.272L290.894,154.621L290.111,153.458L290.138,152.942L288.617,152.87L287.312,152.633L284.288,153.284L286.016,154.689L284.747,155.095L283.361,155.095L282.038,153.809L281.57,154.359L282.128,155.853L283.379,157.025L282.434,157.575L283.829,158.726L285.062,159.449L285.098,160.863L282.785,160.198L283.523,161.476L281.939,161.739L282.884,163.943L281.228,163.973L279.176,162.885L278.24,160.888L277.799,159.225L276.827,158.074L275.54,156.648L275.378,155.937L274.946,155.764L274.901,155.214L273.515,154.372L273.299,153.183L273.506,151.477L273.848,150.699L273.434,150.305L272.903,150.111L272.201,149.298L271.121,148.799L268.772,147.877L267.323,146.975L265.037,146.231L262.94,144.39L263.444,144.204L262.301,143.154L262.256,142.308L260.645,141.914L259.88,142.993L259.142,142.156L259.196,141.288L259.286,141.25L259.844,141.022L257.855,140.658L255.821,141.546L255.956,142.786L255.65,143.497L256.469,144.771L258.818,146.032L260.078,148.097L262.859,150.111L264.812,150.098L265.424,150.648L264.722,151.147L266.963,152.049L268.799,152.806L270.941,154.109L271.202,154.579L270.734,155.472L269.348,154.304L267.17,153.894L266.126,155.51L267.926,156.437L267.629,157.744L266.585,157.892L265.253,160.033L264.209,160.228L264.218,159.462L264.731,158.121L265.271,157.588L264.299,156.14L263.534,154.879L262.499,154.566L261.761,153.487L260.15,153.035L259.07,152.028L257.216,151.867L255.263,150.737L252.977,149.112L251.276,147.669L250.502,145.198L249.26,144.91L247.226,144.085L246.074,144.424L244.625,145.583L243.59,145.765L241.322,147.178L236.39,146.501L232.754,147.314L232.466,148.816L232.601,150.271L230.234,151.934L227.03,152.463L226.805,153.305L225.266,154.689L224.302,156.724L225.275,158.155L223.834,159.267L223.294,160.892L221.404,161.392L219.631,163.317L216.463,163.351L214.078,163.304L212.512,164.189L211.558,165.132L210.334,164.925L209.407,164.083L208.696,162.644L206.365,162.255L205.357,162.902L204.043,162.551L202.756,162.826L203.134,160.871L202.9,159.335L201.784,159.102L201.181,158.155L201.379,156.521L202.378,155.612L202.558,154.6L203.08,153.098L203.026,152.04L202.522,151.143L202.414,150.297L202.54,148.52L201.514,147.432L205.051,145.63L208.111,146.082L211.468,146.065L214.132,146.493L216.202,146.362L220.243,146.442L221.539,144.944L222.016,139.964L219.433,137.34L217.588,136.075L213.772,135.11L213.52,133.291L216.76,132.745L220.954,133.388L220.162,130.557L222.529,131.632L228.344,129.682L229.1,127.634L231.287,127.13L233.285,126.635L234.572,125.949L236.768,122.268L240.188,121.223L242.267,121.295L242.753,120.766L244.841,120.631L245.309,121.181L247.001,119.949L246.434,119.01L246.317,117.592L245.3,116.205L245.228,113.649L245.642,112.976L246.362,112.223L248.558,112.07L249.44,111.381L251.447,110.674L251.366,111.96L250.628,112.773L250.925,113.475L252.284,113.852L251.672,114.795L250.925,114.525L249.125,116.323L249.809,117.542L249.845,118.506L252.374,119.09L252.347,119.979L254.894,119.509L256.298,118.824L259.115,119.81L260.303,120.609L262.004,119.873L265.91,118.718L269.06,117.872L271.553,118.295L271.742,118.904L274.154,118.934L274.721,117.834L278.168,117.025L277.637,114.922L277.727,113.039L278.951,111.47L281.309,110.615L283.298,112.485L285.305,112.434L285.782,110.518L286.07,109.041L285.152,109.358L283.568,108.47L283.352,107.031L286.511,106.337L289.661,105.973L292.37,106.383L294.953,106.312L297.797,104.928L295.178,103.743L290.642,103.942L286.241,104.856L282.173,105.385L280.724,104.022L278.303,103.197L278.861,100.739L277.646,98.479L278.843,97.024L281.111,95.454L286.826,92.746L288.491,92.221L288.239,91.163L284.756,89.983L280.454,90.689L278.033,92.437L278.42,93.964L274.451,95.974L269.618,98.128L267.8,101.649L269.582,103.409L271.967,104.797L269.672,107.615L267.071,108.199L266.117,112.396L264.704,114.74L261.671,114.499L260.249,116.48L257.36,116.594L256.559,114.233L254.471,111.393L252.572,107.86L250.889,106.324L245.957,109.218L242.627,109.802L239.162,108.529L238.271,105.842L237.479,100.07L239.783,98.462L246.38,96.364L251.321,93.787L255.893,90.3L261.905,85.472L266.09,83.593L272.957,80.458L278.447,79.362L282.56,79.493L286.367,77.424L290.921,77.534L295.412,77.034L303.233,78.867L300.011,79.535L302.756,81.105L305.33,80.233L309.434,81.748L316.283,82.341L325.734,85.167L327.651,86.356L327.813,88.019L325.041,89.335L320.954,89.999L309.794,88.1L307.958,88.417L312.035,90.249L312.359,93.964L315.581,94.726L317.534,95.373L317.858,94.163L316.292,93.05L317.939,92.141L323.987,93.698L326.094,93.088L324.41,91.256L330.234,88.81L332.538,88.954L334.878,89.826L336.327,88.108L334.248,86.619L335.472,85.125L333.636,83.572L340.629,84.376L342.051,85.777L338.892,86.085L338.91,87.473L340.872,88.332L344.733,87.791L345.345,86.195L350.574,85.002L359.295,82.857L361.176,82.98L358.719,84.499L361.815,84.757L363.606,83.902L368.295,83.834L372.003,82.798L374.856,84.304L377.691,82.65L375.072,81.198L376.377,80.373L383.757,81.13L387.222,81.913L396.276,84.769L397.95,83.462L395.412,82.138L395.34,81.609L392.325,81.363L393.153,80.178L391.812,78.228L391.74,77.428L396.348,75.164L397.986,72.892L399.849,72.401L406.464,73.061L406.986,74.449L404.619,76.476L406.176,77.276L406.977,79.023L406.41,82.446L409.173,83.978L408.093,85.65L403.197,89.2L406.059,89.568L407.049,88.667L409.803,88.028L410.469,86.788L412.629,85.599L411.171,84.177L412.341,82.527L409.605,82.319L409.002,80.932L411,78.418L407.751,76.383L412.224,74.699L411.648,72.917L412.899,72.862L414.204,74.25L413.223,76.662L415.896,77.119L414.753,75.317L418.938,74.331L424.131,74.199L428.749,75.625L426.526,73.544L426.274,70.878L430.63,70.374L436.642,70.484L442.06,70.158L440.026,68.851L442.915,67.209L445.786,67.141L450.646,65.902L457.252,65.567L458.089,64.882L464.65,64.649L466.693,65.212L472.309,63.883L476.899,63.926L477.592,62.847L479.977,61.78L485.881,60.756L490.165,61.564L486.763,62.182L492.424,62.563L493.099,63.799L495.385,63.194L502.693,63.223L508.327,64.446L510.334,65.381L509.713,66.68L506.95,67.421L500.38,68.809L498.499,69.549L501.604,69.9L505.294,70.531L507.544,70.057L508.822,71.661L509.92,71.013L513.916,70.62L521.944,71.03L522.547,72.198L533.006,72.57L533.141,70.662L538.451,71.098L542.438,71.085L546.479,72.405L547.631,74.005L546.146,75.05L549.287,77.018L553.22,78.033L555.632,75.41L559.646,76.535L563.903,75.862L568.745,76.633L570.581,75.93L574.676,76.281L572.867,73.958L576.17,72.875L598.751,74.5L600.875,75.985L607.418,77.893L617.516,77.42L622.493,77.834L624.572,78.867L624.275,80.695L627.354,81.406L630.702,80.894L635.13,80.83L639.855,81.321L644.589,81.042L648.945,83.267L652.041,82.468L650.025,80.868L651.132,79.755L659.106,80.458L664.308,80.305L671.499,81.499ZM347.775,151.795L349.044,153.568L350.214,153.686L350.979,154.359L348.927,154.558L348.486,156.5L348.063,157.376L347.145,157.96L347.208,159.2L348,161.045L350.367,161.565L352.104,162.818L355.659,163.249L359.565,162.589L359.808,162.001L359.34,160.236L359.7,157.621L357.756,156.775L358.395,155.061L356.739,154.918L357.288,152.81L359.646,153.424L361.842,152.624L360.024,151.122L359.304,149.692L357.288,150.331L357.036,152.163L356.253,150.542L356.118,149.933L356.73,148.892L356.253,148.02L353.355,147.166L352.23,144.923L350.844,144.288L350.763,143.476L353.193,143.713L353.292,141.885L355.416,141.479L357.603,141.851L358.053,139.414L357.603,137.869L355.101,137.988L352.977,137.378L350.088,138.479L347.757,139.003L346.614,140.484L344.193,140.895L341.709,143.476L343.977,145.85L343.734,147.534L346.461,150.479ZM885.881,82.231L884.324,83.107L880.958,82.349L878.924,82.624L875.504,81.499L877.709,80.724L879.455,79.641L882.11,80.352L883.604,80.8L884.36,81.274ZM675,76.209L675,77.919L672.255,78.046L671.814,77.255ZM675,76.209L675.324,76.108L677.439,76.112L681.057,76.827L680.841,77.17L678.267,77.767L675,77.919ZM0,82.987L1.964,81.854L4.952,83.462L4.205,85.315L6.626,87.004L9.236,85.197L11.054,83.039L11.198,80.297L14.744,80.487L18.443,80.855L21.8,82.095L21.953,83.335L20.09,84.668L21.854,86.005L21.53,87.224L16.634,88.971L13.16,89.356L10.577,88.603L9.83,89.86L7.418,91.967L6.689,93.059L3.791,94.751L0.218,94.916L0,95.031L0,82.987ZM900,95.031L898.238,95.974L898.076,97.599L895.169,97.912L892.109,99.939L889.4,102.753L888.428,104.725L888.293,107.627L891.965,108.046L893.09,110.386L894.26,112.282L897.752,111.787L900,112.298L900,182.011L900,182.011L899.615,182.206L897.797,182.13L895.934,180.805L893.756,181.118L891.938,180.539L890.381,180.716L888.275,181.3L885.998,183.154L883.514,184.233L882.146,185.426L881.579,186.551L881.552,188.274L881.678,189.475L882.146,190.326L882.155,190.33L882.146,190.334L881.183,192.518L880.742,194.32L880.562,197.667L880.319,198.89L880.751,200.253L881.525,201.471L882.029,203.409L883.685,205.271L884.27,206.697L885.251,207.929L887.906,208.593L888.932,209.638L891.128,208.94L893.036,208.686L894.908,208.237L896.483,207.81L898.067,206.79L898.67,205.33L898.868,203.232L899.3,202.5L900,202.227L900,220.843L900,220.843L899.759,220.661L898.481,220.225L896.915,220.178L895.772,219.683L894.431,218.651L891.605,215.96L890.309,215.147L888.275,214.496L886.871,214.678L884.864,215.621L883.604,215.867L881.84,215.207L879.968,214.733L877.628,213.586L875.756,213.235L872.93,212.071L870.833,210.878L870.203,210.209L868.808,210.061L866.252,209.27L865.208,208.127L862.517,206.71L861.266,205.132L860.672,203.913L861.509,203.672L861.248,202.957L861.824,202.309L861.833,201.446L860.996,200.32L860.771,199.326L859.925,198.065L857.729,195.581L855.209,193.626L853.994,192.069L851.852,191.049L851.393,190.436L851.771,188.891L850.493,188.312L849.017,187.093L848.396,185.35L847.055,185.147L845.597,183.831L844.427,182.612L844.319,181.833L842.978,179.946L842.087,178.034L842.132,177.073L840.323,176.079L839.486,176.189L838.055,175.499L837.659,176.515L838.073,177.716L838.316,179.595L839.171,180.623L841.025,182.345L841.439,182.934L841.817,183.111L842.15,183.97L842.591,183.936L843.095,185.549L843.86,186.183L844.391,187.072L845.957,188.341L846.785,190.669L847.532,191.765L848.225,192.937L848.36,194.253L849.566,194.337L850.574,195.471L851.474,196.588L851.42,197.037L850.367,197.955L849.926,197.942L849.26,196.423L847.622,194.997L845.822,193.787L844.544,193.152L844.625,191.325L844.247,189.97L843.059,189.196L841.34,188.079L841.007,188.401L840.377,187.749L838.838,187.144L837.362,185.693L837.542,185.506L838.577,185.646L839.504,184.711L839.594,183.585L837.668,181.8L836.201,181.11L835.283,179.549L834.356,177.907L833.195,175.91L832.178,173.663L831.764,172.385L830.144,170.946L828.974,170.646L828.704,169.931L827.3,169.804L826.4,169.131L824.077,168.881L823.447,168.479L823.141,167.108L820.711,164.595L818.632,161.121L818.722,160.541L817.615,159.716L815.68,157.621L815.338,155.582L814.006,154.215L814.555,152.146L814.465,150.001L813.664,148.084L814.645,145.727L815.248,141.191L814.798,137.84L814.006,135.699L813.286,134.539L813.583,134.053L817.201,134.899L818.533,137.26L819.145,136.6L818.749,134.548L817.903,132.5L817.561,132.495L812.728,130.037L810.937,128.958L806.41,127.921L805.015,125.708L805.375,124.176L802.171,123.11L801.739,121.096L798.715,119.281L798.661,117.994L797.284,117.051L795.079,116.255L794.377,114.076L791.155,112.054L789.805,109.692L787.402,109.532L783.433,109.468L780.499,108.749L775.333,106.155L772.939,105.681L768.565,104.788L765.1,105L760.186,103.853L757.216,102.787L754.435,103.316L754.957,105.055L753.571,105.216L750.682,105.736L748.477,106.578L745.714,107.111L745.354,105.639L746.479,103.185L749.134,102.414L748.45,101.788L745.264,103.18L743.554,104.847L739.954,106.625L741.781,107.839L739.423,109.633L736.732,110.678L734.23,111.444L733.609,112.549L729.703,113.839L728.92,115.015L725.995,116.082L724.275,115.891L721.944,116.59L719.406,117.44L717.327,118.274L713.034,118.989L712.647,118.57L715.383,117.402L717.822,116.632L720.486,115.261L723.591,114.982L724.824,113.953L728.29,112.46L728.848,111.956L730.693,111.076L731.125,109.18L732.394,107.704L729.514,108.461L728.704,108.029L727.354,108.939L725.725,107.67L725.05,108.567L724.113,107.323L721.611,108.321L720.081,108.321L719.865,106.832L720.315,105.914L718.704,105.025L715.455,105.503L713.34,104.331L711.63,103.73L711.621,102.317L709.695,101.251L710.667,99.812L712.701,98.416L713.592,97.134L715.617,96.952L717.336,97.349L719.352,96.143L721.161,96.359L723.069,95.585L722.601,94.442L721.206,93.994L723.051,93.029L721.521,93.059L718.866,93.6L718.101,94.155L716.13,93.6L712.602,93.884L708.939,93.283L707.886,92.276L704.727,90.825L708.237,89.779L713.817,88.557L715.869,88.557L715.527,89.805L720.801,89.712L718.776,88.163L715.698,87.207L713.925,85.958L711.522,84.892L708.093,84.101L709.488,82.793L713.925,82.713L717.075,81.571L717.669,80.356L720.225,79.167L722.664,78.879L727.399,77.771L729.703,77.94L733.546,76.607L737.335,77.132L739.144,78.257L740.251,77.775L744.472,77.923L744.328,78.499L748.153,78.926L750.7,78.676L755.965,79.463L760.771,79.7L762.697,80.026L766.027,79.62L769.816,80.369L772.534,80.72L777.196,81.321L781.138,82.523L783.739,82.755L785.935,81.71L788.959,80.932L792.676,81.236L796.42,80.14L800.515,79.514L802.234,80.551L804.097,79.967L804.655,78.791L806.383,79.057L810.613,81.3L813.934,79.603L814.276,81.499L817.345,81.092L818.29,80.36L821.323,80.504L825.14,81.554L830.99,82.472L834.437,82.895L836.885,82.734L840.26,84.004L836.741,85.243L841.259,85.781L848.009,85.485L850.133,85.049L852.797,86.547L855.515,85.281L852.968,84.219L854.579,83.365L857.621,83.25L859.628,83.001L861.644,83.597L864.155,84.956L866.945,84.757L871.364,85.882L875.243,85.485L878.888,85.544L878.6,83.991L880.823,83.555L884.702,84.401L884.684,86.767L886.277,84.774L888.284,84.841L889.418,82.328L886.736,80.788L883.82,79.776L884.018,77.013L886.979,75.198L890.273,75.6L892.802,76.704L896.204,79.523L893.981,80.75L898.634,81.257L898.634,81.257L898.625,83.813L900,82.987L900,95.031ZM0,112.298L2.405,112.87L4.898,113.822L6.689,115.003L9.821,115.688L12.467,116.742L16.598,116.886L19.316,117.131L18.911,119.293L19.685,121.807L21.494,124.604L25.221,126.978L27.147,126.165L28.497,123.597L27.192,119.645L25.428,118.329L29.433,117.161L32.259,115.405L33.645,113.666L33.447,111.994L31.746,109.87L28.704,107.987L31.656,105.368L30.567,103.104L29.73,99.203L31.476,98.623L35.76,99.304L38.334,99.546L40.404,98.89L42.726,99.736L45.804,101.187L46.569,102.156L51.024,102.347L50.952,104.445L51.78,107.606L54.066,107.996L55.875,109.468L59.493,108.08L61.887,105.321L63.543,104.162L65.487,106.392L68.745,109.582L71.508,112.582L70.5,114.152L73.83,115.561L76.08,116.992L80.058,117.635L81.669,118.434L82.659,120.55L84.603,120.88L85.611,121.824L85.791,124.633L83.973,125.573L82.182,126.449L78.06,127.337L74.919,129.394L70.689,129.8L65.343,129.271L61.59,129.254L59.007,129.428L56.91,131.222L53.724,132.33L50.115,135.639L47.235,137.945L49.359,137.535L53.373,134.251L58.62,132.165L62.364,131.916L64.569,133.143L62.211,134.823L63.003,137.518L63.822,139.405L67.071,140.654L71.202,140.29L73.704,137.48L73.875,139.295L75.495,140.201L72.399,141.838L66.864,143.324L64.38,144.335L61.59,146.137L59.691,145.951L59.592,143.836L63.939,141.771L59.934,141.851L57.153,142.156L57.585,142.977L54.921,144.187L52.347,145.05L49.71,145.79L48.279,147.424L47.964,147.838L47.937,149.163L48.765,150.487L49.8,150.551L49.539,149.637L50.286,150.191L50.088,150.906L48.396,151.312L47.199,151.262L45.354,151.702L44.265,151.824L42.807,151.947L40.728,152.671L44.4,152.201L45.138,152.675L41.637,153.424L40.044,153.428L40.116,153.123L39.36,153.817L40.098,153.932L39.558,155.726L37.731,157.651L37.551,157.008L37.002,156.877L36.183,156.255L36.696,157.6L37.29,158.049L37.362,158.988L36.561,159.961L35.148,161.959L34.923,161.857L35.697,160.156L34.419,159.2L34.122,157.126L33.645,158.205L34.176,159.792L32.601,159.42L34.248,160.207L34.356,162.585L35.067,162.758L35.328,163.622L35.679,166.122L34.095,167.98L31.503,168.72L29.865,170.184L28.614,170.345L27.345,171.263L26.994,172.106L24.248,173.726L22.835,174.915L21.656,176.4L21.269,178.173L21.719,179.912L22.547,182.049L23.663,183.818L23.672,184.901L24.86,187.8L24.779,189.484L24.671,190.457L24.05,191.985L23.303,192.298L22.07,191.997L21.674,190.901L20.72,190.326L19.397,188.176L18.236,186.264L17.858,185.286L18.371,183.623L17.678,182.248L15.725,180.158L14.753,179.773L12.224,180.911L11.783,180.784L10.568,179.616L9.002,178.998L6.176,179.316L3.953,179.037L2.045,179.21L0.983,179.561L1.469,180.264L1.424,181.279L1.955,181.774L1.478,182.1L0.551,181.732L0,182.011L0,112.298ZM0,202.227L0.992,201.844L3.638,201.264L5.852,201.353L7.373,201.141L7.967,201.67L7.886,202.876L6.545,204.361L5.951,205.885L6.41,206.321L6.032,207.4L5.411,209.35L4.772,208.707L4.25,208.749L4.259,209.118L4.736,209.13L4.691,209.807L4.286,210.89L4.502,211.276L4.241,212.173L4.403,212.41L4.115,213.675L3.62,214.335L3.17,214.415L2.675,215.283L3.485,215.735L3.701,215.363L4.439,215.68L4.7,215.778L5.249,215.338L5.96,215.304L6.194,215.507L6.581,215.384L7.742,215.608L8.894,215.541L9.704,215.266L9.992,214.986L10.793,215.118L11.387,215.287L12.044,215.228L12.539,215.012L13.682,215.359L14.078,215.414L14.843,215.879L15.563,216.438L16.472,216.823L17.129,217.508L16.913,217.75L16.787,218.308L17.048,219.222L16.472,220.077L16.202,221.08L16.121,222.184L16.256,222.827L16.319,223.953L15.932,224.198L15.698,225.269L15.869,225.929L15.365,226.568L15.473,227.241L15.86,227.651L16.49,229.009L17.462,230.016L18.632,231.083L19.532,231.98L19.478,232.509L20.477,232.623L20.711,232.42L21.404,233.033L22.628,232.856L23.699,232.221L25.212,231.717L26.067,230.973L27.444,231.117L27.354,231.362L28.749,231.451L29.865,231.882L30.675,232.631L31.62,233.325L32.907,233.402L34.788,231.658L35.814,231.392L35.841,230.566L36.3,228.451L37.731,227.291L39.306,227.245L39.504,226.724L41.466,226.932L43.428,225.671L44.409,225.112L45.615,223.906L46.497,224.059L47.154,224.719L46.668,225.561L46.596,226.149L45.129,226.441L45.948,227.575L45.921,228.882L44.814,230.334L45.759,232.318L46.839,232.157L47.397,230.351L46.623,229.471L46.497,227.579L49.611,226.559L49.269,225.383L50.142,224.596L51.042,226.352L52.797,226.39L54.417,227.786L54.516,228.612L56.757,228.637L59.43,228.379L60.861,229.496L62.778,229.805L64.173,229.026L64.209,228.396L67.305,228.248L70.302,228.21L68.178,228.95L69.033,230.131L71.031,230.317L72.921,231.548L73.326,233.55L74.622,233.495L75.603,234.083L77.25,235.001L78.789,236.63L78.861,237.916L79.806,237.976L81.147,239.199L82.128,240.066L85.125,240.569L85.395,240.117L87.42,239.935L90.102,240.608L90.957,240.883L92.793,241.475L95.439,243.586L95.853,244.61L96.708,244.492L97.329,245.876L98.724,250.247L100.065,250.657L100.128,252.384L98.256,254.444L99.03,255.197L103.449,255.587L103.539,258.096L105.438,256.454L108.579,257.351L112.737,258.879L113.952,260.343L113.547,261.726L116.454,260.956L121.314,262.281L125.05,262.183L128.749,264.253L131.944,267.054L133.87,267.773L136.003,267.875L136.912,268.662L137.758,271.844L138.172,273.359L137.182,277.493L135.904,279.122L132.385,282.6L130.792,285.427L128.938,287.597L128.317,287.644L127.615,289.484L127.795,294.169L127.102,298.019L126.832,299.669L126.04,300.655L125.599,303.998L123.06,307.261L122.637,309.842L120.612,310.925L120.027,312.427L117.309,312.419L113.376,313.379L111.621,314.492L108.822,315.224L105.879,317.213L103.764,319.692L103.395,321.558L103.809,322.938L103.35,325.464L102.783,326.687L101.028,328.062L98.256,332.463L96.06,334.443L94.359,335.615L93.216,337.993L91.569,339.419L90.48,340.993L87.663,342.381L85.818,341.882L84.459,342.148L82.155,341.078L80.454,341.158L78.933,339.775L78.762,341.078L81.939,343.219L81.597,344.945L83.154,346.033L83.028,347.256L80.625,350.459L76.917,351.8L71.904,352.321L69.159,352.071L69.69,353.56L69.177,355.431L69.636,356.692L68.133,357.572L65.577,357.919L63.174,357.005L62.202,357.661L62.553,360.145L64.245,360.898L65.613,360.111L66.351,361.41L64.056,362.184L62.049,363.737L61.68,366.255L61.086,367.592L58.728,367.6L56.766,368.878L56.046,370.753L58.512,372.585L60.897,373.088L60.033,375.335L57.081,376.744L55.461,379.672L53.175,380.663L52.158,381.83L52.959,384.429L54.624,385.876L53.571,385.749L51.348,385.732L50.142,386.345L47.892,387.247L47.487,389.582L46.425,389.642L43.608,388.829L40.746,387.086L37.632,385.656L36.849,384.073L37.56,382.609L36.3,380.946L35.976,376.685L37.047,374.282L39.684,372.348L35.886,371.62L38.271,369.411L39.117,365.256L41.898,366.136L43.203,360.957L41.529,360.293L40.746,363.415L39.171,363.064L39.954,359.489L40.809,354.855L41.952,353.146L41.241,350.709L41.034,347.89L42.087,347.81L43.617,343.773L45.345,339.775L46.407,336.047L45.831,332.302L46.578,330.241L46.272,327.152L47.739,324.101L48.189,319.265L48.99,314.073L49.773,308.483L49.593,304.392L49.071,300.871L46.56,299.432L46.344,298.408L41.385,295.899L36.903,293.166L34.977,291.621L33.942,289.556L34.356,288.837L32.232,285.558L29.766,280.945L27.408,275.965L26.382,274.827L25.599,272.986L23.654,271.353L21.872,270.342L22.682,269.225L21.476,266.842L22.25,265.09L24.239,263.512L25.572,261.642L25.032,260.55L24.077,261.714L22.583,260.618L23.087,259.911L22.664,257.643L23.537,257.267L24.005,255.709L24.95,254.097L24.77,253.078L26.148,252.544L27.858,251.546L27.525,250.771L28.452,250.585L28.344,249.333L28.929,248.427L30.171,248.258L31.224,246.688L32.178,245.376L31.26,244.78L31.728,243.328L31.17,241.043L31.701,240.388L31.305,238.272L30.297,236.939L29.46,236.22L28.929,234.87L29.541,234.201L28.911,234.032L28.443,233.207L27.201,232.509L26.103,232.669L25.599,233.537L24.59,234.167L24.041,234.252L23.798,234.772L24.986,236.131L24.311,236.452L23.951,236.82L22.781,236.947L22.349,235.454L22.025,235.881L21.197,235.733L20.693,234.726L19.667,234.561L19.019,234.269L17.948,234.273L17.876,234.815L17.588,234.438L16.229,233.884L15.725,233.359L16.013,232.923L15.914,232.373L15.221,231.772L14.24,231.282L13.385,230.96L13.214,230.228L12.557,229.784L12.719,230.511L12.224,231.108L11.648,230.414L10.847,230.169L10.505,229.661L10.523,228.904L10.847,228.112L10.145,227.761L10.721,227.279L9.857,226.492L8.687,225.485L8.138,224.638L7.085,223.855L5.825,222.726L6.104,222.336L6.518,222.713L6.707,222.54L6.275,221.757L5.519,221.537L5.24,222.129L3.791,222.091L2.891,221.85L1.856,221.355L0.47,221.198L0,220.843L0,202.227ZM839.585,72.198L838.334,73.37L843.896,72.613L847.37,73.874L850.196,72.596L852.482,73.417L854.525,75.871L855.785,74.838L854.012,72.274L856.208,71.91L858.692,72.308L861.491,73.319L863.066,75.752L863.84,77.517L868.034,78.757L872.552,79.937L872.273,81.037L868.169,81.24L869.771,82.201L868.925,83.119L864.398,82.726L860.096,82.049L857.198,82.201L852.5,83.052L845.084,83.487L841.718,83.661L840.359,82.48L836.948,81.799L834.734,82.078L831.647,80.098L833.312,79.836L837.173,79.408L840.701,79.518L843.959,79.082L839.126,78.499L833.78,78.697L830.234,78.647L828.92,77.728L834.716,76.726L830.864,76.764L826.499,76.104L828.596,74.229L830.333,73.235L837.029,71.716ZM863.75,71.449L861.554,73.099L857.648,71.352L858.503,71.001L861.851,70.899ZM34.149,72.245L34.374,72.934L31.71,72.862L29.019,72.807L26.283,73.146L25.563,72.994L22.808,71.669L22.916,70.768L24.113,70.603L29.838,70.869ZM900,76.014L899.489,74.411L900,73.793L900,76.014ZM0,73.793L1.406,72.177L3.98,71.157L10.433,70.489L8.597,72.105L8.597,72.105L10.568,73.666L12.872,71.648L19.208,70.624L23.501,73.209L23.123,74.847L28.074,74.119L30.441,73.125L35.985,74.39L39.432,75.583L39.756,76.675L44.391,76.108L47.001,77.699L53.031,78.689L55.209,79.696L57.576,82.036L52.986,83.2L58.872,84.833L62.841,85.383L66.441,87.681L70.374,87.846L69.591,89.598L65.208,92.504L62.13,91.434L58.197,89.03L54.966,89.344L54.651,90.774L57.279,92.229L60.672,93.38L61.698,94.045L63.327,96.516L62.463,98.314L59.313,97.637L53.04,95.636L56.577,97.789L59.178,99.3L59.583,100.172L52.806,99.173L47.442,97.722L44.409,96.507L45.282,95.801L41.556,94.514L37.911,93.304L37.956,94.028L30.729,94.426L28.614,93.567L30.261,91.726L34.959,91.684L40.098,91.362L39.27,90.469L40.134,89.225L43.374,86.788L42.681,85.683L41.718,84.824L37.893,83.614L32.826,82.764L34.428,82.129L31.782,80.576L29.577,80.432L27.606,79.582L26.265,80.322L21.737,80.644L12.638,80.085L7.346,79.349L3.296,78.972L1.217,78.097L3.827,76.954L0.281,76.946L0,76.014L0,73.793ZM874.109,70.391L877.088,70.916L881.552,70.599L882.2,71.326L879.869,72.524L883.649,73.599L883.199,75.85L879.104,76.819L876.692,76.607L874.964,75.655L868.754,73.726L868.799,72.926L873.902,73.235L871.148,71.601ZM584.009,71.97L580.22,71.986L575.099,71.707L574.658,71.576L577.025,70.586L580.157,70.357L583.703,71.314ZM892.01,73.07L889.328,74.94L886.475,74.847L884.918,72.651L884.954,71.407L886.259,70.345L888.743,69.663L893.954,69.748L898.724,70.357L894.989,72.583ZM823.852,76.501L817.273,77.745L815.95,76.649L810.181,75.329L811.018,74.513L812.98,72.443L815.149,70.802L812.701,69.27L821.152,68.876L824.725,69.397L831.107,69.536L833.537,70.26L836.219,71.314L833.078,71.944L826.949,73.7L823.852,75.452ZM601.829,67.29L598.94,68.28L594.944,68.055L590.3,67.07L590.894,66.257L595.556,66.634ZM890.966,67.552L889.607,68.521L885.98,68.335L882.947,67.679L884.279,66.553L887.87,65.881L890.057,66.761ZM587.717,66.092L585.746,67.95L576.539,67.882L572.39,68.47L567.44,66.845L568.781,65.127L572.075,64.658L578.681,64.768ZM878.753,63.202L880.661,64.357L880.742,65.639L879.599,67.501L875.477,67.755L872.795,67.357L872.84,65.897L868.745,66.092L868.583,64.158L871.274,64.235L875.045,63.384L878.555,63.528ZM854.471,64.497L855.452,65.385L857.675,64.967L860.294,65.077L860.735,66.299L859.214,67.488L850.754,67.874L844.445,68.957L840.638,69.016L840.323,68.199L845.516,67.095L834.221,67.391L830.72,66.943L834.131,64.501L836.489,63.803L843.527,64.645L847.964,66.126L852.329,66.316L848.756,63.926L851.051,63.016L853.625,63.304ZM368.835,78.198L367.359,78.418L359.196,78.092L358.53,76.984L354.003,76.315L353.643,74.961L356.199,74.428L356.109,73.061L361.068,70.933L358.773,70.624L364.758,68.432L364.083,67.298L369.672,65.978L377.925,64.37L386.25,63.904L390.525,62.974L395.394,62.652L397.131,63.638L395.448,64.416L386.592,65.656L378.96,66.85L371.193,69.228L367.467,71.669L363.552,74.073L364.056,76.15ZM0,65.292L0.443,65.381L2.036,65.974L5.402,66.084L9.056,66.295L13.025,65.754L18.119,65.538L22.178,65.715L24.86,66.659L25.419,67.692L23.852,68.356L20.126,68.893L16.931,68.589L9.758,68.974L4.628,69.02L0.587,68.711L0,68.636L0,65.292ZM900,68.636L893.945,67.907L893.081,66.532L892.775,65.292L890.264,64.201L885.098,63.896L882.2,63.122L883.136,62.098L888.293,62.254L888.293,62.254L891.065,63.058L895.988,63.054L898.148,63.875L897.572,64.814L900,65.292L900,68.636ZM834.5,60.887L834.158,62.809L832.232,63.676L829.901,63.799L825.248,64.865L821.251,65.25L817.858,64.708L822.106,62.838L827.237,61.218L831.071,61.256ZM890.399,61.201L889.265,61.273L884.576,61.112L883.91,60.414L888.941,60.452L890.696,60.913ZM849.53,60.756L844.868,61.476L841.169,60.667L843.185,59.872L846.839,59.618L850.367,60.007ZM286.808,60.367L281.228,61.387L276.818,60.807L278.537,60.164L277.034,59.364L282.209,58.861L283.199,59.8ZM850.844,58.497L847.793,58.983L843.644,58.979L843.689,58.624L846.254,57.875L847.595,57.989ZM885.422,59.859L881.723,60.375L879.689,59.792L878.618,58.856L878.42,57.82L881.66,57.921L883.118,58.086L886.106,58.954ZM874.847,59.186L875.819,60.232L871.742,59.952L867.629,59.14L862.058,59.051L864.47,58.306L861.455,57.705L861.266,56.745L866.18,57.088L872.939,57.997ZM487.69,59.233L473.596,60.198L478.159,56.914L480.22,56.635L482.092,56.796L488.428,58.217ZM270.626,55.746L278.861,57.608L272.57,58.594L271.175,60.435L268.988,60.904L267.8,62.978L264.785,63.075L259.403,61.548L261.671,60.659L257.927,59.94L253.058,57.828L251.114,55.869L257.927,54.972L259.295,55.848L262.859,55.814L263.804,54.959L267.476,54.875ZM288.617,53.982L293.522,54.858L289.814,56.203L282.56,56.5L275.189,56.085L274.739,55.395L271.157,55.349L268.421,54.202L276.143,53.504L279.77,54.105L282.299,53.356ZM352.842,53.631L349.485,53.961L347.235,54.151L346.884,54.562L343.968,54.976L341.259,54.384L342.681,53.601L337.119,53.525L341.997,53.072L345.795,53.038L346.308,53.715L347.739,53.114L350.097,52.704L353.805,53.25ZM474.847,57.799L469.393,58.107L462.436,57.388L458.278,56.432L456.361,54.642L452.95,54.147L459.448,52.437L464.848,51.875L469.708,53.131L475.468,55.552ZM900,59.377L897.986,59.461L892.811,59.14L890.12,58.124L890.156,57.215L892.136,56.55L887.564,56.567L884.81,55.738L883.226,54.604L884.963,53.495L886.691,52.734L889.256,52.556L888.158,51.985L893.972,51.858L897.167,53.191L900,53.547L900,59.377ZM0,53.547L1.379,53.728L5.474,54.202L7.454,55.852L7.454,55.852L10.46,56.656L7.031,57.401L2.414,59.284L0,59.377L0,53.547ZM900,52.084L899.498,51.849L896.582,51.117L896.033,50.262L899.75,49.789L900,49.781L900,52.084ZM0,49.781L2.666,49.708L7.571,49.302L11.252,48.371L14.348,48.498L17.048,49.2L18.947,47.851L22.25,47.449L26.733,47.174L34.374,47.072L35.706,47.339L42.924,46.915L48.333,47.076L53.751,47.233L53.751,47.233L60.429,47.432L65.802,47.749L70.374,48.43L70.266,49.095L64.164,50.182L58.116,50.686L55.857,51.248L61.302,51.236L55.398,52.751L51.33,53.457L47.046,55.501L41.889,55.916L40.296,56.423L32.727,56.694L36.174,57.007L34.446,57.452L36.516,58.687L34.14,59.542L30.279,60.249L29.091,61.23L25.599,61.975L25.95,62.542L30.225,62.445L30.279,63.054L23.6,64.556L17.066,63.866L9.722,64.251L5.996,63.951L1.271,63.82L0.956,62.618L5.582,62.055L4.349,60.249L5.879,60.075L12.557,61.154L9.146,59.55L5.096,59.072L7.121,58.103L11.549,57.507L12.26,56.635L8.732,55.657L7.67,54.371L14.501,54.481L16.481,54.752L20.378,53.838L14.753,53.55L6.005,53.711L1.586,52.861L0,52.084L0,49.781ZM157.252,46.2L172.885,48.185L168.268,49.145L158.71,49.255L145.246,49.501L146.506,49.945L155.362,49.67L162.886,50.533L167.746,49.767L169.825,50.664L167.08,52.12L173.443,51.189L185.575,50.22L193.072,50.703L194.476,51.773L184.288,53.55L182.875,54.126L174.883,54.557L180.67,54.676L177.754,56.5L175.738,58.12L175.819,60.904L178.816,62.538L174.91,62.639L170.797,63.431L175.414,64.755L175.999,66.879L173.326,67.112L176.566,69.261L171.013,69.439L173.911,70.459L173.092,71.339L169.573,71.724L166.081,71.733L169.213,73.425L169.249,74.538L164.308,73.506L163.021,74.174L166.396,74.8L169.672,76.328L170.617,78.342L166.162,78.824L164.236,77.86L161.14,76.421L161.995,78.118L159.097,79.434L165.685,79.539L169.132,79.675L162.427,81.854L155.632,83.826L148.315,84.689L145.561,84.698L142.969,85.662L139.495,88.303L134.122,90.054L132.394,90.156L129.064,90.77L125.473,91.354L123.33,92.898L123.294,94.654L122.025,96.296L117.948,98.293L118.956,100.248L117.831,102.313L116.553,104.754L113.034,104.907L109.344,102.867L104.34,102.854L101.919,101.483L100.245,99.042L95.916,95.932L94.647,94.303L94.305,92.06L90.849,89.75L91.749,87.909L90.075,87.029L92.55,84.105L96.312,83.174L97.302,82.129L97.824,80.178L94.962,81.063L93.603,81.435L91.362,81.791L88.293,80.974L88.122,79.277L89.103,77.948L91.425,77.91L96.528,78.575L92.226,76.988L89.985,76.133L87.501,76.484L85.413,75.862L88.203,73.535L86.682,72.604L84.702,70.874L81.687,68.225L78.51,67.251L78.537,66.206L71.832,64.742L66.522,64.56L59.835,64.662L53.742,64.848L50.835,64.053L46.497,62.478L53.058,61.691L58.089,61.56L47.397,60.909L41.754,59.889L42.105,58.92L51.564,57.714L60.726,56.512L61.689,55.607L54.939,54.705L57.126,53.711L65.775,51.963L69.411,51.697L68.376,50.576L74.298,49.915L81.984,49.522L89.661,49.501L92.388,50.279L99.021,48.904L104.988,49.839L108.498,50.034L113.691,50.846L107.751,49.501L108.093,48.43L116.481,46.937L125.257,47.051L128.443,46.128L137.281,45.887Z" class="od-land-path" id="od-land"></path>
      <text x="200" y="230" class="od-ocean-label">Atlantic Ocean</text>
      <text x="700" y="230" class="od-ocean-label">Pacific Ocean</text>
      <text x="480" y="330" class="od-ocean-label">Indian Ocean</text>
      <text x="450" y="10" class="od-ocean-label" style="font-size:10px">Arctic Ocean</text>
      <text x="450" y="405" class="od-ocean-label">Southern Ocean</text>
      <g id="od-path-layer"></g>
      <g id="od-marker-layer"></g>
      <text id="od-token" class="od-token">🦆</text>
    </svg>`;
  }


  const scenarios = {
    duck: {
      kind: "linear",
      title: "Duck Drift \u2014 Surface Currents",
      subtitle: "Based on the real 1992 \u201cFriendly Floatees\u201d spill",
      token: "🦆",
      subject: "Marine plastic",
      intro: "On 10 January 1992, a storm swept 28,800 bath toys \u2014 including yellow rubber ducks \u2014 off a cargo ship in the North Pacific. Oceanographers Curtis Ebbesmeyer and James Ingraham tracked them for over a decade to map ocean currents. Click any marker on the map to jump to that stage.",
      sourceNote: "Timeline based on Ebbesmeyer &amp; Ingraham's tracking of the Friendly Floatees spill (Wikipedia: \u201cFriendly Floatees spill\u201d) and van Sebille et al. (2012, <i>Environ. Res. Lett.</i>) on how ocean garbage patches form and evolve.",
      waypoints: [
        { x: WX.duck_spill[0], y: WX.duck_spill[1], label: "Spill site", time: "Day 0", months: 0,
          text: "A shipping container full of bath toys falls overboard in the North Pacific, near the international date line, during a storm." },
        { x: WX.duck_sitka[0], y: WX.duck_sitka[1], label: "Sitka, Alaska", time: "~10 months later", months: 10,
          text: "The first ducks wash ashore near Sitka, Alaska \u2014 about 3,200 km from the spill site." },
        { x: WX.duck_washington[0], y: WX.duck_washington[1], label: "Washington State, USA", time: "~3 years later", months: 36,
          text: "More Floatees complete a longer loop of the North Pacific gyre and reach the US Pacific Northwest coast." },
        { x: WX.duck_japan[0], y: WX.duck_japan[1], label: "Looping past Japan", time: "~4\u20135 years later", months: 54,
          text: "Many toys stay caught in the North Pacific gyre for years, circulating between Alaska, the Aleutians, Kamchatka and Japan." },
        { x: WX.duck_bering[0], y: WX.duck_bering[1], label: "Through the Bering Strait", time: "~6 years later", months: 72,
          text: "Some ducks drift north through the Bering Strait into the Arctic Ocean." },
        { x: WX.duck_arctic_ice[0], y: WX.duck_arctic_ice[1], label: "Frozen into Arctic sea ice", time: "~8 years later", months: 96,
          text: "Trapped in slow-moving pack ice, the toys drift across the Arctic for an estimated five to six years." },
        { x: WX.duck_greenland_sea[0], y: WX.duck_greenland_sea[1], label: "Released in the Greenland Sea", time: "~11.5 years later", months: 138,
          text: "As the ice melts near Greenland, the ducks are released into the North Atlantic." },
        { x: WX.duck_atlantic_land[0], y: WX.duck_atlantic_land[1], label: "New England, Iceland & the UK", time: "~15 years later", months: 180,
          text: "The final leg: some Floatees are found on Atlantic shores roughly fifteen years \u2014 and around 27,000 km \u2014 after the original spill." }
      ],
      closing: "Individual toys took wildly different routes and times \u2014 this is one illustrative path, not every duck's journey. Separately, van Sebille et al. (2012) found that a well-defined \u201cgarbage patch\u201d typically takes about a decade to form in each subtropical gyre \u2014 and that the North Pacific patch keeps growing for over 1,000 years, even as similar patches in the South Atlantic and South Indian Oceans disperse within a few centuries."
    },
    fish: {
      kind: "loop",
      title: "Deep-Sea Fish \u2014 Thermohaline Circulation",
      subtitle: "How long does it take to ride the \u201cglobal conveyor belt\u201d all the way around the world?",
      token: "🐟",
      subject: "This water parcel",
      totalMonths: 12000, // ~1,000 years for one full circuit (NOAA)
      intro: "Imagine a deep-sea fish (or a drop of water) riding the thermohaline circulation \u2014 the slow, density-driven \u201cconveyor belt\u201d that connects every ocean basin on Earth, as shown in WHOI\u2019s classic \u201cGreat Ocean Conveyor\u201d map. This traces its full route: North Atlantic sinking, a deep flow south through the open Atlantic, the Antarctic Circumpolar Current, upwelling in both the Pacific and Indian Oceans, and a warm surface return via the Agulhas Current around South Africa. Red = warm surface water, blue = cold deep water.",
      sourceNote: "Route based on the Woods Hole Oceanographic Institution's \u201cGlobal thermohaline circulation\u201d map (Illustration by Jack Cook, WHOI) and NOAA's National Ocean Service (\u201cThe Global Conveyor Belt\u201d); timescale from Rahmstorf (2003), <i>Nature</i> \u2014 the oldest deep waters, upwelling in the North Pacific, are estimated at around 1,000 years old. Every waypoint below was checked against real coastline data to confirm the path stays in open ocean.",
      loopPoints: [
        { x: 113, y: 155, months: 0, temp: 'warm', isMajor: true, label: 'Gulf Stream, North Atlantic', time: 'Year 0', text: 'Warm, salty surface water is carried north by the Gulf Stream and North Atlantic Current.' },
        { x: 175, y: 118, months: 2, temp: 'warm', isMajor: false, label: 'Gulf Stream, North Atlantic', time: 'Year 0', text: 'Warm, salty surface water is carried north by the Gulf Stream and North Atlantic Current.' },
        { x: 213, y: 85, months: 3, temp: 'cold', isMajor: true, label: 'Sinks near Greenland', time: 'Weeks to months in', text: 'In the cold Norwegian and Greenland Seas, the water loses heat, becomes denser, and sinks — forming North Atlantic Deep Water.' },
        { x: 163, y: 110, months: 302, temp: 'cold', isMajor: false, label: 'Sinks near Greenland', time: 'Weeks to months in', text: 'In the cold Norwegian and Greenland Seas, the water loses heat, becomes denser, and sinks — forming North Atlantic Deep Water.' },
        { x: 138, y: 143, months: 602, temp: 'cold', isMajor: false, label: 'Sinks near Greenland', time: 'Weeks to months in', text: 'In the cold Norwegian and Greenland Seas, the water loses heat, becomes denser, and sinks — forming North Atlantic Deep Water.' },
        { x: 125, y: 180, months: 901, temp: 'cold', isMajor: false, label: 'Sinks near Greenland', time: 'Weeks to months in', text: 'In the cold Norwegian and Greenland Seas, the water loses heat, becomes denser, and sinks — forming North Atlantic Deep Water.' },
        { x: 138, y: 225, months: 1200, temp: 'cold', isMajor: true, label: 'Flows south along the open Atlantic', time: 'Decades in', text: 'The dense water creeps south along the open Atlantic, thousands of metres down, far below the sunlit surface.' },
        { x: 163, y: 268, months: 1950, temp: 'cold', isMajor: false, label: 'Flows south along the open Atlantic', time: 'Decades in', text: 'The dense water creeps south along the open Atlantic, thousands of metres down, far below the sunlit surface.' },
        { x: 180, y: 305, months: 2700, temp: 'cold', isMajor: false, label: 'Flows south along the open Atlantic', time: 'Decades in', text: 'The dense water creeps south along the open Atlantic, thousands of metres down, far below the sunlit surface.' },
        { x: 188, y: 343, months: 3450, temp: 'cold', isMajor: false, label: 'Flows south along the open Atlantic', time: 'Decades in', text: 'The dense water creeps south along the open Atlantic, thousands of metres down, far below the sunlit surface.' },
        { x: 188, y: 380, months: 4200, temp: 'cold', isMajor: true, label: 'Joins the Antarctic Circumpolar Current', time: 'Centuries in', text: 'Near Antarctica, it mixes into the Antarctic Circumpolar Current, the ocean\'s largest current, which links the Atlantic, Indian and Pacific basins.' },
        { x: 275, y: 390, months: 4575, temp: 'cold', isMajor: false, label: 'Joins the Antarctic Circumpolar Current', time: 'Centuries in', text: 'Near Antarctica, it mixes into the Antarctic Circumpolar Current, the ocean\'s largest current, which links the Atlantic, Indian and Pacific basins.' },
        { x: 375, y: 390, months: 4950, temp: 'cold', isMajor: false, label: 'Joins the Antarctic Circumpolar Current', time: 'Centuries in', text: 'Near Antarctica, it mixes into the Antarctic Circumpolar Current, the ocean\'s largest current, which links the Atlantic, Indian and Pacific basins.' },
        { x: 475, y: 390, months: 5325, temp: 'cold', isMajor: false, label: 'Joins the Antarctic Circumpolar Current', time: 'Centuries in', text: 'Near Antarctica, it mixes into the Antarctic Circumpolar Current, the ocean\'s largest current, which links the Atlantic, Indian and Pacific basins.' },
        { x: 550, y: 390, months: 5700, temp: 'cold', isMajor: false, label: 'Joins the Antarctic Circumpolar Current', time: 'Centuries in', text: 'Near Antarctica, it mixes into the Antarctic Circumpolar Current, the ocean\'s largest current, which links the Atlantic, Indian and Pacific basins.' },
        { x: 625, y: 390, months: 6075, temp: 'cold', isMajor: false, label: 'Joins the Antarctic Circumpolar Current', time: 'Centuries in', text: 'Near Antarctica, it mixes into the Antarctic Circumpolar Current, the ocean\'s largest current, which links the Atlantic, Indian and Pacific basins.' },
        { x: 700, y: 390, months: 6450, temp: 'cold', isMajor: false, label: 'Joins the Antarctic Circumpolar Current', time: 'Centuries in', text: 'Near Antarctica, it mixes into the Antarctic Circumpolar Current, the ocean\'s largest current, which links the Atlantic, Indian and Pacific basins.' },
        { x: 750, y: 390, months: 6825, temp: 'cold', isMajor: false, label: 'Joins the Antarctic Circumpolar Current', time: 'Centuries in', text: 'Near Antarctica, it mixes into the Antarctic Circumpolar Current, the ocean\'s largest current, which links the Atlantic, Indian and Pacific basins.' },
        { x: 788, y: 355, months: 7200, temp: 'warm', isMajor: true, label: 'Upwells in the Pacific Ocean', time: 'Often 500+ years in', text: 'Deep water rises and warms in the Pacific — NOAA notes this is where the very oldest water in the entire circulation, up to about 1,000 years old, finally resurfaces.' },
        { x: 750, y: 355, months: 7500, temp: 'warm', isMajor: false, label: 'Upwells in the Pacific Ocean', time: 'Often 500+ years in', text: 'Deep water rises and warms in the Pacific — NOAA notes this is where the very oldest water in the entire circulation, up to about 1,000 years old, finally resurfaces.' },
        { x: 700, y: 370, months: 7800, temp: 'warm', isMajor: false, label: 'Upwells in the Pacific Ocean', time: 'Often 500+ years in', text: 'Deep water rises and warms in the Pacific — NOAA notes this is where the very oldest water in the entire circulation, up to about 1,000 years old, finally resurfaces.' },
        { x: 638, y: 380, months: 8100, temp: 'warm', isMajor: false, label: 'Upwells in the Pacific Ocean', time: 'Often 500+ years in', text: 'Deep water rises and warms in the Pacific — NOAA notes this is where the very oldest water in the entire circulation, up to about 1,000 years old, finally resurfaces.' },
        { x: 525, y: 385, months: 8400, temp: 'warm', isMajor: false, label: 'Upwells in the Pacific Ocean', time: 'Often 500+ years in', text: 'Deep water rises and warms in the Pacific — NOAA notes this is where the very oldest water in the entire circulation, up to about 1,000 years old, finally resurfaces.' },
        { x: 400, y: 400, months: 8700, temp: 'warm', isMajor: false, label: 'Upwells in the Pacific Ocean', time: 'Often 500+ years in', text: 'Deep water rises and warms in the Pacific — NOAA notes this is where the very oldest water in the entire circulation, up to about 1,000 years old, finally resurfaces.' },
        { x: 375, y: 330, months: 9000, temp: 'warm', isMajor: true, label: 'Upwells in the Indian Ocean', time: 'Roughly 750 years in', text: 'Slowly, more deep water rises and warms as it branches north into the Indian Ocean.' },
        { x: 350, y: 343, months: 9200, temp: 'warm', isMajor: false, label: 'Upwells in the Indian Ocean', time: 'Roughly 750 years in', text: 'Slowly, more deep water rises and warms as it branches north into the Indian Ocean.' },
        { x: 313, y: 350, months: 9400, temp: 'warm', isMajor: false, label: 'Upwells in the Indian Ocean', time: 'Roughly 750 years in', text: 'Slowly, more deep water rises and warms as it branches north into the Indian Ocean.' },
        { x: 270, y: 348, months: 9600, temp: 'warm', isMajor: true, label: 'Returns via the Agulhas Current', time: 'Roughly 800 years in', text: 'Warm surface water loops back into the Atlantic via the Agulhas Current, which leaks around the southern tip of Africa — one of the conveyor belt\'s real return pathways.' },
        { x: 238, y: 325, months: 9960, temp: 'warm', isMajor: false, label: 'Returns via the Agulhas Current', time: 'Roughly 800 years in', text: 'Warm surface water loops back into the Atlantic via the Agulhas Current, which leaks around the southern tip of Africa — one of the conveyor belt\'s real return pathways.' },
        { x: 205, y: 285, months: 10320, temp: 'warm', isMajor: false, label: 'Returns via the Agulhas Current', time: 'Roughly 800 years in', text: 'Warm surface water loops back into the Atlantic via the Agulhas Current, which leaks around the southern tip of Africa — one of the conveyor belt\'s real return pathways.' },
        { x: 175, y: 243, months: 10680, temp: 'warm', isMajor: false, label: 'Returns via the Agulhas Current', time: 'Roughly 800 years in', text: 'Warm surface water loops back into the Atlantic via the Agulhas Current, which leaks around the southern tip of Africa — one of the conveyor belt\'s real return pathways.' },
        { x: 145, y: 205, months: 11040, temp: 'warm', isMajor: false, label: 'Returns via the Agulhas Current', time: 'Roughly 800 years in', text: 'Warm surface water loops back into the Atlantic via the Agulhas Current, which leaks around the southern tip of Africa — one of the conveyor belt\'s real return pathways.' },
        { x: 125, y: 175, months: 11400, temp: 'warm', isMajor: true, label: 'Warms and heads home', time: '~1,000 years total', text: 'Warmed at the surface, the water heads back toward the North Atlantic — completing one full loop of the global conveyor belt.' }
      ],
      closing: "NOAA estimates it takes about 1,000 years for a single \u201cparcel\u201d of water to complete this entire circuit \u2014 keep watching and it loops back to the start, just as the real conveyor belt does. It's also a vital part of the planet's carbon and nutrient cycling \u2014 and one reason scientists watch the Atlantic overturning circulation (AMOC) so closely as the climate changes."
    }
  };


  let state = { mode: "duck", duckView: "guided", exploreDirection: "fwd" };

  function el(id) { return document.getElementById(id); }

  function render() {
    const root = el("ocean-drift");
    if (!root) return;

    root.innerHTML = `
      <div class="od-tabs">
        <button class="od-tab ${state.mode === 'duck' ? 'active' : ''}" data-mode="duck">🦆 Duck Drift</button>
        <button class="od-tab ${state.mode === 'fish' ? 'active' : ''}" data-mode="fish">🐟 Deep-Sea Fish</button>
      </div>
      <div id="od-body"></div>
    `;

    root.querySelectorAll(".od-tab").forEach(btn => {
      btn.addEventListener("click", () => {
        state.mode = btn.dataset.mode;
        plume = null;
        journey = null;
        fishLoop = null;
        renderBody();
      });
    });

    renderBody();
  }

  function renderBody() {
    if (state.mode === "duck") { renderDuck(); return; }
    renderFishLoop();
  }

  function renderDuck() {
    const s = scenarios.duck;
    const body = el("od-body");

    body.innerHTML = `
      <h2 class="od-title">${s.title}</h2>
      <div class="od-subtitle">${s.subtitle}</div>
      <div class="od-view-toggle">
        <button class="od-view-btn ${state.duckView === 'guided' ? 'active' : ''}" id="od-view-guided">Guided journey (1992 spill)</button>
        <button class="od-view-btn ${state.duckView === 'explore' ? 'active' : ''}" id="od-view-explore">Free explore</button>
      </div>
      <div id="od-duck-body"></div>
    `;

    el("od-view-guided").addEventListener("click", () => { state.duckView = "guided"; plume = null; journey = null; renderBody(); });
    el("od-view-explore").addEventListener("click", () => { state.duckView = "explore"; plume = null; journey = null; renderBody(); });

    if (state.duckView === "explore") {
      renderDuckExplore();
    } else {
      renderDuckGuided();
    }
  }

  function renderDuckExplore() {
    const s = scenarios.duck;
    const dbody = el("od-duck-body");
    dbody.innerHTML = `
      <p class="od-intro">Click anywhere in the ocean to release a plume of floating debris and watch the current field spread it out \u2014 or trace backward to see where debris arriving at a point probably came from. This uses a simplified illustrative model of the major surface gyres and currents, not observational current data.</p>
      <div class="od-explore-controls">
        <div class="od-direction-toggle">
          <button class="od-view-btn ${state.exploreDirection === 'fwd' ? 'active' : ''}" id="od-dir-fwd">\u25B6 Forward</button>
          <button class="od-view-btn ${state.exploreDirection === 'back' ? 'active' : ''}" id="od-dir-back">\u25C0 Backward</button>
        </div>
        <button id="od-plume-reset">Reset</button>
      </div>
      <div class="od-map-wrap">
        ${mapSVG()}
        <div class="od-badge" id="od-explore-badge">Marine plastic \u2014 Day 0</div>
      </div>
      <p class="od-explore-status" id="od-explore-status">Click a spot in the ocean to release a plume.</p>
      <p class="od-source">${s.sourceNote} Current field is an illustrative schematic based on known real gyre locations and rotation directions, not observational current data.</p>
    `;
    initMapCanvas();
    wireExploreClicks();

    el("od-dir-fwd").addEventListener("click", () => { state.exploreDirection = "fwd"; renderBody(); });
    el("od-dir-back").addEventListener("click", () => { state.exploreDirection = "back"; renderBody(); });
    el("od-plume-reset").addEventListener("click", () => {
      plume = null;
      journey = null;
      const status = el("od-explore-status");
      if (status) status.textContent = "Click a spot in the ocean to release a plume.";
      const markerLayer = document.getElementById("od-marker-layer");
      if (markerLayer) markerLayer.innerHTML = "";
      const badge = document.getElementById("od-explore-badge");
      if (badge) badge.textContent = "Marine plastic \u2014 Day 0";
    });
  }

  function renderDuckGuided() {
    const s = scenarios.duck;
    const dbody = el("od-duck-body");
    renderJourneyChrome(dbody, {
      waypoints: s.waypoints,
      token: s.token,
      subject: s.subject,
      sourceNote: s.sourceNote,
      intro: s.intro,
      closing: s.closing
    });
  }

  // ---------- deep-sea fish: closed-loop thermohaline circuit ----------
  const FISH_LOOP_DURATION_SEC = 45; // slow, contemplative pace for a ~1,000-year journey

  let fishLoop = null; // { totalMonths, elapsedMonths, playing, lastIdx, lastTs }

  function setupFishLoop() {
    const s = scenarios.fish;
    fishLoop = {
      totalMonths: s.totalMonths,
      elapsedMonths: 0,
      playing: false,
      lastIdx: -1,
      lastTs: null
    };
  }

  function fishLoopPosition(months) {
    const pts = scenarios.fish.loopPoints;
    const n = pts.length;
    const wrapped = ((months % fishLoop.totalMonths) + fishLoop.totalMonths) % fishLoop.totalMonths;
    for (let i = 0; i < n; i++) {
      const next = pts[(i + 1) % n];
      const curMonths = pts[i].months;
      const nextMonths = i === n - 1 ? fishLoop.totalMonths : next.months;
      if (wrapped >= curMonths && wrapped < nextMonths) {
        const span = (nextMonths - curMonths) || 1;
        const t = (wrapped - curMonths) / span;
        return {
          x: pts[i].x + (next.x - pts[i].x) * t,
          y: pts[i].y + (next.y - pts[i].y) * t,
          temp: pts[i].temp,
          idx: i
        };
      }
    }
    return { x: pts[0].x, y: pts[0].y, temp: pts[0].temp, idx: 0 };
  }

  function stepFishLoopFrame() {
    if (!fishLoop) return;
    if (fishLoop.playing) {
      const now = performance.now();
      if (fishLoop.lastTs == null) fishLoop.lastTs = now;
      const dtSec = (now - fishLoop.lastTs) / 1000;
      fishLoop.lastTs = now;
      const monthsPerSec = fishLoop.totalMonths / FISH_LOOP_DURATION_SEC;
      fishLoop.elapsedMonths += dtSec * monthsPerSec;
      if (fishLoop.elapsedMonths >= fishLoop.totalMonths) {
        fishLoop.elapsedMonths -= fishLoop.totalMonths; // loop back to the start, like the real conveyor belt
      }
    } else {
      fishLoop.lastTs = null;
    }
    updateFishLoopUI();
  }

  function updateFishLoopUI() {
    if (!fishLoop) return;
    const pos = fishLoopPosition(fishLoop.elapsedMonths);
    const s = scenarios.fish;

    const tokenEl = document.getElementById("od-token");
    if (tokenEl) { tokenEl.setAttribute("x", pos.x); tokenEl.setAttribute("y", pos.y); tokenEl.textContent = s.token; }

    const badge = document.querySelector("#ocean-drift .od-badge");
    if (badge) {
      const tempTag = pos.temp === "warm" ? "\u2600\ufe0f warm surface" : "\u2744\ufe0f cold, deep";
      badge.textContent = s.subject + " \u2014 " + monthsYM(Math.round(fishLoop.elapsedMonths)) + " (" + tempTag + ")";
    }

    const slider = document.getElementById("od-journey-slider");
    if (slider && document.activeElement !== slider) slider.value = Math.round(fishLoop.elapsedMonths);

    const playBtn = document.getElementById("od-journey-play");
    if (playBtn) playBtn.textContent = fishLoop.playing ? "\u23F8 Pause" : "\u25B6 Play";

    if (pos.idx !== fishLoop.lastIdx) {
      fishLoop.lastIdx = pos.idx;
      const wp = s.loopPoints[pos.idx];
      const labelEl = document.getElementById("od-fact-label");
      const timeEl = document.getElementById("od-fact-time");
      const textEl = document.getElementById("od-fact-text");
      if (labelEl) labelEl.textContent = wp.label;
      if (timeEl) timeEl.textContent = wp.time;
      if (textEl) textEl.textContent = wp.text;

      const markerLayer = document.getElementById("od-marker-layer");
      if (markerLayer) {
        markerLayer.querySelectorAll("circle").forEach(c => {
          const i = parseInt(c.dataset.index, 10);
          const w = s.loopPoints[i];
          c.classList.toggle("current", w.label === wp.label);
        });
      }
    }
  }

  // Chaikin corner-cutting: smooths a closed polyline while staying strictly
  // within the convex hull of each consecutive point pair, so it can never
  // bulge outward into land the way a spline can. Also smoothly interpolates
  // a 0..1 "warmth" value alongside position, for a continuous colour gradient
  // rather than abrupt flat colour blocks.
  function chaikinSmooth(points, iterations) {
    let pts = points.map(p => ({ x: p.x, y: p.y, w: p.temp === "warm" ? 1 : 0 }));
    for (let iter = 0; iter < iterations; iter++) {
      const next = [];
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const p0 = pts[i], p1 = pts[(i + 1) % n];
        next.push({ x: p0.x * 0.75 + p1.x * 0.25, y: p0.y * 0.75 + p1.y * 0.25, w: p0.w * 0.75 + p1.w * 0.25 });
        next.push({ x: p0.x * 0.25 + p1.x * 0.75, y: p0.y * 0.25 + p1.y * 0.75, w: p0.w * 0.25 + p1.w * 0.75 });
      }
      pts = next;
    }
    return pts;
  }

  function warmthColor(w) {
    // blend between cold blue (#3d7fd6) and warm red (#d64545)
    const cold = [61, 127, 214], warm = [214, 69, 69];
    const r = Math.round(cold[0] + (warm[0] - cold[0]) * w);
    const g = Math.round(cold[1] + (warm[1] - cold[1]) * w);
    const b = Math.round(cold[2] + (warm[2] - cold[2]) * w);
    return `rgb(${r},${g},${b})`;
  }

  function drawFishLoopRoute() {
    const pathLayer = document.getElementById("od-path-layer");
    const markerLayer = document.getElementById("od-marker-layer");
    if (!pathLayer) return;

    const pts = scenarios.fish.loopPoints;
    const smoothed = chaikinSmooth(pts, 2);
    const n = smoothed.length;

    // Draw as many short segments, each coloured by its interpolated warmth,
    // so the whole circuit shows a smooth, continuous colour gradient.
    let segHtml = "";
    for (let i = 0; i < n; i++) {
      const a = smoothed[i], b = smoothed[(i + 1) % n];
      const w = (a.w + b.w) / 2;
      segHtml += `<path d="M${a.x},${a.y} L${b.x},${b.y}" class="od-route-grad" stroke="${warmthColor(w)}" />`;
    }
    pathLayer.innerHTML = segHtml;

    // Only show markers at the named major stages, not every path-shaping point
    markerLayer.innerHTML = pts.map((w, i) =>
      w.isMajor ? `<circle cx="${w.x}" cy="${w.y}" r="7" class="od-marker upcoming" data-index="${i}"></circle>` : ""
    ).join("");

    markerLayer.querySelectorAll("circle").forEach(c => {
      c.addEventListener("click", () => {
        const i = parseInt(c.dataset.index, 10);
        fishLoop.playing = false;
        fishLoop.elapsedMonths = pts[i].months;
        fishLoop.lastIdx = -1;
        updateFishLoopUI();
      });
    });
  }

  function renderFishLoop() {
    const s = scenarios.fish;
    const body = el("od-body");
    if (!fishLoop) setupFishLoop();
    const wp0 = s.loopPoints[0];

    body.innerHTML = `
      <h2 class="od-title">${s.title}</h2>
      <div class="od-subtitle">${s.subtitle}</div>
      <p class="od-intro">${s.intro}</p>
      <div class="od-map-wrap">
        ${mapSVG()}
        <div class="od-badge">${s.subject} \u2014 Day 0</div>
      </div>
      <div class="od-journey-controls">
        <button id="od-journey-play">\u25B6 Play</button>
        <input type="range" id="od-journey-slider" min="0" max="${s.totalMonths}" value="0" />
        <button id="od-journey-restart" title="Restart">\u21BA Restart</button>
      </div>
      <p class="od-progress">A closed loop \u2014 drag, play, or click a marker. Red = warm surface water, blue = cold deep water.</p>
      <div class="od-fact">
        <div class="od-fact-head">
          <span class="od-fact-label" id="od-fact-label">${wp0.label}</span>
          <span class="od-fact-time" id="od-fact-time">${wp0.time}</span>
        </div>
        <p id="od-fact-text">${wp0.text}</p>
      </div>
      <p class="od-closing">${s.closing}</p>
      <p class="od-source">${s.sourceNote}</p>
    `;

    initMapCanvas();
    drawFishLoopRoute();
    updateFishLoopUI();

    el("od-journey-play").addEventListener("click", () => {
      fishLoop.playing = !fishLoop.playing;
      fishLoop.lastTs = null;
      updateFishLoopUI();
    });
    el("od-journey-slider").addEventListener("input", (e) => {
      fishLoop.playing = false;
      fishLoop.elapsedMonths = parseInt(e.target.value, 10);
      fishLoop.lastIdx = -1;
      updateFishLoopUI();
    });
    el("od-journey-restart").addEventListener("click", () => {
      fishLoop.elapsedMonths = 0;
      fishLoop.playing = false;
      fishLoop.lastIdx = -1;
      updateFishLoopUI();
    });
  }

  document.addEventListener("DOMContentLoaded", render);
  if (document.readyState === "complete" || document.readyState === "interactive") {
    render();
  }
})();
