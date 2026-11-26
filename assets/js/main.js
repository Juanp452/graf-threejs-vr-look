import * as THREE from 'three';
import {VRButton} from 'three/addons/webxr/VRButton.js';

/* ================= Configuración Slenderman: Edición Completa 8-Bits VR ================= */
const MAP_R = 72;               // Límite perimetral del mapa
const TOTAL_PAGES = 8;          // Las 8 páginas clásicas
const WALK_SPEED = 3.3;         // Velocidad caminando
const SPRINT_SPEED = 5.4;       // Velocidad esprintando
const rand = (a,b)=>a+Math.random()*(b-a);

const AUDIO_PREFS_KEY = 'slender_audio_mix_v1';
const DEFAULT_AUDIO_PREFS = { music: 58, ambience: 48, effects: 68, muted: false };
function loadAudioPrefs(){
  try{
    const saved = JSON.parse(localStorage.getItem(AUDIO_PREFS_KEY) || '{}');
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
    const saved = JSON.parse(localStorage.getItem(GAME_SETTINGS_KEY) || '{}');
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
  performance: { desktopPixelRatio: 1.0, xrScale: 0.72, particleCount: 90, rainCount: 140, label: 'RENDIMIENTO' },
  balanced: { desktopPixelRatio: 1.2, xrScale: 0.82, particleCount: 150, rainCount: 220, label: 'EQUILIBRADO' },
  quality: { desktopPixelRatio: 1.45, xrScale: 0.9, particleCount: 210, rainCount: 320, label: 'CALIDAD' }
};

/* ================= Render, escena, listener 3D y rig del jugador ================= */
const app = document.getElementById('app');
const vhsOverlay = document.getElementById('vhs-overlay');
const vhsRecText = document.getElementById('vhs-rec-text');
const vhsTracking = document.getElementById('vhs-tracking');
const renderer = new THREE.WebGLRenderer({antialias:false, powerPreference:'high-performance'});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY_PRESETS[gameSettings.quality].desktopPixelRatio));
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.domElement.setAttribute('aria-label', 'Escenario tridimensional de SLENDER: THE 8 PAGES');
renderer.domElement.style.touchAction = 'none';
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
// Escalado de framebuffer moderado para mantener una tasa de cuadros estable en Quest 3S.
renderer.xr.setFramebufferScaleFactor?.(QUALITY_PRESETS[gameSettings.quality].xrScale);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const baseFogDensity = 0.056;
scene.fog = new THREE.FogExp2(0x020103, baseFogDensity);
const camera = new THREE.PerspectiveCamera(70, app.clientWidth/app.clientHeight, 0.05, 160);
camera.position.y = 1.6;

// Panel de pausa 3D: el DOM de la página no se muestra dentro de una sesión WebXR inmersiva.
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


// Paneles de evento y resultado: se dibujan en canvas para verse también dentro de WebXR inmersivo.
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

// AudioListener 3D vinculado a la cabeza del jugador para sonido espacial en Meta Quest 3S
const audioListener = new THREE.AudioListener();
camera.add(audioListener);

const dolly = new THREE.Group(); dolly.add(camera); scene.add(dolly);
dolly.position.set(0,0,6);

