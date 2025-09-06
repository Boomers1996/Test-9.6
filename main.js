import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

const container = document.getElementById('threeContainer');
const dropZone = document.getElementById('dropZone');
const guiContainer = document.getElementById('guiContainer');
const fileInput = document.getElementById('fileInput');
const animationSelect = document.getElementById('animationSelect');
const playAnimBtn = document.getElementById('playAnimBtn');
const stopAnimBtn = document.getElementById('stopAnimBtn');
const intensityRange = document.getElementById('intensityRange');
const promptInput = document.getElementById('promptInput');
const apiKeyInput = document.getElementById('apiKeyInput');
const expressBtn = document.getElementById('expressBtn');
const llmStatus = document.getElementById('llmStatus');

let scene, camera, renderer, controls;
let mixer = null;
let currentModel = null;
let animationActions = [];
let currentAction = null;
let clock = new THREE.Clock();
let activeMorphTweens = [];

init();
animate();

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0f18);

  camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.1, 100);
  camera.position.set(0.6, 1.5, 2.8);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 1.0);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, 1.2);
  dir.position.set(3, 5, 2);
  dir.castShadow = true;
  scene.add(dir);

  const grid = new THREE.GridHelper(10, 10, 0x334, 0x223);
  grid.position.y = 0;
  scene.add(grid);

  window.addEventListener('resize', onResize);
  setupDragAndDrop();
  setupUI();
}

function onResize() {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function setupDragAndDrop() {
  const root = document.body;
  ['dragenter', 'dragover'].forEach(evt => root.addEventListener(evt, e => {
    e.preventDefault();
    dropZone.style.display = 'flex';
  }));
  ['dragleave', 'drop'].forEach(evt => root.addEventListener(evt, e => {
    e.preventDefault();
    if (evt === 'drop') {
      const file = e.dataTransfer?.files?.[0];
      if (file) loadGLBFile(file);
    }
    dropZone.style.display = 'none';
  }));
  fileInput.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (file) loadGLBFile(file);
  });
}

function setupUI() {
  playAnimBtn.addEventListener('click', () => {
    const idx = animationSelect.selectedIndex;
    if (animationActions[idx]) playAction(animationActions[idx]);
  });
  stopAnimBtn.addEventListener('click', () => stopAction());

  document.querySelectorAll('.emotion-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const emotion = btn.dataset.emotion;
      const intensity = parseFloat(intensityRange.value);
      applyEmotion(emotion, intensity);
    });
  });

  expressBtn.addEventListener('click', async () => {
    const text = promptInput.value.trim();
    if (!text) return;
    setLLMStatus('Parsing with LLM...');
    try {
      const apiKey = apiKeyInput.value.trim() || undefined;
      const mapping = await llmMapEmotion(text, apiKey);
      if (mapping?.emotion) {
        applyEmotion(mapping.emotion, mapping.intensity ?? 0.7);
        setLLMStatus(`→ ${mapping.emotion} (${Math.round((mapping.intensity ?? 0.7)*100)}%)`);
      } else {
        setLLMStatus('LLM did not return emotion; using local heuristic.');
        const heuristic = localHeuristic(text);
        applyEmotion(heuristic.emotion, heuristic.intensity);
      }
    } catch (err) {
      console.error(err);
      setLLMStatus('LLM failed; using local heuristic.');
      const heuristic = localHeuristic(text);
      applyEmotion(heuristic.emotion, heuristic.intensity);
    }
  });
}

function setLLMStatus(msg) { llmStatus.textContent = msg; }

async function loadGLBFile(file) {
  const url = URL.createObjectURL(file);
  await loadGLBUrl(url);
  URL.revokeObjectURL(url);
}

async function loadGLBUrl(url) {
  clearModel();
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(url);
  const model = gltf.scene || gltf.scenes?.[0];
  currentModel = model;

  // Center and scale
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  model.position.sub(center);
  const scale = 1.4 / Math.max(size.x, size.y, size.z);
  model.scale.setScalar(scale);
  scene.add(model);

  // Animations
  setupAnimations(gltf);

  // Morph GUI
  buildMorphGui(model);
}

function setupAnimations(gltf) {
  if (mixer) mixer.stopAllAction();
  mixer = new THREE.AnimationMixer(gltf.scene);
  animationActions = [];
  animationSelect.innerHTML = '';
  playAnimBtn.disabled = true;
  stopAnimBtn.disabled = true;

  if (gltf.animations && gltf.animations.length) {
    gltf.animations.forEach((clip, i) => {
      const action = mixer.clipAction(clip);
      action.loop = THREE.LoopRepeat;
      action.clampWhenFinished = true;
      animationActions.push(action);
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = clip.name || `Clip ${i+1}`;
      animationSelect.appendChild(opt);
    });
    playAnimBtn.disabled = false;
    stopAnimBtn.disabled = false;
  }
}

