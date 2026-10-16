const fs = require('fs'), vm = require('vm'), path = require('path');
const RAIZ = path.join(__dirname, '..', '..', '..') + '/';   // raíz del repositorio
const leer = n => fs.readFileSync(path.join(__dirname, n), 'utf8');
const code = { sitio: leer('sitio.js'), consulta: leer('consulta.js'), leer: leer('leer-viento.js'), indices: leer('indices.js') };
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALLA ') + m); if (!c) fails++; };

function entorno(sitioCode) {
    const E = { store: {}, status: null, clock: 1e12 };
    const flow = { get: k => E.store[k] ? JSON.parse(JSON.stringify(E.store[k])) : undefined,
                   set: (k, v) => { E.store[k] = JSON.parse(JSON.stringify(v)); } };
    const node = { status: s => { E.status = s; } };
    E.run = (c, msg) => vm.runInNewContext('(function(){' + c + '})()',
        { flow, node, msg, Date: { now: () => E.clock }, Math, JSON, isFinite, Object, Array, parseInt });
    E.run(sitioCode || code.sitio, {});
    return E;
}
// Respuesta falsa de Open-Meteo: 24 h desde hoy 13:00, viento del sur salvo las horas indicadas
function respuesta(horasMar, opts) {
    opts = opts || {};
    const H = { time: [], temperature_2m: [], relative_humidity_2m: [], wind_speed_10m: [], wind_direction_10m: [] };
    for (let i = 0; i < 24; i++) {
        const h = 13 + i, dia = h < 24 ? '09' : '10';
        H.time.push('2026-10-' + dia + 'T' + String(h % 24).padStart(2, '0') + ':00');
        const mar = horasMar.includes(i);
        H.temperature_2m.push(28); H.relative_humidity_2m.push(mar ? 85 : 60);
        H.wind_speed_10m.push(mar ? 22 : 8); H.wind_direction_10m.push(mar ? 10 : 180);
    }
    const r = { latitude: 20.97, longitude: -89.62, hourly: H };
    if (!opts.sinActual) r.current = { time: '2026-10-09T13:00', interval: 900, temperature_2m: 29.1, relative_humidity_2m: 66,
                                       wind_speed_10m: opts.vel || 18, wind_direction_10m: opts.dir === undefined ? 350 : opts.dir };
    return r;
}

// Configuración y URL
let E = entorno();
ok(E.store.mvp47sitio.nombre === 'Mérida, Yucatán' && E.store.mvp47sitio.lat === 20.97 && E.store.mvp47sitio.mar_desde === 290, 'sitio por defecto: Mérida, mar al norte');
let o = E.run(code.consulta, {});
ok(/latitude=20\.97&longitude=-89\.62/.test(o.url) && /current=temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m/.test(o.url) &&
   /forecast_hours=24/.test(o.url) && /wind_speed_unit=kmh/.test(o.url) && /timezone=America%2FMexico_City/.test(o.url), 'URL de Open-Meteo con Mérida, 24 h, km/h y hora de México');
const P = entorno(code.sitio.replace("SITIO_ACTIVO = 'merida'", "SITIO_ACTIVO = 'progreso'"));
ok(/latitude=21\.28/.test(P.run(code.consulta, {}).url) && P.store.mvp47sitio.costa_km === 0, 'cambiar a Progreso cambia coordenadas');
const V = entorno('return null;');
ok(V.run(code.consulta, {}) === null && V.status.fill === 'red', 'sin configuración: no consulta y lo marca en rojo');

// Lectura normal
o = E.run(code.leer, { statusCode: 200, payload: respuesta([]) });
ok(o[0].topic === 'viento' && o[0].payload.dir_deg === 350 && o[0].payload.vel_kmh === 18 && o[0].payload.hum === 66, 'salida 1: viento actual para los índices');
ok(o[1].payload.ok && o[1].payload.actual.desde_mar && o[1].payload.actual.brisa && o[1].payload.actual.punto === 'N', 'salida 2: viento del norte, desde el mar, con brisa');
ok(o[1].payload.riesgo === false && /Sin riesgo/.test(o[1].payload.texto), 'sin horas húmedas del mar: sin riesgo');
ok(/Open-Meteo/.test(o[1].payload.fuente) && o[1].payload.costa_km === 35, 'incluye crédito de la fuente y distancia a la costa');

