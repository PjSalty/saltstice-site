// Hydrates [data-live] numbers from the public metrics API. Build-time values stay in place until the API answers.
(function () {
  var els = [].slice.call(document.querySelectorAll('[data-live]'));
  if (!els.length) return;
  var t = document.querySelector('[data-telemetry]');
  var ep = (t && t.getAttribute('data-endpoint')) || (document.querySelector('meta[name=live-endpoint]') || {}).content;
  if (!ep) return;
  var Q = {
    vms_running: ['public:vms_running:count', 'n'], k8s_nodes: ['public:k8s_nodes:count', 'n'], namespaces: ['public:namespaces:count', 'n'],
    ram_allocated_gib: ['public:vm_memory_allocated:bytes', 'gib'], ram_total_gib: ['public:host_memory:bytes', 'gib'], rke2_version: ['public:kubernetes_version:info', 'line'],
    jellyfin_version: ['public:jellyfin_version:info', 'line'], velero_version: ['public:velero_version:info', 'line'], truenas_csi_version: ['public:truenas_csi_version:info', 'line']
  };
  var cache = {};
  function get(name) {
    if (!cache[name]) cache[name] = fetch(ep + '/query?query=' + encodeURIComponent(name)).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return j && j.status === 'success' && j.data.result.length ? j.data.result[0] : null; }, function () { return null; });
    return cache[name];
  }
  function fmt(kind, r) {
    if (kind === 'line') return r.metric && r.metric.line ? r.metric.line : null;
    var v = parseFloat(r.value[1]); if (!isFinite(v)) return null;
    return kind === 'gib' ? (v / 1073741824).toFixed(1) : String(Math.round(v));
  }
  els.forEach(function (e) {
    var q = Q[e.getAttribute('data-live')]; if (!q) return;
    get(q[0]).then(function (r) {
      var s = r && fmt(q[1], r);
      if (s === null || s === undefined) return;
      e.textContent = s;
      var cell = e.closest('.stat'); if (cell) cell.classList.add('is-live');
      var hid = e.closest('[data-live-hide]'); if (hid) hid.hidden = false;
    });
  });
})();
