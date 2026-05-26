import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

(function () {
  'use strict';

  const canvas = document.getElementById('ouroboros-diagram');
  if (!canvas) return;

  const isDark = () => document.documentElement.getAttribute('data-theme') !== 'light';

  // --- Linear autoencoder ouroboros math ---

  const EIGENVALUES = [1.0, 0.6, 0.3, 0.1];
  const STEPS = 200;
  const LR_MIN = 1e-4;
  const LR_MAX = 0.05;
  const P_INIT = 0.01;
  const NUM_GENS = 6;

  function sigmoid(x) {
    if (x > 20) return 1;
    if (x < -20) return 0;
    return 1 / (1 + Math.exp(-x));
  }

  function logit(p) {
    p = Math.max(1e-10, Math.min(1 - 1e-10, p));
    return Math.log(p / (1 - p));
  }

  function computeLoss(schedule) {
    const loss = new Float64Array(STEPS);
    const c = logit(P_INIT);
    for (let t = 0; t < STEPS; t++) {
      let A = 0;
      for (let s = 0; s <= t; s++) A += schedule[s];
      let L = 0;
      for (const lam of EIGENVALUES) {
        const p = sigmoid(2 * lam * A + c);
        L += 0.5 * lam * (1 - p) * (1 - p);
      }
      loss[t] = L;
    }
    return loss;
  }

  function lossToSchedule(loss) {
    const schedule = new Float64Array(STEPS);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < STEPS; i++) {
      if (loss[i] < lo) lo = loss[i];
      if (loss[i] > hi) hi = loss[i];
    }
    const range = hi - lo || 1e-10;
    for (let i = 0; i < STEPS; i++) {
      const norm = (loss[i] - lo) / range;
      schedule[i] = LR_MIN + (LR_MAX - LR_MIN) * norm;
    }
    return schedule;
  }

  function wsdSchedule() {
    const s = new Float64Array(STEPS);
    const warmup = Math.floor(STEPS * 0.05);
    const stable = Math.floor(STEPS * 0.6);
    const decay = STEPS - warmup - stable;
    for (let i = 0; i < STEPS; i++) {
      if (i < warmup) {
        s[i] = LR_MIN + (LR_MAX - LR_MIN) * (i / warmup);
      } else if (i < warmup + stable) {
        s[i] = LR_MAX;
      } else {
        const t = (i - warmup - stable) / decay;
        s[i] = LR_MIN + (LR_MAX - LR_MIN) * 0.5 * (1 + Math.cos(Math.PI * t));
      }
    }
    return s;
  }

  function runGenerations() {
    const generations = [];
    let schedule = wsdSchedule();
    for (let g = 0; g < NUM_GENS; g++) {
      const loss = computeLoss(schedule);
      const nextSchedule = lossToSchedule(loss);
      generations.push({ schedule, loss, nextSchedule });
      schedule = nextSchedule;
    }
    return generations;
  }

  // --- Three.js scene ---

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 2, 0.1, 100);
  camera.position.set(0, 3, 6);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 3;
  controls.maxDistance = 12;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.8;

  const RING_RADIUS = 2.0;
  const AMPLITUDE = 0.5;

  const COLORS = [
    0x888888,
    0xaaaaaa,
    0xcccccc,
    0xdddddd,
    0xeeeeee,
    0xffffff,
  ];

  const COLORS_LIGHT = [
    0x999999,
    0x777777,
    0x555555,
    0x444444,
    0x333333,
    0x000000,
  ];

  let ringGroup = new THREE.Group();
  scene.add(ringGroup);

  function normalizeArray(arr) {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] < lo) lo = arr[i];
      if (arr[i] > hi) hi = arr[i];
    }
    const range = hi - lo || 1e-10;
    const out = new Float64Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = (arr[i] - lo) / range;
    return out;
  }

  function buildRing(gen, genIndex, totalGens) {
    const layerOffset = (genIndex / (totalGens - 1 || 1) - 0.5) * 1.5;
    const radius = RING_RADIUS;

    const lossNorm = normalizeArray(gen.loss);
    const schedNorm = normalizeArray(gen.schedule);

    const halfN = STEPS;
    const totalPts = halfN * 2;
    const points = [];

    // First half: loss curve (top semicircle, angle 0 → π)
    for (let i = 0; i < halfN; i++) {
      const t = i / (halfN - 1);
      const angle = t * Math.PI;
      const y = layerOffset + lossNorm[i] * AMPLITUDE;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      points.push(new THREE.Vector3(x, y, z));
    }

    // Second half: schedule (bottom semicircle, angle π → 2π)
    for (let i = 0; i < halfN; i++) {
      const t = i / (halfN - 1);
      const angle = Math.PI + t * Math.PI;
      const y = layerOffset + schedNorm[i] * AMPLITUDE;
      const x = radius * Math.cos(angle);
      const z = radius * Math.sin(angle);
      points.push(new THREE.Vector3(x, y, z));
    }

    points.push(points[0].clone());

    const curve = new THREE.CatmullRomCurve3(points, false);
    const tubeGeo = new THREE.TubeGeometry(curve, totalPts, 0.012 + 0.006 * (genIndex / totalGens), 6, false);

    const colors = isDark() ? COLORS : COLORS_LIGHT;
    const mat = new THREE.MeshBasicMaterial({
      color: colors[genIndex % colors.length],
      transparent: true,
      opacity: 0.3 + 0.7 * (genIndex / (totalGens - 1 || 1)),
    });

    return new THREE.Mesh(tubeGeo, mat);
  }

  function buildLabels() {
    const group = new THREE.Group();

    const labelData = [
      { text: 'LOSS', angle: Math.PI / 2, side: 1 },
      { text: 'LR SCHEDULE', angle: 3 * Math.PI / 2, side: -1 },
    ];

    const arrowData = [
      { from: Math.PI * 0.97, to: Math.PI * 1.03, label: 'rescale' },
      { from: -Math.PI * 0.03, to: Math.PI * 0.03, label: 'train' },
    ];

    for (const arrow of arrowData) {
      const midAngle = (arrow.from + arrow.to) / 2;
      const r = RING_RADIUS + 0.4;
      const pts = [];
      const steps = 20;
      for (let i = 0; i <= steps; i++) {
        const a = arrow.from + (arrow.to - arrow.from) * (i / steps);
        pts.push(new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a)));
      }
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const lineMat = new THREE.LineBasicMaterial({
        color: isDark() ? 0x555555 : 0xaaaaaa,
      });
      group.add(new THREE.Line(lineGeo, lineMat));

      const lastPt = pts[pts.length - 1];
      const prevPt = pts[pts.length - 2];
      const dir = new THREE.Vector3().subVectors(lastPt, prevPt).normalize();
      const arrowHelper = new THREE.ArrowHelper(dir, prevPt, 0.15, isDark() ? 0x555555 : 0xaaaaaa, 0.08, 0.05);
      group.add(arrowHelper);
    }

    return group;
  }

  function buildScene() {
    ringGroup.clear();

    const gens = runGenerations();

    for (let i = 0; i < gens.length; i++) {
      ringGroup.add(buildRing(gens[i], i, gens.length));
    }

    ringGroup.add(buildLabels());

    const baseRingPts = [];
    for (let i = 0; i <= 128; i++) {
      const a = (i / 128) * Math.PI * 2;
      baseRingPts.push(new THREE.Vector3(
        RING_RADIUS * Math.cos(a), 0, RING_RADIUS * Math.sin(a)
      ));
    }
    const baseGeo = new THREE.BufferGeometry().setFromPoints(baseRingPts);
    const baseMat = new THREE.LineBasicMaterial({
      color: isDark() ? 0x222222 : 0xdddddd,
    });
    ringGroup.add(new THREE.Line(baseGeo, baseMat));

    const dividerColor = isDark() ? 0x333333 : 0xcccccc;
    for (const angle of [0, Math.PI]) {
      const x = RING_RADIUS * Math.cos(angle);
      const z = RING_RADIUS * Math.sin(angle);
      const pts = [
        new THREE.Vector3(x, -1.2, z),
        new THREE.Vector3(x, 1.2, z),
      ];
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = new THREE.LineBasicMaterial({ color: dividerColor });
      ringGroup.add(new THREE.Line(geo, mat));
    }
  }

  buildScene();

  const observer = new MutationObserver(() => {
    buildScene();
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width;
    const h = 400;
    canvas.style.height = h + 'px';
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  window.addEventListener('resize', resize);
  resize();

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  animate();
})();
