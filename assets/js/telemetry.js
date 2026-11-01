// Live telemetry: polls a read-only Prometheus-style API and draws SVG. No data is invented or filled in.
(function () {
  var NS = 'http://www.w3.org/2000/svg';
  var roots = Array.prototype.slice.call(document.querySelectorAll('[data-telemetry]'));
  if (!roots.length) return;
  var WINDOW = 7200, STEP = 60, EVERY = 60000, TIMEOUT = 8000;

  function el(name, attrs, parent) {
    var n = document.createElementNS(NS, name);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function fmt(kind, v) {
    if (kind === 'pct') return (v * 100).toFixed(v < 0.1 ? 1 : 0) + '%';
    return String(Math.round(v));
  }
  function hhmm(ts) {
    return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  function parse(json) {
    if (!json || json.status !== 'success' || !json.data || !json.data.result || !json.data.result.length) return null;
    var vals = json.data.result[0].values;
    if (!vals || !vals.length) return null;
    var out = [];
    for (var i = 0; i < vals.length; i++) {
      var t = Number(vals[i][0]), v = parseFloat(vals[i][1]);
      if (isFinite(t) && isFinite(v)) out.push([t, v]);
    }
    return out.length ? out : null;
  }
  function fetchSeries(ep, q) {
    var end = Math.floor(Date.now() / 1000);
    var url = ep + '/query_range?query=' + encodeURIComponent(q) + '&start=' + (end - WINDOW) + '&end=' + end + '&step=' + STEP;
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT);
    return fetch(url, { credentials: 'omit', signal: ctl ? ctl.signal : undefined, headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(parse)
      .then(function (d) { clearTimeout(timer); return d; }, function () { clearTimeout(timer); return null; });
  }
  // a gap longer than 3 steps breaks the line instead of being bridged
  function pathFor(pts, x, y) {
    var d = '', prev = null;
    for (var i = 0; i < pts.length; i++) {
      d += (prev === null || pts[i][0] - prev > STEP * 3 ? 'M' : 'L') + x(pts[i][0]).toFixed(1) + ' ' + y(pts[i][1]).toFixed(1);
      prev = pts[i][0];
    }
    return d;
  }
  function domain(pts, pct) {
    var lo = Infinity, hi = -Infinity;
    pts.forEach(function (p) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; });
    var span = hi - lo, minSpan = pct ? 0.04 : 2;
    if (span < minSpan) { var m = (hi + lo) / 2; lo = m - minSpan / 2; hi = m + minSpan / 2; }
    var pad = (hi - lo) * 0.12;
    lo -= pad; hi += pad;
    if (pct) { lo = Math.max(0, lo); hi = Math.min(1.0001, hi); } else { lo = Math.max(0, lo); }
    return [lo, hi];
  }
  function drawSpark(svg, pts, kind) {
    svg.textContent = '';
    var W = 120, H = 34, t0 = pts[0][0], t1 = pts[pts.length - 1][0] || t0 + 1;
    var dm = domain(pts, kind === 'pct');
    var x = function (t) { return t1 === t0 ? W : (t - t0) / (t1 - t0) * W; };
    var y = function (v) { return H - 3 - (v - dm[0]) / (dm[1] - dm[0]) * (H - 6); };
    var d = pathFor(pts, x, y);
    el('path', { d: d + 'L' + W + ' ' + H + 'L' + x(t0) + ' ' + H + 'Z', 'class': 'area' }, svg);
    el('path', { d: d, 'class': 'line' }, svg);
    var last = pts[pts.length - 1];
    el('circle', { cx: x(last[0]).toFixed(1), cy: y(last[1]).toFixed(1), r: 2.2, 'class': 'end' }, svg);
  }
  function drawChart(svg, host, pts, kind) {
    svg.textContent = '';
    var W = 600, H = 150, L = 44, R = 10, T = 8, B = 22;
    var t0 = pts[0][0], t1 = pts[pts.length - 1][0];
    var dm = domain(pts, kind === 'pct');
    var x = function (t) { return t1 === t0 ? W - R : L + (t - t0) / (t1 - t0) * (W - L - R); };
    var y = function (v) { return T + (1 - (v - dm[0]) / (dm[1] - dm[0])) * (H - T - B); };
    [0, 0.5, 1].forEach(function (f) {
      var v = dm[0] + (dm[1] - dm[0]) * f, yy = y(v);
      el('line', { x1: L, x2: W - R, y1: yy, y2: yy, 'class': 'grid' }, svg);
      var tx = el('text', { x: L - 6, y: yy + 3, 'text-anchor': 'end', 'class': 'ax' }, svg);
      tx.textContent = fmt(kind, v);
    });
    [0, 0.5, 1].forEach(function (f) {
      var t = t0 + (t1 - t0) * f;
      var tx = el('text', { x: L + f * (W - L - R), y: H - 6, 'text-anchor': f === 0 ? 'start' : f === 1 ? 'end' : 'middle', 'class': 'ax' }, svg);
      tx.textContent = hhmm(t);
    });
    var d = pathFor(pts, x, y);
    el('path', { d: d + 'L' + x(t1).toFixed(1) + ' ' + (H - B) + 'L' + x(t0).toFixed(1) + ' ' + (H - B) + 'Z', 'class': 'area' }, svg);
    el('path', { d: d, 'class': 'line' }, svg);
    var cross = el('line', { y1: T, y2: H - B, 'class': 'cross', visibility: 'hidden' }, svg);
    var dot = el('circle', { r: 3.5, 'class': 'end', visibility: 'hidden' }, svg);
    var tip = host.querySelector('.tip');
    if (!tip) { tip = document.createElement('span'); tip.className = 'tip'; tip.hidden = true; host.appendChild(tip); }
    svg.onpointermove = function (e) {
      var r = svg.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width * W, best = 0, bd = Infinity;
      pts.forEach(function (p, i) { var dd = Math.abs(x(p[0]) - px); if (dd < bd) { bd = dd; best = i; } });
      var p = pts[best], cx = x(p[0]), cy = y(p[1]);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('visibility', 'visible');
      tip.hidden = false; tip.textContent = fmt(kind, p[1]) + ' at ' + hhmm(p[0]);
      tip.style.left = Math.min(Math.max(cx / W * r.width, 40), r.width - 40) + 'px';
    };
    svg.onpointerleave = function () { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  }

  roots.forEach(function (root) {
    var ep = root.getAttribute('data-endpoint');
    var items = Array.prototype.slice.call(root.querySelectorAll('[data-q]'));
    var state = root.querySelector('.tele-state');
    var down = root.querySelector('.tele-down');
    var full = root.classList.contains('tele-full');
    var last = 0, busy = false;

    function setState(cls, text) {
      root.classList.remove('is-loading', 'is-live', 'is-down', 'is-stale');
      root.classList.add(cls);
      if (state) state.textContent = text;
      if (down) down.hidden = cls !== 'is-down';
    }
    function run() {
      if (busy) return;
      busy = true;
      Promise.all(items.map(function (it) { return fetchSeries(ep, it.getAttribute('data-q')); })).then(function (res) {
        busy = false; last = Date.now();
        var ok = 0, newest = 0;
        res.forEach(function (pts, i) {
          var it = items[i], v = it.querySelector('.v'), svg = it.querySelector('.spark'), kind = it.getAttribute('data-fmt');
          if (!pts) { v.textContent = 'n/a'; svg.textContent = ''; it.classList.add('no-data'); return; }
          it.classList.remove('no-data'); ok++;
          var lastPt = pts[pts.length - 1];
          if (lastPt[0] > newest) newest = lastPt[0];
          v.textContent = fmt(kind, lastPt[1]);
          if (full) drawChart(svg, it, pts, kind); else drawSpark(svg, pts, kind);
        });
        if (!ok) { setState('is-down', 'Telemetry unavailable'); return; }
        var age = Date.now() / 1000 - newest;
        if (age > 300) setState('is-stale', 'Stale, last sample ' + hhmm(newest));
        else setState('is-live', 'Live');
      });
    }
    run();
    setInterval(function () { if (!document.hidden) run(); }, EVERY);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - last > EVERY / 2) run(); });
  });
})();
