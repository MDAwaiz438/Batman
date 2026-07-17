

import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

// ═══════════ DOM ═══════════
const loader      = document.getElementById('loader');
const loaderFill  = document.getElementById('loader-bar-fill');
const hero        = document.getElementById('hero');
const navbar      = document.getElementById('navbar');
const heroContent = document.getElementById('hero-content');
const canvas      = document.getElementById('hero-canvas');
const ctx         = canvas.getContext('2d');

// ═══════════ LOADING SCREEN ═══════════
function runLoader() {
  const loadCanvasContainer = document.getElementById('loader');
  if (!loadCanvasContainer) return finishLoading();
  loadCanvasContainer.innerHTML = '';
  loadCanvasContainer.style.display = 'flex'; 

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 10;
  
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  loadCanvasContainer.appendChild(renderer.domElement);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
  scene.add(ambientLight);

  const batPathStr = "M483.92 0S481.38 24.71 466 40.11c-11.74 11.74-24.09 12.66-40.26 15.07-9.42 1.41-29.7 3.77-34.81-.79-2.37-2.11-3-21-3.22-27.62-.21-6.92-1.36-16.52-2.82-18-.75 3.06-2.49 11.53-3.09 13.61S378.49 34.3 378 36a85.13 85.13 0 0 0-30.09 0c-.46-1.67-3.17-11.48-3.77-13.56s-2.34-10.55-3.09-13.61c-1.45 1.45-2.61 11.05-2.82 18-.21 6.67-.84 25.51-3.22 27.62-5.11 4.56-25.38 2.2-34.8.79-16.16-2.47-28.51-3.39-40.21-15.13C244.57 24.71 242 0 242 0H0s69.52 22.74 97.52 68.59c16.56 27.11 14.14 58.49 9.92 74.73C170 140 221.46 140 273 158.57c69.23 24.93 83.2 76.19 90 93.6 6.77-17.41 20.75-68.67 90-93.6 51.54-18.56 103-18.59 165.56-15.25-4.21-16.24-6.63-47.62 9.93-74.73C656.43 22.74 726 0 726 0z";

  function createCustomBatGeometry() {
    const loader = new SVGLoader();
    const parsed = loader.parse(`<svg viewBox="0 0 800 300"><path d="${batPathStr}"></path></svg>`);
    const shapes = SVGLoader.createShapes(parsed.paths[0]);
    const geometry = new THREE.ExtrudeGeometry(shapes, { depth: 0.04, bevelEnabled: false });
    geometry.center();
    geometry.scale(0.012, -0.012, 0.012); 
    return geometry;
  }

  const geometry = createCustomBatGeometry();

  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    side: THREE.DoubleSide,
    vertexShader: `
      uniform float uTime;
      attribute float aWingSpeed;
      attribute float aSeed;
      
      void main() {
        vec3 transformed = vec3(position);
        float flapTimeline = uTime * aWingSpeed + aSeed;
        float distanceFromCenter = abs(transformed.x);
        
        // Bends the wing edges dynamically without distorting the body mesh
        if (distanceFromCenter > 0.15) {
          float wave = sin(flapTimeline) * 0.7 * (distanceFromCenter - 0.15);
          transformed.y += wave;
          transformed.z += abs(wave) * 0.2;
        }

        vec4 instancePosition = instanceMatrix * vec4(transformed, 1.0);
        gl_Position = projectionMatrix * modelViewMatrix * instancePosition;
      }
    `,
    fragmentShader: `
      void main() {
        gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0); // Matte White
      }
    `
  });

  const count = 200; // Natural count, reduced from 400
  
  const speedArray = new Float32Array(count);
  const seedArray = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    speedArray[i] = 16 + Math.random() * 10;
    seedArray[i] = Math.random() * 100;
  }
  
  geometry.setAttribute('aWingSpeed', new THREE.InstancedBufferAttribute(speedArray, 1));
  geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seedArray, 1));

  const batMesh = new THREE.InstancedMesh(geometry, material, count);
  scene.add(batMesh);

  const batsData = [];
  for (let i = 0; i < count; i++) {
    const stagger = i / count; 
    
    // Innate offset from the center-line. We will multiply this dynamically later.
    const innateSpread = (Math.random() * 20) - 10; 
    
    batsData.push({
      startX: -40 - (stagger * 50),
      startY: -30 - (stagger * 50),
      currentProgress: -(stagger * 60) - (Math.random() * 10), 
      speed: 25 + Math.random() * 15, 
      waveSpeed: 1 + Math.random() * 3,
      seed: Math.random() * 100,
      scaleModifier: 0.4 + Math.random() * 0.8, // Reduced scale back to a natural size
      innateSpread: innateSpread 
    });
  }

  const dummy = new THREE.Object3D();
  const clock = new THREE.Clock();
  
  let transitionTriggered = false;
  let keepRendering = true;

  function animateLoader() {
    if (!keepRendering) return;
    requestAnimationFrame(animateLoader);
    
    const time = clock.getElapsedTime();

    material.uniforms.uTime.value = time;

    for (let i = 0; i < count; i++) {
      const bat = batsData[i];
      bat.currentProgress += bat.speed * 0.016; 

      // Spread factor: peaks at currentProgress = 0 (center of screen) using a Gaussian bell curve
      const spreadFactor = Math.exp(-(bat.currentProgress * bat.currentProgress) / 200.0);
      
      // When at the edges, multiplier is 1 (narrow). At the center, it multiplies spread heavily (fan out).
      const dynamicSpread = bat.innateSpread * (1.0 + spreadFactor * 3.5);

      // Sweep diagonally bottom-left to top-right.
      // We apply dynamicSpread orthogonally (X = -Y) to push them out from the diagonal center-line.
      const translationX = bat.startX + (bat.currentProgress * 1.2) - dynamicSpread;
      const translationY = bat.startY + (bat.currentProgress * 1.0) + dynamicSpread;
      
      // Fly towards the camera, but cap Z so they don't blow up massive
      const translationZ = -30 + (bat.currentProgress * 0.6);

      const floatDriftX = Math.sin(time * bat.waveSpeed + bat.seed) * 1.5;
      const floatDriftY = Math.cos(time * bat.waveSpeed + bat.seed) * 0.8;

      dummy.position.set(translationX + floatDriftX, translationY + floatDriftY, translationZ);
      
      // Natural scaling without blocking the entire screen
      const distanceScale = THREE.MathUtils.mapLinear(translationZ, -30, 5, 0.1, 1.5);
      const finalScale = Math.max(0.01, distanceScale) * bat.scaleModifier;
      dummy.scale.set(finalScale, finalScale, finalScale);

      dummy.rotation.set(0.1, -0.3, 0.4);
      dummy.updateMatrix();
      batMesh.setMatrixAt(i, dummy.matrix);
    }
    
    batMesh.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);

    // Timing tuned for the massive wave
    if (time >= 1.2 && !transitionTriggered) {
      transitionTriggered = true;
      finishLoading(); // This adds .done, triggering the huge diagonal slide wipe!
    }
    if (time > 4.5) {
      keepRendering = false;
      renderer.dispose();
      loadCanvasContainer.remove();
    }
  }

  animateLoader();
}

