import * as THREE from 'https://esm.sh/three@0.160.0';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';

// ======================================================
// SCENE
// ======================================================
const scene = new THREE.Scene();

// ======================================================
// CAMERA
// z = distance. 4 closer / 5 current / 6-7 more air
// ======================================================
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 5);

// ======================================================
// RENDERER
// ======================================================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// ======================================================
// BLOOM / REAL GLOW
// strength / radius / threshold
// ======================================================
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.6, // glow strength
  0.5, // glow softness
  0.2  // glow threshold
);
composer.addPass(bloomPass);

// ======================================================
// LIGHTS
// ======================================================
scene.add(new THREE.AmbientLight(0xffe8c7, 1));

const keyLight = new THREE.DirectionalLight(0xffd2a1, 3);
keyLight.position.set(4, 5, 5);
scene.add(keyLight);

// ======================================================
// VISOR LIGHT
// brightness / distance / beam width / softness
// ======================================================
const visorLight = new THREE.SpotLight(
  0xffb366,
  8,
  6,
  Math.PI / 10,
  0.6
);

visorLight.position.set(0, 0.65, 1.2);
visorLight.target.position.set(0, 0.55, 3);

scene.add(visorLight);
scene.add(visorLight.target);

// ======================================================
// CIRCLE SPRITE (round particles instead of squares)
// ======================================================
const circleCanvas = document.createElement('canvas');
circleCanvas.width = 64;
circleCanvas.height = 64;
const circleCtx = circleCanvas.getContext('2d');
const circleGradient = circleCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
circleGradient.addColorStop(0, 'rgba(255,255,255,1)');
circleGradient.addColorStop(0.5, 'rgba(255,255,255,0.6)');
circleGradient.addColorStop(1, 'rgba(255,255,255,0)');
circleCtx.fillStyle = circleGradient;
circleCtx.fillRect(0, 0, 64, 64);

const circleTexture = new THREE.CanvasTexture(circleCanvas);
circleTexture.colorSpace = THREE.SRGBColorSpace;

// ======================================================
// BACK STARFIELD (far stars)
// ======================================================
const starGeometry = new THREE.BufferGeometry();
const starCount = 3000;

const starPositions = [];

for (let i = 0; i < starCount; i++) {
  starPositions.push(
    (Math.random() - 0.5) * 80, // x
    (Math.random() - 0.5) * 80, // y
    (Math.random() - 0.5) * 80  // z
  );
}

starGeometry.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(starPositions, 3)
);

const starMaterial = new THREE.PointsMaterial({
  color: 0xffffff,
  size: 0.08,
  map: circleTexture,
  alphaMap: circleTexture,
  transparent: true,
  depthWrite: false,
  opacity: 0.8
});

const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

// ======================================================
// FRONT PARTICLES (floating dust in front)
// ======================================================
const dustGeometry = new THREE.BufferGeometry();
const dustCount = 300;

const dustPositions = [];

for (let i = 0; i < dustCount; i++) {
  dustPositions.push(
    (Math.random() - 0.5) * 8,
    (Math.random() - 0.5) * 6,
    Math.random() * 4 // только перед камерой
  );
}

dustGeometry.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(dustPositions, 3)
);

const dustMaterial = new THREE.PointsMaterial({
  color: 0xffe8c7,
  size: 0.02,
  map: circleTexture,
  alphaMap: circleTexture,
  transparent: true,
  depthWrite: false,
  opacity: 0.50
});

const dust = new THREE.Points(dustGeometry, dustMaterial);
scene.add(dust);

// ======================================================
// MODEL
// ======================================================
let model;
let baseY = 0;

const loader = new GLTFLoader();

loader.load('astronaut.glb', (gltf) => {
  model = gltf.scene;
  scene.add(model);

  const box = new THREE.Box3().setFromObject(model);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());

  model.position.sub(center);

  // ====================================================
  // SCALE
  // 2.4 = твоё последнее значение
  // больше: 3.0 / maxDim, 3.5 / maxDim
  // меньше: 2.0 / maxDim
  // ====================================================
  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 1.8 / maxDim;
  model.scale.setScalar(scale);

  // ====================================================
  // VERTICAL POSITION
  // больше число = ниже модель
  // ====================================================
  model.position.y -=0.0007;
  baseY = model.position.y;

  // starting angle
  model.rotation.y = -0.25;
});

