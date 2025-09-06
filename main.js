import * as THREE from 'three';
import { OrbitControls } from 'three-stdlib';
import { GLTFLoader } from 'three-stdlib';
import { io } from 'socket.io-client';

// Connect to Socket.IO; in dev (Vite @ 5173) connect to Express @ 3000
const socket = (() => {
  const isVite = typeof window !== 'undefined' && window.location.port === '5173';
  if (isVite) return io(`${window.location.protocol}//${window.location.hostname}:3000`);
  return io();
})();

const app = document.getElementById('app');
const logDiv = document.getElementById('log');
const clipSelect = document.getElementById('clipSelect');
const playClipBtn = document.getElementById('playClip');
const emotionsDiv = document.getElementById('emotions');

function log(msg) {
  const el = document.createElement('div');
  el.textContent = msg;
  logDiv.prepend(el);
}

// Emotions we support out of the box
const EMOTIONS = [
  'neutral', 'happy', 'sad', 'angry', 'surprised', 'fearful', 'disgusted', 'blink', 'smile', 'frown', 'jawOpen'
];

// Procedural actions
const ACTIONS = ['spin', 'nod', 'shake', 'lean'];

// Blendshape mapping library (VRM/ARKit/CC4/RPM common names)
const BlendshapeMap = {
  neutral: ['Neutral'],
  happy: ['Joy', 'Happy', 'smile', 'AAPL_Happy'],
  sad: ['Sorrow', 'Sad', 'AAPL_Sad'],
  angry: ['Angry', 'AAPL_Angry'],
  surprised: ['Surprised', 'AAPL_Surprise'],
  fearful: ['Scared', 'AAPL_Fear'],
  disgusted: ['Disgust', 'AAPL_Disgust'],
  blink: ['Blink', 'BlinkLeft', 'BlinkRight', 'AAPL_Blink'],
  smile: ['Smile', 'MouthSmile', 'AAPL_Smile'],
  frown: ['Frown', 'MouthFrown', 'AAPL_Frown'],
  jawOpen: ['JawOpen', 'MouthOpen', 'AAPL_JawOpen']
};

// Scene setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111113);
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.5, 3);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);

const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 1.0);
scene.add(hemi);
const dir = new THREE.DirectionalLight(0xffffff, 1.0);
dir.position.set(5, 10, 7);
scene.add(dir);

// GLB loading
const loader = new GLTFLoader();
let model = null;
let mixer = null;
let animations = [];
let morphTargetDictionaryByMesh = new Map();
let morphTargetInfluencesByMesh = new Map();
let emotionToClip = new Map();

function collectMorphTargets(root) {
  morphTargetDictionaryByMesh.clear();
  morphTargetInfluencesByMesh.clear();
  root.traverse((obj) => {
    if (obj.isMesh && obj.morphTargetDictionary && obj.morphTargetInfluences) {
      morphTargetDictionaryByMesh.set(obj, obj.morphTargetDictionary);
      morphTargetInfluencesByMesh.set(obj, obj.morphTargetInfluences);
    }
  });
}

function setEmotion(emotion, value = 1.0, durationMs = 500) {
  const names = BlendshapeMap[emotion] || [];
  const start = performance.now();
  const initialInfluences = [];
  let totalTargets = 0;
  morphTargetInfluencesByMesh.forEach((influences, mesh) => {
    const dict = morphTargetDictionaryByMesh.get(mesh) || {};
    const targets = names
      .map((n) => dict[n])
      .filter((idx) => idx !== undefined);
    totalTargets += targets.length;
    initialInfluences.push({ mesh, targets, from: targets.map((i) => influences[i] || 0) });
  });

  function easeOutQuad(t){ return t*(2-t); }

  function animate() {
    const t = Math.min(1, (performance.now() - start) / durationMs);
    const e = easeOutQuad(t);
    for (const entry of initialInfluences) {
      const { mesh, targets, from } = entry;
      const influences = morphTargetInfluencesByMesh.get(mesh);
      targets.forEach((idx, i) => {
        influences[idx] = from[i] + (value - from[i]) * e;
      });
    }
    if (t < 1) requestAnimationFrame(animate);
  }
  if (totalTargets > 0) {
    requestAnimationFrame(animate);
  } else {
    // No morph targets; try clip fallback or procedural nod
    const clipName = emotionToClip.get(emotion);
    if (clipName) {
      playClipByName(clipName);
    } else if (emotion === 'yes' || emotion === 'happy') {
      playAction('nod');
    } else if (emotion === 'no' || emotion === 'angry') {
      playAction('shake');
    }
  }
}

function clearEmotions(durationMs = 300) {
  morphTargetInfluencesByMesh.forEach((influences) => {
    for (let i = 0; i < influences.length; i++) {
      influences[i] = Math.max(0, influences[i] * 0.5);
    }
  });
}

