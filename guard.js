// Evita que otra página muestre a Bonita dentro de un marco para engañar a la usuaria (clickjacking).
// GitHub Pages no permite configurar la cabecera frame-ancestors, por eso se hace acá.
(function () {
  if (window.top !== window.self) {
    document.documentElement.style.display = 'none';
    try { window.top.location.replace(window.self.location.href); } catch (e) { /* el navegador lo bloquea: la página queda oculta */ }
  }
})();
