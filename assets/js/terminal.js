/* =============================================================================
   NORTIQA — la terminal de Aplicaciones
   -----------------------------------------------------------------------------
   Port del `terminal-animation` de cult-ui (MIT), sin React ni dependencias.
   El original son cadenas de `setTimeout` alrededor de un contexto de React;
   acá son las mismas cadenas sin el contexto.

   Dos decisiones que lo separan del original y valen la pena:

   1. EL TEXTO NUNCA SALE DEL DOM. El componente de cult-ui tipea con
      `command.slice(0, n)`, o sea que los caracteres que todavía no se
      escribieron no existen. Un lector de pantalla encuentra una línea a
      medio escribir, o nada. Acá las líneas están completas desde el vamos:
      la orden se revela animando su `width` en unidades `ch` —que es exacto
      porque la fuente es monoespaciada— y las líneas de salida con opacidad.
      Lo que se anima es la presentación, no el contenido.

   2. ARRANCA CUANDO SE VE. Sin esto la secuencia corre al cargar la página y
      cuando el visitante llega a la sección ya terminó. Es una demostración:
      si nadie la mira, no demuestra nada.
   ========================================================================== */

(function () {
  'use strict';

  var raiz = document.getElementById('terminal');
  if (!raiz) return;

  var tabs   = [].slice.call(raiz.querySelectorAll('.term-tab'));
  var caras  = [].slice.call(raiz.querySelectorAll('.term-panel'));
  if (!tabs.length || tabs.length !== caras.length) return;

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var relojes = [];
  var actual = 0;

  function limpiar() {
    for (var i = 0; i < relojes.length; i++) clearTimeout(relojes[i]);
    relojes = [];
  }
  function luego(fn, ms) { relojes.push(setTimeout(fn, ms)); }

  // Deja una cara en su estado FINAL, sin animación. Es lo que se usa con
  // movimiento reducido y al salir de una pestaña.
  function completar(cara) {
    var orden = cara.querySelector('.term-cmd');
    if (orden) orden.style.width = orden.textContent.length + 'ch';
    var lineas = cara.querySelectorAll('.term-linea');
    for (var i = 0; i < lineas.length; i++) lineas[i].classList.add('on');
    cara.classList.remove('tipeando');
    cara.classList.add('listo');
  }

  function reiniciar(cara) {
    var orden = cara.querySelector('.term-cmd');
    if (orden) orden.style.width = '0ch';
    var lineas = cara.querySelectorAll('.term-linea');
    for (var i = 0; i < lineas.length; i++) lineas[i].classList.remove('on');
    cara.classList.remove('listo', 'tipeando');
  }

  function correr(cara) {
    limpiar();
    if (reduce) { completar(cara); return; }
    reiniciar(cara);

    var orden  = cara.querySelector('.term-cmd');
    var lineas = [].slice.call(cara.querySelectorAll('.term-linea'));
    var total  = orden ? orden.textContent.length : 0;
    cara.classList.add('tipeando');

    function tecla(n) {
      if (n > total) {
        cara.classList.remove('tipeando');
        salida(0, 260);
        return;
      }
      orden.style.width = n + 'ch';
      // El jitter es del original: sin él el tipeo suena a máquina, con él
      // suena a alguien escribiendo.
      luego(function () { tecla(n + 1); }, 24 + Math.random() * 34);
    }

    function salida(i, espera) {
      if (i >= lineas.length) { cara.classList.add('listo'); return; }
      luego(function () {
        lineas[i].classList.add('on');
        salida(i + 1, parseInt(lineas[i].getAttribute('data-espera'), 10) || 200);
      }, espera);
    }

    if (total) luego(function () { tecla(0); }, 300); else salida(0, 200);
  }

  function activar(n, foco) {
    if (n === actual && !foco) return;
    limpiar();
    for (var i = 0; i < tabs.length; i++) {
      var on = i === n;
      tabs[i].classList.toggle('on', on);
      tabs[i].setAttribute('aria-selected', on ? 'true' : 'false');
      tabs[i].tabIndex = on ? 0 : -1;
      caras[i].hidden = !on;
      if (!on) completar(caras[i]);   // la que se va queda legible, no a medias
    }
    actual = n;
    if (foco) tabs[n].focus();
    correr(caras[n]);
  }

  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { activar(i, false); });
  });

  // Flechas entre pestañas: es lo que un `role="tablist"` promete.
  raiz.querySelector('.term-tabs').addEventListener('keydown', function (e) {
    var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    activar((actual + d + tabs.length) % tabs.length, true);
  });

  if (reduce || !('IntersectionObserver' in window)) {
    raiz.classList.add('visible');
    completar(caras[0]);
    return;
  }

  // Una sola vez: si se reiniciara en cada pasada, desplazarse por la página
  // dejaría la terminal parpadeando a cada vuelta.
  //
  // La misma señal hace las dos cosas: entra el marco deslizándose desde abajo
  // —`.visible`, el CSS se ocupa— y arranca la secuencia. El original usa dos
  // observadores separados, uno en la ventana y otro implícito en el montaje;
  // acá es el mismo umbral porque es el mismo momento.
  var vigia = new IntersectionObserver(function (entradas) {
    for (var i = 0; i < entradas.length; i++) {
      if (entradas[i].isIntersecting) {
        vigia.disconnect();
        raiz.classList.add('visible');
        // Espera a que el marco esté arriba: si la orden se tipea mientras la
        // ventana todavía sube, se leen las dos cosas a la vez y ninguna.
        luego(function () { correr(caras[actual]); }, 620);
      }
    }
    // Umbral ALTO a propósito. Con 0,2 el observador avisaba apenas asomaba el
    // borde superior de la ventana, todavía abajo del pliegue: para cuando el
    // visitante llegaba a mirarla, el deslizamiento ya había terminado y sólo
    // veía una ventana quieta. A 0,45 arranca con media ventana en pantalla,
    // que es donde se ve subir.
  }, { threshold: 0.45 });
  vigia.observe(raiz);
})();