function playAction(name) {
  if (!model) return;
  if (name === 'spin') {
    const start = performance.now();
    const dur = 1500;
    const startRot = model.rotation.y;
    function step(){
      const t = Math.min(1, (performance.now()-start)/dur);
      model.rotation.y = startRot + t * Math.PI * 2;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  } else if (name === 'nod') {
    const head = model.getObjectByName('Head') || model.getObjectByName('head');
    if (!head) return;
    const start = performance.now();
    const dur = 800;
    const base = head.rotation.x;
    function step(){
      const t = Math.min(1, (performance.now()-start)/dur);
      head.rotation.x = base + Math.sin(t * Math.PI * 2) * 0.25;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  } else if (name === 'shake') {
    const head = model.getObjectByName('Head') || model.getObjectByName('head');
    if (!head) return;
    const start = performance.now();
    const dur = 800;
    const base = head.rotation.y;
    function step(){
      const t = Math.min(1, (performance.now()-start)/dur);
      head.rotation.y = base + Math.sin(t * Math.PI * 2) * 0.35;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  } else if (name === 'lean') {
    const spine = model.getObjectByName('Spine') || model.getObjectByName('spine');
    if (!spine) return;
    const start = performance.now();
    const dur = 1000;
    const base = spine.rotation.z;
    function step(){
      const t = Math.min(1, (performance.now()-start)/dur);
      spine.rotation.z = base + Math.sin(t * Math.PI * 2) * 0.2;
      if (t < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
}

// Build UI
EMOTIONS.forEach((name) => {
  const btn = document.createElement('button');
  btn.textContent = name;
  btn.addEventListener('click', () => {
    setEmotion(name, 1.0, 400);
    socket.emit('animate', { type: 'emotion', name, value: 1.0, duration: 400 });
  });
  emotionsDiv.appendChild(btn);
});

document.querySelectorAll('#ui [data-action]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const action = btn.getAttribute('data-action');
    playAction(action);
    socket.emit('animate', { type: 'action', name: action });
  });
});

playClipBtn.addEventListener('click', () => {
  const name = clipSelect.value;
  if (!name) return;
  playClipByName(name);
  socket.emit('animate', { type: 'clip', name });
});

function playClipByName(name) {
  const clip = THREE.AnimationClip.findByName(animations, name);
  if (!clip || !model) return;
  if (!mixer) mixer = new THREE.AnimationMixer(model);
  mixer.stopAllAction();
  mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.1).play();
}

// Auto map emotions to clips by name
function autoEmotionToClip(name) {
  const lower = name.toLowerCase();
  let candidates = [];
  if (lower.includes('happy') || lower.includes('joy') || lower.includes('smile')) candidates.push('happy');
  if (lower.includes('sad')) candidates.push('sad');
  if (lower.includes('angry')) candidates.push('angry');
  if (lower.includes('surpris')) candidates.push('surprised');
  if (lower.includes('fear')) candidates.push('fearful');
  if (lower.includes('disgust')) candidates.push('disgusted');
  if (lower.includes('blink')) candidates.push('blink');
  if (lower.includes('frown')) candidates.push('frown');
  if (lower.includes('jaw') || lower.includes('mouthopen')) candidates.push('jawOpen');
  return candidates[0];
}

// Socket listeners
socket.on('animate', ({ type, name, value, duration }) => {
  if (type === 'emotion') setEmotion(name, value ?? 1.0, duration ?? 400);
  if (type === 'action') playAction(name);
  if (type === 'clip') {
    const clip = THREE.AnimationClip.findByName(animations, name);
    if (clip) {
      if (!mixer) mixer = new THREE.AnimationMixer(model);
      mixer.stopAllAction();
      mixer.clipAction(clip).reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.1).play();
    }
  }
});

// Load GLB from project root
loader.load('/Human woman Diana Alatalo.glb', (gltf) => {
  model = gltf.scene;
  scene.add(model);
  collectMorphTargets(model);
  animations = gltf.animations || [];
  // Build emotion -> clip mapping
  emotionToClip.clear();
  for (const clip of animations) {
    const mapped = autoEmotionToClip(clip.name);
    if (mapped && !emotionToClip.has(mapped)) emotionToClip.set(mapped, clip.name);
  }
  clipSelect.innerHTML = '';
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = 'Select clip';
  clipSelect.appendChild(empty);
  animations.forEach((clip) => {
    const opt = document.createElement('option');
    opt.value = clip.name;
    opt.textContent = clip.name;
    clipSelect.appendChild(opt);
  });
  log(`Loaded model. Morph meshes: ${morphTargetDictionaryByMesh.size}, clips: ${animations.length}`);
}, undefined, (err) => {
  log(`Failed to load GLB: ${err.message || err}`);
});

// Render loop
const clock = new THREE.Clock();
function tick(){
  const dt = clock.getDelta();
  if (mixer) mixer.update(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

