(function () {
  var root = document.documentElement;

  // theme toggle
  var tt = document.getElementById('theme-toggle');
  if (tt) {
    var effective = function () {
      var t = root.getAttribute('data-theme');
      if (t) return t;
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    };
    var sync = function () { tt.setAttribute('aria-pressed', effective() === 'dark' ? 'true' : 'false'); };
    sync();
    tt.addEventListener('click', function () {
      var next = effective() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      sync();
    });
  }

  // copy buttons on code blocks
  document.querySelectorAll('.prose .highlight').forEach(function (box) {
    var code = box.querySelector('pre code') || box.querySelector('pre');
    if (!code) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'copy-code';
    b.textContent = 'copy';
    b.addEventListener('click', function () {
      var done = function () { b.textContent = 'copied'; setTimeout(function () { b.textContent = 'copy'; }, 1800); };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code.textContent).then(done, function () {});
      }
    });
    box.appendChild(b);
  });

  // writing filter
  var bar = document.querySelector('[data-filter-bar]');
  if (bar) {
    var rows = document.querySelectorAll('[data-type]');
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-filter]');
      if (!btn) return;
      bar.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', x === btn ? 'true' : 'false'); });
      var f = btn.getAttribute('data-filter');
      rows.forEach(function (r) { r.hidden = !(f === 'all' || r.getAttribute('data-type') === f); });
    });
  }

  // back to top
  var top = document.getElementById('to-top');
  if (top) {
    var onScroll = function () { top.hidden = window.scrollY < window.innerHeight; };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
})();
