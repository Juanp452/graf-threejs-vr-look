import * as THREE from 'three';
import {VRButton} from 'three/addons/webxr/VRButton.js';

/* ================= Configuración Slenderman: Edición Completa 8-Bits VR ================= */
const MAP_R = 72;               // Límite perimetral del mapa
const TOTAL_PAGES = 8;          // Las 8 páginas clásicas
const WALK_SPEED = 3.3;         // Velocidad caminando
const SPRINT_SPEED = 5.4;       // Velocidad esprintando
const rand = (a,b)=>a+Math.random()*(b-a);

/* ================= Render, escena, listener 3D y rig del jugador ================= */
const app = document.getElementById('app');
const vhsOverlay = document.getElementById('vhs-overlay');
const vhsRecText = document.getElementById('vhs-rec-text');
const vhsTracking = document.getElementById('vhs-tracking');
const renderer = new THREE.WebGLRenderer({antialias:false});
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));
renderer.setSize(app.clientWidth, app.clientHeight);
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const baseFogDensity = 0.056;
scene.fog = new THREE.FogExp2(0x020103, baseFogDensity);
const camera = new THREE.PerspectiveCamera(70, app.clientWidth/app.clientHeight, 0.05, 160);
camera.position.y = 1.6;

// AudioListener 3D vinculado a la cabeza del jugador para sonido espacial en Meta Quest 3
const audioListener = new THREE.AudioListener();
camera.add(audioListener);

const dolly = new THREE.Group(); dolly.add(camera); scene.add(dolly);
dolly.position.set(0,0,6);

document.getElementById('enter').appendChild(VRButton.createButton(renderer));
addEventListener('resize',()=>{
  renderer.setSize(app.clientWidth,app.clientHeight);
  camera.aspect = app.clientWidth/app.clientHeight; camera.updateProjectionMatrix();
});

/* ================= Estado del juego, Dificultad, Batería, Stamina y Micrófono ================= */
let pagesFound = 0, roundStartTime = 300, timeLeft = 300, sanity = 100;
let battery = 100, stamina = 100, exhausted = false;
let playing = false, paused = false;
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
let stealthTimer = 0;

function getNoiseThreshold(){
  return isNightmare() ? 0.017 : 0.028;
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
const PARTICLE_COUNT = 260;
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
  for(let i=0; i<PARTICLE_COUNT; i++){
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
const rainGeo = new THREE.BufferGeometry();
const rainPos = new Float32Array(RAIN_COUNT * 3);
for(let i=0; i<RAIN_COUNT; i++){
  rainPos[i*3]   = rand(-28, 28);
  rainPos[i*3+1] = rand(0, 14);
  rainPos[i*3+2] = rand(-28, 28);
}
rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
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
  for(let i=0; i<RAIN_COUNT; i++){
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
let previewTimeout = null;

function showCollectedPage(txt, count){
  const g = pagePreviewCv.getContext('2d');
  drawPageArt(g, pagePreviewCv.width, pagePreviewCv.height, txt);
  pageViewerCount.textContent = `PÁGINA ${count} / ${TOTAL_PAGES} RECOGIDA`;
  pageViewerEl.classList.remove('hidden');
  clearTimeout(previewTimeout);
  previewTimeout = setTimeout(()=> pageViewerEl.classList.add('hidden'), 2000);
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

  const dots = Math.floor(intensity * 1300);
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
  const vhsIntensity = Math.min(1, Math.max(sanityDistortion, staticLevel * 0.85, baseNightmareVhs));
  vhsOverlay.style.setProperty('--vhs-intensity', vhsIntensity.toFixed(2));
  const glitching = vhsIntensity > 0.55 || screamerTimer > 0 || invertControlsTimer > 0;
  vhsOverlay.classList.toggle('glitch', glitching);
  vhsTracking.classList.toggle('hidden', !glitching);

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

    g.fillStyle='#ff001e'; g.font='bold 15px monospace';
    g.fillText(`CORDURA:${Math.max(0,Math.ceil(sanity))}%  BAT:${Math.ceil(battery)}%`,160,58);

    g.fillStyle='#29adff'; g.font='bold 14px monospace';
    g.fillText(`STAM:${Math.ceil(stamina)}% ${isNightmare()?'[PESADILLA]':'[NORMAL]'}`,160,84);

    g.textAlign='left';
    g.fillStyle='#aaaaaa'; g.font='bold 13px monospace';
    g.fillText('RUIDO AMBIENTE (MIC):', 24, 116);

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
  }
  panelTex.needsUpdate = true;
}
const panel = new THREE.Mesh(new THREE.PlaneGeometry(.19,.115), new THREE.MeshBasicMaterial({map:panelTex}));
panel.position.set(0,.075,.02); panel.rotation.x = -Math.PI/3;

/* ================= Inicializar Micrófono del Mundo Real (Sin Supresión de Ruido) ================= */
async function initMicrophone(){
  if(micReady || !navigator.mediaDevices?.getUserMedia) return;
  try{
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false
      }
    });
    const micCtx = new (window.AudioContext || window.webkitAudioContext)();
    const src = micCtx.createMediaStreamSource(stream);
    micAnalyser = micCtx.createAnalyser();
    micAnalyser.fftSize = 256;
    micAnalyser.smoothingTimeConstant = 0.4;
    micData = new Uint8Array(micAnalyser.frequencyBinCount);
    src.connect(micAnalyser);
    micReady = true;
  } catch(err){
    micReady = false;
    noiseStatEl.textContent = 'SIN MIC';
  }
}

