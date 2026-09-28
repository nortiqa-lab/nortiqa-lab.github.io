/* =============================================================================
   NORTIQA — el monolito
   -----------------------------------------------------------------------------
   El isotipo de la marca son nueve módulos con uno activado. Acá esos nueve
   módulos son columnas de piedra sobre un plano de agua, y la activación se
   propaga entre ellas: el logotipo convertido en un sistema vivo.

   Raymarching de SDFs con reflexión de un rebote sobre el plano, ondas,
   niebla volumétrica y resplandor emisivo. Un solo fragment shader, sin
   librerías. La única fuente de luz de la escena es el oro de la marca.
   ========================================================================== */

function montarEscena(lienzo, alListo) {
  const gl = lienzo.getContext('webgl2', { antialias: false, alpha: false, depth: false })
          || lienzo.getContext('webgl',  { antialias: false, alpha: false, depth: false });
  if (!gl) { alListo(false); return null; }

  const es3 = typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext;
  // Derivadas: núcleo en WebGL 2, extensión en WebGL 1. Las usa el antialias
  // del relieve de las piezas.
  if (!es3) gl.getExtension('OES_standard_derivatives');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------------------------------------------------------------
  // Cámara: UNA sola definición. Los valores se inyectan en el GLSL y los
  // usa también el raycast del cursor. Tenerla escrita dos veces era un bug
  // esperando: si se desincronizan, el hover apunta a la celda equivocada.
  // ---------------------------------------------------------------------
  const CAM = {
    radio:  5.5,      // distancia al centro: más cerca = piezas grandes
    altura: 4.0,      // alto de cámara → mantiene el picado de ~36°
    objY:   0.15,     // hacia dónde mira
    giro:   0.62,     // rotación base de la grilla
    desX:   0.05,     // desplazamiento horizontal del encuadre
    desY:   0.05,     // vertical: + baja la grilla en el encuadre
    fov:    1.55,
  };
  const F = (n) => CAM[n].toFixed(4);

  const VS = es3 ? `#version 300 es
  in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`
  : `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

  const FS = `${es3 ? '#version 300 es' : '#extension GL_OES_standard_derivatives : enable'}
precision highp float;
${es3 ? 'out vec4 salida;' : ''}

uniform vec2  uRes;
uniform float uT;
uniform vec2  uFoco;        // celda que se enciende
uniform float uActivo;      // su nivel 0→1
uniform vec2  uFocoAnt;     // celda que se apaga
uniform float uActivoAnt;   // su nivel, bajando
uniform float uAlturas[25]; // altura de cada losa de la grilla 5x5
uniform vec2  uRaton;
uniform float uScroll;      // 0 en el hero, 1 al salir de él
uniform float uEntrada;     // 0→1 al aparecer: la escena se revela
uniform vec3  uHazA;        // cola del haz que recorre los pasillos
uniform vec3  uHazB;        // su cabeza
uniform float uHazNivel;    // 0 apagado, 1 a pleno

const vec3  ORO    = vec3(0.788, 0.631, 0.357);   // #C9A15B
const vec3  VERDE  = vec3(0.051, 0.169, 0.149);   // #0D2B26
const vec3  ABISMO = vec3(0.016, 0.055, 0.047);
const float PASO   = 1.25;                        // separación entre piezas
const float LADO   = 2.0;    // celdas desde el centro: 5x5 como el manual

/* --- Distancias -------------------------------------------------------- */

float sdCaja(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

// Grilla infinita por repetición de dominio: se calcula la celda más
// cercana con aritmética modular, así que cuesta UNA caja en vez de nueve.
// Eso permite el campo grande del manual de marca sin pagarlo en GPU.
// Altura por tabla en vez de hash con sin(): son solo 25 losas y hay que
// consultarlas varias veces por paso de marcha. Un sin() ahí adentro se paga
// caro; un índice, no.
float alturaDe(vec2 id) {
  int k = int((id.y + 2.0) * 5.0 + (id.x + 2.0));
  return uAlturas[k];
}

vec3 mapa(vec3 p) {
  // El punto cae entre cuatro centros de celda. Hay que evaluar los cuatro:
  // con alturas distintas, la losa más cercana NO es siempre la de la celda
  // más cercana, y quedarse con una sola sobreestima la distancia. El rayo
  // entonces da un paso de más y atraviesa la pieza: ese era el recorte.
  vec2 base = floor(p.xz / PASO);

  float d = 1e9;
  float ac = 0.0;

  for (int j = 0; j <= 1; j++) {
    for (int i = 0; i <= 1; i++) {
      vec2 id = base + vec2(float(i), float(j));
      if (abs(id.x) > LADO || abs(id.y) > LADO) continue;

      float a = 0.0;
      if (abs(id.x - uFoco.x)    + abs(id.y - uFoco.y)    < 0.01) a = uActivo;
      if (abs(id.x - uFocoAnt.x) + abs(id.y - uFocoAnt.y) < 0.01) a = max(a, uActivoAnt);

      float alto = alturaDe(id) + a * 0.62;
      vec3 q = vec3(p.x - id.x * PASO, p.y - alto * 0.5, p.z - id.y * PASO);
      float dd = sdCaja(q, vec3(0.52, alto * 0.5, 0.52) - 0.035) - 0.035;

      if (dd < d) { d = dd; ac = a; }
    }
  }

  // Fuera de la grilla: cota segura hacia su borde.
  if (d > 1e8) {
    vec2 fuera = abs(base + 0.5) - LADO;
    return vec3(max(max(fuera.x, fuera.y) * PASO, 0.06), 0.0, 0.0);
  }
  return vec3(d, 0.0, ac);
}

vec3 normal(vec3 p) {
  const vec2 k = vec2(1.0, -1.0);
  const float e = 0.0016;
  return normalize(k.xyy * mapa(p + k.xyy * e).x +
                   k.yyx * mapa(p + k.yyx * e).x +
                   k.yxy * mapa(p + k.yxy * e).x +
                   k.xxx * mapa(p + k.xxx * e).x);
}

/* --- Ondas del plano ---------------------------------------------------- */

// El plano ya no ondula. La ondulación distorsionaba los reflejos en la
// base de las piezas y se leía como si las losas se deformaran. Queda una
// superficie pulida y quieta: conserva la profundidad, sin temblor.
vec3 normalPlano(vec2 q) {
  return vec3(0.0, 1.0, 0.0);
}

/* --- El haz de los pasillos --------------------------------------------- */

// Acercamiento entre el RAYO DE CÁMARA y el segmento del haz: devuelve la
// distancia mínima, dónde ocurre sobre el rayo (tr) y en qué punto del
// segmento (sr, 0 en la cola y 1 en la cabeza).
//
// Por qué acá y no adentro del bucle de marcha, que era lo obvio: el bucle
// avanza pasos de largo VARIABLE —t += h.x * 0.88, la distancia al SDF—, y
// en un pasillo abierto esos pasos son grandes. Un haz de seis centímetros de
// radio se saltea entre dos muestras y titila. El halo de los módulos tolera
// ese muestreo porque es ancho; este no. Resuelto en forma cerrada es exacto,
// no parpadea, y además cuesta MENOS: una vez por píxel en lugar de una por
// paso.
float acercamiento(vec3 ro, vec3 rd, vec3 a, vec3 b, out float tr, out float sr) {
  vec3 ba = b - a;
  vec3 oa = ro - a;
  float C = dot(ba, ba);
  float B = dot(rd, ba);
  float D = dot(rd, oa);
  float E = dot(ba, oa);
  float den = C - B * B;              // rd viene normalizado: dot(rd,rd) = 1
  // (E - B*D), NO (B*D - E). Con el signo al revés sc sale negativo donde
  // debería ser positivo, se recorta a 0, y como el brillo del haz es
  // pow(sr, 1.6) el haz queda con brillo NULO en toda la pantalla. Lo
  // comprueba prueba-haz3d.mjs contra fuerza bruta.
  float sc = den > 1e-5 ? (E - B * D) / den : 0.0;
  sr = clamp(sc, 0.0, 1.0);
  vec3 q = a + ba * sr;               // punto del haz, ya acotado al segmento
  tr = dot(q - ro, rd);               // y su proyección sobre el rayo
  if (tr < 0.0) {
    // El acercamiento cae DETRÁS de la cámara. Recortar tr a cero no alcanza:
    // con el rayo fijo en su origen, el punto más cercano del segmento ya no
    // es el de antes y hay que reproyectar. Sin esto la distancia sale de más
    // —da igual para el brillo, porque el haz no se ve— pero deja la función
    // mintiendo, y una función que miente en un caso termina usándose en otro.
    tr = 0.0;
    sr = clamp(E / C, 0.0, 1.0);
    q  = a + ba * sr;
  }
  return length(ro + rd * tr - q);
}

/* --- Trazado ------------------------------------------------------------ */

// Recorre la escena y acumula el resplandor de los módulos emisivos.
vec4 trazar(vec3 ro, vec3 rd, int pasos, out float niebla) {
  float t = 0.0;
  float halo = 0.0;
  vec3  h = vec3(-1.0);

  for (int i = 0; i < 46; i++) {
    if (i >= pasos) break;
    vec3 p = ro + rd * t;
    h = mapa(p);
    // El resplandor se acumula al pasar cerca de un módulo activo.
    halo += h.z * 0.055 / (1.0 + h.x * h.x * 20.0);
    if (h.x < 0.0016 || t > 42.0) break;
    // Subrelajación: con SDFs que pueden sobreestimar, avanzar el 100%
    // de la distancia es lo que produce los cortes en los bordes.
    t += h.x * 0.88;
  }

  niebla = t;
  if (t > 42.0) return vec4(0.0, 0.0, 0.0, halo);

  vec3 p = ro + rd * t;
  vec3 n = normal(p);
  float a = h.z;

  // Superficie: piedra verde muy oscura, con borde iluminado por el oro.
  float rim   = pow(1.0 - max(dot(n, -rd), 0.0), 2.6);
  float arriba = max(n.y, 0.0);

  vec3 col = VERDE * (0.26 + arriba * 0.34);
  col += ORO * rim * (0.14 + a * 0.75);
  col += ORO * a * (2.00 + arriba * 0.7);        // emisión propia
  col += ORO * 0.04 * arriba;                     // rebote ambiente cálido

  return vec4(col, halo);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;

  // Cámara: deriva lenta, más el desplazamiento suave del puntero.
  // El manual de marca mira el campo desde arriba, con las piezas planas
  // sobre el plano. Los valores vienen de CAM, en JS: una sola fuente.
  float t = uT * 0.05;
  float orbita = ${F('giro')} + sin(t) * 0.10 + uRaton.x * 0.14;
  float altura = ${F('altura')} + sin(t * 0.7) * 0.20 - uRaton.y * 0.7;

  vec3 ro = vec3(sin(orbita) * ${F('radio')}, altura, cos(orbita) * ${F('radio')});
  vec3 obj = vec3(0.0, ${F('objY')}, 0.0);

  vec3 f = normalize(obj - ro);
  vec3 r = normalize(cross(vec3(0.0, 1.0, 0.0), f));
  vec3 u = cross(f, r);
  vec3 rd = normalize((uv.x + ${F('desX')}) * r + (uv.y + ${F('desY')}) * u + f * ${F('fov')});

  vec3 col = ABISMO * (0.55 + 0.45 * smoothstep(0.55, -0.25, uv.y));
  float halo = 0.0;

  // ¿El rayo toca el plano de agua antes que la geometría?
  float tPlano = (ro.y > 0.0 && rd.y < 0.0) ? -ro.y / rd.y : -1.0;

  float niebla;
  vec4 dir = trazar(ro, rd, 42, niebla);

  bool tocaPlano = tPlano > 0.0 && (niebla > 41.0 || tPlano < niebla);

  // Más allá de cierta distancia la niebla se come el reflejo: no se calcula.
  if (tocaPlano && tPlano < 26.0) {
    vec3 pp = ro + rd * tPlano;
    vec3 nn = normalPlano(pp.xz);

    // Reflexión de un rebote: la escena devuelta por el agua.
    vec3 rr = reflect(rd, nn);
    float nieblaR;
    vec4 refl = trazar(pp + rr * 0.06, rr, 15, nieblaR);

    float fres = pow(1.0 - max(dot(-rd, nn), 0.0), 3.0);
    vec3 plano = ABISMO * 0.62;
    // Reflectividad base alta: en picado el Fresnel casi no aporta, así que
    // sin esto el plano se ve mate y se pierde toda la profundidad.
    plano += (refl.rgb + ORO * refl.a * 0.55) * (0.38 + fres * 0.52);

    // Un lustre suave y quieto en lugar del destello que se movía.
    float esp = pow(max(dot(rr, normalize(vec3(0.20, 0.50, -1.0))), 0.0), 10.0);
    plano += ORO * esp * 0.16;

    float distP = length(pp - ro);
    col = mix(col, plano, exp(-distP * 0.032));
    halo += refl.a * 0.5;
  }

  if (niebla < 41.0) {
    col = mix(col, dir.rgb, exp(-niebla * 0.030));
  }
  halo += dir.a;

  // EL HAZ. Se suma al mismo acumulador que el resplandor de los módulos, así
  // que sale del mismo oro y participa de la misma niebla: es una luz más de
  // la escena, no una capa pegada encima.
  if (uHazNivel > 0.0) {
    float tHaz, sHaz;
    float dHaz = acercamiento(ro, rd, uHazA, uHazB, tHaz, sHaz);

    // Oclusión. Lo que tapa al haz es lo primero que el rayo haya tocado: una
    // losa (niebla) o el plano (tPlano). Si el acercamiento cae detrás de
    // eso, el haz está del otro lado de la pared y no se ve. El smoothstep
    // en vez de un corte evita el borde duro justo en la arista de la losa.
    float tope = niebla < 41.0 ? niebla : 1e9;
    if (tocaPlano) tope = min(tope, tPlano);
    float visible = smoothstep(0.0, 0.22, tope - tHaz);

    // Perfil: la cabeza brilla y la cola se apaga.
    float perfil = pow(sHaz, 1.6);
    // El 140 es el grosor: la caída llega a la mitad a 0,070 del eje. Venía de
    // 260 —0,052—, que al escalar el lienzo a 0,42 de lo nativo dejaba una
    // línea de cinco píxeles y se perdía en el reescalado.
    float brillo = exp(-dHaz * dHaz * 140.0) * perfil * visible * uHazNivel;

    halo += brillo * exp(-tHaz * 0.030) * 1.35;
  }

  // Resplandor volumétrico del oro.
  col += ORO * halo * 0.80;

  // Viñeta y desvanecido al salir del hero.
  col *= 1.0 - 0.55 * pow(length(uv * vec2(0.72, 1.0)), 2.0);
  col *= uEntrada;
  col *= 1.0 - uScroll * 0.97;

  // Curva de respuesta y grano fino: evita el bandeado en degradados oscuros.
  col = pow(max(col, 0.0), vec3(0.4545));
  float grano = fract(sin(dot(gl_FragCoord.xy, vec2(12.99, 78.23))) * 43758.55);
  col += (grano - 0.5) * 0.016;

  ${es3 ? 'salida' : 'gl_FragColor'} = vec4(col, 1.0);
}`;

  /* --- Compilación ------------------------------------------------------ */

  function sh(tipo, src) {
    const s = gl.createShader(tipo);
    gl.shaderSource(s, src.trim());
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  function fallar(motivo) {
    // Una falla de shader debe verse como el degradado de marca, nunca como
    // una pantalla negra: el fallback existe, hay que activarlo.
    console.error('[escena] ' + motivo);
    document.body.classList.add('sin-webgl');
    alListo(false);
    return null;
  }

  const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
  if (!vs || !fs) return fallar('el shader no compiló');

  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(prog));
    return fallar('el programa no enlazó');
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const p = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(p);
  gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);

  const U = n => gl.getUniformLocation(prog, n);
  const uRes = U('uRes'), uT = U('uT'), uRaton = U('uRaton'),
        uScroll = U('uScroll'), uEntrada = U('uEntrada');
  const uFoco = U('uFoco'), uActivo = U('uActivo'),
        uFocoAnt = U('uFocoAnt'), uActivoAnt = U('uActivoAnt');
  const uHazA = U('uHazA'), uHazB = U('uHazB'), uHazNivel = U('uHazNivel');

  // Alturas de las 25 losas: fijas y deterministas, no al azar, para que el
  // relieve del campo sea siempre el mismo — es parte del diseño, no ruido.
  const ALTURAS = new Float32Array(25);
  for (let z = 0; z < 5; z++) {
    for (let x = 0; x < 5; x++) {
      const n = Math.sin((x + 1) * 12.9898 + (z + 1) * 78.233) * 43758.5453;
      ALTURAS[z * 5 + x] = 0.17 + (n - Math.floor(n)) * 0.13;
    }
  }
  for (let i = 0; i < 25; i++) gl.uniform1f(U(`uAlturas[${i}]`), ALTURAS[i]);

  /* --- Activación: una pieza encendida que camina por el campo ---------- */

  const LADO = 2;             // 5x5: celdas de -2 a 2
  let foco = [1, -1];         // celda que se enciende
  let focoAnt = [9, 9];       // la que se está apagando (fuera de la grilla)
  let acti = 0, actiAnt = 0, actiAnt0 = 0;
  let fase = 1;               // 0→1: progreso de la transición
  let duracion = 0.5;         // segundos que tarda el cruce

  // Ease in/out clásico: arranca y termina suave, sin tirones.
  const suave = (f) => f * f * (3 - 2 * f);

  function moverA(celda, seg) {
    if (celda[0] === foco[0] && celda[1] === foco[1]) return;
    focoAnt = foco;                  // la anterior empieza a apagarse
    actiAnt0 = acti;
    foco = celda;
    fase = 0;
    duracion = seg;
  }

  function saltar() {
    // Camina a una celda vecina: la capacidad se propaga por la estructura,
    // no aparece en cualquier lado. Rebota en los bordes de la grilla.
    for (let intento = 0; intento < 8; intento++) {
      const dir = [[1,0], [-1,0], [0,1], [0,-1]][(Math.random() * 4) | 0];
      const n = [foco[0] + dir[0], foco[1] + dir[1]];
      if (Math.abs(n[0]) <= LADO && Math.abs(n[1]) <= LADO) { moverA(n, 0.55); return; }
    }
  }

  /* --- El haz que recorre los pasillos ---------------------------------- */

  // Los pasillos no hay que buscarlos: salen de la aritmética de la grilla.
  // Con PASO 1,25 y losas de 1,04 de ancho, el hueco mide 0,21 y su eje está
  // en (i + 0,5) · PASO. Para LADO = 2 eso da cuatro carriles por eje:
  // ±1,875 y ±0,625.
  const HAZ_PASO  = 1.25;   // tiene que coincidir con PASO del shader
  // ALTURA. Estuvo en 0,12, bien metida en el cañón, y no se veía NADA. La
  // razón es geométrica: la cámara mira con 35° de picado y para ver el piso
  // de un pasillo hace falta que su ancho supere alto / tan(35°) = 0,23 / 0,70
  // = 0,33. El pasillo mide 0,21. Está tapado por sus propias paredes desde
  // ese ángulo, salvo en los que corren casi paralelos a la vista.
  // Las losas van de 0,174 a 0,292, así que 0,30 es lo mínimo que despeja a
  // todas. El haz roza las tapas y sigue corriendo exactamente sobre el eje
  // del pasillo: en planta dibuja las divisiones del campo.
  const HAZ_Y     = 0.30;
  const HAZ_LARGO = 0.9;    // de la cola a la cabeza
  const HAZ_EXT   = LADO * HAZ_PASO + 0.9;   // entra y sale fuera del campo

  let hazEje = 0, hazCarril = 0.625, hazDir = 1;
  let hazFase = 0, hazDur = 2.6, hazNivel = 0;
  const hazCab = [0, HAZ_Y, 0], hazCol = [0, HAZ_Y, 0];

  function nuevoHaz() {
    hazEje    = Math.random() < 0.5 ? 0 : 1;
    hazCarril = (((Math.random() * (LADO * 2)) | 0) - LADO + 0.5) * HAZ_PASO;
    hazDir    = Math.random() < 0.5 ? 1 : -1;
    hazFase   = 0;
    hazDur    = 2.2 + Math.random() * 1.4;
  }
  nuevoHaz();

  function moverHaz(dt) {
    // La fase pasa de 0 a 1 recorriendo el pasillo, y sigue hasta 1,3: ese
    // tramo de más es la pausa apagado entre un pasaje y el siguiente.
    hazFase += dt / 1000 / hazDur;
    if (hazFase >= 1.3) nuevoHaz();

    const u = Math.min(1, hazFase);
    const avance = (-HAZ_EXT + 2 * HAZ_EXT * u) * hazDir;
    // Entra y sale con rampa: sin esto el haz aparece y desaparece de golpe
    // en el borde del campo.
    hazNivel = hazFase > 1 ? 0 : Math.min(1, Math.min(u, 1 - u) / 0.14);

    const largo = HAZ_LARGO * hazDir;
    if (hazEje === 0) {
      hazCab[0] = avance;          hazCab[2] = hazCarril;
      hazCol[0] = avance - largo;  hazCol[2] = hazCarril;
    } else {
      hazCab[0] = hazCarril;       hazCab[2] = avance;
      hazCol[0] = hazCarril;       hazCol[2] = avance - largo;
    }
  }

  /* --- Bucle ------------------------------------------------------------ */

  let ancho = 0, alto = 0, escala = 0.42;
  let raton = [0, 0], ratonObj = [0, 0];
  let scroll = 0, entrada = 0, t0 = performance.now();
  let ultimaProp = 0, activo = true, primerCuadro = true, cuadros = 0;
  let ultimoHover = 0;                   // cuándo tocó el cursor una pieza
  let calidad = 1.0;                     // recorte sobre la escala base (solo baja)
  let fps = 60, ultimo = t0;
  const tiempos = new Float32Array(30).fill(16.7);
  let tPtr = 0;

  const PRESUPUESTO = 620000;   // píxeles por cuadro que la escena puede permitirse

  function medir() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const r = lienzo.getBoundingClientRect();

    // La escala base sale del presupuesto: una proporción fija castiga a las
    // pantallas grandes (0.42 en un 4K es cuatro veces el trabajo que en un
    // portátil). `calidad` es el recorte que aplica el controlador.
    const base = Math.sqrt(PRESUPUESTO / Math.max(1, r.width * dpr * r.height * dpr));
    escala = Math.min(0.85, base) * calidad;

    ancho = Math.max(1, Math.round(r.width  * dpr * escala));
    alto  = Math.max(1, Math.round(r.height * dpr * escala));
    lienzo.width = ancho; lienzo.height = alto;
    gl.viewport(0, 0, ancho, alto);
    gl.uniform2f(uRes, ancho, alto);
  }
  medir();
  addEventListener('resize', medir, { passive: true });

  /* --- Cursor sobre las piezas -----------------------------------------
     Para saber qué celda está bajo el puntero hay que replicar en JS la
     misma cámara que arma el shader y proyectar el rayo sobre el plano.
     Es la única forma: la geometría vive en la GPU, no en el DOM.
     -------------------------------------------------------------------- */

  const PASO_JS = 1.25;        // debe coincidir con PASO del shader
  const PLANO   = 0.24;        // altura media de las losas

  function celdaBajoCursor(clientX, clientY) {
    const r = lienzo.getBoundingClientRect();
    if (!r.width || !r.height) return null;

    // uv igual que en el shader: dividido por la altura, con y hacia arriba.
    const aspecto = r.width / r.height;
    const uvx = ((clientX - r.left) / r.width - 0.5) * aspecto;
    const uvy = 0.5 - (clientY - r.top) / r.height;

    const t = (performance.now() - t0) / 1000 * 0.05;
    const orbita = CAM.giro + Math.sin(t) * 0.10 + raton[0] * 0.14;
    const altura = CAM.altura + Math.sin(t * 0.7) * 0.20 - raton[1] * 0.7;

    const ro = [Math.sin(orbita) * CAM.radio, altura, Math.cos(orbita) * CAM.radio];
    const obj = [0, CAM.objY, 0];

    const nor = (v) => { const l = Math.hypot(v[0], v[1], v[2]); return [v[0]/l, v[1]/l, v[2]/l]; };
    const cru = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];

    const f = nor([obj[0]-ro[0], obj[1]-ro[1], obj[2]-ro[2]]);
    const rr = nor(cru([0, 1, 0], f));
    const uu = cru(f, rr);

    const vx = uvx + CAM.desX;      // mismos desplazamientos que el shader
    const vy = uvy + CAM.desY;
    const rd = nor([
      vx*rr[0] + vy*uu[0] + CAM.fov*f[0],
      vx*rr[1] + vy*uu[1] + CAM.fov*f[1],
      vx*rr[2] + vy*uu[2] + CAM.fov*f[2],
    ]);

    if (rd[1] >= -1e-4) return null;                 // el rayo no baja
    const tp = (PLANO - ro[1]) / rd[1];
    if (tp <= 0) return null;

    const x = Math.floor((ro[0] + rd[0] * tp) / PASO_JS + 0.5);
    const z = Math.floor((ro[2] + rd[2] * tp) / PASO_JS + 0.5);
    if (Math.abs(x) > LADO || Math.abs(z) > LADO) return null;
    return [x, z];
  }

  if (!reduce) {
    addEventListener('pointermove', (e) => {
      ratonObj[0] = (e.clientX / innerWidth) * 2 - 1;
      ratonObj[1] = (e.clientY / innerHeight) * 2 - 1;

      const c = celdaBajoCursor(e.clientX, e.clientY);
      if (c) {
        moverA(c, 0.26);           // más corta que el paseo: debe sentirse inmediata
        ultimoHover = performance.now();
      }
    }, { passive: true });

    // Al salir de la ventana, la grilla retoma su vida por su cuenta.
    addEventListener('pointerleave', () => { ultimoHover = 0; }, { passive: true });
  }

  // Un solo bucle de render, siempre. `enCola` impide que dos pedidos
  // simultáneos creen dos bucles que se auto-reencolan por separado: era
  // la causa de que la página se fuera empastando con cada scroll.
  let enCola = false;
  let dibujos = 0, dps = 0, ventana = 0;

  function pedirCuadro() {
    if (enCola || !activo || document.hidden || reduce) return;
    enCola = true;
    requestAnimationFrame(cuadro);
  }

  const api = {
    setScroll(v) { scroll = v; },
    get fps() { return fps; },
    get foco() { return Math.abs(foco[0]) + Math.abs(foco[1]); },
    get focoCelda() { return foco.slice(); },
    get escala() { return escala; },
    get calidad() { return calidad; },
    get dps() { return dps; },
    get pixeles() { return ancho * alto; },
    pausar(v) {
      const querido = !v;
      if (querido === activo) return;      // sin cambio de estado, sin trabajo
      activo = querido;
      if (activo) { ultimo = performance.now(); pedirCuadro(); }
    }
  };

  function cuadro(ahora) {
    // Se libera la reserva apenas entra el cuadro: sin esto, `pedirCuadro`
    // vuelve siempre temprano y el bucle muere tras el primer dibujo.
    enCola = false;
    if (!activo || document.hidden) return;

    const dt = Math.min(ahora - ultimo, 120) || 16;
    ultimo = ahora;

    // Mediana de los últimos 30 cuadros: un pico aislado no mueve la aguja.
    tiempos[tPtr++ % 30] = dt;
    if (tPtr >= 30) {
      const orden = Array.prototype.slice.call(tiempos).sort(function (a, b) { return a - b; });
      fps = 1000 / orden[15];
    }

    // Calidad adaptativa: SOLO baja.
    //
    // Con vsync, requestAnimationFrame entrega un cuadro cada 16,7 ms tanto
    // si la GPU tardó 2 ms como si tardó 15. Leer 60 fps no significa "sobra
    // capacidad", significa "todavía no se rompió". Por eso cualquier
    // controlador que suba mirando fps sube a ciegas hasta pasarse: eso era
    // lo que hacía que la página arrancara rápida y se fuera empastando.
    // Sin forma de medir el margen, la única jugada honesta es partir de un
    // presupuesto razonable y recortar si no alcanza.
    cuadros++;
    // Recorte suave y con piso alto: bajar resolución se ve como si las
    // piezas se deformaran, así que es el último recurso, no el primero.
    if (cuadros > 180 && cuadros % 90 === 0 && fps < 46 && calidad > 0.78) {
      calidad = Math.max(0.78, calidad - 0.07);
      medir();
    }

    const t = (ahora - t0) / 1000;
    entrada = Math.min(1, entrada + dt / 1400);

    if (!reduce) {
      raton[0] += (ratonObj[0] - raton[0]) * 0.045;
      raton[1] += (ratonObj[1] - raton[1]) * 0.045;
    }

    // Si el cursor está sobre el campo, manda el cursor. Si no, la grilla
    // sigue viva por su cuenta: responde a quien está, y no se apaga cuando
    // no hay nadie.
    const conCursor = !reduce && (ahora - ultimoHover) < 2200;

    if (reduce) {
      acti = 1; actiAnt = 0;
    } else {
      // Sin cursor, la grilla pasea sola: espera a terminar el cruce antes
      // de elegir la siguiente pieza.
      if (!conCursor && fase >= 1 && ahora - ultimaProp > 1100) {
        saltar();
        ultimaProp = ahora;
      }

      // Una sola transición con ease in/out: la que entra sube suave y la
      // que sale baja suave, cruzándose. Sin tirones al empezar ni al cortar.
      fase = Math.min(1, fase + dt / 1000 / duracion);
      const e = suave(fase);
      acti = e;
      actiAnt = actiAnt0 * (1 - e);
    }

    // Con movimiento reducido el haz no corre: sería el único objeto de la
    // escena desplazándose, justo lo que la preferencia pide evitar.
    if (reduce) { hazNivel = 0; } else { moverHaz(dt); }
    gl.uniform3f(uHazA, hazCol[0], hazCol[1], hazCol[2]);
    gl.uniform3f(uHazB, hazCab[0], hazCab[1], hazCab[2]);
    gl.uniform1f(uHazNivel, hazNivel);

    gl.uniform2f(uFoco, foco[0], foco[1]);
    gl.uniform1f(uActivo, acti);
    gl.uniform2f(uFocoAnt, focoAnt[0], focoAnt[1]);
    gl.uniform1f(uActivoAnt, actiAnt);

    gl.uniform1f(uT, reduce ? 8.0 : t);
    gl.uniform2f(uRaton, raton[0], raton[1]);
    gl.uniform1f(uScroll, scroll);
    gl.uniform1f(uEntrada, reduce ? 1 : entrada);

    gl.drawArrays(gl.TRIANGLES, 0, 3);

    dibujos++;
    if (ahora - ventana >= 1000) { dps = dibujos; dibujos = 0; ventana = ahora; }

    if (primerCuadro) { primerCuadro = false; alListo(true); }
    if (!reduce) pedirCuadro();
  }

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { ultimo = performance.now(); pedirCuadro(); }
  });

  if (reduce) {
    // Sin movimiento: una sola imagen, ya resuelta.
    acti = 1; actiAnt = 0; fase = 1; entrada = 1;
    requestAnimationFrame(cuadro);       // un único cuadro, sin bucle
  } else {
    pedirCuadro();
  }

  return api;
}

/* Sin módulos ES: `file://` los bloquea por CORS y el sitio debe abrir directo. */
window.montarEscena = montarEscena;
