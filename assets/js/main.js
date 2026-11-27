import * as THREE from 'three';
import {VRButton} from 'three/addons/webxr/VRButton.js';

/* ================= Configuración Slenderman: Edición Completa 8-Bits VR (Optimizada) ================= */
const MAP_R = 72;               // Límite perimetral del mapa
const TOTAL_PAGES = 8;          // Las 8 páginas clásicas
const WALK_SPEED = 3.3;         // Velocidad caminando
const SPRINT_SPEED = 5.4;       // Velocidad esprintando
const rand = (a,b)=>a+Math.random()*(b-a);

// Almacenamiento seguro con respaldo en memoria
const memoryStorage = {};
function storageGet(key){
  try{
    const val = localStorage.getItem(key);
    if(val !== null){
      memoryStorage[key] = val;
      return val;
    }
  }catch{}
  return Object.prototype.hasOwnProperty.call(memoryStorage, key) ? memoryStorage[key] : null;
}
function storageSet(key, val){
  const strVal = String(val);
  memoryStorage[key] = strVal;
  try{
    localStorage.setItem(key, strVal);
    return true;
  }catch{
    return false;
  }
}

const AUDIO_PREFS_KEY = 'slender_audio_mix_v1';
const DEFAULT_AUDIO_PREFS = { music: 58, ambience: 48, effects: 68, muted: false };
function loadAudioPrefs(){
  try{
    const saved = JSON.parse(storageGet(AUDIO_PREFS_KEY) || '{}');
    return {
      music: Math.max(0, Math.min(100, Number(saved.music ?? DEFAULT_AUDIO_PREFS.music))),
      ambience: Math.max(0, Math.min(100, Number(saved.ambience ?? DEFAULT_AUDIO_PREFS.ambience))),
      effects: Math.max(0, Math.min(100, Number(saved.effects ?? DEFAULT_AUDIO_PREFS.effects))),
      muted: Boolean(saved.muted ?? DEFAULT_AUDIO_PREFS.muted)
    };
  }catch{
    return {...DEFAULT_AUDIO_PREFS};
  }
}
let audioPrefs = loadAudioPrefs();

const GAME_SETTINGS_KEY = 'slender_game_settings_v2';
const DEFAULT_GAME_SETTINGS = { quality: 'balanced', reducedMotion: false, microphone: true };
function loadGameSettings(){
  try{
    const saved = JSON.parse(storageGet(GAME_SETTINGS_KEY) || '{}');
    return {
      quality: ['performance','balanced','quality'].includes(saved.quality) ? saved.quality : DEFAULT_GAME_SETTINGS.quality,
      reducedMotion: Boolean(saved.reducedMotion ?? DEFAULT_GAME_SETTINGS.reducedMotion),
      microphone: Boolean(saved.microphone ?? DEFAULT_GAME_SETTINGS.microphone)
    };
  }catch{
    return {...DEFAULT_GAME_SETTINGS};
  }
}
let gameSettings = loadGameSettings();
const QUALITY_PRESETS = {
  performance: { desktopPixelRatio: 0.85, xrScale: 0.72, particleCount: 70, rainCount: 110, label: 'RENDIMIENTO' },
  balanced: { desktopPixelRatio: 1.0, xrScale: 0.82, particleCount: 120, rainCount: 180, label: 'EQUILIBRADO' },
  quality: { desktopPixelRatio: 1.25, xrScale: 0.9, particleCount: 180, rainCount: 260, label: 'CALIDAD' }
};

/* ================= Render, escena, listener 3D y rig del jugador ================= */
const app = document.getElementById('app');
const vhsOverlay = document.getElementById('vhs-overlay');
const vhsRecText = document.getElementById('vhs-rec-text');
const vhsTracking = document.getElementById('vhs-tracking');
const renderer = new THREE.WebGLRenderer({
  antialias: false,
  powerPreference: 'high-performance',
  stencil: false,
  depth: true
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = false;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY_PRESETS[gameSettings.quality].desktopPixelRatio));
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.domElement.setAttribute('aria-label', 'Escenario tridimensional de SLENDER: THE 8 PAGES');
renderer.domElement.style.touchAction = 'none';
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFramebufferScaleFactor?.(QUALITY_PRESETS[gameSettings.quality].xrScale);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.matrixWorldAutoUpdate = true;
const baseFogDensity = 0.056;
scene.fog = new THREE.FogExp2(0x020103, baseFogDensity);
const camera = new THREE.PerspectiveCamera(70, app.clientWidth/app.clientHeight, 0.05, 150);
camera.position.y = 1.6;

// Panel de pausa 3D
const pauseMenuCanvas = document.createElement('canvas');
pauseMenuCanvas.width = 1024;
pauseMenuCanvas.height = 768;
const pauseMenuTexture = new THREE.CanvasTexture(pauseMenuCanvas);
pauseMenuTexture.colorSpace = THREE.SRGBColorSpace;
const pauseMenu3D = new THREE.Group();
const pauseMenuMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1.45, 1.08),
  new THREE.MeshBasicMaterial({ map: pauseMenuTexture, transparent: true, depthTest: false })
);
pauseMenuMesh.renderOrder = 1000;
pauseMenu3D.add(pauseMenuMesh);
pauseMenu3D.position.set(0, 0, -1.85);
pauseMenu3D.renderOrder = 1000;
pauseMenu3D.visible = false;
camera.add(pauseMenu3D);

// Paneles de evento y resultado en VR
const firstContactCanvas = document.createElement('canvas');
firstContactCanvas.width = 760; firstContactCanvas.height = 320;
const firstContactTexture = new THREE.CanvasTexture(firstContactCanvas);
firstContactTexture.colorSpace = THREE.SRGBColorSpace;
const firstContact3D = new THREE.Group();
const firstContactMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1.02, 0.43),
  new THREE.MeshBasicMaterial({map:firstContactTexture, transparent:true, depthTest:false})
);
firstContactMesh.renderOrder = 1001;
firstContact3D.add(firstContactMesh);
firstContact3D.position.set(0, 0.18, -1.55);
firstContact3D.renderOrder = 1001;
firstContact3D.visible = false;
camera.add(firstContact3D);

const gameOverCanvas = document.createElement('canvas');
gameOverCanvas.width = 1024; gameOverCanvas.height = 768;
const gameOverTexture = new THREE.CanvasTexture(gameOverCanvas);
gameOverTexture.colorSpace = THREE.SRGBColorSpace;
const gameOverPanel3D = new THREE.Group();
const gameOverMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1.55, 1.16),
  new THREE.MeshBasicMaterial({map:gameOverTexture, transparent:true, depthTest:false})
);
gameOverMesh.renderOrder = 1002;
gameOverPanel3D.add(gameOverMesh);
gameOverPanel3D.position.set(0, 0, -1.8);
gameOverPanel3D.renderOrder = 1002;
gameOverPanel3D.visible = false;
camera.add(gameOverPanel3D);

// AudioListener 3D vinculado a la cabeza del jugador
const audioListener = new THREE.AudioListener();
camera.add(audioListener);

const dolly = new THREE.Group(); dolly.add(camera); scene.add(dolly);
dolly.position.set(0,0,6);

document.getElementById('enter').appendChild(VRButton.createButton(renderer));
function resizeRendererToApp(){
  if(renderer.xr.isPresenting) return;
  const width = Math.max(1, app.clientWidth);
  const height = Math.max(1, app.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resizeRendererToApp, {passive:true});
const appResizeObserver = typeof ResizeObserver !== 'undefined'
  ? new ResizeObserver(resizeRendererToApp)
  : null;
appResizeObserver?.observe(app);

/* ================= Estado del juego, Dificultad, Batería, Stamina y Micrófono ================= */
let pagesFound = 0, roundStartTime = 300, timeLeft = 300, sanity = 100;
let battery = 100, stamina = 100, exhausted = false;
let playing = false, paused = false, gameOverActive = false;
let firstEncounterShown = false, firstEncounterTimer = 0;
let diffMultiplier = 1.0;
const isNightmare = () => diffMultiplier > 1.1;

let screamerTimer = 0, nextTpTimer = 7, flashlightOn = true, flashFailTimer = 0;
let invertControlsTimer = 0;
let lightningTimer = 9, lightningFlash = 0;
let currentZone = 'BOSQUE OSCURO';
let breathTimer = 0;

// Estadísticas y récords
let timesHeard = 0, heardCooldown = 0, distanceWalked = 0;

// Variables de micrófono del mundo real
let micAnalyser = null, micData = null, micReady = false, micLevel = 0;
let micStream = null, micContext = null, micNoiseFloor = 0.004, micCalibrationUntil = 0;
let stealthTimer = 0;

function getNoiseThreshold(){
  return isNightmare() ? 0.024 : 0.034;
}

/* ================= Récords Locales ================= */
function formatTime(sec){
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
}

function loadRecords(){
  const rnTime = storageGet('slender_rec_normal');
  const rnScore = Number(storageGet('slender_best_score_normal') || 0);
  const rpTime = storageGet('slender_rec_nightmare');
  const rpScore = Number(storageGet('slender_best_score_nightmare') || 0);

  const recNormalEl = document.getElementById('rec-normal');
  const recNightmareEl = document.getElementById('rec-nightmare');

  if(recNormalEl){
    const timeStr = rnTime !== null && Number.isFinite(parseFloat(rnTime)) ? formatTime(parseFloat(rnTime)) : '--:--';
    recNormalEl.textContent = rnScore > 0 ? `${timeStr} (${rnScore} PTS)` : timeStr;
  }
  if(recNightmareEl){
    const timeStr = rpTime !== null && Number.isFinite(parseFloat(rpTime)) ? formatTime(parseFloat(rpTime)) : '--:--';
    recNightmareEl.textContent = rpScore > 0 ? `${timeStr} (${rpScore} PTS)` : timeStr;
  }
}
loadRecords();

/* ================= Texturas Pixel-Art (NearestFilter) ================= */
function pixelTex(w,h,draw,rep){
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
  draw(g,w,h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  if(rep){t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep,rep);}
  return t;
}

const grass = pixelTex(16,16,(g,w,h)=>{
  g.fillStyle='#141812'; g.fillRect(0,0,w,h);
  const cols = ['#090b08','#1f261b','#2b221c','#360a10'];
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    if(Math.random()<.55){
      g.fillStyle = cols[Math.floor(Math.random()*cols.length)];
      g.fillRect(x,y,1,1);
    }
  }
},44);
const floor = new THREE.Mesh(new THREE.CircleGeometry(MAP_R + 4, 36), new THREE.MeshLambertMaterial({map:grass}));
floor.rotation.x = -Math.PI/2;
floor.matrixAutoUpdate = false;
floor.updateMatrix();
scene.add(floor);

const skyMat = new THREE.MeshBasicMaterial({side:THREE.BackSide, fog:false, depthWrite:false});
function paintSky(bloodMoon){
  if(skyMat.map) skyMat.map.dispose();
  skyMat.map = pixelTex(256,128,(g,w,h)=>{
    g.fillStyle = bloodMoon ? '#140104' : '#010102'; g.fillRect(0,0,w,h);
    for(let i=0;i<130;i++){
      g.fillStyle = (bloodMoon || i%3===0) ? '#b3001b' : '#444450';
      g.fillRect(Math.floor(Math.random()*w), Math.floor(Math.random()*h*0.7), 1, 1);
    }
    g.fillStyle = bloodMoon ? '#ff001e' : '#b3001b'; g.fillRect(190,18,18,18);
    g.fillStyle = '#59000d'; g.fillRect(194,22,5,5); g.fillRect(201,28,4,4);
  });
  skyMat.needsUpdate = true;
}
paintSky(false);
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(142,14,10), skyMat);
skyDome.matrixAutoUpdate = false;
skyDome.updateMatrix();
scene.add(skyDome);

/* ================= Partículas Flotantes (Luciérnagas, Cenizas y Niebla Baja) ================= */
const PARTICLE_COUNT = 180;
let activeParticleCount = QUALITY_PRESETS[gameSettings.quality].particleCount;
const pGeo = new THREE.BufferGeometry();
const pPositions = new Float32Array(PARTICLE_COUNT * 3);
const pColors = new Float32Array(PARTICLE_COUNT * 3);
const pSeeds = new Float32Array(PARTICLE_COUNT);

function resetParticles(isBloodPhase){
  for(let i=0; i<PARTICLE_COUNT; i++){
    const a = rand(0, Math.PI * 2);
    const r = rand(3, MAP_R - 4);
    const px = Math.cos(a) * r;
    const pz = Math.sin(a) * r;
    pPositions[i*3]   = px;
    pPositions[i*3+1] = rand(0.3, 4.0);
    pPositions[i*3+2] = pz;
    pSeeds[i] = rand(0, Math.PI * 2);

    const nearAltar = Math.hypot(px, pz - 42) < 18;
    const nearCem   = Math.hypot(px - 34, pz + 34) < 20;
    if(isBloodPhase || nearAltar){
      pColors[i*3]   = 1.0;
      pColors[i*3+1] = 0.12;
      pColors[i*3+2] = 0.22;
    } else if(nearCem){
      pColors[i*3]   = 0.55;
      pColors[i*3+1] = 0.65;
      pColors[i*3+2] = 0.85;
    } else {
      pColors[i*3]   = 0.55;
      pColors[i*3+1] = 0.95;
      pColors[i*3+2] = 0.45;
    }
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
  pGeo.setDrawRange(0, activeParticleCount);
  pGeo.attributes.color.needsUpdate = true;
}
resetParticles(false);

const pTex = pixelTex(8, 8, (g)=>{
  g.fillStyle = '#ffffff';
  g.fillRect(2, 2, 4, 4);
});
const pMat = new THREE.PointsMaterial({
  size: 0.16,
  map: pTex,
  vertexColors: true,
  transparent: true,
  opacity: 0.75,
  depthWrite: false
});
const floatingParticles = new THREE.Points(pGeo, pMat);
floatingParticles.frustumCulled = false;
scene.add(floatingParticles);

function updateParticles(t, dt){
  const pos = pGeo.attributes.position.array;
  for(let i=0; i<activeParticleCount; i++){
    const idx = i * 3;
    const s = pSeeds[i];
    pos[idx]   += Math.sin(t * 0.8 + s) * 0.18 * dt;
    pos[idx+1] += Math.cos(t * 1.1 + s) * 0.14 * dt;
    if(pos[idx+1] > 4.2) pos[idx+1] = 0.2;
    else if(pos[idx+1] < 0.2) pos[idx+1] = 3.8;
    pos[idx+2] += Math.sin(t * 0.7 + s * 1.3) * 0.18 * dt;
  }
  pGeo.attributes.position.needsUpdate = true;
}

/* ================= Lluvia Nocturna Sutil (Partículas Verticales) ================= */
const RAIN_COUNT = 260;
let activeRainCount = QUALITY_PRESETS[gameSettings.quality].rainCount;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_COUNT * 3);
for(let i=0; i<RAIN_COUNT; i++){
  rainPos[i*3]   = rand(-26, 26);
  rainPos[i*3+1] = rand(0, 14);
  rainPos[i*3+2] = rand(-26, 26);
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
rainGeo.setDrawRange(0, activeRainCount);
const rainTex = pixelTex(4, 16, (g)=>{
  g.fillStyle = 'rgba(160, 180, 210, 0.55)';
  g.fillRect(1, 0, 2, 16);
});
const rainMesh = new THREE.Points(rainGeo, new THREE.PointsMaterial({
  size: 0.22, map: rainTex, transparent: true, opacity: 0.42, depthWrite: false
}));
rainMesh.frustumCulled = false;
scene.add(rainMesh);

function updateRain(dt){
  camera.getWorldPosition(head);
  rainMesh.position.set(head.x, 0, head.z);
  const arr = rainGeo.attributes.position.array;
  const fallSpeed = isNightmare() ? 14 : 9;
  for(let i=0; i<activeRainCount; i++){
    const idx = i * 3 + 1;
    arr[idx] -= fallSpeed * dt;
    if(arr[idx] < 0) arr[idx] = 14;
  }
  rainGeo.attributes.position.needsUpdate = true;
}

/* ================= Huellas de Pasos en la Tierra ================= */
const FOOTPRINT_MAX = 40;
const footprintPool = [];
let footprintIdx = 0;
let stepAccum = 0;
let leftFootNext = true;

const footTex = pixelTex(16, 24, (g)=>{
  g.fillStyle = 'rgba(18, 12, 8, 0.92)';
  g.fillRect(4, 2, 8, 12);
  g.fillRect(5, 16, 6, 6);
});
const footGeo = new THREE.PlaneGeometry(0.18, 0.28);
footGeo.rotateX(-Math.PI / 2);

for(let i=0; i<FOOTPRINT_MAX; i++){
  const m = new THREE.Mesh(
    footGeo,
    new THREE.MeshBasicMaterial({map: footTex, transparent: true, opacity: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1})
  );
  m.visible = false;
  scene.add(m);
  footprintPool.push({mesh: m, life: 0});
}

function spawnFootprint(worldPos, headingY){
  const fp = footprintPool[footprintIdx];
  footprintIdx = (footprintIdx + 1) % FOOTPRINT_MAX;

  const sideOffset = leftFootNext ? -0.14 : 0.14;
  leftFootNext = !leftFootNext;

  fp.mesh.position.set(
    worldPos.x + Math.cos(headingY) * sideOffset,
    0.015,
    worldPos.z - Math.sin(headingY) * sideOffset
  );
  fp.mesh.rotation.y = headingY;
  fp.mesh.visible = true;
  fp.life = 1.0;
  fp.mesh.material.opacity = 0.72;
}

function updateFootprints(dt){
  for(let i=0; i<FOOTPRINT_MAX; i++){
    const fp = footprintPool[i];
    if(fp.life > 0){
      fp.life -= dt * 0.028;
      if(fp.life <= 0){
        fp.life = 0;
        fp.mesh.visible = false;
      } else {
        fp.mesh.material.opacity = fp.life * 0.72;
      }
    }
  }
}

function clearFootprints(){
  for(const fp of footprintPool){
    fp.life = 0;
    fp.mesh.visible = false;
  }
  stepAccum = 0;
}

/* ================= Iluminación + Linterna 3D Visible ================= */
const hemi = new THREE.HemisphereLight(0x141220, 0x030304, 0.07);
scene.add(hemi);

const lightningLight = new THREE.DirectionalLight(0x99bbff, 0);
lightningLight.position.set(10, 40, -10);
scene.add(lightningLight);

const flashRig = new THREE.Group();
const bodyMat = new THREE.MeshLambertMaterial({color:0x1b1b22});
const headFlashMat = new THREE.MeshLambertMaterial({color:0x33333d});
const lensMat = new THREE.MeshBasicMaterial({color:0xfff6cc});
const beamMat = new THREE.MeshBasicMaterial({
  color:0xfff2b2, transparent:true, opacity:0.11, side:THREE.DoubleSide, depthWrite:false
});

const fBody = new THREE.Mesh(new THREE.BoxGeometry(.045, .045, .18), bodyMat);
const fHead = new THREE.Mesh(new THREE.BoxGeometry(.065, .065, .05), headFlashMat);
fHead.position.z = -.10;
const fLens = new THREE.Mesh(new THREE.PlaneGeometry(.052, .052), lensMat);
fLens.position.z = -.126; fLens.rotation.y = Math.PI;

const beamGeo = new THREE.ConeGeometry(1.7, 8.0, 12, 1, true);
beamGeo.translate(0, -4.0, 0);
beamGeo.rotateX(Math.PI / 2);
const beamMesh = new THREE.Mesh(beamGeo, beamMat);
beamMesh.position.z = -.13;

const flashlight = new THREE.SpotLight(0xfff5d6, 52, 36, Math.PI / 4.6, 0.45, 0.65);
const flashTarget = new THREE.Object3D();
flashTarget.position.set(0, 0, -8);
flashlight.add(flashTarget);
flashlight.target = flashTarget;

flashRig.add(fBody, fHead, fLens, beamMesh, flashlight);
flashRig.position.set(0.24, -0.22, -0.32);
camera.add(flashRig);

/* ================= Indicador Flotante de Interacción VR ================= */
const vrPromptTex = pixelTex(128, 32, (g, w, h)=>{
  g.fillStyle = 'rgba(10, 10, 16, 0.92)';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = '#ffec27';
  g.lineWidth = 3;
  g.strokeRect(2, 2, w - 4, h - 4);
  g.fillStyle = '#ffec27';
  g.font = 'bold 11px monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('[GATILLO DER / A]', w / 2, h / 2);
});
const vrPromptSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({map: vrPromptTex, transparent: true, depthTest: false})
);
vrPromptSprite.scale.set(0.56, 0.14, 1);
vrPromptSprite.renderOrder = 995;
vrPromptSprite.visible = false;
scene.add(vrPromptSprite);