function playAction(action) {
  if (currentAction === action) return;
  if (currentAction) currentAction.fadeOut(0.2);
  currentAction = action;
  currentAction.reset().fadeIn(0.2).play();
}

function stopAction() {
  if (currentAction) {
    currentAction.fadeOut(0.2);
    currentAction = null;
  }
}

function clearModel() {
  if (!currentModel) return;
  scene.remove(currentModel);
  currentModel.traverse(obj => {
    if (obj.isMesh) {
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
      else obj.material?.dispose?.();
    }
  });
  currentModel = null;
}

function buildMorphGui(root) {
  guiContainer.innerHTML = '';
  const list = document.createElement('div');
  list.style.display = 'flex';
  list.style.flexDirection = 'column';
  list.style.gap = '8px';

  const meshes = [];
  root.traverse(o => { if (o.isMesh && o.morphTargetInfluences) meshes.push(o); });

  if (meshes.length === 0) {
    const msg = document.createElement('div');
    msg.textContent = 'No morph targets found.';
    msg.style.color = '#9aa4b2';
    guiContainer.appendChild(msg);
    return;
  }

  const morphNames = new Set();
  meshes.forEach(mesh => {
    const dict = mesh.morphTargetDictionary || {};
    Object.keys(dict).forEach(name => morphNames.add(name));
  });

  morphNames.forEach(name => {
    const row = document.createElement('div');
    row.style.display = 'grid';
    row.style.gridTemplateColumns = '1fr 60px';
    row.style.alignItems = 'center';
    row.style.gap = '8px';

    const label = document.createElement('div');
    label.textContent = name;
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = '1';
    range.step = '0.01';
    range.value = '0';
    range.addEventListener('input', () => setMorph(name, parseFloat(range.value)));

    row.appendChild(label);
    row.appendChild(range);
    list.appendChild(row);
  });

  guiContainer.appendChild(list);
}

function setMorph(name, value) {
  if (!currentModel) return;
  currentModel.traverse(o => {
    if (o.isMesh && o.morphTargetInfluences) {
      const dict = o.morphTargetDictionary || {};
      const idx = dict[name];
      if (idx !== undefined) {
        o.morphTargetInfluences[idx] = value;
      }
    }
  });
}

function getMorphValue(name) {
  if (!currentModel) return 0;
  let value = 0;
  currentModel.traverse(o => {
    if (o.isMesh && o.morphTargetInfluences && value === 0) {
      const dict = o.morphTargetDictionary || {};
      const idx = dict[name];
      if (idx !== undefined) {
        value = o.morphTargetInfluences[idx] ?? 0;
      }
    }
  });
  return value;
}

function tweenMorph(name, targetValue, durationSec = 0.25) {
  const startValue = getMorphValue(name);
  const startTime = performance.now();
  const endTime = startTime + durationSec * 1000;
  activeMorphTweens = activeMorphTweens.filter(t => t.name !== name);
  activeMorphTweens.push({ name, startValue, targetValue, startTime, endTime });
}

function findMorphByAliases(aliases) {
  // Return first existing morph name among aliases
  const existing = [];
  if (!currentModel) return null;
  currentModel.traverse(o => {
    if (o.isMesh && o.morphTargetInfluences) {
      const dict = o.morphTargetDictionary || {};
      Object.keys(dict).forEach(name => {
        existing.push(name);
      });
    }
  });
  for (const a of aliases) {
    if (existing.includes(a)) return a;
  }
  return null;
}

