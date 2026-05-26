import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const isDark = () => document.documentElement.getAttribute('data-theme') !== 'light';
const fg = () => isDark() ? 0xe8e8e8 : 0x111111;
const dim = () => isDark() ? 0x333333 : 0xcccccc;

function makeRenderer(canvas) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  return r;
}

function setupResize(canvas, renderer, camera, h) {
  const height = h || 420;
  function resize() {
    const w = canvas.parentElement.getBoundingClientRect().width;
    canvas.style.height = height + 'px';
    renderer.setSize(w, height);
    camera.aspect = w / height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();
  return resize;
}


// ─── Diagram 1: Energy Landscape with Draggable Patterns ───

(function energyLandscape() {
  const canvas = document.getElementById('energy-landscape');
  if (!canvas) return;

  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 2, 0.1, 100);
  camera.position.set(5.5, 4.5, 5.5);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 4;
  controls.maxDistance = 12;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.4;
  controls.maxPolarAngle = Math.PI * 0.48;

  const patterns = [
    { x: -1.3, z: -1.0 },
    { x: 1.1, z: -0.9 },
    { x: -0.4, z: 1.3 },
    { x: 1.4, z: 1.0 },
  ];

  const RES = 90;
  const RANGE = 2.8;
  const HEIGHT = 2.5;
  let betaVal = 2.0;

  let dragging = null;
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  let patternSpheres = [];

  function energy(x, z, beta) {
    let sum = 0;
    for (const p of patterns) {
      sum += Math.exp(beta * (x * p.x + z * p.z));
    }
    return -Math.log(sum) / beta;
  }

  function buildSurface() {
    const positions = new Float32Array((RES + 1) * (RES + 1) * 3);
    const colors = new Float32Array((RES + 1) * (RES + 1) * 3);
    const indices = [];

    let minE = Infinity, maxE = -Infinity;
    const eGrid = [];
    for (let i = 0; i <= RES; i++) {
      eGrid[i] = [];
      for (let j = 0; j <= RES; j++) {
        const x = -RANGE + (2 * RANGE * i) / RES;
        const z = -RANGE + (2 * RANGE * j) / RES;
        const e = energy(x, z, betaVal);
        eGrid[i][j] = e;
        if (e < minE) minE = e;
        if (e > maxE) maxE = e;
      }
    }

    const eRange = maxE - minE || 1;

    for (let i = 0; i <= RES; i++) {
      for (let j = 0; j <= RES; j++) {
        const idx = (i * (RES + 1) + j) * 3;
        const x = -RANGE + (2 * RANGE * i) / RES;
        const z = -RANGE + (2 * RANGE * j) / RES;
        const norm = (eGrid[i][j] - minE) / eRange;
        const y = (1 - norm) * HEIGHT;

        positions[idx] = x;
        positions[idx + 1] = y;
        positions[idx + 2] = z;

        if (isDark()) {
          const d = 1 - norm;
          colors[idx]     = 0.08 + 0.55 * d * d;
          colors[idx + 1] = 0.08 + 0.35 * d;
          colors[idx + 2] = 0.2 + 0.6 * d;
        } else {
          const d = 1 - norm;
          colors[idx]     = 0.2 + 0.4 * norm;
          colors[idx + 1] = 0.35 + 0.25 * d;
          colors[idx + 2] = 0.55 + 0.35 * d;
        }
      }
    }

    for (let i = 0; i < RES; i++) {
      for (let j = 0; j < RES; j++) {
        const a = i * (RES + 1) + j;
        const b = (i + 1) * (RES + 1) + j;
        const c = (i + 1) * (RES + 1) + (j + 1);
        const d = i * (RES + 1) + (j + 1);
        indices.push(a, b, d, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return { geo, eGrid, minE, maxE, eRange };
  }

  function buildScene() {
    scene.clear();
    patternSpheres = [];

    const { geo, eGrid, minE, eRange } = buildSurface();

    scene.add(new THREE.Mesh(geo, new THREE.MeshPhongMaterial({
      vertexColors: true, side: THREE.DoubleSide, shininess: 60,
      specular: isDark() ? 0x222244 : 0x444466, transparent: true, opacity: 0.92,
    })));

    scene.add(new THREE.Mesh(geo.clone(), new THREE.MeshBasicMaterial({
      color: isDark() ? 0x334455 : 0xaabbcc, wireframe: true, transparent: true, opacity: 0.06,
    })));

    for (let pi = 0; pi < patterns.length; pi++) {
      const p = patterns[pi];
      const gi = Math.round(((p.x + RANGE) / (2 * RANGE)) * RES);
      const gj = Math.round(((p.z + RANGE) / (2 * RANGE)) * RES);
      const ci = Math.max(0, Math.min(RES, gi));
      const cj = Math.max(0, Math.min(RES, gj));
      const norm = (eGrid[ci][cj] - minE) / eRange;
      const y = (1 - norm) * HEIGHT;

      const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 24, 24),
        new THREE.MeshBasicMaterial({ color: isDark() ? 0x88ccff : 0x2266aa, transparent: true, opacity: 0.95 }),
      );
      sphere.position.set(p.x, y + 0.03, p.z);
      sphere.userData.patternIndex = pi;
      scene.add(sphere);
      patternSpheres.push(sphere);

      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 24, 24),
        new THREE.MeshBasicMaterial({ color: isDark() ? 0x4488cc : 0x3366aa, transparent: true, opacity: 0.12 }),
      );
      halo.position.set(p.x, y + 0.03, p.z);
      scene.add(halo);

      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p.x, -0.05, p.z), new THREE.Vector3(p.x, y, p.z)]),
        new THREE.LineBasicMaterial({ color: isDark() ? 0x4477aa : 0x3355aa, transparent: true, opacity: 0.2 }),
      ));
    }

    const floor = new THREE.GridHelper(RANGE * 2, 14, dim(), dim());
    floor.position.y = -0.05;
    floor.material.opacity = 0.08;
    floor.material.transparent = true;
    scene.add(floor);

    const kl = new THREE.DirectionalLight(0xffffff, 0.9);
    kl.position.set(4, 8, 3);
    scene.add(kl);
    scene.add(new THREE.DirectionalLight(isDark() ? 0x334477 : 0x667799, 0.4).translateOnAxis(new THREE.Vector3(-3, 2, -4).normalize(), 5));
    scene.add(new THREE.AmbientLight(isDark() ? 0x222233 : 0x889999, 0.5));
  }

  buildScene();

  function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }

  canvas.addEventListener('pointerdown', (e) => {
    getMousePos(e);
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects(patternSpheres);
    if (hits.length > 0) {
      dragging = hits[0].object.userData.patternIndex;
      controls.enabled = false;
      controls.autoRotate = false;
      canvas.style.cursor = 'grabbing';
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (dragging === null) {
      getMousePos(e);
      raycaster.setFromCamera(mouse, camera);
      const hits = raycaster.intersectObjects(patternSpheres);
      canvas.style.cursor = hits.length > 0 ? 'grab' : '';
      return;
    }
    getMousePos(e);
    raycaster.setFromCamera(mouse, camera);
    const intersection = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(dragPlane, intersection)) {
      const clamped = Math.max(-RANGE + 0.3, Math.min(RANGE - 0.3, intersection.x));
      const clampedZ = Math.max(-RANGE + 0.3, Math.min(RANGE - 0.3, intersection.z));
      patterns[dragging].x = clamped;
      patterns[dragging].z = clampedZ;
      buildScene();
    }
  });

  canvas.addEventListener('pointerup', () => {
    if (dragging !== null) {
      dragging = null;
      controls.enabled = true;
      controls.autoRotate = true;
      canvas.style.cursor = '';
    }
  });

  canvas.addEventListener('pointerleave', () => {
    if (dragging !== null) {
      dragging = null;
      controls.enabled = true;
      controls.autoRotate = true;
      canvas.style.cursor = '';
    }
  });

  const slider = document.getElementById('beta-slider');
  const label = document.getElementById('beta-label');
  if (slider) {
    slider.addEventListener('input', () => {
      betaVal = parseFloat(slider.value);
      if (label) label.textContent = 'β = ' + betaVal.toFixed(1);
      buildScene();
    });
  }

  const observer = new MutationObserver(() => buildScene());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  setupResize(canvas, renderer, camera);

  (function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  })();
})();