/* ================= Construcción Optimizada con InstancedMesh (Bajo Draw Calls) ================= */
const colliders = [];
const hidingSpots = [];
const _dummy = new THREE.Object3D();

function addHidingSpot(x, y, z, rotY){
  hidingSpots.push({pos: new THREE.Vector3(x, y, z), rotY});
}

function isAreaClear(x, z, minDist=5){
  if(Math.hypot(x, z) < 7) return false;
  if(Math.hypot(x, z) > MAP_R - 4) return false;
  for(let i=0; i<colliders.length; i++){
    const c = colliders[i];
    if(Math.hypot(x - c.x, z - c.z) < minDist) return false;
  }
  return true;
}

const trunkM = new THREE.MeshLambertMaterial({color:0x362318});
const deadLeafM = new THREE.MeshLambertMaterial({color:0x112617});
const stoneM = new THREE.MeshLambertMaterial({color:0x3c3c46});
const darkStoneM = new THREE.MeshLambertMaterial({color:0x25252c});
const crossM = new THREE.MeshLambertMaterial({color:0x4a2e1d});
const woodWallM = new THREE.MeshLambertMaterial({color:0x2e1d12});
const fenceM = new THREE.MeshLambertMaterial({color:0x241710});
const pathStoneM = new THREE.MeshLambertMaterial({color:0x2c2c34});

// --- CERCO PERIMETRAL DEL MAPA (InstancedMesh: 2 draw calls en lugar de 168) ---
const fencePosts = 56;
const postInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.35, 2.4, 0.35), fenceM, fencePosts);
const railInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.14, 1), fenceM, fencePosts * 2);

for(let i=0; i<fencePosts; i++){
  const a1 = (i / fencePosts) * Math.PI * 2;
  const a2 = ((i + 1) / fencePosts) * Math.PI * 2;
  const x1 = Math.cos(a1) * MAP_R, z1 = Math.sin(a1) * MAP_R;
  const x2 = Math.cos(a2) * MAP_R, z2 = Math.sin(a2) * MAP_R;

  _dummy.position.set(x1, 1.2, z1);
  _dummy.rotation.set(0, 0, 0);
  _dummy.scale.set(1, 1, 1);
  _dummy.updateMatrix();
  postInst.setMatrixAt(i, _dummy.matrix);

  const midX = (x1 + x2) / 2, midZ = (z1 + z2) / 2;
  const len = Math.hypot(x2 - x1, z2 - z1);
  _dummy.position.set(midX, 1.7, midZ);
  _dummy.lookAt(x2, 1.7, z2);
  _dummy.scale.set(1, 1, len);
  _dummy.updateMatrix();
  railInst.setMatrixAt(i * 2, _dummy.matrix);

  _dummy.position.y = 0.9;
  _dummy.updateMatrix();
  railInst.setMatrixAt(i * 2 + 1, _dummy.matrix);
}
scene.add(postInst, railInst);

// --- ESCENARIO 1: EL CEMENTERIO ANTIGUO (Noreste) ---
const cemCenter = {x: 34, z: -34};
const tombTransforms = [];
const crossVTransforms = [];
const crossHTransforms = [];

for(let gx = -15; gx <= 15; gx += 5){
  for(let gz = -15; gz <= 15; gz += 5){
    const x = cemCenter.x + gx + rand(-0.8,0.8);
    const z = cemCenter.z + gz + rand(-0.8,0.8);
    if(Math.random() < 0.65){
      tombTransforms.push({x, y: 0.67, z});
      colliders.push({x, z, r:.6});
      const side = Math.random() < 0.5 ? 1 : -1;
      addHidingSpot(x, 0.85, z + side * 0.16, side === 1 ? 0 : Math.PI);
    } else {
      crossVTransforms.push({x, y: 0.85, z});
      crossHTransforms.push({x, y: 1.25, z});
      colliders.push({x, z, r:.45});
    }
  }
}

if(tombTransforms.length){
  const tombInst = new THREE.InstancedMesh(new THREE.BoxGeometry(.85, 1.35, .28), stoneM, tombTransforms.length);
  tombTransforms.forEach((p, idx)=>{
    _dummy.position.set(p.x, p.y, p.z);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    tombInst.setMatrixAt(idx, _dummy.matrix);
  });
  scene.add(tombInst);
}
if(crossVTransforms.length){
  const cVInst = new THREE.InstancedMesh(new THREE.BoxGeometry(.18, 1.7, .18), crossM, crossVTransforms.length);
  const cHInst = new THREE.InstancedMesh(new THREE.BoxGeometry(.9, .18, .18), crossM, crossHTransforms.length);
  crossVTransforms.forEach((p, idx)=>{
    _dummy.position.set(p.x, p.y, p.z);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    cVInst.setMatrixAt(idx, _dummy.matrix);
    _dummy.position.y = crossHTransforms[idx].y;
    _dummy.updateMatrix();
    cHInst.setMatrixAt(idx, _dummy.matrix);
  });
  scene.add(cVInst, cHInst);
}

const mausoleum = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.2, 4.2), darkStoneM);
mausoleum.position.set(cemCenter.x, 1.6, cemCenter.z);
mausoleum.matrixAutoUpdate = false;
mausoleum.updateMatrix();
scene.add(mausoleum);
colliders.push({x: cemCenter.x, z: cemCenter.z, r: 2.6});
addHidingSpot(cemCenter.x, 1.4, cemCenter.z + 2.13, 0);
addHidingSpot(cemCenter.x, 1.4, cemCenter.z - 2.13, Math.PI);

// --- ESCENARIO 2: RUINAS DE LA CABAÑA (Noroeste) + RADIO ROTA ---
const ruinCenter = {x: -36, z: -32};
const walls = [
  {x: 0, z: -5, w: 10, d: 0.6, h: 2.8},
  {x: 0, z:  5, w: 10, d: 0.6, h: 2.2},
  {x: -5, z: 0, w: 0.6, d: 10, h: 2.6},
  {x:  5, z: -2.5, w: 0.6, d: 4.5, h: 2.5},
  {x:  5, z:  2.8, w: 0.6, d: 4.0, h: 2.5}
];
walls.forEach(w=>{
  const wx = ruinCenter.x + w.x, wz = ruinCenter.z + w.z;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w.w, w.h, w.d), woodWallM);
  mesh.position.set(wx, w.h/2, wz);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  scene.add(mesh);
  const steps = Math.ceil(Math.max(w.w, w.d));
  for(let s=0; s<steps; s++){
    const cx = wx - w.w/2 + (w.w/steps)*(s+0.5);
    const cz = wz - w.d/2 + (w.d/steps)*(s+0.5);
    colliders.push({x:cx, z:cz, r:0.65});
  }
});
addHidingSpot(ruinCenter.x - 4.65, 1.4, ruinCenter.z - 2, Math.PI/2);
addHidingSpot(ruinCenter.x + 2, 1.35, ruinCenter.z - 4.65, 0);
addHidingSpot(ruinCenter.x - 2, 1.35, ruinCenter.z + 4.65, Math.PI);

const oldRadio = new THREE.Group();
const radioBox = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.24, 0.22), new THREE.MeshLambertMaterial({color:0x1b1b22}));
const radioLed = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.02), new THREE.MeshBasicMaterial({color:0xff1e38}));
radioLed.position.set(0.12, 0.04, 0.115);
const radioAnt = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.35, 0.02), new THREE.MeshLambertMaterial({color:0x777788}));
radioAnt.position.set(-0.15, 0.24, 0); radioAnt.rotation.z = -0.25;
oldRadio.add(radioBox, radioLed, radioAnt);
oldRadio.position.set(ruinCenter.x - 3.2, 0.12, ruinCenter.z + 3.2);
oldRadio.rotation.y = 0.7;
scene.add(oldRadio);

// --- ESCENARIO 3: CÍRCULO RITUAL DE MONOLITOS CON RUNAS ROJAS (Sur) ---
const ritualCenter = {x: 0, z: 42};
const runeTex = pixelTex(16, 48, (g,w,h)=>{
  g.fillStyle = '#25252c'; g.fillRect(0,0,w,h);
  g.fillStyle = '#ff001e';
  g.fillRect(7, 4, 2, 40);
  g.fillRect(3, 12, 10, 2);
  g.fillRect(4, 24, 8, 2);
  g.fillRect(3, 34, 10, 2);
});
const runeMat = new THREE.MeshBasicMaterial({map:runeTex});
const monoGeo = new THREE.BoxGeometry(1.3, 4.2, 1.3);
const runeGeo = new THREE.PlaneGeometry(0.45, 2.4);

for(let i=0; i<8; i++){
  const ang = (i / 8) * Math.PI * 2;
  const mx = ritualCenter.x + Math.cos(ang) * 9.5;
  const mz = ritualCenter.z + Math.sin(ang) * 9.5;
  const mono = new THREE.Mesh(monoGeo, darkStoneM);
  mono.position.set(mx, 2.1, mz);
  mono.lookAt(ritualCenter.x, 2.1, ritualCenter.z);

  const runeStrip = new THREE.Mesh(runeGeo, runeMat);
  runeStrip.position.z = 0.66;
  mono.add(runeStrip);
  mono.updateMatrixWorld(true);
  mono.matrixAutoUpdate = false;
  runeStrip.matrixAutoUpdate = false;

  scene.add(mono);
  colliders.push({x: mx, z: mz, r: 0.95});
  const inward = i % 2 === 0;
  const dirX = Math.cos(ang) * (inward ? -0.68 : 0.68);
  const dirZ = Math.sin(ang) * (inward ? -0.68 : 0.68);
  const rot = Math.atan2(dirX, dirZ);
  addHidingSpot(mx + dirX, 1.45, mz + dirZ, rot);
}
const altar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.4), stoneM);
altar.position.set(ritualCenter.x, 0.55, ritualCenter.z);
altar.matrixAutoUpdate = false;
altar.updateMatrix();
const altarOrb = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), new THREE.MeshBasicMaterial({color:0xff001e}));
altarOrb.position.set(ritualCenter.x, 1.35, ritualCenter.z);
scene.add(altar, altarOrb);
colliders.push({x: ritualCenter.x, z: ritualCenter.z, r: 1.3});

// --- SENDEROS DE PIEDRA Y POSTES GUÍA (InstancedMesh) ---
const pathCoords = [];
const lampPostsData = [];
[cemCenter, ruinCenter, ritualCenter].forEach(dest=>{
  const steps = 16;
  for(let s=2; s<steps; s++){
    const t = s / steps;
    const px = dest.x * t + rand(-0.6, 0.6);
    const pz = dest.z * t + rand(-0.6, 0.6);
    pathCoords.push({x: px, z: pz, rot: rand(0, Math.PI)});

    if(s % 5 === 0){
      const lx = px + 1.4, lz = pz + 1.4;
      lampPostsData.push({x: lx, z: lz});
      colliders.push({x: lx, z: lz, r: 0.3});
    }
  }
});

const pathInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), pathStoneM, pathCoords.length);
pathCoords.forEach((p, idx)=>{
  _dummy.position.set(p.x, 0.025, p.z);
  _dummy.rotation.set(0, p.rot, 0);
  _dummy.scale.set(1, 1, 1);
  _dummy.updateMatrix();
  pathInst.setMatrixAt(idx, _dummy.matrix);
});
scene.add(pathInst);

if(lampPostsData.length){
  const lPoleInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 2.3, 0.16), fenceM, lampPostsData.length);
  const lHeadInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.34, 0.28), new THREE.MeshBasicMaterial({color:0x4a1218}), lampPostsData.length);
  lampPostsData.forEach((p, idx)=>{
    _dummy.position.set(p.x, 1.15, p.z);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(1, 1, 1);
    _dummy.updateMatrix();
    lPoleInst.setMatrixAt(idx, _dummy.matrix);
    _dummy.position.y = 2.35;
    _dummy.updateMatrix();
    lHeadInst.setMatrixAt(idx, _dummy.matrix);
  });
  scene.add(lPoleInst, lHeadInst);
}

// --- ESCENARIO 4: BOSQUE PROFUNDO CON INSTANCEDMESH (3 draw calls para 135 árboles) ---
const bats = [];
const batMat = new THREE.MeshBasicMaterial({color:0x08080c});
const treeTrunks = [];
const treeCanopies1 = [];
const treeCanopies2 = [];
const treeBranches = [];

for(let i=0; i<135; i++){
  let x, z, tries = 0;
  do{
    const a = rand(0, Math.PI * 2);
    const rad = rand(8, MAP_R - 4);
    x = Math.cos(a) * rad;
    z = Math.sin(a) * rad;
    tries++;
  } while((!isAreaClear(x, z, 4.8) || pathCoords.some(p => Math.hypot(x-p.x, z-p.z) < 2.6)) && tries < 25);
  if(tries >= 25) continue;

  const s = rand(1.0, 1.8);
  const trunkW = 0.65 * s;
  treeTrunks.push({x, z, s});

  if(i % 2 === 0){
    treeCanopies1.push({x, z, s});
    treeCanopies2.push({x, z, s});
  } else {
    treeBranches.push({x, z, s});
  }

  colliders.push({x, z, r: trunkW * 0.65});

  if(Math.hypot(x, z) > 15 && i % 3 === 0){
    const face = i % 4;
    const off = trunkW * 0.5 + 0.025;
    if(face === 0) addHidingSpot(x, 1.45, z + off, 0);
    if(face === 1) addHidingSpot(x, 1.45, z - off, Math.PI);
    if(face === 2) addHidingSpot(x + off, 1.45, z, Math.PI/2);
    if(face === 3) addHidingSpot(x - off, 1.45, z, -Math.PI/2);
  }

  if(i % 14 === 0 && bats.length < 10){
    const batGrp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.16), batMat);
    const wL   = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.12), batMat); wL.position.x = -0.16;
    const wR   = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.12), batMat); wR.position.x =  0.16;
    batGrp.add(body, wL, wR);
    batGrp.position.set(x, 3.2, z);
    batGrp.visible = false;
    scene.add(batGrp);
    bats.push({grp: batGrp, wL, wR, home: new THREE.Vector3(x, 3.2, z), flying: false, flyTimer: 0, dir: new THREE.Vector3()});
  }
}

const trunkInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.65, 3.8, 0.65), trunkM, treeTrunks.length);
treeTrunks.forEach((tr, idx)=>{
  _dummy.position.set(tr.x, 1.9 * tr.s, tr.z);
  _dummy.rotation.set(0, 0, 0);
  _dummy.scale.set(tr.s, tr.s, tr.s);
  _dummy.updateMatrix();
  trunkInst.setMatrixAt(idx, _dummy.matrix);
});
scene.add(trunkInst);

