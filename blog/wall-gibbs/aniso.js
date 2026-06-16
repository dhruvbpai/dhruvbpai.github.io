import * as THREE from 'three';

/* ─────────── Diagram 2: the breathing Gibbs kernel (3D) ───────────
   A query sits at the origin. The faint sphere is the vanilla RBF: one fixed,
   isotropic length scale. The translucent ellipsoid is the Gibbs / Wall kernel,
   its three semi-axes the per-channel length scales ℓ_n(t) drifting in real time
   as gates open and close. Keys x' drift in and out around the query; each one
   carries a gray halo for the weight vanilla gives it, exp(-‖x'‖²/2), and a blue
   core for the weight the current Gibbs kernel gives it, exp(-Σ x'_n²/2ℓ_n²).
   When an axis stretches, distant keys along it flare blue: the kernel is reaching
   further along that channel than vanilla ever could. */

var mount = document.getElementById('aniso-3d');
if (mount) {
  var isDark = function () {
    return document.documentElement.getAttribute('data-theme') !== 'light';
  };
  function pal() {
    return isDark()
      ? { surf: 0x5b9be0, edge: 0x9ccbf2, ref: 0x5a5a5a, axis: 0x4a4a4a,
          key: 0x6cb3f2, halo: 0x8a8a8a, q: 0xf2f2f2, text: '#e8e8e8', dim: '#9aa0a6' }
      : { surf: 0x2266bb, edge: 0x1d4f93, ref: 0xc0c0c0, axis: 0xcccccc,
          key: 0x2266bb, halo: 0x8a8a8a, q: 0x111111, text: '#111111', dim: '#6a6a6a' };
  }

  // ── dynamic per-channel length scales: ℓ_n(t) = exp(A_n · sin(ω_n t + φ_n)) ──
  // channel 1 is "always-on" (A=0, stays ℓ=1); channels 2,3 are dynamic.
  var ampl  = [0.00, 0.55, 0.42];
  var freq  = [0.00, 0.52, 0.37];
  var phase = [0.00, 0.6, 2.4];
  var L = [1, 1, 1];
  function ellAt(n, time) { return Math.exp(ampl[n] * Math.sin(freq[n] * time + phase[n])); }

  // ── renderer / scene / camera ──
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.cursor = 'grab';
  mount.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(4.8, 3.2, 6.0);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0xffffff, 0.72));
  var keyLight = new THREE.DirectionalLight(0xffffff, 0.8);
  keyLight.position.set(4, 6, 5);
  scene.add(keyLight);
  var rimLight = new THREE.DirectionalLight(0xffffff, 0.22);
  rimLight.position.set(-5, -2, -4);
  scene.add(rimLight);

  var group = new THREE.Group();
  scene.add(group);

  // shared sphere geometry
  var sphereGeo = new THREE.SphereGeometry(1, 48, 32);

  // reference unit sphere (vanilla RBF iso-surface)
  var refMat = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.10 });
  group.add(new THREE.Mesh(sphereGeo, refMat));

  // Gibbs ellipsoid (breathing)
  var surfMat = new THREE.MeshPhongMaterial({
    transparent: true, opacity: 0.16, shininess: 60, specular: 0x223344,
    depthWrite: false, side: THREE.DoubleSide
  });
  var surf = new THREE.Mesh(sphereGeo, surfMat);
  group.add(surf);
  var edgeMat = new THREE.MeshBasicMaterial({ wireframe: true, transparent: true, opacity: 0.10 });
  var edge = new THREE.Mesh(sphereGeo, edgeMat);
  surf.add(edge);                              // inherits per-axis scale

  // ── axes (bare, for orientation) ──
  var axisDirs = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, 0, 1)
  ];
  var AXIS = 2.9;
  var axisMat = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.4 });
  axisDirs.forEach(function (d) {
    var g = new THREE.BufferGeometry().setFromPoints([
      d.clone().multiplyScalar(-AXIS), d.clone().multiplyScalar(AXIS)
    ]);
    group.add(new THREE.Line(g, axisMat));
  });

  // ── soft radial glow sprite texture ──
  function makeGlow() {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var x = c.getContext('2d');
    var g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0.0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
    g.addColorStop(1.0, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  }
  var glowTex = makeGlow();

  function glowSprite(hex, ro) {
    var sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: hex, transparent: true, opacity: 0,
      depthTest: true, depthWrite: false
    }));
    sp.renderOrder = ro;
    return sp;
  }

  // ── query marker at origin ──
  var qGlow = glowSprite(pal().q, 0);
  group.add(qGlow);
  var qDot = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 16, 12),
    new THREE.MeshBasicMaterial({ color: pal().q })
  );
  group.add(qDot);

  // ── drifting key points x' ──
  function randPos() {
    var u = Math.random() * 2 - 1, th = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    var dir = new THREE.Vector3(s * Math.cos(th), u, s * Math.sin(th));
    var r = 0.4 + Math.pow(Math.random(), 0.7) * 2.2;
    return dir.multiplyScalar(r);
  }
  var dotGeo = new THREE.SphereGeometry(0.022, 10, 8);
  var NP = 46;
  var pts = [];
  for (var i = 0; i < NP; i++) {
    var p0 = pal();
    var halo = glowSprite(p0.halo, 1);
    var core = glowSprite(p0.key, 2);
    var dot = new THREE.Mesh(dotGeo, new THREE.MeshBasicMaterial({
      color: p0.dim, transparent: true, opacity: 0
    }));
    group.add(halo); group.add(core); group.add(dot);
    var pt = { pos: randPos(), birth: -Math.random() * 6000, life: 4000 + Math.random() * 5000,
               halo: halo, core: core, dot: dot };
    halo.position.copy(pt.pos); core.position.copy(pt.pos); dot.position.copy(pt.pos);
    pts.push(pt);
  }

  function weightRBF(v) {
    return Math.exp(-(v.x * v.x + v.y * v.y + v.z * v.z) / 2);
  }
  function weightGibbs(v) {
    var r2 = (v.x * v.x) / (L[0] * L[0]) + (v.y * v.y) / (L[1] * L[1]) + (v.z * v.z) / (L[2] * L[2]);
    return Math.exp(-r2 / 2);
  }
  function fadeEnv(prog) {
    if (prog < 0.16) return prog / 0.16;
    if (prog > 0.84) return (1 - prog) / 0.16;
    return 1;
  }

  // ── theme recolor ──
  function applyColors() {
    var p = pal();
    surfMat.color.setHex(p.surf);
    edgeMat.color.setHex(p.edge);
    refMat.color.setHex(p.ref);
    axisMat.color.setHex(p.axis);
    qGlow.material.color.setHex(p.q);
    qDot.material.color.setHex(p.q);
    for (var k = 0; k < pts.length; k++) {
      pts[k].halo.material.color.setHex(p.halo);
      pts[k].core.material.color.setHex(p.key);
      pts[k].dot.material.color.setHex(p.dim);
    }
  }

  // ── drag to orbit, idle auto-spin ──
  var rotY = 0.5, rotX = 0.3, autoSpin = true, dragging = false, idleAt = 0, mx = 0, my = 0;
  renderer.domElement.style.touchAction = 'none';
  renderer.domElement.addEventListener('pointerdown', function (ev) {
    dragging = true; autoSpin = false; mx = ev.clientX; my = ev.clientY;
    renderer.domElement.style.cursor = 'grabbing';
    try { renderer.domElement.setPointerCapture(ev.pointerId); } catch (e) {}
  });
  renderer.domElement.addEventListener('pointermove', function (ev) {
    if (!dragging) return;
    rotY += (ev.clientX - mx) * 0.008;
    rotX = Math.max(-1.2, Math.min(1.2, rotX + (ev.clientY - my) * 0.008));
    mx = ev.clientX; my = ev.clientY;
  });
  function endDrag() { dragging = false; idleAt = performance.now(); renderer.domElement.style.cursor = 'grab'; }
  renderer.domElement.addEventListener('pointerup', endDrag);
  renderer.domElement.addEventListener('pointercancel', endDrag);

  // ── resize / loop ──
  function resize() {
    var width = mount.clientWidth || 600;
    var height = Math.max(340, Math.min(460, Math.round(width * 0.66)));
    renderer.setSize(width, height, false);
    renderer.domElement.style.height = height + 'px';
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  var t0 = performance.now();
  function loop(now) {
    var time = (now - t0) / 1000;
    L[0] = ellAt(0, time); L[1] = ellAt(1, time); L[2] = ellAt(2, time);
    surf.scale.set(L[0], L[1], L[2]);

    // query pulse
    var qp = 0.42 + 0.06 * Math.sin(time * 1.6);
    qGlow.scale.set(qp, qp, 1);
    qGlow.material.opacity = isDark() ? 0.5 : 0.32;

    for (var k = 0; k < pts.length; k++) {
      var pt = pts[k];
      var prog = (now - pt.birth) / pt.life;
      if (prog >= 1) {
        pt.pos = randPos(); pt.birth = now; pt.life = 4000 + Math.random() * 5000;
        pt.halo.position.copy(pt.pos); pt.core.position.copy(pt.pos); pt.dot.position.copy(pt.pos);
        prog = 0;
      }
      var env = fadeEnv(prog);
      var wr = weightRBF(pt.pos);
      var wg = weightGibbs(pt.pos);
      pt.halo.material.opacity = (0.03 + 0.42 * wr) * env;
      var hs = (0.16 + 0.66 * wr) * env;
      pt.halo.scale.set(hs, hs, 1);
      pt.core.material.opacity = (0.05 + 0.9 * wg) * env;
      var cs = (0.12 + 0.52 * wg) * env;
      pt.core.scale.set(cs, cs, 1);
      pt.dot.material.opacity = 0.5 * env;
    }

    if (!dragging && !autoSpin && now - idleAt > 2500) autoSpin = true;
    if (autoSpin) rotY += 0.0016;
    group.rotation.y = rotY;
    group.rotation.x = rotX;

    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  new MutationObserver(applyColors).observe(
    document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }
  );
  window.addEventListener('resize', resize);

  applyColors();
  resize();
  requestAnimationFrame(loop);
}
