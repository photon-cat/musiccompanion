import { setMusicStateGetter, trySetExpression } from './avatar.js';

const musicPlayerEl = document.getElementById('music-player');
const musicAudio = document.getElementById('music-audio');
const musicPlayBtn = document.getElementById('music-play-btn');
const musicCloseBtn = document.getElementById('music-close-btn');
const musicScrubber = document.getElementById('music-scrubber');
const musicTimeEl = document.getElementById('music-time');
const musicTitleEl = document.getElementById('music-song-title');
const musicDirectiveLabel = document.getElementById('music-directive-label');

let musicScript = null;
let musicSessionActive = false;

function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function getInterpolatedDirective(t) {
  if (!musicScript?.directives?.length) return null;
  const dirs = musicScript.directives;
  if (t <= dirs[0].t) return dirs[0];
  if (t >= dirs[dirs.length - 1].t) return dirs[dirs.length - 1];

  let i = 0;
  while (i < dirs.length - 1 && dirs[i + 1].t <= t) i++;

  const a = dirs[i];
  const b = dirs[Math.min(i + 1, dirs.length - 1)];
  if (a === b) return a;

  const frac = (t - a.t) / (b.t - a.t);

  return {
    intensity:   a.intensity   + (b.intensity   - a.intensity)   * frac,
    head_bob:    a.head_bob    + (b.head_bob    - a.head_bob)    * frac,
    sway_amount: a.sway_amount + (b.sway_amount - a.sway_amount) * frac,
    pose:       frac < 0.5 ? a.pose : b.pose,
    expression: frac < 0.5 ? a.expression : b.expression,
    eye_state:  frac < 0.5 ? a.eye_state : b.eye_state,
    description: frac < 0.5 ? a.description : b.description,
  };
}

function getTempoAt(t) {
  if (!musicScript?.embeddings?.length) return 90;
  const embs = musicScript.embeddings;
  for (let i = embs.length - 1; i >= 0; i--) {
    if (embs[i].t <= t) return embs[i].tempo || 90;
  }
  return embs[0].tempo || 90;
}

function applyMusicDirective(directive, t, currentVrm) {
  if (!currentVrm?.humanoid) return;

  const { intensity, head_bob, sway_amount, pose } = directive;
  const bpm = getTempoAt(t);
  const beatFreq = bpm / 60;

  const head = currentVrm.humanoid.getRawBoneNode('head');
  const spine = currentVrm.humanoid.getRawBoneNode('spine');
  const chest = currentVrm.humanoid.getRawBoneNode('chest');
  const hips = currentVrm.humanoid.getRawBoneNode('hips');
  const leftUpperArm = currentVrm.humanoid.getRawBoneNode('leftUpperArm');
  const rightUpperArm = currentVrm.humanoid.getRawBoneNode('rightUpperArm');

  if (head) {
    const bobAmp = head_bob * 0.12;
    head.rotation.x += Math.sin(t * beatFreq * Math.PI * 2) * bobAmp;
    head.rotation.z += Math.sin(t * beatFreq * Math.PI) * head_bob * 0.03;
  }

  if (spine) {
    const swayAmp = sway_amount * 0.08;
    spine.rotation.z += Math.sin(t * beatFreq * Math.PI) * swayAmp;
  }

  if (pose === 'dancing' || pose === 'energetic') {
    if (hips) hips.position.y += Math.abs(Math.sin(t * beatFreq * Math.PI * 2)) * intensity * 0.02;
    if (leftUpperArm) leftUpperArm.rotation.z += Math.sin(t * beatFreq * Math.PI) * intensity * 0.12;
    if (rightUpperArm) rightUpperArm.rotation.z -= Math.sin(t * beatFreq * Math.PI) * intensity * 0.12;
    if (chest) chest.rotation.y += Math.sin(t * beatFreq * Math.PI * 0.5) * intensity * 0.04;
  }

  if (pose === 'dramatic') {
    if (chest) chest.rotation.z += Math.sin(t * beatFreq * Math.PI * 0.5) * intensity * 0.06;
    if (head) head.rotation.y += Math.sin(t * beatFreq * Math.PI * 0.25) * intensity * 0.06;
  }

  if (pose === 'nodding') {
    if (head) head.rotation.x += Math.sin(t * beatFreq * Math.PI * 2) * head_bob * 0.06;
  }

  if (pose === 'winding_down' || pose === 'winding down') {
    if (spine) spine.rotation.z += Math.sin(t * 0.5) * sway_amount * 0.04;
  }
}