if(treeCanopies1.length){
  const c1Inst = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 1.3, 2.3), deadLeafM, treeCanopies1.length);
  const c2Inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1.0, 1.4), deadLeafM, treeCanopies2.length);
  treeCanopies1.forEach((c, idx)=>{
    _dummy.position.set(c.x, 3.7 * c.s, c.z);
    _dummy.rotation.set(0, 0, 0);
    _dummy.scale.set(c.s, c.s, c.s);
    _dummy.updateMatrix();
    c1Inst.setMatrixAt(idx, _dummy.matrix);

    _dummy.position.set(c.x, 4.6 * c.s, c.z);
    _dummy.updateMatrix();
    c2Inst.setMatrixAt(idx, _dummy.matrix);
  });
  scene.add(c1Inst, c2Inst);
}

if(treeBranches.length){
  const bInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.16, 0.16), trunkM, treeBranches.length);
  treeBranches.forEach((b, idx)=>{
    _dummy.position.set(b.x + 0.45 * b.s, 2.8 * b.s, b.z);
    _dummy.rotation.set(0, 0, 0.4);
    _dummy.scale.set(b.s, b.s, b.s);
    _dummy.updateMatrix();
    bInst.setMatrixAt(idx, _dummy.matrix);
  });
  scene.add(bInst);
}

function updateBats(t, dt){
  camera.getWorldPosition(head);
  for(let i=0; i<bats.length; i++){
    const b = bats[i];
    if(!b.flying){
      if(playing && !paused && b.home.distanceToSquared(head) < 56.25){
        b.flying = true;
        b.flyTimer = 3.2;
        b.grp.visible = true;
        b.grp.position.copy(b.home);
        b.dir.set(rand(-1,1), rand(0.5, 1.1), rand(-1,1)).normalize();
        sfx('bats');
      }
    } else {
      b.flyTimer -= dt;
      b.grp.position.addScaledVector(b.dir, 6.5 * dt);
      const flap = Math.sin(t * 28) * 0.7;
      b.wL.rotation.z = flap;
      b.wR.rotation.z = -flap;
      if(b.flyTimer <= 0){
        b.flying = false;
        b.grp.visible = false;
      }
    }
  }
}

// Ojos rojos acechando en la oscuridad
const shadowEyes = [];
const redEyeMat = new THREE.MeshBasicMaterial({color:0xff001e});
const eyeGeo = new THREE.BoxGeometry(.07,.05,.05);
for(let i=0;i<12;i++){
  const grp = new THREE.Group();
  const e1 = new THREE.Mesh(eyeGeo, redEyeMat); e1.position.x = -.11;
  const e2 = new THREE.Mesh(eyeGeo, redEyeMat); e2.position.x =  .11;
  grp.add(e1,e2);
  grp.position.set(rand(-50,50), rand(1.1,2.2), rand(-50,50));
  scene.add(grp);
  shadowEyes.push(grp);
}

/* ================= Pilas 3D en el Mapa ================= */
const batteries = [];
const batBodyMat = new THREE.MeshLambertMaterial({color:0x111116});
const batTopMat  = new THREE.MeshLambertMaterial({color:0x00e436, emissive:0x00330c});
const batTipMat  = new THREE.MeshLambertMaterial({color:0xffec27});
const batGeo1 = new THREE.BoxGeometry(0.14, 0.16, 0.14);
const batGeo2 = new THREE.BoxGeometry(0.14, 0.10, 0.14);
const batGeo3 = new THREE.BoxGeometry(0.06, 0.04, 0.06);

function spawnBatteries(){
  batteries.forEach(b=>scene.remove(b.m)); batteries.length = 0;
  const fixedSpots = [
    {x: cemCenter.x + 2, z: cemCenter.z + 3},
    {x: ruinCenter.x, z: ruinCenter.z},
    {x: ritualCenter.x, z: ritualCenter.z + 1.5}
  ];
  const count = isNightmare() ? 5 : 10;
  for(let i=0; i<count; i++){
    let bx, bz;
    if(i < fixedSpots.length){
      bx = fixedSpots[i].x; bz = fixedSpots[i].z;
    } else {
      const a = rand(0, Math.PI * 2);
      const r = rand(10, MAP_R - 5);
      bx = Math.cos(a) * r; bz = Math.sin(a) * r;
    }
    const grp = new THREE.Group();
    const b1 = new THREE.Mesh(batGeo1, batBodyMat);
    const b2 = new THREE.Mesh(batGeo2, batTopMat); b2.position.y = 0.13;
    const b3 = new THREE.Mesh(batGeo3, batTipMat); b3.position.y = 0.20;
    grp.add(b1, b2, b3);
    grp.position.set(bx, 0.25, bz);
    scene.add(grp);
    batteries.push({m: grp, phase: rand(0, 6)});
  }
}

/* ================= Las 8 Páginas Ocultas + Visor de Página Recogida ================= */
const pages = [];
const pageTexts = [
  'NO MIRES', 'SIEMPRE OBSERVA', 'SIN ROSTRO', 'CORRE YA',
  '8 PAGINAS', 'NO HAY SALIDA', 'ESTA DETRAS', 'DEJAME EN PAZ'
];

function drawPageArt(g, w, h, txt){
  g.fillStyle='#cfc9ba'; g.fillRect(0,0,w,h);
  g.strokeStyle='#111'; g.lineWidth=Math.max(2, w*0.05); g.strokeRect(2,2,w-4,h-4);
  g.fillStyle='#111';
  const sx = w / 64, sy = h / 80;
  g.fillRect(28*sx,14*sy,8*sx,9*sy);
  g.fillRect(30*sx,23*sy,4*sx,22*sy);
  g.fillRect(14*sx,25*sy,16*sx,2*sy); g.fillRect(34*sx,25*sy,16*sx,2*sy);
  g.fillRect(8*sx,17*sy,8*sx,2*sy); g.fillRect(48*sx,17*sy,8*sx,2*sy);
  g.fillRect(10*sx,45*sy,3*sx,12*sy); g.fillRect(51*sx,45*sy,3*sx,12*sy);
  g.font=`bold ${Math.floor(7*sx)}px monospace`; g.textAlign='center';
  g.fillText(txt, w/2, 68*sy);
}

function createPageTex(txt){
  return pixelTex(64,80,(g,w,h)=>drawPageArt(g,w,h,txt));
}
const pageGeo = new THREE.BoxGeometry(.34, .44, .02);

const pageViewerEl = document.getElementById('page-viewer');
const pagePreviewCv = document.getElementById('page-preview-cv');
const pageViewerCount = document.getElementById('page-viewer-count');
const pageCollectionSlots = [...document.querySelectorAll('.page-slot')];
const pageCollectionProgress = document.getElementById('page-collection-progress');
let previewTimeout = null;

const vrPageNoticeCanvas = document.createElement('canvas');
vrPageNoticeCanvas.width = 640; vrPageNoticeCanvas.height = 420;
const vrPageNoticeTexture = new THREE.CanvasTexture(vrPageNoticeCanvas);
vrPageNoticeTexture.colorSpace = THREE.SRGBColorSpace;
vrPageNoticeTexture.magFilter = THREE.NearestFilter;
const vrPageNotice = new THREE.Group();
const vrPageNoticeMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.78, 0.51),
  new THREE.MeshBasicMaterial({map:vrPageNoticeTexture, transparent:true, depthTest:false})
);
vrPageNoticeMesh.renderOrder = 998;
vrPageNotice.add(vrPageNoticeMesh);
vrPageNotice.position.set(-0.48, -0.28, -1.35);
vrPageNotice.visible = false;
camera.add(vrPageNotice);

function resetPageCollectionUI(){
  pageCollectionSlots.forEach((slot)=>{
    slot.classList.remove('found','recent');
    const canvas = slot.querySelector('canvas');
    if(canvas) canvas.getContext('2d')?.clearRect(0,0,canvas.width,canvas.height);
    const state = slot.querySelector('.page-slot-state');
    if(state) state.textContent = 'SIN DATOS';
  });
  if(pageCollectionProgress) pageCollectionProgress.textContent = `ARCHIVO: 0 / ${TOTAL_PAGES}`;
  if(pageViewerEl) pageViewerEl.classList.add('hidden');
  vrPageNotice.visible = false;
}

function updatePageCollectionUI(txt, count){
  const slot = pageCollectionSlots[count - 1];
  if(slot){
    const canvas = slot.querySelector('canvas');
    const ctx = canvas?.getContext('2d');
    if(ctx) drawPageArt(ctx, canvas.width, canvas.height, txt);
    slot.classList.add('found','recent');
    const state = slot.querySelector('.page-slot-state');
    if(state) state.textContent = 'RECUPERADA';
    pageCollectionSlots.forEach((item,index)=>{ if(index !== count-1) item.classList.remove('recent'); });
  }
  if(pageCollectionProgress) pageCollectionProgress.textContent = `ARCHIVO: ${count} / ${TOTAL_PAGES}`;
}

function drawVRPageNotice(txt, count){
  const ctx = vrPageNoticeCanvas.getContext('2d');
  ctx.clearRect(0,0,640,420);
  ctx.fillStyle = 'rgba(5,5,8,.96)'; ctx.fillRect(8,8,624,404);
  ctx.strokeStyle = '#b3001b'; ctx.lineWidth = 10; ctx.strokeRect(8,8,624,404);
  ctx.fillStyle = '#ff455c'; ctx.font = 'bold 25px monospace'; ctx.textAlign = 'left';
  ctx.fillText('ARCHIVO RECUPERADO // VHS-1994', 32, 48);
  const paper = document.createElement('canvas'); paper.width = 128; paper.height = 160;
  drawPageArt(paper.getContext('2d'), paper.width, paper.height, txt);
  ctx.drawImage(paper, 38, 78, 158, 198);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 30px monospace';
  ctx.fillText(`PÁGINA ${count} / ${TOTAL_PAGES}`, 226, 122);
  ctx.fillStyle = '#bdb6c0'; ctx.font = '22px monospace';
  ctx.fillText('DOCUMENTO AÑADIDO AL ARCHIVO', 226, 166);
  for(let i=0;i<TOTAL_PAGES;i++){
    const x = 228 + (i%4)*88, y = 218 + Math.floor(i/4)*62;
    ctx.fillStyle = i < count ? '#b3001b' : '#24232a';
    ctx.fillRect(x,y,68,42);
    ctx.strokeStyle = i < count ? '#ffec27' : '#55515b'; ctx.lineWidth = 3; ctx.strokeRect(x,y,68,42);
    ctx.fillStyle = i < count ? '#fff' : '#777'; ctx.font = 'bold 21px monospace'; ctx.textAlign = 'center';
    ctx.fillText(i < count ? '✓' : String(i+1).padStart(2,'0'), x+34, y+28);
  }
  ctx.textAlign = 'left'; ctx.fillStyle = '#ffec27'; ctx.font = '20px monospace';
  ctx.fillText('NO TE QUEDES MUCHO TIEMPO MIRÁNDOLA...', 32, 350);
  vrPageNoticeTexture.needsUpdate = true;
  vrPageNotice.visible = true;
}

function showCollectedPage(txt, count){
  const g = pagePreviewCv.getContext('2d');
  drawPageArt(g, pagePreviewCv.width, pagePreviewCv.height, txt);
  pageViewerCount.textContent = `PÁGINA ${count} / ${TOTAL_PAGES} RECOGIDA`;
  updatePageCollectionUI(txt, count);
  if(renderer.xr.isPresenting){
    pageViewerEl.classList.add('hidden');
    drawVRPageNotice(txt, count);
  } else {
    pageViewerEl.classList.remove('hidden');
  }
  clearTimeout(previewTimeout);
  previewTimeout = setTimeout(()=>{
    pageViewerEl.classList.add('hidden');
    vrPageNotice.visible = false;
  }, 3600);
}

function spawnPages(){
  pages.forEach(p=>scene.remove(p.m)); pages.length = 0;

  const shuffled = [...hidingSpots].sort(()=>Math.random()-0.5);
  const chosen = [];
  for(const spot of shuffled){
    if(chosen.every(c => c.pos.distanceTo(spot.pos) > 15)){
      chosen.push(spot);
      if(chosen.length === TOTAL_PAGES) break;
    }
  }

  for(let i=0; i<chosen.length; i++){
    const spot = chosen[i];
    const txt = pageTexts[i];
    const mat = new THREE.MeshLambertMaterial({map:createPageTex(txt)});
    const m = new THREE.Mesh(pageGeo, mat);
    m.position.copy(spot.pos);
    m.rotation.y = spot.rotY;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    scene.add(m);
    pages.push({m, txt});
  }
}

/* ================= Modelo Voxel de SLENDERMAN + Silueta de Alucinación ================= */
function buildSlenderMesh(isHallucination=false){
  const grp = new THREE.Group();
  const sMat = new THREE.MeshLambertMaterial({
    color:0x050507, transparent:isHallucination, opacity:isHallucination?0.55:1
  });
  const wMat = new THREE.MeshLambertMaterial({
    color:0xf8f8f8, emissive:0x1a1a1a, transparent:isHallucination, opacity:isHallucination?0.55:1
  });
  const tMat = new THREE.MeshLambertMaterial({color:0xb3001b, emissive:0x220004});

  const legL = new THREE.Mesh(new THREE.BoxGeometry(.16,1.3,.16), sMat); legL.position.set(-.13,.65,0);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(.16,1.3,.16), sMat); legR.position.set( .13,.65,0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(.48,1.0,.24), sMat); torso.position.set(0,1.8,0);
  const shirt = new THREE.Mesh(new THREE.BoxGeometry(.16,.35,.25), wMat); shirt.position.set(0,2.1,0);
  const tie   = new THREE.Mesh(new THREE.BoxGeometry(.07,.34,.26), tMat); tie.position.set(0,2.08,0);
  const armL  = new THREE.Mesh(new THREE.BoxGeometry(.12,1.45,.12), sMat); armL.position.set(-.32,1.58,0);
  const armR  = new THREE.Mesh(new THREE.BoxGeometry(.12,1.45,.12), sMat); armR.position.set( .32,1.58,0);
  const sHead = new THREE.Mesh(new THREE.BoxGeometry(.36,.46,.36), wMat); sHead.position.set(0,2.56,0);

  const tents = [];
  for(let i=0;i<6;i++){
    const tent = new THREE.Mesh(new THREE.BoxGeometry(.06,1.6,.06), sMat);
    tent.position.set((i%2===0?-1:1)*(.22+i*.07), 2.0, -.16);
    tent.rotation.z = (i%2===0?1:-1)*(.4 + i*.12);
    tent.rotation.x = -.4;
    grp.add(tent);
    tents.push(tent);
  }
  grp.add(legL,legR,torso,shirt,tie,armL,armR,sHead);
  return {grp, tents};
}

const {grp: slender, tents: tentacles} = buildSlenderMesh(false);
slender.position.set(0,0,-24);
scene.add(slender);

const {grp: phantomSlender} = buildSlenderMesh(true);
phantomSlender.visible = false;
scene.add(phantomSlender);
let phantomTimer = 0;
let forestEventTimer = 16;
let ambientGlitchTimer = 0;
let ambientApparitionTimer = 0;

/* ================= SCREAMER ORIGINAL OPTIMIZADO (Texturas Pre-Cacheadas) ================= */
function buildStaticTextures(count, isJumpscare){
  const list = [];
  for(let f=0; f<count; f++){
    list.push(pixelTex(96, 96, (g)=>{
      for(let i=0;i<240;i++){
        const shade = Math.random() > 0.5 ? 245 : 15;
        g.fillStyle = `rgba(${shade},${shade},${shade},0.75)`;
        g.fillRect(Math.floor(Math.random()*48)*2, Math.floor(Math.random()*48)*2, 2, 2);
      }
      g.fillStyle = 'rgba(255,0,40,0.22)';
      g.fillRect(0, Math.floor(Math.random()*90), 96, 2);
      g.fillStyle = 'rgba(0,235,255,0.22)';
      g.fillRect(0, Math.floor(Math.random()*90), 96, 2);

      if(isJumpscare){
        const jx = rand(-6,6), jy = rand(-5,5);
        g.fillStyle = '#050507';
        g.fillRect(8+jx, 70+jy, 80, 30);
        g.fillStyle = '#e8e8e8';
        g.fillRect(40+jx, 70+jy, 16, 26);
        g.fillStyle = '#111115';
        g.fillRect(46+jx, 72+jy, 4, 24);

        g.fillStyle = '#dcdcdc';
        g.fillRect(26+jx, 10+jy, 44, 62);
        g.fillStyle = '#f7f7f7';
        g.fillRect(29+jx, 13+jy, 38, 56);
        g.fillStyle = '#bdbdbd';
        g.fillRect(27+jx, 32+jy, 4, 26);
        g.fillRect(65+jx, 32+jy, 4, 26);
        g.fillRect(35+jx, 64+jy, 26, 6);
      }
    }));
  }
  return list;
}

const staticTexturesNormal = buildStaticTextures(4, false);
const staticTexturesJumpscare = buildStaticTextures(4, true);
let staticFrameIdx = 0;
let staticSwapTimer = 0;

const screamMat = new THREE.MeshBasicMaterial({
  map: staticTexturesNormal[0],
  transparent: true,
  opacity: 0,
  depthTest: false,
  fog: false
});
const screamPlane = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 1.55), screamMat);
screamPlane.position.set(0, 0, -0.45);
screamPlane.renderOrder = 999;
camera.add(screamPlane);

function updateScreamerPlane(dt, intensity, isJumpscare){
  staticSwapTimer -= dt;
  if(staticSwapTimer <= 0){
    staticFrameIdx = (staticFrameIdx + 1) & 3;
    screamMat.map = isJumpscare ? staticTexturesJumpscare[staticFrameIdx] : staticTexturesNormal[staticFrameIdx];
    staticSwapTimer = 0.055; // ~18 FPS estilo cinta VHS sin sobrecargar GPU
  }
  screamMat.opacity = isJumpscare ? 0.98 : intensity * 0.65;
}