function applyEmotion(emotion, intensity = 0.7) {
  // Common aliases based on ARKit/VRM/CC names
  const aliases = {
    smile: ['smile', 'Smile', 'smileOpen', 'mouthSmile', 'mouthSmileLeft', 'mouthSmileRight', 'ARKit.MouthSmile_L', 'ARKit.MouthSmile_R'],
    frown: ['frown', 'MouthFrown', 'mouthFrownLeft', 'mouthFrownRight'],
    jawOpen: ['jawOpen', 'JawOpen', 'mouthOpen', 'MouthOpen', 'ARKit.JawOpen'],
    browDown: ['browDown', 'browDownLeft', 'browDownRight', 'ARKit.BrowDown_L', 'ARKit.BrowDown_R'],
    browUp: ['browUp', 'browInnerUp', 'ARKit.BrowInnerUp'],
    eyeBlink: ['eyeBlink', 'eyeBlinkLeft', 'eyeBlinkRight', 'ARKit.EyeBlink_L', 'ARKit.EyeBlink_R'],
    eyeWide: ['eyeWide', 'eyeWideLeft', 'eyeWideRight', 'ARKit.EyeWide_L', 'ARKit.EyeWide_R'],
    mouthPucker: ['pucker', 'mouthPucker', 'ARKit.MouthPucker'],
    mouthSad: ['mouthSad', 'mouthSadLeft', 'mouthSadRight'],
  };

  const resetTargets = ['smile','frown','mouthSad','browDown','browUp','eyeBlink','eyeWide','jawOpen','mouthPucker'];
  resetTargets.forEach(k => {
    const n = findMorphByAliases(aliases[k] || [k]);
    if (n) tweenMorph(n, 0, 0.18);
  });

  const clamp01 = v => Math.max(0, Math.min(1, v));
  switch (emotion) {
    case 'neutral':
      break;
    case 'happy': {
      const smile = findMorphByAliases(aliases.smile);
      if (smile) tweenMorph(smile, clamp01(intensity), 0.28);
      const brow = findMorphByAliases(aliases.browUp);
      if (brow) tweenMorph(brow, clamp01(intensity * 0.3), 0.28);
      const jaw = findMorphByAliases(aliases.jawOpen);
      if (jaw) tweenMorph(jaw, clamp01(intensity * 0.15), 0.28);
      break;
    }
    case 'sad': {
      const sad = findMorphByAliases(aliases.mouthSad) || findMorphByAliases(aliases.frown);
      if (sad) tweenMorph(sad, clamp01(intensity * 0.7), 0.28);
      const brow = findMorphByAliases(aliases.browDown);
      if (brow) tweenMorph(brow, clamp01(intensity * 0.6), 0.28);
      break;
    }
    case 'angry': {
      const frown = findMorphByAliases(aliases.frown);
      if (frown) tweenMorph(frown, clamp01(intensity * 0.7), 0.2);
      const browDown = findMorphByAliases(aliases.browDown);
      if (browDown) tweenMorph(browDown, clamp01(intensity), 0.2);
      const eye = findMorphByAliases(aliases.eyeBlink);
      if (eye) tweenMorph(eye, clamp01(intensity * 0.2), 0.2);
      break;
    }
    case 'surprised': {
      const jaw = findMorphByAliases(aliases.jawOpen);
      if (jaw) tweenMorph(jaw, clamp01(intensity), 0.18);
      const eye = findMorphByAliases(aliases.eyeWide);
      if (eye) tweenMorph(eye, clamp01(intensity * 0.8), 0.18);
      const brow = findMorphByAliases(aliases.browUp);
      if (brow) tweenMorph(brow, clamp01(intensity * 0.9), 0.18);
      break;
    }
    default: {
      // Fallback mapping
      const heuristic = localHeuristic(emotion);
      applyEmotion(heuristic.emotion, heuristic.intensity);
      break;
    }
  }
}

function localHeuristic(text) {
  const t = text.toLowerCase();
  if (/laugh|smile|joy|happy|delight|excited/.test(t)) return { emotion: 'happy', intensity: 0.8 };
  if (/sad|cry|tears|melancholy|blue/.test(t)) return { emotion: 'sad', intensity: 0.7 };
  if (/angry|mad|furious|annoyed|rage/.test(t)) return { emotion: 'angry', intensity: 0.7 };
  if (/shock|surprise|wow|gasp|astonish/.test(t)) return { emotion: 'surprised', intensity: 0.8 };
  return { emotion: 'neutral', intensity: 0.0 };
}

async function llmMapEmotion(description, apiKey) {
  // Calls a local API route if available; otherwise hits OpenAI directly (if key provided)
  // First try local server
  try {
    const res = await fetch('/api/emotion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    });
    if (res.ok) return await res.json();
  } catch {}

  if (!apiKey) throw new Error('No API key and no local server.');

  const system = 'You map natural language to {emotion, intensity in [0,1]} among: neutral, happy, sad, angry, surprised. Keep JSON only.';
  const user = `Description: ${description}`;
  const payload = {
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ],
    temperature: 0.2,
    response_format: { type: 'json_object' }
  };
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('OpenAI request failed');
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
  controls.update();

  if (activeMorphTweens.length) {
    const now = performance.now();
    activeMorphTweens = activeMorphTweens.filter(t => {
      const { name, startValue, targetValue, startTime, endTime } = t;
      const t01 = Math.min(1, Math.max(0, (now - startTime) / (endTime - startTime)));
      const eased = t01 < 0.5 ? 2*t01*t01 : -1 + (4 - 2*t01) * t01; // easeInOutQuad
      const v = startValue + (targetValue - startValue) * eased;
      setMorph(name, v);
      return now < endTime;
    });
  }
  renderer.render(scene, camera);
}

