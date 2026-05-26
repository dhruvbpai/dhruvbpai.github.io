(function () {
  'use strict';

  var canvas = document.getElementById('walkthrough');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var EIGENVALUES = [1.0, 0.6, 0.3, 0.1];
  var STEPS = 200;
  var LR_MIN = 1e-4;
  var LR_MAX = 0.05;
  var P_INIT = 0.01;
  var MAX_GEN = 7;

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
    var loss = new Float64Array(STEPS);
    var c = logit(P_INIT);
    for (var t = 0; t < STEPS; t++) {
      var A = 0;
      for (var s = 0; s <= t; s++) A += schedule[s];
      var L = 0;
      for (var k = 0; k < EIGENVALUES.length; k++) {
        var lam = EIGENVALUES[k];
        var p = sigmoid(2 * lam * A + c);
        L += 0.5 * lam * (1 - p) * (1 - p);
      }
      loss[t] = L;
    }
    return loss;
  }

  function lossToSchedule(loss) {
    var schedule = new Float64Array(STEPS);
    var lo = Infinity, hi = -Infinity;
    for (var i = 0; i < STEPS; i++) {
      if (loss[i] < lo) lo = loss[i];
      if (loss[i] > hi) hi = loss[i];
    }
    var range = hi - lo || 1e-10;
    for (var i = 0; i < STEPS; i++) {
      var norm = (loss[i] - lo) / range;
      schedule[i] = LR_MIN + (LR_MAX - LR_MIN) * norm;
    }
    return schedule;
  }

  function wsdSchedule() {
    var s = new Float64Array(STEPS);
    var warmup = Math.floor(STEPS * 0.05);
    var stable = Math.floor(STEPS * 0.6);
    var decay = STEPS - warmup - stable;
    for (var i = 0; i < STEPS; i++) {
      if (i < warmup) {
        s[i] = LR_MIN + (LR_MAX - LR_MIN) * (i / warmup);
      } else if (i < warmup + stable) {
        s[i] = LR_MAX;
      } else {
        var t = (i - warmup - stable) / decay;
        s[i] = LR_MIN + (LR_MAX - LR_MIN) * 0.5 * (1 + Math.cos(Math.PI * t));
      }
    }
    return s;
  }

  var generations = [];
  (function () {
    var schedule = wsdSchedule();
    for (var g = 0; g <= MAX_GEN; g++) {
      var loss = computeLoss(schedule);
      var nextSched = lossToSchedule(loss);
      generations.push({ schedule: schedule, loss: loss });
      schedule = nextSched;
    }
  })();

  var currentGen = 0;
  var prevBtn = document.getElementById('walk-prev');
  var nextBtn = document.getElementById('walk-next');
  var label = document.getElementById('walk-label');

  function isDark() {
    return document.documentElement.getAttribute('data-theme') !== 'light';
  }

  function getColors() {
    var dark = isDark();
    return {
      bg: dark ? '#0a0a0a' : '#ffffff',
      fg: dark ? '#e8e8e8' : '#000000',
      grid: dark ? '#1a1a1a' : '#f0f0f0',
      axis: dark ? '#333333' : '#cccccc',
      label: dark ? '#555555' : '#aaaaaa',
      curve: dark ? '#ffffff' : '#000000',
      curvePrev: dark ? '#333333' : '#dddddd',
      arrow: dark ? '#444444' : '#bbbbbb',
    };
  }

  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    var w = rect.width;
    var h = 360;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function drawPlot(x, y, w, h, data, yMin, yMax, title, yLabel, colors, prevData) {
    var pad = { top: 28, right: 16, bottom: 28, left: 52 };
    var pw = w - pad.left - pad.right;
    var ph = h - pad.top - pad.bottom;
    var ox = x + pad.left;
    var oy = y + pad.top;

    ctx.save();

    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 0.5;
    var gridLines = 4;
    for (var i = 0; i <= gridLines; i++) {
      var gy = oy + (i / gridLines) * ph;
      ctx.beginPath();
      ctx.moveTo(ox, gy);
      ctx.lineTo(ox + pw, gy);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox, oy + ph);
    ctx.stroke();

    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillStyle = colors.label;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (var i = 0; i <= gridLines; i++) {
      var gy = oy + (i / gridLines) * ph;
      var val = yMax - (i / gridLines) * (yMax - yMin);
      var text;
      if (yMax < 0.1) {
        text = val.toExponential(0);
      } else if (yMax < 1) {
        text = val.toFixed(3);
      } else {
        text = val.toFixed(2);
      }
      ctx.fillText(text, ox - 6, gy);
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = colors.label;
    ctx.fillText('0', ox, oy + ph + 16);
    ctx.fillText(STEPS.toString(), ox + pw, oy + ph + 16);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.fillStyle = colors.fg;
    ctx.fillText(title, ox + pw / 2, y + 4);

    if (prevData) {
      ctx.beginPath();
      ctx.strokeStyle = colors.curvePrev;
      ctx.lineWidth = 1;
      for (var i = 0; i < STEPS; i++) {
        var px = ox + (i / (STEPS - 1)) * pw;
        var py = oy + (1 - (prevData[i] - yMin) / (yMax - yMin)) * ph;
        py = Math.max(oy, Math.min(oy + ph, py));
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.strokeStyle = colors.curve;
    ctx.lineWidth = 1.5;
    for (var i = 0; i < STEPS; i++) {
      var px = ox + (i / (STEPS - 1)) * pw;
      var py = oy + (1 - (data[i] - yMin) / (yMax - yMin)) * ph;
      py = Math.max(oy, Math.min(oy + ph, py));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    ctx.restore();
  }

  function draw() {
    var w = canvas.width / dpr;
    var h = canvas.height / dpr;
    var colors = getColors();

    ctx.clearRect(0, 0, w, h);

    var gen = generations[currentGen];
    var prevGen = currentGen > 0 ? generations[currentGen - 1] : null;

    var plotW = (w - 60) / 2;
    var plotH = h - 20;

    var schedMin = 0;
    var schedMax = LR_MAX * 1.15;
    var lossMin = 0;
    var lossMax = 0;
    for (var g = 0; g < generations.length; g++) {
      for (var i = 0; i < STEPS; i++) {
        if (generations[g].loss[i] > lossMax) lossMax = generations[g].loss[i];
      }
    }
    lossMax *= 1.1;

    drawPlot(
      10, 10, plotW, plotH,
      gen.schedule, schedMin, schedMax,
      'lr schedule', 'lr',
      colors,
      prevGen ? prevGen.schedule : null
    );

    drawPlot(
      plotW + 50, 10, plotW, plotH,
      gen.loss, lossMin, lossMax,
      'loss curve', 'loss',
      colors,
      prevGen ? prevGen.loss : null
    );

    var arrowY = 10 + plotH / 2;
    var ax1 = plotW + 14;
    var ax2 = plotW + 46;
    ctx.strokeStyle = colors.arrow;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax1, arrowY);
    ctx.lineTo(ax2, arrowY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ax2 - 5, arrowY - 4);
    ctx.lineTo(ax2, arrowY);
    ctx.lineTo(ax2 - 5, arrowY + 4);
    ctx.stroke();

    ctx.font = '9px JetBrains Mono, monospace';
    ctx.fillStyle = colors.label;
    ctx.textAlign = 'center';
    ctx.fillText('train', (ax1 + ax2) / 2, arrowY - 8);

    if (currentGen < MAX_GEN) {
      var bx1 = plotW + 46;
      var bx2 = plotW + 14;
      var by = arrowY + 24;
      ctx.strokeStyle = colors.arrow;
      ctx.beginPath();
      ctx.moveTo(bx1, by);
      ctx.lineTo(bx2, by);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(bx2 + 5, by - 4);
      ctx.lineTo(bx2, by);
      ctx.lineTo(bx2 + 5, by + 4);
      ctx.stroke();
      ctx.fillText('rescale', (bx1 + bx2) / 2, by + 12);
    }
  }

  function updateControls() {
    prevBtn.disabled = currentGen === 0;
    nextBtn.disabled = currentGen >= MAX_GEN;
    label.textContent = 'gen ' + currentGen;
    draw();
  }

  nextBtn.addEventListener('click', function () {
    if (currentGen < MAX_GEN) { currentGen++; updateControls(); }
  });
  prevBtn.addEventListener('click', function () {
    if (currentGen > 0) { currentGen--; updateControls(); }
  });

  window.addEventListener('resize', resize);
  new MutationObserver(function () { draw(); }).observe(
    document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }
  );

  resize();
  updateControls();
})();