function applyMusicExpression(directive, currentVrm, setExpr) {
  if (!currentVrm?.expressionManager) return;

  const { expression, eye_state, intensity } = directive;

  const expressionMap = {
    'calm':      { happy: 0.0, sad: 0.0, relaxed: 0.5 },
    'neutral':   { happy: 0.0, sad: 0.0, relaxed: 0.0 },
    'emotional': { happy: 0.0, sad: 0.35, relaxed: 0.0 },
    'happy':     { happy: 0.6, sad: 0.0, relaxed: 0.0 },
    'serene':    { happy: 0.15, sad: 0.0, relaxed: 0.6 },
    'excited':   { happy: 0.8, sad: 0.0, relaxed: 0.0 },
    'dreamy':    { happy: 0.1, sad: 0.0, relaxed: 0.5 },
  };

  const expValues = expressionMap[expression] || expressionMap['neutral'];
  for (const [name, val] of Object.entries(expValues)) {
    setExpr(name, val * Math.max(intensity, 0.3));
  }

  if (eye_state === 'half_closed') {
    setExpr('blink', 0.3);
  } else if (eye_state === 'wide') {
    setExpr('blink', 0);
    setExpr('surprised', 0.25);
  }
}

function updateMusicUI(t) {
  musicScrubber.value = t;
  musicTimeEl.textContent = `${formatTime(t)} / ${formatTime(musicScript.duration)}`;
  const directive = getInterpolatedDirective(t);
  if (directive) musicDirectiveLabel.textContent = directive.description || '';
}

// Register with avatar render loop
setMusicStateGetter(() => ({
  active: musicSessionActive,
  script: musicScript,
  paused: musicAudio.paused,
  currentTime: musicAudio.currentTime,
  getDirective: getInterpolatedDirective,
  applyDirective: applyMusicDirective,
  applyExpression: applyMusicExpression,
  updateUI: updateMusicUI,
}));

// ---- Public API ----
window.startMusicSession = async function(scriptUrl, audioUrl, songName) {
  const res = await fetch(scriptUrl);
  musicScript = await res.json();

  musicAudio.src = audioUrl;
  musicTitleEl.textContent = songName;
  musicScrubber.max = musicScript.duration;
  musicScrubber.value = 0;
  musicTimeEl.textContent = `0:00 / ${formatTime(musicScript.duration)}`;

  musicSessionActive = true;
  musicPlayerEl.classList.add('active');

  document.getElementById('anim-switcher').style.opacity = '0.2';
  document.getElementById('anim-switcher').style.pointerEvents = 'none';

  musicAudio.play();
  musicPlayBtn.innerHTML = '&#9646;&#9646;';
};

window.stopMusicSession = function() {
  musicSessionActive = false;
  musicAudio.pause();
  musicAudio.currentTime = 0;
  musicScript = null;
  musicPlayerEl.classList.remove('active');
  musicPlayBtn.innerHTML = '&#9654;';
  musicDirectiveLabel.textContent = '';

  document.getElementById('anim-switcher').style.opacity = '1';
  document.getElementById('anim-switcher').style.pointerEvents = 'auto';

  ['happy', 'sad', 'relaxed', 'surprised', 'blink'].forEach(e => trySetExpression(e, 0));
};

musicPlayBtn.addEventListener('click', () => {
  if (!musicSessionActive) return;
  if (musicAudio.paused) {
    musicAudio.play();
    musicPlayBtn.innerHTML = '&#9646;&#9646;';
  } else {
    musicAudio.pause();
    musicPlayBtn.innerHTML = '&#9654;';
  }
});

musicCloseBtn.addEventListener('click', () => {
  window.stopMusicSession();
});

musicScrubber.addEventListener('input', () => {
  if (musicSessionActive) {
    musicAudio.currentTime = parseFloat(musicScrubber.value);
  }
});

musicAudio.addEventListener('ended', () => {
  window.stopMusicSession();
});
