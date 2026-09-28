/* =============================================================================
   NORTIQA — los tableros de LEDs
   -----------------------------------------------------------------------------
   Port del `lightboard` de cult-ui (MIT), sin React. Los 27 glifos salen del
   componente original —una fuente de 5 filas, de 3 a 5 columnas por letra—; el
   rombo separador lo agregamos nosotros, ahí no estaba.

   Es una fábrica —una caja + el elemento del que leer el texto— y no un
   tablero suelto. Hoy monta uno solo, el de Arquitectura. Lo fue por la
   volanta del hero, que probamos y no quedó; se sacó de ahí, no de acá.

   Diferencias con el original, todas deliberadas:

   1. EL TEXTO NO ESTÁ EN EL JS. Se lee de un elemento que ya vivía en el HTML
      y que queda en el documento para los lectores de pantalla. Un canvas no
      tiene texto: si las palabras sólo existieran acá adentro, la sección las
      perdería para quien no ve.

   2. CORREGIDO UN ERROR DEL ORIGINAL. Al escalar la fuente hace
      `cell === '1' ? '1' : '3'`, o sea que las celdas APAGADAS ('0') se vuelven
      '3', que es el color más brillante. El texto sale invertido. Acá encendido
      es encendido.

   3. SEPARACIÓN ENTRE LETRAS. El original concatena los glifos sin aire, y una
      T (5 columnas, la primera fila entera encendida) se pega a la siguiente.
      Va una columna vacía entre letras.

   4. NO CORRE SIEMPRE. Un `requestAnimationFrame` eterno en una página que ya
      tiene la escena 3D del hero es pagar dos veces. Arranca cuando el tablero
      entra en pantalla, para cuando sale, y se detiene al pasar el mouse —eso
      último sí es del original—.
   ========================================================================== */

