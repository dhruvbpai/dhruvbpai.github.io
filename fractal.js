(function () {
  'use strict';

  var CHARS = ' ·:+*#';
  var FONT_SIZE = 10;
  var LINE_H = 1.15;
  var INTERVAL = 120;
  var DENSITY = 0.08;
  var SPAWN_RATE = 0.0008;

  var pre = document.createElement('pre');
  pre.className = 'fractal-bg';
  pre.setAttribute('aria-hidden', 'true');
  document.body.prepend(pre);

  var cols, rows, cw, ch, grid, next, age;

  function measure() {
    var s = document.createElement('span');
    s.style.cssText = 'font-family:JetBrains Mono,monospace;font-size:' + FONT_SIZE + 'px;position:absolute;visibility:hidden;white-space:pre';
    s.textContent = 'M';
    document.body.appendChild(s);
    cw = s.getBoundingClientRect().width;
    ch = FONT_SIZE * LINE_H;
    document.body.removeChild(s);
    cols = Math.floor(window.innerWidth / cw);
    rows = Math.floor(window.innerHeight / ch);
  }

  function seed() {
    grid = [];
    next = [];
    age = [];
    for (var r = 0; r < rows; r++) {
      grid.push(new Uint8Array(cols));
      next.push(new Uint8Array(cols));
      age.push(new Uint8Array(cols));
      for (var c = 0; c < cols; c++) {
        grid[r][c] = Math.random() < DENSITY ? 1 : 0;
      }
    }
  }

  function step() {
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var n = 0;
        for (var dr = -1; dr <= 1; dr++) {
          for (var dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            var nr = (r + dr + rows) % rows;
            var nc = (c + dc + cols) % cols;
            n += grid[nr][nc];
          }
        }
        if (grid[r][c]) {
          next[r][c] = (n === 2 || n === 3) ? 1 : 0;
        } else {
          next[r][c] = (n === 3) ? 1 : 0;
        }
        if (next[r][c]) {
          age[r][c] = grid[r][c] ? Math.min(age[r][c] + 1, CHARS.length - 1) : 1;
        } else {
          age[r][c] = 0;
        }
      }
    }
    var tmp = grid;
    grid = next;
    next = tmp;

    for (var i = 0; i < rows * cols * SPAWN_RATE; i++) {
      var sr = Math.floor(Math.random() * rows);
      var sc = Math.floor(Math.random() * cols);
      if (!grid[sr][sc]) {
        grid[sr][sc] = 1;
        age[sr][sc] = 1;
      }
    }
  }

  function render() {
    var buf = new Array(rows);
    for (var r = 0; r < rows; r++) {
      var line = new Array(cols);
      for (var c = 0; c < cols; c++) {
        line[c] = grid[r][c] ? CHARS[Math.min(age[r][c], CHARS.length - 1)] : ' ';
      }
      buf[r] = line.join('');
    }
    pre.textContent = buf.join('\n');
  }

  function reset() {
    measure();
    seed();
  }

  window.addEventListener('resize', reset);

  reset();
  var last = 0;
  (function loop(ts) {
    requestAnimationFrame(loop);
    if (ts - last < INTERVAL) return;
    last = ts;
    step();
    render();
  })(0);
})();
