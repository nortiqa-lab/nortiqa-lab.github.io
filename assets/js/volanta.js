/* =============================================================================
   NORTIQA — la volanta del hero se escribe sola
   -----------------------------------------------------------------------------
   Una línea de terminal arriba del titular: aparece una palabra por vez y el
   cursor de bloque late dos veces antes de borrarla. Cada palabra tarda lo
   mismo en escribirse, sea de doce letras o de diecinueve — el paso por
   carácter sale de dividir, no al revés.

   Es el MISMO objeto que la terminal de Aplicaciones, a propósito: la fuente,
   el signo `$`, la geometría del cursor y su cadencia de 1,06 s son las de
   `.term-*`. Por eso el keyframe del latido no se redefine acá, se reusa
   `term-late`. Dos terminales en un sitio tienen que ser la misma terminal.

   Tres decisiones que valen:

   1. LAS PALABRAS ESTÁN EN EL HTML. Salen de la frase completa que vive al
      lado en `.solo-lectores`, partida por el `·`. Un lector de pantalla lee
      esa frase entera y quieta; el párrafo que se escribe va `aria-hidden`,
      porque si no anunciaría la volanta de nuevo cada tres segundos.

   2. EL RENGLÓN NO SE MUEVE. El párrafo va a todo el ancho de la columna y
      apoyado a la izquierda, así que el texto crece hacia la derecha sin
      correr nada. Cuando estuvo centrado hubo que reservarle el ancho de la
      palabra más larga: centrada, la caja se ensanchaba letra por letra y
      temblaba el hero entero.

   3. NO CORRE SI NO SE VE. Igual que el tablero y la terminal: la cadena de
      relojes se corta al salir de pantalla o al cambiar de pestaña.
   ========================================================================== */