(function () {
  'use strict';

  var PUNTO = 4;      // diámetro del LED
  var HUECO = 1;      // aire entre LEDs
  var FILAS = 7;      // 5 de la letra + 1 arriba + 1 abajo
  var PASO  = PUNTO + HUECO;
  var MS    = 55;     // cada cuánto avanza una columna

  var FUENTE = {
    ' ': '0000|0000|0000|0000|0000',
    A: '0110|1001|1111|1001|1001',
    B: '1110|1001|1110|1001|1110',
    C: '0111|1000|1000|1000|0111',
    D: '1110|1001|1001|1001|1110',
    E: '1111|1000|1110|1000|1111',
    F: '1111|1000|1110|1000|1000',
    G: '0111|1000|1011|1001|0111',
    H: '1001|1001|1111|1001|1001',
    I: '111|010|010|010|111',
    J: '0011|0001|0001|1001|0110',
    K: '1001|1010|1100|1010|1001',
    L: '1000|1000|1000|1000|1111',
    M: '10001|11011|10101|10001|10001',
    N: '1001|1101|1011|1001|1001',
    O: '0110|1001|1001|1001|0110',
    P: '1110|1001|1110|1000|1000',
    Q: '0110|1001|1001|1010|0101',
    R: '1110|1001|1110|1010|1001',
    S: '0111|1000|0110|0001|1110',
    T: '11111|00100|00100|00100|00100',
    U: '1001|1001|1001|1001|0110',
    V: '10001|10001|01010|01010|00100',
    W: '10001|10001|10101|11011|10001',
    X: '1001|0110|0000|0110|1001',
    Y: '10001|01010|00100|00100|00100',
    Z: '1111|0001|0010|0100|1111',
    '◆': '00100|01110|11111|01110|00100',
    // El punto medio de la volanta del hero. Un solo LED en la fila del medio:
    // separa sin pesar, que es justamente lo que hace un `·` en el texto.
    '·': '000|000|010|000|000',
  };

  // Sin acentos: la fuente de puntos no los tiene, y una Ó que caiga en el
  // hueco de un espacio parte la palabra al medio.
  var SIN_TILDE = { 'Á':'A', 'É':'E', 'Í':'I', 'Ó':'O',
                    'Ú':'U', 'Ü':'U', 'Ñ':'N' };

  // De dónde sale el texto. Si el origen tiene hijos —la cadena de
  // Arquitectura, que son `<span>` y `<i>`— se juntan con un espacio en el
  // medio, porque pegados en el DOM saldrían pegados también en el tablero.
  // Si no los tiene, se toma el texto tal cual.
  function leerTexto(origen) {
    var t = origen.children.length
      ? [].map.call(origen.children, function (e) { return e.textContent.trim(); })
            .filter(Boolean).join(' ')
      : origen.textContent;

    return t.toUpperCase().replace(/[À-ß]/g, function (c) {
      return SIN_TILDE[c] || c;
    }).replace(/\s+/g, ' ').trim();
  }

  // El texto a columnas de bits. Cada columna es un entero: bit n = fila n.
  function aColumnas(t) {
    var cols = [];
    for (var i = 0; i < t.length; i++) {
      var g = FUENTE[t[i]] || FUENTE[' '];
      var filas = g.split('|');
      for (var c = 0; c < filas[0].length; c++) {
        var bits = 0;
        for (var f = 0; f < filas.length; f++) {
          if (filas[f][c] === '1') bits |= (1 << (f + 1));   // +1 = fila de aire arriba
        }
        cols.push(bits);
      }
      cols.push(0);                                          // aire entre letras
    }
    for (var k = 0; k < 6; k++) cols.push(0);                // aire al dar la vuelta
    return cols;
  }

  function crear(caja, origen) {
    var texto = leerTexto(origen);
    var COLS  = aColumnas(texto);

    var lienzo = document.createElement('canvas');
    lienzo.setAttribute('aria-hidden', 'true');
    caja.appendChild(lienzo);
    var ctx = lienzo.getContext('2d');

    // Los dos colores salen de `--led` y `--led-off`, definidas en el CSS al
    // lado de la regla del tablero. Se leen y no se escriben acá por lo de
    // siempre: un color en el JS queda fuera del alcance de quien ajusta la
    // hoja, y además no acompaña si el capítulo cambia de paleta. Es lo mismo
    // que ya hace `haz.js` con los haces.
    var ENCENDIDO = '#B6C0BC';
    var APAGADO   = '#E0E5E2';

    function deCSS(prop, reserva) {
      var v = getComputedStyle(caja).getPropertyValue(prop).trim();
      return v || reserva;
    }

    var ancho = 0, columnas = 0, dpr = 1, desfase = 0;

    function medir() {
      dpr = Math.min(devicePixelRatio || 1, 2);
      ancho = Math.max(1, Math.round(caja.clientWidth));
      // `ceil` y no `floor`: con floor, los píxeles que sobran de la división
      // quedaban sin pintar contra el borde derecho —hasta 4 px— y se veía
      // como un margen que nadie puso. La columna de más se sale de la caja y
      // la recorta el `overflow: hidden` del contenedor.
      columnas = Math.ceil(ancho / PASO);
      lienzo.width  = Math.round(ancho * dpr);
      lienzo.height = Math.round(FILAS * PASO * dpr);
      lienzo.style.width = '100%';
      lienzo.style.height = (FILAS * PASO) + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ENCENDIDO = deCSS('--led',     ENCENDIDO);
      APAGADO   = deCSS('--led-off', APAGADO);
      pintar();
    }

    function pintar() {
      ctx.clearRect(0, 0, ancho, FILAS * PASO);
      for (var c = 0; c < columnas; c++) {
        var bits = COLS[(c + desfase) % COLS.length];
        for (var f = 0; f < FILAS; f++) {
          ctx.fillStyle = (bits & (1 << f)) ? ENCENDIDO : APAGADO;
          ctx.beginPath();
          ctx.arc(c * PASO + PUNTO / 2, f * PASO + PUNTO / 2, PUNTO / 2, 0, 6.2832);
          ctx.fill();
        }
      }
    }

    var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var encima = false, corriendo = false, enCola = false, ultimo = 0;

    function cuadro(ahora) {
      enCola = false;
      if (!corriendo || document.hidden) return;
      if (!encima && ahora - ultimo >= MS) {
        desfase = (desfase + 1) % COLS.length;
        ultimo = ahora;
        pintar();
      }
      pedir();
    }
    // Guarda de bucle único, la misma disciplina que el resto del sitio.
    function pedir() {
      if (enCola || !corriendo || document.hidden) return;
      enCola = true;
      requestAnimationFrame(cuadro);
    }

    caja.addEventListener('pointerenter', function () { encima = true; });
    caja.addEventListener('pointerleave', function () { encima = false; });
    addEventListener('resize', medir, { passive: true });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) pedir(); });

    medir();

    if (!reduce && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (entradas) {
        for (var i = 0; i < entradas.length; i++) {
          corriendo = entradas[i].isIntersecting;
          if (corriendo) pedir();
        }
      }, { threshold: 0.15 }).observe(caja);
    }
    // Con `reduce` o sin observador queda quieto y legible: se pintó una vez.

    // Para `prueba-tablero.mjs`: bajo tiempo virtual el headless entrega cinco
    // cuadros de rAF en dos segundos, así que comparar píxeles entre dos
    // instantes es una moneda al aire. El desfase se lee directo.
    return {
      columnas:  function () { return COLS.length; },
      desfase:   function () { return desfase; },
      corriendo: function () { return corriendo; },
      texto: texto
    };
  }

  function montar(id, selOrigen) {
    var caja = document.getElementById(id);
    var origen = document.querySelector(selOrigen);
    if (!caja || !origen) return null;
    return crear(caja, origen);
  }

  window.tablero = montar('tablero', '.arq-cadena');
})();
