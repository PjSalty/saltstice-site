// Runs in <head> so the saved theme is set before first paint.
(function () {
  var r = document.documentElement;
  r.classList.add('js');
  try {
    var q = /[?&]theme=(light|dark)/.exec(location.search);
    var t = q ? q[1] : localStorage.getItem('theme');
    if (t === 'light' || t === 'dark') r.setAttribute('data-theme', t);
  } catch (e) {}
})();