let lastVhsSecond = -1;
function updateVhsEffect(staticLevel){
  const sanityDistortion = Math.max(0, (65 - sanity) / 65);
  const baseNightmareVhs = isNightmare() ? 0.22 : 0;
  const eventGlitch = Math.min(0.72, ambientGlitchTimer * 0.52);
  const motionScale = gameSettings.reducedMotion ? 0.58 : 1;
  const vhsIntensity = Math.min(1, Math.max(sanityDistortion, staticLevel * 0.85, baseNightmareVhs, eventGlitch) * motionScale);
  vhsOverlay.style.setProperty('--vhs-intensity', vhsIntensity.toFixed(2));
  const glitching = !gameSettings.reducedMotion && (vhsIntensity > 0.48 || screamerTimer > 0 || invertControlsTimer > 0 || ambientGlitchTimer > 0.18);
  vhsOverlay.classList.toggle('glitch', glitching);
  vhsTracking.classList.toggle('hidden', !glitching);
  if(ambientGlitchTimer > 0.2 && vhsTracking) vhsTracking.textContent = 'SEÑAL PERDIDA // TRACKING';
  else if(vhsTracking) vhsTracking.textContent = 'AUTO TRACKING';

  const elapsed = Math.max(0, Math.floor(roundStartTime - timeLeft));
  if(elapsed !== lastVhsSecond){
    lastVhsSecond = elapsed;
    const hh = String(Math.floor(elapsed / 3600)).padStart(2,'0');
    const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2,'0');
    const ss = String(elapsed % 60).padStart(2,'0');
    vhsRecText.textContent = `● PLAY VHS-SP • ${hh}:${mm}:${ss}`;
  }
}

/* ================= HUD Muñeca Izquierda (VR) + HUD Pantalla ================= */
const hudOverlay   = document.getElementById('hud-overlay');
const hudPagesEl   = document.getElementById('hud-pages');
const hudTimeEl    = document.getElementById('hud-time');
const hudZoneEl    = document.getElementById('hud-zone');
const hudBatEl     = document.getElementById('hud-bat');
const hudStamEl    = document.getElementById('hud-stam');
const noiseBoxEl   = document.getElementById('noise-box');
const noiseFillEl  = document.getElementById('noise-fill');
const noiseStatEl  = document.getElementById('noise-status');
const hudSignalEl = document.getElementById('hud-signal');
const hudSignalTextEl = document.getElementById('hud-signal-text');
const hudSignalFillEl = document.getElementById('hud-signal-fill');
const pageSignalPosition = new THREE.Vector3();
const pageSignalForward = new THREE.Vector3();

function getNearestPageSignal(){
  if(!pages.length) return {distance: Infinity, label: 'SIN RASTRO', level: 'none', strength: 0, arrow: '•'};
  const playerPosition = camera.getWorldPosition(pageSignalPosition);
  camera.getWorldDirection(pageSignalForward);
  pageSignalForward.y = 0;
  pageSignalForward.normalize();

  let nearest = Infinity;
  let nearestPage = null;
  for(let i=0; i<pages.length; i++){
    const page = pages[i];
    const distance = Math.hypot(page.m.position.x - playerPosition.x, page.m.position.z - playerPosition.z);
    if(distance < nearest){
      nearest = distance;
      nearestPage = page;
    }
  }

  let arrow = '▲';
  if(nearestPage){
    const dx = nearestPage.m.position.x - playerPosition.x;
    const dz = nearestPage.m.position.z - playerPosition.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len;
    const nz = dz / len;
    const dot = pageSignalForward.x * nx + pageSignalForward.z * nz;
    const cross = pageSignalForward.x * nz - pageSignalForward.z * nx;
    if(dot > 0.72) arrow = '▲';
    else if(dot < -0.72) arrow = '▼';
    else arrow = cross > 0 ? '►' : '◄';
  }

  if(nearest < 5.5) return {distance: nearest, label: `SEÑAL FUERTE ${arrow}`, level: 'strong', strength: 100, arrow};
  if(nearest < 12) return {distance: nearest, label: `SEÑAL MEDIA ${arrow}`, level: 'medium', strength: 68, arrow};
  if(nearest < 23) return {distance: nearest, label: `SEÑAL DÉBIL ${arrow}`, level: 'weak', strength: 34, arrow};
  return {distance: nearest, label: `BUSCANDO... ${arrow}`, level: 'none', strength: 8, arrow};
}

function updatePageSignalUI(){
  if(!hudSignalEl) return;
  const signal = getNearestPageSignal();
  hudSignalEl.classList.remove('signal-weak', 'signal-medium', 'signal-strong');
  if(signal.level !== 'none') hudSignalEl.classList.add(`signal-${signal.level}`);
  if(hudSignalTextEl) hudSignalTextEl.textContent = signal.label;
  if(hudSignalFillEl) hudSignalFillEl.style.width = `${signal.strength}%`;
}

const panelCv = document.createElement('canvas'); panelCv.width = 320; panelCv.height = 192;
const panelTex = new THREE.CanvasTexture(panelCv);
panelTex.magFilter = THREE.NearestFilter;
panelTex.generateMipmaps = false;

function drawPanel(msg){
  hudPagesEl.textContent = `NOTAS: ${pagesFound} / ${TOTAL_PAGES}`;
  hudTimeEl.textContent  = `⏱️ ${formatTime(timeLeft)}`;
  hudZoneEl.textContent  = invertControlsTimer > 0 ? '⚠️ PÁNICO (INVERTIDO)' : `ZONA: ${currentZone}`;
  hudBatEl.textContent   = `🔋 BAT: ${Math.ceil(battery)}%`;
  hudStamEl.textContent  = `⚡ STAM: ${Math.ceil(stamina)}%`;

  hudTimeEl.classList.toggle('low', timeLeft <= 45);
  hudBatEl.classList.toggle('low', battery <= 25);
  hudStamEl.classList.toggle('low', exhausted || stamina <= 25);

  if(!renderer.xr.isPresenting && !msg) return;

  const g = panelCv.getContext('2d');
  g.fillStyle='#030305'; g.fillRect(0,0,320,192);
  g.strokeStyle = (sanity < 40 || isNightmare()) ? '#ff001e' : '#666677';
  g.lineWidth=6; g.strokeRect(4,4,312,184);
  g.textAlign='center';

  if(msg){
    g.fillStyle='#ff001e'; g.font='bold 26px monospace'; g.fillText(msg,160,88);
    g.fillStyle='#ffffff'; g.font='bold 18px monospace'; g.fillText(`NOTAS: ${pagesFound} / ${TOTAL_PAGES}`,160,128);
  } else {
    g.fillStyle='#ffec27'; g.font='bold 18px monospace';
    g.fillText(`NOTAS:${pagesFound}/${TOTAL_PAGES}  ${formatTime(timeLeft)}`,160,30);

    for(let i=0;i<TOTAL_PAGES;i++){
      const x = 60 + i*25;
      g.fillStyle = i < pagesFound ? '#b3001b' : '#191820';
      g.fillRect(x,39,18,11);
      g.strokeStyle = i < pagesFound ? '#ffec27' : '#55515b'; g.lineWidth = 1.5; g.strokeRect(x,39,18,11);
      if(i < pagesFound){ g.fillStyle='#fff'; g.fillRect(x+7,42,4,5); }
    }

    g.fillStyle='#ff001e'; g.font='bold 15px monospace';
    g.fillText(`CORDURA:${Math.max(0,Math.ceil(sanity))}%  BAT:${Math.ceil(battery)}%`,160,64);

    g.fillStyle='#29adff'; g.font='bold 14px monospace';
    g.fillText(`STAM:${Math.ceil(stamina)}% ${isNightmare()?'[PESADILLA]':'[NORMAL]'}`,160,88);

    g.textAlign='left';
    g.fillStyle='#aaaaaa'; g.font='bold 13px monospace';
    g.fillText('RUIDO AMBIENTE (MIC):', 24, 117);

    g.fillStyle='#161620'; g.fillRect(24, 126, 272, 26);
    g.strokeStyle='#555566'; g.lineWidth=3; g.strokeRect(24, 126, 272, 26);

    const thresh = getNoiseThreshold();
    const pct = Math.min(1, micLevel / (thresh * 2.2));
    g.fillStyle = pct > 0.45 ? '#ff001e' : (pct > 0.25 ? '#ffec27' : '#00e436');
    g.fillRect(27, 129, Math.floor(266 * pct), 20);

    const threshX = 27 + Math.floor(266 * 0.45);
    g.fillStyle='#ffffff'; g.fillRect(threshX, 125, 3, 28);

    if(!micReady){
      g.textAlign='center';
      g.fillStyle='#ffec27'; g.font='bold 12px monospace';
      g.fillText('SIN MICROFONO', 160, 141);
    }

    const pageSignal = getNearestPageSignal();
    g.textAlign='center';
    g.fillStyle = pageSignal.level === 'strong' ? '#ff455c' : (pageSignal.level === 'medium' ? '#ff9d43' : (pageSignal.level === 'weak' ? '#ffec27' : '#8c8790'));
    g.font='bold 12px monospace';
    g.fillText(`RASTRO: ${pageSignal.label}`, 160, 178);
  }
  panelTex.needsUpdate = true;
}
const panel = new THREE.Mesh(new THREE.PlaneGeometry(.19,.115), new THREE.MeshBasicMaterial({map:panelTex}));
panel.position.set(0,.075,.02); panel.rotation.x = -Math.PI/3;

/* ================= Micrófono ================= */
async function initMicrophone(){
  if(!gameSettings.microphone || micReady || !navigator.mediaDevices?.getUserMedia) return;
  try{
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1
      }
    });
    micContext = new (window.AudioContext || window.webkitAudioContext)();
    const src = micContext.createMediaStreamSource(micStream);
    const highPass = micContext.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 105;
    highPass.Q.value = 0.7;
    micAnalyser = micContext.createAnalyser();
    micAnalyser.fftSize = 256;
    micAnalyser.smoothingTimeConstant = 0.55;
    micData = new Uint8Array(micAnalyser.fftSize);
    src.connect(highPass).connect(micAnalyser);
    micNoiseFloor = 0.004;
    micCalibrationUntil = performance.now() + 1700;
    micReady = true;
  } catch(err){
    micReady = false;
    noiseStatEl.textContent = 'SIN MIC';
  }
}

function stopMicrophone(){
  micStream?.getTracks().forEach(track=>track.stop());
  micStream = null;
  if(micContext && micContext.state !== 'closed') micContext.close().catch(()=>{});
  micContext = null; micAnalyser = null; micData = null; micReady = false; micLevel = 0;
  noiseFillEl.style.width = '0%';
  noiseStatEl.textContent = 'MICRÓFONO DESACTIVADO';
}

window.addEventListener('pagehide', stopMicrophone);

function updateMicrophone(){
  if(micReady && micAnalyser){
    micAnalyser.getByteTimeDomainData(micData);
    let sum = 0;
    for(let i=0; i<micData.length; i++){
      const v = (micData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / micData.length);
    if(performance.now() < micCalibrationUntil){
      micNoiseFloor = micNoiseFloor * 0.88 + rms * 0.12;
      micLevel *= 0.75;
    } else {
      const gatedRms = Math.max(0, rms - micNoiseFloor - 0.004);
      micLevel = micLevel * 0.68 + gatedRms * 0.32;
    }
  } else {
    micLevel = 0;
  }

  const thresh = getNoiseThreshold();
  const pct = Math.min(100, Math.round((micLevel / (thresh * 2.2)) * 100));
  noiseFillEl.style.width = `${pct}%`;

  noiseBoxEl.classList.remove('warn', 'danger');
  if(!micReady){
    noiseStatEl.textContent = gameSettings.microphone ? 'SIN MIC' : 'MIC APAGADO';
  } else if(performance.now() < micCalibrationUntil){
    noiseStatEl.textContent = 'CALIBRANDO';
  } else if(pct >= 45){
    noiseBoxEl.classList.add('danger');
    noiseStatEl.textContent = '¡TE ESCUCHA!';
  } else if(pct >= 24){
    noiseBoxEl.classList.add('warn');
    noiseStatEl.textContent = 'RUIDO LEVE';
  } else {
    noiseStatEl.textContent = !flashlightOn ? 'OCULTO' : 'SILENCIO';
  }
}

/* ================= Menús, Pantalla Final y Reinicio ================= */
const startMenu  = document.getElementById('start-menu');
const endScreen  = document.getElementById('end-screen');
const firstContactCard = document.getElementById('first-contact-card');
const endPageSlots = [...document.querySelectorAll('.end-page-slot')];
const btnStartPc = document.getElementById('btn-start-pc');
const btnRetry   = document.getElementById('btn-retry');
const diffBtns   = document.querySelectorAll('.diff-btn');
const modeDescEl = document.getElementById('mode-desc');
const cinematicIntro = document.getElementById('cinematic-intro');
const introPlayButton = document.getElementById('btn-intro-play');
const introSkipButton = document.getElementById('btn-intro-skip');
const introReplayButton = document.getElementById('btn-replay-intro');
const introKicker = document.getElementById('intro-kicker');
const introTitle = document.getElementById('intro-title');
const introCopy = document.getElementById('intro-copy');
const introCounter = document.getElementById('intro-counter');
const introProgressFill = document.getElementById('intro-progress-fill');
const introContent = cinematicIntro?.querySelector('.intro-content');
let introSequenceActive = false;
let introTimers = [];

const cinematicScenes = [
  {
    kicker: 'CINTA RECUPERADA · REGISTRO 08',
    title: 'PINE RIDGE',
    copy: 'La última patrulla entró al bosque para investigar una llamada de auxilio. La cámara siguió grabando después de que todos desaparecieron.',
    cue: 'signal'
  },
  {
    kicker: '23:47:12 · TRANSMISIÓN INTERRUMPIDA',
    title: 'OCHO NOTAS',
    copy: 'Ocho hojas fueron encontradas en tres lugares: el cementerio, una cabaña en ruinas y un altar perdido entre los árboles.',
    cue: 'distantFootsteps'
  },
  {
    kicker: 'TESTIMONIO NO VERIFICADO',
    title: 'NO ESTÁS SOLO',
    copy: 'Los testigos describen una figura alta, inmóvil y sin rostro. Si aparece entre los árboles, apaga la linterna. No la mires demasiado tiempo.',
    cue: 'whisperCue'
  },
  {
    kicker: 'PROTOCOLO DE SUPERVIVENCIA',
    title: 'SOBREVIVE',
    copy: 'Recupera las ocho notas. Vigila la batería. Mantén el silencio. Si escuchas pasos detrás de ti, no te detengas.',
    cue: 'thunder'
  }
];

function clearIntroTimers(){
  introTimers.forEach(timer=>clearTimeout(timer));
  introTimers = [];
}

function resetCinematicIntro(){
  clearIntroTimers();
  introSequenceActive = false;
  cinematicIntro?.classList.remove('is-hidden', 'is-closing');
  cinematicIntro?.setAttribute('aria-hidden', 'false');
  introPlayButton.disabled = false;
  introPlayButton.textContent = '▶ REPRODUCIR ARCHIVO';
  introKicker.textContent = 'CINTA RECUPERADA · REGISTRO 08';
  introTitle.textContent = 'PINE RIDGE';
  introCopy.textContent = 'La última transmisión llegó desde el bosque a las 23:47. Después, solo quedó estática.';
  introCounter.textContent = 'ARCHIVO EN ESPERA';
  introProgressFill.style.width = '0%';
  introContent?.classList.remove('is-cut');
}

function playIntroCue(cue){
  if(!cue || typeof sfx !== 'function') return;
  try{ sfx(cue); }catch(error){ console.warn('No se pudo reproducir el sonido de introducción:', error); }
}

function finishCinematicIntro(){
  clearIntroTimers();
  introSequenceActive = false;
  cinematicIntro.classList.add('is-closing');
  cinematicIntro.setAttribute('aria-hidden', 'true');
  const timer = setTimeout(()=>{
    cinematicIntro.classList.add('is-hidden');
    cinematicIntro.classList.remove('is-closing');
    loadRecords();
    startMenu.classList.remove('hidden');
    introPlayButton.disabled = false;
    introPlayButton.textContent = '▶ REPRODUCIR ARCHIVO';
    btnStartPc.focus({preventScroll:true});
  }, 480);
  introTimers.push(timer);
}

function showCinematicScene(index){
  if(!introSequenceActive) return;
  const sceneData = cinematicScenes[index];
  if(!sceneData){ finishCinematicIntro(); return; }

  introContent?.classList.remove('is-cut');
  if(introContent) void introContent.offsetWidth;
  introContent?.classList.add('is-cut');

  introKicker.textContent = sceneData.kicker;
  introTitle.textContent = sceneData.title;
  introCopy.textContent = sceneData.copy;
  introCounter.textContent = `SECUENCIA ${String(index + 1).padStart(2, '0')} / ${String(cinematicScenes.length).padStart(2, '0')}`;
  introProgressFill.style.width = `${((index + 1) / cinematicScenes.length) * 100}%`;
  playIntroCue(sceneData.cue);

  if(index < cinematicScenes.length - 1){
    introTimers.push(setTimeout(()=>showCinematicScene(index + 1), 3600));
  }else{
    introCounter.textContent = 'ARCHIVO LISTO · INICIANDO MENÚ';
    introTimers.push(setTimeout(finishCinematicIntro, 3900));
  }
}

function startCinematicIntro(){
  if(introSequenceActive) return;
  clearIntroTimers();
  introSequenceActive = true;
  introPlayButton.disabled = true;
  introPlayButton.textContent = 'TRANSMISIÓN EN CURSO...';
  try{
    initAudio();
    if(ac?.state === 'suspended') ac.resume().catch(()=>{});
  }catch(error){
    console.warn('El audio de la introducción no está disponible; se continuará en modo silencioso.', error);
  }
  showCinematicScene(0);
}

function skipCinematicIntro(){
  clearIntroTimers();
  introSequenceActive = false;
  cinematicIntro.classList.add('is-hidden');
  cinematicIntro.classList.remove('is-closing');
  cinematicIntro.setAttribute('aria-hidden', 'true');
  loadRecords();
  startMenu.classList.remove('hidden');
  introPlayButton.disabled = false;
  introPlayButton.textContent = '▶ REPRODUCIR ARCHIVO';
  btnStartPc.focus({preventScroll:true});
}

introPlayButton?.addEventListener('click', startCinematicIntro);
introSkipButton?.addEventListener('click', skipCinematicIntro);
introReplayButton?.addEventListener('click', ()=>{
  startMenu.classList.add('hidden');
  resetCinematicIntro();
});
const pauseScreen = document.getElementById('pause-screen');
const pauseOptionButtons = [...document.querySelectorAll('.pause-option')];
const pauseOptionNames = ['CONTINUAR', 'REINICIAR PARTIDA', 'VOLVER AL MENÚ'];
let pauseSelection = 0;

const audioSliderElements = {
  music: document.getElementById('music-volume'),
  ambience: document.getElementById('ambience-volume'),
  effects: document.getElementById('effects-volume')
};
const audioValueElements = {
  music: document.getElementById('music-volume-value'),
  ambience: document.getElementById('ambience-volume-value'),
  effects: document.getElementById('effects-volume-value')
};
const audioMuteButton = document.getElementById('btn-audio-mute');
const audioPreviewButton = document.getElementById('btn-audio-preview');
const audioStatusElement = document.getElementById('audio-status');
const graphicsQualitySelect = document.getElementById('graphics-quality');
const reducedMotionToggle = document.getElementById('reduced-motion');
const microphoneToggle = document.getElementById('microphone-enabled');
const settingsStatusElement = document.getElementById('settings-status');

renderer.domElement.addEventListener('webglcontextlost',(event)=>{
  event.preventDefault();
  if(settingsStatusElement) settingsStatusElement.textContent = 'SE PERDIÓ EL CONTEXTO GRÁFICO. ESPERA A QUE EL NAVEGADOR LO RESTAURE.';
});
renderer.domElement.addEventListener('webglcontextrestored',()=>{
  applyGraphicsQuality();
  if(settingsStatusElement) settingsStatusElement.textContent = 'CONTEXTO GRÁFICO RESTAURADO.';
});

function saveGameSettings(){
  storageSet(GAME_SETTINGS_KEY, JSON.stringify(gameSettings));
}

function applyGraphicsQuality(){
  const preset = QUALITY_PRESETS[gameSettings.quality] || QUALITY_PRESETS.balanced;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.desktopPixelRatio));
  activeParticleCount = preset.particleCount;
  activeRainCount = preset.rainCount;
  pGeo.setDrawRange(0, activeParticleCount);
  rainGeo.setDrawRange(0, activeRainCount);
  pGeo.attributes.position.needsUpdate = true;
  rainGeo.attributes.position.needsUpdate = true;
  if(!renderer.xr.isPresenting) renderer.xr.setFramebufferScaleFactor?.(preset.xrScale);
  resizeRendererToApp();
  if(settingsStatusElement) settingsStatusElement.textContent = `PERFIL ${preset.label} APLICADO · ${activeParticleCount} PARTÍCULAS / ${activeRainCount} GOTAS.`;
}

