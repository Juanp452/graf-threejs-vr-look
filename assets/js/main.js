import * as THREE from 'three';
import {VRButton} from 'three/addons/webxr/VRButton.js';
import {StereoEffect} from 'three/addons/effects/StereoEffect.js';

/* ================= Configuración Slenderman: Edición Multi-Plataforma (PC + WebXR + Móvil + Móvil VR) ================= */
const MAP_R = 72;
const TOTAL_PAGES = 8;
const WALK_SPEED = 3.3;
const SPRINT_SPEED = 5.4;
const rand = (a,b)=>a+Math.random()*(b-a);

function isMobileDevice(){
  return window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || window.innerWidth <= 900;
}

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
const DEFAULT_GAME_SETTINGS = { quality: isMobileDevice() ? 'performance' : 'balanced', reducedMotion: false, microphone: true };
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

/* ================= Soporte Móvil VR (Cardboard / Estereoscópico + Giroscopio Nativo) ================= */
let mobileVrActive = false;
let stereoEffect = null;
const gyroState = { alpha: 0, beta: 0, gamma: 0, orient: 0, active: false };
const _zee = new THREE.Vector3(0, 0, 1);
const _euler = new THREE.Euler();
const _q0 = new THREE.Quaternion();
const _q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));

window.addEventListener('deviceorientation', (e)=>{
  if(e.alpha === null) return;
  gyroState.alpha = e.alpha;
  gyroState.beta = e.beta;
  gyroState.gamma = e.gamma;
  gyroState.orient = (screen.orientation?.angle ?? window.orientation ?? 0);
  gyroState.active = true;
}, true);

function updateGyroCamera(){
  if(!gyroState.active) return;
  const alpha = THREE.MathUtils.degToRad(gyroState.alpha);
  const beta  = THREE.MathUtils.degToRad(gyroState.beta);
  const gamma = THREE.MathUtils.degToRad(gyroState.gamma);
  const orient = THREE.MathUtils.degToRad(gyroState.orient);
  _euler.set(beta, alpha, -gamma, 'YXZ');
  camera.quaternion.setFromEuler(_euler);
  camera.quaternion.multiply(_q1);
  camera.quaternion.multiply(_q0.setFromAxisAngle(_zee, -orient));
}

async function enterMobileFullscreen(){
  if(!isMobileDevice()) return;
  try{
    if(!document.fullscreenElement && document.documentElement.requestFullscreen){
      await document.documentElement.requestFullscreen();
    }
    if(screen.orientation && screen.orientation.lock){
      await screen.orientation.lock('landscape');
    }
  }catch{}
}

async function enterMobileVR(){
  if(typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
    try{
      const perm = await DeviceOrientationEvent.requestPermission();
      if(perm !== 'granted'){
        alert('Debes permitir el acceso al giroscopio para usar Móvil VR.');
        return;
      }
    }catch{}
  }
  if(!stereoEffect){
    stereoEffect = new StereoEffect(renderer);
    stereoEffect.setEyeSeparation(0.064);
  }
  stereoEffect.setSize(app.clientWidth, app.clientHeight);
  await enterMobileFullscreen();
  mobileVrActive = true;
  flashRig.position.set(0.22, -0.20, -0.35);
  camera.add(flashRig);
  startGameFromMenu(true);
  touchHudEl?.classList.add('hidden');
  document.getElementById('btn-exit-mobile-vr')?.classList.remove('hidden');
}

function exitMobileVR(){
  if(!mobileVrActive) return;
  mobileVrActive = false;
  document.getElementById('btn-exit-mobile-vr')?.classList.add('hidden');
  resizeRendererToApp();
  if(isMobileDevice() && playing && !paused){
    touchHudEl?.classList.remove('hidden');
  }
}

document.getElementById('btn-mobile-vr')?.addEventListener('click', enterMobileVR);
document.getElementById('btn-exit-mobile-vr')?.addEventListener('click', exitMobileVR);

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
  if(stereoEffect) stereoEffect.setSize(width, height);
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

let screamerTimer = 0, nearScreamCooldown = 0, nextTpTimer = 7, flashlightOn = true, flashFailTimer = 0;
let pendingDefeatReason = null;
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

const skyMat = new THREE.MeshBasicMaterial({side:THREE.BackSide, fog:false, depthWrite:false, color:0xffffff});
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

/* ================= Partículas Flotantes ================= */
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
      pColors[i*3]   = 1.0; pColors[i*3+1] = 0.12; pColors[i*3+2] = 0.22;
    } else if(nearCem){
      pColors[i*3]   = 0.55; pColors[i*3+1] = 0.65; pColors[i*3+2] = 0.85;
    } else {
      pColors[i*3]   = 0.55; pColors[i*3+1] = 0.95; pColors[i*3+2] = 0.45;
    }
  }
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pColors, 3));
  pGeo.setDrawRange(0, activeParticleCount);
  pGeo.attributes.color.needsUpdate = true;
}
resetParticles(false);

const pTex = pixelTex(8, 8, (g)=>{ g.fillStyle = '#ffffff'; g.fillRect(2, 2, 4, 4); });
const pMat = new THREE.PointsMaterial({
  size: 0.16, map: pTex, vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false
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

/* ================= Lluvia Nocturna ================= */
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
const rainTex = pixelTex(4, 16, (g)=>{ g.fillStyle = 'rgba(160, 180, 210, 0.55)'; g.fillRect(1, 0, 2, 16); });
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

/* ================= Huellas de Pasos ================= */
const FOOTPRINT_MAX = 40;
const footprintPool = [];
let footprintIdx = 0, stepAccum = 0, leftFootNext = true;

const footTex = pixelTex(16, 24, (g)=>{
  g.fillStyle = 'rgba(18, 12, 8, 0.92)';
  g.fillRect(4, 2, 8, 12); g.fillRect(5, 16, 6, 6);
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
      if(fp.life <= 0){ fp.life = 0; fp.mesh.visible = false; }
      else { fp.mesh.material.opacity = fp.life * 0.72; }
    }
  }
}

function clearFootprints(){
  for(const fp of footprintPool){ fp.life = 0; fp.mesh.visible = false; }
  stepAccum = 0;
}

/* ================= Iluminación + Linterna 3D ================= */
const hemi = new THREE.HemisphereLight(0x141220, 0x030304, 0.07);
scene.add(hemi);

const lightningLight = new THREE.DirectionalLight(0xaaccff, 0);
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
  g.fillText('[GATILLO / TOCAR]', w / 2, h / 2);
});
const vrPromptSprite = new THREE.Sprite(
  new THREE.SpriteMaterial({map: vrPromptTex, transparent: true, depthTest: false})
);
vrPromptSprite.scale.set(0.56, 0.14, 1);
vrPromptSprite.renderOrder = 995;
vrPromptSprite.visible = false;
scene.add(vrPromptSprite);

/* ================= Construcción del Escenario ================= */
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

// Cerco perimetral
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

// Cementerio
const cemCenter = {x: 34, z: -34};
const tombTransforms = [], crossVTransforms = [], crossHTransforms = [];

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
    _dummy.position.set(p.x, p.y, p.z); _dummy.rotation.set(0, 0, 0); _dummy.scale.set(1, 1, 1); _dummy.updateMatrix();
    tombInst.setMatrixAt(idx, _dummy.matrix);
  });
  scene.add(tombInst);
}
if(crossVTransforms.length){
  const cVInst = new THREE.InstancedMesh(new THREE.BoxGeometry(.18, 1.7, .18), crossM, crossVTransforms.length);
  const cHInst = new THREE.InstancedMesh(new THREE.BoxGeometry(.9, .18, .18), crossM, crossHTransforms.length);
  crossVTransforms.forEach((p, idx)=>{
    _dummy.position.set(p.x, p.y, p.z); _dummy.rotation.set(0, 0, 0); _dummy.scale.set(1, 1, 1); _dummy.updateMatrix();
    cVInst.setMatrixAt(idx, _dummy.matrix);
    _dummy.position.y = crossHTransforms[idx].y; _dummy.updateMatrix();
    cHInst.setMatrixAt(idx, _dummy.matrix);
  });
  scene.add(cVInst, cHInst);
}

const mausoleum = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.2, 4.2), darkStoneM);
mausoleum.position.set(cemCenter.x, 1.6, cemCenter.z);
mausoleum.matrixAutoUpdate = false; mausoleum.updateMatrix();
scene.add(mausoleum);
colliders.push({x: cemCenter.x, z: cemCenter.z, r: 2.6});
addHidingSpot(cemCenter.x, 1.4, cemCenter.z + 2.13, 0);
addHidingSpot(cemCenter.x, 1.4, cemCenter.z - 2.13, Math.PI);

// Cabaña en ruinas + Radio
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
  mesh.matrixAutoUpdate = false; mesh.updateMatrix();
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

// Círculo ritual de monolitos
const ritualCenter = {x: 0, z: 42};
const runeTex = pixelTex(16, 48, (g,w,h)=>{
  g.fillStyle = '#25252c'; g.fillRect(0,0,w,h);
  g.fillStyle = '#ff001e';
  g.fillRect(7, 4, 2, 40); g.fillRect(3, 12, 10, 2); g.fillRect(4, 24, 8, 2); g.fillRect(3, 34, 10, 2);
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
  addHidingSpot(mx + dirX, 1.45, mz + dirZ, Math.atan2(dirX, dirZ));
}
const altar = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.1, 1.4), stoneM);
altar.position.set(ritualCenter.x, 0.55, ritualCenter.z);
altar.matrixAutoUpdate = false; altar.updateMatrix();
const altarOrb = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), new THREE.MeshBasicMaterial({color:0xff001e}));
altarOrb.position.set(ritualCenter.x, 1.35, ritualCenter.z);
scene.add(altar, altarOrb);
colliders.push({x: ritualCenter.x, z: ritualCenter.z, r: 1.3});

