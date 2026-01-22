// export function buildScene(){
//     console.log("Building scene...");
// }

// export function update(){
//     console.log("Updating scene...");
// }

// main.js
import * as THREE from 'https://csc-vu.github.io/lib/three.module.js';
import { Bullet } from './weapons.js';

let sceneRef, cameraRef;

// --- arena / scale ---
const ARENA_W = 24;
const ARENA_H = 14;
const HALF_W = ARENA_W / 2;
const HALF_H = ARENA_H / 2;
const WALL_PAD = 0.8;

// --- player state ---
const player = {
  obj: null,
  pos: new THREE.Vector3(0, 0, 0),
  vel: new THREE.Vector3(0, 0, 0),
  radius: 0.5,
};

// --- input ---
const keys = new Set();
const mouseNDC = new THREE.Vector2();
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const aimPoint = new THREE.Vector3();

// --- timing (fixed timestep) ---
let lastT = performance.now();
let acc = 0;
const FIXED_DT = 1 / 120; // 120 Hz sim feels crisp
const MAX_FRAME = 1 / 15; // avoid spiral-of-death if tab stutters

const bullets = [];


const vertexShader = `
  varying vec3 vNormal;

  void main() {
    vNormal = normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;
  varying vec3 vNormal;

  void main() {
    float light = dot(normalize(vNormal), vec3(0.0, 0.0, 1.0));
    vec3 gold = vec3(1.0, 0.78, 0.25);
    gl_FragColor = vec4(gold * light, 1.0);
  }
`;



const fragmentShader2 = `
  void mainImage( out vec4 fragColor, in vec2 fragCoord )
{
    // Normalized pixel coordinates (from 0 to 1)
    vec2 uv = fragCoord/iResolution.xy;
    float h  = uv.y;
    vec3 colorA = vec3(0.149, 0.141, 0.912);
    vec3 colorB = vec3(1.000, 0.833, 0.224);
    vec3 color_horizon = vec3(1.0, 0.55, 0.15);  // orange-yellow
    vec3 color_lowMid  = vec3(0.9, 0.25, 0.15); // red-orange
    vec3 color_highMid = vec3(0.5, 0.05, 0.3);   // magenta-ish
    vec3 color_top     = vec3(0.1, 0.0, 0.2);   // deep violet

    
    float h_start = 0.0;
    
    float h1 = 0.3;
    
    float h2 = 0.7;
    
    float h_end = 1.0;

    float t = smoothstep(h_start, h_end, h);
    vec3 skyColor1 = mix(color_horizon, color_lowMid, t);
    vec3 skyColor2 = mix(color_lowMid, color_highMid, t);
    vec3 skyColor3 = mix(color_highMid, color_top, t);
    
    vec3 col = color_horizon;

    float t0 = smoothstep(h_start, h1, h);
    col = mix(color_horizon, color_lowMid, t0);

    float t1 = smoothstep(h1, h2, h);
    col = mix(col, color_highMid, t1);

    float t2 = smoothstep(h2, h_end, h);
    col = mix(col, color_top, t2);

    // Time varying pixel color
    //vec3 col = 0.5 + 0.5*cos(iTime+uv.xyx+vec3(0,2,4));

    // Output to screen
    //fragColor = vec4(col,1.0);
    float c = 0.5 + 0.5 * sin(iTime + uv.y * 10.0);
    fragColor = vec4(vec3(col), 1.0);
}`;

export function buildScene(scene, camera /*, tControls */) {
  sceneRef = scene;
  cameraRef = camera;

  // Lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 0.8);
  dir.position.set(10, 20, 10);
  scene.add(dir);

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ARENA_W, ARENA_H),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // Grid helper
  const grid = new THREE.GridHelper(ARENA_W, ARENA_W, 0x444444, 0x333333);
  grid.position.y = 0.001;
  scene.add(grid);

  // Player (simple capsule-ish proxy)
  const group = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(player.radius, player.radius, 1.2, 16),
    new THREE.MeshStandardMaterial({ color: 0x4aa3ff, roughness: 0.6 })
  );
  body.position.y = 0.6;
  group.add(body);

  const nose = new THREE.Mesh(
    new THREE.BoxGeometry(0.15, 0.15, 0.6),
    new THREE.MeshStandardMaterial({ color: 0xffd166, roughness: 0.5 })
  );
  nose.position.set(0, 0.8, 0.6);
  group.add(nose);

  group.position.copy(player.pos);
  scene.add(group);

  player.obj = group;

  // Pseudo-code / structure only
  const skyGeo = new THREE.PlaneGeometry(200, 100); // big
  const skyMat = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader2,
  // uniforms
});
  const skyMesh = new THREE.Mesh(skyGeo, skyMat);

  // Face the camera. Your camera looks roughly toward negative Z,
  // so we want the plane's front side to face +Z or -Z depending on your winding.
  // Easiest: rotate X to stand it up, then rotate Y 180 if needed.
  skyMesh.rotation.x = -Math.PI / 2.0; // if you want it as vertical wall, tweak as needed
  // More robust: make it vertical and rotate around Y to face the camera:
  skyMesh.rotation.set(0, 0, 0);      // vertical plane facing +Z by default
  skyMesh.position.set(0, 20, -50);   // behind the whole arena, up a bit

  // Important flags:
  skyMesh.material.depthWrite = false;  // don't write to depth
  skyMesh.renderOrder = -1;             // render before other stuff if needed
  skyMesh.frustumCulled = false;       // don't cull when camera moves

  scene.add(skyMesh);


  rings();

  // Input listeners
  window.addEventListener('keydown', (e) => keys.add(e.code));
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
  window.addEventListener('mousedown', onMouseDown);

  window.addEventListener('mousemove', (e) => {
    mouseNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  });

  const muzzle = new THREE.Vector3(0, 1, 0);
  const target = new THREE.Vector3(10, 1, 10);
  spawnBullet(muzzle, target);

  // Camera framing (2.5D tilt)
  camera.position.set(0, 10, 18);
  camera.lookAt(0, 0, 0);
}

