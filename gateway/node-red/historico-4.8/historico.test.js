// Pruebas del histórico 4.8 sin Node-RED: corre el código de cada nodo function con un SQLite en memoria (node:sqlite).
// Uso: node historico.test.js   (Node 22.5 o más nuevo)
const fs = require('fs'), vm = require('vm'), path = require('path');
const { DatabaseSync } = require('node:sqlite');
const RAIZ = path.join(__dirname, '..', '..', '..') + '/';
const src = n => fs.readFileSync(path.join(__dirname, n), 'utf8');
const ej = n => JSON.parse(fs.readFileSync(RAIZ + 'docs/acuerdos/ejemplos/' + n + '.json', 'utf8'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALLA ') + m); if (!c) fails++; };

let reloj = Date.UTC(2026, 9, 30, 12, 0, 0);
const store = {};
const flow = { get: k => store[k], set: (k, v) => { store[k] = v; } };
const node = { status: () => {} };
const FakeDate = class extends Date { constructor (...a) { super(...(a.length ? a : [reloj])); } static now () { return reloj; } };
function corre (archivo, msg) {
    return vm.runInNewContext('(function(){' + src(archivo) + '})()', { msg, node, flow, Date: FakeDate, Math, JSON, isFinite, Object, Array, String, Set });
}
const db = new DatabaseSync(':memory:');
const esquema = fs.readFileSync(RAIZ + 'gateway/db/esquema.sql', 'utf8').replace(/--[^\n]*/g, '');
db.exec(esquema); db.exec(esquema);
ok(true, 'el esquema se puede aplicar dos veces (CREATE ... IF NOT EXISTS)');

// 1. filas.js
const r = corre('filas.js', { payload: ej('rack') });
ok(r && r.payload.length === 2 && r.payload[0].pos === 'A' && r.payload[1].pos === 'B', 'rack: una fila por posición');
ok(r.payload[0].flame === 0 && r.payload[1].flame === null, 'rack: flame 0 en A y nulo en B (sin sensor)');
const a = corre('filas.js', { payload: ej('ambiente') });
ok(a && a.payload.length === 1 && a.payload[0].pos === '' && a.payload[0].pm10 === 21, 'ambiente: una fila con partículas');
const fl = corre('filas.js', { payload: ej('rack-con-falla') });
ok(fl.payload[1].temp === null && fl.payload[1].err === 'sht41_B_timeout' && fl.payload[0].err === null, 'rack con falla: B nulo con su código de error; A sin error');
const mux = Object.assign(ej('rack'), { err: ['mux_sin_respuesta'] });
ok(corre('filas.js', { payload: mux }).payload.every(f => f.err === 'mux_sin_respuesta'), 'error general del rack (mux) se guarda en cada posición');
ok(corre('filas.js', { payload: Object.assign(ej('ambiente'), { node_id: "x'); DROP TABLE lecturas;--" }) }) === null, 'node_id inválido se descarta');
ok(corre('filas.js', { payload: Object.assign(ej('ambiente'), { schema: 2 }) }) === null, 'otro schema se descarta');
ok(corre('filas.js', { payload: 'texto' }) === null, 'mensaje que no es objeto se descarta');
const raro = corre('filas.js', { payload: Object.assign(ej('ambiente'), { err: ["pms_sin_trama", "x'y"] }) });
ok(raro.payload[0].err === 'pms_sin_trama', 'códigos de error con caracteres raros se filtran');

// 2. Simula 26 horas: rack cada 2 s y ambiente cada 5 s, lotes de 30 s; resumen cada hora
const inicio = reloj;
let lote = [], lotes = 0, filasEscritas = 0;
function cierraLote () {
    if (!lote.length) return;
    const m = corre('lote.js', { payload: lote });
    db.exec(m.topic); lotes++; filasEscritas += m.filas; lote = [];
}
for (let s = 0; s < 26 * 3600; s++) {
    reloj = inicio + s * 1000;
    const h = s / 3600;
    if (s % 2 === 0) { const m = ej('rack'); m.positions[0].temp = 24 + h / 10; m.positions[1].temp = 25 + h / 10; lote.push(corre('filas.js', { payload: m }).payload); }
    if (s % 5 === 0) { const m = ej('ambiente'); m.pm10 = 20 + (s % 60); lote.push(corre('filas.js', { payload: m }).payload); }
    if (s % 30 === 29) cierraLote();
    if (s % 3600 === 3599) db.exec(corre('resumen.js', {}).topic);
}
cierraLote();
const total = db.prepare('SELECT COUNT(*) AS n FROM lecturas').get().n;
ok(total === filasEscritas && total === 26 * 3600 / 2 * 2 + 26 * 3600 / 5, 'todas las filas se escribieron (' + total + ' en ' + lotes + ' lotes de 30 s)');
ok(lotes === 26 * 120, 'una transacción cada 30 s (' + lotes + ')');
const horas = db.prepare("SELECT COUNT(DISTINCT hora) AS n FROM resumen_hora").get().n;
ok(horas >= 26 && horas <= 27, 'resumen_hora tiene una fila por hora (' + horas + ' horas)');
const rA = db.prepare("SELECT n, temp_min, temp_max FROM resumen_hora WHERE node_id='rack-01' AND pos='A' ORDER BY hora LIMIT 1").get();
ok(rA.n === 1800 && rA.temp_min >= 24 && rA.temp_max <= 24.11, 'resumen de la 1.ª hora del rack A: 1800 lecturas, mín y máx correctos');

// 3. Consultas de la página
store.rango_historico = undefined;
let q = corre('consulta.js', { payload: 1 });
ok(q.rango === '24h', 'sin elección previa, el rango es 24 h');
let filas = db.prepare(q.topic).all();
let out = corre('series.js', { payload: filas, rango: q.rango });
const nombres = out[0].slice(1).map(m => m.topic);
ok(out[0][0].payload.length === 0, 'cada gráfica se borra antes de redibujar');
ok(JSON.stringify(nombres) === JSON.stringify(['amb-01', 'rack-01 A', 'rack-01 B']), 'series de temperatura: amb-01, rack-01 A y rack-01 B');
ok(out[0][1].payload.length >= 1439 && out[0][1].payload.length <= 1441, '24 h = un punto por minuto (' + out[0][1].payload.length + ')');
ok(out[2].slice(1).map(m => m.topic).join('|') === 'amb-01 PM2.5|amb-01 PM10', 'partículas: series PM2.5 y PM10 del ambiente');
ok(out[3].payload.rango === '24h' && out[3].payload.puntos > 0, 'la página recibe rango y número de puntos');
q = corre('consulta.js', { payload: '7d' });
ok(store.rango_historico === '7d' && /resumen_hora/.test(q.topic), '7 días se lee de resumen_hora y queda elegido');
out = corre('series.js', { payload: db.prepare(q.topic).all(), rango: q.rango });
ok(out[0][1].payload.length >= 26 && out[0][1].payload.length <= 27, '7 días = un punto por hora (' + out[0][1].payload.length + ')');
ok(corre('consulta.js', { payload: 1 }).rango === '7d', 'el refresco periódico respeta el rango elegido');

// 4. Limpieza: lecturas de más de 30 días se borran, el resumen se queda
reloj = inicio + 31 * 24 * 3600000;
db.exec(corre('resumen.js', {}).topic);
const corte = reloj - 30 * 24 * 3600000;
ok(db.prepare('SELECT COUNT(*) AS n FROM lecturas WHERE ts < ?').get(corte).n === 0 && db.prepare('SELECT COUNT(*) AS n FROM lecturas').get().n > 0,
   'a los 31 días se borran solo las lecturas de más de 30 días');
ok(db.prepare('SELECT COUNT(*) AS n FROM resumen_hora').get().n > 0, 'el resumen por hora no se borra');

console.log(fails ? '\n' + fails + ' FALLA(S)' : '\nTodas las pruebas pasaron');
process.exit(fails ? 1 : 0);