// Senderos y postes
const pathCoords = [], lampPostsData = [];
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
  _dummy.position.set(p.x, 0.025, p.z); _dummy.rotation.set(0, p.rot, 0); _dummy.scale.set(1, 1, 1); _dummy.updateMatrix();
  pathInst.setMatrixAt(idx, _dummy.matrix);
});
scene.add(pathInst);

if(lampPostsData.length){
  const lPoleInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 2.3, 0.16), fenceM, lampPostsData.length);
  const lHeadInst = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.34, 0.28), new THREE.MeshBasicMaterial({color:0x4a1218}), lampPostsData.length);
  lampPostsData.forEach((p, idx)=>{
    _dummy.position.set(p.x, 1.15, p.z); _dummy.rotation.set(0, 0, 0); _dummy.scale.set(1, 1, 1); _dummy.updateMatrix();
    lPoleInst.setMatrixAt(idx, _dummy.matrix);
    _dummy.position.y = 2.35; _dummy.updateMatrix();
    lHeadInst.setMatrixAt(idx, _dummy.matrix);
  });
  scene.add(lPoleInst, lHeadInst);
}

// Bosque y murciélagos
const bats = [];
const batMat = new THREE.MeshBasicMaterial({color:0x08080c});
const treeTrunks = [], treeCanopies1 = [], treeCanopies2 = [], treeBranches = [];

for(let i=0; i<135; i++){
  let x, z, tries = 0;
  do{
    const a = rand(0, Math.PI * 2);
    const rad = rand(8, MAP_R - 4);
    x = Math.cos(a) * rad; z = Math.sin(a) * rad;
    tries++;
  } while((!isAreaClear(x, z, 4.8) || pathCoords.some(p => Math.hypot(x-p.x, z-p.z) < 2.6)) && tries < 25);
  if(tries >= 25) continue;

  const s = rand(1.0, 1.8);
  const trunkW = 0.65 * s;
  treeTrunks.push({x, z, s});
  if(i % 2 === 0){ treeCanopies1.push({x, z, s}); treeCanopies2.push({x, z, s}); }
  else { treeBranches.push({x, z, s}); }
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
  _dummy.position.set(tr.x, 1.9 * tr.s, tr.z); _dummy.rotation.set(0, 0, 0); _dummy.scale.set(tr.s, tr.s, tr.s); _dummy.updateMatrix();
  trunkInst.setMatrixAt(idx, _dummy.matrix);
});
scene.add(trunkInst);

if(treeCanopies1.length){
  const c1Inst = new THREE.InstancedMesh(new THREE.BoxGeometry(2.3, 1.3, 2.3), deadLeafM, treeCanopies1.length);
  const c2Inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1.0, 1.4), deadLeafM, treeCanopies2.length);
  treeCanopies1.forEach((c, idx)=>{
    _dummy.position.set(c.x, 3.7 * c.s, c.z); _dummy.rotation.set(0, 0, 0); _dummy.scale.set(c.s, c.s, c.s); _dummy.updateMatrix();
    c1Inst.setMatrixAt(idx, _dummy.matrix);
    _dummy.position.set(c.x, 4.6 * c.s, c.z); _dummy.updateMatrix();
    c2Inst.setMatrixAt(idx, _dummy.matrix);
  });
  scene.add(c1Inst, c2Inst);
}

if(treeBranches.length){
  const bInst = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.16, 0.16), trunkM, treeBranches.length);
  treeBranches.forEach((b, idx)=>{
    _dummy.position.set(b.x + 0.45 * b.s, 2.8 * b.s, b.z); _dummy.rotation.set(0, 0, 0.4); _dummy.scale.set(b.s, b.s, b.s); _dummy.updateMatrix();
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
        b.flying = true; b.flyTimer = 3.2; b.grp.visible = true;
        b.grp.position.copy(b.home);
        b.dir.set(rand(-1,1), rand(0.5, 1.1), rand(-1,1)).normalize();
        sfx('bats');
      }
    } else {
      b.flyTimer -= dt;
      b.grp.position.addScaledVector(b.dir, 6.5 * dt);
      const flap = Math.sin(t * 28) * 0.7;
      b.wL.rotation.z = flap; b.wR.rotation.z = -flap;
      if(b.flyTimer <= 0){ b.flying = false; b.grp.visible = false; }
    }
  }
}

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

/* ================= Pilas 3D ================= */
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
    if(i < fixedSpots.length){ bx = fixedSpots[i].x; bz = fixedSpots[i].z; }
    else {
      const a = rand(0, Math.PI * 2), r = rand(10, MAP_R - 5);
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

/* ================= Las 8 Páginas Ocultas ================= */
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

/* ================= Modelo Voxel de SLENDERMAN ================= */
function buildSlenderMesh(isHallucination=false){
  const grp = new THREE.Group();
  const sMat = new THREE.MeshLambertMaterial({ color:0x050507, transparent:isHallucination, opacity:isHallucination?0.55:1 });
  const wMat = new THREE.MeshLambertMaterial({ color:0xf8f8f8, emissive:0x1a1a1a, transparent:isHallucination, opacity:isHallucination?0.55:1 });
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
let phantomTimer = 0, forestEventTimer = 16, ambientGlitchTimer = 0, ambientApparitionTimer = 0;

/* ================= SCREAMER ================= */
function buildStaticTextures(count, isJumpscare){
  const list = [];
  for(let f=0; f<count; f++){
    list.push(pixelTex(96, 96, (g)=>{
      for(let i=0;i<240;i++){
        const shade = Math.random() > 0.5 ? 245 : 15;
        g.fillStyle = `rgba(${shade},${shade},${shade},0.75)`;
        g.fillRect(Math.floor(Math.random()*48)*2, Math.floor(Math.random()*48)*2, 2, 2);
      }
      g.fillStyle = 'rgba(255,0,40,0.22)'; g.fillRect(0, Math.floor(Math.random()*90), 96, 2);
      g.fillStyle = 'rgba(0,235,255,0.22)'; g.fillRect(0, Math.floor(Math.random()*90), 96, 2);

      if(isJumpscare){
        const jx = rand(-6,6), jy = rand(-5,5);
        g.fillStyle = '#050507'; g.fillRect(8+jx, 70+jy, 80, 30);
        g.fillStyle = '#e8e8e8'; g.fillRect(40+jx, 70+jy, 16, 26);
        g.fillStyle = '#111115'; g.fillRect(46+jx, 72+jy, 4, 24);
        g.fillStyle = '#dcdcdc'; g.fillRect(26+jx, 10+jy, 44, 62);
        g.fillStyle = '#f7f7f7'; g.fillRect(29+jx, 13+jy, 38, 56);
        g.fillStyle = '#bdbdbd'; g.fillRect(27+jx, 32+jy, 4, 26); g.fillRect(65+jx, 32+jy, 4, 26); g.fillRect(35+jx, 64+jy, 26, 6);
      }
    }));
  }
  return list;
}

const staticTexturesNormal = buildStaticTextures(4, false);
const staticTexturesJumpscare = buildStaticTextures(4, true);
let staticFrameIdx = 0, staticSwapTimer = 0;

const screamMat = new THREE.MeshBasicMaterial({
  map: staticTexturesNormal[0], transparent: true, opacity: 0, depthTest: false, fog: false
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
    staticSwapTimer = 0.055;
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

/* ================= HUD ================= */
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
  pageSignalForward.y = 0; pageSignalForward.normalize();

  let nearest = Infinity, nearestPage = null;
  for(let i=0; i<pages.length; i++){
    const page = pages[i];
    const distance = Math.hypot(page.m.position.x - playerPosition.x, page.m.position.z - playerPosition.z);
    if(distance < nearest){ nearest = distance; nearestPage = page; }
  }

  let arrow = '▲';
  if(nearestPage){
    const dx = nearestPage.m.position.x - playerPosition.x;
    const dz = nearestPage.m.position.z - playerPosition.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = dx / len, nz = dz / len;
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
      g.textAlign='center'; g.fillStyle='#ffec27'; g.font='bold 12px monospace'; g.fillText('SIN MICROFONO', 160, 141);
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
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 }
    });
    micContext = new (window.AudioContext || window.webkitAudioContext)();
    const src = micContext.createMediaStreamSource(micStream);
    const highPass = micContext.createBiquadFilter();
    highPass.type = 'highpass'; highPass.frequency.value = 105; highPass.Q.value = 0.7;
    micAnalyser = micContext.createAnalyser();
    micAnalyser.fftSize = 256; micAnalyser.smoothingTimeConstant = 0.55;
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
  if(!micReady) noiseStatEl.textContent = gameSettings.microphone ? 'SIN MIC' : 'MIC APAGADO';
  else if(performance.now() < micCalibrationUntil) noiseStatEl.textContent = 'CALIBRANDO';
  else if(pct >= 45){ noiseBoxEl.classList.add('danger'); noiseStatEl.textContent = '¡TE ESCUCHA!'; }
  else if(pct >= 24){ noiseBoxEl.classList.add('warn'); noiseStatEl.textContent = 'RUIDO LEVE'; }
  else noiseStatEl.textContent = !flashlightOn ? 'OCULTO' : 'SILENCIO';
}

/* ================= Menús, Cinemática y Pausa ================= */
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
let introSequenceActive = false, introTimers = [];

const cinematicScenes = [
  { kicker: 'CINTA RECUPERADA · REGISTRO 08', title: 'PINE RIDGE', copy: 'La última patrulla entró al bosque para investigar una llamada de auxilio. La cámara siguió grabando después de que todos desaparecieron.', cue: 'signal' },
  { kicker: '23:47:12 · TRANSMISIÓN INTERRUMPIDA', title: 'OCHO NOTAS', copy: 'Ocho hojas fueron encontradas en tres lugares: el cementerio, una cabaña en ruinas y un altar perdido entre los árboles.', cue: 'distantFootsteps' },
  { kicker: 'TESTIMONIO NO VERIFICADO', title: 'NO ESTÁS SOLO', copy: 'Los testigos describen una figura alta, inmóvil y sin rostro. Si aparece entre los árboles, apaga la linterna. No la mires demasiado tiempo.', cue: 'whisperCue' },
  { kicker: 'PROTOCOLO DE SUPERVIVENCIA', title: 'SOBREVIVE', copy: 'Recupera las ocho notas. Vigila la batería. Mantén el silencio. Si escuchas pasos detrás de ti, no te detengas.', cue: 'thunder' }
];

function clearIntroTimers(){ introTimers.forEach(timer=>clearTimeout(timer)); introTimers = []; }

function resetCinematicIntro(){
  clearIntroTimers();
  introSequenceActive = false;
  setMenuMusicActive(false); setRainActive(false);
  cinematicIntro?.classList.remove('is-hidden', 'is-closing');
  cinematicIntro?.setAttribute('aria-hidden', 'false');
  introPlayButton.disabled = false; introPlayButton.textContent = '▶ REPRODUCIR ARCHIVO';
  introKicker.textContent = 'CINTA RECUPERADA · REGISTRO 08';
  introTitle.textContent = 'PINE RIDGE';
  introCopy.textContent = 'La última transmisión llegó desde el bosque a las 23:47. Después, solo quedó estática.';
  introCounter.textContent = 'ARCHIVO EN ESPERA';
  introProgressFill.style.width = '0%';
}

function playIntroCue(cue){
  if(!cue || typeof sfx !== 'function') return;
  try{ sfx(cue); }catch{}
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
    initAudio(); setMenuMusicActive(true);
    introPlayButton.disabled = false; introPlayButton.textContent = '▶ REPRODUCIR ARCHIVO';
    btnStartPc.focus({preventScroll:true});
  }, 480);
  introTimers.push(timer);
}

