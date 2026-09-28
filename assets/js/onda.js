/* =============================================================================
   NORTIQA — la onda de fondo de Roadmap
   -----------------------------------------------------------------------------
   Port del pen de yukiloz7 (codepen.io/yukiloz7/pen/yLgYpWM), que es un solo
   fragment shader: una onda seno con resplandor —`0.05 / abs(...)` es la
   caída— y aberración cromática que se abre hacia los bordes.

   Dos cambios, y los dos salen de que la sección es CLARA:

   1. El original SUMA luz sobre negro. Acá el lienzo es transparente y el
      resplandor sale como ALFA, así que la onda oscurece el fondo del capítulo
      en vez de iluminarlo. Es la única forma de que funcione sobre claro sin
      dar vuelta la sección.

   2. Intensidad muy baja, y a propósito: es un detalle de fondo que sugiere
      movimiento, no un gráfico. Se ajusta desde el CSS con `--onda-techo`.

   Los colores y las constantes son los del original, sin tocar.

   Arranca cuando la sección entra en pantalla y para cuando sale, igual que el
   tablero. Con `prefers-reduced-motion` dibuja UN cuadro y se queda quieta: la
   onda sigue estando, deja de moverse.
   ========================================================================== */

(function () {
  'use strict';

  var lienzo = document.getElementById('onda');
  if (!lienzo) return;

  var gl = lienzo.getContext('webgl', { alpha: true, premultipliedAlpha: false,
                                        antialias: false, depth: false });
  if (!gl) { lienzo.style.display = 'none'; return; }

  var VS = 'attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }';

  // El shader del pen, TAL CUAL, con sus constantes reales:
  //   xScale 1.0 · yScale 0.5 · distortion 0.050 · time += 0.01 por cuadro
  //
  // Ese 0.050 es lo que hace que funcione. Las tres muestras se toman en x
  // apenas distintas —y la del medio, `gx`, sin distorsión— así que en el
  // centro coinciden y sólo se abren hacia los bordes: eso es la aberración.
  // Con un valor grande caen en fases distintas y salen ondas separadas, que
  // es otro efecto.
  var FS = [
    'precision highp float;',
    'uniform vec2  uRes;',
    'uniform float uT;',
    'uniform float uTecho;',
    'void main() {',
    '  vec2 p = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);',
    '',
    '  float d = length(p) * 0.050;',
    '  float rx = p.x * (1.0 + d);',
    '  float gx = p.x;',
    '  float bx = p.x * (1.0 - d);',
    '',
    '  float r = 0.05 / abs(p.y + sin((rx + uT) * 1.0) * 0.5);',
    '  float g = 0.05 / abs(p.y + sin((gx + uT) * 1.0) * 0.5);',
    '  float b = 0.05 / abs(p.y + sin((bx + uT) * 1.0) * 0.5);',
    '',
    '  // Lo único que cambia respecto del original, y no por gusto: el pen',
    '  // SUMA luz sobre negro. Acá el fondo es claro, así que el color va tal',
    '  // cual y la intensidad sale por ALFA. El hombro evita que el núcleo,',
    '  // donde la división tiende a infinito, quede opaco de un pixel.',
    '  vec3 col = vec3(r, g, b);',
    '  float m = max(max(r, g), b);',
    '  float alfa = m / (1.0 + m) * uTecho;',
    '  gl_FragColor = vec4(col / max(m, 1e-4), alfa);',
    '}'
  ].join('\n');

  function compilar(tipo, src) {
    var s = gl.createShader(tipo);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('[onda] ' + gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }
  var v = compilar(gl.VERTEX_SHADER, VS), f = compilar(gl.FRAGMENT_SHADER, FS);
  if (!v || !f) { lienzo.style.display = 'none'; return; }
  var prog = gl.createProgram();
  gl.attachShader(prog, v); gl.attachShader(prog, f); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { lienzo.style.display = 'none'; return; }
  gl.useProgram(prog);

  var buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  var ap = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(ap);
  gl.vertexAttribPointer(ap, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, 'uRes'),
      uT   = gl.getUniformLocation(prog, 'uT'),
      uTch = gl.getUniformLocation(prog, 'uTecho');

  // Los colores y la intensidad salen del CSS, como en `tablero.js` y `haz.js`:
  // así se ajustan sin tocar el JavaScript.
  function deCSS(prop, reserva) {
    var x = getComputedStyle(lienzo).getPropertyValue(prop).trim();
    return x || reserva;
  }

  var ancho = 0, alto = 0;
  function medir() {
    var dpr = Math.min(devicePixelRatio || 1, 1.5);   // basta: es un degradado
    var r = lienzo.getBoundingClientRect();
    ancho = Math.max(1, Math.round(r.width  * dpr));
    alto  = Math.max(1, Math.round(r.height * dpr));
    lienzo.width = ancho; lienzo.height = alto;
    gl.viewport(0, 0, ancho, alto);
    gl.uniform1f(uTch, parseFloat(deCSS('--onda-techo', '0.30')) || 0.30);
    gl.uniform2f(uRes, ancho, alto);
  }

  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var corriendo = false, enCola = false, t0 = performance.now();

  function pintar(t) {
    gl.uniform1f(uT, t);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function cuadro(ahora) {
    enCola = false;
    if (!corriendo || document.hidden) return;
    pintar((ahora - t0) / 1000 * 0.6);
    pedir();
  }
  // Guarda de bucle único, la misma disciplina que el resto del sitio.
  function pedir() {
    if (enCola || !corriendo || document.hidden) return;
    enCola = true;
    requestAnimationFrame(cuadro);
  }

  addEventListener('resize', function () { medir(); if (!corriendo) pintar(0); }, { passive: true });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) pedir(); });

  medir();
  pintar(0);

  if (reduce || !('IntersectionObserver' in window)) return;   // queda quieta

  new IntersectionObserver(function (e) {
    for (var i = 0; i < e.length; i++) {
      corriendo = e[i].isIntersecting;
      if (corriendo) pedir();
    }
  }, { threshold: 0.02 }).observe(lienzo);

  window.onda = { corriendo: function () { return corriendo; } };
})();