function updateMicrophone(){
  if(micReady && micAnalyser){
    micAnalyser.getByteTimeDomainData(micData);
    let sum = 0;
    for(let i=0; i<micData.length; i++){
      const v = (micData[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / micData.length);
    micLevel = micLevel * 0.55 + rms * 0.45;
  } else {
    micLevel = 0;
  }

  const thresh = getNoiseThreshold();
  const pct = Math.min(100, Math.round((micLevel / (thresh * 2.2)) * 100));
  noiseFillEl.style.width = `${pct}%`;

  noiseBoxEl.classList.remove('warn', 'danger');
  if(!micReady){
    noiseStatEl.textContent = 'SIN MIC';
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
const btnStartPc = document.getElementById('btn-start-pc');
const btnRetry   = document.getElementById('btn-retry');
const diffBtns   = document.querySelectorAll('.diff-btn');
const modeDescEl = document.getElementById('mode-desc');

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
  resetGame();
  playing = true;
  startMenu.classList.add('hidden');
  endScreen.classList.add('hidden');
  hudOverlay.classList.remove('hidden');
}

btnStartPc.addEventListener('click', startGameFromMenu);
btnRetry.addEventListener('click', ()=>{
  resetGame();
  endScreen.classList.add('hidden');
  startMenu.classList.remove('hidden');
});

function finishGame(won, reasonText){
  paused = true;
  playing = false;
  hudOverlay.classList.add('hidden');
  pageViewerEl.classList.add('hidden');

  const elapsed = roundStartTime - timeLeft;
  document.getElementById('end-tag').textContent   = won ? '🏆 VICTORIA' : '💀 DERROTA';
  document.getElementById('end-title').textContent = reasonText;
  document.getElementById('st-pages').textContent  = `${pagesFound} / ${TOTAL_PAGES}`;
  document.getElementById('st-time').textContent   = formatTime(elapsed);
  document.getElementById('st-heard').textContent  = `${timesHeard}`;
  document.getElementById('st-dist').textContent   = `${Math.round(distanceWalked)} m`;

  const recMsgEl = document.getElementById('end-record-msg');
  recMsgEl.textContent = '';

  if(won){
    const key = isNightmare() ? 'slender_rec_nightmare' : 'slender_rec_normal';
    const prev = localStorage.getItem(key);
    if(!prev || elapsed < parseFloat(prev)){
      localStorage.setItem(key, elapsed.toString());
      recMsgEl.textContent = '★ ¡NUEVO RÉCORD DE TIEMPO GUARDADO! ★';
      loadRecords();
    }
  }

  if(renderer.xr.isPresenting){
    setTimeout(()=>{
      resetGame();
      startMenu.classList.remove('hidden');
    }, 3500);
  } else {
    endScreen.classList.remove('hidden');
  }
}

function resetGame(){
  const nightmare = isNightmare();
  roundStartTime = nightmare ? 180 : 300;
  pagesFound = 0; timeLeft = roundStartTime; sanity = 100;
  battery = 100; stamina = 100; exhausted = false; flashlightOn = true;
  timesHeard = 0; heardCooldown = 0; distanceWalked = 0;
  paused = false; screamerTimer = 0; nextTpTimer = nightmare ? 4.5 : 7.0;
  flashFailTimer = 0; stealthTimer = 0; invertControlsTimer = 0; breathTimer = 0;

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
  slender.position.set(0,0, nightmare ? -18 : -26);
  dolly.position.set(0,0,6);
  drawPanel();
}
resetGame();

/* ================= Audio Terror, Música por Capas y Audio Espacial 3D ================= */
let ac, master, noiseBuffer, slenderPosAudio, whisperPosAudio, flashBuzzGain;

function initAudio(){
  if(ac){
    if(ac.state === 'suspended') ac.resume();
    return;
  }
  ac = new (window.AudioContext||window.webkitAudioContext)();
  master = ac.createGain(); master.gain.value = 0.52; master.connect(ac.destination);

  const bufSize = ac.sampleRate * 2;
  noiseBuffer = ac.createBuffer(1, bufSize, ac.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for(let i=0;i<bufSize;i++) data[i] = Math.random()*2 - 1;

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
  const whispSrc = audioListener.context.createBufferSource();
  whispSrc.buffer = noiseBuffer; whispSrc.loop = true;
  const whispFilter = audioListener.context.createBiquadFilter();
  whispFilter.type = 'bandpass'; whispFilter.frequency.value = 1450; whispFilter.Q.value = 5.0;
  const whispGain = audioListener.context.createGain();
  whispGain.gain.value = 0.0;
  whispSrc.connect(whispFilter).connect(whispGain);
  whisperPosAudio.setNodeSource(whispGain);
  whisperPosAudio.position.set(0, 0, 0.75); // Justo detrás de tu cabeza
  camera.add(whisperPosAudio);
  whispSrc.start();

  setInterval(()=>{
    if(!ac || ac.state !== 'running') return;
    if(!playing || paused){ whispGain.gain.value = 0; return; }
    camera.getWorldPosition(head);
    const dist = head.distanceTo(slender.position);
    const danger = Math.max(0, (14 - dist) / 14, (50 - sanity) / 50);
    whispGain.gain.setTargetAtTime(danger * 0.16, ac.currentTime, 0.15);
    whispFilter.frequency.setTargetAtTime(1100 + Math.random() * 900, ac.currentTime, 0.1);
  }, 180);

  // 3. Audio Espacial 3D de la Radio Rota en la Cabaña (estática intermitente)
  const radioPosAudio = new THREE.PositionalAudio(audioListener);
  const radSrc = audioListener.context.createBufferSource();
  radSrc.buffer = noiseBuffer; radSrc.loop = true;
  const radFilter = audioListener.context.createBiquadFilter();
  radFilter.type = 'bandpass'; radFilter.frequency.value = 2100; radFilter.Q.value = 3.0;
  const radGain = audioListener.context.createGain();
  radGain.gain.value = 0.18;
  radSrc.connect(radFilter).connect(radGain);
  radioPosAudio.setNodeSource(radGain);
  radioPosAudio.setRefDistance(2.5);
  radioPosAudio.setMaxDistance(22);
  oldRadio.add(radioPosAudio);
  radSrc.start();

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
  flashOsc.connect(flashBuzzGain).connect(master);
  flashOsc.start();

  // 6. Drone atmosférico + viento + lluvia fina ambiental
  const droneOsc = ac.createOscillator();
  const droneGain = ac.createGain();
  droneOsc.type = 'sawtooth';
  droneOsc.frequency.value = 41.2;
  const lpf = ac.createBiquadFilter();
  lpf.type = 'lowpass'; lpf.frequency.value = 105;
  droneGain.gain.value = 0.12;
  droneOsc.connect(lpf).connect(droneGain).connect(master);
  droneOsc.start();

  const wind = ac.createBufferSource();
  wind.buffer = noiseBuffer; wind.loop = true;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass'; filter.frequency.value = 280; filter.Q.value = 3.2;
  const windGain = ac.createGain(); windGain.gain.value = 0.075;
  wind.connect(filter).connect(windGain).connect(master);
  wind.start();

  // 7. Sonidos ambientales aleatorios por zona (grillos, cuervos, campanas, ramas rotas)
  setInterval(()=>{
    if(ac.state !== 'running' || !playing || paused) return;
    const r = Math.random();

    if(currentZone === 'CEMENTERIO' && r < 0.45){
      // Campanada fúnebre grave con eco + graznido de cuervo
      tone(110, 1.8, 'sine', 0.14, 0.96, 0);
      tone(220, 1.2, 'triangle', 0.05, 0.95, 0.05);
      pannedNoise(0.22, 1600, 0.08, rand(-0.8, 0.8));
    } else if(r < 0.32){
      // Grillos nocturnos 8-bits
      for(let k=0; k<3; k++) tone(2650, 0.03, 'square', 0.025, 0, k*0.07);
    } else if(r < 0.62){
      // Crujido de rama rota a izquierda o derecha (paranoia)
      const pan = Math.random() < 0.5 ? -0.85 : 0.85;
      pannedNoise(0.09, 950, 0.11, pan);
      pannedNoise(0.06, 520, 0.09, pan, 0.06);
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
  const musicBox = [659.2, 698.5, 466.2, 440.0, 0, 523.3, 493.9, 329.6, 311.1, 0, 220.0, 233.1];
  const deepHits = [55.0, 0, 51.9, 0, 49.0, 0, 46.2, 43.6];
  let step = 0;

  function playHorrorMusic(){
    if(ac.state === 'running' && playing && !paused){
      // CAPA 1 (2+ notas o Pesadilla): Bajo pulsante grave
      if(pagesFound >= 2 || isNightmare()){
        const d = deepHits[step % deepHits.length];
        if(d > 0) tone(d, 0.65, 'sawtooth', 0.09 + pagesFound*0.01, 0.7);
      }

      // CAPA 2 (4+ notas o Pesadilla): Caja de música desafinada
      if(pagesFound >= 4 || isNightmare()){
        const n = musicBox[step % musicBox.length];
        if(n > 0){
          const detune = (Math.random() - 0.5) * (10 + pagesFound*2 + (isNightmare()?14:0));
          tone(n + detune, 0.55, 'sine', 0.052);
          tone((n + detune)*2, 0.25, 'triangle', 0.018);
        }
      }

      // CAPA 3 (6+ notas): Trémolo agudo disonante de persecución final
      if(pagesFound >= 6 && step % 2 === 0){
        tone(880 + (step%3)*62, 0.14, 'sawtooth', 0.035, 0.85);
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
  flt.type = 'bandpass'; flt.frequency.value = freq; flt.Q.value = 1.5;
  const pan = ac.createStereoPanner();
  pan.pan.value = Math.max(-1, Math.min(1, panVal));
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  src.connect(flt).connect(pan).connect(g).connect(master);
  src.start(now); src.stop(now + dur);
}

function tone(f,d,type='square',v=.2,slide=0,when=0){
  if(!ac) return;
  const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime+when;
  o.type = type; o.frequency.setValueAtTime(f,t);
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,f*slide),t+d);
  g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(.0001,t+d);
  o.connect(g).connect(master); o.start(t); o.stop(t+d);
}

function playOriginalSlenderScreamerSound(){
  if(!ac || !noiseBuffer) return;
  const now = ac.currentTime;

  const staticSrc = ac.createBufferSource();
  staticSrc.buffer = noiseBuffer;
  const staticFilter = ac.createBiquadFilter();
  staticFilter.type = 'bandpass';
  staticFilter.frequency.setValueAtTime(1800, now);
  staticFilter.Q.value = 0.7;

  const staticGain = ac.createGain();
  staticGain.gain.setValueAtTime(0.65, now);
  staticGain.gain.exponentialRampToValueAtTime(0.01, now + 0.95);

  staticSrc.connect(staticFilter).connect(staticGain).connect(master);
  staticSrc.start(now);
  staticSrc.stop(now + 0.95);

  [55.0, 58.27, 82.41, 116.54, 233.08].forEach(freq=>{
    tone(freq, 0.9, 'sawtooth', 0.24, 0.85, 0);
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
    // Jadeo pesado al quedarse sin stamina
    pannedNoise(0.24, 520, 0.075, 0, 0);
    pannedNoise(0.28, 390, 0.065, 0, 0.28);
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
  initAudio(); initMicrophone(); resetGame(); playing = true;
  startMenu.classList.add('hidden');
  endScreen.classList.add('hidden');
  hudOverlay.classList.remove('hidden');
});
renderer.xr.addEventListener('sessionend',()=>{
  playing = false; resetGame();
  startMenu.classList.remove('hidden');
  hudOverlay.classList.add('hidden');
});

/* ================= Controles VR (Agarre Físico + Sprint) y Teclado ================= */
const tmp = new THREE.Vector3(), head = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
const UP = new THREE.Vector3(0,1,0);
const ctrls = [];
let vrGrabPressed = false, vrSprintPressed = false;
function pulse(c,i,ms){ c.userData.src?.gamepad?.hapticActuators?.[0]?.pulse(i,ms); }

for(let i=0;i<2;i++){
  const c = renderer.xr.getController(i);
  const vis = new THREE.Mesh(new THREE.BoxGeometry(.035,.035,.16), new THREE.MeshBasicMaterial({color:0x222228}));
  c.add(vis); dolly.add(c);
  c.userData = {src:null, hand:'unknown'};

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

  c.addEventListener('selectstart',()=>{
    if(!playing) return;
    initAudio();
    if(c.userData.hand === 'left'){
      vrSprintPressed = true;
    } else {
      if(battery > 1){
        flashlightOn = !flashlightOn;
        sfx('click');
        drawPanel();
        pulse(c,.4,40);
      }
    }
  });
  c.addEventListener('selectend',()=>{
    if(c.userData.hand === 'left') vrSprintPressed = false;
  });

  c.addEventListener('squeezestart',()=>{ vrGrabPressed = true; pulse(c,.25,30); });
  c.addEventListener('squeezeend',()=>{ vrGrabPressed = false; });

  ctrls.push(c);
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
  keys[k] = true;
  if(!playing) return;
  initAudio();
  if(k === 'f' && battery > 1){
    flashlightOn = !flashlightOn;
    sfx('click');
    drawPanel();
  }
});
addEventListener('keyup',e=>keys[e.key.toLowerCase()] = false);
let snapLock = false;

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
  const stepVec = new THREE.Vector3().addScaledVector(fwd, mz * curSpeed * dt).addScaledVector(right, mx * curSpeed * dt);
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

    let takeBat = b.m.position.distanceTo(head) < 1.25;
    for(const c of ctrls){ c.getWorldPosition(tmp); if(tmp.distanceTo(b.m.position) < 0.65) takeBat = true; }

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

    let got = dist < 1.35 && fwd.dot(toPage) > 0.45;
    for(const c of ctrls){
      c.getWorldPosition(tmp);
      const handDist = tmp.distanceTo(p.m.position);
      if(handDist < 0.55 || (vrGrabPressed && handDist < 0.9)) got = true;
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
      nextTpTimer = Math.max(2.4, (9.5 - pagesFound * 0.65) / diffMultiplier);

      if(pagesFound >= TOTAL_PAGES){
        sfx('win'); drawPanel('ESCAPASTE!');
        finishGame(true, isNightmare() ? '¡SOBREVIVISTE A LA PESADILLA!' : '¡RECOLECTASTE LAS 8 NOTAS Y ESCAPASTE!');
      }
    }
  }
}

function teleportSlender(distFromPlayer){
  camera.getWorldPosition(head);
  const ang = rand(0, Math.PI*2);
  let nx = head.x + Math.cos(ang)*distFromPlayer;
  let nz = head.z + Math.sin(ang)*distFromPlayer;
  const d = Math.hypot(nx, nz);
  if(d > MAP_R - 2){
    nx *= (MAP_R - 2) / d;
    nz *= (MAP_R - 2) / d;
  }
  slender.position.set(nx, 0, nz);
  stealthTimer = 0;
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
      nextTpTimer = Math.max(4.0, (11.0 - pagesFound * 0.5) / diffMultiplier);
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
    nextTpTimer = Math.max(2.4, (9.0 - pagesFound*0.65) / diffMultiplier);
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

  const toSlender = new THREE.Vector3(dx,0,dz).normalize();
  const lookingAtHim = fwd.dot(toSlender) > 0.72 && dist < (15 + pagesFound) && flashlightOn;

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
  if(sanity < phantomSanityLimit){
    phantomTimer -= dt;
    if(phantomTimer <= 0 && !phantomSlender.visible){
      const ang = rand(-0.6, 0.6);
      const dir = fwd.clone().applyAxisAngle(UP, ang);
      phantomSlender.position.set(head.x + dir.x * rand(6, 10), 0, head.z + dir.z * rand(6, 10));
      phantomSlender.lookAt(head.x, 0, head.z);
      phantomSlender.visible = true;
      phantomTimer = 1.4;
    } else if(phantomSlender.visible){
      const toPhantom = phantomSlender.position.clone().sub(head).normalize();
      if(phantomTimer <= 0 || (flashlightOn && fwd.dot(toPhantom) > 0.88)){
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
  updateMicrophone();
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