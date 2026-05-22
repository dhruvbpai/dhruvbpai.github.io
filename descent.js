(function () {
  'use strict';

  var H = 16;
  var P = 3 * H + 1;
  var N = 25;
  var PW = 52;
  var PH = 16;
  var X0 = 0, X1 = 6.28;
  var Y0 = -2.2, Y1 = 2.2;
  var WIN = 0.025;
  var HIST = 30;
  var BARS = '\u2581\u2582\u2583\u2584\u2585\u2586\u2587\u2588';

  var theta, dataX, dataY, targetFn;
  var steps, lastOpt;
  var sgdV, adamM, adamV, adamT, muonV, auroraV;
  var lossHist, gradHist;

  var plotEl, curvesEl, momEl, lrSlider, lrValEl;

  function randn() {
    var u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function makeTarget() {
    var nc = 3 + Math.floor(Math.random() * 3);
    var comps = [];
    for (var i = 0; i < nc; i++) {
      comps.push({
        a: (Math.random() - 0.5) * 2,
        f: 0.5 + Math.random() * 2.5,
        p: Math.random() * 6.28
      });
    }
    targetFn = function (x) {
      var y = 0;
      for (var i = 0; i < comps.length; i++)
        y += comps[i].a * Math.sin(comps[i].f * x + comps[i].p);
      return y / nc * 1.8;
    };
  }

  function init() {
    theta = new Float64Array(P);
    for (var j = 0; j < H; j++) {
      theta[j] = randn() * 0.8;
      theta[H + j] = randn() * 0.3;
      theta[2 * H + j] = randn() * 0.4;
    }
    theta[3 * H] = 0;
    sgdV = new Float64Array(P);
    adamM = new Float64Array(P);
    adamV = new Float64Array(P);
    adamT = 0;
    muonV = new Float64Array(P);
    auroraV = new Float64Array(P);
    steps = 0;
    lastOpt = 'sgd';
    lossHist = [];
    gradHist = [];
  }

  function genData() {
    makeTarget();
    dataX = new Float64Array(N);
    dataY = new Float64Array(N);
    for (var i = 0; i < N; i++) {
      dataX[i] = X0 + (i + 0.5) / N * (X1 - X0);
      dataY[i] = targetFn(dataX[i]) + randn() * 0.1;
    }
  }

  function fwd(x) {
    var out = theta[3 * H];
    for (var j = 0; j < H; j++) {
      out += theta[2 * H + j] * Math.tanh(theta[j] * x + theta[H + j]);
    }
    return out;
  }

  function grad() {
    var g = new Float64Array(P);
    var loss = 0;
    for (var i = 0; i < N; i++) {
      var x = dataX[i], y = dataY[i];
      var h = new Float64Array(H);
      var pred = theta[3 * H];
      for (var j = 0; j < H; j++) {
        h[j] = Math.tanh(theta[j] * x + theta[H + j]);
        pred += theta[2 * H + j] * h[j];
      }
      var d = 2 * (pred - y) / N;
      loss += (pred - y) * (pred - y);
      g[3 * H] += d;
      for (var j = 0; j < H; j++) {
        g[2 * H + j] += d * h[j];
        var dt = d * theta[2 * H + j] * (1 - h[j] * h[j]);
        g[j] += dt * x;
        g[H + j] += dt;
      }
    }
    return { g: g, loss: loss / N };
  }

  function gnorm(g) {
    var s = 0;
    for (var i = 0; i < P; i++) s += g[i] * g[i];
    return Math.sqrt(s);
  }

  function getLR() {
    return Math.pow(10, parseFloat(lrSlider.value));
  }

  function optSGD(g) {
    var lr = getLR(), beta = 0.9;
    for (var i = 0; i < P; i++) {
      sgdV[i] = beta * sgdV[i] + g[i];
      theta[i] -= lr * sgdV[i];
    }
    lastOpt = 'sgd';
  }

  function optAdam(g) {
    adamT++;
    var lr = getLR(), b1 = 0.9, b2 = 0.999, eps = 1e-8;
    var c1 = 1 - Math.pow(b1, adamT);
    var c2 = 1 - Math.pow(b2, adamT);
    for (var i = 0; i < P; i++) {
      adamM[i] = b1 * adamM[i] + (1 - b1) * g[i];
      adamV[i] = b2 * adamV[i] + (1 - b2) * g[i] * g[i];
      theta[i] -= lr * (adamM[i] / c1) / (Math.sqrt(adamV[i] / c2) + eps);
    }
    lastOpt = 'adam';
  }

  function optMuon(g) {
    var lr = getLR(), beta = 0.95;
    var n1 = 0, n2 = 0;
    for (var i = 0; i < H; i++) n1 += g[i] * g[i];
    for (var i = 2 * H; i < 3 * H; i++) n2 += g[i] * g[i];
    n1 = Math.sqrt(n1) + 1e-7;
    n2 = Math.sqrt(n2) + 1e-7;
    for (var i = 0; i < P; i++) {
      var gi = g[i];
      if (i < H) gi /= n1;
      else if (i >= 2 * H && i < 3 * H) gi /= n2;
      muonV[i] = beta * muonV[i] + gi;
      theta[i] -= lr * muonV[i];
    }
    lastOpt = 'muon';
  }

  function optAurora(g) {
    var lr = getLR(), beta = 0.95;
    var n1 = 0;
    for (var i = 0; i < H; i++) n1 += g[i] * g[i];
    n1 = Math.sqrt(n1) + 1e-7;

    var signs = new Float64Array(H);
    var sn = 0;
    for (var i = 0; i < H; i++) {
      signs[i] = g[2 * H + i] >= 0 ? 1 : -1;
      sn += 1;
    }
    sn = Math.sqrt(sn);

    for (var i = 0; i < P; i++) {
      var gi = g[i];
      if (i < H) {
        gi /= n1;
      } else if (i >= 2 * H && i < 3 * H) {
        gi = signs[i - 2 * H] / sn;
      }
      auroraV[i] = beta * auroraV[i] + gi;
      theta[i] -= lr * auroraV[i];
    }
    lastOpt = 'aurora';
  }

  function spark(arr, len) {
    if (!arr.length) return BARS[0];
    var win = arr.slice(-(len || HIST));
    var mn = win[0], mx = win[0];
    for (var i = 1; i < win.length; i++) {
      if (win[i] < mn) mn = win[i];
      if (win[i] > mx) mx = win[i];
    }
    var range = mx - mn || 1;
    var s = '';
    for (var i = 0; i < win.length; i++) {
      var idx = Math.min(7, Math.floor((win[i] - mn) / range * 7.99));
      s += BARS[idx];
    }
    return s;
  }

  function sparkMom(arr, start, len) {
    var mx = 0;
    for (var i = start; i < start + len; i++)
      if (Math.abs(arr[i]) > mx) mx = Math.abs(arr[i]);
    if (mx < 1e-10) return BARS[0].repeat(len);
    var s = '';
    for (var i = start; i < start + len; i++) {
      var idx = Math.min(7, Math.floor(Math.abs(arr[i]) / mx * 7.99));
      s += BARS[idx];
    }
    return s;
  }

  function plot() {
    var grid = [];
    for (var r = 0; r < PH; r++)
      grid.push(new Array(PW).fill(' '));

    var zr = Math.round((Y1 - 0) / (Y1 - Y0) * (PH - 1));
    if (zr >= 0 && zr < PH)
      for (var c = 0; c < PW; c++) grid[zr][c] = '\u2500';

    for (var c = 0; c < PW; c++) {
      var x = X0 + (c / (PW - 1)) * (X1 - X0);
      var y = fwd(x);
      var row = Math.round((Y1 - y) / (Y1 - Y0) * (PH - 1));
      if (row >= 0 && row < PH)
        grid[row][c] = grid[row][c] === '\u2500' ? '\u253c' : '\u00b7';
    }

    for (var i = 0; i < N; i++) {
      var c = Math.round((dataX[i] - X0) / (X1 - X0) * (PW - 1));
      var r = Math.round((Y1 - dataY[i]) / (Y1 - Y0) * (PH - 1));
      if (r >= 0 && r < PH && c >= 0 && c < PW)
        grid[r][c] = '\u00d7';
    }

    var lines = [];
    for (var r = 0; r < PH; r++) {
      var yv = Y1 - (r / (PH - 1)) * (Y1 - Y0);
      var lbl = '    ';
      if (r === 0) lbl = Y1.toFixed(1).padStart(4);
      else if (r === PH - 1) lbl = Y0.toFixed(1).padStart(4);
      else if (r === zr) lbl = ' 0.0';
      lines.push(lbl + '\u2502' + grid[r].join(''));
    }
    lines.push('    \u2514' + '\u2500'.repeat(PW));
    return lines.join('\n');
  }

  function render() {
    var r = grad();
    var gn = gnorm(r.g);

    plotEl.textContent = plot();

    var cl = '';
    cl += 'loss\n';
    cl += spark(lossHist) + '  ' + r.loss.toFixed(4) + '\n\n';
    cl += '\u2207\n';
    cl += spark(gradHist) + '  ' + gn.toFixed(3) + '\n\n';
    cl += 'step ' + steps;
    if (r.loss < WIN) cl += '\n\nconverged.';
    curvesEl.textContent = cl;

    var mom = lastOpt === 'sgd' ? sgdV : lastOpt === 'adam' ? adamM : lastOpt === 'muon' ? muonV : auroraV;
    var ml = lastOpt + ' momentum\n';
    ml += 'W1 ' + sparkMom(mom, 0, H) + '\n';
    ml += 'b1 ' + sparkMom(mom, H, H) + '\n';
    ml += 'W2 ' + sparkMom(mom, 2 * H, H);
    momEl.textContent = ml;
  }

  function step(opt, n) {
    n = n || 1;
    for (var k = 0; k < n; k++) {
      var r = grad();
      lossHist.push(r.loss);
      gradHist.push(gnorm(r.g));
      if (opt === 'sgd') optSGD(r.g);
      else if (opt === 'adam') optAdam(r.g);
      else if (opt === 'muon') optMuon(r.g);
      else if (opt === 'aurora') optAurora(r.g);
      steps++;
    }
    render();
  }

  window.descentStep = function (opt) { step(opt, 1); };
  window.descentReset = function () { init(); genData(); render(); };

  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    var n = e.shiftKey ? 10 : 1;
    if (e.key === '1') step('sgd', n);
    else if (e.key === '2') step('adam', n);
    else if (e.key === '3') step('muon', n);
    else if (e.key === '4') step('aurora', n);
    else if (e.key === 'r' || e.key === 'R') { init(); genData(); render(); }
  });

  plotEl = document.getElementById('descent-plot');
  curvesEl = document.getElementById('descent-curves');
  momEl = document.getElementById('descent-mom');
  lrSlider = document.getElementById('lr-slider');
  lrValEl = document.getElementById('lr-val');

  lrSlider.addEventListener('input', function () {
    lrValEl.textContent = getLR().toFixed(4);
  });

  init();
  genData();
  render();
})();
