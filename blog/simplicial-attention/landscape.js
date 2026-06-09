import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('landscape-canvas');
if (canvas) init(canvas);

function init(canvas) {
  const EXT = 2.4;       // surface half-extent (tokens live in [-1.3, 1.3])
  const G = 32;          // grid resolution
  const VSCALE = 1.0;    // vertical exaggeration

  // Judicious diverging accent for surface height: cool valleys, warm peaks.
  const COLD = [0.23, 0.49, 0.66];   // muted slate blue
  const WARM = [0.92, 0.64, 0.26];   // soft amber

  const state = { n: 1, k: 1, N: 18, h: 0.5 };
  const MAX_LIFTED = 90;  // cap on subsampled pair/triple datapoints per order

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Ground-truth value field: a bump and a dip, with a slight tilt.
  // Scaled so values reach about +/-1.1, which lets Hadamard products of
  // values land outside the original range (visible extrapolation).
  function f(x, z) {
    return 1.8 * (
      0.62 * Math.exp(-((x - 0.4) ** 2 + (z - 0.4) ** 2) / 0.4)
      - 0.5 * Math.exp(-((x + 0.5) ** 2 + (z + 0.3) ** 2) / 0.5)
      + 0.12 * x
    );
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  let points = [];
  function rebuildPoints() {
    const rng = mulberry32(13);

    // Order-1 datapoints: the raw tokens. Keys sample around magnitude ~1 so
    // Hadamard products amplify outward rather than collapse toward the origin.
    const tokens = [];
    for (let i = 0; i < state.N; i++) {
      const x = (rng() * 2 - 1) * 1.3;
      const z = (rng() * 2 - 1) * 1.3;
      tokens.push({ x: x, z: z, y: f(x, z) });
    }

    points = tokens.map((t) => ({ x: t.x, z: t.z, y: t.y, order: 1 }));

    // Higher orders: lifted simplex datapoints. Key lifts by Hadamard product
    // of token keys, value lifts by product of token values. Products of values
    // can escape the convex hull of the originals, which is the enrichment.
    function addOrder(m) {
      const combos = [];
      const idx = new Array(m).fill(0);
      (function rec(start, depth) {
        if (depth === m) { combos.push(idx.slice()); return; }
        for (let i = start; i < tokens.length; i++) { idx[depth] = i; rec(i + 1, depth + 1); }
      })(0, 0);

      // Deterministic subsample if there are too many.
      let chosen = combos;
      if (combos.length > MAX_LIFTED) {
        chosen = [];
        const used = {};
        let guard = 0;
        while (chosen.length < MAX_LIFTED && guard < MAX_LIFTED * 50) {
          const j = Math.floor(rng() * combos.length);
          guard++;
          if (used[j]) continue;
          used[j] = 1;
          chosen.push(combos[j]);
        }
      }

      chosen.forEach((combo) => {
        let x = 1, z = 1, y = 1;
        combo.forEach((ti) => { x *= tokens[ti].x; z *= tokens[ti].z; y *= tokens[ti].y; });
        x = Math.max(-EXT, Math.min(EXT, x));
        z = Math.max(-EXT, Math.min(EXT, z));
        points.push({ x: x, z: z, y: y, order: m });
      });
    }

    if (state.n >= 2) addOrder(2);
    if (state.n >= 3) addOrder(3);
  }

  function solve(A, b) {
    const n = b.length;
    const M = A.map((row, i) => row.slice().concat(b[i]));
    for (let c = 0; c < n; c++) {
      let piv = c;
      for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      const tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
      if (Math.abs(M[c][c]) < 1e-12) M[c][c] = 1e-12;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const fct = M[r][c] / M[c][c];
        for (let kk = c; kk <= n; kk++) M[r][kk] -= fct * M[c][kk];
      }
    }
    return M.map((row, i) => row[n] / row[i]);
  }

  function basis(dx, dz, deg) {
    if (deg === 0) return [1];
    if (deg === 1) return [1, dx, dz];
    return [1, dx, dz, dx * dx, dx * dz, dz * dz];
  }

  // Local polynomial regression estimate at (gx, gz).
  function predict(gx, gz) {
    const dim = state.k === 0 ? 1 : state.k === 1 ? 3 : 6;
    const A = [], b = [];
    for (let i = 0; i < dim; i++) { A.push(new Array(dim).fill(0)); b.push(0); }
    const h2 = 2 * state.h * state.h;
    for (let p = 0; p < points.length; p++) {
      const dx = points[p].x - gx, dz = points[p].z - gz;
      const w = Math.exp(-(dx * dx + dz * dz) / h2);
      const phi = basis(dx, dz, state.k);
      for (let r = 0; r < dim; r++) {
        b[r] += w * phi[r] * points[p].y;
        for (let c = 0; c < dim; c++) A[r][c] += w * phi[r] * phi[c];
      }
    }
    for (let d = 0; d < dim; d++) A[d][d] += 1e-6;
    const coef = solve(A, b);
    return Math.max(-2.0, Math.min(2.0, coef[0]));
  }

  // ── three.js scene ──
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(4.8, 3.8, 4.8);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setClearColor(0x000000, 0);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 3.5;
  controls.maxDistance = 14;
  controls.target.set(0, 0, 0);

  let surfaceMesh = null, wireMesh = null, pointGroup = null;
  const sphereGeo = new THREE.SphereGeometry(0.035, 16, 12);

  function disposeMesh(m) {
    if (!m) return;
    scene.remove(m);
    if (m.geometry) m.geometry.dispose();
    if (m.material) m.material.dispose();
  }

  function buildSurface() {
    disposeMesh(surfaceMesh);
    disposeMesh(wireMesh);

    const heights = new Float32Array(G * G);
    let ymin = Infinity, ymax = -Infinity;
    for (let i = 0; i < G; i++) {
      for (let j = 0; j < G; j++) {
        const gx = -EXT + (2 * EXT) * (i / (G - 1));
        const gz = -EXT + (2 * EXT) * (j / (G - 1));
        const y = predict(gx, gz);
        heights[i * G + j] = y;
        if (y < ymin) ymin = y;
        if (y > ymax) ymax = y;
      }
    }
    // Diverging color anchored at height 0: negative -> cool, positive -> warm.
    const amp = Math.max(1e-3, Math.max(Math.abs(ymin), Math.abs(ymax)));

    const positions = new Float32Array(G * G * 3);
    const colors = new Float32Array(G * G * 3);
    for (let i = 0; i < G; i++) {
      for (let j = 0; j < G; j++) {
        const idx = i * G + j;
        const gx = -EXT + (2 * EXT) * (i / (G - 1));
        const gz = -EXT + (2 * EXT) * (j / (G - 1));
        const y = heights[idx];
        positions[idx * 3] = gx;
        positions[idx * 3 + 1] = y * VSCALE;
        positions[idx * 3 + 2] = gz;
        const t = Math.max(0, Math.min(1, 0.5 + 0.5 * (y / amp)));
        colors[idx * 3] = COLD[0] + (WARM[0] - COLD[0]) * t;
        colors[idx * 3 + 1] = COLD[1] + (WARM[1] - COLD[1]) * t;
        colors[idx * 3 + 2] = COLD[2] + (WARM[2] - COLD[2]) * t;
      }
    }

    const indices = [];
    for (let i = 0; i < G - 1; i++) {
      for (let j = 0; j < G - 1; j++) {
        const a = i * G + j, b = i * G + j + 1, c = (i + 1) * G + j, d = (i + 1) * G + j + 1;
        indices.push(a, c, b, b, c, d);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(indices);

    surfaceMesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
      vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.85
    }));
    scene.add(surfaceMesh);

    wireMesh = new THREE.LineSegments(
      new THREE.WireframeGeometry(geo),
      new THREE.LineBasicMaterial({
        color: new THREE.Color(cssVar('--gray')), transparent: true, opacity: 0.18
      })
    );
    scene.add(wireMesh);
  }

  const smallSphereGeo = new THREE.SphereGeometry(0.024, 12, 8);
  const tinySphereGeo = new THREE.SphereGeometry(0.018, 10, 6);

  function buildPoints() {
    if (pointGroup) {
      scene.remove(pointGroup);
      pointGroup.children.forEach((c) => c.material.dispose());
    }
    pointGroup = new THREE.Group();

    // Order 1 = tokens (bright), order 2/3 = lifted simplices (dimmer, smaller).
    const matByOrder = {
      1: new THREE.MeshBasicMaterial({ color: new THREE.Color(cssVar('--fg')) }),
      2: new THREE.MeshBasicMaterial({ color: new THREE.Color(cssVar('--gray')) }),
      3: new THREE.MeshBasicMaterial({ color: new THREE.Color(cssVar('--light')) })
    };
    const geoByOrder = { 1: sphereGeo, 2: smallSphereGeo, 3: tinySphereGeo };

    for (let p = 0; p < points.length; p++) {
      const o = points[p].order;
      const m = new THREE.Mesh(geoByOrder[o], matByOrder[o]);
      m.position.set(points[p].x, points[p].y * VSCALE, points[p].z);
      pointGroup.add(m);
    }
    scene.add(pointGroup);
  }

  function rebuildAll() {
    rebuildPoints();
    buildPoints();
    buildSurface();
  }

  function resize() {
    const w = canvas.clientWidth || 600;
    const h = 400;
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  // Controls
  const nBtns = canvas.parentNode.querySelectorAll('button[data-ln]');
  nBtns.forEach((b) => {
    b.classList.toggle('sel', +b.dataset.ln === state.n);
    b.addEventListener('click', () => {
      state.n = +b.dataset.ln;
      nBtns.forEach((x) => x.classList.toggle('sel', x === b));
      rebuildAll();
    });
  });

  const degBtns = canvas.parentNode.querySelectorAll('button[data-lk]');
  degBtns.forEach((b) => {
    b.classList.toggle('sel', +b.dataset.lk === state.k);
    b.addEventListener('click', () => {
      state.k = +b.dataset.lk;
      degBtns.forEach((x) => x.classList.toggle('sel', x === b));
      buildSurface();
    });
  });

  const nSlider = document.getElementById('land-n');
  const nVal = document.getElementById('land-n-val');
  nSlider.addEventListener('input', () => {
    state.N = +nSlider.value;
    nVal.textContent = nSlider.value;
    rebuildAll();
  });

  const hSlider = document.getElementById('land-h');
  const hVal = document.getElementById('land-h-val');
  hSlider.addEventListener('input', () => {
    state.h = +hSlider.value;
    hVal.textContent = (+hSlider.value).toFixed(2);
    buildSurface();
  });

  window.addEventListener('resize', resize);
  new MutationObserver(() => { buildSurface(); buildPoints(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  resize();
  rebuildAll();

  (function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  })();
}