function renderGameSettings(){
  if(graphicsQualitySelect) graphicsQualitySelect.value = gameSettings.quality;
  if(reducedMotionToggle) reducedMotionToggle.checked = gameSettings.reducedMotion;
  if(microphoneToggle) microphoneToggle.checked = gameSettings.microphone;
  vhsOverlay.classList.toggle('reduced-motion', gameSettings.reducedMotion);
}

graphicsQualitySelect?.addEventListener('change', ()=>{
  gameSettings.quality = graphicsQualitySelect.value;
  applyGraphicsQuality(); saveGameSettings();
});
reducedMotionToggle?.addEventListener('change', ()=>{
  gameSettings.reducedMotion = reducedMotionToggle.checked;
  vhsOverlay.classList.toggle('reduced-motion', gameSettings.reducedMotion);
  saveGameSettings();
  if(settingsStatusElement) settingsStatusElement.textContent = gameSettings.reducedMotion ? 'MOVIMIENTO REDUCIDO ACTIVADO.' : 'EFECTOS VISUALES COMPLETOS ACTIVADOS.';
});
microphoneToggle?.addEventListener('change', async ()=>{
  gameSettings.microphone = microphoneToggle.checked;
  saveGameSettings();
  if(gameSettings.microphone){
    if(playing) await initMicrophone();
    if(settingsStatusElement) settingsStatusElement.textContent = 'DETECCIÓN POR MICRÓFONO ACTIVADA.';
  }else{
    stopMicrophone();
    if(settingsStatusElement) settingsStatusElement.textContent = 'DETECCIÓN POR MICRÓFONO DESACTIVADA.';
  }
});
renderGameSettings();
applyGraphicsQuality();

function saveAudioPrefs(){
  storageSet(AUDIO_PREFS_KEY, JSON.stringify(audioPrefs));
}

function renderAudioPrefs(){
  for(const key of Object.keys(audioSliderElements)){
    const slider = audioSliderElements[key];
    const output = audioValueElements[key];
    if(slider) slider.value = String(audioPrefs[key]);
    if(output) output.value = `${audioPrefs[key]}%`;
  }
  if(audioMuteButton){
    audioMuteButton.textContent = audioPrefs.muted ? 'ACTIVAR TODO' : 'SILENCIAR TODO';
    audioMuteButton.setAttribute('aria-pressed', String(audioPrefs.muted));
  }
}

function applyAudioMix(){
  if(!ac) return;
  const active = audioPrefs.muted ? 0 : 1;
  const now = ac.currentTime;
  if(musicBus) musicBus.gain.setTargetAtTime((audioPrefs.music / 100) * 0.72 * active, now, 0.08);
  if(ambienceBus) ambienceBus.gain.setTargetAtTime((audioPrefs.ambience / 100) * 0.62 * active, now, 0.08);
  if(effectsBus) effectsBus.gain.setTargetAtTime((audioPrefs.effects / 100) * 0.82 * active, now, 0.08);
  if(audioListener.setMasterVolume) audioListener.setMasterVolume((audioPrefs.effects / 100) * active);
}

for(const [key, slider] of Object.entries(audioSliderElements)){
  slider?.addEventListener('input', ()=>{
    audioPrefs[key] = Number(slider.value);
    if(audioValueElements[key]) audioValueElements[key].value = `${audioPrefs[key]}%`;
    saveAudioPrefs();
    applyAudioMix();
    if(audioStatusElement) audioStatusElement.textContent = 'MEZCLA ACTUALIZADA Y GUARDADA EN ESTE DISPOSITIVO';
  });
}
audioMuteButton?.addEventListener('click', ()=>{
  audioPrefs.muted = !audioPrefs.muted;
  renderAudioPrefs();
  saveAudioPrefs();
  applyAudioMix();
  if(audioStatusElement) audioStatusElement.textContent = audioPrefs.muted ? 'AUDIO SILENCIADO' : 'AUDIO ACTIVADO';
});
renderAudioPrefs();

function drawVRFirstContact(){
  const ctx = firstContactCanvas.getContext('2d');
  if(!ctx) return;
  ctx.clearRect(0,0,firstContactCanvas.width,firstContactCanvas.height);
  ctx.fillStyle = 'rgba(5,4,8,.94)'; ctx.fillRect(7,7,746,306);
  ctx.strokeStyle = '#b3001b'; ctx.lineWidth = 9; ctx.strokeRect(7,7,746,306);
  ctx.fillStyle = '#ff6577'; ctx.font = 'bold 22px monospace'; ctx.textAlign = 'center';
  ctx.fillText('REGISTRO VISUAL CONFIRMADO // 23:47', 380, 61);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 43px monospace';
  ctx.fillText('PRIMER CONTACTO', 380, 137);
  ctx.fillStyle = '#ffec27'; ctx.font = 'bold 25px monospace';
  ctx.fillText('NO ES UN ÁRBOL. NO TE QUEDES MIRÁNDOLO.', 380, 203);
  ctx.fillStyle = '#aaa2ad'; ctx.font = '18px monospace';
  ctx.fillText('SEÑAL PERDIDA // PINE RIDGE', 380, 264);
  firstContactTexture.needsUpdate = true;
}

function showFirstEncounter(){
  if(firstEncounterShown) return;
  firstEncounterShown = true;
  firstEncounterTimer = 3.1;
  ambientGlitchTimer = Math.max(ambientGlitchTimer, 1.05);
  flashFailTimer = Math.max(flashFailTimer, 0.28);
  sfx('manifestation');
  ctrls.forEach(controller=>pulse(controller, 0.35, 110));
  if(renderer.xr.isPresenting){
    firstContactCard?.classList.add('hidden');
    firstContact3D.visible = true;
    drawVRFirstContact();
  } else if(firstContactCard){
    firstContactCard.classList.remove('hidden');
    firstContactCard.classList.add('show');
    firstContactCard.setAttribute('aria-hidden','false');
  }
}

function hideFirstEncounter(){
  firstEncounterTimer = 0;
  firstContact3D.visible = false;
  if(firstContactCard){
    firstContactCard.classList.remove('show');
    firstContactCard.classList.add('hidden');
    firstContactCard.setAttribute('aria-hidden','true');
  }
}

function drawVRGameOverPanel(result){
  const ctx = gameOverCanvas.getContext('2d');
  if(!ctx) return;
  const won = result.won;
  ctx.clearRect(0,0,1024,768);
  ctx.fillStyle = 'rgba(5,5,9,.97)'; ctx.fillRect(22,22,980,724);
  ctx.strokeStyle = won ? '#d6b64c' : '#b3001b'; ctx.lineWidth = 16; ctx.strokeRect(22,22,980,724);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = won ? '#ffec27' : '#ff455c'; ctx.font = 'bold 42px monospace';
  ctx.fillText(won ? 'EXPEDIENTE COMPLETADO' : 'SEÑAL PERDIDA', 512, 102);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 52px monospace';
  ctx.fillText(won ? 'SOBREVIVISTE' : 'TE ENCONTRÓ', 512, 190);
  ctx.fillStyle = won ? '#fff3b2' : '#ff6577'; ctx.font = 'bold 30px monospace';
  ctx.fillText(result.rank, 512, 258);
  ctx.fillStyle = '#ffec27'; ctx.font = 'bold 68px monospace';
  ctx.fillText(`${result.score} PTS`, 512, 355);
  ctx.fillStyle = '#d0c9d2'; ctx.font = '27px monospace';
  ctx.fillText(`NOTAS ${pagesFound}/${TOTAL_PAGES}     TIEMPO ${formatTime(result.elapsed)}`, 512, 438);
  ctx.fillText(`BATERÍA ${Math.ceil(battery)}%     CORDURA ${Math.max(0,Math.ceil(sanity))}%`, 512, 489);
  ctx.fillText(`VECES ESCUCHADO ${timesHeard}     DISTANCIA ${Math.round(distanceWalked)} m`, 512, 540);
  ctx.strokeStyle = '#514651'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(130,590); ctx.lineTo(894,590); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.font = 'bold 25px monospace';
  ctx.fillText('A / X  ·  REINTENTAR', 512, 641);
  ctx.fillStyle = '#aaa2ad'; ctx.font = '22px monospace';
  ctx.fillText('B / Y  ·  VOLVER AL MENÚ', 512, 690);
  gameOverTexture.needsUpdate = true;
}

function drawVRPauseMenu(){
  const ctx = pauseMenuCanvas.getContext('2d');
  if(!ctx) return;

  ctx.clearRect(0, 0, pauseMenuCanvas.width, pauseMenuCanvas.height);
  ctx.fillStyle = 'rgba(5, 5, 9, 0.96)';
  ctx.fillRect(28, 28, 968, 712);
  ctx.strokeStyle = '#b3001b';
  ctx.lineWidth = 18;
  ctx.strokeRect(28, 28, 968, 712);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff1e38';
  ctx.font = 'bold 48px monospace';
  ctx.fillText('SEÑAL INTERRUMPIDA • VHS-1994', 512, 115);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 68px monospace';
  ctx.fillText('PARTIDA EN PAUSA', 512, 220);

  pauseOptionNames.forEach((label, index)=>{
    const y = 330 + index * 112;
    const selected = index === pauseSelection;
    ctx.fillStyle = selected ? '#b3001b' : '#17171f';
    ctx.fillRect(170, y - 38, 684, 76);
    ctx.strokeStyle = selected ? '#ffec27' : '#555566';
    ctx.lineWidth = selected ? 7 : 3;
    ctx.strokeRect(170, y - 38, 684, 76);
    ctx.fillStyle = selected ? '#ffffff' : '#b8b8c5';
    ctx.font = selected ? 'bold 38px monospace' : '34px monospace';
    ctx.fillText(`${selected ? '▶  ' : ''}${label}`, 512, y);
  });

  ctx.fillStyle = '#aaaab7';
  ctx.font = '24px monospace';
  ctx.fillText('STICK IZQ.: NAVEGAR     A / X: CONFIRMAR     B / Y: VOLVER', 512, 685);
  pauseMenuTexture.needsUpdate = true;
}

function updatePauseSelection(nextIndex){
  pauseSelection = (nextIndex + pauseOptionNames.length) % pauseOptionNames.length;
  pauseOptionButtons.forEach((button, index)=>{
    button.classList.toggle('active', index === pauseSelection);
  });
  if(renderer.xr.isPresenting) drawVRPauseMenu();
}

function hidePauseUI(){
  pauseScreen.classList.add('hidden');
  pauseMenu3D.visible = false;
}

function openPauseMenu(){
  if(!playing || paused) return;
  paused = true;
  updatePauseSelection(0);
  if(renderer.xr.isPresenting){
    pauseScreen.classList.add('hidden');
    drawVRPauseMenu();
    pauseMenu3D.visible = true;
  } else {
    pauseScreen.classList.remove('hidden');
  }
}

function resumeFromPause(){
  if(!playing || !paused) return;
  paused = false;
  hidePauseUI();
}

function restartFromPause(){
  if(!playing || !paused) return;
  resetGame();
  playing = true;
  paused = false;
  hidePauseUI();
  startMenu.classList.add('hidden');
  endScreen.classList.add('hidden');
  hudOverlay.classList.remove('hidden');
}

function returnToMainMenuFromPause(){
  if(!playing || !paused) return;
  hidePauseUI();
  if(renderer.xr.isPresenting){
    const session = renderer.xr.getSession();
    if(session) session.end();
    return;
  }

  playing = false;
  paused = false;
  stopMicrophone();
  resetGame();
  loadRecords();
  hudOverlay.classList.add('hidden');
  endScreen.classList.add('hidden');
  startMenu.classList.remove('hidden');
}

function activatePauseSelection(){
  if(!paused || !playing) return;
  if(pauseSelection === 0) resumeFromPause();
  else if(pauseSelection === 1) restartFromPause();
  else returnToMainMenuFromPause();
}

function restartFromGameOver(){
  gameOverActive = false;
  gameOverPanel3D.visible = false;
  resetGame();
  playing = true;
  paused = false;
  hidePauseUI();
  startMenu.classList.add('hidden');
  endScreen.classList.add('hidden');
  hudOverlay.classList.remove('hidden');
  initAudio();
}

function exitGameOverToMenu(){
  gameOverActive = false;
  gameOverPanel3D.visible = false;
  const session = renderer.xr.getSession();
  if(session) session.end();
  else {
    resetGame();
    loadRecords();
    startMenu.classList.remove('hidden');
    endScreen.classList.add('hidden');
  }
}

function handleVRGameOverAction(action){
  if(!gameOverActive) return;
  if(action === 'retry') restartFromGameOver();
  else exitGameOverToMenu();
}

function togglePause(){
  if(!playing) return;
  if(paused) resumeFromPause();
  else openPauseMenu();
}

pauseOptionButtons.forEach(button=>{
  button.addEventListener('mouseenter', ()=>{
    updatePauseSelection(pauseOptionButtons.indexOf(button));
  });
  button.addEventListener('click', ()=>{
    updatePauseSelection(pauseOptionButtons.indexOf(button));
    activatePauseSelection();
  });
});

diffBtns.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    diffBtns.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    diffMultiplier = parseFloat(btn.dataset.diff);
    if(isNightmare()){
      modeDescEl.innerHTML = '💀 <strong>MODO PESADILLA:</strong> Solo <strong>3:00 min</strong>, niebla densa, menos pilas, micrófono ultrasensible (48m), alucinaciones constantes y pánico al ser asustado.';
    } else {
      modeDescEl.innerHTML = 'Sigue los senderos de piedra hacia el Cementerio, la Cabaña y el Altar. Recoge pilas, administra tu resistencia y si Slenderman aparece: <strong>APAGA LA LINTERNA Y MANTÉN EL MEDIDOR DE RUIDO EN VERDE</strong>.';
    }
  });
});

function startGameFromMenu(){
  initAudio();
  initMicrophone();
  gameOverActive = false;
  gameOverPanel3D.visible = false;
  resetGame();
  playing = true;
  hidePauseUI();
  startMenu.classList.add('hidden');
  endScreen.classList.add('hidden');
  hudOverlay.classList.remove('hidden');
}

btnStartPc.addEventListener('click', startGameFromMenu);
audioPreviewButton?.addEventListener('click', async ()=>{
  initAudio();
  if(ac?.state === 'suspended') await ac.resume();
  musicTone(146.83, 1.05, 'triangle', 0.075, -0.15);
  musicTone(174.61, 1.25, 'sine', 0.045, 0.12, 0.32);
  musicTone(155.56, 1.4, 'triangle', 0.055, 0, 0.78);
  musicTone(73.42, 1.8, 'sine', 0.025, 0, 0.12);
  tone(392, 0.5, 'sine', 0.035, 0.72, 0.85, 0.35);
  if(audioStatusElement) audioStatusElement.textContent = 'PRUEBA: TONOS AMBIENTALES SUAVES Y MOTIVO ORIGINAL';
});
document.getElementById('btn-end-restart')?.addEventListener('click', ()=>{
  gameOverActive = false;
  gameOverPanel3D.visible = false;
  startGameFromMenu();
});
btnRetry.addEventListener('click', ()=>{
  gameOverActive = false;
  gameOverPanel3D.visible = false;
  resetGame();
  loadRecords();
  hidePauseUI();
  endScreen.classList.add('hidden');
  hudOverlay.classList.add('hidden');
  startMenu.classList.remove('hidden');
});