function showCinematicScene(index){
  if(!introSequenceActive) return;
  const sceneData = cinematicScenes[index];
  if(!sceneData){ finishCinematicIntro(); return; }
  introKicker.textContent = sceneData.kicker;
  introTitle.textContent = sceneData.title;
  introCopy.textContent = sceneData.copy;
  introCounter.textContent = `SECUENCIA ${String(index + 1).padStart(2, '0')} / ${String(cinematicScenes.length).padStart(2, '0')}`;
  introProgressFill.style.width = `${((index + 1) / cinematicScenes.length) * 100}%`;
  playIntroCue(sceneData.cue);
  if(index < cinematicScenes.length - 1) introTimers.push(setTimeout(()=>showCinematicScene(index + 1), 3600));
  else { introCounter.textContent = 'ARCHIVO LISTO · INICIANDO MENÚ'; introTimers.push(setTimeout(finishCinematicIntro, 3900)); }
}

function startCinematicIntro(){
  if(introSequenceActive) return;
  clearIntroTimers();
  introSequenceActive = true;
  setMenuMusicActive(false);
  introPlayButton.disabled = true; introPlayButton.textContent = 'TRANSMISIÓN EN CURSO...';
  try{ initAudio(); if(ac?.state === 'suspended') ac.resume().catch(()=>{}); }catch{}
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
  initAudio(); setMenuMusicActive(true);
  introPlayButton.disabled = false; introPlayButton.textContent = '▶ REPRODUCIR ARCHIVO';
  btnStartPc.focus({preventScroll:true});
}

introPlayButton?.addEventListener('click', startCinematicIntro);
introSkipButton?.addEventListener('click', skipCinematicIntro);
introReplayButton?.addEventListener('click', ()=>{ startMenu.classList.add('hidden'); setMenuMusicActive(false); resetCinematicIntro(); });

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

function saveGameSettings(){ storageSet(GAME_SETTINGS_KEY, JSON.stringify(gameSettings)); }

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

graphicsQualitySelect?.addEventListener('change', ()=>{ gameSettings.quality = graphicsQualitySelect.value; applyGraphicsQuality(); saveGameSettings(); });
reducedMotionToggle?.addEventListener('change', ()=>{
  gameSettings.reducedMotion = reducedMotionToggle.checked;
  vhsOverlay.classList.toggle('reduced-motion', gameSettings.reducedMotion);
  saveGameSettings();
});
microphoneToggle?.addEventListener('change', async ()=>{
  gameSettings.microphone = microphoneToggle.checked;
  saveGameSettings();
  if(gameSettings.microphone){ if(playing) await initMicrophone(); }
  else stopMicrophone();
});
renderGameSettings();
applyGraphicsQuality();

