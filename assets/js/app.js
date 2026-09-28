/* =============================================================================
   NORTIQA — orquestación de la portada
   -----------------------------------------------------------------------------
   Precargador con progreso real, rail de capítulos, barra de estado y
   medición del propio sitio. Sin librerías, sin módulos ES (para que
   `file://` siga funcionando).
   ========================================================================== */

(function () {
  'use strict';

  var $  = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* -----------------------------------------------------------------------
     1. Precargador
     El porcentaje sigue hitos reales: fuentes listas, shader compilado,
     primer cuadro dibujado. No es un temporizador disfrazado.
     ----------------------------------------------------------------------- */

  var precarga = $('#precarga');
  var pct      = $('#pct');
  var celdas   = $$('#precarga .precarga-grilla i');

  var meta = 0, mostrado = 0, cerrado = false;

  function hito(v) { meta = Math.max(meta, v); }

  function pintarProgreso() {
    if (cerrado) return;
    // Se acerca al hito alcanzado sin pasarlo, pero siempre avanza algo:
    // una aproximación puramente asintótica nunca llegaría a 100.
    mostrado = Math.min(meta, mostrado + Math.max((meta - mostrado) * 0.12, 0.7));
    var n = Math.min(100, Math.round(mostrado));
    if (pct) pct.textContent = n;

    // La grilla del isotipo se llena: ocho módulos en hueso, el noveno en oro.
    var llenas = Math.round((n / 100) * celdas.length);
    for (var i = 0; i < celdas.length; i++) {
      celdas[i].classList.toggle('on', i < llenas && i !== 5);
      celdas[i].classList.toggle('oro', i === 5 && llenas > 5);
    }

    if (n >= 100) { cerrar(); return; }
    requestAnimationFrame(pintarProgreso);
  }

  function cerrar() {
    if (cerrado) return;
    cerrado = true;
    if (pct) pct.textContent = '100';
    for (var i = 0; i < celdas.length; i++) {
      celdas[i].classList.toggle('on', i !== 5);
      celdas[i].classList.toggle('oro', i === 5);
    }
    setTimeout(function () {
      precarga.classList.add('fuera');
      setTimeout(function () { precarga.setAttribute('hidden', ''); }, 950);
    }, 320);
  }

  hito(12);
  requestAnimationFrame(pintarProgreso);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(function () { hito(38); });
  } else {
    hito(38);
  }

  // Red de seguridad: si algo falla, la página nunca queda tapada.
  setTimeout(function () { hito(100); }, 6000);

  /* -----------------------------------------------------------------------
     2. La escena
     ----------------------------------------------------------------------- */

  var lienzo = $('#escena');
  var escena = null;

  if (lienzo && typeof window.montarEscena === 'function') {
    escena = window.montarEscena(lienzo, function (ok) {
      if (!ok) { document.body.classList.add('sin-webgl'); hito(100); return; }
      hito(100);                       // primer cuadro dibujado
    });
    if (escena) hito(72);              // shader compilado y enlazado
  } else {
    document.body.classList.add('sin-webgl');
    hito(100);
  }

  /* -----------------------------------------------------------------------
     3. Rail de capítulos y desvanecido de la escena
     Scroll nativo: nada de secuestrar la rueda. El rail refleja dónde
     estás, no decide por vos.
     ----------------------------------------------------------------------- */

  var enlaces  = $$('#capitulos a');
  var secciones = enlaces
    .map(function (a) { return document.querySelector(a.getAttribute('href')); })
    .filter(Boolean);

  function marcar(id) {
    var n = 0;
    enlaces.forEach(function (a, i) {
      var actual = a.getAttribute('href') === '#' + id;
      a.setAttribute('aria-current', actual ? 'true' : 'false');
      if (actual) n = i + 1;
    });
    // El número de la barra sale del EPÍGRAFE de la sección —el «04 /» que se
    // ve arriba del titular—, no de la posición en el rail: el rail tiene ocho
    // entradas porque incluye INICIO, y las secciones se numeran 01 a 07 desde
    // Enfoque. Tomándolo del rail quedaría corrido en uno respecto de lo que
    // el visitante está leyendo.
    //
    // Antes venía de `escena.foco`, que es la distancia al centro de la losa
    // encendida en la grilla 3D del hero: cambiaba sola cada segundo y no
    // tenía relación con la sección.
    var b = document.getElementById('e-foco');
    if (b) {
      var sec = document.getElementById(id);
      var ep  = sec && sec.querySelector('.hud');
      var num = ep && ep.textContent.match(/^\s*(\d+)/);
      b.textContent = num ? num[1] : '00';        // el hero no tiene número
    }
  }

  /* -----------------------------------------------------------------------
     Tono del cromo fijo
     El encabezado, el rail y la barra de estado no heredan los tokens del
     capítulo porque son `fixed`. Hay que decirles sobre qué están.

     Y NO sirve el capítulo "actual" del rail: ese lo decide un
     `IntersectionObserver` con un margen de -45%, o sea que ya marca Enfoque
     mientras todavía se ve el hero. El encabezado quedaba en vidrio CLARO
     sobre el hero OSCURO. Son dos preguntas distintas: "¿en qué capítulo
     estoy?" y "¿qué tengo detrás?".

     Se resuelve por geometría, que es exacta: qué sección cruza el borde de
     abajo del encabezado, y qué sección cruza el medio del viewport.
     ----------------------------------------------------------------------- */

  function seccionEn(y) {
    for (var i = 0; i < secciones.length; i++) {
      var r = secciones[i].getBoundingClientRect();
      if (r.top <= y && r.bottom > y) return secciones[i];
    }
    return null;
  }

  function tonoDe(sec) {
    return sec && /cap--claro/.test(sec.className) ? 'claro' : 'oscuro';
  }

  var cabecera = document.querySelector('body > header');
  var barra = document.getElementById('estado');

  // Cada pieza fija pregunta por lo que tiene DETRÁS, y cada una está en otro
  // lado: el encabezado arriba, el rail a lo alto, la barra abajo. Con una sola
  // respuesta para las tres, alguna queda con el tono equivocado.
  function pintarTono() {
    var b = document.body;
    var altoCab = cabecera ? cabecera.offsetHeight : 80;
    var altoBarra = barra ? barra.offsetHeight : 41;
    b.setAttribute('data-tono-cab',   tonoDe(seccionEn(altoCab + 4)));
    b.setAttribute('data-tono-rail',  tonoDe(seccionEn(innerHeight / 2)));
    b.setAttribute('data-tono-barra', tonoDe(seccionEn(innerHeight - altoBarra - 4)));
  }

  if ('IntersectionObserver' in window && secciones.length) {
    var obs = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) { if (e.isIntersecting) marcar(e.target.id); });
    }, { rootMargin: '-45% 0px -50% 0px', threshold: 0 });
    secciones.forEach(function (s) { obs.observe(s); });
  }

  var hero = $('#hero');
  var ticking = false;

  function alDesplazar() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;

      pintarTono();

      var h = hero ? (hero.offsetHeight || innerHeight) : innerHeight;

      // El vidrio del encabezado y del rail se enciende al dejar el hero. No es
      // solo estética: `backdrop-filter` encima de la escena 3D desenfocaría un
      // canvas vivo en cada cuadro. En las páginas sin hero, apenas se scrollea.
      document.body.classList.toggle('fuera-hero',
        hero ? scrollY > h * 0.6 : scrollY > 24);
      // La atenuación arranca recién pasado el 30% del hero: un scroll corto
      // no puede apagar la escena. Sin hero —páginas interiores— se da por
      // salido: la escena no tiene dónde vivir.
      var v = hero ? Math.min(1, Math.max(0, (scrollY - h * 0.30) / (h * 0.60))) : 1;
      var dentro = hero && scrollY <= h * 1.25;

      if (escena) {
        escena.setScroll(v);
        // Fuera del hero la escena no se dibuja: no se gasta GPU de fondo.
        escena.pausar(!dentro);
      }
    });
  }

  addEventListener('scroll', alDesplazar, { passive: true });

  // Y una vez al inicio: si la página carga ya desplazada —con un ancla en la
  // URL, o con la posición restaurada por el navegador— el evento de scroll no
  // llega nunca y la escena no se atenuaría.
  alDesplazar();
  addEventListener('load', alDesplazar);

  /* -----------------------------------------------------------------------
     Las etapas de Roadmap
     -----------------------------------------------------------------------
     Una marca, una sola vez, cuando la sección entra: el CSS se ocupa del
     resto. Se desconecta enseguida — si se reanimara en cada pasada, subir y
     bajar por la página dejaría las etapas parpadeando. */

  if ('IntersectionObserver' in window &&
      !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    ['metodo', 'roadmap'].forEach(function (id) {
      var sec = document.getElementById(id);
      if (!sec) return;
      // Un vigía POR SECCIÓN, y cada uno se desconecta al disparar. Uno solo
      // compartido tendría que acordarse de a quién ya marcó.
      var vigia = new IntersectionObserver(function (e) {
        for (var i = 0; i < e.length; i++) {
          if (!e[i].isIntersecting) continue;
          vigia.disconnect();
          sec.classList.add('en-vista');
        }
      }, { threshold: 0.2 });
      vigia.observe(sec);
    });
  }

  /* -----------------------------------------------------------------------
     El menú de hamburguesa
     -----------------------------------------------------------------------
     El estado vive en UNA sola variable —la clase `.abierto` del encabezado— y
     `aria-expanded` la refleja. No hay un segundo booleano en JS que pueda
     desincronizarse del DOM.

     Se cierra de cuatro maneras, que es lo que un menú de teléfono tiene que
     hacer: tocando el botón, tocando un enlace, con Escape, y tocando fuera.
     Las dos últimas son las que más se olvidan y son las que más se usan. */

  var cabecera   = document.querySelector('body > header');
  var hamburguesa = cabecera && cabecera.querySelector('.hamburguesa');
  var navPral     = document.getElementById('nav-principal');

  if (hamburguesa && navPral) {
    var abrirMenu = function (si) {
      cabecera.classList.toggle('abierto', si);
      hamburguesa.setAttribute('aria-expanded', si ? 'true' : 'false');
    };

    hamburguesa.addEventListener('click', function () {
      abrirMenu(!cabecera.classList.contains('abierto'));
    });

    // Al tocar un enlace: los de otra página navegan igual, pero los que son
    // un ancla de ESTA página no disparan nada y el panel quedaría abierto
    // tapando justo lo que el visitante fue a ver.
    navPral.addEventListener('click', function (e) {
      if (e.target.closest('a')) abrirMenu(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !cabecera.classList.contains('abierto')) return;
      abrirMenu(false);
      hamburguesa.focus();     // el foco vuelve a donde estaba, no al principio
    });

    document.addEventListener('pointerdown', function (e) {
      if (!cabecera.classList.contains('abierto')) return;
      if (!cabecera.contains(e.target)) abrirMenu(false);
    });

    // Si la ventana se agranda hasta el menú de escritorio con el panel
    // abierto, el panel desaparece por CSS pero `aria-expanded` seguiría
    // diciendo `true`: un lector de pantalla anunciaría un menú abierto que no
    // existe.
    var anchoMenu = matchMedia('(max-width: 48rem)');
    var alCambiarAncho = function (m) { if (!m.matches) abrirMenu(false); };
    if (anchoMenu.addEventListener) anchoMenu.addEventListener('change', alCambiarAncho);
    else anchoMenu.addListener(alCambiarAncho);
  }

  /* -----------------------------------------------------------------------
     4. Barra de estado
     ----------------------------------------------------------------------- */

  var eFps  = $('#e-fps');

  if (escena && !reduce) {
    setInterval(function () {
      if (document.hidden) return;
      if (eFps)  eFps.textContent  = escena.dps ? escena.dps : '—';
    }, 500);
  } else if (escena) {
    if (eFps)  eFps.textContent  = '0';
  }

  /* -----------------------------------------------------------------------
     5. Medición del propio sitio
     ----------------------------------------------------------------------- */

  function medir() {
    var set = function (id, txt) { var el = document.getElementById(id); if (el) el.textContent = txt; };

    var nav = performance.getEntriesByType('navigation')[0];
    if (nav) set('m-carga', Math.max(1, Math.round(nav.domContentLoadedEventEnd)) + ' ms');

    set('m-nodos', document.getElementsByTagName('*').length.toLocaleString('es-AR'));
    set('m-deps', '0');

    // PESO PROPIO. Sale de la Navigation/Resource Timing: los bytes que el
    // navegador informa de cada recurso, más el documento.
    //
    // Acá hubo una lista de archivos escrita a mano que, si el navegador no
    // informaba bytes, los pedía con `fetch` y los sumaba. Dos cosas mal:
    //
    //  · La lista se quedó vieja —le faltaban `terminal.js`, `tablero.js` y la
    //    monoespaciada, 22 KB— porque nada la obligaba a actualizarse.
    //  · Y sobre todo: NUNCA funcionó donde hacía falta. Se usaba sólo con
    //    `file://`, y ahí `fetch` está bloqueado por origen. Los pedidos
    //    fallaban, el `catch` devolvía 0 para cada uno y quedaba el documento
    //    solo: informaba 104 KB cuando el sitio pesa 316.
    //
    // Con `file://` no hay forma de medirlo —ni `fetch` ni `cssRules`—, así
    // que ahí vale el número anotado en `data-peso`, que el HTML ya trae
    // escrito y una prueba mantiene al día.
    var red = performance.getEntriesByType('resource')
      .reduce(function (n, r) { return n + (r.encodedBodySize || r.decodedBodySize || 0); }, 0);

    if (red) {
      var doc = new Blob([document.documentElement.outerHTML]).size;
      set('m-peso', ((red + doc) / 1024).toFixed(0) + ' KB');
    }
    // Con `file://` no hay forma de medirlo —ni `fetch` ni `cssRules`—, así que
    // se usa el número ANOTADO en `data-peso` del propio elemento. No es una
    // lista escrita a mano que se pudra en silencio: `prueba-peso.mjs` lo
    // recalcula desde el disco y falla si se desfasó, igual que los sha256 del
    // manifiesto. Servido por http gana siempre la medición real.
  }

  /* -----------------------------------------------------------------------
     Los números del pie, contando
     -----------------------------------------------------------------------
     Cuentan desde cero hasta su valor cuando el pie entra en pantalla, una
     sola vez. Sin librería: son treinta líneas y un `requestAnimationFrame`.

     Tres detalles que hacen que no se vea barato:

     · La cifra se reformatea en cada cuadro con `toLocaleString`, así que los
       miles conservan su punto mientras sube en vez de aparecer al final.
     · El sufijo —KB, ms— nunca se toca: se anima el número, no el texto.
     · `.medicion` ya trae `font-variant-numeric: tabular-nums`, así que todas
       las cifras ocupan lo mismo y la caja no tiembla al contar. Sin eso, el
       ancho saltaría en cada cuadro y se notaría más la animación que el dato.

     Y uno que es del contenido: DEPENDENCIAS vale cero, así que es el único
     que no se mueve. Queda quieto mientras los otros tres corren. */

  function contar() {
    var celdas = [].slice.call(document.querySelectorAll('.medicion dd'));
    var items = [];

    celdas.forEach(function (dd) {
      var txt = dd.textContent.trim();
      var m = txt.match(/^([\d.,]+)(.*)$/);
      if (!m) return;                                  // un guion: no hay qué contar
      var destino = parseInt(m[1].replace(/\D/g, ''), 10);
      if (!isFinite(destino)) return;
      items.push({ el: dd, hasta: destino, sufijo: m[2] });
    });
    if (!items.length) return;

    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;  // ya están puestos

    var DURA = 900, t0 = null, enCola = false;

    function poner(it, v) {
      it.el.textContent = v.toLocaleString('es-AR') + it.sufijo;
    }
    items.forEach(function (it) { poner(it, 0); });

    function cuadro(ahora) {
      enCola = false;
      if (t0 === null) t0 = ahora;
      var f = Math.min(1, (ahora - t0) / DURA);
      // Desaceleración: arranca rápido y frena, que es como se lee un contador.
      var e = 1 - Math.pow(1 - f, 3);
      items.forEach(function (it) { poner(it, Math.round(it.hasta * e)); });
      if (f < 1) pedir(); else items.forEach(function (it) { poner(it, it.hasta); });
    }
    // Guarda de bucle único, la misma disciplina que el resto del sitio.
    function pedir() {
      if (enCola) return;
      enCola = true;
      requestAnimationFrame(cuadro);
    }
    pedir();
  }

  var medicion = document.querySelector('.medicion');
  if (medicion && 'IntersectionObserver' in window) {
    var vigiaMed = new IntersectionObserver(function (e) {
      for (var i = 0; i < e.length; i++) {
        if (!e[i].isIntersecting) continue;
        vigiaMed.disconnect();      // una sola vez: si no, parpadea al subir y bajar
        contar();
      }
    }, { threshold: 0.6 });
    vigiaMed.observe(medicion);
  }

  if (document.readyState === 'complete') setTimeout(medir, 0);
  else addEventListener('load', function () { setTimeout(medir, 0); });
})();
