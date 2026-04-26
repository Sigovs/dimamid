import * as THREE from 'https://esm.sh/three@0.160.0';
import { GLTFLoader } from 'https://esm.sh/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'https://esm.sh/three@0.160.0/examples/jsm/postprocessing/UnrealBloomPass.js';

// SCENE
// bg.jpg lives in CSS under the canvas, so bloom/postprocessing
// cannot bleed into it and the astronaut stays clean
const scene = new THREE.Scene();

// CAMERA
const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.1,
  1000
);
camera.position.set(0, 0, 5);

// RENDERER — transparent, so the CSS bg is visible underneath
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});

renderer.setClearColor(0x000000, 0);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

document.body.appendChild(renderer.domElement);

// COMPOSER / BLOOM (matches reference: 1.6 / 0.5 / 0.2)
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.6, // glow strength
  0.5, // glow softness
  0.2  // glow threshold
);
// --- transparency fix for UnrealBloomPass ---
// (1) "basic" copies the scene to canvas — must respect alpha
bloomPass.basic.transparent = true;
// (2) "blendMaterial" additively blends bloom on top — its default shader
//     writes alpha=1 everywhere, which makes the canvas fully opaque.
//     Replace it so alpha = luminance of the bloom pixel: bright halos
//     become opaque, empty areas stay transparent, CSS bg shows through.
bloomPass.blendMaterial = new THREE.ShaderMaterial({
  uniforms: bloomPass.copyUniforms,
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform float opacity;
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float luma = max(max(texel.r, texel.g), texel.b);
      gl_FragColor = vec4(opacity * texel.rgb, opacity * luma);
    }
  `,
  blending: THREE.AdditiveBlending,
  premultipliedAlpha: true,
  depthTest: false,
  depthWrite: false,
  transparent: true
});
composer.addPass(bloomPass);

// FILM GRAIN — DOM ref, randomised every frame in animate()
const grain = document.querySelector('.grain');

// SLOGAN — split into per-char spans and stagger their rise (staircase reveal)
const sloganEl = document.querySelector('.slogan');
if (sloganEl) {
  const text = sloganEl.textContent;
  sloganEl.textContent = '';
  // Tunables
  const SLOGAN_BASE_DELAY = 0.4;     // seconds before first wave arrives
  const WAVE_GAP = 0.18;             // seconds between waves
  const WAVE_SIZES = [3, 2, 1];      // letters per wave, repeats
  const FROM_DISTANCE_VW = 60;       // how far off-screen each letter starts (vw units)

  // build wave indices for one side: outermost-inward, cycling 3-2-1
  function buildWaveIndices(count) {
    const out = [];
    let waveIdx = 0;
    let posInWave = 0;
    let currentSize = WAVE_SIZES[0];
    for (let i = 0; i < count; i++) {
      out.push(waveIdx);
      posInWave++;
      if (posInWave >= currentSize) {
        waveIdx++;
        posInWave = 0;
        currentSize = WAVE_SIZES[waveIdx % WAVE_SIZES.length];
      }
    }
    return out;
  }

  const allChars = text.split('');
  const N = allChars.length;
  const mid = Math.ceil(N / 2);
  const leftWaves = buildWaveIndices(mid);
  const rightWaves = buildWaveIndices(N - mid);

  allChars.forEach((ch, i) => {
    const span = document.createElement('span');
    span.className = 'slogan__char';
    span.textContent = ch === ' ' ? ' ' : ch;
    let waveIdx;
    if (i < mid) {
      // left half: outermost (i=0) flies first
      span.style.transform = `translateX(-${FROM_DISTANCE_VW}vw)`;
      waveIdx = leftWaves[i];
    } else {
      // right half: outermost (i=N-1) flies first → reverse mapping
      span.style.transform = `translateX(${FROM_DISTANCE_VW}vw)`;
      waveIdx = rightWaves[N - 1 - i];
    }
    span.style.animationDelay = `${SLOGAN_BASE_DELAY + waveIdx * WAVE_GAP}s`;
    sloganEl.appendChild(span);
  });

  // GLITCH — periodically swap a few adjacent letters, then restore.
  const GLITCH_START_MS = 4000;       // wait for staircase reveal to finish
  const GLITCH_MIN_GAP_MS = 2500;     // shortest pause between bursts
  const GLITCH_MAX_GAP_MS = 4500;     // longest pause between bursts
  const GLITCH_HOLD_MS = 140;         // how long letters stay swapped
  const GLITCH_SWAPS_PER_BURST = 3;   // how many pairs to swap each burst

  const sloganChars = Array.from(sloganEl.querySelectorAll('.slogan__char'));
  const sloganOriginal = sloganChars.map((el) => el.textContent);

  function glitchSwapLetters() {
    for (let n = 0; n < GLITCH_SWAPS_PER_BURST; n++) {
      const i = Math.floor(Math.random() * (sloganChars.length - 1));
      const a = sloganChars[i].textContent;
      const b = sloganChars[i + 1].textContent;
      // skip pairs that touch a space — don't break word boundaries
      if (a.trim() === '' || b.trim() === '') continue;
      sloganChars[i].textContent = b;
      sloganChars[i + 1].textContent = a;
    }
    setTimeout(() => {
      sloganChars.forEach((el, idx) => {
        el.textContent = sloganOriginal[idx];
      });
    }, GLITCH_HOLD_MS);
  }

  function scheduleSloganGlitch() {
    const wait = GLITCH_MIN_GAP_MS + Math.random() * (GLITCH_MAX_GAP_MS - GLITCH_MIN_GAP_MS);
    setTimeout(() => {
      glitchSwapLetters();
      scheduleSloganGlitch();
    }, wait);
  }
  setTimeout(scheduleSloganGlitch, GLITCH_START_MS);
}

// HUD — typewriter on load + live mission clock
const hudLines = document.querySelectorAll('[data-typewriter]');
const hudClock = document.querySelector('[data-clock]');
const hudStart = performance.now();

function typewrite(el, text, speed, startDelay) {
  el.textContent = '';
  el.classList.add('is-typing');
  setTimeout(() => {
    let i = 0;
    const tick = () => {
      if (i < text.length) {
        // innerHTML so we can keep entities like &nbsp;
        el.innerHTML += text[i++];
        setTimeout(tick, speed);
      } else {
        el.classList.remove('is-typing');
      }
    };
    tick();
  }, startDelay);
}

let hudCumulativeDelay = 0;
hudLines.forEach((el) => {
  const text = el.getAttribute('data-typewriter');
  typewrite(el, text, 22, hudCumulativeDelay);
  // each line waits for the previous to finish + a small gap
  hudCumulativeDelay += text.length * 22 + 120;
});

function updateHudClock() {
  if (!hudClock) return;
  const elapsed = performance.now() - hudStart;
  const total = Math.floor(elapsed / 1000);
  const cs = Math.floor((elapsed % 1000) / 10);   // centiseconds
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n) => String(n).padStart(2, '0');
  hudClock.textContent = `${pad(h)}:${pad(m)}:${pad(s)}:${pad(cs)}`;
}

// CUSTOM CURSOR (desktop only — CSS hides these on touch via media query)
const cursorDot = document.querySelector('.cursor-dot');
const cursorRing = document.querySelector('.cursor-ring');
let cursorX = 0;
let cursorY = 0;
let ringX = 0;
let ringY = 0;
const CURSOR_DOT_HALF = 3;   // half of 6px
const CURSOR_RING_HALF = 18; // half of 36px

window.addEventListener('pointermove', (e) => {
  cursorX = e.clientX;
  cursorY = e.clientY;
  if (cursorDot) {
    cursorDot.style.transform =
      `translate3d(${cursorX - CURSOR_DOT_HALF}px, ${cursorY - CURSOR_DOT_HALF}px, 0)`;
  }
});

// expand ring while dragging the astronaut for visual feedback
window.addEventListener('pointerdown', () => {
  if (cursorRing) cursorRing.classList.add('is-grabbing');
});
const clearGrab = () => cursorRing && cursorRing.classList.remove('is-grabbing');
window.addEventListener('pointerup', clearGrab);
window.addEventListener('pointerleave', clearGrab);
window.addEventListener('pointercancel', clearGrab);

// BG PARALLAX (mouse-driven, both axes)
const bgImage = document.querySelector('.bg-image');
let bgTargetX = 0; // -1..1, set by mousemove
let bgTargetY = 0;
let bgX = 0;       // current smoothed values, applied to transform
let bgY = 0;
// separate amplitudes — vertical is softer so it doesn't distract
const BG_PARALLAX_X_PX = 80;
const BG_PARALLAX_Y_PX = 40;
// separate easing — vertical lags slightly for a smoother feel
const BG_PARALLAX_X_EASE = 0.1;
const BG_PARALLAX_Y_EASE = 0.04;

window.addEventListener('pointermove', (e) => {
  bgTargetX = (e.clientX / window.innerWidth - 0.5) * 2;
  bgTargetY = (e.clientY / window.innerHeight - 0.5) * 2;
});

// LIGHTS
scene.add(new THREE.AmbientLight(0xffe8c7, 1));

const keyLight = new THREE.DirectionalLight(0xffd2a1, 3);
keyLight.position.set(4, 5, 5);
scene.add(keyLight);

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

// CIRCLE SPRITE
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

// BACK STARS
const starGeometry = new THREE.BufferGeometry();
const starCount = 2500;
const starPositions = [];

for (let i = 0; i < starCount; i++) {
  starPositions.push(
    (Math.random() - 0.5) * 60,
    (Math.random() - 0.5) * 40,
    -8 - Math.random() * 40
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
  opacity: 0.75
});

const stars = new THREE.Points(starGeometry, starMaterial);
scene.add(stars);

// FRONT DUST
const dustGeometry = new THREE.BufferGeometry();
const dustCount = 280;
const dustPositions = [];

for (let i = 0; i < dustCount; i++) {
  dustPositions.push(
    (Math.random() - 0.5) * 8,
    (Math.random() - 0.5) * 6,
    0.5 + Math.random() * 3.5
  );
}

dustGeometry.setAttribute(
  'position',
  new THREE.Float32BufferAttribute(dustPositions, 3)
);

const dustMaterial = new THREE.PointsMaterial({
  color: 0xffe8c7,
  size: 0.025,
  map: circleTexture,
  alphaMap: circleTexture,
  transparent: true,
  depthWrite: false,
  opacity: 0.45
});

const dust = new THREE.Points(dustGeometry, dustMaterial);
scene.add(dust);

// MODEL
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

  const maxDim = Math.max(size.x, size.y, size.z);
  const scale = 1.8 / maxDim;
  model.scale.setScalar(scale);

  model.position.y -= 0.7;
  baseY = model.position.y;

  model.rotation.y = -0.25;
});

// INTERACTION
let isDragging = false;
let previousX = 0;
let previousY = 0;

let velocityY = 0;
let velocityX = 0;

let targetRotationY = -0.25;
let targetRotationX = 0.05;

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

  targetRotationY += deltaX * 0.01;
  targetRotationX += deltaY * 0.006;

  velocityY = deltaX * 0.0008;
  velocityX = deltaY * 0.0005;

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

// ANIMATION
function animate() {
  requestAnimationFrame(animate);

  const time = performance.now() * 0.001;

  if (model) {
    if (!isDragging) {
      targetRotationY += 0.002;
      targetRotationY += velocityY;
      targetRotationX += velocityX;

      velocityY *= 0.3;
      velocityX *= 0.3;

      targetRotationX += (0.05 - targetRotationX) * 0.015;

      targetRotationX = Math.max(
        -maxTiltX,
        Math.min(maxTiltX, targetRotationX)
      );
    }

    model.rotation.y += (targetRotationY - model.rotation.y) * 0.08;

    model.rotation.x +=
      (targetRotationX + Math.sin(time * 0.6) * 0.04 - model.rotation.x) * 0.08;

    model.position.y = baseY + Math.sin(time * 1.2) * 0.08;

    model.rotation.z =
      Math.sin(model.rotation.y * 0.7) * 0.12 +
      Math.sin(time * 0.8) * 0.03;
  }

  stars.rotation.y += 0.00025;

  dust.rotation.y += 0.0006;
  dust.position.y = Math.sin(time * 0.2) * 0.2;

  visorLight.intensity = 8 + Math.sin(time * 2) * 1;

  // BG PARALLAX — mouse pushes bg in opposite direction, like camera panning
  bgX += (-bgTargetX * BG_PARALLAX_X_PX - bgX) * BG_PARALLAX_X_EASE;
  bgY += (-bgTargetY * BG_PARALLAX_Y_PX - bgY) * BG_PARALLAX_Y_EASE;
  if (bgImage) bgImage.style.transform = `translate3d(${bgX}px, ${bgY}px, 0)`;

  // CURSOR RING — lags behind the dot for a soft trailing feel
  ringX += (cursorX - ringX) * 0.18;
  ringY += (cursorY - ringY) * 0.18;
  if (cursorRing) {
    cursorRing.style.transform =
      `translate3d(${ringX - CURSOR_RING_HALF}px, ${ringY - CURSOR_RING_HALF}px, 0)`;
  }

  // GRAIN — shift the SVG noise tile every frame so it shimmers like film
  // (range 0–200 matches the tile size so edges never show)
  if (grain) {
    grain.style.backgroundPosition =
      `${(Math.random() * 200) | 0}px ${(Math.random() * 200) | 0}px`;
  }

  // HUD CLOCK — live mission time
  updateHudClock();

  composer.render();
}

animate();

// RESIZE
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
});