function saveAudioPrefs(){ storageSet(AUDIO_PREFS_KEY, JSON.stringify(audioPrefs)); }
function renderAudioPrefs(){
  for(const key of Object.keys(audioSliderElements)){
    const slider = audioSliderElements[key], output = audioValueElements[key];
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
  const active = audioPrefs.muted ? 0 : 1, now = ac.currentTime;
  if(musicBus) musicBus.gain.setTargetAtTime((audioPrefs.music / 100) * 0.72 * active, now, 0.08);
  if(ambienceBus) ambienceBus.gain.setTargetAtTime((audioPrefs.ambience / 100) * 0.85 * active, now, 0.08);
  if(effectsBus) effectsBus.gain.setTargetAtTime((audioPrefs.effects / 100) * 0.88 * active, now, 0.08);
  if(audioListener.setMasterVolume) audioListener.setMasterVolume((audioPrefs.effects / 100) * active);
}
for(const [key, slider] of Object.entries(audioSliderElements)){
  slider?.addEventListener('input', ()=>{
    initAudio(); setMenuMusicActive(true);
    audioPrefs[key] = Number(slider.value);
    if(audioValueElements[key]) audioValueElements[key].value = `${audioPrefs[key]}%`;
    saveAudioPrefs(); applyAudioMix();
  });
}
audioMuteButton?.addEventListener('click', ()=>{
  initAudio(); setMenuMusicActive(true);
  audioPrefs.muted = !audioPrefs.muted;
  renderAudioPrefs(); saveAudioPrefs(); applyAudioMix();
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
  firstEncounterShown = true; firstEncounterTimer = 3.1;
  ambientGlitchTimer = Math.max(ambientGlitchTimer, 1.05);
  flashFailTimer = Math.max(flashFailTimer, 0.28);
  sfx('manifestation');
  ctrls.forEach(controller=>pulse(controller, 0.35, 110));
  if(renderer.xr.isPresenting || mobileVrActive){
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
  ctx.fillStyle = 'rgba(5, 5, 9, 0.96)'; ctx.fillRect(28, 28, 968, 712);
  ctx.strokeStyle = '#b3001b'; ctx.lineWidth = 18; ctx.strokeRect(28, 28, 968, 712);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ff1e38'; ctx.font = 'bold 48px monospace';
  ctx.fillText('SEÑAL INTERRUMPIDA • VHS-1994', 512, 115);
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 68px monospace';
  ctx.fillText('PARTIDA EN PAUSA', 512, 220);

  pauseOptionNames.forEach((label, index)=>{
    const y = 330 + index * 112;
    const selected = index === pauseSelection;
    ctx.fillStyle = selected ? '#b3001b' : '#17171f';
    ctx.fillRect(170, y - 38, 684, 76);
    ctx.strokeStyle = selected ? '#ffec27' : '#555566';
    ctx.lineWidth = selected ? 7 : 3; ctx.strokeRect(170, y - 38, 684, 76);
    ctx.fillStyle = selected ? '#ffffff' : '#b8b8c5';
    ctx.font = selected ? 'bold 38px monospace' : '34px monospace';
    ctx.fillText(`${selected ? '▶  ' : ''}${label}`, 512, y);
  });
  pauseMenuTexture.needsUpdate = true;
}

function updatePauseSelection(nextIndex){
  pauseSelection = (nextIndex + pauseOptionNames.length) % pauseOptionNames.length;
  pauseOptionButtons.forEach((button, index)=>button.classList.toggle('active', index === pauseSelection));
  if(renderer.xr.isPresenting) drawVRPauseMenu();
}

function hidePauseUI(){
  pauseScreen.classList.add('hidden');
  pauseMenu3D.visible = false;
}

function openPauseMenu(){
  if(!playing || paused || pendingDefeatReason) return;
  paused = true;
  stopScreamerSound();
  screamerTimer = 0; screamMat.opacity = 0;
  setRainActive(false);
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
  paused = false; setRainActive(true); hidePauseUI();
}

function restartFromPause(){
  if(!playing || !paused) return;
  resetGame();
  playing = true; paused = false;
  setMenuMusicActive(false); setRainActive(true); hidePauseUI();
  startMenu.classList.add('hidden'); endScreen.classList.add('hidden'); hudOverlay.classList.remove('hidden');
}

function returnToMainMenuFromPause(){
  if(!playing || !paused) return;
  hidePauseUI(); setRainActive(false);
  if(mobileVrActive) exitMobileVR();
  if(renderer.xr.isPresenting){
    const session = renderer.xr.getSession();
    if(session) session.end();
    return;
  }
  playing = false; paused = false;
  stopMicrophone(); resetGame(); loadRecords();
  hudOverlay.classList.add('hidden'); endScreen.classList.add('hidden'); touchHudEl?.classList.add('hidden');
  startMenu.classList.remove('hidden');
  setMenuMusicActive(true);
}

function activatePauseSelection(){
  if(!paused || !playing) return;
  if(pauseSelection === 0) resumeFromPause();
  else if(pauseSelection === 1) restartFromPause();
  else returnToMainMenuFromPause();
}

function restartFromGameOver(){
  gameOverActive = false; gameOverPanel3D.visible = false;
  resetGame();
  playing = true; paused = false;
  setMenuMusicActive(false); setRainActive(true); hidePauseUI();
  startMenu.classList.add('hidden'); endScreen.classList.add('hidden'); hudOverlay.classList.remove('hidden');
  initAudio();
}

function exitGameOverToMenu(){
  gameOverActive = false; gameOverPanel3D.visible = false; setRainActive(false);
  if(mobileVrActive) exitMobileVR();
  const session = renderer.xr.getSession();
  if(session) session.end();
  else {
    resetGame(); loadRecords();
    touchHudEl?.classList.add('hidden');
    startMenu.classList.remove('hidden'); endScreen.classList.add('hidden');
    setMenuMusicActive(true);
  }
}

function handleVRGameOverAction(action){
  if(!gameOverActive) return;
  if(action === 'retry') restartFromGameOver();
  else exitGameOverToMenu();
}

function togglePause(){
  if(!playing || pendingDefeatReason) return;
  if(paused) resumeFromPause();
  else openPauseMenu();
}

pauseOptionButtons.forEach(button=>{
  button.addEventListener('mouseenter', ()=>updatePauseSelection(pauseOptionButtons.indexOf(button)));
  button.addEventListener('click', ()=>{ updatePauseSelection(pauseOptionButtons.indexOf(button)); activatePauseSelection(); });
});

diffBtns.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    initAudio(); setMenuMusicActive(true);
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

function startGameFromMenu(keepMobileVr = false){
  if(!keepMobileVr){
    mobileVrActive = false;
    document.getElementById('btn-exit-mobile-vr')?.classList.add('hidden');
    enterMobileFullscreen();
  }
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
  if(isMobileDevice() && !mobileVrActive) touchHudEl?.classList.remove('hidden');
  setMenuMusicActive(false);
  setRainActive(true);
}

btnStartPc.addEventListener('click', ()=>startGameFromMenu(false));
audioPreviewButton?.addEventListener('click', async ()=>{
  initAudio(); setMenuMusicActive(true);
  if(ac?.state === 'suspended') await ac.resume();
  musicTone(146.83, 1.05, 'triangle', 0.075, -0.15);
  musicTone(174.61, 1.25, 'sine', 0.045, 0.12, 0.32);
  musicTone(155.56, 1.4, 'triangle', 0.055, 0, 0.78);
  tone(392, 0.5, 'sine', 0.035, 0.72, 0.85, 0.35);
});
document.getElementById('btn-end-restart')?.addEventListener('click', ()=>{
  gameOverActive = false; gameOverPanel3D.visible = false;
  startGameFromMenu(mobileVrActive);
});
btnRetry.addEventListener('click', ()=>{
  gameOverActive = false; gameOverPanel3D.visible = false;
  if(mobileVrActive) exitMobileVR();
  resetGame(); loadRecords(); hidePauseUI();
  endScreen.classList.add('hidden'); hudOverlay.classList.add('hidden'); touchHudEl?.classList.add('hidden');
  startMenu.classList.remove('hidden');
  setMenuMusicActive(true); setRainActive(false);
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
  const timeBonus = won ? Math.max(0, Math.round(timeLeft * 1.8)) : Math.min(90, Math.round(elapsed * 0.3));
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
  pendingDefeatReason = null;
  stopScreamerSound();
  screamerTimer = 0; screamMat.opacity = 0;
  setMenuMusicActive(false); setRainActive(false);
  hidePauseUI(); hideFirstEncounter();
  vrPromptSprite.visible = false;
  hudOverlay.classList.add('hidden');
  touchHudEl?.classList.add('hidden');
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
  } else bestScore = previousBestScore;

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
  } else {
    if(mobileVrActive) exitMobileVR();
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
  stopScreamerSound();
  pendingDefeatReason = null;
  paused = false; gameOverActive = false; screamerTimer = 0; nearScreamCooldown = 0;
  nextTpTimer = rand(5.5,9.5) / diffMultiplier;
  firstEncounterShown = false; firstEncounterTimer = 0;
  gameOverPanel3D.visible = false; vrPromptSprite.visible = false;
  hideFirstEncounter();
  flashFailTimer = 0; stealthTimer = 0; invertControlsTimer = 0; breathTimer = 0;
  forestEventTimer = rand(15,22) / diffMultiplier; ambientGlitchTimer = 0; ambientApparitionTimer = 0;
  lastVhsSecond = -1;
  resetPageCollectionUI();

  scene.fog.density = nightmare ? 0.072 : baseFogDensity;
  flashlight.distance = nightmare ? 24 : 36;
  paintSky(nightmare); resetParticles(nightmare); clearFootprints(); updateVhsEffect(0);
  phantomSlender.visible = false; screamMat.opacity = 0;
  spawnPages(); spawnBatteries(); updatePageSignalUI();
  slender.position.set(0,0, nightmare ? -18 : -26);
  dolly.position.set(0,0,6);
  drawPanel();
}
resetGame();

/* ================= Audio Terror, Música y Audio Espacial 3D ================= */
let ac, master, musicBus, ambienceBus, effectsBus, noiseBuffer, slenderPosAudio, whisperPosAudio, flashBuzzGain;
const customSfx = { trueno: null, lluvia: null, musica: null, pasos: null, screamer: null };
let rainLoopSource = null, rainLoopGain = null, musicLoopSource = null, menuMusicGain = null, activeScreamerSource = null;
let lastStepSfxTime = 0;

function stopScreamerSound(){
  if(activeScreamerSource){
    try{ activeScreamerSource.stop(); activeScreamerSource.disconnect(); }catch{}
    activeScreamerSource = null;
  }
}

function setRainActive(active){
  if(!ac) return;
  if(customSfx.lluvia && !rainLoopSource){
    rainLoopSource = ac.createBufferSource();
    rainLoopSource.buffer = customSfx.lluvia;
    rainLoopSource.loop = true;
    rainLoopGain = ac.createGain();
    rainLoopGain.gain.value = active ? 0.85 : 0.0;
    rainLoopSource.connect(rainLoopGain).connect(ambienceBus);
    rainLoopSource.start();
    return;
  }
  if(rainLoopGain){
    const now = ac.currentTime;
    rainLoopGain.gain.cancelScheduledValues(now);
    rainLoopGain.gain.setTargetAtTime(active ? 0.85 : 0.0, now, 0.25);
  }
}

function isMainMenuVisible(){
  return Boolean(startMenu && !startMenu.classList.contains('hidden') && !playing && !gameOverActive && !introSequenceActive && !renderer.xr.isPresenting);
}

function setMenuMusicActive(active){
  if(!ac || !menuMusicGain) return;
  const shouldPlay = active && isMainMenuVisible();
  const now = ac.currentTime;
  menuMusicGain.gain.cancelScheduledValues(now);
  menuMusicGain.gain.setTargetAtTime(shouldPlay ? 0.55 : 0.0, now, 0.2);
}

async function loadCustomAudioBuffers(){
  if(!ac) return;
  const files = {
    trueno: './assets/audio/trueno.mp3',
    lluvia: './assets/audio/lluvia.mp3',
    musica: './assets/audio/musica.mp3',
    pasos: './assets/audio/pasos.mp3',
    screamer: './assets/audio/screamer.mp3'
  };
  await Promise.all(Object.entries(files).map(async ([key, url])=>{
    try{
      const res = await fetch(url);
      if(!res.ok) return;
      const arr = await res.arrayBuffer();
      customSfx[key] = await ac.decodeAudioData(arr);
    }catch{}
  }));
  startAudioLoops();
}

function startAudioLoops(){
  if(!ac) return;
  if(ac.state === 'suspended') ac.resume().catch(()=>{});
  setRainActive(playing && !paused);
  if(customSfx.musica && !musicLoopSource){
    musicLoopSource = ac.createBufferSource();
    musicLoopSource.buffer = customSfx.musica;
    musicLoopSource.loop = true;
    menuMusicGain = ac.createGain();
    menuMusicGain.gain.value = isMainMenuVisible() ? 0.55 : 0.0;
    musicLoopSource.connect(menuMusicGain).connect(musicBus);
    musicLoopSource.start();
  }
}

function playCustomBuffer(buffer, bus, volume=0.8, playbackRate=1.0, offset=0, duration=null){
  if(!ac || !buffer) return false;
  if(ac.state === 'suspended') ac.resume();
  const src = ac.createBufferSource();
  src.buffer = buffer; src.playbackRate.value = playbackRate;
  const g = ac.createGain(); g.gain.value = volume;
  src.connect(g).connect(bus || effectsBus);
  if(duration !== null) src.start(0, offset, duration);
  else src.start(0, offset);
  return true;
}

function initAudio(){
  if(ac){
    if(ac.state === 'suspended') ac.resume();
    applyAudioMix();
    return;
  }
  ac = new (window.AudioContext||window.webkitAudioContext)();
  master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
  musicBus = ac.createGain(); ambienceBus = ac.createGain(); effectsBus = ac.createGain();
  musicBus.connect(master); ambienceBus.connect(master); effectsBus.connect(master);
  applyAudioMix();
  loadCustomAudioBuffers();

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
  posOsc.type = 'sawtooth'; posOsc.frequency.value = 52; posGain.gain.value = 0.25;
  posOsc.connect(posGain);
  slenderPosAudio.setNodeSource(posOsc);
  slenderPosAudio.setRefDistance(3); slenderPosAudio.setMaxDistance(28); slenderPosAudio.setRolloffFactor(1.6);
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
  radioPosAudio.setRefDistance(2.5); radioPosAudio.setMaxDistance(13);
  oldRadio.add(radioPosAudio);
  radOscA.start(); radOscB.start();

  const flashBuzzOsc = ac.createOscillator();
  flashBuzzOsc.type = 'sine'; flashBuzzOsc.frequency.value = 120;
  flashBuzzGain = ac.createGain(); flashBuzzGain.gain.value = 0;
  flashBuzzOsc.connect(flashBuzzGain).connect(effectsBus);
  flashBuzzOsc.start();

  const windOsc = ac.createOscillator();
  const windFilter = ac.createBiquadFilter();
  const windGain = ac.createGain();
  windOsc.type = 'triangle'; windOsc.frequency.value = 72;
  windFilter.type = 'lowpass'; windFilter.frequency.value = 230; windFilter.Q.value = 0.45;
  windGain.gain.value = 0.024;
  windOsc.connect(windFilter).connect(windGain).connect(ambienceBus);
  windOsc.start();

  setInterval(()=>{
    if(!ac || ac.state !== 'running') return;
    const now = ac.currentTime;
    const isMenu = !playing && !gameOverActive;
    const targetWind = isMenu ? 0.026 : 0.016 + pagesFound * 0.004;
    windGain.gain.setTargetAtTime(targetWind, now, 1.4);
    windOsc.frequency.setTargetAtTime(64 + Math.random() * 24 + pagesFound * 2.5, now, 1.6);
  }, 2400);

  let musicStep = 0;
  const menuBass = [73.42, 73.42, 65.41, 69.30, 73.42, 61.74, 58.27, 65.41];
  const menuMotif = [293.66, 329.63, 349.23, 329.63, 293.66, 261.63, 277.18, 220.00];
  const exploreBass = [73.42, 87.31, 65.41, 82.41, 73.42, 69.30, 58.27, 65.41];
  const huntBass = [55.00, 58.27, 51.91, 65.41, 55.00, 61.74, 49.00, 58.27];

  setInterval(()=>{
    if(!ac || ac.state !== 'running' || paused) return;
    const step = musicStep % 8;
    const inMenu = !playing && !gameOverActive;
    if(inMenu){
      if(customSfx.musica) return;
      const bassFreq = menuBass[step];
      musicTone(bassFreq, 1.35, 'sine', 0.055, -0.08);
      if(step % 2 === 0){
        const lead = menuMotif[step];
        musicTone(lead, 1.15, 'triangle', 0.045, step % 4 === 0 ? -0.18 : 0.18, 0.06);
        musicTone(lead * 1.5, 1.35, 'sine', 0.016, 0, 0.24);
      }
      if(step === 3 || step === 7) musicTone(440.00, 0.9, 'sine', 0.018, 0.12, 0.35);
    } else if(playing){
      camera.getWorldPosition(head);
      const dist = head.distanceTo(slender.position);
      const danger = Math.min(1, Math.max((26 - dist) / 22, (62 - sanity) / 62, pagesFound / TOTAL_PAGES));
      const bassFreq = (danger > 0.56 || isNightmare() ? huntBass : exploreBass)[step];
      musicTone(bassFreq, 1.15, 'sine', 0.036 + danger * 0.038, -0.05);
      if(step % 2 === 0){
        const padFreq = bassFreq * (danger > 0.56 ? 3.17 : 3);
        musicTone(padFreq, 1.0, 'triangle', 0.018 + danger * 0.02, step % 4 === 0 ? -0.2 : 0.2, 0.08);
      }
    }
    musicStep++;
  }, 900);

  setInterval(()=>{
    if(!playing || paused || !ac || ac.state !== 'running') return;
    camera.getWorldPosition(head);
    const dist = head.distanceTo(slender.position);
    const danger = Math.max(0, (30 - dist) / 30, (65 - sanity) / 65);
    if(danger > 0.1){
      const vol = 0.04 + danger * 0.16;
      tone(58, 0.12, 'sine', vol, 0.72);
      setTimeout(()=>tone(46, 0.16, 'sine', vol * 0.85, 0.68), 160);
    }
  }, 950);
}

function musicTone(f, d, type='sine', v=0.05, pan=0, delay=0){
  if(!ac || !musicBus) return;
  const start = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, start);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(v, start + Math.min(0.14, d * 0.25));
  g.gain.exponentialRampToValueAtTime(0.0001, start + d);
  let node = o;
  if(ac.createStereoPanner){
    const panner = ac.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), start);
    node.connect(panner); node = panner;
  }
  node.connect(g).connect(musicBus);
  o.start(start); o.stop(start + d + 0.03);
}

