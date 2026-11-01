// Home showpiece: ambient traffic, an auto-cycling glowing beam, and the live cluster readout.
(function () {
  var root = document.querySelector('[data-hero]');
  if (!root) return;
  var NS = 'http://www.w3.org/2000/svg', VW = 1200;
  var svg = root.querySelector('.hdia'), cv = root.querySelector('.hd-fx'), cap = root.querySelector('.hd-cap-t');
  var gB = svg.querySelector('.hd-beams');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var small = window.matchMedia('(max-width: 700px)');
  function el(n, a, p) { var e = document.createElementNS(NS, n); for (var k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; }
  var STY = {
    https: { g: [1.3, 3.6], len: 14, v: 190, w: 2.2 }, http: { g: [1.5, 4], len: 12, v: 170, w: 2 }, bgp: { g: [4, 8], len: 0, v: 70, w: 3.4, both: 1 },
    iscsi: { g: [2, 4.5], len: 6, v: 160, w: 2.6, tr: 4 }, nfs: { g: [2.5, 5], len: 6, v: 150, w: 2.6, tr: 3 }, sql: { g: [2.5, 5], len: 6, v: 150, w: 2.2, tr: 3 },
    backup: { g: [6, 11], len: 0, v: 80, w: 4 }, tunnel: { g: [0.6, 1.2], len: 0, v: 130, w: 2 }, trunk: { g: [1.5, 3.5], len: 10, v: 190, w: 2 },
    ethernet: { g: [3, 6], len: 0, v: 140, w: 1.8 }, federate: { g: [3, 5], len: 0, v: 90, w: 2 }
  };
  var DEF = { g: [3, 6], len: 0, v: 120, w: 1.8 };
  var links = [].slice.call(svg.querySelectorAll('.hl')).map(function (p) {
    return { p: p, t: p.getTotalLength(), s: STY[p.getAttribute('data-kind')] || DEF, next: Math.random() * 3, from: p.getAttribute('data-from'), id: p.id.replace('hd-', '') };
  });
  var byId = {}; links.forEach(function (l) { byId[l.id] = l; });
  function rnd(r) { return r[0] + Math.random() * (r[1] - r[0]); }
  function sz() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2), w = svg.clientWidth, h = svg.clientHeight;
    cv.width = w * dpr; cv.height = h * dpr;
    var k = w / VW; cv.getContext('2d').setTransform(dpr * k, 0, 0, dpr * k, 0, 0);
  }
  var parts = [], amb = 1, raf = 0, last = 0, col = '#ededed', n = 0, vis = true, tracing = false;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    var dt = Math.min((now - last) / 1000, 0.1); last = now;
    if (++n % 50 === 0) col = getComputedStyle(document.documentElement).getPropertyValue('--fg').trim() || col;
    amb += ((tracing ? 0.35 : 1) - amb) * Math.min(dt * 4, 1);
    var sp = small.matches ? 0.6 : 1, ctx = cv.getContext('2d'), t = now / 1000;
    ctx.clearRect(0, 0, VW, 700);
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
    if (on && !raf && vis && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); }
    else if (!on && raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { vis = e[0].isIntersecting; loop(vis); }, { threshold: 0.05 }).observe(root);
  document.addEventListener('visibilitychange', function () { loop(!document.hidden); });

  // paths from the data: only hops that exist in the showpiece are drawn
  var paths = [].slice.call(root.querySelectorAll('.hd-paths > li')).map(function (li) {
    return { label: li.getAttribute('data-label'), hops: [].slice.call(li.querySelectorAll('li')).map(function (h) { return { n: h.getAttribute('data-node'), l: h.getAttribute('data-link') }; }).filter(function (h) { return svg.querySelector('#hdn-' + h.n); }) };
  }).filter(function (p) { return p.hops.length > 1; });
  var timers = [], pi = 0;
  function clear() {
    timers.forEach(clearTimeout); timers = []; gB.textContent = ''; tracing = false;
    [].forEach.call(svg.querySelectorAll('.on,.flash'), function (x) { x.classList.remove('on', 'flash'); });
    svg.classList.remove('tracing');
  }
  function run(p) {
    clear(); tracing = true; svg.classList.add('tracing');
    var prev = null, DUR = 800;
    p.hops.forEach(function (h, i) {
      var go = function () {
        var nd = svg.querySelector('#hdn-' + h.n);
        nd.classList.add('on'); if (!reduce) { nd.classList.remove('flash'); void nd.getBoundingClientRect(); nd.classList.add('flash'); }
        if (cap) cap.textContent = p.label + ': hop ' + (i + 1) + ' of ' + p.hops.length;
        var l = h.l && byId[h.l];
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
  if (paths.length) run(paths[0]);

  // live cluster numbers; nothing is shown unless the API answers
  var ep = root.getAttribute('data-endpoint'), stat = parseInt(root.getAttribute('data-k8s-static'), 10) || 0;
  var ro = svg.querySelector('#hd-ro'), glow = svg.querySelector('#hd-glow');
  function q(name) {
    return fetch(ep + '/query?query=' + encodeURIComponent(name)).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.status === 'success' && j.data.result.length ? parseFloat(j.data.result[0].value[1]) : null; }, function () { return null; });
  }
  function poll() {
    Promise.all([q('public:cpu_utilization:ratio'), q('public:memory_utilization:ratio'), q('public:pods_running:count'), q('public:nodes_ready:count')]).then(function (v) {
      var ok = v[0] !== null || v[1] !== null || v[2] !== null;
      ro.textContent = ok ? 'CPU ' + (v[0] === null ? 'n/a' : Math.round(v[0] * 100) + '%') + '   Memory ' + (v[1] === null ? 'n/a' : Math.round(v[1] * 100) + '%') + '   Pods ' + (v[2] === null ? 'n/a' : Math.round(v[2])) : 'Telemetry unavailable';
      ro.classList.toggle('down', !ok);
      glow.style.opacity = v[0] === null ? 0.25 : (0.3 + 0.7 * Math.min(v[0], 1)).toFixed(2);
      [].forEach.call(svg.querySelectorAll('.hd-node'), function (g) { g.classList.toggle('ok', v[3] !== null && v[3] >= stat); g.classList.toggle('warn', v[3] !== null && v[3] < stat); });
    });
  }
  poll(); setInterval(function () { if (!document.hidden) poll(); }, 60000);
  var rt; function re() { clearTimeout(rt); rt = setTimeout(sz, 120); }
  if ('ResizeObserver' in window) new ResizeObserver(re).observe(svg); else window.addEventListener('resize', re);
  sz(); loop(true);
})();
