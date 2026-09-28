/* =============================================================================
   NORTIQA — carrusel de marcas
   -----------------------------------------------------------------------------
   El `LogoCarousel` de cult-ui llevado a este stack. Cada columna va turnando
   sus logos; el que sale sube y se desenfoca, el que entra llega desde abajo.

   Tres diferencias con el original:

   · Un `setInterval` de 2 s en vez de un bucle por cuadro. El original recalcula
     el índice contra `performance.now()` en cada cuadro; para un cambio cada dos
     segundos eso es trabajo tirado. El movimiento lo hacen transiciones CSS.
   · El escalonado entre columnas es `transition-delay` en el CSS, no un
     temporizador por columna: un solo reloj para las tres.
   · Los logos están EN EL HTML, no en un arreglo de JS. Sin JS se ve el primero
     de cada columna, que sigue siendo una fila de marcas perfectamente válida.

   Arranca solo y se detiene fuera de pantalla o con la pestaña oculta.
   ========================================================================== */

(function () {
  'use strict';

  var TURNO = 2000;   // ms que dura cada logo, como el original

  var marcas = document.querySelector('.marcas');
  if (!marcas) return;

  var columnas = [].slice.call(marcas.querySelectorAll('.marca-col')).map(function (el) {
    return { el: el, logos: [].slice.call(el.querySelectorAll('.marca')), i: 0 };
  }).filter(function (c) { return c.logos.length > 1; });
  if (!columnas.length) return;

  // Sin movimiento no hay turno: queda la primera de cada columna, que es una
  // fila de marcas igual de informativa.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var reloj = null;

  function pasar() {
    columnas.forEach(function (c) {
      var sale = c.logos[c.i];
      c.i = (c.i + 1) % c.logos.length;
      var entra = c.logos[c.i];

      sale.classList.remove('on');
      sale.classList.add('sale');
      entra.classList.add('on');

      // Al terminar de salir vuelve al reposo —abajo—. Se hace con opacidad 0,
      // así que el viaje de vuelta no se ve.
      setTimeout(function () { sale.classList.remove('sale'); }, 700);
    });
  }

  function arrancar() { if (!reloj) reloj = setInterval(pasar, TURNO); }
  function parar() { if (reloj) { clearInterval(reloj); reloj = null; } }

  // Arranca de entrada y el observador SOLO pausa. Al revés —esperar a que el
  // observador avise— el carrusel queda muerto si el observador no llega a
  // disparar nunca, que es exactamente lo que pasa en el navegador headless de
  // este entorno. Para algo decorativo conviene fallar hacia el lado de que
  // funcione: un intervalo de 2 s fuera de pantalla no le cuesta nada a nadie.
  arrancar();

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { e.isIntersecting ? arrancar() : parar(); });
    }, { rootMargin: '80px 0px' }).observe(marcas);
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) parar();
  });

  // Asa para diagnóstico, como la escena y los haces.
  window.marcas = {
    columnas: columnas, pasar: pasar, arrancar: arrancar, parar: parar,
    corriendo: function () { return !!reloj; }
  };
})();
