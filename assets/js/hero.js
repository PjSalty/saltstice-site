// Home showpiece: four views of one topology, ambient traffic, an auto-cycling beam, live cluster readout and change ticker.
(function () {
  var root = document.querySelector('[data-hero]');
  if (!root) return;
  var NS = 'http://www.w3.org/2000/svg';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var phone = window.matchMedia('(max-width: 760px)');
  var cv = root.querySelector('.hd-fx'), cap = root.querySelector('.hd-cap-t'), tick = root.querySelector('.hd-tick');
  var NAMES = { graph: 'd', rack: 'r', cluster: 'c', subway: 's' };
  function el(n, a, p) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  var STY = {
    https: { g: [1.3, 3.6], len: 14, v: 190, w: 2.2 }, http: { g: [1.5, 4], len: 12, v: 170, w: 2 }, bgp: { g: [4, 8], len: 0, v: 70, w: 3.4, both: 1 },
    iscsi: { g: [2, 4.5], len: 6, v: 160, w: 2.6, tr: 4 }, nfs: { g: [2.5, 5], len: 6, v: 150, w: 2.6, tr: 3 }, sql: { g: [2.5, 5], len: 6, v: 150, w: 2.2, tr: 3 },
    backup: { g: [6, 11], len: 0, v: 80, w: 4 }, tunnel: { g: [0.6, 1.2], len: 0, v: 130, w: 2 }, trunk: { g: [1.5, 3.5], len: 10, v: 190, w: 2 },
    ethernet: { g: [3, 6], len: 0, v: 140, w: 1.8 }, federate: { g: [3, 5], len: 0, v: 90, w: 2 }, dns: { g: [3, 6], len: 6, v: 220, w: 1.6 }
  };
  var DEF = { g: [3, 6], len: 0, v: 120, w: 1.8 };
  var svg, V, VW = 1200, VH = 600, VY = 0, links = [], byId = {}, paths = [], timers = [], pi = 0;
  var parts = [], amb = 1, raf = 0, last = 0, col = '#ededed', n = 0, vis = true, tracing = false, view = 'd';
  function rnd(r) { return r[0] + Math.random() * (r[1] - r[0]); }
  function eff(v) { return phone.matches && (v === 'd' || v === 'c') ? 'm' : v; }
  function sz() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = svg.clientWidth, h = svg.clientHeight;
    cv.style.width = w + 'px'; cv.style.height = h + 'px';
    cv.width = w * dpr; cv.height = h * dpr;
    var k = w / VW; cv.getContext('2d').setTransform(dpr * k, 0, 0, dpr * k, 0, -VY * dpr * k);
  }
  function loopTick(now) {
    raf = requestAnimationFrame(loopTick);
    var dt = Math.min((now - last) / 1000, 0.1); last = now;
    if (++n % 50 === 0) col = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim() || col;
    amb += ((tracing ? 0.35 : 1) - amb) * Math.min(dt * 4, 1);
    var sp = V === 'm' ? 0.6 : 1, ctx = cv.getContext('2d'), t = now / 1000;
    ctx.clearRect(0, VY, VW, VH);
    links.forEach(function (l) {
      if (t >= l.next && parts.length < 120) {
        var rev = l.s.both && Math.random() < 0.5;
        for (var k = 0; k < (l.s.tr || 1); k++) parts.push({ l: l, d: -k * 10, rev: rev, v: l.s.v * sp * (0.9 + Math.random() * 0.2) });
        l.next = t + rnd(l.s.g) / sp;
      }
    });
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineCap = 'round';
    for (var i = parts.length - 1; i >= 0; i--) {
      var q = parts[i], l = q.l, s = l.s;
      q.d += q.v * dt;
      if (q.d > l.t + s.len) { parts.splice(i, 1); continue; }
      if (q.d < 0) continue;
      var d = q.rev ? l.t - q.d : q.d, a = l.p.getPointAtLength(Math.max(0, Math.min(l.t, d)));
      ctx.globalAlpha = 0.6 * amb * Math.min(1, Math.min(q.d, l.t - q.d + 10) / 16 + 0.2);
      if (s.len) { var b = l.p.getPointAtLength(Math.max(0, Math.min(l.t, q.rev ? d + s.len : d - s.len))); ctx.lineWidth = s.w * 0.6; ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(a.x, a.y, s.w * 0.65, 0, 6.2832); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
  function loop(on) {
    if (reduce) return;
    if (on && !raf && vis && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(loopTick); }
    else if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { vis = e[0].isIntersecting; loop(vis); }, { threshold: 0.05 }).observe(root);
  document.addEventListener('visibilitychange', function () { loop(!document.hidden); });

  var allPaths = [].slice.call(root.querySelectorAll('.hd-paths > li')).map(function (li) {
    return { id: li.getAttribute('data-id'), label: li.getAttribute('data-label'), hops: [].slice.call(li.querySelectorAll('li')).map(function (h) { return { n: h.getAttribute('data-node'), l: h.getAttribute('data-link') }; }) };
  });
  function chip(pid, node) { return svg.querySelector('#hdn-' + V + '-' + pid + '-' + node) || svg.querySelector('#hdn-' + V + '-' + node); }
  function clear() {
    timers.forEach(clearTimeout); timers = [];
    [].forEach.call(svg.querySelectorAll('.hd-beams'), function (g) { g.textContent = ''; });
    tracing = false; svg.classList.remove('tracing');
    [].forEach.call(root.querySelectorAll('.on,.flash'), function (x) { x.classList.remove('on', 'flash'); });
  }
  function run(p) {
    clear(); tracing = true; svg.classList.add('tracing');
    var gB = svg.querySelector('.hd-beams'), prev = null, DUR = 800;
    p.hops.forEach(function (h, i) {
      var go = function () {
        var nd = chip(p.id, h.n);
        nd.classList.add('on'); if (!reduce) { nd.classList.remove('flash'); void nd.getBoundingClientRect(); nd.classList.add('flash'); }
        if (cap) cap.textContent = p.label + ': hop ' + (i + 1) + ' of ' + p.hops.length;
        var l = h.l && (byId[p.id + ':' + h.l] || byId[h.l]);
        if (l && prev) {
          var rev = l.from !== prev, d = l.p.getAttribute('d');
          var ln = el('path', { d: d, 'class': 'beam' }, gB); l.p.classList.add('on');
          if (!reduce) {
            ln.animate(rev ? [{ strokeDasharray: l.t + ' ' + l.t, strokeDashoffset: -l.t }, { strokeDasharray: l.t + ' ' + l.t, strokeDashoffset: 0 }] : [{ strokeDasharray: l.t + ' ' + l.t, strokeDashoffset: l.t }, { strokeDasharray: l.t + ' ' + l.t, strokeDashoffset: 0 }], { duration: DUR, fill: 'forwards', easing: 'ease-in-out' });
            var hd = el('circle', { r: 5, 'class': 'bhead' }, gB);
            el('animateMotion', { dur: DUR + 'ms', fill: 'freeze', path: d, keyPoints: rev ? '1;0' : '0;1', keyTimes: '0;1', calcMode: 'linear' }, hd);
            setTimeout(function () { if (hd.parentNode) hd.parentNode.removeChild(hd); }, DUR + 60);
          }
        }
        prev = h.n;
      };
      if (reduce) go(); else timers.push(setTimeout(go, i * (DUR + 150)));
    });
    if (!reduce) timers.push(setTimeout(function () { pi = (pi + 1) % paths.length; run(paths[pi]); }, p.hops.length * (DUR + 150) + 2200));
  }
  function setView(v, save) {
    view = v; V = eff(v);
    if (svg) clear();
    [].forEach.call(root.querySelectorAll('.hdia'), function (s) { s.classList.toggle('is-on', s.classList.contains('hdia-' + V)); });
    [].forEach.call(root.querySelectorAll('.hd-views button'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-view') === v ? 'true' : 'false'); });
    svg = root.querySelector('.hdia-' + V);
    var vb = svg.viewBox.baseVal; VW = vb.width; VH = vb.height; VY = vb.y;
    byId = {}; parts = [];
    links = [].slice.call(svg.querySelectorAll('.hl')).map(function (p) {
      var l = { p: p, t: p.getTotalLength(), s: STY[p.getAttribute('data-kind')] || DEF, next: Math.random() * 3, from: p.getAttribute('data-from') };
      byId[p.getAttribute('data-link')] = l; return l;
    });
    paths = allPaths.map(function (p) { return { id: p.id, label: p.label, hops: p.hops.filter(function (h) { return chip(p.id, h.n); }) }; }).filter(function (p) { return p.hops.length > 1; });
    pi = 0; sz();
    if (save) { try { localStorage.setItem('hview', v); } catch (e) {} }
    if (paths.length) run(paths[0]);
    applyLive();
  }
  [].forEach.call(root.querySelectorAll('.hd-views button'), function (b) { b.addEventListener('click', function () { setView(b.getAttribute('data-view'), true); }); });

  // live cluster numbers, shared by all views; nothing is shown unless the API answers
  var ep = root.getAttribute('data-endpoint'), stat = parseInt(root.getAttribute('data-k8s-static'), 10) || 0, live = null, prevLive = null, msgs = [];
  function q(name) {
    return fetch(ep + '/query?query=' + encodeURIComponent(name)).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.status === 'success' && j.data.result.length ? parseFloat(j.data.result[0].value[1]) : null; }, function () { return null; });
  }
  function applyLive() {
    if (!live) return;
    var v = live, ok = v[0] !== null || v[1] !== null || v[2] !== null;
    [].forEach.call(root.querySelectorAll('.hd-ro'), function (ro) {
      ro.textContent = ok ? 'CPU ' + (v[0] === null ? 'n/a' : Math.round(v[0] * 100) + '%') + '   Memory ' + (v[1] === null ? 'n/a' : Math.round(v[1] * 100) + '%') + '   Pods ' + (v[2] === null ? 'n/a' : Math.round(v[2])) : 'Telemetry unavailable';
      ro.classList.toggle('down', !ok);
    });
    [].forEach.call(root.querySelectorAll('.hd-glow'), function (g) { g.style.opacity = v[0] === null ? 0.25 : (0.3 + 0.7 * Math.min(v[0], 1)).toFixed(2); });
    [].forEach.call(root.querySelectorAll('.hd-node'), function (g) { g.classList.toggle('ok', v[3] !== null && v[3] >= stat); g.classList.toggle('warn', v[3] !== null && v[3] < stat); });
  }
  function changes() {
    if (!prevLive || !live) return;
    var m = [];
    if (live[2] !== null && prevLive[2] !== null && Math.round(live[2]) !== Math.round(prevLive[2])) m.push('pods ' + Math.round(prevLive[2]) + ' to ' + Math.round(live[2]));
    if (live[0] !== null && prevLive[0] !== null && Math.round(live[0] * 100) !== Math.round(prevLive[0] * 100)) m.push('CPU ' + Math.round(prevLive[0] * 100) + '% to ' + Math.round(live[0] * 100) + '%');
    if (live[1] !== null && prevLive[1] !== null && Math.round(live[1] * 100) !== Math.round(prevLive[1] * 100)) m.push('memory ' + Math.round(prevLive[1] * 100) + '% to ' + Math.round(live[1] * 100) + '%');
    if (live[3] !== null && prevLive[3] !== null && live[3] !== prevLive[3]) m.push('nodes ready ' + prevLive[3] + ' to ' + live[3]);
    if (m.length) { msgs.unshift(m.join(', ')); msgs = msgs.slice(0, 3); }
    if (tick) tick.textContent = msgs.length ? 'Last changes: ' + msgs.join('  /  ') : 'Watching the cluster for changes';
  }
  function poll() {
    Promise.all([q('public:cpu_utilization:ratio'), q('public:memory_utilization:ratio'), q('public:pods_running:count'), q('public:nodes_ready:count')]).then(function (v) {
      prevLive = live; live = v; applyLive(); changes();
      if (tick && !msgs.length && (v[0] !== null || v[2] !== null)) tick.textContent = 'Watching the cluster for changes';
    });
  }
  // pointer parallax, off under reduced motion
  if (!reduce) root.addEventListener('pointermove', function (e) {
    var r = root.getBoundingClientRect();
    root.style.setProperty('--px', (((e.clientX - r.left) / r.width) * 2 - 1).toFixed(2)); root.style.setProperty('--py', (((e.clientY - r.top) / r.height) * 2 - 1).toFixed(2));
  });
  var rt; function re() { clearTimeout(rt); rt = setTimeout(function () { if (eff(view) !== V) setView(view); else sz(); }, 120); }
  if ('ResizeObserver' in window) new ResizeObserver(re).observe(root); else window.addEventListener('resize', re);
  var want = (location.search.match(/[?&]view=(\w+)/) || [])[1], saved = null;
  try { saved = localStorage.getItem('hview'); } catch (e) {}
  var start = NAMES[want] || (saved && 'drcs'.indexOf(saved) >= 0 ? saved : 'd');
  setView(start, !!NAMES[want]);
  poll(); setInterval(function () { if (!document.hidden) poll(); }, 60000);
  loop(true);
})();
