(function () {
  var root = document.documentElement;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  // theme toggle
  var tt = $('#theme-toggle');
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

  // mobile nav sheet
  var mb = $('#menu-btn');
  var nav = $('#site-nav');
  if (mb && nav) {
    var setOpen = function (open) {
      root.classList.toggle('nav-open', open);
      mb.setAttribute('aria-expanded', open ? 'true' : 'false');
      mb.setAttribute('aria-label', open ? 'Close menu' : 'Menu');
    };
    mb.addEventListener('click', function () { setOpen(!root.classList.contains('nav-open')); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && root.classList.contains('nav-open')) { setOpen(false); mb.focus(); }
    });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    window.matchMedia('(min-width: 881px)').addEventListener('change', function (e) { if (e.matches) setOpen(false); });
  }

  // copy buttons
  $$('.code').forEach(function (box) {
    var bar = $('.code-bar', box);
    var code = $('pre', box);
    if (!bar || !code) return;
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'copy-code';
    b.textContent = 'copy';
    b.setAttribute('aria-label', 'Copy code');
    b.addEventListener('click', function () {
      var done = function () { b.textContent = 'copied'; setTimeout(function () { b.textContent = 'copy'; }, 1600); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code.textContent).then(done, function () {});
    });
    bar.appendChild(b);
  });

  // writing filter
  var bar = $('[data-filter-bar]');
  if (bar) {
    var rows = $$('.row[data-type]');
    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-filter]');
      if (!btn) return;
      $$('button', bar).forEach(function (x) { x.setAttribute('aria-pressed', x === btn ? 'true' : 'false'); });
      var f = btn.getAttribute('data-filter');
      rows.forEach(function (r) { r.hidden = !(f === 'all' || r.getAttribute('data-type') === f); });
    });
    var want = new URLSearchParams(location.search).get('type');
    if (want) { var pre = $('button[data-filter="' + want.replace(/[^a-z]/g, '') + '"]', bar); if (pre) pre.click(); }
  }

  // contents: open on wide screens, scroll spy
  var toc = $('.toc details');
  if (toc) {
    var wide = window.matchMedia('(min-width: 1100px)');
    var place = function () { if (wide.matches) toc.setAttribute('open', ''); };
    place();
    wide.addEventListener('change', place);
    var links = {};
    $$('.toc nav a').forEach(function (a) { links[decodeURIComponent(a.getAttribute('href').slice(1))] = a; });
    var heads = $$('.prose h2[id], .prose h3[id]').filter(function (h) { return links[h.id]; });
    if (heads.length && 'IntersectionObserver' in window) {
      var current = null;
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) {
            if (current) current.removeAttribute('aria-current');
            current = links[en.target.id];
            current.setAttribute('aria-current', 'true');
          }
        });
      }, { rootMargin: '-80px 0px -70% 0px' });
      heads.forEach(function (h) { io.observe(h); });
    }
  }

  // back to top
  var top = $('#to-top');
  if (top) {
    var onScroll = function () { top.hidden = window.scrollY < window.innerHeight * 1.5; };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // "/" jumps to search
  document.addEventListener('keydown', function (e) {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    var el = document.activeElement;
    if (el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable)) return;
    e.preventDefault();
    var q = $('#q');
    if (q) q.focus(); else location.href = '/search/';
  });
})();
