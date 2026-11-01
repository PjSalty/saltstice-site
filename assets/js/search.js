// Client-side search over /index.json. No dependencies.
(function () {
  var input = document.getElementById('q');
  var out = document.getElementById('results');
  var status = document.getElementById('search-status');
  if (!input || !out) return;

  var docs = null;
  var loading = null;

  function load() {
    if (docs) return Promise.resolve(docs);
    if (loading) return loading;
    loading = fetch(input.getAttribute('data-index'), { credentials: 'omit' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        d.forEach(function (x) { x.t = x.title.toLowerCase(); x.c = x.content.toLowerCase(); x.tg = (x.tags || []).join(' ').toLowerCase(); });
        docs = d;
        return d;
      });
    return loading;
  }

  function esc(s) {
    return s.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function rx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function snippet(d, terms) {
    var low = d.c, at = -1;
    for (var i = 0; i < terms.length && at < 0; i++) at = low.indexOf(terms[i]);
    if (at < 0) return esc(d.summary || d.content.slice(0, 160));
    var s = Math.max(0, at - 70), e = Math.min(d.content.length, at + 130);
    var txt = (s > 0 ? '...' : '') + d.content.slice(s, e) + (e < d.content.length ? '...' : '');
    var h = esc(txt);
    terms.forEach(function (t) { h = h.replace(new RegExp('(' + rx(esc(t)) + ')', 'gi'), '<mark>$1</mark>'); });
    return h;
  }

  function run(q) {
    var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    out.textContent = '';
    if (!terms.length) { status.textContent = ''; return; }
    load().then(function (list) {
      var hits = [];
      list.forEach(function (d) {
        var score = 0;
        for (var i = 0; i < terms.length; i++) {
          var t = terms[i], s = 0;
          if (d.t.indexOf(t) >= 0) s += 10;
          if (d.tg.indexOf(t) >= 0) s += 4;
          var n = d.c.split(t).length - 1;
          if (n) s += Math.min(n, 8);
          if (!s) return; // every term must match
          score += s;
        }
        hits.push({ d: d, s: score });
      });
      hits.sort(function (a, b) { return b.s - a.s; });
      status.textContent = hits.length + (hits.length === 1 ? ' result' : ' results');
      hits.slice(0, 30).forEach(function (h) {
        var li = document.createElement('li');
        li.innerHTML = '<a href="' + esc(h.d.permalink) + '">' + esc(h.d.title) + '</a><p>' + snippet(h.d, terms) + '</p>';
        out.appendChild(li);
      });
    }).catch(function () { status.textContent = 'Search index failed to load.'; });
  }

  var timer;
  input.addEventListener('input', function () {
    clearTimeout(timer);
    timer = setTimeout(function () {
      run(input.value.trim());
      var u = new URL(location.href);
      if (input.value.trim()) u.searchParams.set('q', input.value.trim()); else u.searchParams.delete('q');
      history.replaceState(null, '', u);
    }, 120);
  });
  input.addEventListener('focus', load, { once: true });

  var q0 = new URLSearchParams(location.search).get('q');
  if (q0) { input.value = q0; run(q0); }
})();