// ─── Diagram 2: Attention Retrieval (1D values, many visible points) ───

(function attentionRetrieval() {
  const canvas = document.getElementById('attention-retrieval');
  if (!canvas) return;

  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 2, 0.1, 100);
  camera.position.set(0, 6, 10);
  camera.lookAt(0, 1.5, 0);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 5;
  controls.maxDistance = 16;
  controls.target.set(0, 1.5, 0);

  const keys = [
    { x: -3.0, z: -1.5, val: 2.2 },
    { x: -2.0, z: 0.8,  val: 3.0 },
    { x: -0.8, z: -0.5, val: 2.6 },
    { x: -0.3, z: 1.2,  val: 3.2 },
    { x: 0.5,  z: -1.0, val: 1.4 },
    { x: 1.2,  z: 0.3,  val: 1.8 },
    { x: 2.0,  z: -0.8, val: 0.9 },
    { x: 2.8,  z: 1.0,  val: 1.2 },
    { x: -1.5, z: -1.2, val: 2.0 },
    { x: 0.0,  z: 0.0,  val: 2.4 },
    { x: 1.8,  z: 1.5,  val: 1.0 },
    { x: -2.5, z: 1.5,  val: 2.8 },
  ];

  const query = { x: -0.5, z: 0.4 };
  let betaVal = 0.5;

  function softmax(logits, beta) {
    const m = Math.max(...logits);
    const e = logits.map(l => Math.exp(beta * (l - m)));
    const Z = e.reduce((a, b) => a + b, 0);
    return e.map(v => v / Z);
  }

  function buildScene() {
    scene.clear();

    const dots = keys.map(k => query.x * k.x + query.z * k.z);
    const w = softmax(dots, betaVal);

    const floor = new THREE.GridHelper(8, 16, dim(), dim());
    floor.material.opacity = 0.1;
    floor.material.transparent = true;
    scene.add(floor);

    const keyColor = isDark() ? 0x5599dd : 0x2266bb;
    const keyBright = isDark() ? 0x88ccff : 0x4488dd;
    const resultColor = isDark() ? 0xffaa44 : 0xdd7711;

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const alpha = 0.35 + 0.65 * w[i];
      const barH = k.val * w[i];
      const fullH = k.val;

      const ghostGeo = new THREE.CylinderGeometry(0.035, 0.035, fullH, 8);
      const ghostMat = new THREE.MeshBasicMaterial({
        color: keyColor, transparent: true, opacity: 0.25,
      });
      const ghost = new THREE.Mesh(ghostGeo, ghostMat);
      ghost.position.set(k.x, fullH / 2, k.z);
      scene.add(ghost);

      const ghostCap = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 12, 12),
        new THREE.MeshBasicMaterial({ color: keyColor, transparent: true, opacity: 0.35 }),
      );
      ghostCap.position.set(k.x, fullH, k.z);
      scene.add(ghostCap);

      if (barH > 0.01) {
        const barGeo = new THREE.CylinderGeometry(0.06, 0.06, barH, 12);
        const barMat = new THREE.MeshPhongMaterial({
          color: keyBright, transparent: true, opacity: Math.max(0.5, alpha),
          emissive: keyBright, emissiveIntensity: 0.25 * w[i],
        });
        const bar = new THREE.Mesh(barGeo, barMat);
        bar.position.set(k.x, barH / 2, k.z);
        scene.add(bar);
      }

      const baseR = 0.09 + 0.06 * w[i];
      const base = new THREE.Mesh(
        new THREE.SphereGeometry(baseR, 20, 20),
        new THREE.MeshPhongMaterial({
          color: keyColor, transparent: true, opacity: Math.max(0.6, alpha),
          emissive: keyBright, emissiveIntensity: 0.25,
        }),
      );
      base.position.set(k.x, 0, k.z);
      scene.add(base);

      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(query.x, 0.02, query.z),
        new THREE.Vector3((query.x + k.x) / 2, 0.1 + 0.2 * w[i], (query.z + k.z) / 2),
        new THREE.Vector3(k.x, 0.02, k.z),
      );
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(20)),
        new THREE.LineBasicMaterial({ color: keyColor, transparent: true, opacity: Math.max(0.08, w[i] * 0.5) }),
      ));
    }

    const queryMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 24, 24),
      new THREE.MeshPhongMaterial({ color: fg(), emissive: isDark() ? 0x444444 : 0x222222, emissiveIntensity: 0.3 }),
    );
    queryMesh.position.set(query.x, 0, query.z);
    scene.add(queryMesh);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.2, 0.28, 32),
      new THREE.MeshBasicMaterial({ color: fg(), transparent: true, opacity: 0.15, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(query.x, 0.01, query.z);
    scene.add(ring);

    let resultY = 0;
    for (let i = 0; i < keys.length; i++) resultY += w[i] * keys[i].val;

    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(query.x, 0.14, query.z),
        new THREE.Vector3(query.x, resultY, query.z),
      ]),
      new THREE.LineBasicMaterial({ color: resultColor, transparent: true, opacity: 0.6 }),
    ));

    const rd = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 24, 24),
      new THREE.MeshPhongMaterial({ color: resultColor, emissive: resultColor, emissiveIntensity: 0.4 }),
    );
    rd.position.set(query.x, resultY, query.z);
    scene.add(rd);

    scene.add(new THREE.Mesh(
      new THREE.SphereGeometry(0.2, 24, 24),
      new THREE.MeshBasicMaterial({ color: resultColor, transparent: true, opacity: 0.1 }),
    ).translateX(query.x).translateY(resultY).translateZ(query.z));

    const kl = new THREE.DirectionalLight(0xffffff, 0.7);
    kl.position.set(4, 8, 3);
    scene.add(kl);
    scene.add(new THREE.AmbientLight(isDark() ? 0x333344 : 0x888899, 0.6));
  }

  buildScene();

  const slider = document.getElementById('attn-beta-slider');
  const label = document.getElementById('attn-beta-label');
  if (slider) {
    slider.addEventListener('input', () => {
      betaVal = parseFloat(slider.value);
      if (label) label.textContent = 'β = ' + betaVal.toFixed(1);
      buildScene();
    });
  }

  const observer = new MutationObserver(() => buildScene());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  setupResize(canvas, renderer, camera);

  (function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  })();
})();


