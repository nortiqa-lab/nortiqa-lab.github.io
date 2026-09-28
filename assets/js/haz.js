/* =============================================================================
   NORTIQA — haces sobre los cuadros
   -----------------------------------------------------------------------------
   El `GridBeam` de cult-ui: por cada línea de la grilla corre un haz corto, y
   donde se cruzan uno horizontal y uno vertical, la intersección destella.
   Misma matemática que el original —núcleo con degradado lineal, bloom radial
   achatado, y una gaussiana de proximidad para el destello— con cinco
   decisiones propias:

   · UN SOLO BUCLE para los 18 cuadros. El original monta un `requestAnimation-
     Frame` por instancia: acá serían 18 bucles compitiendo. En este proyecto ya
     costó caro tener dos.
   · Solo dibuja los cuadros EN PANTALLA, por `IntersectionObserver`. Cuando no
     hay ninguno visible el bucle se apaga solo y se vuelve a encender al entrar
     el primero.
   · Los haces van por LAS DIVISIONES REALES de la grilla, no por una grilla
     inventada adentro de cada cuadro. El original subdivide cada caja por su
     cuenta y dibuja líneas propias; acá la página ya tiene sus juntas —las
     `.tarjetas` son una grilla con `gap: 1px` sobre un fondo de línea— y el haz
     corre por ahí. Las posiciones se MIDEN de los cuadros ya maquetados, porque
     con `auto-fit` la cantidad de columnas depende del ancho.
   · El recorte es doble. El lienzo va DETRÁS de los cuadros, que son opacos, y
     además se RECORTA a los cuadros que existen de verdad. Lo segundo hace
     falta porque la grilla es `auto-fit`: al angostar la ventana envuelve y la
     última fila queda con celdas vacías —medido: `roadmap` tapado al 66%— y
     ahí no hay cuadro que tape nada. Sin el recorte el haz se ve suelto en el
     medio de la nada, que es lo que se veía.
   · Paleta de la marca, oro en las horizontales y verde en las verticales, en
     vez de las seis del original.

   Sin librerías, sin módulos ES: tiene que abrir con `file://`.
   ========================================================================== */

