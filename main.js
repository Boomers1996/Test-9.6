import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.1/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.160.1/examples/jsm/loaders/GLTFLoader.js';

const canvasParent = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvasParent.clientWidth, canvasParent.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasParent.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0b0d11');

const camera = new THREE.PerspectiveCamera(40, canvasParent.clientWidth / canvasParent.clientHeight, 0.1, 100);
camera.position.set(0.5, 1.6, 2.4);
scene.add(camera);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.5, 0);
controls.enableDamping = true;

const hemi = new THREE.HemisphereLight(0xffffff, 0x080820, 1.2);
scene.add(hemi);
const key = new THREE.DirectionalLight(0xffffff, 1.0);
key.position.set(3, 5, 3);
scene.add(key);

let currentSkinned = null;
let clock = new THREE.Clock();

function resize() {
    camera.aspect = canvasParent.clientWidth / canvasParent.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvasParent.clientWidth, canvasParent.clientHeight);
}
window.addEventListener('resize', resize);

const loader = new GLTFLoader();

async function loadModel(url) {
    return new Promise((resolve, reject) => {
        loader.load(url, (gltf) => {
            while (scene.children.length > 3) { // keep lights & camera
                const obj = scene.children[scene.children.length - 1];
                if (obj !== camera && obj !== hemi && obj !== key) scene.remove(obj);
            }

            const root = gltf.scene;
            root.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = child.receiveShadow = true;
                }
                if (child.isSkinnedMesh) {
                    currentSkinned = child;
                }
            });
            scene.add(root);
            fitToView(root);
            resolve(gltf);
        }, undefined, reject);
    });
}

function fitToView(object3d) {
    const box = new THREE.Box3().setFromObject(object3d);
    const size = box.getSize(new THREE.Vector3()).length();
    const center = box.getCenter(new THREE.Vector3());
    controls.target.copy(center);
    const distance = size * 0.6;
    camera.position.copy(center).add(new THREE.Vector3(distance, distance * 0.6, distance));
    camera.lookAt(center);
    controls.update();
}

function setMorph(name, weight) {
    if (!currentSkinned) return;
    const dict = currentSkinned.morphTargetDictionary;
    const infl = currentSkinned.morphTargetInfluences;
    const idx = dict && dict[name];
    if (idx !== undefined) infl[idx] = weight;
}

function blinkOnce(duration = 0.12) {
    const up = { t: 0 };
    const start = performance.now();
    function tick(now) {
        const e = (now - start) / (duration * 1000);
        const w = e < 0.5 ? e * 2 : (1 - (e - 0.5) * 2);
        const clamped = Math.max(0, Math.min(1, w));
        setMorph('EyeBlinkLeft', clamped);
        setMorph('EyeBlinkRight', clamped);
        if (e < 1) requestAnimationFrame(tick); else {
            setMorph('EyeBlinkLeft', 0);
            setMorph('EyeBlinkRight', 0);
        }
    }
    requestAnimationFrame(tick);
}

// Simple viseme driver example expecting events: { id: 'AA', strength: 0..1 }
const visemeMap = {
    AA: ['JawOpen'],
    O: ['MouthFunnel'],
    F: ['MouthF', 'MouthLowerDownLeft', 'MouthLowerDownRight'],
    L: ['TongueOut', 'MouthClose'],
    W: ['MouthPucker'],
    sil: ['MouthClose']
};

function applyViseme(id, strength) {
    Object.values(visemeMap).flat().forEach(n => setMorph(n, 0));
    const names = visemeMap[id] || [];
    names.forEach(n => setMorph(n, strength));
}

// UI wiring
document.getElementById('loadBtn').addEventListener('click', async () => {
    const url = document.getElementById('modelUrl').value.trim() || '/Human%20woman%20Diana%20Alatalo.glb';
    try { await loadModel(url); } catch (e) { console.error(e); alert('Failed to load model: ' + e.message); }
});
document.getElementById('idleBtn').addEventListener('click', () => {
    // light idle jaw motion demo
    let t0 = performance.now();
    function loop(now) {
        const s = 0.15 + 0.05 * Math.sin((now - t0) * 0.003);
        setMorph('JawOpen', s);
        req = requestAnimationFrame(loop);
    }
    if (window.__idleRAF) cancelAnimationFrame(window.__idleRAF);
    const req = requestAnimationFrame(loop);
    window.__idleRAF = req;
});
document.getElementById('blinkBtn').addEventListener('click', () => blinkOnce());

// Initial default
document.getElementById('modelUrl').value = '/Human%20woman%20Diana%20Alatalo.glb';

function animate() {
    const dt = clock.getDelta();
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}
animate();