function tone(f, d, type='triangle', v=.15, drop=.8, pan=0, delay=0){
  if(!ac || !effectsBus) return;
  const start = ac.currentTime + delay;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.setValueAtTime(f, start);
  o.frequency.exponentialRampToValueAtTime(Math.max(22, f*drop), start+d);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(v, start + Math.min(0.03, d * 0.2));
  g.gain.exponentialRampToValueAtTime(.0001, start+d);
  let node = o;
  if(ac.createStereoPanner){
    const panner = ac.createStereoPanner();
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), start);
    node.connect(panner); node = panner;
  }
  node.connect(g).connect(effectsBus);
  o.start(start); o.stop(start+d+0.02);
}

function playOriginalSlenderScreamerSound(){
  if(!ac) return;
  stopScreamerSound();
  if(customSfx.screamer){
    if(ac.state === 'suspended') ac.resume();
    const src = ac.createBufferSource();
    src.buffer = customSfx.screamer;
    const g = ac.createGain(); g.gain.value = 1.0;
    src.connect(g).connect(effectsBus);
    const startOffset = customSfx.screamer.duration > 3.0 ? 0.25 : 0;
    src.start(0, startOffset, 1.1);
    activeScreamerSource = src;
    src.onended = ()=>{ if(activeScreamerSource === src) activeScreamerSource = null; };
    return;
  }
  if(!noiseBuffer) return;
  const now = ac.currentTime;
  const staticSrc = ac.createBufferSource();
  staticSrc.buffer = noiseBuffer;
  const staticFilter = ac.createBiquadFilter();
  staticFilter.type = 'lowpass'; staticFilter.frequency.setValueAtTime(1250, now); staticFilter.Q.value = 0.65;
  const staticGain = ac.createGain();
  staticGain.gain.setValueAtTime(0.16, now);
  staticGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
  staticSrc.connect(staticFilter).connect(staticGain).connect(effectsBus);
  staticSrc.start(now); staticSrc.stop(now + 0.95);
  [55.0, 58.27, 82.41, 116.54, 233.08].forEach(freq=>tone(freq, 0.72, 'sawtooth', 0.15, 0.78, 0));
}

function sfx(n){
  initAudio();
  if(n==='page'){ tone(440,.11,'triangle',.16,1.15); setTimeout(()=>tone(659.25,.18,'triangle',.14,1.1),85); setTimeout(()=>tone(880,.28,'sine',.10,1.02),165); }
  if(n==='battery'){ tone(392,.09,'sine',.14,1.18); setTimeout(()=>tone(587.33,.16,'triangle',.13,1.12),75); }
  if(n==='click') tone(520,.035,'triangle',.09,0.72);
  if(n==='bats') for(let i=0;i<5;i++) setTimeout(()=>tone(360 + Math.random()*160, .06, 'sine', .06, 0.68, (Math.random()-0.5)*1.2), i*55);
  if(n==='step'){
    if(customSfx.pasos){
      const now = ac.currentTime;
      if(now - lastStepSfxTime > 0.28){
        lastStepSfxTime = now;
        const rate = rand(0.92, 1.12);
        const offset = Math.random() * Math.max(0, customSfx.pasos.duration - 0.5);
        playCustomBuffer(customSfx.pasos, effectsBus, 0.45, rate, offset, 0.35);
      }
      return;
    }
    tone(115 + Math.random()*28, .05, 'sine', .045, 0.62, (Math.random()-0.5)*0.3);
  }
  if(n==='thunder'){
    if(customSfx.trueno){ playCustomBuffer(customSfx.trueno, ambienceBus, 0.95, rand(0.95, 1.05)); return; }
    tone(74, 0.95, 'triangle', 0.18, 0.42, -0.15);
    setTimeout(()=>tone(56, 1.35, 'sine', 0.14, 0.45, 0.25), 220);
  }
  if(n==='breath') tone(145, 0.35, 'sine', 0.04, 0.85, 0);
  if(n==='signal'){ tone(196, 0.34, 'triangle', 0.075, 0.94, -0.2); setTimeout(()=>tone(293.66, 0.42, 'sine', 0.055, 0.98, 0.2), 140); }
  if(n==='distantFootsteps') [0, 320, 650, 990].forEach((delay, idx)=>setTimeout(()=>tone(84 + idx*4, 0.14, 'sine', 0.09 - idx*0.01, 0.65, idx%2===0 ? -0.35 : 0.35), delay));
  if(n==='whisperCue'){ tone(146.83, 0.9, 'sine', 0.055, 0.96, -0.5); setTimeout(()=>tone(155.56, 1.1, 'triangle', 0.05, 0.92, 0.5), 160); }
  if(n==='screamer') playOriginalSlenderScreamerSound();
  if(n==='branchSnap'){ const pan = Math.random() > 0.5 ? 0.72 : -0.72; tone(240, 0.055, 'triangle', 0.11, 0.36, pan); setTimeout(()=>tone(150, 0.09, 'sine', 0.09, 0.48, pan), 48); }
  if(n==='crowCall'){ const pan = Math.random() > 0.5 ? -0.68 : 0.68; tone(440, 0.16, 'triangle', 0.075, 0.72, pan); setTimeout(()=>tone(392, 0.19, 'triangle', 0.065, 0.68, pan), 195); }
  if(n==='manifestation'){ tone(73.42, 0.95, 'sine', 0.095, 0.82, -0.25); tone(110.00, 0.95, 'triangle', 0.07, 0.88, 0.25); }
  if(n==='win') [293.66,349.23,440,587.33].forEach((f,i)=>setTimeout(()=>tone(f,.42,'triangle',.13,1.03),i*135));
  if(n==='lose'){ stopScreamerSound(); tone(55, 0.45, 'sawtooth', 0.22, 0.4, 0); }
}

function triggerDeathScreamer(reasonText){
  if(pendingDefeatReason || gameOverActive) return;
  pendingDefeatReason = reasonText;
  screamerTimer = 1.15;
  updateScreamerPlane(0.016, 1.0, true);
  sfx('screamer');
  ctrls.forEach(c => pulse(c, 1.0, 450));
}

/* ================= Controles VR, PC, Móvil y Cardboard ================= */
const ctrls = [0,1].map(i=>{
  const c = renderer.xr.getController(i);
  const g = new THREE.Group();
  const h = new THREE.Mesh(new THREE.BoxGeometry(.035,.035,.12), new THREE.MeshLambertMaterial({color:0x22222b}));
  g.add(h);
  if(i===0) g.add(panel);
  c.add(g);
  dolly.add(c);
  return c;
});