function rings() {
  const ringGeo = new THREE.TorusGeometry(1, 0.26, 16, 100);
  const uniforms = {
  uLightDir: { value: new THREE.Vector3(0.6, 0.9, 0.3).normalize() },
  uGold:     { value: new THREE.Color(1.0, 0.78, 0.25) }
};

// 4) Material that uses YOUR shaders
const ringMat = new THREE.ShaderMaterial({
  vertexShader,
  fragmentShader,
  uniforms
});
  // const ringMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });
  for (let i =0; i < 5 ; i++){
    const ring = new THREE.Mesh(ringGeo, ringMat);
    // ring.rotation.x = Math.PI / 2;
    ring.position.x = (Math.random() - 0.5) * ARENA_W * 0.8;
    ring.position.z = (Math.random() - 0.5) * ARENA_H * 0.8;
    ring.position.y = 1.2;
    // ring.scale.setScalar(1 + i * 0.3);
    sceneRef.add(ring);
  }
}

export function update(camera /*, tControls */) {
  const now = performance.now();
  let frameDt = (now - lastT) / 1000;
  lastT = now;
  frameDt = Math.min(frameDt, MAX_FRAME);
  acc += frameDt;

  // Update aim every frame (so facing is smooth)
  updateAim(camera);

  // Fixed-step player sim
  while (acc >= FIXED_DT) {
    stepSim(FIXED_DT);
    acc -= FIXED_DT;
  }

  // Variable-step bullets are fine for now
  updateBullets(frameDt);

  // Apply to render object
  player.obj.position.copy(player.pos);

  // Camera follow
  // const camTarget = player.pos.clone();
  // camera.position.lerp(
  //   new THREE.Vector3(camTarget.x, 18, camTarget.z + 18),
  //   0.12
  // );
  // camera.lookAt(camTarget.x, 0, camTarget.z);
}


function updateAim(camera) {
  raycaster.setFromCamera(mouseNDC, camera);
  raycaster.ray.intersectPlane(groundPlane, aimPoint);

  // Face aim point (ignore y)
  const dx = aimPoint.x - player.pos.x;
  const dz = aimPoint.z - player.pos.z;
  if (dx * dx + dz * dz > 1e-6) {
    player.obj.rotation.y = Math.atan2(dx, dz);
  }
}

function stepSim(dt) {
  // Movement parameters (tweak freely)
  const ACCEL = 68;     // how quickly you get up to speed
  const MAXS = 35;       // max speed
  const DRAG = 10;      // friction-ish

  // Desired direction from keys
  let x = 0, z = 0;
  if (keys.has('KeyW')) z -= 1;
  if (keys.has('KeyS')) z += 1;
  if (keys.has('KeyA')) x -= 1;
  if (keys.has('KeyD')) x += 1;

  const dir = new THREE.Vector3(x, 0, z);
  if (dir.lengthSq() > 0) dir.normalize();

  // Accelerate
  player.vel.x += dir.x * ACCEL * dt;
  player.vel.z += dir.z * ACCEL * dt;

  // Apply drag (exponential-ish, stable across dt)
  const dragFactor = Math.exp(-DRAG * dt);
  player.vel.x *= dragFactor;
  player.vel.z *= dragFactor;

  // Clamp speed
  const speedSq = player.vel.x * player.vel.x + player.vel.z * player.vel.z;
  if (speedSq > MAXS * MAXS) {
    const s = MAXS / Math.sqrt(speedSq);
    player.vel.x *= s;
    player.vel.z *= s;
  }

  // Integrate
  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;

  // Keep inside arena (simple clamp)
  const minX = -HALF_W + WALL_PAD;
  const maxX = HALF_W - WALL_PAD;
  const minZ = -HALF_H + WALL_PAD;
  const maxZ = HALF_H - WALL_PAD;

  player.pos.x = THREE.MathUtils.clamp(player.pos.x, minX, maxX);
  player.pos.z = THREE.MathUtils.clamp(player.pos.z, minZ, maxZ);
}

function spawnBullet( muzzleWorldPos, targetWorldPos) {
  const dir = new THREE.Vector3()
    .subVectors(targetWorldPos, muzzleWorldPos)  // target - origin
    .normalize();

  const bullet = new Bullet(muzzleWorldPos, dir, 40, 80);
  bullets.push(bullet);
  sceneRef.add(bullet.mesh);
}

function updateBullets(delta) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];

    b.update(delta);

    // TODO: collision here (we’ll do a first pass below)

    if (b.isExpired()) {
      sceneRef.remove(b.mesh);
      bullets.splice(i, 1);
    }
  }
}

function onMouseDown(e) {
  // Left click only
  if (e.button !== 0) return;

  // Make sure we have cameraRef
  if (!cameraRef) return;

  // Update aimPoint once right here (in case update() hasn't run yet this frame)
  raycaster.setFromCamera(mouseNDC, cameraRef);
  raycaster.ray.intersectPlane(groundPlane, aimPoint);

  // If ray misses the plane for some reason, bail
  if (!Number.isFinite(aimPoint.x) || !Number.isFinite(aimPoint.z)) return;

  // Use the player as the muzzle for now (temp gun)
  const muzzle = new THREE.Vector3(player.pos.x, 1.0, player.pos.z);

  const target = aimPoint.clone();
  spawnBullet(muzzle, target);
}

