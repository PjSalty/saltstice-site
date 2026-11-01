// Architecture map: path tracing, hover details and link drawing over the server-rendered boxes.
(function () {
  var root = document.querySelector('[data-arch]');
  if (!root) return;
  var NS = 'http://www.w3.org/2000/svg';
  var canvas = root.querySelector('.map-canvas');
  var svg = root.querySelector('.map-links');
  var gAll = svg.querySelector('.all'), gRoute = svg.querySelector('.route'), gPk = svg.querySelector('.packets');
  var detail = root.querySelector('.detail');
  var hint = detail ? detail.innerHTML : '';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var wide = window.matchMedia('(min-width: 960px)');
  var info = {}, links = {}, linkList = [];
  [].forEach.call(root.querySelectorAll('.node-data li'), function (li) { info[li.getAttribute('data-id')] = li; });
  [].forEach.call(root.querySelectorAll('.link-data li'), function (li) {
    var l = { id: li.getAttribute('data-id'), from: li.getAttribute('data-from'), to: li.getAttribute('data-to'), kind: li.getAttribute('data-kind') };
    links[l.id] = l; linkList.push(l);
  });
  var timers = [], current = null, hover = null, lane = 0;

  function node(id) { return canvas.querySelector('#n-' + id); }
  function box(id) {
    var el = node(id); if (!el) return null;
    var c = canvas.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height };
  }
  function size() {
    var c = canvas.getBoundingClientRect();
    svg.setAttribute('viewBox', '0 0 ' + c.width + ' ' + c.height);
    svg.setAttribute('width', c.width); svg.setAttribute('height', c.height);
  }
  // orthogonal route: out of one box, along a lane, into the other
  function route(a, b, off) {
    var ax = a.x + a.w / 2, ay = a.y + a.h / 2, bx = b.x + b.w / 2, by = b.y + b.h / 2;
    if (Math.abs(ay - by) < 8) {
      var gap = Math.abs(bx - ax) - (a.w + b.w) / 2;
      if (gap < 14) { var y = ay + off, sx = ax < bx ? a.x + a.w : a.x, ex = ax < bx ? b.x : b.x + b.w; return 'M' + sx + ' ' + y + 'H' + ex; }
      // not neighbours: go over the top instead of through the boxes between
      var top = Math.min(a.y, b.y) - 6 + off;
      return 'M' + (ax + off) + ' ' + a.y + 'V' + top + 'H' + (bx + off) + 'V' + b.y;
    }
    var down = by > ay;
    var sy = down ? a.y + a.h : a.y, ey = down ? b.y : b.y + b.h;
    var m = (sy + ey) / 2 + off;
    return 'M' + (ax + off) + ' ' + sy + 'V' + m + 'H' + (bx + off) + 'V' + ey;
  }
  function path(cls, d, parent) {
    var p = document.createElementNS(NS, 'path'); p.setAttribute('class', cls); p.setAttribute('d', d); parent.appendChild(p); return p;
  }
  function drawLink(l, cls, parent, off) {
    var a = box(l.from), b = box(l.to);
    if (!a || !b) return null;
    var p = path(cls, route(a, b, off || 0), parent);
    return p;
  }
  function showInfo(id) {
    if (!detail) return;
    var li = info[id];
    detail.innerHTML = li ? li.innerHTML : hint;
  }
  function clearHl() {
    [].forEach.call(canvas.querySelectorAll('.hl'), function (x) { x.classList.remove('hl'); });
    [].forEach.call(svg.querySelectorAll('.hover-l'), function (x) { x.parentNode.removeChild(x); });
  }

  // hover and focus: the node's own links and neighbours
  function onHover(id, on) {
    clearHl();
    if (!on) { if (current) showInfo(null); else showInfo(null); return; }
    var el = node(id); if (el) el.classList.add('hl');
    var k = 0;
    linkList.forEach(function (l) {
      if (l.from !== id && l.to !== id) return;
      var p = drawLink(l, 'hl-l hover-l', gAll, (k++ % 5) * 3 - 6);
      var o = node(l.from === id ? l.to : l.from); if (o) o.classList.add('hl');
    });
    showInfo(id);
  }
  [].forEach.call(canvas.querySelectorAll('.n'), function (el) {
    var id = el.getAttribute('data-id');
    el.addEventListener('mouseenter', function () { if (wide.matches) onHover(id, true); });
    el.addEventListener('mouseleave', function () { onHover(id, false); });
    el.addEventListener('focus', function () { if (wide.matches) onHover(id, true); });
    el.addEventListener('blur', function () { onHover(id, false); });
  });

  // every link, fainter, on request
  var allToggle = root.querySelector('[data-show-links]');
  function drawAll() {
    gAll.textContent = '';
    if (!allToggle || !allToggle.checked) return;
    linkList.forEach(function (l, i) { drawLink(l, 'al', gAll, (i % 6) * 3 - 8); });
  }
  if (allToggle) allToggle.addEventListener('change', drawAll);

  // path tracing
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function reset() {
    clearTimers();
    gRoute.textContent = ''; gPk.textContent = '';
    root.classList.remove('tracing');
    [].forEach.call(canvas.querySelectorAll('.on'), function (x) { x.classList.remove('on'); });
    [].forEach.call(canvas.querySelectorAll('.badge'), function (x) { x.parentNode.removeChild(x); });
    [].forEach.call(root.querySelectorAll('.hops li'), function (x) { x.classList.remove('on'); x.removeAttribute('aria-current'); });
  }
  function packet(d, reverse) {
    if (reduce) return;
    var c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', '4.5'); c.setAttribute('class', 'pkt');
    var a = document.createElementNS(NS, 'animateMotion');
    a.setAttribute('dur', '1.6s'); a.setAttribute('repeatCount', 'indefinite');
    a.setAttribute('calcMode', 'linear'); a.setAttribute('keyTimes', '0;1');
    a.setAttribute('keyPoints', reverse ? '1;0' : '0;1');
    a.setAttribute('path', d);
    c.appendChild(a); gPk.appendChild(c);
  }
  function addBadge(el, n) {
    var b = el.querySelector('.badge');
    if (b) { b.textContent += ',' + n; return; }
    b = document.createElement('span'); b.className = 'badge'; b.textContent = n; b.setAttribute('aria-hidden', 'true');
    el.appendChild(b);
  }
  function activate(pid) {
    var sec = root.querySelector('.pth[data-path="' + pid + '"]');
    if (!sec) return;
    reset(); size();
    current = pid;
    [].forEach.call(root.querySelectorAll('.pth'), function (p) { p.classList.toggle('on', p === sec); });
    [].forEach.call(root.querySelectorAll('.path-btn'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-path') === pid ? 'true' : 'false'); });
    var rb = sec.querySelector('[data-replay]'); if (rb) rb.hidden = false;
    root.classList.add('tracing');
    var steps = [].slice.call(sec.querySelectorAll('.hops li'));
    var prev = null;
    steps.forEach(function (li, i) {
      var nid = li.getAttribute('data-node'), lid = li.getAttribute('data-link'), from = prev;
      prev = nid;
      var run = function () {
        var n = node(nid);
        if (n) { n.classList.add('on'); addBadge(n, i + 1); }
        li.classList.add('on'); li.setAttribute('aria-current', 'step');
        if (i > 0) steps[i - 1].removeAttribute('aria-current');
        if (lid && links[lid]) {
          var l = links[lid], a = box(from), b = box(nid);
          if (a && b) {
            // draw in travel order so the packet always moves from the previous hop to this one
            var d = route(a, b, ((i % 3) - 1) * 4);
            path('rl', d, gRoute);
            packet(d, false);
          }
        }
        showInfo(nid);
      };
      if (reduce) run(); else timers.push(setTimeout(run, i * 750));
    });
  }
  [].forEach.call(root.querySelectorAll('.path-btn'), function (b) {
    b.addEventListener('click', function () {
      var pid = b.getAttribute('data-path');
      if (current === pid) { reset(); current = null; b.setAttribute('aria-pressed', 'false'); [].forEach.call(root.querySelectorAll('.pth'), function (p) { p.classList.remove('on'); }); showInfo(null); return; }
      activate(pid);
    });
  });
  [].forEach.call(root.querySelectorAll('[data-replay]'), function (b) { b.addEventListener('click', function () { if (current) activate(current); }); });
  [].forEach.call(root.querySelectorAll('.hops li'), function (li) {
    li.addEventListener('mouseenter', function () { showInfo(li.getAttribute('data-node')); });
  });

  // keep the overlay aligned when the layout changes
  var rt;
  function relayout() { clearTimeout(rt); rt = setTimeout(function () { size(); drawAll(); if (current) { var p = current; var was = timers.length; activate(p); } }, 150); }
  if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(canvas); else window.addEventListener('resize', relayout);

  size();
  var want = (location.hash.match(/^#path-(.+)$/) || [])[1];
  var start = want && root.querySelector('.pth[data-path="' + want + '"]') ? want : (root.querySelector('.pth[data-path="p-telemetry"]') ? 'p-telemetry' : (root.querySelector('.path-btn') || {getAttribute: function () { return null; }}).getAttribute('data-path'));
  if (start && wide.matches) activate(start);
})();