// ─── Diagram 3: Crosstalk vs Interpolation ───

(function crosstalkVsInterpolation() {
  const canvas = document.getElementById('crosstalk-interpolation');
  if (!canvas) return;

  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 2, 0.1, 100);
  camera.position.set(0, 5.5, 9);
  camera.lookAt(0, 1.2, 0);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 5;
  controls.maxDistance = 14;
  controls.target.set(0, 1.2, 0);

  function smax(logits, beta) {
    const m = Math.max(...logits);
    const e = logits.map(l => Math.exp(beta * (l - m)));
    const Z = e.reduce((a, b) => a + b, 0);
    return e.map(v => v / Z);
  }

  const interpCluster = [
    { pos: [-2.8, 0, -0.3], dir: [0.1, 1.0, 0.15] },
    { pos: [-2.2, 0, 0.5],  dir: [0.05, 1.1, 0.1] },
    { pos: [-1.7, 0, -0.6], dir: [0.15, 0.9, 0.2] },
    { pos: [-2.5, 0, 0.8],  dir: [-0.05, 1.05, 0.05] },
    { pos: [-1.9, 0, -0.1], dir: [0.08, 0.95, 0.12] },
  ];

  const crosstalkCluster = [
    { pos: [2.0, 0, -0.2], dir: [0.8, 0.4, -0.6] },
    { pos: [2.6, 0, 0.4],  dir: [-0.5, 1.2, 0.3] },
    { pos: [1.8, 0, 0.7],  dir: [0.2, -0.3, 1.1] },
    { pos: [2.4, 0, -0.5], dir: [-0.7, 0.8, -0.4] },
    { pos: [2.1, 0, 0.1],  dir: [0.6, 0.1, 0.9] },
  ];

  const interpQ = [-2.2, 0, 0.1];
  const crosstalkQ = [2.2, 0, 0.1];

  function drawCluster(clusterKeys, qPos, color, colorLight, labelText) {
    const dots = clusterKeys.map(k => qPos[0] * k.pos[0] + qPos[2] * k.pos[2]);
    const w = smax(dots, 4.0);
    const baseColor = isDark() ? color : colorLight;

    for (let i = 0; i < clusterKeys.length; i++) {
      const k = clusterKeys[i];
      const alpha = 0.5 + 0.5 * w[i];

      scene.add(new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 20, 20),
        new THREE.MeshPhongMaterial({
          color: baseColor, transparent: true, opacity: alpha,
          emissive: baseColor, emissiveIntensity: 0.35,
        }),
      ).translateX(k.pos[0]).translateZ(k.pos[2]));

      const dir = new THREE.Vector3(k.dir[0], k.dir[1], k.dir[2]);
      const len = dir.length();
      dir.normalize();
      const arrowLen = len * 0.9;
      const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(k.pos[0], 0.14, k.pos[2]), arrowLen, baseColor, arrowLen * 0.2, arrowLen * 0.12);
      arrow.line.material.transparent = true;
      arrow.line.material.opacity = Math.max(0.6, alpha);
      arrow.cone.material.transparent = true;
      arrow.cone.material.opacity = Math.max(0.6, alpha);
      scene.add(arrow);

      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(qPos[0], 0.02, qPos[2]),
        new THREE.Vector3((qPos[0] + k.pos[0]) / 2, 0.1, (qPos[2] + k.pos[2]) / 2),
        new THREE.Vector3(k.pos[0], 0.02, k.pos[2]),
      );
      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(16)),
        new THREE.LineBasicMaterial({ color: baseColor, transparent: true, opacity: Math.max(0.12, w[i] * 0.4) }),
      ));
    }

    const qDot = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 24, 24),
      new THREE.MeshPhongMaterial({ color: fg(), emissive: isDark() ? 0x555555 : 0x333333, emissiveIntensity: 0.3 }),
    );
    qDot.position.set(qPos[0], 0, qPos[2]);
    scene.add(qDot);

    const qRing = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.25, 32),
      new THREE.MeshBasicMaterial({ color: fg(), transparent: true, opacity: 0.12, side: THREE.DoubleSide }),
    );
    qRing.rotation.x = -Math.PI / 2;
    qRing.position.set(qPos[0], 0.01, qPos[2]);
    scene.add(qRing);

    let blended = [0, 0, 0];
    for (let i = 0; i < clusterKeys.length; i++) {
      blended[0] += w[i] * clusterKeys[i].dir[0];
      blended[1] += w[i] * clusterKeys[i].dir[1];
      blended[2] += w[i] * clusterKeys[i].dir[2];
    }
    const bDir = new THREE.Vector3(blended[0], blended[1], blended[2]);
    const bLen = bDir.length();
    if (bLen > 0.05) {
      bDir.normalize();
      const resultColor = isDark() ? 0xffaa44 : 0xdd7711;
      const rArrow = new THREE.ArrowHelper(bDir, new THREE.Vector3(qPos[0], 0.16, qPos[2]), bLen * 0.9, resultColor, bLen * 0.16, bLen * 0.1);
      rArrow.line.material.linewidth = 2;
      scene.add(rArrow);
    }
  }

  function buildScene() {
    scene.clear();

    const floor = new THREE.GridHelper(8, 16, dim(), dim());
    floor.material.opacity = 0.1;
    floor.material.transparent = true;
    scene.add(floor);

    drawCluster(interpCluster, interpQ, 0x44bb77, 0x228855, 'interpolation');
    drawCluster(crosstalkCluster, crosstalkQ, 0xdd5555, 0xbb3333, 'crosstalk');

    scene.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.02, -3), new THREE.Vector3(0, -0.02, 3)]),
      new THREE.LineBasicMaterial({ color: dim(), transparent: true, opacity: 0.25 }),
    ));

    const kl = new THREE.DirectionalLight(0xffffff, 1.0);
    kl.position.set(4, 8, 3);
    scene.add(kl);
    const fl = new THREE.DirectionalLight(isDark() ? 0x445566 : 0x778899, 0.5);
    fl.position.set(-3, 4, -2);
    scene.add(fl);
    scene.add(new THREE.AmbientLight(isDark() ? 0x444455 : 0x999999, 0.7));
  }

  buildScene();

  const observer3 = new MutationObserver(() => buildScene());
  observer3.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  setupResize(canvas, renderer, camera);

  (function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  })();
})();