document.getElementById('enter').appendChild(VRButton.createButton(renderer));
function resizeRendererToApp(){
  if(renderer.xr.isPresenting) return; // WebXR administra su propio framebuffer y viewport.
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

/* ================= Récords Locales (localStorage) ================= */
function formatTime(sec){
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`;
}

function loadRecords(){
  const rn = localStorage.getItem('slender_rec_normal');
  const rp = localStorage.getItem('slender_rec_nightmare');
  document.getElementById('rec-normal').textContent = rn ? formatTime(parseFloat(rn)) : '--:--';
  document.getElementById('rec-nightmare').textContent = rp ? formatTime(parseFloat(rp)) : '--:--';
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
const floor = new THREE.Mesh(new THREE.CircleGeometry(MAP_R + 4, 48), new THREE.MeshLambertMaterial({map:grass}));
floor.rotation.x = -Math.PI/2; scene.add(floor);

const skyMat = new THREE.MeshBasicMaterial({side:THREE.BackSide, fog:false});
function paintSky(bloodMoon){
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
scene.add(new THREE.Mesh(new THREE.SphereGeometry(145,16,12), skyMat));

/* ================= Partículas Flotantes (Luciérnagas, Cenizas y Niebla Baja) ================= */
const PARTICLE_COUNT = 210;
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
scene.add(floatingParticles);

function updateParticles(t, dt){
  const pos = pGeo.attributes.position.array;
  for(let i=0; i<activeParticleCount; i++){
    const s = pSeeds[i];
    const nearAltar = Math.hypot(pos[i*3], pos[i*3+2] - 42) < 18;
    pos[i*3]   += Math.sin(t * 0.8 + s) * 0.18 * dt;
    pos[i*3+1] += (nearAltar ? 0.35 : Math.cos(t * 1.1 + s) * 0.14) * dt;
    if(pos[i*3+1] > 4.2) pos[i*3+1] = 0.2;
    pos[i*3+2] += Math.sin(t * 0.7 + s * 1.3) * 0.18 * dt;
  }
  pGeo.attributes.position.needsUpdate = true;
}

/* ================= Lluvia Nocturna Sutil (Partículas Verticales) ================= */
const RAIN_COUNT = 320;
let activeRainCount = QUALITY_PRESETS[gameSettings.quality].rainCount;
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_COUNT * 3);
for(let i=0; i<RAIN_COUNT; i++){
  rainPos[i*3]   = rand(-28, 28);
  rainPos[i*3+1] = rand(0, 14);
  rainPos[i*3+2] = rand(-28, 28);
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
scene.add(rainMesh);

function updateRain(dt){
  camera.getWorldPosition(head);
  rainMesh.position.set(head.x, 0, head.z);
  const arr = rainGeo.attributes.position.array;
  const fallSpeed = isNightmare() ? 14 : 9;
  for(let i=0; i<activeRainCount; i++){
    arr[i*3+1] -= fallSpeed * dt;
    if(arr[i*3+1] < 0) arr[i*3+1] = 14;
  }
  rainGeo.attributes.position.needsUpdate = true;
}

/* ================= Huellas de Pasos en la Tierra ================= */
const FOOTPRINT_MAX = 60;
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
  for(const fp of footprintPool){
    if(fp.life > 0){
      fp.life -= dt * 0.022;
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

const beamGeo = new THREE.ConeGeometry(1.7, 8.0, 16, 1, true);
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

/* ================= Construcción de los 4 Escenarios + Props Ambientales ================= */
const colliders = [];
const hidingSpots = [];

function addHidingSpot(x, y, z, rotY){
  hidingSpots.push({pos: new THREE.Vector3(x, y, z), rotY});
}

function isAreaClear(x, z, minDist=5){
  if(Math.hypot(x, z) < 7) return false;
  if(Math.hypot(x, z) > MAP_R - 4) return false;
  for(const c of colliders){
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

// --- CERCO PERIMETRAL DEL MAPA (72m) ---
const fencePosts = 56;
for(let i=0; i<fencePosts; i++){
  const a1 = (i / fencePosts) * Math.PI * 2;
  const a2 = ((i + 1) / fencePosts) * Math.PI * 2;
  const x1 = Math.cos(a1) * MAP_R, z1 = Math.sin(a1) * MAP_R;
  const x2 = Math.cos(a2) * MAP_R, z2 = Math.sin(a2) * MAP_R;

  const post = new THREE.Mesh(new THREE.BoxGeometry(0.35, 2.4, 0.35), fenceM);
  post.position.set(x1, 1.2, z1);
  scene.add(post);

  const midX = (x1 + x2) / 2, midZ = (z1 + z2) / 2;
  const len = Math.hypot(x2 - x1, z2 - z1);
  const rail1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, len), fenceM);
  rail1.position.set(midX, 1.7, midZ);
  rail1.lookAt(x2, 1.7, z2);
  const rail2 = rail1.clone();
  rail2.position.y = 0.9;
  scene.add(rail1, rail2);
}

// --- ESCENARIO 1: EL CEMENTERIO ANTIGUO (Noreste) ---
const cemCenter = {x: 34, z: -34};
for(let gx = -15; gx <= 15; gx += 5){
  for(let gz = -15; gz <= 15; gz += 5){
    const x = cemCenter.x + gx + rand(-0.8,0.8);
    const z = cemCenter.z + gz + rand(-0.8,0.8);
    if(Math.random() < 0.65){
      const tomb = new THREE.Mesh(new THREE.BoxGeometry(.85, 1.35, .28), stoneM);
      tomb.position.set(x, .67, z);
      scene.add(tomb);
      colliders.push({x, z, r:.6});
      const side = Math.random() < 0.5 ? 1 : -1;
      addHidingSpot(x, 0.85, z + side * 0.16, side === 1 ? 0 : Math.PI);
    } else {
      const cross = new THREE.Group();
      const v = new THREE.Mesh(new THREE.BoxGeometry(.18, 1.7, .18), crossM); v.position.y = .85;
      const h = new THREE.Mesh(new THREE.BoxGeometry(.9, .18, .18), crossM); h.position.y = 1.25;
      cross.add(v,h); cross.position.set(x,0,z);
      scene.add(cross);
      colliders.push({x, z, r:.45});
    }
  }
}
const mausoleum = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.2, 4.2), darkStoneM);
mausoleum.position.set(cemCenter.x, 1.6, cemCenter.z);
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

// Radio vieja dentro de la cabaña (referencia sonora y visual)
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

for(let i=0; i<8; i++){
  const ang = (i / 8) * Math.PI * 2;
  const mx = ritualCenter.x + Math.cos(ang) * 9.5;
  const mz = ritualCenter.z + Math.sin(ang) * 9.5;
  const mono = new THREE.Mesh(new THREE.BoxGeometry(1.3, 4.2, 1.3), darkStoneM);
  mono.position.set(mx, 2.1, mz);
  mono.lookAt(ritualCenter.x, 2.1, ritualCenter.z);

  const runeStrip = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 2.4), runeMat);
  runeStrip.position.z = 0.66;
  mono.add(runeStrip);

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
const altarOrb = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.32, 0.32), new THREE.MeshBasicMaterial({color:0xff001e}));
altarOrb.position.set(ritualCenter.x, 1.35, ritualCenter.z);
scene.add(altar, altarOrb);
colliders.push({x: ritualCenter.x, z: ritualCenter.z, r: 1.3});

// --- SENDEROS DE PIEDRA Y POSTES GUÍA HACIA LOS 3 ESCENARIOS ---
const pathCoords = [];
[cemCenter, ruinCenter, ritualCenter].forEach(dest=>{
  const steps = 16;
  for(let s=2; s<steps; s++){
    const t = s / steps;
    const px = dest.x * t + rand(-0.6, 0.6);
    const pz = dest.z * t + rand(-0.6, 0.6);
    pathCoords.push({x: px, z: pz});

    const stepStone = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), pathStoneM);
    stepStone.position.set(px, 0.025, pz);
    stepStone.rotation.y = rand(0, Math.PI);
    scene.add(stepStone);

    if(s % 5 === 0){
      const lx = px + 1.4, lz = pz + 1.4;
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.3, 0.16), fenceM);
      pole.position.set(lx, 1.15, lz);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.34, 0.28), new THREE.MeshBasicMaterial({color:0x4a1218}));
      lamp.position.set(lx, 2.35, lz);
      scene.add(pole, lamp);
      colliders.push({x: lx, z: lz, r: 0.3});
    }
  }
});

// --- ESCENARIO 4: BOSQUE PROFUNDO + BANDADAS DE MURCIÉLAGOS VOXEL ---
const bats = [];
const batMat = new THREE.MeshBasicMaterial({color:0x08080c});

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
  const t = new THREE.Group();
  const trunkW = 0.65 * s;
  const tr = new THREE.Mesh(new THREE.BoxGeometry(trunkW, 3.8*s, trunkW), trunkM);
  tr.position.y = 1.9*s;
  t.add(tr);

  if(i % 2 === 0){
    const c1 = new THREE.Mesh(new THREE.BoxGeometry(2.3*s, 1.3*s, 2.3*s), deadLeafM); c1.position.y = 3.7*s;
    const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.4*s, 1.0*s, 1.4*s), deadLeafM); c2.position.y = 4.6*s;
    t.add(c1,c2);
  } else {
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(1.6*s, .16*s, .16*s), trunkM);
    b1.position.set(.45*s, 2.8*s, 0); b1.rotation.z = .4;
    t.add(b1);
  }
  t.position.set(x, 0, z);
  scene.add(t);
  colliders.push({x, z, r: trunkW * 0.65});

  if(Math.hypot(x, z) > 15 && i % 3 === 0){
    const face = i % 4;
    const off = trunkW * 0.5 + 0.025;
    if(face === 0) addHidingSpot(x, 1.45, z + off, 0);
    if(face === 1) addHidingSpot(x, 1.45, z - off, Math.PI);
    if(face === 2) addHidingSpot(x + off, 1.45, z, Math.PI/2);
    if(face === 3) addHidingSpot(x - off, 1.45, z, -Math.PI/2);
  }

  // Murciélagos ocultos en algunos árboles que salen volando si pasas cerca
  if(i % 14 === 0 && bats.length < 10){
    const batGrp = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.16), batMat);
    const wL   = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.12), batMat); wL.position.x = -0.16;
    const wR   = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.12), batMat); wR.position.x =  0.16;
    batGrp.add(body, wL, wR);
    batGrp.position.set(x, 3.2, z);
    scene.add(batGrp);
    bats.push({grp: batGrp, wL, wR, home: new THREE.Vector3(x, 3.2, z), flying: false, flyTimer: 0, dir: new THREE.Vector3()});
  }
}

function updateBats(t, dt){
  camera.getWorldPosition(head);
  for(const b of bats){
    if(!b.flying){
      b.grp.visible = false;
      if(b.home.distanceTo(head) < 7.5 && playing && !paused){
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
for(let i=0;i<14;i++){
  const grp = new THREE.Group();
  const e1 = new THREE.Mesh(new THREE.BoxGeometry(.07,.05,.05), redEyeMat); e1.position.x = -.11;
  const e2 = new THREE.Mesh(new THREE.BoxGeometry(.07,.05,.05), redEyeMat); e2.position.x =  .11;
  grp.add(e1,e2);
  grp.position.set(rand(-50,50), rand(1.1,2.2), rand(-50,50));
  scene.add(grp);
  shadowEyes.push(grp);
}

/* ================= Pilas 3D en el Mapa (10 en Normal, solo 5 en Pesadilla) ================= */
const batteries = [];
const batBodyMat = new THREE.MeshLambertMaterial({color:0x111116});
const batTopMat  = new THREE.MeshLambertMaterial({color:0x00e436, emissive:0x00330c});
const batTipMat  = new THREE.MeshLambertMaterial({color:0xffec27});

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
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, 0.14), batBodyMat);
    const b2 = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.10, 0.14), batTopMat); b2.position.y = 0.13;
    const b3 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.06), batTipMat); b3.position.y = 0.20;
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

// El aviso también se dibuja en un plano unido a la cámara: los overlays DOM no se muestran dentro de WebXR inmersivo.
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

/* ================= SCREAMER ORIGINAL + FILTRO VHS EN VR ================= */
const screamCv = document.createElement('canvas'); screamCv.width = 128; screamCv.height = 128;
const screamTex = new THREE.CanvasTexture(screamCv);
screamTex.magFilter = THREE.NearestFilter;
const screamPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(1.55, 1.55),
  new THREE.MeshBasicMaterial({map:screamTex, transparent:true, opacity:0, depthTest:false, fog:false})
);
screamPlane.position.set(0, 0, -0.45);
screamPlane.renderOrder = 999;
camera.add(screamPlane);

function drawOriginalSlenderScreamer(intensity, isJumpscare){
  const g = screamCv.getContext('2d');
  g.clearRect(0,0,128,128);

  const dots = Math.floor(intensity * 560);
  for(let i=0;i<dots;i++){
    const shade = Math.random() > 0.5 ? 245 : 15;
    g.fillStyle = `rgba(${shade},${shade},${shade},${intensity*0.85})`;
    g.fillRect(Math.floor(Math.random()*64)*2, Math.floor(Math.random()*64)*2, 2, 2);
  }

  if(intensity > 0.12){
    g.fillStyle = `rgba(255,0,40,${intensity*0.25})`;
    g.fillRect(0, Math.floor(Math.random()*120), 128, 3);
    g.fillStyle = `rgba(0,235,255,${intensity*0.25})`;
    g.fillRect(0, Math.floor(Math.random()*120), 128, 2);
  }

  if(isJumpscare){
    const jx = rand(-9,9), jy = rand(-7,7);
    g.fillStyle = '#050507';
    g.fillRect(10+jx, 94+jy, 108, 40);
    g.fillStyle = '#e8e8e8';
    g.fillRect(54+jx, 94+jy, 20, 34);
    g.fillStyle = '#111115';
    g.fillRect(61+jx, 96+jy, 6, 32);

    g.fillStyle = '#dcdcdc';
    g.fillRect(34+jx, 14+jy, 60, 82);
    g.fillStyle = '#f7f7f7';
    g.fillRect(38+jx, 18+jy, 52, 74);
    g.fillStyle = '#bdbdbd';
    g.fillRect(36+jx, 42+jy, 6, 36);
    g.fillRect(86+jx, 42+jy, 6, 36);
    g.fillRect(46+jx, 86+jy, 36, 8);

    for(let k=0;k<10;k++){
      g.fillStyle = k%2===0 ? 'rgba(0,0,0,0.65)' : 'rgba(255,255,255,0.75)';
      g.fillRect(rand(20,90), rand(10,115), rand(16,45), 2);
    }
  }
  screamTex.needsUpdate = true;
}

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
  const hh = String(Math.floor(elapsed / 3600)).padStart(2,'0');
  const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2,'0');
  const ss = String(elapsed % 60).padStart(2,'0');
  vhsRecText.textContent = `● PLAY VHS-SP • ${hh}:${mm}:${ss}`;
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
// Vector auxiliar inicializado antes de resetGame(): evita acceder a `head`
// durante su zona temporal muerta en la primera inicialización del módulo.
const pageSignalPosition = new THREE.Vector3();

function getNearestPageSignal(){
  if(!pages.length) return {distance: Infinity, label: 'SIN RASTRO', level: 'none', strength: 0};
  const playerPosition = camera.getWorldPosition(pageSignalPosition);
  let nearest = Infinity;
  for(const page of pages){
    const distance = page.m.position.distanceTo(playerPosition);
    if(distance < nearest) nearest = distance;
  }
  if(nearest < 5.5) return {distance: nearest, label: 'SEÑAL FUERTE', level: 'strong', strength: 100};
  if(nearest < 12) return {distance: nearest, label: 'SEÑAL MEDIA', level: 'medium', strength: 68};
  if(nearest < 23) return {distance: nearest, label: 'SEÑAL DÉBIL', level: 'weak', strength: 34};
  return {distance: nearest, label: 'BUSCANDO...', level: 'none', strength: 8};
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

function drawPanel(msg){
  hudPagesEl.textContent = `NOTAS: ${pagesFound} / ${TOTAL_PAGES}`;
  hudTimeEl.textContent  = `⏱️ ${formatTime(timeLeft)}`;
  hudZoneEl.textContent  = invertControlsTimer > 0 ? '⚠️ PÁNICO (INVERTIDO)' : `ZONA: ${currentZone}`;
  hudBatEl.textContent   = `🔋 BAT: ${Math.ceil(battery)}%`;
  hudStamEl.textContent  = `⚡ STAM: ${Math.ceil(stamina)}%`;

  hudTimeEl.classList.toggle('low', timeLeft <= 45);
  hudBatEl.classList.toggle('low', battery <= 25);
  hudStamEl.classList.toggle('low', exhausted || stamina <= 25);

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

    // Ocho marcas de archivo visibles en el panel de muñeca dentro del visor.
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
    g.fillText(`RASTRO DE NOTA: ${pageSignal.label}`, 160, 178);
  }
  panelTex.needsUpdate = true;
}
const panel = new THREE.Mesh(new THREE.PlaneGeometry(.19,.115), new THREE.MeshBasicMaterial({map:panelTex}));
panel.position.set(0,.075,.02); panel.rotation.x = -Math.PI/3;

/* ================= Micrófono con supresión de ruido y calibración de silencio ================= */
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
    micAnalyser.fftSize = 512;
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

// Libera el permiso y las pistas al terminar la partida o abandonar la página.
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
  // Reinicia la animación de entrada sin provocar un salto del layout.
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
  // El audio mejora la introducción, pero nunca debe impedir que la secuencia visual funcione.
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
  console.warn('WebGL: se perdió temporalmente el contexto gráfico.');
});
renderer.domElement.addEventListener('webglcontextrestored',()=>{
  applyGraphicsQuality();
  if(settingsStatusElement) settingsStatusElement.textContent = 'CONTEXTO GRÁFICO RESTAURADO.';
});

function saveGameSettings(){
  try{ localStorage.setItem(GAME_SETTINGS_KEY, JSON.stringify(gameSettings)); }catch(err){
    console.warn('No se pudieron guardar los ajustes:', err);
  }
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
  if(settingsStatusElement) settingsStatusElement.textContent = `PERFIL ${preset.label} APLICADO · ${activeParticleCount} PARTÍCULAS / ${activeRainCount} GOTAS. EN VR SE PRIORIZA LA ESTABILIDAD.`;
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
    if(settingsStatusElement) settingsStatusElement.textContent = 'DETECCIÓN POR MICRÓFONO DESACTIVADA. EL JUEGO SIGUE FUNCIONANDO.';
  }
});
renderGameSettings();
applyGraphicsQuality();

function saveAudioPrefs(){
  try{ localStorage.setItem(AUDIO_PREFS_KEY, JSON.stringify(audioPrefs)); }catch(err){
    console.warn('No se pudieron guardar las preferencias de audio:', err);
  }
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
  tone(392, 0.5, 'sine', 0.035, 0.72, 0.85);
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
  const nightmareBonus = isNightmare() ? 180 : 0;
  const timeBonus = Math.max(0, Math.round(timeLeft * 1.8));
  const sanityBonus = Math.max(0, Math.round(sanity * 1.25));
  const batteryBonus = Math.max(0, Math.round(battery * 0.35));
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
  try{
    const scoreStorageKey = `slender_best_score_${modeKey}`;
    const previousBestScore = Number(localStorage.getItem(scoreStorageKey) || 0);
    if(score > previousBestScore){
      localStorage.setItem(scoreStorageKey, String(score));
      bestScore = score;
      messages.push('★ NUEVO RÉCORD DE PUNTUACIÓN GUARDADO ★');
    }else{
      bestScore = previousBestScore;
    }
    if(won){
      const timeKey = `slender_rec_${modeKey}`;
      const previousTime = Number(localStorage.getItem(timeKey) || 0);
      if(!previousTime || elapsed < previousTime){
        localStorage.setItem(timeKey, String(elapsed));
        messages.push('★ NUEVO RÉCORD DE TIEMPO GUARDADO ★');
        loadRecords();
      }
    }
  }catch(storageError){
    console.warn('No se pudieron guardar los récords locales:', storageError);
  }
  document.getElementById('end-best-score').textContent = String(bestScore).padStart(4,'0');
  recMsgEl.textContent = messages.join('  ·  ') || (won ? 'ARCHIVO COMPLETADO. LA GRABACIÓN SE CONSERVÓ.' : 'EL EXPEDIENTE QUEDÓ INCOMPLETO. PUEDES INTENTARLO DE NUEVO.');
  stopMicrophone(); // La detección por voz ya no es necesaria en la pantalla de resultados.

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
  hideFirstEncounter();
  flashFailTimer = 0; stealthTimer = 0; invertControlsTimer = 0; breathTimer = 0;
  forestEventTimer = rand(15,22) / diffMultiplier; ambientGlitchTimer = 0; ambientApparitionTimer = 0;
  resetPageCollectionUI();

  scene.fog.density = nightmare ? 0.072 : baseFogDensity;
  flashlight.distance = nightmare ? 24 : 36;
  paintSky(nightmare);
  resetParticles(nightmare);
  clearFootprints();
  updateVhsEffect(0);
  phantomSlender.visible = false;
  screamPlane.material.opacity = 0;
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

  // Ruido coloreado de baja intensidad: se reserva para ráfagas breves, no como viento continuo.
  const bufSize = ac.sampleRate * 2;
  noiseBuffer = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  let filteredNoise = 0;
  for(let i=0;i<bufSize;i++){
    const white = Math.random()*2 - 1;
    filteredNoise = filteredNoise * 0.965 + white * 0.035;
    data[i] = filteredNoise * 1.65;
  }

  // 1. Audio Espacial 3D en Slenderman (zumbido grave que te permite ubicarlo de oído)
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

  // 2. Susurros Binaurales 3D detrás de tu nuca cuando Slenderman acecha o baja tu cordura
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
  whisperPosAudio.position.set(0, 0, 0.75); // Tono grave detrás de la cabeza, sin siseo continuo.
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
  }, 180);

  // 3. Audio Espacial 3D de la Radio Rota en la Cabaña (estática intermitente)
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

  // 4. Audio Espacial 3D en el Altar Ritual (cántico grave ceremonial)
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

  // 5. Zumbido eléctrico sutil de la linterna encendida
  const flashOsc = ac.createOscillator();
  flashBuzzGain = ac.createGain();
  flashOsc.type = 'sine';
  flashOsc.frequency.value = 60;
  flashBuzzGain.gain.value = 0.015;
  flashOsc.connect(flashBuzzGain).connect(effectsBus);
  flashOsc.start();

  // 6. Fondo atmosférico tonal: elimina el soplido continuo de ruido blanco.
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

  // Viento sugerido con batimientos graves y una modulación muy lenta, no con hiss permanente.
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

  // 7. Sonidos ambientales aleatorios por zona (grillos, cuervos, campanas, ramas rotas)
  setInterval(()=>{
    if(ac.state !== 'running' || !playing || paused) return;
    const r = Math.random();

    if(currentZone === 'CEMENTERIO' && r < 0.45){
      // Campanada fúnebre grave con eco + graznido de cuervo
      tone(110, 1.8, 'sine', 0.14, 0.96, 0);
      tone(220, 1.2, 'triangle', 0.05, 0.95, 0.05);
      tone(185, 0.32, 'triangle', 0.035, 0.72, 0.12);
    } else if(r < 0.32){
      // Grillos nocturnos 8-bits
      for(let k=0; k<3; k++) tone(2650, 0.03, 'square', 0.025, 0, k*0.07);
    } else if(r < 0.62){
      // Crujido de rama rota a izquierda o derecha (paranoia)
      const pan = Math.random() < 0.5 ? -0.85 : 0.85;
      tone(118, 0.13, 'triangle', 0.055, 0.55, 0);
      tone(82, 0.18, 'sine', 0.042, 0.7, 0.08);
    } else if(r < 0.82){
      // Búho nocturno lejano
      tone(340, 0.25, 'sine', 0.045, 0.92, 0);
      tone(285, 0.55, 'sine', 0.045, 0.88, 0.35);
    } else if(sanity < 75 || isNightmare()){
      tone(180, 0.22, 'sawtooth', 0.05, 1.3, 0);
      tone(220, 0.28, 'sawtooth', 0.05, 0.7, 0.28);
    }
  }, 2400);

  // 8. Música de fondo dinámica por capas según páginas recogidas
  // Tema original de terror: motivo menor y disonante, creado por síntesis Web Audio.
  // No utiliza melodías, grabaciones ni archivos musicales de terceros.
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

      // Tema principal desde el inicio: una melodía lenta y sombría en registro menor.
      const themeNote = openingTheme[step % openingTheme.length];
      if(themeNote > 0){
        musicTone(themeNote, 0.82, 'triangle', 0.035 + tension * 0.018, (step % 2 ? 0.12 : -0.12));
        if(step % 4 === 0) musicTone(lowTheme[(step / 2) % lowTheme.length] || 65.41, 1.25, 'sine', 0.024 + tension * 0.012, 0);
      }

      // CAPA 1 (2+ notas o Pesadilla): bajo pulsante que aumenta la tensión.
      if(pagesFound >= 2 || isNightmare()){
        const d = deepHits[step % deepHits.length];
        if(d > 0) musicTone(d, 0.65, 'sawtooth', 0.055 + pagesFound*0.008 + tension*0.025, 0);
      }

      // CAPA 2 (4+ notas o Pesadilla): caja de música desafinada.
      if(pagesFound >= 4 || isNightmare()){
        const n = musicBox[step % musicBox.length];
        if(n > 0){
          const detune = (Math.random() - 0.5) * (10 + pagesFound*2 + (isNightmare()?14:0));
          musicTone(n + detune, 0.55, 'sine', 0.035 + tension*0.012, 0);
          musicTone((n + detune)*2, 0.25, 'triangle', 0.012 + tension*0.005, 0.1);
        }
      }

      // CAPA 3 (6+ notas): trémolo agudo disonante de persecución final.
      if(pagesFound >= 6 && step % 2 === 0){
        musicTone(880 + (step%3)*62, 0.14, 'sawtooth', 0.024 + tension*0.012, 0);
      }

      // Destello sonoro agudo al estar cerca de una nota oculta
      camera.getWorldPosition(head);
      for(const p of pages){
        if(p.m.position.distanceTo(head) < 4.5 && step % 3 === 0){
          tone(1320, 0.04, 'sine', 0.025);
          break;
        }
      }

      // Latidos de corazón acelerados cuando Slenderman está cerca
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

function tone(f,d,type='square',v=.2,slide=0,when=0){
  if(!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime+when;
  o.type = type; o.frequency.setValueAtTime(f,t);
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,f*slide),t+d);
  g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(g).connect(effectsBus); o.start(t); o.stop(t+d);
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
      // Madera vieja rechinando bajo tus botas
      tone(135, 0.08, 'sawtooth', 0.045, 0.75, 0);
      pannedNoise(0.05, 420, 0.045, 0);
    } else {
      // Pisada sobre tierra y hojas secas
      pannedNoise(0.055, 680 + rand(-120, 120), 0.05, 0);
    }
  }
  if(n==='breath'){
    // Jadeo grave sintetizado, sin soplido de ruido blanco.
    tone(92, 0.30, 'triangle', 0.052, 0.62, 0);
    tone(68, 0.38, 'sine', 0.045, 0.78, 0.27);
  }
  if(n==='spark'){
    // Chispazo eléctrico de linterna fallando
    pannedNoise(0.06, 3200, 0.09, 0.25);
  }
  if(n==='bats'){
    // Aleteo rápido de bandada de murciélagos
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
    tone(310, 0.52, 'sine', 0.035, 0.82, 0);
    tone(233, 0.68, 'triangle', 0.028, 0.76, 0.22);
  }
  if(n==='signal'){
    tone(980, 0.08, 'square', 0.065, 0.55, 0);
    tone(420, 0.24, 'sine', 0.07, 0.65, 0.08);
  }
  if(n==='distantFootsteps'){
    tone(76, 0.16, 'triangle', 0.055, 0.7, 0);
    tone(92, 0.16, 'triangle', 0.047, 0.68, 0.42);
    tone(68, 0.18, 'sine', 0.04, 0.72, 0.86);
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
  hideFirstEncounter();
  endScreen.classList.add('hidden');
  hidePauseUI();
  vrSprintPressed = false;
  resetGame();
  startMenu.classList.remove('hidden');
  hudOverlay.classList.add('hidden');
  resizeRendererToApp();
});

/* ================= Controles WebXR para Meta Quest 3S ================= */
const tmp = new THREE.Vector3(), head = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
const moveStep = new THREE.Vector3();
const toSlenderVector = new THREE.Vector3();
const phantomDirection = new THREE.Vector3();
const UP = new THREE.Vector3(0,1,0);
const ctrls = [];
let vrSprintPressed = false;
let snapLock = false;
let pauseNavLock = false;

// Perfil WebXR Meta Quest Touch Plus: trigger=0, squeeze=1, stick click=3,
// A/X=4, B/Y=5 y menú izquierdo=7. El botón Meta del sistema no se captura.
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
      // Gatillo derecho: interacción principal con páginas, pilas y objetos cercanos.
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

    // El joystick izquierdo navega por las opciones del menú de pausa.
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
    // Al cambiar de pestaña en PC se pausa el juego; no se interviene en sesiones XR.
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

  // Jadeos pesados al estar agotado o con poca resistencia
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
  for(const c of colliders){
    const dx = head.x-c.x, dz = head.z-c.z, d = Math.hypot(dx,dz), min = c.r+.35;
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

/* ================= Lógica de Pilas, Páginas Ocultas y Dificultad ================= */
function updateItems(t){
  camera.getWorldPosition(head);
  camera.getWorldDirection(fwd);

  // 1. Pilas para recargar la batería de la linterna
  for(let i=batteries.length-1; i>=0; i--){
    const b = batteries[i];
    b.m.rotation.y = t * 2.2 + b.phase;
    b.m.position.y = 0.25 + Math.sin(t * 3 + b.phase) * 0.05;

    const inVR = renderer.xr.isPresenting;
    let takeBat = !inVR && b.m.position.distanceTo(head) < 1.25;
    const batteryToPlayer = b.m.position.clone().sub(head).normalize();
    const lookingAtBattery = b.m.position.distanceTo(head) < 1.25 && fwd.dot(batteryToPlayer) > 0.45;
    const anyConfirmPressed = ctrls.some(c=>c.userData.interactPressed || c.userData.faceConfirmPressed);

    for(const c of ctrls){
      c.getWorldPosition(tmp);
      const handNearBattery = tmp.distanceTo(b.m.position) < 0.8;
      const handAction = c.userData.interactPressed || c.userData.faceConfirmPressed || c.userData.grabPressed;
      if(inVR && handNearBattery && handAction) takeBat = true;
    }
    if(inVR && lookingAtBattery && anyConfirmPressed) takeBat = true;

    if(takeBat && playing && !paused){
      scene.remove(b.m); batteries.splice(i, 1);
      battery = Math.min(100, battery + (isNightmare() ? 30 : 40));
      sfx('battery');
      drawPanel();
      ctrls.forEach(c=>pulse(c, .6, 120));
    }
  }

  // 2. Las 8 Páginas Ocultas
  for(let i=pages.length-1;i>=0;i--){
    const p = pages[i];
    const toPage = p.m.position.clone().sub(head).normalize();
    const dist = p.m.position.distanceTo(head);

    const inVR = renderer.xr.isPresenting;
    // En PC se conserva la recolección por proximidad y mirada. En VR se solicita una acción explícita.
    let got = !inVR && dist < 1.35 && fwd.dot(toPage) > 0.45;
    const anyConfirmPressed = ctrls.some(c=>c.userData.interactPressed || c.userData.faceConfirmPressed);
    if(inVR && dist < 1.35 && fwd.dot(toPage) > 0.45 && anyConfirmPressed) got = true;

    for(const c of ctrls){
      c.getWorldPosition(tmp);
      const handDist = tmp.distanceTo(p.m.position);
      const handAction = c.userData.interactPressed || c.userData.faceConfirmPressed;
      if(inVR && handDist < 0.62 && handAction) got = true;
      if(inVR && handDist < 0.9 && c.userData.grabPressed) got = true;
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
}

function teleportSlender(distFromPlayer, preferOffscreen=true){
  camera.getWorldPosition(head);
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const facingAngle = Math.atan2(fwd.z, fwd.x);
  // En la mayoría de las apariciones llega desde atrás o un lateral, no desde un patrón fijo.
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
    // Una aparición real desde la periferia: cambia la posición y empieza a acechar.
    teleportSlender(rand(10.5, 17), true);
    nextTpTimer = rand(7.5, 12.5) / diffMultiplier;
    ambientGlitchTimer = rand(0.9, 1.55);
    sfx('manifestation');
  }else if(roll < 0.60){
    // Silueta fugaz en el rabillo del ojo; no causa daño por sí sola.
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
    // Interferencia y parpadeo de linterna como falso aviso.
    ambientGlitchTimer = rand(0.5,1.25);
    flashFailTimer = Math.max(flashFailTimer, rand(0.18,0.38));
    sfx('signal');
  }else{
    // Pasos graves en un lateral para provocar que el jugador mire atrás.
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
  tentacles.forEach((tn, idx)=>{
    tn.rotation.z = (idx%2===0?1:-1)*(.4 + idx*.1) + Math.sin(t*(4+pagesFound) + idx)*.16;
  });

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
    screamPlane.material.opacity = 0.98;
    drawOriginalSlenderScreamer(1, true);
  } else if(combinedStatic > 0.05){
    screamPlane.material.opacity = combinedStatic * 0.65;
    drawOriginalSlenderScreamer(combinedStatic, false);
  } else {
    screamPlane.material.opacity = 0;
  }

  if(sanity <= 0){
    sfx('lose');
    screamPlane.material.opacity = 0.98;
    drawOriginalSlenderScreamer(1, true);
    drawPanel('TE ATRAPO...');
    finishGame(false, 'SLENDERMAN TE ATRAPÓ');
  }
}

/* ================= Bucle principal ================= */
const clock = new THREE.Clock();
let panelRefreshTimer = 0;
renderer.setAnimationLoop(()=>{
  const dt = Math.min(clock.getDelta(),.05), t = clock.elapsedTime;
  if(!paused) updateMicrophone();
  updateControllerButtons();
  updateParticles(t, dt);
  updateRain(dt);
  updateBats(t, dt);
  updateFootprints(dt);
  move(dt);
  updateItems(t);

  // Animación de props ambientales (orbe del altar y LED de radio)
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
      panelRefreshTimer = 0.12;
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
  shadowEyes.forEach(e=>{
    e.lookAt(head.x, e.position.y, head.z);
    if(e.position.distanceTo(head) < 7){
      const a = rand(0, Math.PI * 2);
      const r = rand((pagesFound >= 6 || isNightmare()) ? 8 : 14, MAP_R - 4);
      e.position.set(Math.cos(a) * r, rand(1.1, 2.2), Math.sin(a) * r);
    }
  });

  renderer.render(scene,camera);
});