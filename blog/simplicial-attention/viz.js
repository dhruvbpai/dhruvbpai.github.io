(function () {
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function palette() {
    return {
      fg: cssVar('--fg'),
      gray: cssVar('--gray'),
      light: cssVar('--light'),
      border: cssVar('--border'),
      bg: cssVar('--bg')
    };
  }

  function hexToRgba(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function fitCanvas(canvas, cssH) {
    var dpr = window.devicePixelRatio || 1;
    var cssW = canvas.clientWidth || canvas.parentNode.clientWidth || 600;
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: cssW, h: cssH };
  }

  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Solve a small symmetric linear system A x = b (Gaussian elimination).
  function solve(A, b) {
    var n = b.length;
    var M = A.map(function (row, i) { return row.slice().concat(b[i]); });
    for (var c = 0; c < n; c++) {
      var piv = c;
      for (var r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
      var tmp = M[c]; M[c] = M[piv]; M[piv] = tmp;
      if (Math.abs(M[c][c]) < 1e-12) M[c][c] = 1e-12;
      for (var r2 = 0; r2 < n; r2++) {
        if (r2 === c) continue;
        var f = M[r2][c] / M[c][c];
        for (var k = c; k <= n; k++) M[r2][k] -= f * M[c][k];
      }
    }
    return M.map(function (row, i) { return row[n] / row[i]; });
  }

  // ───────────────────────── Viz 1: the simplicial lift ─────────────────────────
  function initLift() {
    var canvas = document.getElementById('lift-canvas');
    if (!canvas) return;
    var H = 360;

    var state = { n: 2, L: 6, hover: -1 };
    var keys = [];

    function buildKeys() {
      var rng = mulberry32(7);
      keys = [];
      for (var i = 0; i < state.L; i++) {
        var ang = rng() * Math.PI * 2;
        var rad = 0.45 + rng() * 0.5;
        keys.push([rad * Math.cos(ang), rad * Math.sin(ang)]);
      }
    }

    // Multisets (combinations with replacement) of size n from 0..L-1.
    function tuples() {
      var out = [];
      function rec(start, acc) {
        if (acc.length === state.n) { out.push(acc.slice()); return; }
        for (var i = start; i < state.L; i++) { acc.push(i); rec(i, acc); acc.pop(); }
      }
      rec(0, []);
      return out;
    }

    function hadamard(tuple) {
      var x = 1, y = 1;
      for (var i = 0; i < tuple.length; i++) { x *= keys[tuple[i]][0]; y *= keys[tuple[i]][1]; }
      return [x, y];
    }

    function panelMap(pts, x0, y0, w, h) {
      var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      pts.forEach(function (p) {
        minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
      });
      if (minX === maxX) { minX -= 1; maxX += 1; }
      if (minY === maxY) { minY -= 1; maxY += 1; }
      var pad = 0.15;
      var sx = w / ((maxX - minX) * (1 + 2 * pad));
      var sy = h / ((maxY - minY) * (1 + 2 * pad));
      var s = Math.min(sx, sy);
      var cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      return function (p) {
        return [x0 + w / 2 + (p[0] - cx) * s, y0 + h / 2 - (p[1] - cy) * s];
      };
    }

    var tokenHits = [];

    function draw() {
      var c = palette();
      var dim = fitCanvas(canvas, H);
      var ctx = dim.ctx, W = dim.w;
      ctx.clearRect(0, 0, W, H);

      var pad = 16, gap = 28, topPad = 34;
      var panelW = (W - 2 * pad - gap) / 2;
      var panelH = H - topPad - pad;
      var leftX = pad, rightX = pad + panelW + gap, panelY = topPad;

      // Panel frames
      ctx.strokeStyle = c.border;
      ctx.lineWidth = 1;
      ctx.strokeRect(leftX, panelY, panelW, panelH);
      ctx.strokeRect(rightX, panelY, panelW, panelH);

      ctx.fillStyle = c.gray;
      ctx.font = '12px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('tokens  k_j', leftX, topPad - 14);
      var tup = tuples();
      var label = state.n === 1 ? '\u03C6_j = k_j'
        : state.n === 2 ? '\u03C6_jk = k_j \u2299 k_k'
        : '\u03C6_jkl = k_j \u2299 k_k \u2299 k_l';
      ctx.fillText('lifted  ' + label, rightX, topPad - 14);

      var mapL = panelMap(keys, leftX, panelY, panelW, panelH);
      var lifted = tup.map(hadamard);
      var mapR = panelMap(lifted, rightX, panelY, panelW, panelH);

      // Lifted points (highlight those containing the hovered token)
      lifted.forEach(function (p, i) {
        var sp = mapR(p);
        var on = state.hover >= 0 && tup[i].indexOf(state.hover) !== -1;
        ctx.beginPath();
        ctx.arc(sp[0], sp[1], on ? 4 : 2.6, 0, Math.PI * 2);
        ctx.fillStyle = on ? c.fg : hexToRgba(c.gray, 0.5);
        ctx.fill();
      });

      // Token points
      tokenHits = [];
      keys.forEach(function (kp, i) {
        var sp = mapL(kp);
        tokenHits.push({ x: sp[0], y: sp[1], i: i });
        var on = state.hover === i;
        ctx.beginPath();
        ctx.arc(sp[0], sp[1], on ? 7 : 5, 0, Math.PI * 2);
        ctx.fillStyle = on ? c.fg : c.bg;
        ctx.strokeStyle = on ? c.fg : c.gray;
        ctx.lineWidth = 1.5;
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = on ? c.bg : c.gray;
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(i + 1), sp[0], sp[1]);
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
      });

      // Datapoint counter, tucked into the bottom-right corner.
      ctx.fillStyle = c.light;
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('|C| = ' + tup.length, W - 8, H - 8);
      ctx.textAlign = 'left';
    }

    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      var mx = e.clientX - r.left, my = e.clientY - r.top;
      var found = -1;
      for (var i = 0; i < tokenHits.length; i++) {
        var d = Math.hypot(mx - tokenHits[i].x, my - tokenHits[i].y);
        if (d < 12) { found = tokenHits[i].i; break; }
      }
      if (found !== state.hover) { state.hover = found; draw(); }
      canvas.style.cursor = found >= 0 ? 'pointer' : 'default';
    });
    canvas.addEventListener('mouseleave', function () {
      if (state.hover !== -1) { state.hover = -1; draw(); }
    });

    var btns = canvas.parentNode.querySelectorAll('button[data-n]');
    btns.forEach(function (b) {
      b.classList.toggle('sel', +b.dataset.n === state.n);
      b.addEventListener('click', function () {
        state.n = +b.dataset.n;
        btns.forEach(function (x) { x.classList.toggle('sel', x === b); });
        draw();
      });
    });

    var slider = document.getElementById('lift-L');
    var sliderVal = document.getElementById('lift-L-val');
    slider.addEventListener('input', function () {
      state.L = +slider.value;
      sliderVal.textContent = slider.value;
      state.hover = -1;
      buildKeys();
      draw();
    });

    buildKeys();
    draw();
    return draw;
  }

  // ─────────────────── Viz 2: local polynomial regression ───────────────────
  function initPoly() {
    var canvas = document.getElementById('poly-canvas');
    if (!canvas) return;
    var H = 360;

    var f = function (x) { return 0.5 + 0.32 * Math.sin(6.4 * x + 0.6) + 0.12 * x; };
    var data = [];
    (function build() {
      var rng = mulberry32(21);
      for (var i = 0; i < 44; i++) {
        var x = rng();
        data.push([x, f(x) + (rng() - 0.5) * 0.12]);
      }
      data.sort(function (a, b) { return a[0] - b[0]; });
    })();

    var state = { k: 1, h: 0.12, q: 0.5 };

    function fitAt(q, deg, h) {
      var dim = deg + 1;
      var A = [], b = [];
      for (var i = 0; i < dim; i++) { A.push(new Array(dim).fill(0)); b.push(0); }
      data.forEach(function (pt) {
        var w = Math.exp(-0.5 * Math.pow((pt[0] - q) / h, 2));
        var dx = pt[0] - q;
        var pow = [];
        for (var m = 0; m < dim; m++) pow.push(Math.pow(dx, m));
        for (var r = 0; r < dim; r++) {
          b[r] += w * pow[r] * pt[1];
          for (var cc = 0; cc < dim; cc++) A[r][cc] += w * pow[r] * pow[cc];
        }
      });
      return solve(A, b); // coefficients centered at q; coef[0] = prediction at q
    }

    var plot, hit;

    function draw() {
      var c = palette();
      var dim = fitCanvas(canvas, H);
      var ctx = dim.ctx, W = dim.w;
      ctx.clearRect(0, 0, W, H);

      var mL = 14, mR = 14, mT = 16, mB = 40;
      var x0 = mL, y0 = mT, pw = W - mL - mR, ph = H - mT - mB;

      var ys = data.map(function (d) { return d[1]; });
      var ymin = Math.min.apply(null, ys) - 0.1, ymax = Math.max.apply(null, ys) + 0.1;
      plot = {
        sx: function (x) { return x0 + x * pw; },
        sy: function (y) { return y0 + ph - (y - ymin) / (ymax - ymin) * ph; },
        ix: function (px) { return (px - x0) / pw; }
      };

      // Frame
      ctx.strokeStyle = c.border; ctx.lineWidth = 1;
      ctx.strokeRect(x0, y0, pw, ph);

      var coef = fitAt(state.q, state.k, state.h);

      // True function
      ctx.strokeStyle = hexToRgba(c.gray, 0.5);
      ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (var px = 0; px <= pw; px += 3) {
        var xx = px / pw;
        var py = plot.sy(f(xx));
        if (px === 0) ctx.moveTo(plot.sx(xx), py); else ctx.lineTo(plot.sx(xx), py);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Data points, radius scaled by kernel weight
      data.forEach(function (pt) {
        var w = Math.exp(-0.5 * Math.pow((pt[0] - state.q) / state.h, 2));
        ctx.beginPath();
        ctx.arc(plot.sx(pt[0]), plot.sy(pt[1]), 1.8 + w * 4, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(c.gray, 0.35 + 0.6 * w);
        ctx.fill();
      });

      // Fitted local polynomial across the neighborhood
      ctx.strokeStyle = c.fg; ctx.lineWidth = 2;
      ctx.beginPath();
      var started = false;
      for (var qx = 0; qx <= 1.0001; qx += 0.004) {
        var dx = qx - state.q, yv = 0;
        for (var m = 0; m < coef.length; m++) yv += coef[m] * Math.pow(dx, m);
        if (yv < ymin - 0.5 || yv > ymax + 0.5) { started = false; continue; }
        var sx = plot.sx(qx), sy = plot.sy(yv);
        if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy);
      }
      ctx.stroke();

      // Query line + estimate marker
      var qpx = plot.sx(state.q);
      ctx.strokeStyle = hexToRgba(c.fg, 0.4); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(qpx, y0); ctx.lineTo(qpx, y0 + ph); ctx.stroke();

      var pred = coef[0];
      ctx.beginPath();
      ctx.arc(qpx, plot.sy(pred), 5, 0, Math.PI * 2);
      ctx.fillStyle = c.fg; ctx.fill();

      // True value marker (hollow)
      ctx.beginPath();
      ctx.arc(qpx, plot.sy(f(state.q)), 5, 0, Math.PI * 2);
      ctx.strokeStyle = c.gray; ctx.lineWidth = 1.5; ctx.stroke();

      // Readout
      ctx.fillStyle = c.gray;
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('estimate \u00B7 ' + pred.toFixed(3), x0 + 6, y0 + ph + 26);
      ctx.textAlign = 'right';
      ctx.fillText('f(q) \u00B7 ' + f(state.q).toFixed(3) + '   |bias| \u00B7 ' + Math.abs(pred - f(state.q)).toFixed(3), x0 + pw, y0 + ph + 26);
      ctx.textAlign = 'left';

      hit = { x0: x0, pw: pw };
    }

    var dragging = false;
    function setQ(e) {
      var r = canvas.getBoundingClientRect();
      var q = plot.ix(e.clientX - r.left);
      state.q = Math.max(0.02, Math.min(0.98, q));
      draw();
    }
    canvas.addEventListener('mousedown', function (e) { dragging = true; setQ(e); });
    window.addEventListener('mousemove', function (e) { if (dragging) setQ(e); });
    window.addEventListener('mouseup', function () { dragging = false; });
    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      canvas.style.cursor = 'ew-resize';
    });

    var btns = canvas.parentNode.querySelectorAll('button[data-k]');
    btns.forEach(function (b) {
      b.classList.toggle('sel', +b.dataset.k === state.k);
      b.addEventListener('click', function () {
        state.k = +b.dataset.k;
        btns.forEach(function (x) { x.classList.toggle('sel', x === b); });
        draw();
      });
    });

    var slider = document.getElementById('poly-h');
    var sliderVal = document.getElementById('poly-h-val');
    slider.addEventListener('input', function () {
      state.h = +slider.value;
      sliderVal.textContent = (+slider.value).toFixed(2);
      draw();
    });

    draw();
    return draw;
  }

  function boot() {
    var redraws = [];
    var a = initLift(); if (a) redraws.push(a);
    var b = initPoly(); if (b) redraws.push(b);

    window.addEventListener('resize', function () { redraws.forEach(function (fn) { fn(); }); });
    new MutationObserver(function () { redraws.forEach(function (fn) { fn(); }); })
      .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