(function () {
  'use strict';

  // Con movimiento reducido no se monta nada: no hay versión quieta de esto que
  // valga la pena, y un lienzo de más por cuadro tampoco.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  // La tira del hero queda afuera: no tiene cuadros opacos que recorten el
  // haz, y el hero manda la escena 3D.
  var GRILLAS  = '.tarjetas, .capacidades:not(.tira)';
  var DURACION = 3.2;          // segundos que tarda un haz en cruzar
  var ORO      = [201, 161, 91];    // el de respaldo, si el CSS no dice nada
  var VERDE    = [74, 158, 146];
  var OP_H     = 0.34;
  var OP_V     = 0.28;

  var cajas = [];
  var enCola = false, corriendo = false, t0 = 0;

  function rgba(c, a) {
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + (a > 0 ? a : 0).toFixed(4) + ')';
  }
  function claro(c, n) {
    return [Math.min(255, c[0] + n), Math.min(255, c[1] + n), Math.min(255, c[2] + n)];
  }
  function suave(t) { return t * t * (3 - 2 * t); }
  function campana(x, s) { return Math.exp(-(x * x) / (2 * s * s)); }

  // Junta una lista de coordenadas casi iguales en una sola: `auto-fit` deja
  // diferencias de fracciones de píxel entre columnas de la misma línea.
  function unicas(vs) {
    vs.sort(function (a, b) { return a - b; });
    var out = [];
    for (var i = 0; i < vs.length; i++) if (!out.length || vs[i] - out[out.length - 1] > 2) out.push(vs[i]);
    return out;
  }

  // Lee "r, g, b" de una propiedad personalizada. Si no hay, devuelve el
  // respaldo: el módulo tiene que seguir dibujando aunque falte el token.
  function deCSS(el, nombre, respaldo) {
    if (typeof getComputedStyle !== 'function') return respaldo;
    var v = getComputedStyle(el).getPropertyValue(nombre);
    var n = v ? v.match(/\d+/g) : null;
    return n && n.length >= 3 ? [+n[0], +n[1], +n[2]] : respaldo;
  }

  function medir(b) {
    // Se mide contra el LIENZO, no contra el contenedor. El lienzo se estira
    // 1 px para afuera (`inset: -1px`) justamente para tapar el borde del
    // módulo: si no, las reglas de arriba y abajo le quedan afuera y no hay
    // dónde dibujar los haces horizontales.
    var r = b.lienzo.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var dpr = Math.min(devicePixelRatio || 1, 2);
    b.w = r.width; b.h = r.height;
    b.lienzo.width  = Math.round(r.width  * dpr);
    b.lienzo.height = Math.round(r.height * dpr);
    b.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Las divisiones: el borde izquierdo de cada cuadro que no esté pegado al
    // borde del contenedor es una junta vertical, y lo mismo con el superior.
    // Se miden en vez de calcularse porque la grilla es `auto-fit`.
    var xs = [], ys = [];
    for (var i = 0; i < b.el.children.length; i++) {
      var h = b.el.children[i];
      if (h === b.lienzo) continue;
      var q = h.getBoundingClientRect();
      if (q.left - r.left > 2) xs.push(q.left - r.left - 0.5);
      if (q.top  - r.top  > 2) ys.push(q.top  - r.top  - 0.5);
    }
    // El color sale del CSS de la grilla, no del JS: así un capítulo claro lo
    // oscurece con una variable y el haz no desaparece sobre el fondo.
    b.oro   = deCSS(b.el, '--haz-h', ORO);
    b.verde = deCSS(b.el, '--haz-v', VERDE);

    b.vert = unicas(xs);
    var filas = unicas(ys);

    // El recorte: los cuadros que hay, inflados 2 px. Con eso entran las juntas
    // de 1 px y las reglas del módulo, y quedan afuera las celdas vacías.
    b.recorte = [];
    for (var k = 0; k < b.el.children.length; k++) {
      var c2 = b.el.children[k];
      if (c2 === b.lienzo) continue;
      var q2 = c2.getBoundingClientRect();
      b.recorte.push([q2.left - r.left - 2, q2.top - r.top - 2, q2.width + 4, q2.height + 4]);
    }

    // Largo del haz: proporcional al paso de la grilla que recorre. Se calcula
    // con las juntas internas, antes de sumarle el marco.
    b.celW = b.w / (b.vert.length + 1);
    b.celH = b.h / (filas.length + 1);

    // Las reglas de arriba y abajo del módulo TAMBIÉN son divisiones, y hay que
    // contarlas: en pantalla ancha cada grilla entra en una sola fila, no hay
    // ninguna junta horizontal, y sin esto no se veía un solo haz horizontal.
    b.horz = [0.5].concat(filas, [b.h - 0.5]);
  }

  // El núcleo del haz: transparente en las puntas, encendido en el medio.
  function nucleo(ctx, x0, y0, x1, y1, c, op, g) {
    var lg = ctx.createLinearGradient(x0, y0, x1, y1);
    lg.addColorStop(0,    'transparent');
    lg.addColorStop(0.12, rgba(c, op * 0.40 * g));
    lg.addColorStop(0.35, rgba(claro(c, 60),  op * 0.80 * g));
    lg.addColorStop(0.5,  rgba(claro(c, 110), op * 1.00 * g));
    lg.addColorStop(0.65, rgba(claro(c, 60),  op * 0.80 * g));
    lg.addColorStop(0.88, rgba(c, op * 0.40 * g));
    lg.addColorStop(1,    'transparent');
    ctx.strokeStyle = lg;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  // El bloom: un círculo achatado contra la línea, que es lo que le da cuerpo.
  function bloom(ctx, x, y, largo, grosor, horizontal, c, op, g) {
    var rg = ctx.createRadialGradient(x, y, 0, x, y, largo);
    rg.addColorStop(0,   rgba(c, op * 0.30 * g));
    rg.addColorStop(0.4, rgba(c, op * 0.12 * g));
    rg.addColorStop(1,   'transparent');
    ctx.save();
    if (horizontal) { ctx.scale(1, grosor / largo); y = y * largo / grosor; }
    else            { ctx.scale(grosor / largo, 1); x = x * largo / grosor; }
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(x, y, largo, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function dibujar(b, t) {
    var ctx = b.ctx, w = b.w, h = b.h;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);

    // Todo lo que sigue va recortado a los cuadros: el haz no puede aparecer
    // donde no hay nada.
    if (!b.recorte || !b.recorte.length) return;
    ctx.save();
    ctx.beginPath();
    for (var k = 0; k < b.recorte.length; k++) {
      ctx.rect(b.recorte[k][0], b.recorte[k][1], b.recorte[k][2], b.recorte[k][3]);
    }
    ctx.clip();

    // Entrada suave la primera vez que el cuadro aparece.
    var g = suave(Math.min(1, (t - b.desde) / 0.8));
    if (g <= 0) return;

    var celW = b.celW, celH = b.celH;
    // Respiración: el haz se alarga y se acorta, nunca del todo igual.
    var br = 0.85 + 0.3 * Math.sin(t * 1.4 + b.fase * 6.3) + 0.1 * Math.sin(t * 2.3);

    var hx = [], vy = [];

    for (var r = 0; r < b.horz.length; r++) {
      var y = b.horz[r];
      var vel = 1 + (r % 3) * 0.12;
      var av = ((t * vel) / DURACION + r * 0.21 + b.fase) % 1;
      var x = av * w;
      hx.push(x);
      bloom(ctx, x, y, celW * 0.6 * br, 4, true, b.oro, OP_H, g);
      nucleo(ctx, x - celW * 0.55 * br, y, x + celW * 0.55 * br, y, b.oro, OP_H, g);
    }

    for (var c = 0; c < b.vert.length; c++) {
      var x2 = b.vert[c];
      var vel2 = 1 + (c % 3) * 0.1;
      var av2 = ((t * vel2) / (DURACION * 1.2) + c * 0.26 + b.fase) % 1;
      var y2 = av2 * h;
      vy.push(y2);
      bloom(ctx, x2, y2, celH * 0.6 * br, 4, false, b.verde, OP_V, g);
      nucleo(ctx, x2, y2 - celH * 0.55 * br, x2, y2 + celH * 0.55 * br, b.verde, OP_V, g);
    }

    // El destello: solo cuando un haz horizontal y uno vertical llegan juntos
    // a la misma intersección. Es el detalle que hace que la grilla se lea.
    for (var i = 0; i < hx.length; i++) {
      for (var j = 0; j < vy.length; j++) {
        var ix = b.vert[j], iy = b.horz[i];
        var prox = campana((hx[i] - ix) / celW, 0.25) * campana((vy[j] - iy) / celH, 0.25);
        if (prox <= 0.05) continue;

        var mezcla = [(b.oro[0] + b.verde[0]) / 2 | 0, (b.oro[1] + b.verde[1]) / 2 | 0, (b.oro[2] + b.verde[2]) / 2 | 0];
        var rad = 3.5 * Math.sqrt(prox), op = prox * 0.6 * g;
        var fg = ctx.createRadialGradient(ix, iy, 0, ix, iy, rad);
        fg.addColorStop(0,   rgba(claro(mezcla, 140), op));
        fg.addColorStop(0.5, rgba(mezcla, op * 0.4));
        fg.addColorStop(1,   'transparent');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(ix, iy, rad, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();
  }

  function cuadro(ahora) {
    enCola = false;
    if (document.hidden) { corriendo = false; return; }

    var t = (ahora - t0) / 1000;
    var vivos = 0;
    for (var i = 0; i < cajas.length; i++) {
      if (!cajas[i].visible) continue;
      vivos++;
      dibujar(cajas[i], t);
    }

    // Sin cuadros en pantalla el bucle se apaga solo.
    if (vivos) pedir(); else corriendo = false;
  }

  // Guarda de bucle único, la misma que usa la escena.
  function pedir() {
    if (enCola || document.hidden) return;
    enCola = true; corriendo = true;
    requestAnimationFrame(cuadro);
  }

  function montar() {
    var els = document.querySelectorAll(GRILLAS);
    if (!els.length) return;
    t0 = performance.now();

    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var lienzo = document.createElement('canvas');
      lienzo.className = 'haz';
      lienzo.setAttribute('aria-hidden', 'true');
      var ctx = lienzo.getContext('2d');
      if (!ctx) return;
      // ANTES de los cuadros: el lienzo está fuera de flujo —posicionado, así
      // que la grilla ni lo cuenta como celda— pero igual es un hijo, y varias
      // reglas del sitio se cuelgan de la posición (`a:last-child`). Primero es
      // el único lugar que no le cambia el turno a nadie.
      el.insertBefore(lienzo, el.firstChild);
      cajas.push({
        el: el, lienzo: lienzo, ctx: ctx, w: 0, h: 0,
        vert: [], horz: [], recorte: [], celW: 0, celH: 0,
        oro: ORO, verde: VERDE,
        visible: false, desde: 0,
        // Desfase por grilla: sin esto todas laten al mismo tiempo.
        fase: (i * 0.37) % 1
      });
    }

    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function (es) {
        es.forEach(function (e) {
          for (var k = 0; k < cajas.length; k++) if (cajas[k].el === e.target) medir(cajas[k]);
        });
      });
      cajas.forEach(function (b) { ro.observe(b.el); });
    } else {
      addEventListener('resize', function () { cajas.forEach(medir); }, { passive: true });
    }
    cajas.forEach(medir);

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          for (var k = 0; k < cajas.length; k++) {
            if (cajas[k].el !== e.target) continue;
            if (e.isIntersecting && !cajas[k].visible) {
              medir(cajas[k]);
              cajas[k].desde = (performance.now() - t0) / 1000;   // reinicia la entrada
            }
            cajas[k].visible = e.isIntersecting;
          }
        });
        if (!corriendo) pedir();
      }, { rootMargin: '120px 0px' });
      cajas.forEach(function (b) { io.observe(b.el); });
    } else {
      cajas.forEach(function (b) { b.visible = true; });
      pedir();
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !corriendo) pedir();
    });
  }

  montar();
  window.haces = { cajas: cajas, pedir: pedir, dibujar: dibujar };
})();
