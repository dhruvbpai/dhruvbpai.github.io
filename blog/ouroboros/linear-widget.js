(function () {
  'use strict';

  // --- Shared math ---
  var STEPS = 200;
  var LR_MIN = 1e-4;
  var P_INIT = 0.01;

  function sigmoid(x) {
    if (x > 20) return 1;
    if (x < -20) return 0;
    return 1 / (1 + Math.exp(-x));
  }

  function logit(p) {
    p = Math.max(1e-10, Math.min(1 - 1e-10, p));
    return Math.log(p / (1 - p));
  }

  function computeLoss(schedule, eigenvalues) {
    var loss = new Float64Array(STEPS);
    var cs = eigenvalues.map(function () { return logit(P_INIT); });
    for (var t = 0; t < STEPS; t++) {
      var A = 0;
      for (var s = 0; s <= t; s++) A += schedule[s];
      var L = 0;
      for (var k = 0; k < eigenvalues.length; k++) {
        var p = sigmoid(2 * eigenvalues[k] * A + cs[k]);
        L += 0.5 * eigenvalues[k] * (1 - p) * (1 - p);
      }
      loss[t] = L;
    }
    return loss;
  }

  function lossToSchedule(loss, lrMax) {
    var schedule = new Float64Array(STEPS);
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < STEPS; i++) {
      if (loss[i] < lo) lo = loss[i];
      if (loss[i] > hi) hi = loss[i];
    }
    var range = hi - lo || 1e-10;
    for (var i = 0; i < STEPS; i++) {
      var norm = (loss[i] - lo) / range;
      schedule[i] = LR_MIN + (lrMax - LR_MIN) * norm;
    }
    return schedule;
  }

  function wsdSchedule(lrMax) {
    var s = new Float64Array(STEPS);
    var warmup = Math.floor(STEPS * 0.05);
    var stable = Math.floor(STEPS * 0.6);
    var decay = STEPS - warmup - stable;
    for (var i = 0; i < STEPS; i++) {
      if (i < warmup) s[i] = LR_MIN + (lrMax - LR_MIN) * (i / warmup);
      else if (i < warmup + stable) s[i] = lrMax;
      else {
        var t = (i - warmup - stable) / decay;
        s[i] = LR_MIN + (lrMax - LR_MIN) * 0.5 * (1 + Math.cos(Math.PI * t));
      }
    }
    return s;
  }

  function l2dist(a, b) {
    var sum = 0;
    for (var i = 0; i < a.length; i++) { var d = a[i] - b[i]; sum += d * d; }
    return Math.sqrt(sum);
  }

  function isDark() {
    return document.documentElement.getAttribute('data-theme') !== 'light';
  }

  function getColors() {
    var dark = isDark();
    return {
      fg: dark ? '#e8e8e8' : '#000000',
      axis: dark ? '#333333' : '#cccccc',
      label: dark ? '#555555' : '#aaaaaa',
    };
  }

  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  // ==========================================
  // PART 1: Interactive iteration widget
  // ==========================================

  var canvas = document.getElementById('linear-widget');
  if (canvas) {
    var ctx = canvas.getContext('2d');
    var eigenInput = document.getElementById('widget-eigenvalues');
    var lrSlider = document.getElementById('widget-lr-max');
    var lrLabel = document.getElementById('widget-lr-max-val');
    var playBtn = document.getElementById('widget-play');
    var resetBtn = document.getElementById('widget-reset');
    var genCounter = document.getElementById('widget-gen-counter');

    var losses = [];
    var dists = [];
    var currentSchedule = null;
    var playing = false;
    var playTimer = null;
    var MAX_GENS = 30;

    function parseEigenvalues() {
      var parts = eigenInput.value.split(',');
      var vals = [];
      for (var i = 0; i < parts.length; i++) {
        var v = parseFloat(parts[i].trim());
        if (isFinite(v) && v > 0) vals.push(v);
      }
      return vals.length > 0 ? vals : [1.0];
    }

    function resetState() {
      var lrMax = parseFloat(lrSlider.value);
      currentSchedule = wsdSchedule(lrMax);
      losses = [];
      dists = [];
      stepOnce();
    }

    function stepOnce() {
      if (losses.length >= MAX_GENS) return false;
      var eigenvalues = parseEigenvalues();
      var lrMax = parseFloat(lrSlider.value);
      var loss = computeLoss(currentSchedule, eigenvalues);
      losses.push(loss);
      var nextSched = lossToSchedule(loss, lrMax);
      if (losses.length > 1) dists.push(l2dist(nextSched, currentSchedule));
      currentSchedule = nextSched;
      genCounter.textContent = 'gen ' + (losses.length - 1);
      draw();
      return true;
    }

    function togglePlay() {
      if (playing) {
        playing = false;
        clearInterval(playTimer);
        playBtn.textContent = '▶ play';
      } else {
        if (losses.length === 0) resetState();
        playing = true;
        playBtn.textContent = '■ stop';
        playTimer = setInterval(function () {
          if (!stepOnce()) {
            playing = false;
            clearInterval(playTimer);
            playBtn.textContent = '▶ play';
          }
        }, 350);
      }
    }

    playBtn.addEventListener('click', togglePlay);
    resetBtn.addEventListener('click', function () {
      if (playing) { playing = false; clearInterval(playTimer); playBtn.textContent = '▶ play'; }
      resetState();
    });
    lrSlider.addEventListener('input', function () {
      lrLabel.textContent = parseFloat(lrSlider.value).toFixed(3);
    });

    function resizeWidget() {
      var rect = canvas.parentElement.getBoundingClientRect();
      var w = rect.width;
      var h = 380;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      draw();
    }

    function draw() {
      var w = canvas.width / dpr;
      var h = canvas.height / dpr;
      var colors = getColors();
      ctx.clearRect(0, 0, w, h);

      if (losses.length === 0) {
        ctx.font = '12px JetBrains Mono, monospace';
        ctx.fillStyle = colors.label;
        ctx.textAlign = 'center';
        ctx.fillText('Press play to start iterating', w / 2, h / 2);
        return;
      }

      var plotW = (w - 60) / 2;
      var plotH = h - 20;
      var pad = { top: 28, right: 16, bottom: 28, left: 52 };
      var pw = plotW - pad.left - pad.right;
      var ph = plotH - pad.top - pad.bottom;

      var lossMax = 0;
      for (var g = 0; g < losses.length; g++)
        for (var i = 0; i < STEPS; i++)
          if (losses[g][i] > lossMax) lossMax = losses[g][i];
      lossMax *= 1.1;

      var ox = 10 + pad.left;
      var oy = 10 + pad.top;

      // Grid
      ctx.strokeStyle = colors.axis; ctx.lineWidth = 0.5;
      for (var i = 0; i <= 4; i++) {
        var gy = oy + (i / 4) * ph;
        ctx.beginPath(); ctx.moveTo(ox, gy); ctx.lineTo(ox + pw, gy); ctx.stroke();
      }
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + ph); ctx.stroke();

      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = colors.label;
      for (var i = 0; i <= 4; i++) {
        ctx.fillText((lossMax * (1 - i / 4)).toFixed(3), ox - 6, oy + (i / 4) * ph);
      }

      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.font = '11px JetBrains Mono, monospace'; ctx.fillStyle = colors.fg;
      ctx.fillText('loss curves', 10 + plotW / 2, 14);

      // Draw loss curves
      for (var g = 0; g < losses.length; g++) {
        var alpha = 0.1 + 0.9 * (g / Math.max(losses.length - 1, 1));
        var dark = isDark();
        var v = dark ? Math.round(255 * alpha) : Math.round(255 * (1 - alpha));
        ctx.strokeStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + Math.max(0.25, alpha) + ')';
        ctx.lineWidth = g === losses.length - 1 ? 2 : 0.7;
        ctx.beginPath();
        for (var i = 0; i < STEPS; i++) {
          var px = ox + (i / (STEPS - 1)) * pw;
          var py = oy + (1 - losses[g][i] / lossMax) * ph;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
      }

      // Convergence panel
      var ox2 = plotW + 50 + pad.left;
      if (dists.length > 0) {
        var distMax = 0;
        for (var i = 0; i < dists.length; i++)
          if (dists[i] > distMax) distMax = dists[i];
        distMax *= 1.2;
        if (distMax < 1e-10) distMax = 1;

        ctx.strokeStyle = colors.axis; ctx.lineWidth = 0.5;
        for (var i = 0; i <= 4; i++) {
          var gy = oy + (i / 4) * ph;
          ctx.beginPath(); ctx.moveTo(ox2, gy); ctx.lineTo(ox2 + pw, gy); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(ox2, oy); ctx.lineTo(ox2, oy + ph); ctx.stroke();

        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = colors.label;
        for (var i = 0; i <= 4; i++) {
          ctx.fillText((distMax * (1 - i / 4)).toExponential(1), ox2 - 6, oy + (i / 4) * ph);
        }

        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.font = '11px JetBrains Mono, monospace'; ctx.fillStyle = colors.fg;
        ctx.fillText('schedule distance', plotW + 50 + plotW / 2, 14);

        ctx.strokeStyle = colors.fg; ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (var i = 0; i < dists.length; i++) {
          var px = ox2 + (i / Math.max(dists.length - 1, 1)) * pw;
          var py = oy + (1 - dists[i] / distMax) * ph;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();

        ctx.fillStyle = colors.fg;
        for (var i = 0; i < dists.length; i++) {
          var px = ox2 + (i / Math.max(dists.length - 1, 1)) * pw;
          var py = oy + (1 - dists[i] / distMax) * ph;
          ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    window.addEventListener('resize', resizeWidget);
    new MutationObserver(function () { draw(); }).observe(
      document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }
    );

    resizeWidget();
    resetState();
  }

  // ==========================================
  // PART 2: Convergence rate landscape
  // ==========================================

  var lCanvas = document.getElementById('linear-landscape');
  if (!lCanvas) return;
  var lCtx = lCanvas.getContext('2d');

  var LRES = 120;
  var KAPPA_MIN = 1;
  var KAPPA_MAX = 20;
  var ETA_MIN = 0.005;
  var ETA_MAX = 0.15;
  var CONV_THRESH = 1e-4;
  var MAX_ITER = 50;
  var BASE_EIGENVALUES = [1.0, 0.8, 0.5, 0.2];

  var landscapeData = null;

  function computeLandscape() {
    var grid = new Float64Array(LRES * LRES);

    for (var yi = 0; yi < LRES; yi++) {
      var etaMax = ETA_MIN + (yi / (LRES - 1)) * (ETA_MAX - ETA_MIN);
      for (var xi = 0; xi < LRES; xi++) {
        var kappa = KAPPA_MIN + (xi / (LRES - 1)) * (KAPPA_MAX - KAPPA_MIN);
        var eigenvalues = BASE_EIGENVALUES.map(function (v) { return v / Math.pow(kappa, 0.5) * BASE_EIGENVALUES[0]; });
        eigenvalues[0] = 1.0;

        var schedule = wsdSchedule(etaMax);
        var converged = MAX_ITER;

        for (var g = 0; g < MAX_ITER; g++) {
          var loss = computeLoss(schedule, eigenvalues);
          var nextSched = lossToSchedule(loss, etaMax);
          var dist = l2dist(nextSched, schedule);
          schedule = nextSched;
          if (dist < CONV_THRESH) { converged = g + 1; break; }
        }

        grid[yi * LRES + xi] = converged;
      }
    }

    landscapeData = grid;
  }

  function renderLandscape() {
    if (!landscapeData) return;
    var w = lCanvas.width / dpr;
    var h = lCanvas.height / dpr;
    var colors = getColors();
    lCtx.clearRect(0, 0, w, h);

    var pad = { top: 28, right: 60, bottom: 36, left: 52 };
    var pw = w - pad.left - pad.right;
    var ph = h - pad.top - pad.bottom;

    var dark = isDark();
    var offscreen = document.createElement('canvas');
    offscreen.width = LRES;
    offscreen.height = LRES;
    var oCtx = offscreen.getContext('2d');
    var img = oCtx.createImageData(LRES, LRES);
    var d = img.data;

    // Inferno-inspired sequential colormap: dark purple → red → orange → yellow
    function infernoColor(t) {
      t = Math.max(0, Math.min(1, t));
      // 5-stop interpolation
      var stops = [
        [0, 0, 4],
        [40, 11, 84],
        [101, 21, 110],
        [186, 54, 85],
        [230, 109, 42],
        [252, 187, 56],
        [252, 253, 164],
      ];
      var pos = t * (stops.length - 1);
      var i0 = Math.floor(pos);
      var i1 = Math.min(i0 + 1, stops.length - 1);
      var f = pos - i0;
      return [
        Math.round(stops[i0][0] + (stops[i1][0] - stops[i0][0]) * f),
        Math.round(stops[i0][1] + (stops[i1][1] - stops[i0][1]) * f),
        Math.round(stops[i0][2] + (stops[i1][2] - stops[i0][2]) * f),
      ];
    }

    for (var yi = 0; yi < LRES; yi++) {
      for (var xi = 0; xi < LRES; xi++) {
        var srcY = LRES - 1 - yi;
        var val = landscapeData[srcY * LRES + xi];
        var norm = val / MAX_ITER;
        var oi = (yi * LRES + xi) * 4;

        // Invert: fast convergence (low val) = bright, slow = dark
        var c = infernoColor(1 - norm);
        if (!dark) {
          // In light mode, invert the palette
          c = infernoColor(norm);
        }
        d[oi] = c[0]; d[oi + 1] = c[1]; d[oi + 2] = c[2];
        d[oi + 3] = 255;
      }
    }

    oCtx.putImageData(img, 0, 0);
    lCtx.imageSmoothingEnabled = false;
    lCtx.drawImage(offscreen, pad.left, pad.top, pw, ph);

    lCtx.strokeStyle = colors.axis;
    lCtx.lineWidth = 1;
    lCtx.strokeRect(pad.left, pad.top, pw, ph);

    lCtx.font = '10px JetBrains Mono, monospace';
    lCtx.fillStyle = colors.label;

    lCtx.textAlign = 'center'; lCtx.textBaseline = 'top';
    for (var i = 0; i <= 4; i++) {
      var val = KAPPA_MIN + (i / 4) * (KAPPA_MAX - KAPPA_MIN);
      lCtx.fillText(val.toFixed(0), pad.left + (i / 4) * pw, pad.top + ph + 6);
    }
    lCtx.fillText('condition number (λ₁/λₖ)', pad.left + pw / 2, pad.top + ph + 20);

    lCtx.textAlign = 'right'; lCtx.textBaseline = 'middle';
    for (var i = 0; i <= 4; i++) {
      var val = ETA_MIN + (i / 4) * (ETA_MAX - ETA_MIN);
      lCtx.fillText(val.toFixed(3), pad.left - 6, pad.top + ph - (i / 4) * ph);
    }

    lCtx.save();
    lCtx.translate(12, pad.top + ph / 2);
    lCtx.rotate(-Math.PI / 2);
    lCtx.textAlign = 'center'; lCtx.textBaseline = 'middle';
    lCtx.fillText('η_max', 0, 0);
    lCtx.restore();

    // Colorbar
    var cbX = pad.left + pw + 8;
    var cbW = 10;
    var cbH = ph;
    for (var i = 0; i < cbH; i++) {
      var t = i / cbH;
      var c = infernoColor(isDark() ? (1 - t) : t);
      lCtx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
      lCtx.fillRect(cbX, pad.top + i, cbW, 1);
    }
    lCtx.strokeStyle = colors.axis;
    lCtx.lineWidth = 0.5;
    lCtx.strokeRect(cbX, pad.top, cbW, cbH);

    lCtx.textAlign = 'left'; lCtx.textBaseline = 'middle';
    lCtx.font = '9px JetBrains Mono, monospace';
    lCtx.fillStyle = colors.label;
    lCtx.fillText('fast', cbX + cbW + 4, pad.top + 6);
    lCtx.fillText('slow', cbX + cbW + 4, pad.top + cbH - 6);
  }

  function resizeLandscape() {
    var rect = lCanvas.parentElement.getBoundingClientRect();
    var w = rect.width;
    var h = Math.min(400, Math.round(w * 0.55));
    lCanvas.style.width = w + 'px';
    lCanvas.style.height = h + 'px';
    lCanvas.width = w * dpr;
    lCanvas.height = h * dpr;
    lCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    renderLandscape();
  }

  computeLandscape();

  window.addEventListener('resize', resizeLandscape);
  new MutationObserver(function () { renderLandscape(); }).observe(
    document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }
  );

  resizeLandscape();
})();
