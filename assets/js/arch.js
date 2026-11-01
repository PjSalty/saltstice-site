// Architecture view: hover details, layer toggles and path tracing over the server-rendered SVG.
(function () {
  var root = document.querySelector('[data-arch]');
  if (!root) return;
  var NS = 'http://www.w3.org/2000/svg';
  var svg = root.querySelector('.arch-svg');
  var info = root.querySelector('.arch-info');
  var packets = svg.querySelector('.packets');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nodeData = {};
  [].forEach.call(root.querySelectorAll('.node-data li'), function (li) { nodeData[li.getAttribute('data-id')] = li; });
  var links = [].slice.call(svg.querySelectorAll('.lk'));
  var hint = info ? info.innerHTML : '';
  var timers = [];
  var current = null;

  function nodeEl(id) { return svg.querySelector('#n-' + id); }
  function linkEl(id) { return svg.querySelector('#lk-' + id); }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }
  function showInfo(id) {
    if (!info) return;
    var li = nodeData[id];
    info.innerHTML = li ? li.innerHTML : hint;
  }

  // hover and focus: show details and light the neighbours
  function hover(id, on) {
    var el = nodeEl(id);
    root.classList.toggle('hover', on && !root.classList.contains('tracing'));
    [].forEach.call(svg.querySelectorAll('.hl'), function (x) { x.classList.remove('hl'); });
    if (!on) { showInfo(null); return; }
    if (el) el.classList.add('hl');
    links.forEach(function (l) {
      var f = l.getAttribute('data-from'), t = l.getAttribute('data-to');
      if (f === id || t === id) {
        l.classList.add('hl');
        var o = nodeEl(f === id ? t : f);
        if (o) o.classList.add('hl');
      }
    });
    showInfo(id);
  }
  [].forEach.call(svg.querySelectorAll('.nd'), function (el) {
    var id = el.getAttribute('data-id');
    el.addEventListener('mouseenter', function () { hover(id, true); });
    el.addEventListener('mouseleave', function () { hover(id, false); });
    el.addEventListener('focus', function () { hover(id, true); });
    el.addEventListener('blur', function () { hover(id, false); });
  });

  // layer toggles
  function applyLayers() {
    var off = {};
    [].forEach.call(root.querySelectorAll('[data-layer-toggle]'), function (c) { off[c.getAttribute('data-layer-toggle')] = !c.checked; });
    [].forEach.call(svg.querySelectorAll('.layer,.group,.nd'), function (el) { el.classList.toggle('is-off', !!off[el.getAttribute('data-layer')]); });
    links.forEach(function (l) {
      var a = nodeEl(l.getAttribute('data-from')), b = nodeEl(l.getAttribute('data-to'));
      var hide = (a && a.classList.contains('is-off')) || (b && b.classList.contains('is-off'));
      l.classList.toggle('is-off', !!hide);
    });
  }
  [].forEach.call(root.querySelectorAll('[data-layer-toggle]'), function (c) { c.addEventListener('change', applyLayers); });

  // path tracing
  function reset() {
    clearTimers();
    packets.textContent = '';
    root.classList.remove('tracing', 'hover');
    [].forEach.call(svg.querySelectorAll('.on,.hl'), function (x) { x.classList.remove('on', 'hl'); });
    [].forEach.call(root.querySelectorAll('.hops li'), function (x) { x.classList.remove('on'); x.removeAttribute('aria-current'); });
  }
  function packet(link, reverse) {
    if (reduce) return;
    var c = document.createElementNS(NS, 'circle');
    c.setAttribute('r', '4'); c.setAttribute('class', 'pkt');
    var a = document.createElementNS(NS, 'animateMotion');
    a.setAttribute('dur', '1.4s'); a.setAttribute('repeatCount', 'indefinite');
    a.setAttribute('calcMode', 'linear'); a.setAttribute('keyTimes', '0;1');
    a.setAttribute('keyPoints', reverse ? '1;0' : '0;1');
    var m = document.createElementNS(NS, 'mpath');
    m.setAttribute('href', '#' + link.id);
    a.appendChild(m); c.appendChild(a); packets.appendChild(c);
  }
  function activate(pid) {
    var sec = root.querySelector('.path[data-path="' + pid + '"]');
    if (!sec) return;
    reset();
    current = pid;
    [].forEach.call(root.querySelectorAll('.path'), function (p) { p.classList.toggle('on', p === sec); });
    [].forEach.call(root.querySelectorAll('.path-btn'), function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-path') === pid ? 'true' : 'false'); });
    var rb = sec.querySelector('[data-replay]');
    if (rb) rb.hidden = false;
    root.classList.add('tracing');
    var steps = [].slice.call(sec.querySelectorAll('.hops li'));
    var prev = null;
    steps.forEach(function (li, i) {
      var nid = li.getAttribute('data-node'), lid = li.getAttribute('data-link'), from = prev;
      prev = nid;
      var run = function () {
        var n = nodeEl(nid); if (n) n.classList.add('on');
        li.classList.add('on'); li.setAttribute('aria-current', 'step');
        if (i > 0) steps[i - 1].removeAttribute('aria-current');
        if (lid) {
          var l = linkEl(lid);
          if (l) { l.classList.add('on'); packet(l, l.getAttribute('data-from') !== from); }
        }
        if (i === 0 && n) showInfo(nid);
      };
      if (reduce) run(); else timers.push(setTimeout(run, i * 800));
    });
  }
  [].forEach.call(root.querySelectorAll('.path-btn'), function (b) {
    b.addEventListener('click', function () {
      var pid = b.getAttribute('data-path');
      if (current === pid) { reset(); current = null; b.setAttribute('aria-pressed', 'false'); [].forEach.call(root.querySelectorAll('.path'), function (p) { p.classList.remove('on'); }); return; }
      activate(pid);
    });
  });
  [].forEach.call(root.querySelectorAll('[data-replay]'), function (b) { b.addEventListener('click', function () { if (current) activate(current); }); });
  [].forEach.call(root.querySelectorAll('.hops li'), function (li) {
    li.addEventListener('mouseenter', function () { if (!reduce) showInfo(li.getAttribute('data-node')); });
  });

  var first = root.querySelector('.path-btn');
  var want = (location.hash.match(/^#path-(.+)$/) || [])[1];
  if (want && root.querySelector('.path[data-path="' + want + '"]')) activate(want);
  else if (first && window.matchMedia('(min-width: 960px)').matches) activate(first.getAttribute('data-path'));
})();