function pulse(c, v=.5, d=50){ c?.gamepad?.hapticActuators?.[0]?.pulse?.(v,d); }

function toggleFlashlight(){
  if(!playing || paused || pendingDefeatReason) return;
  if(battery <= 0){ sfx('click'); return; }
  flashlightOn = !flashlightOn;
  sfx('click');
}

function tryInteract(){
  if(!playing || paused || pendingDefeatReason) return;
  camera.getWorldPosition(head);

  for(let i = pages.length - 1; i >= 0; i--){
    if(pages[i].m.position.distanceTo(head) < 3.0){
      const collectedTxt = pages[i].txt;
      scene.remove(pages[i].m);
      pages.splice(i, 1);
      pagesFound++;
      sanity = Math.min(100, sanity + 14);
      sfx('page');
      ctrls.forEach(c=>pulse(c, .8, 120));
      showCollectedPage(collectedTxt, pagesFound);
      updatePageSignalUI();

      if(pagesFound >= TOTAL_PAGES){
        sfx('win');
        finishGame(true, 'ESCAPASTE DEL BOSQUE');
      } else {
        nextTpTimer = 1.6;
        if(pagesFound === 5 && !isNightmare()){
          paintSky(true); resetParticles(true);
          scene.fog.density = 0.068; lightningFlash = 0.45;
          sfx('thunder');
        }
      }
      return;
    }
  }

  for(let i = batteries.length - 1; i >= 0; i--){
    if(batteries[i].m.position.distanceTo(head) < 2.8){
      scene.remove(batteries[i].m);
      batteries.splice(i, 1);
      battery = Math.min(100, battery + (isNightmare() ? 35 : 50));
      sfx('battery');
      ctrls.forEach(c=>pulse(c, .5, 80));
      return;
    }
  }
}

ctrls[0].addEventListener('selectstart', ()=>{
  if(gameOverActive){ handleVRGameOverAction('retry'); return; }
  if(!playing) return;
  if(paused){ activatePauseSelection(); return; }
  togglePause();
});
ctrls[1].addEventListener('selectstart', ()=>{
  if(gameOverActive){ handleVRGameOverAction('retry'); return; }
  if(!playing) return;
  if(paused){ activatePauseSelection(); return; }
  tryInteract();
});
ctrls[1].addEventListener('squeezestart', ()=>{
  if(!playing || paused || pendingDefeatReason) return;
  toggleFlashlight();
});

const prevButtons = {0: [], 1: []};
let vrPauseStickReady = true;
function handleXRButtons(){
  const session = renderer.xr.getSession();
  if(!session) return;

  for(const src of session.inputSources){
    if(!src.gamepad) continue;
    const h = src.handedness === 'left' ? 0 : (src.handedness === 'right' ? 1 : -1);
    if(h === -1) continue;
    const btns = src.gamepad.buttons, axes = src.gamepad.axes, prev = prevButtons[h];

    if(gameOverActive){
      if(btns[4]?.pressed && !prev[4]) handleVRGameOverAction('retry');
      if(btns[5]?.pressed && !prev[5]) handleVRGameOverAction('menu');
      for(let b=0; b<btns.length; b++) prev[b] = Boolean(btns[b]?.pressed);
      continue;
    }
    if(h === 0 && btns[3]?.pressed && !prev[3]) togglePause();
    if(paused){
      const stickY = axes[3] ?? axes[1] ?? 0;
      if(Math.abs(stickY) > 0.55){
        if(vrPauseStickReady){ updatePauseSelection(pauseSelection + (stickY > 0 ? 1 : -1)); vrPauseStickReady = false; }
      } else vrPauseStickReady = true;
      if(btns[4]?.pressed && !prev[4]) activatePauseSelection();
      if(btns[5]?.pressed && !prev[5]) resumeFromPause();
      for(let b=0; b<btns.length; b++) prev[b] = Boolean(btns[b]?.pressed);
      continue;
    }
    if(h === 1 && btns[4]?.pressed && !prev[4]) tryInteract();
    if(h === 1 && btns[5]?.pressed && !prev[5]) toggleFlashlight();
    if(h === 0 && btns[4]?.pressed && !prev[4]) togglePause();
    for(let b=0; b<btns.length; b++) prev[b] = Boolean(btns[b]?.pressed);
  }
}

renderer.xr.addEventListener('sessionstart', ()=>{
  if(mobileVrActive) exitMobileVR();
  initAudio(); initMicrophone(); resetGame();
  playing = true; paused = false;
  setMenuMusicActive(false); setRainActive(true); hidePauseUI();
  startMenu.classList.add('hidden'); endScreen.classList.add('hidden'); hudOverlay.classList.add('hidden'); touchHudEl?.classList.add('hidden');
  flashRig.position.set(0.02, -0.02, -0.06);
  ctrls[1].add(flashRig);
});

renderer.xr.addEventListener('sessionend', ()=>{
  playing = false; paused = false; gameOverActive = false; pendingDefeatReason = null;
  stopScreamerSound(); setRainActive(false);
  gameOverPanel3D.visible = false; vrPromptSprite.visible = false;
  hidePauseUI(); hideFirstEncounter(); stopMicrophone();
  flashRig.position.set(0.24, -0.22, -0.32);
  camera.add(flashRig);
  loadRecords();
  hudOverlay.classList.add('hidden'); endScreen.classList.add('hidden'); startMenu.classList.remove('hidden');
  setMenuMusicActive(true);
});

const keys = {}; let yaw = 0, pitch = 0, lastTouch = null;
const touchState = {moveId: null, lookId: null, startX: 0, startY: 0, x: 0, y: 0, lastLookX: 0, lastLookY: 0};
const touchHudEl = document.getElementById('touch-hud');
const touchJoystickEl = document.getElementById('touch-joystick');
const touchKnobEl = document.getElementById('touch-joystick-knob');
const btnTouchInteract = document.getElementById('btn-touch-interact');
const btnTouchFlash = document.getElementById('btn-touch-flash');
const btnTouchSprint = document.getElementById('btn-touch-sprint');
const btnTouchPause = document.getElementById('btn-touch-pause');
const btnHudPause = document.getElementById('btn-hud-pause');
const btnHudFlash = document.getElementById('btn-hud-flash');
let touchSprintActive = false;

function updateTouchKnob(dx, dy){
  if(touchKnobEl) touchKnobEl.style.transform = `translate(${dx * 30}px, ${dy * 30}px)`;
}

touchJoystickEl?.addEventListener('pointerdown', (e)=>{
  if(touchState.moveId !== null) return;
  touchState.moveId = e.pointerId;
  touchState.startX = e.clientX;
  touchState.startY = e.clientY;
  touchJoystickEl.setPointerCapture?.(e.pointerId);
});

touchJoystickEl?.addEventListener('pointermove', (e)=>{
  if(e.pointerId !== touchState.moveId) return;
  const maxR = 44;
  const rawX = e.clientX - touchState.startX;
  const rawY = e.clientY - touchState.startY;
  const dist = Math.hypot(rawX, rawY) || 1;
  const clamped = Math.min(maxR, dist);
  touchState.x = (rawX / dist) * (clamped / maxR);
  touchState.y = (rawY / dist) * (clamped / maxR);
  updateTouchKnob(touchState.x, touchState.y);
});

function releaseTouchJoystick(e){
  if(e.pointerId !== touchState.moveId) return;
  touchState.moveId = null; touchState.x = 0; touchState.y = 0;
  updateTouchKnob(0, 0);
}
touchJoystickEl?.addEventListener('pointerup', releaseTouchJoystick);
touchJoystickEl?.addEventListener('pointercancel', releaseTouchJoystick);

btnTouchInteract?.addEventListener('click', ()=>{ if(playing && !paused) tryInteract(); });
btnTouchFlash?.addEventListener('click', ()=>{ if(playing && !paused) toggleFlashlight(); });
btnHudFlash?.addEventListener('click', ()=>{ if(playing && !paused) toggleFlashlight(); });
btnHudPause?.addEventListener('click', ()=>{ if(playing) togglePause(); });
btnTouchPause?.addEventListener('click', ()=>{ if(playing) togglePause(); });
btnTouchSprint?.addEventListener('pointerdown', ()=>{ touchSprintActive = true; btnTouchSprint.classList.add('active'); });
['pointerup','pointercancel','pointerleave'].forEach(ev=>{
  btnTouchSprint?.addEventListener(ev, ()=>{ touchSprintActive = false; btnTouchSprint.classList.remove('active'); });
});

// Botón único de Google Cardboard / toque en pantalla en Móvil VR
let cardBoardWalkPressed = false, cardBoardTapTime = 0;
renderer.domElement.addEventListener('pointerdown', ()=>{
  if(!mobileVrActive || !playing || paused) return;
  cardBoardWalkPressed = true;
  cardBoardTapTime = performance.now();
});
renderer.domElement.addEventListener('pointerup', ()=>{
  if(!mobileVrActive) return;
  cardBoardWalkPressed = false;
  if(performance.now() - cardBoardTapTime < 260) tryInteract();
});

window.addEventListener('keydown', e=>{
  if(introSequenceActive){
    if(e.code === 'Escape' || e.code === 'Space' || e.code === 'Enter'){ e.preventDefault(); skipCinematicIntro(); }
    return;
  }
  if(e.code === 'Escape' || e.code === 'KeyP'){
    if(playing){ e.preventDefault(); togglePause(); }
    return;
  }
  if(paused){
    if(e.code === 'ArrowUp' || e.code === 'KeyW'){ e.preventDefault(); updatePauseSelection(pauseSelection - 1); }
    else if(e.code === 'ArrowDown' || e.code === 'KeyS'){ e.preventDefault(); updatePauseSelection(pauseSelection + 1); }
    else if(e.code === 'Enter' || e.code === 'Space' || e.code === 'KeyE'){ e.preventDefault(); activatePauseSelection(); }
    return;
  }
  keys[e.code]=true;
  if(e.code==='KeyE' || e.code==='Space') tryInteract();
  if(e.code==='KeyF') toggleFlashlight();
  if(e.code==='KeyR' && !playing && !endScreen.classList.contains('hidden')) startGameFromMenu(mobileVrActive);
});
window.addEventListener('keyup', e=>keys[e.code]=false);