function getExpeditionRank(won){
  if(won && isNightmare()) return 'LEYENDA DE PINE RIDGE';
  if(won) return 'ARCHIVISTA · SUPERVIVIENTE';
  if(pagesFound >= 6) return 'ÚLTIMO TESTIGO';
  if(pagesFound >= 3) return 'EXPLORADOR PERDIDO';
  return 'SEÑAL DESAPARECIDA';
}

function calculateExpeditionScore(won, elapsed){
  const pagePoints = pagesFound * 120;
  const escapeBonus = won ? 320 : 0;
  const nightmareBonus = (won && isNightmare()) ? 180 : 0;
  const timeBonus = won
    ? Math.max(0, Math.round(timeLeft * 1.8))
    : Math.min(90, Math.round(elapsed * 0.3));
  const sanityBonus = won ? Math.max(0, Math.round(sanity * 1.25)) : 0;
  const batteryBonus = won ? Math.max(0, Math.round(battery * 0.35)) : 0;
  const noisePenalty = timesHeard * 22;
  const travelBonus = Math.round(distanceWalked * 0.18);
  return Math.max(0, Math.round(pagePoints + escapeBonus + nightmareBonus + timeBonus + sanityBonus + batteryBonus + travelBonus - noisePenalty));
}

function finishGame(won, reasonText){
  if(gameOverActive || (!playing && !renderer.xr.isPresenting)) return;
  gameOverActive = true;
  paused = true;
  playing = false;
  hidePauseUI();
  hideFirstEncounter();
  vrPromptSprite.visible = false;
  hudOverlay.classList.add('hidden');
  pageViewerEl.classList.add('hidden');
  vrPageNotice.visible = false;

  const elapsed = Math.max(0, roundStartTime - timeLeft);
  const rank = getExpeditionRank(won);
  const score = calculateExpeditionScore(won, elapsed);
  const modeKey = isNightmare() ? 'nightmare' : 'normal';
  let bestScore = score;
  const result = {won, reasonText, elapsed, rank, score, modeKey};

  document.getElementById('end-tag').textContent = won ? '🏆 EXPEDIENTE COMPLETADO' : '💀 EXPEDIENTE INTERRUMPIDO';
  document.getElementById('end-title').textContent = won ? 'SALISTE DEL BOSQUE' : reasonText;
  document.getElementById('end-subtitle').textContent = won
    ? 'La cámara recuperó la señal. Las ocho notas quedaron registradas.'
    : 'La transmisión terminó antes de completar el archivo. El bosque no dejó testigos.';
  document.getElementById('end-case-code').textContent = `PINE RIDGE // ${new Date().toLocaleDateString('es-MX')} // ARCHIVO 08`;
  document.getElementById('end-rank').textContent = rank;
  document.getElementById('end-score').textContent = String(score).padStart(4,'0');
  document.getElementById('end-difficulty').textContent = isNightmare() ? 'DIFICULTAD: PESADILLA' : 'DIFICULTAD: NORMAL';
  document.getElementById('end-archive-count').textContent = `${pagesFound} / ${TOTAL_PAGES} RECUPERADAS`;
  document.getElementById('st-pages').textContent = `${pagesFound} / ${TOTAL_PAGES}`;
  document.getElementById('st-time').textContent = formatTime(elapsed);
  document.getElementById('st-heard').textContent = `${timesHeard}`;
  document.getElementById('st-dist').textContent = `${Math.round(distanceWalked)} m`;
  document.getElementById('st-battery').textContent = `${Math.ceil(battery)}%`;
  document.getElementById('st-sanity').textContent = `${Math.max(0,Math.ceil(sanity))}%`;
  endPageSlots.forEach((slot,index)=>slot.classList.toggle('found', index < pagesFound));

  const recMsgEl = document.getElementById('end-record-msg');
  const messages = [];

  const scoreStorageKey = `slender_best_score_${modeKey}`;
  const previousBestScore = Number(storageGet(scoreStorageKey) || 0);
  if(score > previousBestScore){
    storageSet(scoreStorageKey, score);
    bestScore = score;
    messages.push('★ NUEVO RÉCORD DE PUNTUACIÓN GUARDADO ★');
  }else{
    bestScore = previousBestScore;
  }

  if(won){
    const timeKey = `slender_rec_${modeKey}`;
    const rawPreviousTime = storageGet(timeKey);
    const previousTime = rawPreviousTime !== null ? parseFloat(rawPreviousTime) : 0;
    if(!previousTime || elapsed < previousTime){
      storageSet(timeKey, elapsed.toFixed(2));
      messages.push('★ NUEVO RÉCORD DE TIEMPO GUARDADO ★');
    }
  }
  loadRecords();

  document.getElementById('end-best-score').textContent = String(bestScore).padStart(4,'0');
  recMsgEl.textContent = messages.join('  ·  ') || (won ? 'ARCHIVO COMPLETADO. LA GRABACIÓN SE CONSERVÓ.' : 'EL EXPEDIENTE QUEDÓ INCOMPLETO. PUEDES INTENTARLO DE NUEVO.');
  stopMicrophone();

  endScreen.dataset.result = won ? 'victory' : 'defeat';
  if(renderer.xr.isPresenting){
    drawVRGameOverPanel(result);
    gameOverPanel3D.visible = true;
    endScreen.classList.add('hidden');
  }else{
    gameOverPanel3D.visible = false;
    endScreen.classList.remove('hidden');
  }
}

function resetGame(){
  const nightmare = isNightmare();
  roundStartTime = nightmare ? 180 : 300;
  pagesFound = 0; timeLeft = roundStartTime; sanity = 100;
  battery = 100; stamina = 100; exhausted = false; flashlightOn = true;
  timesHeard = 0; heardCooldown = 0; distanceWalked = 0;
  paused = false; gameOverActive = false; screamerTimer = 0; nextTpTimer = rand(5.5,9.5) / diffMultiplier;
  firstEncounterShown = false; firstEncounterTimer = 0;
  gameOverPanel3D.visible = false;
  vrPromptSprite.visible = false;
  hideFirstEncounter();
  flashFailTimer = 0; stealthTimer = 0; invertControlsTimer = 0; breathTimer = 0;
  forestEventTimer = rand(15,22) / diffMultiplier; ambientGlitchTimer = 0; ambientApparitionTimer = 0;
  lastVhsSecond = -1;
  resetPageCollectionUI();

  scene.fog.density = nightmare ? 0.072 : baseFogDensity;
  flashlight.distance = nightmare ? 24 : 36;
  paintSky(nightmare);
  resetParticles(nightmare);
  clearFootprints();
  updateVhsEffect(0);
  phantomSlender.visible = false;
  screamMat.opacity = 0;
  spawnPages();
  spawnBatteries();
  updatePageSignalUI();
  slender.position.set(0,0, nightmare ? -18 : -26);
  dolly.position.set(0,0,6);
  drawPanel();
}
resetGame();

/* ================= Audio Terror, Música por Capas y Audio Espacial 3D ================= */
let ac, master, musicBus, ambienceBus, effectsBus, noiseBuffer, slenderPosAudio, whisperPosAudio, flashBuzzGain;

function initAudio(){
  if(ac){
    if(ac.state === 'suspended') ac.resume();
    applyAudioMix();
    return;
  }
  ac = new (window.AudioContext||window.webkitAudioContext)();
  master = ac.createGain();
  master.gain.value = 0.9;
  master.connect(ac.destination);
  musicBus = ac.createGain();
  ambienceBus = ac.createGain();
  effectsBus = ac.createGain();
  musicBus.connect(master);
  ambienceBus.connect(master);
  effectsBus.connect(master);
  applyAudioMix();

  const bufSize = ac.sampleRate * 2;
  noiseBuffer = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  let filteredNoise = 0;
  for(let i=0;i<bufSize;i++){
    const white = Math.random()*2 - 1;
    filteredNoise = filteredNoise * 0.965 + white * 0.035;
    data[i] = filteredNoise * 1.65;
  }

  slenderPosAudio = new THREE.PositionalAudio(audioListener);
  const posOsc = audioListener.context.createOscillator();
  const posGain = audioListener.context.createGain();
  posOsc.type = 'sawtooth';
  posOsc.frequency.value = 52;
  posGain.gain.value = 0.25;
  posOsc.connect(posGain);
  slenderPosAudio.setNodeSource(posOsc);
  slenderPosAudio.setRefDistance(3);
  slenderPosAudio.setMaxDistance(28);
  slenderPosAudio.setRolloffFactor(1.6);
  slender.add(slenderPosAudio);
  posOsc.start();

  whisperPosAudio = new THREE.PositionalAudio(audioListener);
  const whispOscA = audioListener.context.createOscillator();
  const whispOscB = audioListener.context.createOscillator();
  const whispFilter = audioListener.context.createBiquadFilter();
  whispFilter.type = 'lowpass'; whispFilter.frequency.value = 520; whispFilter.Q.value = 0.8;
  const whispGain = audioListener.context.createGain();
  whispOscA.type = 'sine'; whispOscA.frequency.value = 116.5;
  whispOscB.type = 'triangle'; whispOscB.frequency.value = 121.0;
  whispGain.gain.value = 0.0;
  whispOscA.connect(whispFilter); whispOscB.connect(whispFilter); whispFilter.connect(whispGain);
  whisperPosAudio.setNodeSource(whispGain);
  whisperPosAudio.setRefDistance(1.2); whisperPosAudio.setMaxDistance(12); whisperPosAudio.setRolloffFactor(1.8);
  whisperPosAudio.position.set(0, 0, 0.75);
  camera.add(whisperPosAudio);
  whispOscA.start(); whispOscB.start();

  setInterval(()=>{
    if(!ac || ac.state !== 'running') return;
    if(!playing || paused){ whispGain.gain.value = 0; return; }
    camera.getWorldPosition(head);
    const dist = head.distanceTo(slender.position);
    const danger = Math.max(0, (14 - dist) / 14, (50 - sanity) / 50);
    whispGain.gain.setTargetAtTime(danger * 0.035, ac.currentTime, 0.22);
    whispOscA.frequency.setTargetAtTime(112 + Math.random() * 9, ac.currentTime, 0.3);
    whispOscB.frequency.setTargetAtTime(118 + Math.random() * 8, ac.currentTime, 0.3);
  }, 240);

  const radioPosAudio = new THREE.PositionalAudio(audioListener);
  const radOscA = audioListener.context.createOscillator();
  const radOscB = audioListener.context.createOscillator();
  const radFilter = audioListener.context.createBiquadFilter();
  radFilter.type = 'lowpass'; radFilter.frequency.value = 460; radFilter.Q.value = 1.2;
  const radGain = audioListener.context.createGain();
  radOscA.type = 'triangle'; radOscA.frequency.value = 92;
  radOscB.type = 'sine'; radOscB.frequency.value = 137.5;
  radGain.gain.value = 0.018;
  radOscA.connect(radFilter); radOscB.connect(radFilter); radFilter.connect(radGain);
  radioPosAudio.setNodeSource(radGain);
  radioPosAudio.setRefDistance(2.5);
  radioPosAudio.setMaxDistance(13);
  oldRadio.add(radioPosAudio);
  radOscA.start(); radOscB.start();

  const altarPosAudio = new THREE.PositionalAudio(audioListener);
  const altOsc = audioListener.context.createOscillator();
  const altGain = audioListener.context.createGain();
  altOsc.type = 'triangle';
  altOsc.frequency.value = 65.4;
  altGain.gain.value = 0.28;
  altOsc.connect(altGain);
  altarPosAudio.setNodeSource(altGain);
  altarPosAudio.setRefDistance(3);
  altarPosAudio.setMaxDistance(26);
  altarOrb.add(altarPosAudio);
  altOsc.start();

  const flashOsc = ac.createOscillator();
  flashBuzzGain = ac.createGain();
  flashOsc.type = 'sine';
  flashOsc.frequency.value = 60;
  flashBuzzGain.gain.value = 0.015;
  flashOsc.connect(flashBuzzGain).connect(effectsBus);
  flashOsc.start();

  const droneOsc = ac.createOscillator();
  const droneHarmonic = ac.createOscillator();
  const droneGain = ac.createGain();
  droneOsc.type = 'sine'; droneOsc.frequency.value = 41.2;
  droneHarmonic.type = 'triangle'; droneHarmonic.frequency.value = 61.7;
  const lpf = ac.createBiquadFilter();
  lpf.type = 'lowpass'; lpf.frequency.value = 180;
  droneGain.gain.value = 0.052;
  droneOsc.connect(lpf); droneHarmonic.connect(lpf); lpf.connect(droneGain).connect(ambienceBus);
  droneOsc.start(); droneHarmonic.start();

  const windOscA = ac.createOscillator();
  const windOscB = ac.createOscillator();
  const windGain = ac.createGain();
  const windFilter = ac.createBiquadFilter();
  const windLfo = ac.createOscillator();
  const windLfoGain = ac.createGain();
  windOscA.type = 'triangle'; windOscA.frequency.value = 53;
  windOscB.type = 'sine'; windOscB.frequency.value = 56.5;
  windFilter.type = 'lowpass'; windFilter.frequency.value = 210;
  windGain.gain.value = 0.018;
  windLfo.type = 'sine'; windLfo.frequency.value = 0.12;
  windLfoGain.gain.value = 0.006;
  windLfo.connect(windLfoGain).connect(windGain.gain);
  windOscA.connect(windFilter); windOscB.connect(windFilter); windFilter.connect(windGain).connect(ambienceBus);
  windOscA.start(); windOscB.start(); windLfo.start();

  setInterval(()=>{
    if(ac.state !== 'running' || !playing || paused) return;
    const r = Math.random();

    if(currentZone === 'CEMENTERIO' && r < 0.45){
      const pan = rand(-0.6, 0.6);
      tone(110, 1.8, 'sine', 0.14, 0.96, 0, pan);
      tone(220, 1.2, 'triangle', 0.05, 0.95, 0.05, pan);
      tone(185, 0.32, 'triangle', 0.035, 0.72, 0.12, -pan);
    } else if(r < 0.32){
      const pan = rand(-0.85, 0.85);
      for(let k=0; k<3; k++) tone(2650, 0.03, 'square', 0.025, 0, k*0.07, pan);
    } else if(r < 0.62){
      const pan = Math.random() < 0.5 ? -0.88 : 0.88;
      tone(118, 0.13, 'triangle', 0.055, 0.55, 0, pan);
      tone(82, 0.18, 'sine', 0.042, 0.7, 0.08, pan);
    } else if(r < 0.82){
      const pan = rand(-0.75, 0.75);
      tone(340, 0.25, 'sine', 0.045, 0.92, 0, pan);
      tone(285, 0.55, 'sine', 0.045, 0.88, 0.35, pan);
    } else if(sanity < 75 || isNightmare()){
      const pan = rand(-0.9, 0.9);
      tone(180, 0.22, 'sawtooth', 0.05, 1.3, 0, pan);
      tone(220, 0.28, 'sawtooth', 0.05, 0.7, 0.28, -pan);
    }
  }, 2400);

  const openingTheme = [146.83, 0, 174.61, 155.56, 0, 130.81, 116.54, 0, 146.83, 0, 196.0, 174.61, 0, 116.54, 130.81, 0];
  const lowTheme = [73.42, 0, 65.41, 0, 58.27, 0, 69.30, 0];
  const musicBox = [659.2, 698.5, 466.2, 440.0, 0, 523.3, 493.9, 329.6, 311.1, 0, 220.0, 233.1];
  const deepHits = [55.0, 0, 51.9, 0, 49.0, 0, 46.2, 43.6];
  let step = 0;

  function playHorrorMusic(){
    if(ac.state === 'running' && playing && !paused){
      camera.getWorldPosition(head);
      const distanceToSlender = head.distanceTo(slender.position);
      const tension = Math.max(0, (18 - distanceToSlender) / 18, pagesFound / TOTAL_PAGES, isNightmare() ? 0.55 : 0);

      const themeNote = openingTheme[step % openingTheme.length];
      if(themeNote > 0){
        musicTone(themeNote, 0.82, 'triangle', 0.035 + tension * 0.018, (step % 2 ? 0.12 : -0.12));
        if(step % 4 === 0) musicTone(lowTheme[(step / 2) % lowTheme.length] || 65.41, 1.25, 'sine', 0.024 + tension * 0.012, 0);
      }

      if(pagesFound >= 2 || isNightmare()){
        const d = deepHits[step % deepHits.length];
        if(d > 0) musicTone(d, 0.65, 'sawtooth', 0.055 + pagesFound*0.008 + tension*0.025, 0);
      }

      if(pagesFound >= 4 || isNightmare()){
        const n = musicBox[step % musicBox.length];
        if(n > 0){
          const detune = (Math.random() - 0.5) * (10 + pagesFound*2 + (isNightmare()?14:0));
          musicTone(n + detune, 0.55, 'sine', 0.035 + tension*0.012, 0);
          musicTone((n + detune)*2, 0.25, 'triangle', 0.012 + tension*0.005, 0.1);
        }
      }

      if(pagesFound >= 6 && step % 2 === 0){
        musicTone(880 + (step%3)*62, 0.14, 'sawtooth', 0.024 + tension*0.012, 0);
      }

      camera.getWorldPosition(head);
      camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
      for(let i=0; i<pages.length; i++){
        const p = pages[i];
        const pDist = Math.hypot(p.m.position.x - head.x, p.m.position.z - head.z);
        if(pDist < 5.0 && step % 3 === 0){
          const dx = (p.m.position.x - head.x) / (pDist || 1);
          const dz = (p.m.position.z - head.z) / (pDist || 1);
          const pan = fwd.x * dz - fwd.z * dx;
          tone(1320, 0.04, 'sine', 0.03, 0, 0, pan);
          break;
        }
      }

      const dist = head.distanceTo(slender.position);
      if((dist < 14 || pagesFound >= 4 || isNightmare()) && step % 2 === 0){
        const vol = Math.min(0.32, (15 - dist) * 0.022 + pagesFound * 0.014 + (isNightmare()?0.04:0));
        tone(58, 0.11, 'sine', vol, 0.45, 0);
        tone(48, 0.14, 'sine', vol * 0.85, 0.45, 0.15);
      }
      step++;
    }
    const tempo = Math.max(190, (520 - pagesFound * 36) / diffMultiplier);
    setTimeout(playHorrorMusic, tempo);
  }
  playHorrorMusic();
}