// Ventanas de riesgo
o = E.run(code.leer, { statusCode: 200, payload: respuesta([1, 2, 3, 4, 5]) });
ok(o[1].payload.riesgo && o[1].payload.ventanas.length === 1 && o[1].payload.ventanas[0].horas === 5, 'ventana de 5 h de brisa húmeda');
ok(o[1].payload.texto.startsWith('Riesgo de sal: hoy 14:00–19:00'), 'texto: ' + o[1].payload.texto);
o = E.run(code.leer, { statusCode: 200, payload: respuesta([3]) });
ok(o[1].payload.riesgo === false, '1 hora suelta no es riesgo');
o = E.run(code.leer, { statusCode: 200, payload: respuesta([12, 13, 14, 20, 21]) });
ok(o[1].payload.ventanas.length === 2 && /mañana 01:00–04:00, mañana 09:00–11:00/.test(o[1].payload.texto), 'dos ventanas de madrugada: ' + o[1].payload.texto);
o = E.run(code.leer, { statusCode: 200, payload: respuesta([9, 10, 11]) });
ok(/hoy 22:00–01:00/.test(o[1].payload.texto), 'ventana que cruza medianoche: ' + o[1].payload.texto);

// Respuestas raras
o = E.run(code.leer, { statusCode: 200, payload: respuesta([], { sinActual: true }) });
ok(o[0].payload.dir_deg === 180 && o[0].payload.vel_kmh === 8, 'sin "current": usa la primera hora del pronóstico');
o = E.run(code.leer, { statusCode: 200, payload: JSON.stringify(respuesta([])) });
ok(o[0] && o[0].payload.vel_kmh === 18, 'acepta JSON como texto');
o = E.run(code.leer, { statusCode: 500, payload: 'error' });
ok(o[0] === null && o[1].payload.ok === false && /HTTP 500/.test(o[1].payload.texto) && E.status.fill === 'red', 'HTTP 500: sin viento, aviso en el dashboard');
o = E.run(code.leer, { statusCode: 200, payload: { error: true, reason: 'x' } });
ok(o[0] === null && /incompleta/.test(o[1].payload.texto), 'respuesta sin pronóstico: sin datos de viento');
o = E.run(code.leer, { payload: 'no json' });
ok(o[0] === null && /no es JSON/.test(o[1].payload.texto), 'sin internet / texto basura: sin datos de viento');

// Integración con "Calcular índices": usa el sector del sitio
const rack = JSON.parse(fs.readFileSync(RAIZ + 'docs/acuerdos/ejemplos/rack.json', 'utf8'));
rack.positions.forEach(p => { p.hum = 80; });
const vientoBase = JSON.stringify(E.run(code.leer, { statusCode: 200, payload: respuesta([]) })[0]);
const vientoMsg = () => JSON.parse(vientoBase);   // copia nueva, como hace Node-RED entre nodos
E.run(code.indices, vientoMsg());
ok(E.run(code.indices, { topic: 'site/datos', payload: rack }).payload.actual.brisa === true, 'índices: viento leído (350°, 18 km/h) cuenta como brisa en Mérida');
const X = entorno(code.sitio.replace('mar_desde: 290, mar_hasta: 70', 'mar_desde: 45, mar_hasta: 135'));   // costa que mira al este
X.run(code.indices, vientoMsg());
ok(X.run(code.indices, { topic: 'site/datos', payload: rack }).payload.actual.brisa === false, 'índices: con mar al este, viento del norte no es brisa');

process.exit(fails ? 1 : 0);
