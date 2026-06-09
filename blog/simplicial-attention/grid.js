(function () {
  var NS = [1, 2, 3];
  var KS = [0, 1, 2];

  var shortName = {
    '1-0': 'softmax attention',
    '1-1': 'LLA / Parallax',
    '1-2': 'curvature attn',
    '2-0': '2-simplicial',
    '2-1': '2-simpl. LLA',
    '2-2': '2-simpl. curv.',
    '3-0': '3-simplicial',
    '3-1': '3-simpl. LLA',
    '3-2': '3-simpl. curv.'
  };

  var fullName = {
    '1-0': 'Softmax attention',
    '1-1': 'Local Linear Attention / Parallax',
    '1-2': 'Curvature-corrected attention',
    '2-0': '2-simplicial attention',
    '2-1': '2-simplicial LLA / Parallax',
    '2-2': '2-simplicial curvature attention',
    '3-0': '3-simplicial attention',
    '3-1': '3-simplicial LLA',
    '3-2': '3-simplicial curvature attention'
  };

  // Lifted datapoint (key, value) as a function of simplex order n.
  function datapointTeX(n) {
    if (n === 1) return "\\phi_j = k_j, \\qquad u_j = v_j";
    if (n === 2) return "\\phi_{jk} = k_j \\odot k'_k, \\qquad u_{jk} = v_j \\odot v'_k";
    return "\\phi_{jkl} = k_j \\odot k'_k \\odot k''_l, \\qquad u_{jkl} = v_j \\odot v'_k \\odot v''_l";
  }

  // Closed-form output as a function of regression degree k.
  function outputTeX(n, k) {
    if (k === 0) {
      return "o_i^{(" + n + ",0)} = \\sum_{J \\in \\mathcal{C}_i^{(" + n + ")}} p_{iJ}\\, u_J, \\quad " +
        "p_{iJ} = \\frac{\\exp(\\psi_i^\\top \\phi_J / h)}{\\sum_{J'} \\exp(\\psi_i^\\top \\phi_{J'} / h)}";
    }
    if (k === 1) {
      return "o_i^{(" + n + ",1)} = o_i^{\\mathsf{SA}} - (1 + \\eta_i)\\, \\Sigma_{u\\phi}^{(i)} \\rho_i^\\star, \\quad " +
        "\\rho_i^\\star = \\Sigma_i^{-1} \\mu_i";
    }
    return "o_i^{(" + n + ",2)} = \\sum_J a_{iJ}^{(2)}\\, u_J, \\quad " +
      "a_{iJ}^{(2)} = w_{iJ}\\, e_0^\\top G_i^{-1} \\chi_2(z_J)";
  }

  function renderTeX(el, tex) {
    if (window.katex) {
      try {
        window.katex.render(tex, el, { displayMode: true, throwOnError: false });
        return;
      } catch (e) { /* fall through to text */ }
    }
    el.textContent = tex;
  }

  function select(grid, n, k) {
    var cells = grid.querySelectorAll('.nk-cell');
    cells.forEach(function (c) {
      c.classList.toggle('sel', +c.dataset.n === n && +c.dataset.k === k);
    });

    var key = n + '-' + k;
    document.getElementById('nk-panel-name').textContent = fullName[key];

    var math = document.getElementById('nk-panel-math');
    math.innerHTML = '';
    var d = document.createElement('div');
    var o = document.createElement('div');
    math.appendChild(d);
    math.appendChild(o);
    renderTeX(d, datapointTeX(n));
    renderTeX(o, outputTeX(n, k));
  }

  function makeCell(cls, html) {
    var el = document.createElement('div');
    el.className = cls;
    if (html != null) el.innerHTML = html;
    return el;
  }

  function build() {
    var grid = document.getElementById('nk-grid');
    if (!grid) return;

    grid.appendChild(makeCell('nk-corner', '<span>k \\ n</span>'));
    NS.forEach(function (n) {
      grid.appendChild(makeCell('nk-head', '<span>n = ' + n + '</span>'));
    });

    KS.forEach(function (k) {
      grid.appendChild(makeCell('nk-tick', '<span>k = ' + k + '</span>'));
      NS.forEach(function (n) {
        var key = n + '-' + k;
        var cell = makeCell(
          'nk-cell',
          '<span class="nk-cell-coord">(' + n + ', ' + k + ')</span>' +
          '<span class="nk-cell-name">' + shortName[key] + '</span>'
        );
        cell.dataset.n = n;
        cell.dataset.k = k;
        cell.addEventListener('click', function () { select(grid, n, k); });
        grid.appendChild(cell);
      });
    });

    // Default to the worked example (2, 1).
    select(grid, 2, 1);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', build);
  } else {
    build();
  }
})();
