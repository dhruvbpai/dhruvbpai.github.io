(function () {
  'use strict';

  var isDark = function () {
    return document.documentElement.getAttribute('data-theme') !== 'light';
  };
  var fgCol = function () { return isDark() ? '#e8e8e8' : '#111111'; };
  var dimCol = function () { return isDark() ? '#555555' : '#aaaaaa'; };
  var bgCol = function () { return isDark() ? '#0a0a0a' : '#ffffff'; };
  var accentA = function () { return isDark() ? '#5599dd' : '#2266bb'; };
  var accentB = function () { return isDark() ? '#ffaa44' : '#dd7711'; };
  var goodCol = function () { return isDark() ? '#44bb77' : '#228855'; };
  var badCol = function () { return isDark() ? '#dd5555' : '#bb3333'; };

  function setupCanvas(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.parentElement.getBoundingClientRect();
    var w = rect.width;
    var h = 300;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    return { ctx: ctx, w: w, h: h };
  }


  // ─── Diagram A: 1D Energy Landscape with Stability Points ───

  var energyCanvas = document.getElementById('energy-1d');
  if (energyCanvas) {
    var eQueryX = null;
    var eAnimId = null;
    var eTrail = [];

    function E(x) {
      return 0.5 * Math.sin(2.8 * x) + 0.3 * Math.cos(4.5 * x + 0.5)
           - 0.15 * Math.sin(7 * x) + 0.08 * Math.cos(11 * x)
           + 0.02 * x * x - 0.1 * x;
    }

    function dE(x) {
      var eps = 1e-5;
      return (E(x + eps) - E(x - eps)) / (2 * eps);
    }

    var xMin = -3.5, xMax = 3.5;

    function drawEnergy1D() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var rect = energyCanvas.parentElement.getBoundingClientRect();
      var w = rect.width, h = 300;
      energyCanvas.width = w * dpr;
      energyCanvas.height = h * dpr;
      energyCanvas.style.width = w + 'px';
      energyCanvas.style.height = h + 'px';
      var ctx = energyCanvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      var pad = { l: 50, r: 20, t: 30, b: 40 };
      var pw = w - pad.l - pad.r;
      var ph = h - pad.t - pad.b;

      var N = 500;
      var vals = [];
      var eMin = Infinity, eMax = -Infinity;
      for (var i = 0; i <= N; i++) {
        var x = xMin + (xMax - xMin) * i / N;
        var e = E(x);
        vals.push({ x: x, e: e });
        if (e < eMin) eMin = e;
        if (e > eMax) eMax = e;
      }
      var eRange = eMax - eMin || 1;
      eMin -= eRange * 0.08;
      eMax += eRange * 0.08;
      eRange = eMax - eMin;

      function tx(x) { return pad.l + ((x - xMin) / (xMax - xMin)) * pw; }
      function ty(e) { return pad.t + ph - ((e - eMin) / eRange) * ph; }

      ctx.fillStyle = bgCol();
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = dimCol();
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t);
      ctx.lineTo(pad.l, pad.t + ph);
      ctx.lineTo(pad.l + pw, pad.t + ph);
      ctx.stroke();

      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillStyle = dimCol();
      ctx.textAlign = 'center';
      ctx.fillText('state q', w / 2, h - 5);
      ctx.save();
      ctx.translate(14, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('E(q)', 0, 0);
      ctx.restore();

      ctx.beginPath();
      ctx.strokeStyle = fgCol();
      ctx.lineWidth = 2;
      for (var i = 0; i <= N; i++) {
        var px = tx(vals[i].x);
        var py = ty(vals[i].e);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      var dx = (xMax - xMin) / N;
      var criticals = [];
      for (var i = 1; i < N; i++) {
        var dPrev = vals[i].e - vals[i - 1].e;
        var dNext = vals[i + 1].e - vals[i].e;
        if (dPrev <= 0 && dNext > 0) {
          criticals.push({ x: vals[i].x, e: vals[i].e, type: 'stable' });
        } else if (dPrev >= 0 && dNext < 0) {
          criticals.push({ x: vals[i].x, e: vals[i].e, type: 'unstable' });
        }
      }

      var d2 = [];
      for (var i = 1; i < N; i++) {
        d2.push((vals[i + 1].e - 2 * vals[i].e + vals[i - 1].e) / (dx * dx));
      }
      for (var i = 1; i < d2.length - 1; i++) {
        if (d2[i - 1] * d2[i + 1] < 0 && Math.abs(d2[i]) < 0.5) {
          var x = vals[i + 1].x;
          var e = vals[i + 1].e;
          var isMin = false;
          for (var c = 0; c < criticals.length; c++) {
            if (Math.abs(criticals[c].x - x) < 0.3) { isMin = true; break; }
          }
          if (!isMin) {
            criticals.push({ x: x, e: e, type: 'metastable' });
          }
        }
      }

      for (var c = 0; c < criticals.length; c++) {
        var pt = criticals[c];
        var px = tx(pt.x);
        var py = ty(pt.e);
        var r = 5;
        var col, labelText;

        if (pt.type === 'stable') {
          col = goodCol(); labelText = 'stable';
        } else if (pt.type === 'unstable') {
          col = badCol(); labelText = 'unstable';
        } else {
          col = accentB(); labelText = 'metastable';
        }

        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = col;
        ctx.fill();

        ctx.strokeStyle = col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(px, py, r + 3, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = col;
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        var labelY = pt.type === 'unstable' ? py + 18 : py - 14;
        ctx.fillText(labelText, px, labelY);
      }

      // draw trail
      if (eTrail.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = accentB();
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.4;
        for (var i = 0; i < eTrail.length; i++) {
          var px = tx(eTrail[i]);
          var py = ty(E(eTrail[i]));
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // draw query ball
      if (eQueryX !== null) {
        var qpx = tx(eQueryX);
        var qpy = ty(E(eQueryX));
        ctx.beginPath();
        ctx.arc(qpx, qpy, 7, 0, Math.PI * 2);
        ctx.fillStyle = accentB();
        ctx.fill();
        ctx.strokeStyle = fgCol();
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // hint text
      if (eQueryX === null) {
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillStyle = dimCol();
        ctx.textAlign = 'center';
        ctx.fillText('click anywhere to drop a query', w / 2, pad.t + 14);
      }
    }

    function pixToX(px) {
      var rect = energyCanvas.getBoundingClientRect();
      var pad = { l: 50, r: 20 };
      var w = rect.width;
      var pw = w - pad.l - pad.r;
      var rel = (px - rect.left - pad.l) / pw;
      return xMin + rel * (xMax - xMin);
    }

    energyCanvas.style.cursor = 'crosshair';
    energyCanvas.addEventListener('click', function (ev) {
      var x = pixToX(ev.clientX);
      if (x < xMin || x > xMax) return;
      eQueryX = x;
      eTrail = [x];
      if (eAnimId) cancelAnimationFrame(eAnimId);

      var lr = 0.03;
      var settled = 0;
      function step() {
        var grad = dE(eQueryX);
        eQueryX -= lr * grad;
        eQueryX = Math.max(xMin + 0.05, Math.min(xMax - 0.05, eQueryX));
        eTrail.push(eQueryX);
        if (eTrail.length > 300) eTrail.shift();
        drawEnergy1D();
        if (Math.abs(grad) < 0.005) {
          settled++;
          if (settled > 10) { eAnimId = null; return; }
        } else {
          settled = 0;
        }
        eAnimId = requestAnimationFrame(step);
      }
      eAnimId = requestAnimationFrame(step);
    });

    drawEnergy1D();
    window.addEventListener('resize', drawEnergy1D);
    new MutationObserver(drawEnergy1D).observe(
      document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }
    );
  }


  // ─── Diagram B: Kernel Smoothing / Nadaraya-Watson ───

  var kernelCanvas = document.getElementById('kernel-smoothing');
  if (kernelCanvas) {
    var bandwidth = 0.6;

    function drawKernelSmoothing() {
      var s = setupCanvas(kernelCanvas);
      var ctx = s.ctx, w = s.w, h = s.h;

      var pad = { l: 50, r: 20, t: 20, b: 40 };
      var pw = w - pad.l - pad.r;
      var ph = h - pad.t - pad.b;

      var points = [
        { x: -2.5, y: 1.2 },
        { x: -1.8, y: 2.0 },
        { x: -1.2, y: 1.8 },
        { x: -0.5, y: 2.5 },
        { x: 0.0,  y: 2.2 },
        { x: 0.6,  y: 1.0 },
        { x: 1.0,  y: 0.5 },
        { x: 1.5,  y: 0.8 },
        { x: 2.0,  y: 1.5 },
        { x: 2.5,  y: 2.0 },
        { x: -0.8, y: 2.1 },
        { x: 0.3,  y: 1.6 },
      ];

      var xMin = -3, xMax = 3, yMin = -0.2, yMax = 3.5;

      function tx(x) { return pad.l + ((x - xMin) / (xMax - xMin)) * pw; }
      function ty(y) { return pad.t + ph - ((y - yMin) / (yMax - yMin)) * ph; }

      function gaussKernel(d, h) {
        return Math.exp(-0.5 * (d / h) * (d / h));
      }

      function nw(xq) {
        var num = 0, den = 0;
        for (var i = 0; i < points.length; i++) {
          var w = gaussKernel(xq - points[i].x, bandwidth);
          num += w * points[i].y;
          den += w;
        }
        return den > 1e-10 ? num / den : 0;
      }

      ctx.fillStyle = bgCol();
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = dimCol();
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t);
      ctx.lineTo(pad.l, pad.t + ph);
      ctx.lineTo(pad.l + pw, pad.t + ph);
      ctx.stroke();

      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillStyle = dimCol();
      ctx.textAlign = 'center';
      ctx.fillText('key space', w / 2, h - 5);
      ctx.save();
      ctx.translate(14, h / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('value', 0, 0);
      ctx.restore();

      var N = 300;
      ctx.beginPath();
      ctx.strokeStyle = accentB();
      ctx.lineWidth = 2.5;
      for (var i = 0; i <= N; i++) {
        var x = xMin + (xMax - xMin) * i / N;
        var y = nw(x);
        var px = tx(x);
        var py = ty(y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      var queryX = -0.3;
      var queryY = nw(queryX);

      for (var i = 0; i < points.length; i++) {
        var wt = gaussKernel(queryX - points[i].x, bandwidth);
        var maxW = 1;
        var alpha = 0.1 + 0.9 * (wt / maxW);
        var r = 3 + 4 * (wt / maxW);

        if (wt > 0.05) {
          ctx.strokeStyle = accentA();
          ctx.lineWidth = 1;
          ctx.globalAlpha = wt * 0.3;
          ctx.beginPath();
          ctx.moveTo(tx(queryX), ty(0) - 2);
          ctx.lineTo(tx(points[i].x), ty(points[i].y));
          ctx.stroke();
          ctx.globalAlpha = 1;
        }

        ctx.beginPath();
        ctx.arc(tx(points[i].x), ty(points[i].y), r, 0, Math.PI * 2);
        ctx.fillStyle = accentA();
        ctx.globalAlpha = alpha;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = fgCol();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx(queryX), ty(yMin));
      ctx.lineTo(tx(queryX), ty(queryY));
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.arc(tx(queryX), ty(queryY), 6, 0, Math.PI * 2);
      ctx.fillStyle = accentB();
      ctx.fill();

      ctx.fillStyle = fgCol();
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('q', tx(queryX), ty(yMin) + 14);
      ctx.fillText('f(q)', tx(queryX) + 18, ty(queryY) - 8);

      ctx.fillStyle = dimCol();
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('h = ' + bandwidth.toFixed(2), pad.l + 4, pad.t + 14);
    }

    drawKernelSmoothing();
    window.addEventListener('resize', drawKernelSmoothing);
    new MutationObserver(drawKernelSmoothing).observe(
      document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }
    );

    var bwSlider = document.getElementById('bandwidth-slider');
    var bwLabel = document.getElementById('bandwidth-label');
    if (bwSlider) {
      bwSlider.addEventListener('input', function () {
        bandwidth = parseFloat(bwSlider.value);
        if (bwLabel) bwLabel.textContent = 'h = ' + bandwidth.toFixed(2);
        drawKernelSmoothing();
      });
    }
  }

  // ─── Diagram C: Kernel Comparison — exp vs ReLU ───

  var assocCanvas = document.getElementById('assoc-comparison');
  if (assocCanvas) {
    function drawAssocComparison() {
      var s = setupCanvas(assocCanvas);
      var ctx = s.ctx, w = s.w, h = s.h;

      ctx.fillStyle = bgCol();
      ctx.fillRect(0, 0, w, h);

      var pad = { l: 50, r: 30, t: 40, b: 36 };
      var pw = w - pad.l - pad.r;
      var ph = h - pad.t - pad.b;

      // axes
      ctx.strokeStyle = dimCol();
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t + ph);
      ctx.lineTo(pad.l + pw, pad.t + ph);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t);
      ctx.lineTo(pad.l, pad.t + ph);
      ctx.stroke();

      // axis labels
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = dimCol();
      ctx.textAlign = 'center';
      ctx.fillText('q⊤k', pad.l + pw / 2, pad.t + ph + 24);
      ctx.save();
      ctx.translate(14, pad.t + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('κ(q, k)', 0, 0);
      ctx.restore();

      var xMin = -4, xMax = 4;
      var N = 400;

      function toX(v) { return pad.l + (v - xMin) / (xMax - xMin) * pw; }
      function toY(v) { return pad.t + ph - v * ph; }

      function expK(x) { return Math.exp(-x * x * 0.8); }
      function reluK(x) { return Math.max(0, 1 - Math.abs(x) * 0.35); }

      // ReLU fill
      ctx.fillStyle = badCol();
      ctx.globalAlpha = 0.06;
      ctx.beginPath();
      for (var i = 0; i <= N; i++) {
        var x = xMin + (xMax - xMin) * i / N;
        var y = reluK(x);
        var px = toX(x), py = toY(y);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.lineTo(toX(xMax), toY(0));
      ctx.lineTo(toX(xMin), toY(0));
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      // exp fill
      ctx.fillStyle = accentA();
      ctx.globalAlpha = 0.06;
      ctx.beginPath();
      for (var i = 0; i <= N; i++) {
        var x = xMin + (xMax - xMin) * i / N;
        var y = expK(x);
        var px = toX(x), py = toY(y);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.lineTo(toX(xMax), toY(0));
      ctx.lineTo(toX(xMin), toY(0));
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;

      // ReLU curve
      ctx.beginPath();
      ctx.strokeStyle = badCol();
      ctx.lineWidth = 1.5;
      for (var i = 0; i <= N; i++) {
        var x = xMin + (xMax - xMin) * i / N;
        var y = reluK(x);
        if (i === 0) ctx.moveTo(toX(x), toY(y)); else ctx.lineTo(toX(x), toY(y));
      }
      ctx.stroke();

      // exp curve
      ctx.beginPath();
      ctx.strokeStyle = accentA();
      ctx.lineWidth = 1.5;
      for (var i = 0; i <= N; i++) {
        var x = xMin + (xMax - xMin) * i / N;
        var y = expK(x);
        if (i === 0) ctx.moveTo(toX(x), toY(y)); else ctx.lineTo(toX(x), toY(y));
      }
      ctx.stroke();

      // annotations — bracket showing "support" width
      var expW = 1.2; // rough 1-sigma
      var reluW = 2.86; // where relu hits zero

      // exp bracket
      var bY = toY(0) + 14;
      ctx.strokeStyle = accentA();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(toX(-expW), bY); ctx.lineTo(toX(-expW), bY - 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(expW), bY); ctx.lineTo(toX(expW), bY - 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(-expW), bY); ctx.lineTo(toX(expW), bY);
      ctx.stroke();

      // relu bracket
      var bY2 = bY + 14;
      ctx.strokeStyle = badCol();
      ctx.beginPath();
      ctx.moveTo(toX(-reluW), bY2); ctx.lineTo(toX(-reluW), bY2 - 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(reluW), bY2); ctx.lineTo(toX(reluW), bY2 - 4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(-reluW), bY2); ctx.lineTo(toX(reluW), bY2);
      ctx.stroke();

      // legend
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      var legX = pad.l + 10, legY = pad.t + 16;

      ctx.fillStyle = accentA();
      ctx.fillRect(legX, legY - 6, 14, 2);
      ctx.fillText('exp(q⊤k / √d)', legX + 20, legY);

      ctx.fillStyle = badCol();
      ctx.fillRect(legX, legY + 14, 14, 2);
      ctx.fillText('ReLU(q⊤k)', legX + 20, legY + 20);

      // right-side annotations
      ctx.textAlign = 'right';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = accentA();
      ctx.fillText('narrow support → high precision', pad.l + pw - 4, legY);
      ctx.fillStyle = badCol();
      ctx.fillText('wide support → more superposition', pad.l + pw - 4, legY + 20);
    }

    drawAssocComparison();
    window.addEventListener('resize', drawAssocComparison);
    new MutationObserver(drawAssocComparison).observe(
      document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }
    );
  }

  // ─── Diagram D: Sparse Attention Perplexity under GQA ───

  var sparseCanvas = document.getElementById('sparse-attn-eval');
  if (sparseCanvas) {
    function drawSparseEval() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var rect = sparseCanvas.parentElement.getBoundingClientRect();
      var w = rect.width, h = 260;
      sparseCanvas.width = w * dpr;
      sparseCanvas.height = h * dpr;
      sparseCanvas.style.width = w + 'px';
      sparseCanvas.style.height = h + 'px';
      var ctx = sparseCanvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = bgCol();
      ctx.fillRect(0, 0, w, h);

      var data = [
        { label: 'MQA (1 KV head)', models: [
          { name: 'Transformer', ppl: 5.815, col: dimCol },
          { name: 'MoBA',        ppl: 5.760, col: accentA },
          { name: 'NSA',         ppl: 5.652, col: goodCol },
        ]},
        { label: 'GQA (4 KV heads)', models: [
          { name: 'Transformer', ppl: 5.780, col: dimCol },
          { name: 'MoBA',        ppl: 5.588, col: accentA },
          { name: 'NSA',         ppl: 5.626, col: goodCol },
        ]},
        { label: 'MHA (16 KV heads)', models: [
          { name: 'Transformer', ppl: 5.506, col: dimCol },
          { name: 'MoBA',        ppl: 5.571, col: accentA },
        ]},
      ];

      var pad = { l: 55, r: 20, t: 20, b: 50 };
      var pw = w - pad.l - pad.r;
      var ph = h - pad.t - pad.b;

      var pplMin = 5.45, pplMax = 5.85;

      function toY(ppl) {
        return pad.t + ph - ((ppl - pplMin) / (pplMax - pplMin)) * ph;
      }

      // y-axis
      ctx.strokeStyle = dimCol();
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(pad.l, pad.t);
      ctx.lineTo(pad.l, pad.t + ph);
      ctx.lineTo(pad.l + pw, pad.t + ph);
      ctx.stroke();

      // y ticks
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillStyle = dimCol();
      ctx.textAlign = 'right';
      for (var tick = 5.5; tick <= 5.8; tick += 0.1) {
        var y = toY(tick);
        ctx.fillText(tick.toFixed(1), pad.l - 6, y + 3);
        ctx.beginPath();
        ctx.strokeStyle = dimCol();
        ctx.lineWidth = 0.3;
        ctx.setLineDash([2, 3]);
        ctx.moveTo(pad.l, y);
        ctx.lineTo(pad.l + pw, y);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.save();
      ctx.translate(12, pad.t + ph / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = dimCol();
      ctx.textAlign = 'center';
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.fillText('perplexity ↓', 0, 0);
      ctx.restore();

      var nGroups = data.length;
      var groupW = pw / nGroups;
      var barW = 18;

      for (var g = 0; g < nGroups; g++) {
        var group = data[g];
        var nBars = group.models.length;
        var gx = pad.l + g * groupW + groupW / 2;

        // group label
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.fillStyle = fgCol();
        ctx.textAlign = 'center';
        ctx.fillText(group.label, gx, pad.t + ph + 16);

        var totalBarW = nBars * barW + (nBars - 1) * 4;
        var startX = gx - totalBarW / 2;

        for (var b = 0; b < nBars; b++) {
          var m = group.models[b];
          var bx = startX + b * (barW + 4);
          var by = toY(m.ppl);
          var bh = toY(pplMin) - by;

          ctx.fillStyle = m.col();
          ctx.globalAlpha = 0.7;
          ctx.fillRect(bx, by, barW, bh);
          ctx.globalAlpha = 1;

          ctx.strokeStyle = m.col();
          ctx.lineWidth = 1;
          ctx.strokeRect(bx, by, barW, bh);

          // value label
          ctx.font = '9px JetBrains Mono, monospace';
          ctx.fillStyle = fgCol();
          ctx.textAlign = 'center';
          ctx.fillText(m.ppl.toFixed(3), bx + barW / 2, by - 4);
        }
      }

      // legend
      var legX = pad.l + pw - 10;
      var legY = pad.t + 10;
      ctx.textAlign = 'right';
      ctx.font = '10px JetBrains Mono, monospace';

      var items = [
        { name: 'Transformer', col: dimCol },
        { name: 'MoBA', col: accentA },
        { name: 'NSA', col: goodCol },
      ];
      for (var i = 0; i < items.length; i++) {
        var ly = legY + i * 16;
        ctx.fillStyle = items[i].col();
        ctx.fillRect(legX + 4, ly - 5, 10, 10);
        ctx.fillStyle = fgCol();
        ctx.fillText(items[i].name, legX, ly + 4);
      }
    }

    drawSparseEval();
    window.addEventListener('resize', drawSparseEval);
    new MutationObserver(drawSparseEval).observe(
      document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }
    );
  }

})();