// ======================================================
// INTERACTION / FULL DRAG
// left/right drag = rotate Y
// up/down drag = tilt X
// X tilt limited to 45 degrees
// ======================================================
let isDragging = false;

let previousX = 0;
let previousY = 0;

let velocityY = 0;
let velocityX = 0;

let targetRotationY = -0.25;
let targetRotationX = 0.05;

// 45 degrees tilt limit
const maxTiltX = Math.PI / 4;

window.addEventListener('pointerdown', (e) => {
  isDragging = true;
  previousX = e.clientX;
  previousY = e.clientY;
});

window.addEventListener('pointermove', (e) => {
  if (!isDragging || !model) return;

  const deltaX = e.clientX - previousX;
  const deltaY = e.clientY - previousY;

  previousX = e.clientX;
  previousY = e.clientY;

  // ====================================================
  // DRAG SPEED
  // deltaX controls left/right rotation
  // deltaY controls forward/back tilt
  // ====================================================
  targetRotationY += deltaX * 0.01;
  targetRotationX += deltaY * 0.006;

  // ====================================================
  // DRAG INERTIA
  // bigger values = stronger throw
  // ====================================================
  velocityY = deltaX * 0.0008;
  velocityX = deltaY * 0.0005;

  // ====================================================
  // LIMIT X TILT
  // prevents flipping the model upside down
  // Math.PI / 4 = 45 degrees
  // Math.PI / 6 = 30 degrees
  // ====================================================
  targetRotationX = Math.max(
    -maxTiltX,
    Math.min(maxTiltX, targetRotationX)
  );
});

window.addEventListener('pointerup', () => {
  isDragging = false;
});

window.addEventListener('pointerleave', () => {
  isDragging = false;
});

window.addEventListener('pointercancel', () => {
  isDragging = false;
});

// ======================================================
// ANIMATION
// ======================================================
function animate() {
  requestAnimationFrame(animate);

  const time = performance.now() * 0.001;

  if (model) {
    // ==================================================
    // AUTO ROTATION + INERTIA
    // 0.002 = slow auto rotation
    // velocityY = drag inertia
    // ==================================================
    if (!isDragging) {
      targetRotationY += 0.002;
      targetRotationY += velocityY;
      targetRotationX += velocityX;

      velocityY *= 0.94; // Y inertia decay
      velocityX *= 0.92; // X inertia decay

      // slowly return X tilt back to neutral
      targetRotationX += (0.05 - targetRotationX) * 0.015;

      // keep tilt inside 45 degrees even with inertia
      targetRotationX = Math.max(
        -maxTiltX,
        Math.min(maxTiltX, targetRotationX)
      );
    }

    // ==================================================
    // SMOOTH ROTATION
    // 0.08 = smoothness
    // ==================================================
    model.rotation.y += (targetRotationY - model.rotation.y) * 0.08;

    // ==================================================
    // FULL FORWARD / BACK TILT
    // targetRotationX = controlled by vertical drag
    // Math.sin = subtle zero-gravity motion
    // ==================================================
    model.rotation.x +=
      (targetRotationX + Math.sin(time * 0.6) * 0.04 - model.rotation.x) * 0.08;

    // ==================================================
    // FLOAT UP / DOWN
    // 1.2 = speed
    // 0.08 = amplitude
    // ==================================================
    model.position.y = baseY + Math.sin(time * 1.2) * 0.08;

    // ==================================================
    // LEFT / RIGHT TILT
    // depends on Y rotation + subtle wobble
    // ==================================================
    model.rotation.z =
      Math.sin(model.rotation.y * 0.7) * 0.12 +
      Math.sin(time * 0.8) * 0.03;
  }

  // ====================================================
  // SUBTLE SPACE MOVEMENT
  // ====================================================
  stars.rotation.y += 0.0003;

  dust.rotation.y += 0.0006;
  dust.position.y = Math.sin(time * 0.2) * 0.2;

  // ====================================================
  // VISOR PULSE
  // 8 = base brightness
  // 2 = pulse speed
  // 1 = pulse strength
  // ====================================================
  visorLight.intensity = 8 + Math.sin(time * 2) * 1;

  composer.render();
}

animate();

// ======================================================
// RESIZE
// ======================================================
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});