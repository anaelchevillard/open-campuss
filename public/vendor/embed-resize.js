// Artefact inséré dans un cours : la page annonce sa hauteur à la page qui l'affiche, qui ajuste le
// cadre entre deux bornes. Rien d'autre ne traverse : ni le contenu, ni le stockage, ni les événements.
(function () {
  var last = 0;
  function send() {
    var doc = document.documentElement, body = document.body;
    var h = Math.ceil(Math.max(doc ? doc.scrollHeight : 0, body ? body.scrollHeight : 0));
    if (!h || Math.abs(h - last) < 2) return;
    last = h;
    try { window.parent.postMessage({ type: "campuss-height", height: h }, "*"); } catch (e) {}
  }
  function start() {
    send();
    try { new ResizeObserver(send).observe(document.documentElement); } catch (e) { setInterval(send, 1000); }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.addEventListener("load", send);
})();
