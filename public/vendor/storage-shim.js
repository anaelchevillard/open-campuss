// Un contenu isolé n'a pas accès au stockage du navigateur. On lui en fournit un, propre à ce document : la page
// parente le conserve et le rend à l'ouverture suivante, sans que le contenu voie autre chose que ses propres données.
(function () {
  function makeStorage(data, persist) {
    var api = {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null; },
      setItem: function (k, v) { data[String(k)] = String(v); persist(); },
      removeItem: function (k) { delete data[k]; persist(); },
      clear: function () { Object.keys(data).forEach(function (k) { delete data[k]; }); persist(); },
      key: function (i) { return Object.keys(data)[i] || null; },
      get length() { return Object.keys(data).length; },
    };
    return api;
  }
  var initial = {};
  try { if (window.name.indexOf("campuss:") === 0) initial = JSON.parse(window.name.slice(8)); } catch (e) {}
  function send() { try { window.parent.postMessage({ type: "campuss-storage", data: initial }, "*"); } catch (e) {} }
  try {
    Object.defineProperty(window, "localStorage", { value: makeStorage(initial, send), configurable: true });
    Object.defineProperty(window, "sessionStorage", { value: makeStorage({}, function () {}), configurable: true });
  } catch (e) {}
})();
