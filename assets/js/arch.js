// Architecture map: ambient traffic, path tracing, live cluster data, hover details, pan and zoom.
(function () {
  var root = document.querySelector('[data-arch]');
  if (!root) return;
  var NS = 'http://www.w3.org/2000/svg';
  var view = root.querySelector('.map-view'), canvas = root.querySelector('.map-canvas');
  var svg = root.querySelector('.map-links'), fx = root.querySelector('.map-fx');
  var gAll = svg.querySelector('.all'), gRoute = svg.querySelector('.route'), gPk = svg.querySelector('.packets');
  var detail = root.querySelector('.detail'), hint = detail ? detail.innerHTML : '';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var wide = window.matchMedia('(min-width: 960px)');
  var info = {}, links = {}, list = [];
  [].forEach.call(root.querySelectorAll('.node-data li'), function (li) { info[li.getAttribute('data-id')] = li; });
  [].forEach.call(root.querySelectorAll('.link-data li'), function (li) {
    var l = { id: li.getAttribute('data-id'), from: li.getAttribute('data-from'), to: li.getAttribute('data-to'), kind: li.getAttribute('data-kind') };
    links[l.id] = l; list.push(l);
  });
  var timers = [], current = null, tracing = false, hot = {}, stopCycle = false;

  function node(id) { return canvas.querySelector('#n-' + id); }
  // offsets relative to the canvas, so pan and zoom transforms never skew the geometry
  function box(id) {
    var el = node(id); if (!el) return null;
    var x = 0, y = 0, e = el;
    while (e && e !== canvas) { x += e.offsetLeft; y += e.offsetTop; e = e.offsetParent; }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight };
  }
  function size() {
    var w = canvas.offsetWidth, h = canvas.offsetHeight;
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h); svg.setAttribute('width', w); svg.setAttribute('height', h);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    fx.width = w * dpr; fx.height = h * dpr; fx.getContext('2d').setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // orthogonal route as a list of points
  function route(a, b, off) {
    var ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
    if (Math.abs(ay - by) < 8) {
      var gap = Math.abs(bx - ax) - (a.w + b.w) / 2;
      if (gap < 14) { var y = ay + off, sx = ax < bx ? a.x + a.w : a.x, ex = ax < bx ? b.x : b.x + b.w; return [[sx, y], [ex, y]]; }
      var top = Math.min(a.y, b.y) - 6 + off;
      return [[ax + off, a.y], [ax + off, top], [bx + off, top], [bx + off, b.y]];
    }
    var down = by > ay, sy = down ? a.y + a.h : a.y, ey = down ? b.y : b.y + b.h, m = (sy + ey) / 2 + off;
    return [[ax + off, sy], [ax + off, m], [bx + off, m], [bx + off, ey]];
  }
  function dstr(p) { return 'M' + p.map(function (q) { return q[0] + ' ' + q[1]; }).join('L'); }
  function el(name, attrs, parent) { var n = document.createElementNS(NS, name); for (var k in attrs) n.setAttribute(k, attrs[k]); if (parent) parent.appendChild(n); return n; }
  function lens(p) {
    var c = [0]; for (var i = 1; i < p.length; i++) c.push(c[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]));
    return c;
  }
  function showInfo(id) { if (detail) detail.innerHTML = info[id] ? info[id].innerHTML : hint; }
  function clearHl() {
    [].forEach.call(canvas.querySelectorAll('.hl'), function (x) { x.classList.remove('hl'); });
    [].forEach.call(svg.querySelectorAll('.hover-l'), function (x) { x.parentNode.removeChild(x); });
    hot = {};
  }
  function onHover(id, on) {
    clearHl();
    if (!on) { showInfo(null); return; }
    var n = node(id); if (n) n.classList.add('hl');
    var k = 0;
    list.forEach(function (l) {
      if (l.from !== id && l.to !== id) return;
      var a = box(l.from), b = box(l.to); if (!a || !b) return;
      el('path', { 'class': 'hl-l hover-l', d: dstr(route(a, b, (k++ % 5) * 3 - 6)) }, gAll);
      hot[l.id] = 1;
      var o = node(l.from === id ? l.to : l.from); if (o) o.classList.add('hl');
    });
    showInfo(id);
  }
  [].forEach.call(canvas.querySelectorAll('.n'), function (e) {
    var id = e.getAttribute('data-id');
    e.addEventListener('mouseenter', function () { if (wide.matches) onHover(id, true); });
    e.addEventListener('mouseleave', function () { onHover(id, false); });
    e.addEventListener('focus', function () { if (wide.matches) onHover(id, true); });
    e.addEventListener('blur', function () { onHover(id, false); });
  });
  var allToggle = root.querySelector('[data-show-links]');
  function drawAll() {
    gAll.textContent = '';
    if (!allToggle || !allToggle.checked) return;
    list.forEach(function (l, i) { var a = box(l.from), b = box(l.to); if (a && b) el('path', { 'class': 'al', d: dstr(route(a, b, (i % 6) * 3 - 8)) }, gAll); });
  }
  if (allToggle) allToggle.addEventListener('change', drawAll);

  // ---- ambient traffic on a canvas above the boxes, below the SVG overlay ----
  var STY = {
    https: { gap: [1.4, 4], len: 12, v: 170, w: 2 }, http: { gap: [1.6, 4.5], len: 10, v: 160, w: 2 },
    bgp: { gap: [6, 10], len: 0, v: 55, w: 3, both: 1 }, iscsi: { gap: [2.5, 5], len: 5, v: 150, w: 2.5, train: 4 },
    nfs: { gap: [3, 6], len: 5, v: 140, w: 2.5, train: 3 }, sql: { gap: [3, 6], len: 6, v: 150, w: 2, train: 2 }, redis: { gap: [3, 6], len: 6, v: 150, w: 2, train: 2 },
    federate: { gap: [3, 4.5], len: 0, v: 90, w: 2 }, metrics: { gap: [2.2, 3.5], len: 0, v: 90, w: 1.6 }, logs: { gap: [2.5, 4], len: 0, v: 100, w: 1.6 },
    backup: { gap: [8, 14], len: 0, v: 70, w: 3.6 }, s3: { gap: [8, 14], len: 0, v: 70, w: 3.6 },
    tunnel: { gap: [0.7, 1.3], len: 0, v: 120, w: 1.8 }, wireguard: { gap: [0.9, 1.6], len: 0, v: 120, w: 1.8 },
    dns: { gap: [3, 6], len: 6, v: 220, w: 1.6 }, gitops: { gap: [4, 7], len: 0, v: 110, w: 2 },
    ethernet: { gap: [3, 7], len: 0, v: 130, w: 1.5 }, trunk: { gap: [2, 4], len: 8, v: 180, w: 1.8 }
  };
  var DEF = { gap: [3, 6], len: 0, v: 120, w: 1.6 };
  var paths = [], parts = [], raf = 0, last = 0, amb = 1, col = '#ededed', frames = 0, inView = true;
  function rnd(r) { return r[0] + Math.random() * (r[1] - r[0]); }
  function buildFx() {
    paths = [];
    list.forEach(function (l, i) {
      var a = box(l.from), b = box(l.to); if (!a || !b) return;
      var p = route(a, b, (i % 5) * 2 - 4), c = lens(p);
      paths.push({ l: l, p: p, c: c, t: c[c.length - 1], next: Math.random() * 4, s: STY[l.kind] || DEF });
    });
  }
  function at(path, d) {
    if (d < 0) d = 0; if (d > path.t) d = path.t;
    var c = path.c, i = 1; while (i < c.length - 1 && c[i] < d) i++;
    var k = (d - c[i - 1]) / ((c[i] - c[i - 1]) || 1), p = path.p;
    return [p[i - 1][0] + (p[i][0] - p[i - 1][0]) * k, p[i - 1][1] + (p[i][1] - p[i - 1][1]) * k];
  }
  function tick(now) {
    raf = requestAnimationFrame(tick);
    var dt = Math.min((now - last) / 1000, 0.1); last = now;
    if (++frames % 40 === 0) col = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim() || col;
    amb += ((tracing ? 0.2 : 1) - amb) * Math.min(dt * 4, 1);
    var ctx = fx.getContext('2d');
    ctx.clearRect(0, 0, fx.width, fx.height);
    var t = now / 1000;
    paths.forEach(function (q) {
      var s = q.s, mult = hot[q.l.id] ? 0.35 : 1;
      if (t >= q.next && parts.length < 140) {
        var rev = s.both && Math.random() < 0.5;
        for (var k = 0; k < (s.train || 1); k++) parts.push({ q: q, d: -k * 9, rev: rev, v: s.v * (0.9 + Math.random() * 0.2) });
        q.next = t + rnd(s.gap) * mult;
      }
    });
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round';
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i], q = p.q, s = q.s;
      p.d += p.v * dt;
      if (p.d > q.t + s.len) { parts.splice(i, 1); continue; }
      if (p.d < 0) continue;
      var d = p.rev ? q.t - p.d : p.d, a = at(q, d);
      ctx.globalAlpha = (hot[q.l.id] ? 0.95 : 0.55) * amb * Math.min(1, Math.min(p.d, q.t - p.d + 8) / 14 + 0.2);
      if (s.len) {
        var b = at(q, p.rev ? d + s.len : d - s.len);
        ctx.lineWidth = s.w * 0.6; ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(a[0], a[1]); ctx.stroke();
      } else { ctx.beginPath(); ctx.arc(a[0], a[1], s.w * 0.6, 0, 6.2832); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
  function loop(on) {
    if (reduce) return;
    if (on && !raf && inView && !document.hidden && wide.matches) { last = performance.now(); raf = requestAnimationFrame(tick); }
    else if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { inView = e[0].isIntersecting; loop(inView); }, { threshold: 0.05 }).observe(root);
  document.addEventListener('visibilitychange', function () { loop(!document.hidden); });

  // ---- path tracing: the beam runs hop by hop and each box flashes on arrival ----
  function reset() {
    timers.forEach(clearTimeout); timers = [];
    gRoute.textContent = ''; gPk.textContent = '';
    tracing = false; root.classList.remove('tracing');
    [].forEach.call(canvas.querySelectorAll('.on,.flash'), function (x) { x.classList.remove('on', 'flash'); });
    [].forEach.call(canvas.querySelectorAll('.badge'), function (x) { x.parentNode.removeChild(x); });
    [].forEach.call(root.querySelectorAll('.hops li'), function (x) { x.classList.remove('on'); x.removeAttribute('aria-current'); });
  }
  function addBadge(e, n) {
    var b = e.querySelector('.badge');
    if (b) { b.textContent += ',' + n; return; }
    b = document.createElement('span'); b.className = 'badge'; b.textContent = n; b.setAttribute('aria-hidden', 'true'); e.appendChild(b);
  }
  function activate(pid) {
    var sec = root.querySelector('.pth[data-path="' + pid + '"]'); if (!sec) return;
    reset(); size(); buildFx();
    current = pid; tracing = true;
    [].forEach.call(root.querySelectorAll('.pth'), function (p) { p.classList.toggle('on', p === sec); });
    [].forEach.call(root.querySelectorAll('.path-btn'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-path') === pid ? 'true' : 'false'); });
    var rb = sec.querySelector('[data-replay]'); if (rb) rb.hidden = false;
    root.classList.add('tracing');
    var steps = [].slice.call(sec.querySelectorAll('.hops li')), prev = null, DUR = 700;
    steps.forEach(function (li, i) {
      var nid = li.getAttribute('data-node'), lid = li.getAttribute('data-link'), from = prev; prev = nid;
      var run = function () {
        var n = node(nid);
        if (n) { n.classList.add('on'); addBadge(n, i + 1); if (!reduce) { n.classList.remove('flash'); void n.offsetWidth; n.classList.add('flash'); } }
        li.classList.add('on'); li.setAttribute('aria-current', 'step');
        if (i > 0) steps[i - 1].removeAttribute('aria-current');
        var a = box(from), b = box(nid);
        if (lid && a && b) {
          var p = route(a, b, ((i % 3) - 1) * 4), d = dstr(p), c = lens(p), t = c[c.length - 1];
          var line = el('path', { 'class': 'rl', d: d }, gRoute);
          if (!reduce) {
            line.animate([{ strokeDashoffset: t, strokeDasharray: t }, { strokeDashoffset: 0, strokeDasharray: t }], { duration: DUR, fill: 'forwards', easing: 'ease-out' });
            var head = el('circle', { r: 4.5, 'class': 'head' }, gPk);
            var m = el('animateMotion', { dur: DUR + 'ms', fill: 'freeze', path: d, calcMode: 'spline', keyTimes: '0;1', keySplines: '0.2 0.6 0.4 1' }, head);
            setTimeout(function () { if (head.parentNode) head.parentNode.removeChild(head); }, DUR + 120);
            setTimeout(function () { el('path', { 'class': 'bm', d: d }, gRoute); }, DUR);
          } else line.setAttribute('class', 'rl');
        }
        showInfo(nid);
      };
      if (reduce) run(); else timers.push(setTimeout(run, i * (DUR + 120)));
    });
  }
  [].forEach.call(root.querySelectorAll('.path-btn'), function (b) {
    b.addEventListener('click', function () {
      stopCycle = true;
      var pid = b.getAttribute('data-path');
      if (current === pid) { reset(); current = null; b.setAttribute('aria-pressed', 'false'); [].forEach.call(root.querySelectorAll('.pth'), function (p) { p.classList.remove('on'); }); showInfo(null); return; }
      activate(pid);
    });
  });
  [].forEach.call(root.querySelectorAll('[data-replay]'), function (b) { b.addEventListener('click', function () { if (current) activate(current); }); });
  [].forEach.call(root.querySelectorAll('.hops li'), function (li) { li.addEventListener('mouseenter', function () { showInfo(li.getAttribute('data-node')); }); });
  ['pointerdown', 'keydown', 'focusin'].forEach(function (ev) { root.addEventListener(ev, function () { stopCycle = true; }); });

  // ---- live cluster data, same API as the telemetry section; nothing is shown unless it answers ----
  var tele = document.querySelector('[data-telemetry]'), ep = tele && tele.getAttribute('data-endpoint');
  var cluster = root.querySelector('.layer[data-layer="cluster"]'), ro = null;
  var staticN = parseInt(root.getAttribute('data-k8s-static'), 10) || 0;
  if (cluster) {
    ro = document.createElement('p'); ro.className = 'live-ro'; ro.setAttribute('role', 'status');
    ro.innerHTML = '<i class="pulse"></i><span>Loading cluster numbers</span>';
    var lb = cluster.querySelector('.layer-body'); if (lb) lb.insertBefore(ro, lb.firstChild);
  }
  function q(name) {
    if (!ep) return Promise.resolve(null);
    return fetch(ep + '/query?query=' + encodeURIComponent(name)).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.status === 'success' && j.data.result.length ? parseFloat(j.data.result[0].value[1]) : null; }, function () { return null; });
  }
  function pollLive() {
    Promise.all([q('public:cpu_utilization:ratio'), q('public:memory_utilization:ratio'), q('public:pods_running:count'), q('public:nodes_ready:count')]).then(function (v) {
      var cpu = v[0], mem = v[1], pods = v[2], nr = v[3];
      if (ro) {
        var ok = cpu !== null || mem !== null || pods !== null;
        ro.className = 'live-ro ' + (ok ? 'is-live' : 'is-down');
        ro.innerHTML = '<i class="pulse"></i>' + (ok ? '<span>CPU ' + (cpu === null ? 'n/a' : Math.round(cpu * 100) + '%') + '</span><span>Memory ' + (mem === null ? 'n/a' : Math.round(mem * 100) + '%') + '</span><span>Pods ' + (pods === null ? 'n/a' : Math.round(pods)) + '</span>' : '<span>Telemetry unavailable</span>');
      }
      if (cluster) cluster.style.setProperty('--glow', cpu === null ? 0 : Math.min(cpu, 1).toFixed(2));
      [].forEach.call(canvas.querySelectorAll('.k-k8s-control,.k-k8s-worker,.k-k8s-pool'), function (c) {
        var d = c.querySelector('.rdy');
        if (nr === null) { if (d) d.parentNode.removeChild(d); return; }
        if (!d) { d = document.createElement('i'); d.className = 'rdy'; c.insertBefore(d, c.firstChild); }
        var good = nr >= staticN;
        d.className = 'rdy ' + (good ? 'ok' : 'warn'); d.title = nr + ' nodes ready';
      });
    });
  }
  pollLive();
  setInterval(function () { if (!document.hidden) pollLive(); }, 60000);

  // ---- pan and zoom (Lab only) ----
  if (root.hasAttribute('data-pan') && view) {
    var S = { s: 1, x: 0, y: 0 };
    var apply = function () { canvas.style.transformOrigin = '0 0'; canvas.style.transform = 'translate(' + S.x + 'px,' + S.y + 'px) scale(' + S.s + ')'; };
    var zoom = function (f, cx, cy) {
      var ns = Math.max(1, Math.min(2.6, S.s * f)); f = ns / S.s;
      S.x = cx - (cx - S.x) * f; S.y = cy - (cy - S.y) * f; S.s = ns;
      if (S.s === 1) { S.x = 0; S.y = 0; }
      apply();
    };
    view.addEventListener('wheel', function (e) {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      var r = view.getBoundingClientRect(); zoom(e.deltaY < 0 ? 1.12 : 0.89, e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
    [].forEach.call(root.querySelectorAll('[data-zoom]'), function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-zoom'), r = view.getBoundingClientRect();
        if (k === 'reset') { S = { s: 1, x: 0, y: 0 }; apply(); } else zoom(k === 'in' ? 1.25 : 0.8, r.width / 2, r.height / 2);
      });
    });
    var drag = null;
    view.addEventListener('pointerdown', function (e) { if (S.s === 1 || e.target.closest('.n,.zb')) return; drag = { x: e.clientX - S.x, y: e.clientY - S.y }; view.setPointerCapture(e.pointerId); view.classList.add('grab'); });
    view.addEventListener('pointermove', function (e) { if (!drag) return; S.x = e.clientX - drag.x; S.y = e.clientY - drag.y; apply(); });
    view.addEventListener('pointerup', function () { drag = null; view.classList.remove('grab'); });
  }

  var rt;
  function relayout() { clearTimeout(rt); rt = setTimeout(function () { size(); drawAll(); buildFx(); if (current && !reduce) { var p = current; activate(p); } else if (current) activate(current); }, 160); }
  if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(canvas); else window.addEventListener('resize', relayout);
  size(); buildFx(); loop(true);

  var want = (location.search.match(/[?&]path=([^&#]+)/) || location.hash.match(/^#path-(.+)$/) || [])[1];
  var btns = [].slice.call(root.querySelectorAll('.path-btn'));
  var start = want && root.querySelector('.pth[data-path="' + want + '"]') ? want : (root.querySelector('.pth[data-path="p-telemetry"]') ? 'p-telemetry' : (btns[0] ? btns[0].getAttribute('data-path') : null));
  if (start && wide.matches) activate(start);
  if (root.hasAttribute('data-cycle') && !reduce && wide.matches) {
    var seq = btns.filter(function (b) { return b.getAttribute('data-aud') === 'public'; }).slice(0, 3).map(function (b) { return b.getAttribute('data-path'); }), ci = Math.max(0, seq.indexOf(start));
    if (seq.length > 1) setInterval(function () { if (stopCycle || document.hidden || !inView) return; ci = (ci + 1) % seq.length; activate(seq[ci]); }, 8000);
  }
})();