(function () {
  'use strict';

  var p = document.querySelector('.volanta');
  if (!p) return;
  var txt    = p.querySelector('.volanta-txt');
  var lectura = document.querySelector('.volanta-lectura');
  if (!txt || !lectura) return;

  var PALABRAS = lectura.textContent.split('·').map(function (s) {
    return s.trim();
  }).filter(Boolean);
  if (!PALABRAS.length) return;

  // 1,06 s es el latido del cursor y está escrito en el CSS —`term-late`, el
  // mismo de la terminal de Aplicaciones—. Acá aparece porque el sostén son
  // DOS latidos exactos: si allá cambia, acá también.
  var LATIDO   = 1060;
  var ESCRIBIR = 1400;            // el tipeo
  var SOSTEN   = LATIDO * 2;      // dos parpadeos, ni uno más
  var BORRAR   = 500;             // se borra más rápido de lo que se escribe
  var HUECO    = 240;             // aire antes de la próxima

  /* --- La sangría: arrancar en la S del titular ---------------------------
     El titular es texto CENTRADO, así que el borde izquierdo de su primera
     línea no es un número que el CSS conozca: depende de cuánto mide esa
     línea, y eso depende de la tipografía que haya cargado y del ancho de la
     ventana. No hay forma de escribirlo a mano; hay que medirlo y volver a
     medirlo cuando alguna de las dos cosas cambia.

     Es la única parte de todo esto que ejecuta código para acomodar un adorno.
     Vale la pena porque el resultado es un borde que el ojo VE —la volanta y
     la S apoyadas en la misma vertical—, que es distinto de un margen que sólo
     existe en la hoja de estilos. */
  var titulo = document.getElementById('inicio-titulo');
  var sangria = -1;

  function sangrar() {
    if (!titulo) return;
    var rango = document.createRange();
    rango.selectNodeContents(titulo);
    var cajas = rango.getClientRects();
    if (!cajas.length) return;

    // `getClientRects` no devuelve una caja por línea: el `<em>` de
    // "organizacional." parte su renglón en dos. Se busca el `top` más chico
    // —la primera línea— y, entre las cajas de esa línea, el `left` más chico.
    var top = Infinity, izq = Infinity, i;
    for (i = 0; i < cajas.length; i++) if (cajas[i].top < top) top = cajas[i].top;
    for (i = 0; i < cajas.length; i++) {
      if (cajas[i].top < top + 1 && cajas[i].left < izq) izq = cajas[i].left;
    }
    if (izq === Infinity) return;

    // `padding-left` corre el CONTENIDO y no la caja, así que el borde que se
    // mide no se mueve solo: no hay realimentación con el ResizeObserver.
    var d = Math.max(0, Math.round(izq - p.getBoundingClientRect().left));
    if (d !== sangria) { sangria = d; p.style.paddingLeft = d + 'px'; }
  }

  sangrar();
  // La tipografía del titular llega después del primer layout: sin esto la
  // medida es la de la fuente de reserva y queda corrida unos pixeles.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(sangrar);
  if ('ResizeObserver' in window) new ResizeObserver(sangrar).observe(titulo);
  else addEventListener('resize', sangrar, { passive: true });

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reduce) {
    txt.textContent = PALABRAS.join(' · ');
    txt.style.width = 'auto';
    return;                              // queda la frase entera, quieta
  }

  var relojes = [], indice = 0, corriendo = false;

  function limpiar() {
    for (var i = 0; i < relojes.length; i++) clearTimeout(relojes[i]);
    relojes = [];
  }
  function luego(fn, ms) { relojes.push(setTimeout(fn, ms)); }

  // `steps(n, end)` y no una curva: entre paso y paso el ancho no se mueve, así
  // que cada letra APARECE ENTERA en vez de ir asomando cortada por la mitad.
  // Es lo que separa un tipeo de una cortina.
  function ancho(a, ms, pasos) {
    txt.style.transition = 'width ' + ms + 'ms steps(' + pasos + ', end)';
    txt.style.width = a;
  }

  function escribir() {
    if (!corriendo) return;
    var palabra = PALABRAS[indice];

    txt.textContent = palabra;
    txt.style.transition = 'none';
    txt.style.width = '0ch';
    void txt.offsetWidth;                // el reflow que hace que el 0 cuente

    p.classList.remove('latiendo');
    ancho(palabra.length + 'ch', ESCRIBIR, palabra.length);

    // Mientras escribe y mientras borra, el cursor va FIJO; late sólo en la
    // pausa. Es lo que hace una terminal de verdad —el cursor parpadea cuando
    // espera, no cuando sale texto— y de paso es lo que hace que los dos
    // parpadeos se puedan contar: si latiera todo el tiempo, cuántos entran
    // en la pausa dependería de en qué momento del ciclo terminó la palabra.
    luego(function () {
      p.classList.add('latiendo');
    }, ESCRIBIR);

    luego(function () {
      p.classList.remove('latiendo');
      ancho('0ch', BORRAR, palabra.length);
      luego(function () {
        indice = (indice + 1) % PALABRAS.length;
        escribir();
      }, BORRAR + HUECO);
    }, ESCRIBIR + SOSTEN);
  }

  function arrancar() {
    if (corriendo || document.hidden) return;
    corriendo = true;
    escribir();
  }
  function parar() {
    corriendo = false;
    limpiar();
    p.classList.remove('latiendo');
  }

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { limpiar(); } else if (corriendo) { escribir(); }
  });

  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entradas) {
      for (var i = 0; i < entradas.length; i++) {
        if (entradas[i].isIntersecting) arrancar(); else parar();
      }
    }, { threshold: 0 }).observe(p);
  } else {
    arrancar();
  }

  // Para las pruebas: bajo tiempo virtual las transiciones de CSS no avanzan,
  // así que mirar el ancho computado no dice nada. Lo que se puede leer es el
  // estado de la cadena.
  window.volanta = {
    palabras:  function () { return PALABRAS.slice(); },
    indice:    function () { return indice; },
    corriendo: function () { return corriendo; },
    destino:   function () { return txt.style.width; },
    sangria:   function () { return sangria; }
  };
})();