function pannedNoise(dur, freq, vol, panVal=0, when=0){
  if(!ac || !noiseBuffer) return;
  const now = ac.currentTime + when;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer;
  const flt = ac.createBiquadFilter();
  flt.type = 'bandpass'; flt.frequency.value = Math.min(1500, freq); flt.Q.value = 1.1;
  const pan = ac.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, panVal));
  const g = ac.createGain();
  g.gain.setValueAtTime(vol * 0.48, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  src.connect(flt).connect(pan).connect(g).connect(effectsBus);
  src.start(now); src.stop(now + dur);
}

function tone(f,d,type='square',v=.2,slide=0,when=0,panVal=0){
  if(!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), pan = ac.createStereoPanner(), t = ac.currentTime+when;
  o.type = type; o.frequency.setValueAtTime(f,t);
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,f*slide),t+d);
  pan.pan.setValueAtTime(Math.max(-1, Math.min(1, panVal)), t);
  g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(g).connect(pan).connect(effectsBus); o.start(t); o.stop(t+d);
}

function musicTone(frequency, duration, type='sine', volume=0.04, panValue=0, when=0){
  if(!ac || !musicBus) return;
  const now = ac.currentTime + when;
  const oscillator = ac.createOscillator();
  const filter = ac.createBiquadFilter();
  const gain = ac.createGain();
  const panner = ac.createStereoPanner();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(Math.max(20, frequency), now);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(type === 'triangle' ? 1150 : 1850, now);
  filter.Q.value = 0.7;
  panner.pan.setValueAtTime(Math.max(-1, Math.min(1, panValue)), now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(Math.max(0.0002, volume), now + Math.min(0.12, duration * 0.22));
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(filter).connect(gain).connect(panner).connect(musicBus);
  oscillator.start(now);
  oscillator.stop(now + duration + 0.03);
}

function playOriginalSlenderScreamerSound(){
  if(!ac || !noiseBuffer) return;
  const now = ac.currentTime;

  const staticSrc = ac.createBufferSource();
  staticSrc.buffer = noiseBuffer;
  const staticFilter = ac.createBiquadFilter();
  staticFilter.type = 'lowpass';
  staticFilter.frequency.setValueAtTime(1250, now);
  staticFilter.Q.value = 0.65;

  const staticGain = ac.createGain();
  staticGain.gain.setValueAtTime(0.16, now);
  staticGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);

  staticSrc.connect(staticFilter).connect(staticGain).connect(effectsBus);
  staticSrc.start(now);
  staticSrc.stop(now + 0.95);

  [55.0, 58.27, 82.41, 116.54, 233.08].forEach(freq=>{
    tone(freq, 0.72, 'sawtooth', 0.15, 0.78, 0);
  });
}

function sfx(n){
  if(n==='step'){
    if(currentZone === 'CABAÑA EN RUINAS'){
      tone(135, 0.08, 'sawtooth', 0.045, 0.75, 0);
      pannedNoise(0.05, 420, 0.045, 0);
    } else {
      pannedNoise(0.055, 680 + rand(-120, 120), 0.05, 0);
    }
  }
  if(n==='breath'){
    tone(92, 0.30, 'triangle', 0.052, 0.62, 0);
    tone(68, 0.38, 'sine', 0.045, 0.78, 0.27);
  }
  if(n==='spark'){
    pannedNoise(0.06, 3200, 0.09, 0.25);
  }
  if(n==='bats'){
    for(let i=0; i<5; i++) pannedNoise(0.06, 1200, 0.08, rand(-0.7, 0.7), i*0.07);
  }
  if(n==='page'){
    tone(75, 0.55, 'sawtooth', 0.42, 0.25, 0);
    tone(48, 0.75, 'square', 0.36, 0.35, 0.04);
  }
  if(n==='battery'){
    tone(520, 0.08, 'square', 0.2);
    tone(780, 0.12, 'square', 0.2, 0, 0.08);
  }
  if(n==='screamer') playOriginalSlenderScreamerSound();
  if(n==='vanish')   tone(260, 0.5, 'sine', 0.14, 0.3, 0);
  if(n==='manifestation'){
    tone(48, 0.85, 'sine', 0.19, 0.58, 0);
    tone(196, 0.42, 'triangle', 0.075, 0.62, 0.12);
  }
  if(n==='whisperCue'){
    const pan = Math.random() < 0.5 ? -0.8 : 0.8;
    tone(310, 0.52, 'sine', 0.035, 0.82, 0, pan);
    tone(233, 0.68, 'triangle', 0.028, 0.76, 0.22, -pan);
  }
  if(n==='signal'){
    tone(980, 0.08, 'square', 0.065, 0.55, 0);
    tone(420, 0.24, 'sine', 0.07, 0.65, 0.08);
  }
  if(n==='distantFootsteps'){
    const pan = Math.random() < 0.5 ? -0.85 : 0.85;
    tone(76, 0.16, 'triangle', 0.055, 0.7, 0, pan);
    tone(92, 0.16, 'triangle', 0.047, 0.68, 0.42, pan * 0.8);
    tone(68, 0.18, 'sine', 0.04, 0.72, 0.86, pan * 0.6);
  }
  if(n==='thunder'){
    tone(85, 0.9, 'sawtooth', 0.25, 0.25, 0.15);
    tone(50, 1.2, 'triangle', 0.3, 0.3, 0.2);
  }
  if(n==='click'){
    tone(950, 0.04, 'square', 0.18);
    tone(620, 0.04, 'square', 0.15, 0, 0.04);
  }
  if(n==='win')  [220,261.6,329.6,440].forEach((f,i)=>tone(f,.3,'triangle',.2,0,i*.18));
  if(n==='lose') playOriginalSlenderScreamerSound();
}

renderer.xr.addEventListener('sessionstart',()=>{
  initAudio(); initMicrophone(); gameOverActive = false; gameOverPanel3D.visible = false; resetGame(); playing = true;
  hidePauseUI();
  startMenu.classList.add('hidden');
  endScreen.classList.add('hidden');
  hudOverlay.classList.remove('hidden');
});
renderer.xr.addEventListener('sessionend',()=>{
  stopMicrophone();
  playing = false;
  paused = false;
  gameOverActive = false;
  gameOverPanel3D.visible = false;
  vrPromptSprite.visible = false;
  hideFirstEncounter();
  endScreen.classList.add('hidden');
  hidePauseUI();
  vrSprintPressed = false;
  resetGame();
  loadRecords();
  startMenu.classList.remove('hidden');
  hudOverlay.classList.add('hidden');
  resizeRendererToApp();
});

/* ================= Controles WebXR para Meta Quest 3S ================= */
const tmp = new THREE.Vector3(), head = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
const moveStep = new THREE.Vector3();
const toSlenderVector = new THREE.Vector3();
const phantomDirection = new THREE.Vector3();
const _itemDir = new THREE.Vector3();
const UP = new THREE.Vector3(0,1,0);
const ctrls = [];
let vrSprintPressed = false;
let snapLock = false;
let pauseNavLock = false;

const XR_BUTTON_INDEX = {
  thumbstick: 3,
  faceConfirm: 4,
  faceBack: 5,
  leftMenu: 7
};

function pulse(c,i,ms){
  const actuator = c.userData.src?.gamepad?.hapticActuators?.[0];
  if(actuator?.pulse) actuator.pulse(i,ms);
}

function gamepadButtonPressed(gamepad, index){
  const button = gamepad?.buttons?.[index];
  return Boolean(button && (button.pressed || (button.value ?? 0) > 0.75));
}

function toggleFlashlight(){
  if(!playing || paused || battery <= 1) return;
  flashlightOn = !flashlightOn;
  sfx('click');
  drawPanel();
  ctrls.forEach(c=>pulse(c,.4,40));
}

for(let i=0;i<2;i++){
  const c = renderer.xr.getController(i);
  const vis = new THREE.Mesh(new THREE.BoxGeometry(.035,.035,.16), new THREE.MeshBasicMaterial({color:0x222228}));
  c.add(vis); dolly.add(c);
  c.userData = {
    src: null,
    hand: 'unknown',
    interactPressed: false,
    grabPressed: false,
    faceConfirmPressed: false,
    previousButtons: {confirm:false, back:false, menu:false, thumbstick:false}
  };

  c.addEventListener('connected',e=>{
    c.userData.src = e.data;
    c.userData.hand = e.data.handedness;
    if(e.data.handedness==='left'){
      c.add(panel);
    } else if(e.data.handedness==='right'){
      flashRig.position.set(0,0,0);
      c.add(flashRig);
    }
  });

  c.addEventListener('disconnected',()=>{
    if(c.userData.hand === 'left') vrSprintPressed = false;
    c.userData.src = null;
    c.userData.interactPressed = false;
    c.userData.grabPressed = false;
    c.userData.faceConfirmPressed = false;
    c.userData.hand = 'unknown';
  });

  c.addEventListener('selectstart',()=>{
    if(!playing || paused) return;
    initAudio();
    if(c.userData.hand === 'left'){
      vrSprintPressed = true;
    } else if(c.userData.hand === 'right'){
      c.userData.interactPressed = true;
      pulse(c,.35,35);
    }
  });
  c.addEventListener('selectend',()=>{
    if(c.userData.hand === 'left') vrSprintPressed = false;
    if(c.userData.hand === 'right') c.userData.interactPressed = false;
  });

  c.addEventListener('squeezestart',()=>{
    c.userData.grabPressed = true;
    pulse(c,.25,30);
  });
  c.addEventListener('squeezeend',()=>{ c.userData.grabPressed = false; });

  ctrls.push(c);
}

function updateControllerButtons(){
  for(const c of ctrls){
    const gamepad = c.userData.src?.gamepad;
    if(!gamepad) continue;

    const confirm = gamepadButtonPressed(gamepad, XR_BUTTON_INDEX.faceConfirm);
    const back = gamepadButtonPressed(gamepad, XR_BUTTON_INDEX.faceBack);
    const thumbstick = gamepadButtonPressed(gamepad, XR_BUTTON_INDEX.thumbstick);
    const menu = c.userData.hand === 'left' && gamepadButtonPressed(gamepad, XR_BUTTON_INDEX.leftMenu);
    const previous = c.userData.previousButtons;

    if(gameOverActive){
      if(confirm && !previous.confirm) handleVRGameOverAction('retry');
      else if(back && !previous.back) handleVRGameOverAction('menu');
      previous.confirm = confirm;
      previous.back = back;
      previous.menu = menu;
      previous.thumbstick = thumbstick;
      continue;
    }

    c.userData.faceConfirmPressed = confirm && !paused;

    if(menu && !previous.menu && playing){
      togglePause();
    }
    if(back && !previous.back){
      if(paused) resumeFromPause();
      else if(playing) pageViewerEl.classList.add('hidden');
    }
    if(confirm && !previous.confirm && paused){
      activatePauseSelection();
    }
    if(thumbstick && !previous.thumbstick && c.userData.hand === 'right'){
      toggleFlashlight();
    }

    if(paused && c.userData.hand === 'left'){
      const navY = gamepad.axes[3] ?? gamepad.axes[1] ?? 0;
      if(Math.abs(navY) > 0.7 && !pauseNavLock){
        updatePauseSelection(pauseSelection + (navY > 0 ? 1 : -1));
        pauseNavLock = true;
      } else if(Math.abs(navY) < 0.25){
        pauseNavLock = false;
      }
    }

    previous.confirm = confirm;
    previous.back = back;
    previous.menu = menu;
    previous.thumbstick = thumbstick;
  }
}

function snapTurn(a){
  camera.getWorldPosition(head); const px = head.x, pz = head.z;
  dolly.rotation.y += a; camera.getWorldPosition(head);
  dolly.position.x += px-head.x; dolly.position.z += pz-head.z;
}

const keys = {};
addEventListener('keydown',e=>{
  const k = e.key.toLowerCase();
  if(['arrowleft','arrowright','arrowup','arrowdown'].includes(k)) e.preventDefault();

  if(k === 'escape'){
    e.preventDefault();
    togglePause();
    return;
  }
  if(paused && (k === 'arrowup' || k === 'arrowdown')){
    e.preventDefault();
    updatePauseSelection(pauseSelection + (k === 'arrowdown' ? 1 : -1));
    return;
  }
  if(paused && k === 'enter'){
    e.preventDefault();
    activatePauseSelection();
    return;
  }
  if(k === 'backspace'){
    e.preventDefault();
    if(paused) resumeFromPause();
    else if(playing) pageViewerEl.classList.add('hidden');
    return;
  }

  keys[k] = true;
  if(!playing || paused) return;
  initAudio();
  if(k === 'f') toggleFlashlight();
});
addEventListener('keyup',e=>keys[e.key.toLowerCase()] = false);

function clearDesktopInputs(){
  for(const key of Object.keys(keys)) keys[key] = false;
}
window.addEventListener('blur', clearDesktopInputs);
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    clearDesktopInputs();
    if(playing && !paused && !renderer.xr.isPresenting) togglePause();
  }
});

function move(dt){
  if(!playing || paused) return;
  if(invertControlsTimer > 0) invertControlsTimer -= dt;

  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); right.crossVectors(fwd,UP);
  let mx = 0, mz = 0;
  const s = renderer.xr.getSession?.();
  if(s) for(const src of s.inputSources){
    const gp = src.gamepad; if(!gp) continue;
    const x = gp.axes[2] ?? gp.axes[0], y = gp.axes[3] ?? gp.axes[1];
    if(src.handedness==='left'){ if(Math.abs(x)>.15) mx = x; if(Math.abs(y)>.15) mz = -y; }
    else if(src.handedness==='right'){
      if(Math.abs(x)>.7){ if(!snapLock){ snapTurn(-Math.sign(x)*Math.PI/6); snapLock = true; } } else snapLock = false;
    }
  }
  if(keys.w) mz = 1; if(keys.s) mz = -1; if(keys.d) mx = 1; if(keys.a) mx = -1;
  if(keys.arrowleft) dolly.rotation.y += dt*1.8;
  if(keys.arrowright) dolly.rotation.y -= dt*1.8;

  if(invertControlsTimer > 0){
    mx = -mx;
    mz = -mz;
  }

  const isMoving = Math.hypot(mx, mz) > 0.1;
  const wantsSprint = (keys.shift || vrSprintPressed) && isMoving && !exhausted && stamina > 0;

  if(wantsSprint){
    stamina = Math.max(0, stamina - (isNightmare() ? 32 : 26) * dt);
    if(stamina <= 0) exhausted = true;
  } else {
    stamina = Math.min(100, stamina + (exhausted ? 12 : 18) * dt);
    if(exhausted && stamina >= 45) exhausted = false;
  }

  if(exhausted || stamina < 25){
    breathTimer -= dt;
    if(breathTimer <= 0){
      sfx('breath');
      breathTimer = exhausted ? 1.35 : 1.9;
    }
  }

  const curSpeed = wantsSprint ? SPRINT_SPEED : (exhausted ? WALK_SPEED * 0.72 : WALK_SPEED);
  const stepVec = moveStep.set(0,0,0).addScaledVector(fwd, mz * curSpeed * dt).addScaledVector(right, mx * curSpeed * dt);
  dolly.position.add(stepVec);

  const stepLen = stepVec.length();
  distanceWalked += stepLen;
  stepAccum += stepLen;

  camera.getWorldPosition(head);
  for(let i=0; i<colliders.length; i++){
    const c = colliders[i];
    const dx = head.x-c.x, dz = head.z-c.z;
    const min = c.r+.35;
    if(Math.abs(dx) > min || Math.abs(dz) > min) continue;
    const d = Math.hypot(dx,dz);
    if(d<min && d>0.001){ dolly.position.x += dx/d*(min-d); dolly.position.z += dz/d*(min-d); }
  }

  camera.getWorldPosition(head);
  const dd = Math.hypot(head.x, head.z);
  if(dd > MAP_R - 0.8){
    const k = (MAP_R - 0.8) / dd;
    dolly.position.x -= head.x * (1 - k);
    dolly.position.z -= head.z * (1 - k);
  }

  if(stepAccum >= 0.65){
    stepAccum = 0;
    const heading = Math.atan2(-fwd.x, -fwd.z);
    spawnFootprint(head, heading);
    sfx('step');
  }

  let newZone = 'BOSQUE OSCURO';
  if(Math.hypot(head.x - cemCenter.x, head.z - cemCenter.z) < 22) newZone = 'CEMENTERIO';
  else if(Math.hypot(head.x - ruinCenter.x, head.z - ruinCenter.z) < 16) newZone = 'CABAÑA EN RUINAS';
  else if(Math.hypot(head.x - ritualCenter.x, head.z - ritualCenter.z) < 17) newZone = 'ALTAR RITUAL';
  if(newZone !== currentZone){
    currentZone = newZone;
    drawPanel();
  }
}