function finishLoading() {
  loader.classList.add('done');
  hero.classList.add('visible');
  navbar.classList.add('visible');
  heroContent.classList.add('visible');
}

// ═══════════ IMAGES ═══════════
const bottomImg = new Image();
const topImg    = new Image();
bottomImg.src = '/One.jpg';
topImg.src    = '/Two.jpg';

// ═══════════ CANVAS SIZING ═══════════
function resize() {
  canvas.width  = hero.offsetWidth;
  canvas.height = hero.offsetHeight;
}
resize();
window.addEventListener('resize', resize);

// ═══════════ MOUSE TRACKING ═══════════
const mouse  = { x: -9999, y: -9999 };
const smooth = { x: -9999, y: -9999 };
const trail  = [];

const TRAIL_LENGTH = 60;
const HEAD_RADIUS  = 160;

hero.addEventListener('mousemove', (e) => {
  const rect = hero.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
});

// Helper to draw image like CSS object-fit: cover with custom vertical alignment (alignY: 0=top, 0.5=center, 1=bottom)
function drawImageCover(ctx, img, canvasWidth, canvasHeight, alignY = 0) {
  const scale = Math.max(canvasWidth / img.naturalWidth, canvasHeight / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;
  const x = (canvasWidth - w) / 2;
  const y = (canvasHeight - h) * alignY;
  ctx.drawImage(img, x, y, w, h);
}

// ═══════════ DRAW LOOP ═══════════
function draw() {
  const { width, height } = canvas;

  // Smooth follow
  const dx = mouse.x - smooth.x;
  const dy = mouse.y - smooth.y;
  smooth.x += dx * 0.13;
  smooth.y += dy * 0.13;

  const angle = Math.atan2(dy, dx);

  // No trail needed for simple spotlight

  ctx.clearRect(0, 0, width, height);

  // 1. Draw base image (Batman) using cover logic (center-aligned)
  drawImageCover(ctx, bottomImg, width, height, 0.5);

  // 2. Build mask on offscreen canvas using trail
  const offscreen = document.createElement('canvas');
  offscreen.width  = width;
  offscreen.height = height;
  const off = offscreen.getContext('2d');

  // Simple, elegant soft spotlight mask
  const spotlight = off.createRadialGradient(
    smooth.x, smooth.y, HEAD_RADIUS * 0.4,
    smooth.x, smooth.y, HEAD_RADIUS * 1.5
  );
  spotlight.addColorStop(0, 'rgba(0,0,0,1)');
  spotlight.addColorStop(0.6, 'rgba(0,0,0,0.8)');
  spotlight.addColorStop(1, 'rgba(0,0,0,0)');
  
  off.fillStyle = spotlight;
  off.beginPath();
  off.arc(smooth.x, smooth.y, HEAD_RADIUS * 1.5, 0, Math.PI * 2);
  off.fill();

  // 3. Composite the top image (Bruce) through the mask (center-aligned)
  off.globalCompositeOperation = 'source-in';
  drawImageCover(off, topImg, width, height, 0.5);

  // 4. Draw result on main canvas
  ctx.drawImage(offscreen, 0, 0);

  requestAnimationFrame(draw);
}

// ═══════════ BOOT ═══════════
let loaded = 0;
function onImgLoad() {
  if (++loaded === 2) {
    draw();
    runLoader();
  }
}
bottomImg.onload = onImgLoad;
topImg.onload    = onImgLoad;

// If images are already cached
if (bottomImg.complete) { loaded++; }
if (topImg.complete)    { loaded++; }
if (loaded === 2) { draw(); runLoader(); }

window.addEventListener('load', () => {
  // Fallback if images were cached before listeners attached
  if (!loader.classList.contains('done') && loaded < 2) {
    runLoader();
  }
});
