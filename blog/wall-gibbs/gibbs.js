(function () {
  'use strict';

  var isDark = function () {
    return document.documentElement.getAttribute('data-theme') !== 'light';
  };
  var fgCol  = function () { return isDark() ? '#e8e8e8' : '#111111'; };
  var dimCol = function () { return isDark() ? '#666666' : '#999999'; };
  var faintCol = function () { return isDark() ? '#2a2a2a' : '#e6e6e6'; };
  var bgCol  = function () { return isDark() ? '#0a0a0a' : '#ffffff'; };
  var panelCol = function () { return isDark() ? '#0f0f10' : '#fafafa'; };
  var statCol = function () { return isDark() ? '#7d7d7d' : '#8a8a8a'; };
  var gibbCol = function () { return isDark() ? '#5b9be0' : '#2266bb'; };
  var ellCol  = function () { return isDark() ? '#e0a24a' : '#cf7711'; };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function dprSetup(canvas, height) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.parentElement.getBoundingClientRect();
    var w = rect.width;
    var h = height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }


  /* ───────────────────────── Diagram 1: Gibbs contour ───────────────────────── */

  (function () {
    var canvas = document.getElementById('gibbs-kernel');
    if (!canvas) return;

    var L0 = 1.0;
    var variation = 0.7;
    var xMin = 0, xMax = 10, mid = 5, amp = 4.0;
    var x0 = mid;
    var phase = 0;
    var mode = 'auto';      // 'auto' | 'manual'
    var dragging = false;
    var resumeAt = 0;
    var last = performance.now();
    var w = 0, h = 0;

    function ell(x) {
      return L0 * Math.exp(variation * 0.95 * Math.sin(0.7 * x - 1.0));
    }
    function kRBF(x) {
      var d = x - x0;
      return Math.exp(-(d * d) / (2 * L0 * L0));
    }
    function kGibbs(x) {
      var la = ell(x0), lb = ell(x);
      var s = la * la + lb * lb;
      var d = x - x0;
      return Math.sqrt((2 * la * lb) / s) * Math.exp(-(d * d) / s);
    }

    function resize() { var s = dprSetup(canvas, 360); w = s.w; h = s.h; }

    function draw() {
      var ctx = canvas.getContext('2d');
      var pad = { l: 44, r: 16, t: 16, b: 26 };
      var stripH = 58, gap = 30;
      var pw = w - pad.l - pad.r;
      var mainTop = pad.t;
      var headroom = 50;                          // keep peaks clear of legend
      var mainH = h - pad.t - pad.b - stripH - gap;
      var stripTop = pad.t + mainH + gap;
      var lDispMin = 0.3, lDispMax = 2.7;

      function tx(x) { return pad.l + ((x - xMin) / (xMax - xMin)) * pw; }
      function ky(v) { return mainTop + headroom + (1 - v) * (mainH - headroom); }
      function ly(l) {
        var f = Math.max(0, Math.min(1, (l - lDispMin) / (lDispMax - lDispMin)));
        return stripTop + stripH - f * stripH;
      }

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = bgCol();
      ctx.fillRect(0, 0, w, h);

      var N = 360;

      // baseline
      ctx.strokeStyle = faintCol();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, ky(0));
      ctx.lineTo(pad.l + pw, ky(0));
      ctx.stroke();

      // anchor guide (drawn under curves)
      ctx.strokeStyle = isDark() ? '#3a3a3a' : '#dcdcdc';
      ctx.lineWidth = 1;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(tx(x0), ky(1) - 6);
      ctx.lineTo(tx(x0), ly(ell(x0)));
      ctx.stroke();
      ctx.setLineDash([]);

      function curve(fn, col, fillTop, lw) {
        // gradient fill
        var grad = ctx.createLinearGradient(0, ky(1), 0, ky(0));
        grad.addColorStop(0, col + fillTop);
        grad.addColorStop(1, col + '00');
        ctx.beginPath();
        for (var i = 0; i <= N; i++) {
          var x = xMin + (xMax - xMin) * i / N;
          var px = tx(x), py = ky(fn(x));
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.lineTo(tx(xMax), ky(0));
        ctx.lineTo(tx(xMin), ky(0));
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        // stroke
        ctx.beginPath();
        for (var i = 0; i <= N; i++) {
          var x = xMin + (xMax - xMin) * i / N;
          var px = tx(x), py = ky(fn(x));
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        ctx.stroke();
      }

      curve(kRBF, statCol(), '26', 1.4);
      curve(kGibbs, gibbCol(), '33', 2.4);

      // peak dot with glow
      var px0 = tx(x0), py0 = ky(1);
      ctx.save();
      ctx.shadowColor = gibbCol();
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(px0, py0, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = fgCol();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = dimCol();
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('x\u2080', px0, ky(0) + 16);

      // ── length-scale strip ──
      ctx.strokeStyle = statCol();
      ctx.globalAlpha = 0.55;
      ctx.setLineDash([2, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pad.l, ly(L0));
      ctx.lineTo(pad.l + pw, ly(L0));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      var fgrad = ctx.createLinearGradient(0, stripTop, 0, stripTop + stripH);
      fgrad.addColorStop(0, ellCol() + '2e');
      fgrad.addColorStop(1, ellCol() + '00');
      ctx.beginPath();
      for (var i = 0; i <= N; i++) {
        var x = xMin + (xMax - xMin) * i / N;
        var px = tx(x), py = ly(ell(x));
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.lineTo(tx(xMax), ly(lDispMin));
      ctx.lineTo(tx(xMin), ly(lDispMin));
      ctx.closePath();
      ctx.fillStyle = fgrad;
      ctx.fill();

      ctx.beginPath();
      for (var i = 0; i <= N; i++) {
        var x = xMin + (xMax - xMin) * i / N;
        var px = tx(x), py = ly(ell(x));
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = ellCol();
      ctx.lineWidth = 1.8;
      ctx.lineJoin = 'round';
      ctx.stroke();

      var lr = ell(x0);
      ctx.beginPath();
      ctx.arc(tx(x0), ly(lr), 3.5, 0, Math.PI * 2);
      ctx.fillStyle = ellCol();
      ctx.fill();

      ctx.fillStyle = statCol();
      ctx.font = '9px JetBrains Mono, monospace';
      ctx.textAlign = 'right';
      ctx.fillText('\u2113 = 1 (fixed)', pad.l + pw - 4, ly(L0) - 5);

      ctx.save();
      ctx.translate(13, stripTop + stripH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = dimCol();
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('\u2113(x)', 0, 0);
      ctx.restore();

      // x-axis label
      ctx.fillStyle = dimCol();
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('input x  \u00b7  sequence position', pad.l + pw / 2, h - 6);

      // clean status (single location, no overlap)
      var note = lr < L0 * 0.97 ? 'sharper' : lr > L0 * 1.03 ? 'broader' : '\u2248 vanilla';
      ctx.fillStyle = ellCol();
      ctx.font = '10px JetBrains Mono, monospace';
      ctx.textAlign = 'left';
      ctx.fillText('\u2113(x\u2080) = ' + lr.toFixed(2), pad.l + 2, stripTop - 8);
      ctx.fillStyle = dimCol();
      ctx.fillText('\u00b7  ' + note, pad.l + 2 + 84, stripTop - 8);

      // ── legend chip (drawn last, occludes curves) ──
      ctx.font = '11px JetBrains Mono, monospace';
      var lines = ['stationary RBF \u00b7 vanilla', 'Gibbs kernel \u00b7 Wall'];
      var tw = 0;
      for (var i = 0; i < lines.length; i++) tw = Math.max(tw, ctx.measureText(lines[i]).width);
      var chipW = tw + 44, chipH = 40, cx = pad.l + 8, cy = mainTop + 4;
      ctx.globalAlpha = isDark() ? 0.82 : 0.9;
      ctx.fillStyle = panelCol();
      roundRect(ctx, cx, cy, chipW, chipH, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = faintCol();
      ctx.lineWidth = 1;
      roundRect(ctx, cx, cy, chipW, chipH, 6);
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.strokeStyle = statCol();
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(cx + 12, cy + 15); ctx.lineTo(cx + 28, cy + 15); ctx.stroke();
      ctx.fillStyle = fgCol();
      ctx.fillText(lines[0], cx + 34, cy + 18);
      ctx.strokeStyle = gibbCol();
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(cx + 12, cy + 31); ctx.lineTo(cx + 28, cy + 31); ctx.stroke();
      ctx.fillStyle = fgCol();
      ctx.fillText(lines[1], cx + 34, cy + 34);
    }

    function tick(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (mode === 'auto') {
        phase += dt * 0.5;
        x0 = mid + amp * Math.sin(phase);
      } else if (!dragging && now >= resumeAt) {
        // smooth resume: sync phase to current x0, then hand back to auto
        phase = Math.asin(Math.max(-1, Math.min(1, (x0 - mid) / amp)));
        mode = 'auto';
      }
      draw();
      requestAnimationFrame(tick);
    }

    function pointerX(clientX) {
      var rect = canvas.getBoundingClientRect();
      var pad = { l: 44, r: 16 };
      var pw = rect.width - pad.l - pad.r;
      var rel = (clientX - rect.left - pad.l) / pw;
      return Math.max(xMin, Math.min(xMax, xMin + rel * (xMax - xMin)));
    }

    canvas.style.cursor = 'ew-resize';
    canvas.style.touchAction = 'none';
    canvas.addEventListener('pointerdown', function (ev) {
      mode = 'manual'; dragging = true;
      x0 = pointerX(ev.clientX);
      try { canvas.setPointerCapture(ev.pointerId); } catch (e) {}
    });
    canvas.addEventListener('pointermove', function (ev) {
      if (dragging) x0 = pointerX(ev.clientX);
    });
    function release() { dragging = false; resumeAt = performance.now() + 1100; }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    var slider = document.getElementById('gibbs-variation');
    var sliderVal = document.getElementById('gibbs-variation-val');
    if (slider) {
      slider.addEventListener('input', function () {
        variation = parseFloat(slider.value);
        if (sliderVal) sliderVal.textContent = variation.toFixed(2);
      });
    }

    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(tick);
  })();

})();