renderer.domElement.addEventListener('click', ()=>{
  if(playing && !paused && !renderer.xr.isPresenting && !isMobileDevice()) renderer.domElement.requestPointerLock?.();
});
window.addEventListener('mousemove', e=>{
  if(!playing || paused || pendingDefeatReason || mobileVrActive) return;
  if(document.pointerLockElement===renderer.domElement){
    yaw -= e.movementX*.0024;
    pitch = Math.max(-1.2, Math.min(1.2, pitch - e.movementY*.0024));
  }
});
renderer.domElement.addEventListener('touchstart', e=>{
  if(!playing || paused || pendingDefeatReason || mobileVrActive) return;
  for(const t of e.changedTouches){
    if(touchState.lookId === null && t.clientX > window.innerWidth * 0.34){
      touchState.lookId = t.pointerId ?? t.identifier;
      touchState.lastLookX = t.clientX;
      touchState.lastLookY = t.clientY;
    }
  }
  lastTouch = e.touches[0];
}, {passive:true});
renderer.domElement.addEventListener('touchmove', e=>{
  if(!playing || paused || pendingDefeatReason || mobileVrActive) return;
  for(const t of e.changedTouches){
    const id = t.pointerId ?? t.identifier;
    if(id === touchState.lookId){
      yaw -= (t.clientX - touchState.lastLookX) * 0.0046;
      pitch = Math.max(-1.2, Math.min(1.2, pitch - (t.clientY - touchState.lastLookY) * 0.0042));
      touchState.lastLookX = t.clientX;
      touchState.lastLookY = t.clientY;
      return;
    }
  }
  if(!lastTouch || touchState.lookId !== null) return;
  const t = e.touches[0];
  yaw -= (t.clientX-lastTouch.clientX)*.004;
  pitch = Math.max(-1.2, Math.min(1.2, pitch - (t.clientY-lastTouch.clientY)*.004));
  lastTouch = t;
}, {passive:true});
renderer.domElement.addEventListener('touchend', e=>{
  for(const t of e.changedTouches){
    const id = t.pointerId ?? t.identifier;
    if(id === touchState.lookId) touchState.lookId = null;
  }
  if(e.touches.length === 0) lastTouch = null;
}, {passive:true});

/* ================= Movimiento y Colisiones ================= */
const fwd = new THREE.Vector3(), right = new THREE.Vector3(), head = new THREE.Vector3(), look = new THREE.Vector3();

function updateZoneName(x, z){
  if(Math.hypot(x - cemCenter.x, z - cemCenter.z) < 20) currentZone = 'CEMENTERIO ANTIGUO';
  else if(Math.hypot(x - ruinCenter.x, z - ruinCenter.z) < 15) currentZone = 'CABAÑA EN RUINAS';
  else if(Math.hypot(x - ritualCenter.x, z - ritualCenter.z) < 16) currentZone = 'ALTAR DE MONOLITOS';
  else currentZone = 'BOSQUE OSCURO';
}

function updateMove(dt){
  if(!renderer.xr.isPresenting){
    if(mobileVrActive){
      updateGyroCamera();
    } else {
      camera.rotation.order='YXZ';
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;
    }
  }

  let mx = 0, mz = 0, wantsSprint = false;
  if(renderer.xr.isPresenting){
    const s = renderer.xr.getSession();
    if(s) for(const src of s.inputSources){
      if(!src.gamepad) continue;
      if(src.handedness==='left'){
        mx = src.gamepad.axes[2]||0;
        mz = src.gamepad.axes[3]||0;
        if(src.gamepad.buttons[3]?.pressed) wantsSprint = true;
      }
      if(src.handedness==='right' && Math.abs(src.gamepad.axes[2]||0)>.25){
        dolly.rotation.y -= src.gamepad.axes[2]*1.9*dt;
      }
    }
  } else {
    mx = (keys.KeyD||keys.ArrowRight?1:0) - (keys.KeyA||keys.ArrowLeft?1:0) + touchState.x;
    mz = (keys.KeyS||keys.ArrowDown?1:0) - (keys.KeyW||keys.ArrowUp?1:0) + touchState.y;
    if(mobileVrActive && cardBoardWalkPressed) mz = -1;
    if(keys.ShiftLeft || keys.ShiftRight || touchSprintActive) wantsSprint = true;
  }

  if(invertControlsTimer > 0){
    invertControlsTimer -= dt;
    mx = -mx; mz = -mz;
  }

  const isMoving = (Math.abs(mx) > 0.1 || Math.abs(mz) > 0.1);
  let speed = WALK_SPEED;

  if(wantsSprint && isMoving && !exhausted && stamina > 0){
    speed = SPRINT_SPEED;
    stamina = Math.max(0, stamina - (isNightmare() ? 22 : 16) * dt);
    if(stamina === 0) exhausted = true;
  } else {
    const regenRate = isMoving ? 10 : 20;
    stamina = Math.min(100, stamina + regenRate * dt);
    if(exhausted && stamina >= 30) exhausted = false;
  }

  if(stamina < 35){
    breathTimer -= dt;
    if(breathTimer <= 0){ sfx('breath'); breathTimer = 1.6; }
  }

  if(isMoving){
    camera.getWorldDirection(fwd); fwd.y=0; fwd.normalize();
    right.crossVectors(fwd, THREE.Object3D.DEFAULT_UP).normalize();
    const moveVec = new THREE.Vector3()
      .addScaledVector(right, mx)
      .addScaledVector(fwd, -mz)
      .clampLength(0, 1)
      .multiplyScalar(speed * dt);

    const nx = dolly.position.x + moveVec.x;
    const nz = dolly.position.z + moveVec.z;
    if(Math.hypot(nx, nz) < MAP_R - 1.5){
      dolly.position.x = nx;
      dolly.position.z = nz;
    }

    const stepDist = moveVec.length();
    distanceWalked += stepDist;
    stepAccum += stepDist;

    const stride = (speed > WALK_SPEED) ? 1.55 : 1.15;
    if(stepAccum >= stride){
      stepAccum = 0;
      camera.getWorldPosition(head);
      spawnFootprint(head, Math.atan2(fwd.x, fwd.z));
      sfx('step');
    }
  }

  camera.getWorldPosition(head);
  for(let i=0; i<colliders.length; i++){
    const c = colliders[i];
    const dx = head.x - c.x, dz = head.z - c.z;
    const dSq = dx*dx + dz*dz;
    const minDist = c.r + .42;
    if(dSq < minDist * minDist && dSq > 0.00001){
      const d = Math.sqrt(dSq);
      const push = (minDist - d) / d;
      dolly.position.x += dx * push;
      dolly.position.z += dz * push;
    }
  }
  updateZoneName(head.x, head.z);
}

/* ================= IA de SLENDERMAN ================= */
function teleportSlender(nearPlayer){
  camera.getWorldPosition(head);
  camera.getWorldDirection(look); look.y=0; look.normalize();
  const baseAngle = Math.atan2(look.z, look.x);
  const spread = nearPlayer ? rand(-1.0, 1.0) : rand(-Math.PI, Math.PI);
  const angle = baseAngle + spread;
  const dist = nearPlayer ? rand(5.5, 11.5) : rand(14, 26);

  let sx = head.x + Math.cos(angle) * dist;
  let sz = head.z + Math.sin(angle) * dist;
  const rad = Math.hypot(sx, sz);
  if(rad > MAP_R - 3){ sx *= (MAP_R - 3) / rad; sz *= (MAP_R - 3) / rad; }
  slender.position.set(sx, 0, sz);
}

function triggerScreamer(){
  screamerTimer = 0.72;
  sfx('screamer');
  ctrls.forEach(c=>pulse(c, 1.0, 320));
  if(isNightmare()) invertControlsTimer = 3.2;
}

