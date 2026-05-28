(function () {
  'use strict';

  var canvas = document.getElementById('phase-diagram');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var tooltip = document.getElementById('phase-tooltip');
  var resetBtn = document.getElementById('phase-reset-zoom');

  var data = null;
  var imageData = null;

  // Zoom/pan state (in data coordinates)
  var view = { xMin: 1.0, xMax: 2.0, yMin: 0.01, yMax: 0.45 };
  var dataExtent = { xMin: 1.0, xMax: 2.0, yMin: 0.01, yMax: 0.45 };
  var dragging = false;
  var dragStart = null;
  var dragViewStart = null;

  var PERIOD_COLORS_DARK = {
    2: [180, 130, 90], 3: [200, 110, 80], 4: [190, 90, 100],
    5: [170, 80, 120], 6: [150, 75, 135], 7: [130, 70, 145], 8: [110, 65, 150],
  };
  var PERIOD_COLORS_LIGHT = {
    2: [160, 100, 60], 3: [180, 80, 50], 4: [170, 60, 70],
    5: [150, 50, 90], 6: [130, 45, 105], 7: [110, 40, 115], 8: [90, 35, 120],
  };

  var TYPE_COLORS_DARK = {
    0: [12, 12, 16], 1: [40, 50, 60], 2: [180, 130, 90], 3: [20, 14, 18], 4: [200, 195, 210],
  };
  var TYPE_COLORS_LIGHT = {
    0: [245, 245, 245], 1: [190, 200, 210], 2: [160, 100, 60], 3: [220, 220, 220], 4: [50, 45, 60],
  };

  var TYPE_LABELS = {
    1: 'Fixed point', 2: 'Limit cycle', 3: 'Diverged', 4: 'Aperiodic / chaotic',
  };

  var dpr = Math.min(window.devicePixelRatio || 1, 2);

  function isDark() { return document.documentElement.getAttribute('data-theme') !== 'light'; }

  function getColors() {
    var dark = isDark();
    return {
      fg: dark ? '#e8e8e8' : '#000000',
      label: dark ? '#555555' : '#aaaaaa',
      axis: dark ? '#333333' : '#cccccc',
    };
  }

  function decodeBase64ToUint8(b64) {
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  function decodeBase64ToFloat32(b64) {
    var bin = atob(b64);
    var buf = new ArrayBuffer(bin.length);
    var u = new Uint8Array(buf);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return new Float32Array(buf);
  }

  function loadData() {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', '/blog/ouroboros/phase-data.json', true);
    xhr.onload = function () {
      if (xhr.status === 200) {
        var raw = JSON.parse(xhr.responseText);
        data = {
          res: raw.res,
          xMin: raw.x_min, xMax: raw.x_max,
          yMin: raw.y_min, yMax: raw.y_max,
          typeGrid: decodeBase64ToUint8(raw.type_grid),
          periodGrid: decodeBase64ToUint8(raw.period_grid),
          meanLossGrid: decodeBase64ToFloat32(raw.mean_loss_grid),
        };
        dataExtent = { xMin: data.xMin, xMax: data.xMax, yMin: data.yMin, yMax: data.yMax };
        view = { xMin: data.xMin, xMax: data.xMax, yMin: data.yMin, yMax: data.yMax };
        buildFullImage();
        render();
      }
    };
    xhr.send();
  }

  var fullImageCanvas = null;

  function buildFullImage() {
    if (!data) return;
    var res = data.res;
    var dark = isDark();
    var tc = dark ? TYPE_COLORS_DARK : TYPE_COLORS_LIGHT;
    var pc = dark ? PERIOD_COLORS_DARK : PERIOD_COLORS_LIGHT;

    fullImageCanvas = document.createElement('canvas');
    fullImageCanvas.width = res;
    fullImageCanvas.height = res;
    var fCtx = fullImageCanvas.getContext('2d');
    var img = fCtx.createImageData(res, res);
    var d = img.data;

    var fpLosses = [];
    for (var i = 0; i < res * res; i++) {
      if (data.typeGrid[i] === 1) fpLosses.push(data.meanLossGrid[i]);
    }
    fpLosses.sort(function (a, b) { return a - b; });
    var fpMin = fpLosses.length > 0 ? fpLosses[0] : 0;
    var fpMax = fpLosses.length > 0 ? fpLosses[fpLosses.length - 1] : 1;
    var fpRange = fpMax - fpMin || 1e-10;

    for (var yi = 0; yi < res; yi++) {
      for (var xi = 0; xi < res; xi++) {
        var srcY = res - 1 - yi;
        var idx = srcY * res + xi;
        var t = data.typeGrid[idx];
        var c;

        if (t === 1) {
          var lossNorm = (data.meanLossGrid[idx] - fpMin) / fpRange;
          lossNorm = Math.max(0, Math.min(1, lossNorm));
          var base = tc[1];
          if (dark) {
            c = [base[0] + Math.round(lossNorm * 30), base[1] + Math.round(lossNorm * 30), base[2] + Math.round(lossNorm * 40)];
          } else {
            c = [base[0] + Math.round((1 - lossNorm) * 30), base[1] + Math.round((1 - lossNorm) * 30), base[2] + Math.round((1 - lossNorm) * 20)];
          }
        } else if (t === 2) {
          c = pc[data.periodGrid[idx]] || tc[2];
        } else {
          c = tc[t] || [0, 0, 0];
        }

        var oi = (yi * res + xi) * 4;
        d[oi] = c[0]; d[oi + 1] = c[1]; d[oi + 2] = c[2]; d[oi + 3] = 255;
      }
    }
    fCtx.putImageData(img, 0, 0);
  }

  function getPad() { return { top: 36, right: 100, bottom: 36, left: 56 }; }

  function render() {
    if (!data || !fullImageCanvas) return;
    var w = canvas.width / dpr;
    var h = canvas.height / dpr;
    var colors = getColors();
    ctx.clearRect(0, 0, w, h);

    var pad = getPad();
    var pw = w - pad.left - pad.right;
    var ph = h - pad.top - pad.bottom;

    // Map view rect to source pixels
    var res = data.res;
    var sx = (view.xMin - dataExtent.xMin) / (dataExtent.xMax - dataExtent.xMin) * res;
    var sy = (1 - (view.yMax - dataExtent.yMin) / (dataExtent.yMax - dataExtent.yMin)) * res;
    var sw = (view.xMax - view.xMin) / (dataExtent.xMax - dataExtent.xMin) * res;
    var sh = (view.yMax - view.yMin) / (dataExtent.yMax - dataExtent.yMin) * res;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(fullImageCanvas, sx, sy, sw, sh, pad.left, pad.top, pw, ph);

    // Axes
    ctx.strokeStyle = colors.axis;
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.left, pad.top, pw, ph);

    ctx.font = '10px JetBrains Mono, monospace';
    ctx.fillStyle = colors.label;

    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (var i = 0; i <= 4; i++) {
      var val = view.xMin + (i / 4) * (view.xMax - view.xMin);
      ctx.fillText(val.toFixed(2), pad.left + (i / 4) * pw, pad.top + ph + 6);
    }
    ctx.fillText('γ (rescaling exponent)', pad.left + pw / 2, pad.top + ph + 20);

    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (var i = 0; i <= 4; i++) {
      var val = view.yMin + (i / 4) * (view.yMax - view.yMin);
      ctx.fillText(val.toFixed(3), pad.left - 6, pad.top + ph - (i / 4) * ph);
    }
    ctx.save();
    ctx.translate(12, pad.top + ph / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('η_max', 0, 0);
    ctx.restore();

    // Legend
    var dark = isDark();
    var tc = dark ? TYPE_COLORS_DARK : TYPE_COLORS_LIGHT;
    var pc = dark ? PERIOD_COLORS_DARK : PERIOD_COLORS_LIGHT;
    var legendX = pad.left + pw + 12;
    var legendY = pad.top + 4;
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';

    var items = [
      { c: tc[1], label: 'Fixed point' },
      { c: pc[2], label: 'Period 2' },
      { c: pc[3], label: 'Period 3' },
      { c: pc[5], label: 'Period 5+' },
      { c: tc[4], label: 'Aperiodic' },
    ];

    for (var i = 0; i < items.length; i++) {
      var c = items[i].c;
      var y = legendY + i * 16;
      ctx.fillStyle = 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
      ctx.fillRect(legendX, y - 4, 8, 8);
      ctx.fillStyle = colors.label;
      ctx.fillText(items[i].label, legendX + 14, y);
    }
  }

  function pixelToData(mx, my) {
    var rect = canvas.getBoundingClientRect();
    var pad = getPad();
    var pw = rect.width - pad.left - pad.right;
    var ph = rect.height - pad.top - pad.bottom;
    var rx = (mx - pad.left) / pw;
    var ry = 1 - (my - pad.top) / ph;
    return {
      x: view.xMin + rx * (view.xMax - view.xMin),
      y: view.yMin + ry * (view.yMax - view.yMin),
      inBounds: rx >= 0 && rx <= 1 && ry >= 0 && ry <= 1,
    };
  }

  function dataToGrid(dx, dy) {
    var xi = Math.floor((dx - dataExtent.xMin) / (dataExtent.xMax - dataExtent.xMin) * data.res);
    var yi = Math.floor((dy - dataExtent.yMin) / (dataExtent.yMax - dataExtent.yMin) * data.res);
    xi = Math.max(0, Math.min(data.res - 1, xi));
    yi = Math.max(0, Math.min(data.res - 1, yi));
    return { xi: xi, yi: yi };
  }

  // --- Zoom ---
  canvas.addEventListener('wheel', function (e) {
    if (!data) return;
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var pt = pixelToData(mx, my);
    if (!pt.inBounds) return;

    var factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    var xRange = (view.xMax - view.xMin) * factor;
    var yRange = (view.yMax - view.yMin) * factor;

    // Clamp to data extent
    xRange = Math.min(xRange, dataExtent.xMax - dataExtent.xMin);
    yRange = Math.min(yRange, dataExtent.yMax - dataExtent.yMin);
    // Min zoom: 1/50th of data range
    xRange = Math.max(xRange, (dataExtent.xMax - dataExtent.xMin) / 50);
    yRange = Math.max(yRange, (dataExtent.yMax - dataExtent.yMin) / 50);

    var rxNorm = (pt.x - view.xMin) / (view.xMax - view.xMin);
    var ryNorm = (pt.y - view.yMin) / (view.yMax - view.yMin);

    view.xMin = pt.x - rxNorm * xRange;
    view.xMax = pt.x + (1 - rxNorm) * xRange;
    view.yMin = pt.y - ryNorm * yRange;
    view.yMax = pt.y + (1 - ryNorm) * yRange;

    // Clamp to data bounds
    if (view.xMin < dataExtent.xMin) { view.xMax += dataExtent.xMin - view.xMin; view.xMin = dataExtent.xMin; }
    if (view.xMax > dataExtent.xMax) { view.xMin -= view.xMax - dataExtent.xMax; view.xMax = dataExtent.xMax; }
    if (view.yMin < dataExtent.yMin) { view.yMax += dataExtent.yMin - view.yMin; view.yMin = dataExtent.yMin; }
    if (view.yMax > dataExtent.yMax) { view.yMin -= view.yMax - dataExtent.yMax; view.yMax = dataExtent.yMax; }

    render();
  }, { passive: false });

  // --- Pan ---
  canvas.addEventListener('mousedown', function (e) {
    if (!data) return;
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var pt = pixelToData(mx, my);
    if (!pt.inBounds) return;
    dragging = true;
    dragStart = { mx: mx, my: my };
    dragViewStart = { xMin: view.xMin, xMax: view.xMax, yMin: view.yMin, yMax: view.yMax };
    canvas.style.cursor = 'grabbing';
  });

  window.addEventListener('mousemove', function (e) {
    if (!dragging || !data) return;
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var pad = getPad();
    var pw = rect.width - pad.left - pad.right;
    var ph = rect.height - pad.top - pad.bottom;

    var dx = -(mx - dragStart.mx) / pw * (dragViewStart.xMax - dragViewStart.xMin);
    var dy = (my - dragStart.my) / ph * (dragViewStart.yMax - dragViewStart.yMin);

    view.xMin = dragViewStart.xMin + dx;
    view.xMax = dragViewStart.xMax + dx;
    view.yMin = dragViewStart.yMin + dy;
    view.yMax = dragViewStart.yMax + dy;

    // Clamp
    if (view.xMin < dataExtent.xMin) { view.xMax += dataExtent.xMin - view.xMin; view.xMin = dataExtent.xMin; }
    if (view.xMax > dataExtent.xMax) { view.xMin -= view.xMax - dataExtent.xMax; view.xMax = dataExtent.xMax; }
    if (view.yMin < dataExtent.yMin) { view.yMax += dataExtent.yMin - view.yMin; view.yMin = dataExtent.yMin; }
    if (view.yMax > dataExtent.yMax) { view.yMin -= view.yMax - dataExtent.yMax; view.yMax = dataExtent.yMax; }

    tooltip.style.display = 'none';
    render();
  });

  window.addEventListener('mouseup', function () {
    dragging = false;
    canvas.style.cursor = '';
  });

  // --- Hover tooltip (only when not dragging) ---
  canvas.addEventListener('mousemove', function (e) {
    if (!data || dragging) return;
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var pt = pixelToData(mx, my);

    if (!pt.inBounds) { tooltip.style.display = 'none'; return; }

    var g = dataToGrid(pt.x, pt.y);
    var idx = g.yi * data.res + g.xi;
    var t = data.typeGrid[idx];
    var period = data.periodGrid[idx];
    var loss = data.meanLossGrid[idx];

    var label = TYPE_LABELS[t] || 'Unknown';
    if (t === 2 && period > 0) label += ' (period ' + period + ')';

    tooltip.innerHTML =
      'γ = ' + pt.x.toFixed(3) + '&nbsp;&nbsp;η_max = ' + pt.y.toFixed(4) + '<br>' +
      label + '<br>mean loss = ' + loss.toFixed(5);
    tooltip.style.display = 'block';

    var tx = mx + 16;
    var ty = my - 10;
    if (tx + 200 > rect.width) tx = mx - 200;
    tooltip.style.left = tx + 'px';
    tooltip.style.top = ty + 'px';
  });

  canvas.addEventListener('mouseleave', function () {
    tooltip.style.display = 'none';
  });

  // --- Reset zoom ---
  resetBtn.addEventListener('click', function () {
    view = { xMin: dataExtent.xMin, xMax: dataExtent.xMax, yMin: dataExtent.yMin, yMax: dataExtent.yMax };
    render();
  });

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    var w = rect.width;
    var h = Math.min(500, Math.round(w * 0.6));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
  }

  window.addEventListener('resize', resize);
  new MutationObserver(function () {
    buildFullImage();
    render();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  loadData();
  resize();
})();