// ─── Diagram 4: Smooth Basins, High Walls ───

(function basinWalls() {
  const canvas = document.getElementById('basin-walls');
  if (!canvas) return;

  const renderer = makeRenderer(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 2, 0.1, 100);
  camera.position.set(5, 6, 7);
  camera.lookAt(0, -1.0, 0);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.6;
  controls.minDistance = 5;
  controls.maxDistance = 16;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.target.set(0, -1.0, 0);

  const RANGE = 4;
  const SEG = 140;

  const clusters = [
    { cx: -2.0, cz: -1.5, r: 1.2, depth: 2.5 },
    { cx:  1.5, cz: -1.0, r: 1.0, depth: 2.0 },
    { cx: -0.5, cz:  2.0, r: 1.3, depth: 2.8 },
    { cx:  2.5, cz:  1.8, r: 0.9, depth: 1.6 },
    { cx:  0.0, cz: -2.5, r: 0.7, depth: 1.3 },
  ];

  function energy(x, z) {
    let e = 2.0;
    for (const c of clusters) {
      const dx = x - c.cx, dz = z - c.cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const t = dist / c.r;
      if (t < 1.0) {
        e -= c.depth * (1.0 - t * t) * (1.0 - t * t);
      } else {
        e += 0.4 * Math.exp(-2.5 * (t - 1.0));
      }
    }
    e += 0.03 * (x * x + z * z);
    return e;
  }

  function buildScene() {
    scene.clear();

    const geo = new THREE.PlaneGeometry(RANGE * 2, RANGE * 2, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;

    let yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = energy(x, z);
      pos.setY(i, y);
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
    geo.computeVertexNormals();

    const colors = new Float32Array(pos.count * 3);
    const deepCol  = new THREE.Color(isDark() ? 0x0a2463 : 0x1a5fb4);
    const midCol   = new THREE.Color(isDark() ? 0x1e6091 : 0x3584e4);
    const wallCol  = new THREE.Color(isDark() ? 0x8b4513 : 0xc67a3e);
    const ridgeCol = new THREE.Color(isDark() ? 0xcc5533 : 0xe66100);

    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = (y - yMin) / (yMax - yMin || 1);
      const col = new THREE.Color();
      if (t < 0.25) {
        col.lerpColors(deepCol, midCol, t / 0.25);
      } else if (t < 0.55) {
        col.lerpColors(midCol, wallCol, (t - 0.25) / 0.3);
      } else {
        col.lerpColors(wallCol, ridgeCol, (t - 0.55) / 0.45);
      }
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshPhongMaterial({
      vertexColors: true,
      shininess: 50,
      flatShading: false,
      side: THREE.DoubleSide,
    });
    scene.add(new THREE.Mesh(geo, mat));

    const wireMat = new THREE.MeshBasicMaterial({
      color: isDark() ? 0x445566 : 0x99aabb,
      wireframe: true,
      transparent: true,
      opacity: 0.04,
    });
    scene.add(new THREE.Mesh(geo.clone(), wireMat));

    for (const c of clusters) {
      const y = energy(c.cx, c.cz);
      const dot = new THREE.Mesh(
        new THREE.SphereGeometry(0.1, 16, 16),
        new THREE.MeshPhongMaterial({
          color: isDark() ? 0x66ccff : 0x1a73e8,
          emissive: isDark() ? 0x3399cc : 0x1155aa,
          emissiveIntensity: 0.6,
        }),
      );
      dot.position.set(c.cx, y + 0.1, c.cz);
      scene.add(dot);

      const halo = new THREE.Mesh(
        new THREE.SphereGeometry(0.2, 16, 16),
        new THREE.MeshBasicMaterial({
          color: isDark() ? 0x66ccff : 0x1a73e8,
          transparent: true,
          opacity: 0.15,
        }),
      );
      halo.position.copy(dot.position);
      scene.add(halo);
    }

    const dl = new THREE.DirectionalLight(0xffffff, 1.0);
    dl.position.set(4, 10, 3);
    scene.add(dl);
    const fl = new THREE.DirectionalLight(isDark() ? 0x446688 : 0x778899, 0.5);
    fl.position.set(-3, 6, -4);
    scene.add(fl);
    scene.add(new THREE.AmbientLight(isDark() ? 0x334455 : 0x889999, 0.4));
  }

  buildScene();

  const observer = new MutationObserver(() => buildScene());
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  setupResize(canvas, renderer, camera);

  (function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  })();
})();
