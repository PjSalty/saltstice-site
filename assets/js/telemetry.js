// Live telemetry: polls a read-only Prometheus-style API and draws SVG. No data is invented, padded or interpolated.
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
    if (kind === 'pct') return (v * 100).toFixed(v < 0.1 && v > 0 ? 1 : 0) + '%';
    return String(Math.round(v));
  }
  function hhmm(ts) { return new Date(ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
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
  // simple GET, no headers, no credentials: stays a CORS simple request
  function fetchSeries(ep, q) {
    var end = Math.floor(Date.now() / 1000);
    var url = ep + '/query_range?query=' + encodeURIComponent(q) + '&start=' + (end - WINDOW) + '&end=' + end + '&step=' + STEP;
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, TIMEOUT);
    return fetch(url, ctl ? { signal: ctl.signal } : undefined)
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
  // ratios always span 0 to 100%; counts span 0 to a rounded ceiling above the highest sample
  function niceMax(v) {
    if (v <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), f = v / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function domain(all, kind) {
    if (kind === 'pct') return [0, 1];
    var hi = 0;
    all.forEach(function (pts) { pts.forEach(function (p) { if (p[1] > hi) hi = p[1]; }); });
    return [0, niceMax(hi * 1.1)];
  }
  function bounds(all) {
    var t0 = Infinity, t1 = -Infinity;
    all.forEach(function (pts) { if (pts[0][0] < t0) t0 = pts[0][0]; var l = pts[pts.length - 1][0]; if (l > t1) t1 = l; });
    return [t0, t1];
  }

  function draw(svg, host, list, kind, big) {
    svg.textContent = '';
    var vb = svg.viewBox.baseVal, W = vb.width, H = vb.height;
    var L = big ? 40 : 0, R = big ? 10 : 4, T = 8, B = big ? 22 : 6;
    var series = list.filter(function (s) { return s.pts; });
    if (!series.length) return;
    var all = series.map(function (s) { return s.pts; });
    var tb = bounds(all), t0 = tb[0], t1 = tb[1];
    var dm = domain(all, kind);
    var x = function (t) { return t1 === t0 ? W - R : L + (t - t0) / (t1 - t0) * (W - L - R); };
    var y = function (v) { return T + (1 - (v - dm[0]) / (dm[1] - dm[0])) * (H - T - B); };
    if (big) {
      [0, 0.5, 1].forEach(function (f) {
        var v = dm[0] + (dm[1] - dm[0]) * f, yy = y(v);
        el('line', { x1: L, x2: W - R, y1: yy, y2: yy, 'class': 'grid' }, svg);
        el('text', { x: L - 6, y: yy + 3.5, 'text-anchor': 'end', 'class': 'ax' }, svg).textContent = fmt(kind, v);
      });
      [0, 0.5, 1].forEach(function (f) {
        el('text', { x: L + f * (W - L - R), y: H - 6, 'text-anchor': f === 0 ? 'start' : f === 1 ? 'end' : 'middle', 'class': 'ax' }, svg).textContent = hhmm(t0 + (t1 - t0) * f);
      });
    } else {
      el('line', { x1: 0, x2: W, y1: H - B, y2: H - B, 'class': 'grid' }, svg);
    }
    series.forEach(function (s, i) {
      var n = s.pts.length;
      if (!big && i === 0 && n >= 6) {
        el('path', { d: pathFor(s.pts, x, y) + 'L' + x(t1).toFixed(1) + ' ' + (H - B) + 'L' + x(s.pts[0][0]).toFixed(1) + ' ' + (H - B) + 'Z', 'class': 'area' }, svg);
      }
      el('path', { d: pathFor(s.pts, x, y), 'class': 'line l' + (i + 1) }, svg);
      if (n < 12) s.pts.forEach(function (p) { el('circle', { cx: x(p[0]).toFixed(1), cy: y(p[1]).toFixed(1), r: big ? 3 : 2.2, 'class': 'dot l' + (i + 1) }, svg); });
      else { var q = s.pts[n - 1]; el('circle', { cx: x(q[0]).toFixed(1), cy: y(q[1]).toFixed(1), r: big ? 3.5 : 2.4, 'class': 'dot l' + (i + 1) }, svg); }
    });
    if (!big) return;
    var cross = el('line', { y1: T, y2: H - B, 'class': 'cross', visibility: 'hidden' }, svg);
    var tip = host.querySelector('.tip');
    if (!tip) { tip = document.createElement('span'); tip.className = 'tip'; tip.hidden = true; host.appendChild(tip); }
    var ref = series[0].pts;
    svg.onpointermove = function (e) {
      var r = svg.getBoundingClientRect();
      var px = (e.clientX - r.left) / r.width * W, best = 0, bd = Infinity;
      ref.forEach(function (p, i) { var dd = Math.abs(x(p[0]) - px); if (dd < bd) { bd = dd; best = i; } });
      var ts = ref[best][0], cx = x(ts);
      cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
      var txt = hhmm(ts);
      series.forEach(function (s) {
        var m = null; s.pts.forEach(function (p) { if (p[0] === ts) m = p; });
        if (m) txt += '  ' + s.label + ' ' + fmt(kind, m[1]);
      });
      tip.hidden = false; tip.textContent = txt;
      tip.style.left = Math.min(Math.max(cx / W * r.width, 80), r.width - 80) + 'px';
    };
    svg.onpointerleave = function () { cross.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  }

  roots.forEach(function (root) {
    var ep = root.getAttribute('data-endpoint');
    var charts = Array.prototype.slice.call(root.querySelectorAll('[data-chart]')).map(function (c) {
      var holders = c.hasAttribute('data-q') ? [c] : Array.prototype.slice.call(c.querySelectorAll('[data-q]'));
      return {
        el: c, kind: c.getAttribute('data-fmt'), big: c.classList.contains('chart-main'), svg: c.querySelector('svg'),
        holders: holders.map(function (h) { return { q: h.getAttribute('data-q'), v: h.querySelector('.v') || h, label: (h.textContent || '').replace(/[0-9.%\s]+$/, '').trim() }; })
      };
    });
    var state = root.querySelector('.tele-state'), note = root.querySelector('[data-note]'), down = root.querySelector('.tele-down');
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
      var jobs = [];
      charts.forEach(function (c) { c.holders.forEach(function (h) { jobs.push(fetchSeries(ep, h.q).then(function (p) { h.pts = p; })); }); });
      Promise.all(jobs).then(function () {
        busy = false; last = Date.now();
        var ok = 0, newest = 0, oldest = Infinity;
        charts.forEach(function (c) {
          var list = c.holders.map(function (h) { return { pts: h.pts, label: h.label }; });
          c.holders.forEach(function (h) {
            if (!h.pts) { h.v.textContent = 'n/a'; return; }
            ok++;
            var lp = h.pts[h.pts.length - 1];
            if (lp[0] > newest) newest = lp[0];
            if (h.pts[0][0] < oldest) oldest = h.pts[0][0];
            h.v.textContent = fmt(c.kind, lp[1]);
          });
          if (c.svg) draw(c.svg, c.el, list, c.kind, c.big);
        });
        if (!ok) { setState('is-down', 'Telemetry unavailable'); return; }
        var age = Date.now() / 1000 - newest;
        if (age > 300) setState('is-stale', 'Stale, last sample ' + hhmm(newest));
        else setState('is-live', 'Live');
        // say so when the history is shorter than the window; the charts show only what exists
        if (note) note.textContent = (newest - oldest) < WINDOW - 300 ? 'since ' + hhmm(oldest) + ', history is still building' : 'last 2 hours, refreshed every minute';
      });
    }
    run();
    setInterval(function () { if (!document.hidden) run(); }, EVERY);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && Date.now() - last > EVERY / 2) run(); });
  });
})();