function updateSlender(dt, t){
  if(pendingDefeatReason) return;
  camera.getWorldPosition(head);
  camera.getWorldDirection(look);
  const toSlender = slender.position.clone().sub(head).normalize();
  const lookingAtHim = look.dot(toSlender) > .70;
  const dist = head.distanceTo(slender.position);
  const nightmare = isNightmare();

  if(heardCooldown > 0) heardCooldown -= dt;
  if(nearScreamCooldown > 0) nearScreamCooldown -= dt;

  if(((dist < 9.5) || (lookingAtHim && dist < 13.0)) && nearScreamCooldown <= 0 && screamerTimer <= 0){
    sfx('screamer');
    ambientGlitchTimer = Math.max(ambientGlitchTimer, 0.85);
    nearScreamCooldown = nightmare ? 7.5 : 10.5;
  }

  if(!firstEncounterShown && dist < 24 && lookingAtHim) showFirstEncounter();

  const thresh = getNoiseThreshold();
  const hearRadius = nightmare ? 48 : 34;
  const playerIsLoud = micReady && micLevel > thresh;

  if(playerIsLoud && dist < hearRadius){
    if(heardCooldown <= 0){ timesHeard++; heardCooldown = 4.0; }
    const huntSpeed = (nightmare ? 6.4 : 4.6) + pagesFound * 0.48;
    const pull = head.clone().sub(slender.position); pull.y = 0; pull.normalize();
    slender.position.addScaledVector(pull, huntSpeed * dt);
    sanity -= (nightmare ? 14 : 9) * dt;
    nextTpTimer = Math.min(nextTpTimer, 1.4);
  }

  const playerIsHidden = !flashlightOn && !playerIsLoud && !lookingAtHim && dist > 6.5;
  if(playerIsHidden){
    stealthTimer += dt;
    sanity = Math.min(100, sanity + 3.5 * dt);
    if(stealthTimer > 4.5){ teleportSlender(false); stealthTimer = 0; nextTpTimer = rand(7, 12); }
  } else stealthTimer = 0;

  nextTpTimer -= dt;
  if(nextTpTimer <= 0 && !lookingAtHim && !playerIsHidden){
    teleportSlender(pagesFound >= 2 || nightmare);
    nextTpTimer = Math.max(2.0, (9.0 - pagesFound * .75) / diffMultiplier);
  }

  slender.lookAt(head.x, 0, head.z);
  tentacles.forEach((tn,i)=>{ tn.rotation.z = (i%2===0?1:-1)*(.4 + i*.12) + Math.sin(t*7 + i)*.26; });

  if(!lookingAtHim && !playerIsLoud && !playerIsHidden && dist > 3.0){
    const chase = ((nightmare ? 1.45 : .85) + pagesFound * .40) * diffMultiplier;
    const dir = head.clone().sub(slender.position); dir.y=0; dir.normalize();
    slender.position.addScaledVector(dir, chase * dt);
  }

  const dangerRadius = (flashlightOn ? 18 : 11) + pagesFound * 1.1;
  if((lookingAtHim && dist < dangerRadius) || dist < 4.5){
    const drain = (lookingAtHim ? 24 : 15) * (flashlightOn ? 1.15 : 0.65) * diffMultiplier;
    sanity -= drain * dt;
    if(Math.random() < (nightmare ? 0.05 : 0.025)) flashFailTimer = 0.25;
  } else if(!playerIsHidden) {
    sanity = Math.min(100, sanity + (4.5 / diffMultiplier) * dt);
  }

  if((dist < 2.2 || (lookingAtHim && dist < (nightmare ? 5.5 : 4.6))) && screamerTimer <= 0){
    triggerScreamer();
    sanity -= 36 * diffMultiplier;
    nextTpTimer = 1.8;
  }

  if(dist < 1.65){ triggerDeathScreamer('TE ATRAPÓ EN LA OSCURIDAD'); return; }
  if(sanity <= 0){ triggerDeathScreamer('TU MENTE COLAPSÓ'); return; }

  const staticLevel = Math.max(0, (100 - sanity) / 100);
  if(screamerTimer > 0){
    updateScreamerPlane(dt, 1.0, true);
    ctrls.forEach(c=>pulse(c, .95, 35));
  } else if(staticLevel > 0.04){
    updateScreamerPlane(dt, staticLevel, false);
  } else screamMat.opacity = 0;

  const hallucinationChance = nightmare ? 0.008 : 0.003;
  if(sanity < 55 && phantomTimer <= 0 && Math.random() < hallucinationChance){
    phantomTimer = 1.35;
    const pAng = Math.atan2(look.z, look.x) + rand(-0.6, 0.6);
    phantomSlender.position.set(head.x + Math.cos(pAng)*8, 0, head.z + Math.sin(pAng)*8);
    phantomSlender.lookAt(head.x, 0, head.z);
    phantomSlender.visible = true;
    sfx('click');
  }
}

/* ================= Bucle Principal ================= */
let last = performance.now(), acc = 0, hudTimer = 0;

function updateVRPrompt(){
  if((!renderer.xr.isPresenting && !mobileVrActive) || !playing || paused || pendingDefeatReason){
    vrPromptSprite.visible = false;
    return;
  }
  camera.getWorldPosition(head);
  let targetPos = null, minDist = 3.0;
  for(let i=0; i<pages.length; i++){
    const d = pages[i].m.position.distanceTo(head);
    if(d < minDist){ minDist = d; targetPos = pages[i].m.position; }
  }
  for(let i=0; i<batteries.length; i++){
    const d = batteries[i].m.position.distanceTo(head);
    if(d < 2.8 && d < minDist){ minDist = d; targetPos = batteries[i].m.position; }
  }
  if(targetPos){
    vrPromptSprite.visible = true;
    vrPromptSprite.position.set(targetPos.x, targetPos.y + 0.36, targetPos.z);
  } else vrPromptSprite.visible = false;
}

renderer.setAnimationLoop((now)=>{
  const rawDt = Math.min(.05, (now - last)/1000);
  last = now;
  acc += rawDt;
  if(acc < 1/30) return;
  const dt = acc; acc = 0;
  const t = now * .001;

  handleXRButtons();
  updateParticles(t, dt);
  updateRain(dt);
  updateBats(t, dt);
  updateFootprints(dt);

  if(firstEncounterTimer > 0){
    firstEncounterTimer -= dt;
    if(firstEncounterTimer <= 0) hideFirstEncounter();
  }
  if(ambientGlitchTimer > 0) ambientGlitchTimer = Math.max(0, ambientGlitchTimer - dt);
  if(ambientApparitionTimer > 0){
    ambientApparitionTimer = Math.max(0, ambientApparitionTimer - dt);
    if(ambientApparitionTimer === 0 && phantomTimer <= 0) phantomSlender.visible = false;
  }

  if(playing && !paused && !pendingDefeatReason){
    forestEventTimer -= dt;
    if(forestEventTimer <= 0){
      forestEventTimer = rand(18, 28) / diffMultiplier;
      const roll = Math.random();
      if(roll < 0.36) sfx('branchSnap');
      else if(roll < 0.68) sfx('crowCall');
      else {
        ambientGlitchTimer = Math.max(ambientGlitchTimer, 0.95);
        sfx('signal');
        if(phantomTimer <= 0){
          camera.getWorldPosition(head);
          camera.getWorldDirection(look); look.y = 0; look.normalize();
          const pAng = Math.atan2(look.z, look.x) + (Math.random() > 0.5 ? 0.52 : -0.52);
          phantomSlender.position.set(head.x + Math.cos(pAng)*12, 0, head.z + Math.sin(pAng)*12);
          phantomSlender.lookAt(head.x, 0, head.z);
          phantomSlender.visible = true;
          ambientApparitionTimer = 0.85;
        }
      }
    }
  }

  lightningTimer -= dt;
  if(lightningTimer <= 0){
    lightningTimer = rand(14, 24);
    lightningFlash = 0.48;
    if(playing && !paused) sfx('thunder');
  }
  if(lightningFlash > 0){
    lightningFlash -= dt;
    const flashOn = Math.random() > 0.28;
    lightningLight.intensity = flashOn ? 14.0 : 0.5;
    hemi.intensity = flashOn ? 1.45 : 0.12;
    scene.fog.color.setHex(flashOn ? (isNightmare() ? 0x6b1420 : 0x5c6d8a) : 0x020103);
    skyMat.color.setHex(flashOn ? 0xffffff : 0xaaaaaa);
  } else {
    lightningLight.intensity = 0;
    hemi.intensity = 0.07;
    scene.fog.color.setHex(isNightmare() ? 0x080102 : 0x020103);
    skyMat.color.setHex(0xffffff);
  }

  if(phantomTimer > 0){
    phantomTimer -= dt;
    if(phantomTimer <= 0 && ambientApparitionTimer <= 0) phantomSlender.visible = false;
  }

  altarOrb.rotation.y = t * 1.8;
  altarOrb.position.y = 1.35 + Math.sin(t * 2.5) * 0.08;
  radioLed.visible = Math.sin(t * 9) > 0;

  for(let i=0; i<batteries.length; i++){
    const b = batteries[i];
    b.m.rotation.y = t * 2.2 + b.phase;
    b.m.position.y = 0.25 + Math.sin(t * 3.5 + b.phase) * 0.04;
  }

  if(playing && !paused && !pendingDefeatReason){
    timeLeft -= dt;
    if(timeLeft <= 0){
      timeLeft = 0;
      triggerDeathScreamer('SE ACABÓ EL TIEMPO');
    } else {
      updateMicrophone();
      updateMove(dt);
      updateSlender(dt, t);
      updateVRPrompt();
      if(sanity <= 0 && !pendingDefeatReason) triggerDeathScreamer('TE ENCONTRÓ EN LA OSCURIDAD');
    }
  } else {
    vrPromptSprite.visible = false;
    if(!playing) updateMicrophone();
  }

  if(screamerTimer > 0){
    screamerTimer -= dt;
    updateScreamerPlane(dt, 1.0, true);
    if(screamerTimer <= 0){
      screamMat.opacity = 0;
      if(pendingDefeatReason){
        const reason = pendingDefeatReason;
        pendingDefeatReason = null;
        finishGame(false, reason);
      }
    }
  }

  if(playing && !paused && !pendingDefeatReason && flashlightOn && battery > 0){
    battery = Math.max(0, battery - (isNightmare() ? 0.65 : 0.45) * dt);
    if(battery === 0){ flashlightOn = false; sfx('click'); }
  }

  if(flashFailTimer > 0) flashFailTimer -= dt;
  const activeLight = flashlightOn && battery > 0 && flashFailTimer <= 0;
  const lowBatFlicker = (battery < 18 && Math.random() < 0.12) ? 0.25 : 1.0;

  flashlight.intensity = activeLight ? 52 * lowBatFlicker : 0;
  beamMesh.visible = activeLight && lowBatFlicker > 0.5;
  lensMat.color.setHex(activeLight ? 0xfff6cc : 0x1a1a22);
  if(flashBuzzGain && ac) flashBuzzGain.gain.setTargetAtTime(activeLight ? 0.015 : 0, ac.currentTime, 0.05);

  if(playing && !paused){
    hudTimer += dt;
    if(hudTimer >= .22){
      hudTimer = 0;
      drawPanel();
      updatePageSignalUI();
    }
  }

  const staticLevel = Math.max(0, (100 - sanity) / 100);
  updateVhsEffect(screamerTimer > 0 ? 1 : staticLevel);

  camera.getWorldPosition(head);
  for(let i=0; i<shadowEyes.length; i++){
    const e = shadowEyes[i];
    e.lookAt(head);
    e.visible = Math.sin(t*2.5 + i) > -.2;
  }

  if(mobileVrActive && stereoEffect && !renderer.xr.isPresenting){
    stereoEffect.render(scene, camera);
  } else {
    renderer.render(scene, camera);
  }
});