/* ================= Lógica de Pilas, Páginas Ocultas y Dificultad (Sin Asignaciones) ================= */
function updateItems(t){
  camera.getWorldPosition(head);
  camera.getWorldDirection(fwd);

  const inVR = renderer.xr.isPresenting;
  const anyConfirmPressed = ctrls.some(c=>c.userData.interactPressed || c.userData.faceConfirmPressed || c.userData.grabPressed);
  let promptTarget = null;
  let promptOffset = 0.35;

  for(let i=batteries.length-1; i>=0; i--){
    const b = batteries[i];
    b.m.rotation.y = t * 2.2 + b.phase;
    b.m.position.y = 0.25 + Math.sin(t * 3 + b.phase) * 0.05;

    const dx = b.m.position.x - head.x;
    const dz = b.m.position.z - head.z;
    const horizDist = Math.hypot(dx, dz);
    if(horizDist > 2.5) continue;

    _itemDir.subVectors(b.m.position, head).normalize();
    const lookingAtBattery = horizDist < 1.85 && fwd.dot(_itemDir) > 0.15;

    let handNearBattery = false;
    let handAction = false;
    if(inVR){
      for(let k=0; k<ctrls.length; k++){
        const c = ctrls[k];
        c.getWorldPosition(tmp);
        if(tmp.distanceToSquared(b.m.position) < 1.3225){
          handNearBattery = true;
          if(c.userData.interactPressed || c.userData.faceConfirmPressed || c.userData.grabPressed){
            handAction = true;
          }
        }
      }
    }

    if(inVR && (lookingAtBattery || handNearBattery) && !promptTarget){
      promptTarget = b.m.position;
      promptOffset = 0.32;
    }

    let takeBat = !inVR && horizDist < 1.35;
    if(inVR && ((handNearBattery && handAction) || (lookingAtBattery && anyConfirmPressed))){
      takeBat = true;
    }

    if(takeBat && playing && !paused){
      scene.remove(b.m); batteries.splice(i, 1);
      battery = Math.min(100, battery + (isNightmare() ? 30 : 40));
      sfx('battery');
      drawPanel();
      ctrls.forEach(c=>pulse(c, .6, 120));
    }
  }

  for(let i=pages.length-1;i>=0;i--){
    const p = pages[i];
    const dx = p.m.position.x - head.x;
    const dz = p.m.position.z - head.z;
    const horizDist = Math.hypot(dx, dz);
    if(horizDist > 2.5) continue;

    _itemDir.subVectors(p.m.position, head).normalize();
    const dist = p.m.position.distanceTo(head);
    const lookingAtPage = horizDist < 1.75 && fwd.dot(_itemDir) > 0.35;

    let handNearPage = false;
    let handAction = false;
    if(inVR){
      for(let k=0; k<ctrls.length; k++){
        const c = ctrls[k];
        c.getWorldPosition(tmp);
        if(tmp.distanceToSquared(p.m.position) < 0.9025){
          handNearPage = true;
          if(c.userData.interactPressed || c.userData.faceConfirmPressed || c.userData.grabPressed){
            handAction = true;
          }
        }
      }
    }

    if(inVR && (lookingAtPage || handNearPage) && !promptTarget){
      promptTarget = p.m.position;
      promptOffset = 0.36;
    }

    let got = !inVR && dist < 1.45 && fwd.dot(_itemDir) > 0.40;
    if(inVR && ((lookingAtPage && anyConfirmPressed) || (handNearPage && handAction))){
      got = true;
    }

    if(got && playing && !paused){
      scene.remove(p.m); pages.splice(i,1);
      pagesFound++;
      sfx('page');
      showCollectedPage(p.txt, pagesFound);
      drawPanel();
      ctrls.forEach(c=>pulse(c,.85,180));

      const baseFog = isNightmare() ? 0.072 : baseFogDensity;
      scene.fog.density = baseFog + (pagesFound * 0.0045);
      flashFailTimer = 0.45 + pagesFound * 0.08;

      if(pagesFound === 6 && !isNightmare()){
        paintSky(true);
        resetParticles(true);
      }

      const spawnDist = Math.max(5.5, (20 - pagesFound * 1.6) / diffMultiplier);
      teleportSlender(spawnDist);
      nextTpTimer = rand(6.2, 10.8) / diffMultiplier - pagesFound * 0.16;

      if(pagesFound >= TOTAL_PAGES){
        sfx('win'); drawPanel('ESCAPASTE!');
        finishGame(true, isNightmare() ? '¡SOBREVIVISTE A LA PESADILLA!' : '¡RECOLECTASTE LAS 8 NOTAS Y ESCAPASTE!');
      }
    }
  }

  if(inVR && promptTarget && playing && !paused){
    vrPromptSprite.visible = true;
    vrPromptSprite.position.set(
      promptTarget.x,
      promptTarget.y + promptOffset + Math.sin(t * 6) * 0.02,
      promptTarget.z
    );
  } else {
    vrPromptSprite.visible = false;
  }
}

function teleportSlender(distFromPlayer, preferOffscreen=true){
  camera.getWorldPosition(head);
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const facingAngle = Math.atan2(fwd.z, fwd.x);
  const ang = preferOffscreen && Math.random() < 0.68
    ? facingAngle + Math.PI + rand(-1.05, 1.05)
    : rand(0, Math.PI * 2);
  let nx = head.x + Math.cos(ang)*distFromPlayer;
  let nz = head.z + Math.sin(ang)*distFromPlayer;
  const d = Math.hypot(nx, nz);
  if(d > MAP_R - 2){
    nx *= (MAP_R - 2) / d;
    nz *= (MAP_R - 2) / d;
  }
  slender.position.set(nx, 0, nz);
  slender.lookAt(head.x, 0, head.z);
  stealthTimer = 0;
}

function triggerForestEvent(){
  camera.getWorldPosition(head);
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const roll = Math.random();
  if(roll < 0.34){
    teleportSlender(rand(10.5, 17), true);
    nextTpTimer = rand(7.5, 12.5) / diffMultiplier;
    ambientGlitchTimer = rand(0.9, 1.55);
    sfx('manifestation');
  }else if(roll < 0.60){
    const baseAngle = Math.atan2(fwd.z, fwd.x);
    const angle = baseAngle + rand(-1.15, 1.15);
    const radius = rand(8, 13);
    let x = head.x + Math.cos(angle) * radius;
    let z = head.z + Math.sin(angle) * radius;
    const mapDistance = Math.hypot(x,z);
    if(mapDistance > MAP_R - 3){ x *= (MAP_R - 3) / mapDistance; z *= (MAP_R - 3) / mapDistance; }
    phantomSlender.position.set(x,0,z);
    phantomSlender.lookAt(head.x,0,head.z);
    phantomSlender.visible = true;
    ambientApparitionTimer = rand(0.85,1.5);
    phantomTimer = ambientApparitionTimer;
    ambientGlitchTimer = rand(0.55,0.95);
    sfx('whisperCue');
  }else if(roll < 0.82){
    ambientGlitchTimer = rand(0.5,1.25);
    flashFailTimer = Math.max(flashFailTimer, rand(0.18,0.38));
    sfx('signal');
  }else{
    ambientGlitchTimer = rand(0.2,0.55);
    sfx('distantFootsteps');
  }
}

function triggerScreamer(){
  screamerTimer = 0.95;
  if(isNightmare()) invertControlsTimer = 3.5;
  sfx('screamer');
  ctrls.forEach(c=>pulse(c, 1.0, 500));
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  camera.getWorldPosition(head);
  slender.position.set(head.x + fwd.x*1.3, 0, head.z + fwd.z*1.3);
  slender.lookAt(head.x, 0, head.z);
}

function updateSlender(dt, t){
  camera.getWorldPosition(head);
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();

  const dx = head.x - slender.position.x, dz = head.z - slender.position.z;
  const dist = Math.hypot(dx,dz);
  const nightmare = isNightmare();

  ambientGlitchTimer = Math.max(0, ambientGlitchTimer - dt);
  if(ambientApparitionTimer > 0) ambientApparitionTimer = Math.max(0, ambientApparitionTimer - dt);
  forestEventTimer -= dt;
  const elapsedRound = roundStartTime - timeLeft;
  if(forestEventTimer <= 0 && elapsedRound > 12){
    triggerForestEvent();
    forestEventTimer = rand(nightmare ? 13 : 18, nightmare ? 22 : 31) / diffMultiplier - pagesFound * 0.32;
  }

  if(heardCooldown > 0) heardCooldown -= dt;
  const makingNoise = micReady && micLevel > getNoiseThreshold();
  const hearRange = nightmare ? 48 : 38;
  if(makingNoise && dist < hearRange){
    stealthTimer = 0;
    if(heardCooldown <= 0){
      timesHeard++;
      heardCooldown = nightmare ? 2.5 : 3.5;
    }
    if(dist > 10){
      teleportSlender(nightmare ? rand(5.2, 8.5) : rand(6.5, 10.5));
      nextTpTimer = rand(5.8, 9.2) / diffMultiplier;
    }
  }

  const chaseLimit = nightmare ? 4 : 6;
  const stealthNeeded = nightmare ? 4.0 : 2.4;
  const isHidden = !flashlightOn && !makingNoise && pagesFound < chaseLimit;
  if(isHidden && dist < 18){
    stealthTimer += dt;
    if(stealthTimer >= stealthNeeded){
      sfx('vanish');
      teleportSlender(rand(28, 38));
      nextTpTimer = rand(6.5, 11.5) / diffMultiplier;
      stealthTimer = 0;
      return;
    }
  } else {
    stealthTimer = Math.max(0, stealthTimer - dt * 1.5);
  }

  nextTpTimer -= dt;
  if(nextTpTimer <= 0 && !isHidden && pagesFound < chaseLimit){
    const targetDist = Math.max(5.0, (20 - pagesFound*1.65) / diffMultiplier);
    teleportSlender(targetDist);
    nextTpTimer = rand(5.5, 10.5) / diffMultiplier;
  }

  slender.lookAt(head.x, 0, head.z);
  for(let idx=0; idx<tentacles.length; idx++){
    tentacles[idx].rotation.z = (idx%2===0?1:-1)*(.4 + idx*.1) + Math.sin(t*(4+pagesFound) + idx)*.16;
  }

  let speedFactor = 1.0;
  if(isHidden) speedFactor = 0.25;
  else if(makingNoise) speedFactor = nightmare ? 2.25 : 1.95;

  const stalkSpeed = (0.65 + pagesFound * 0.34) * diffMultiplier * speedFactor;
  if(dist > 1.2){
    slender.position.x += (dx/dist) * stalkSpeed * dt;
    slender.position.z += (dz/dist) * stalkSpeed * dt;
  }

  const toSlender = toSlenderVector.set(dx,0,dz).normalize();
  const lookingAtHim = fwd.dot(toSlender) > 0.72 && dist < (15 + pagesFound) && flashlightOn;
  if(!firstEncounterShown && elapsedRound > 10 && ((lookingAtHim && dist < 20) || dist < 8.5)){
    showFirstEncounter();
  }
  if(firstEncounterTimer > 0){
    firstEncounterTimer = Math.max(0, firstEncounterTimer - dt);
    if(firstEncounterTimer <= 0) hideFirstEncounter();
  }

  let staticLevel = 0;
  const dangerRadius = isHidden ? 4.5 : (9.5 + pagesFound * 0.8 + (nightmare ? 2.5 : 0));
  if(dist < dangerRadius || lookingAtHim || (makingNoise && dist < 22)){
    staticLevel = Math.min(1, (dangerRadius + 2 - dist)/dangerRadius + (lookingAtHim ? 0.35 + pagesFound*0.04 : 0) + (makingNoise ? 0.3 : 0));
    sanity -= (11 + pagesFound*3.8) * diffMultiplier * staticLevel * dt;
    if(Math.random() < (0.008 + pagesFound*0.003 + (nightmare ? 0.008 : 0)) && flashFailTimer <= 0){
      flashFailTimer = 0.55;
      sfx('spark');
    }
  } else {
    const regen = nightmare ? 0.8 : Math.max(1.5, 4.5 - pagesFound*0.3);
    sanity = Math.min(100, sanity + regen * dt);
  }

  updateVhsEffect(staticLevel);

  const phantomSanityLimit = nightmare ? 70 : 35;
  const phantomAllowed = sanity < phantomSanityLimit || ambientApparitionTimer > 0 || phantomSlender.visible;
  if(phantomAllowed){
    phantomTimer -= dt;
    if(phantomTimer <= 0 && !phantomSlender.visible && sanity < phantomSanityLimit){
      const ang = rand(-0.6, 0.6);
      const dir = phantomDirection.copy(fwd).applyAxisAngle(UP, ang);
      phantomSlender.position.set(head.x + dir.x * rand(6, 10), 0, head.z + dir.z * rand(6, 10));
      phantomSlender.lookAt(head.x, 0, head.z);
      phantomSlender.visible = true;
      phantomTimer = 1.4;
    } else if(phantomSlender.visible){
      const toPhantom = phantomDirection.copy(phantomSlender.position).sub(head).normalize();
      if(phantomTimer <= 0 || (flashlightOn && fwd.dot(toPhantom) > 0.92)){
        phantomSlender.visible = false;
        phantomTimer = nightmare ? rand(2.5, 5.0) : rand(4, 8);
      }
    }
  } else {
    phantomSlender.visible = false;
  }

  if((dist < 2.2 || (lookingAtHim && dist < (nightmare ? 5.5 : 4.6))) && screamerTimer <= 0){
    triggerScreamer();
    sanity -= 36 * diffMultiplier;
    nextTpTimer = 1.8;
  }

  const sanityStatic = Math.max(0, (50 - sanity) / 90);
  const combinedStatic = Math.max(staticLevel, sanityStatic);

  if(screamerTimer > 0){
    screamerTimer -= dt;
    updateScreamerPlane(dt, 1, true);
  } else if(combinedStatic > 0.05){
    updateScreamerPlane(dt, combinedStatic, false);
  } else {
    screamMat.opacity = 0;
  }

  if(sanity <= 0){
    sfx('lose');
    updateScreamerPlane(dt, 1, true);
    drawPanel('TE ATRAPO...');
    finishGame(false, 'SLENDERMAN TE ATRAPÓ');
  }
}

/* ================= Bucle principal ================= */
const clock = new THREE.Clock();
let panelRefreshTimer = 0;
let micRefreshTimer = 0;
renderer.setAnimationLoop(()=>{
  const dt = Math.min(clock.getDelta(),.05), t = clock.elapsedTime;
  if(!paused){
    micRefreshTimer -= dt;
    if(micRefreshTimer <= 0){
      updateMicrophone();
      micRefreshTimer = 0.06;
    }
  }
  updateControllerButtons();
  updateParticles(t, dt);
  updateRain(dt);
  updateBats(t, dt);
  updateFootprints(dt);
  move(dt);
  updateItems(t);

  altarOrb.rotation.y = t * 1.5;
  altarOrb.position.y = 1.35 + Math.sin(t * 2.5) * 0.08;
  radioLed.visible = Math.sin(t * 14) > 0;

  if(playing && !paused){
    updateSlender(dt, t);
    timeLeft -= dt;

    if(flashlightOn){
      const drain = isNightmare() ? 0.90 : 0.55;
      battery = Math.max(0, battery - drain * dt);
      if(battery <= 0){
        flashlightOn = false;
        sfx('click');
      }
    }

    panelRefreshTimer -= dt;
    if(panelRefreshTimer <= 0){
      drawPanel();
      updatePageSignalUI();
      panelRefreshTimer = 0.16;
    }
    if(timeLeft<=0){
      sfx('lose'); drawPanel('FIN DEL TIEMPO');
      finishGame(false, 'SE AGOTÓ EL TIEMPO');
    }
  } else if(!playing){
    dolly.rotation.y += dt * 0.15;
  }

  lightningTimer -= dt;
  if(lightningTimer <= 0){
    lightningFlash = 0.25;
    lightningTimer = isNightmare() ? rand(5, 11) : rand(9, 18);
    if(playing) sfx('thunder');
  }
  if(lightningFlash > 0){
    lightningFlash -= dt;
    lightningLight.intensity = Math.random() > 0.3 ? 3.5 : 0.2;
    scene.fog.color.setHex(isNightmare() ? 0x26080c : 0x161826);
  } else {
    lightningLight.intensity = 0;
    scene.fog.color.setHex(isNightmare() ? 0x080102 : 0x020103);
  }

  let lightActive = flashlightOn && battery > 0;
  if(lightActive && battery < (isNightmare() ? 30 : 15) && Math.random() < 0.09){
    lightActive = false;
  }
  if(flashFailTimer > 0){
    flashFailTimer -= dt;
    lightActive = Math.random() > 0.65;
  }

  if(flashBuzzGain && ac){
    flashBuzzGain.gain.setTargetAtTime((playing && lightActive) ? 0.015 : 0, ac.currentTime, 0.05);
  }

  if(lightActive){
    const dimFactor = battery < 25 ? 0.55 : 1.0;
    flashlight.intensity = (52 * dimFactor) + Math.sin(t*35)*2 + (screamerTimer>0 ? rand(-35,35) : 0);
    beamMesh.visible = true;
    lensMat.color.setHex(0xfff6cc);
  } else {
    flashlight.intensity = 0;
    beamMesh.visible = false;
    lensMat.color.setHex(0x222228);
  }

  if(playing && (keys.w || keys.s || keys.a || keys.d)){
    const bobSpeed = (keys.shift || vrSprintPressed) ? 17 : 12;
    flashRig.position.y = -0.22 + Math.sin(t*bobSpeed)*0.012;
  }

  camera.getWorldPosition(head);
  for(let i=0; i<shadowEyes.length; i++){
    const e = shadowEyes[i];
    e.lookAt(head.x, e.position.y, head.z);
    if(e.position.distanceToSquared(head) < 49){
      const a = rand(0, Math.PI * 2);
      const r = rand((pagesFound >= 6 || isNightmare()) ? 8 : 14, MAP_R - 4);
      e.position.set(Math.cos(a) * r, rand(1.1, 2.2), Math.sin(a) * r);
    }
  }

  renderer.render(scene,camera);
});