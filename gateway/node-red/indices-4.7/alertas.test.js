const fs = require('fs'), vm = require('vm'), path = require('path');
const RAIZ = path.join(__dirname, '..', '..', '..') + '/';   // raíz del repositorio
const leer = n => fs.readFileSync(path.join(__dirname, n), 'utf8');
const ej = n => JSON.parse(fs.readFileSync(RAIZ + 'docs/acuerdos/ejemplos/' + n + '.json', 'utf8'));
const IND1 = leer('indices.js');
const IND60 = IND1.replace('ACELERACION: 1,', 'ACELERACION: 60,');      // modo demo: umbrales de demostración
const EVA = leer('evaluar.js'), TG = leer('telegram.js');
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALLA ') + m); if (!c) fails++; };

function entorno(opc) {
    opc = opc || {};
    const IND = opc.real ? IND1 : IND60;
    const E = { store: {}, status: null, clock: 1e12, tg: [], ultimaPagina: null };
    const flow = { get: k => E.store[k] ? JSON.parse(JSON.stringify(E.store[k])) : undefined,
                   set: (k, v) => { if (v === undefined) delete E.store[k]; else E.store[k] = JSON.parse(JSON.stringify(v)); } };
    const node = { status: s => { E.status = s; } };
    const env = { get: k => (opc.env || {})[k] };
    const ctx = () => ({ flow, node, env, Date: Object.assign(function (x) { return new Date(x === undefined ? E.clock : x); }, { now: () => E.clock }), Math, JSON, isFinite, Object, Array, String });
    E.exec = (c, msg) => vm.runInNewContext('(function(){' + c + '})()', Object.assign(ctx(), { msg }));
    E.dato = (payload, extra) => {
        const a = E.exec(IND, Object.assign({ topic: 'site/datos', payload: JSON.parse(JSON.stringify(payload)) }, extra || {}));
        return a ? E.eval(a) : null;
    };
    E.eval = (m) => {
        const o = E.exec(EVA, JSON.parse(JSON.stringify(m)));
        if (o && o[0]) E.ultimaPagina = o[0].payload;
        if (o && o[1]) E.tg.push(...o[1].map(x => x.payload.text));
        return o;
    };
    E.rack = (t, hr, extra) => { const m = ej('rack'); m.positions.forEach(p => { p.temp = t; p.hum = hr; p.dew_point = t - 10; Object.assign(p, extra || {}); }); return m; };
    E.amb = (o) => Object.assign(ej('ambiente'), o || {});
    E.serie = (n, fn, paso) => { let o; for (let i = 0; i < n; i++) { o = E.dato(fn(i)); E.clock += paso || 2000; } return o; };
    E.tarjeta = (id) => E.ultimaPagina.tarjetas.find(x => x.id === id);
    return E;
}

// 1. Operación normal: todo verde, sin mensajes ni eventos
let E = entorno();
E.serie(60, () => E.rack(23, 45));
ok(E.ultimaPagina.tarjetas.length === 6 && E.ultimaPagina.tarjetas.every(x => x.estado === 'verde') && E.ultimaPagina.general === 'verde', '23 °C / 45 %: 6 tarjetas en verde');
ok(E.tg.length === 0 && E.ultimaPagina.eventos.length === 0 && E.ultimaPagina.activos.length === 0, 'sin mensajes, sin eventos, sin condiciones activas');

// 2. Umbrales de demostración (aceleración 60×): envejecimiento rojo una vez
E = entorno();
E.serie(20, () => E.rack(30, 80));
ok(E.tarjeta('envejecimiento').estado === 'verde' && /se evalúa desde 1 h/.test(E.tarjeta('envejecimiento').valor), 'demo: menos de 1 h acumulada, envejecimiento no se evalúa');
E.serie(40, () => E.rack(30, 80));
ok(E.tarjeta('envejecimiento').estado === 'rojo' && /Promedio 5\.9×/.test(E.tarjeta('envejecimiento').valor), 'demo: factor 5.9× en rojo');
ok(E.tg.filter(x => /Envejecimiento/.test(x)).length === 1 && E.tg.some(x => /Acción: Revisar enfriamiento/.test(x)), 'un solo aviso de envejecimiento con la acción');
ok(E.tarjeta('corrosion').estado === 'rojo' && E.tg.filter(x => /Corrosión/.test(x)).length === 2, 'demo: corrosión pasa por amarillo y rojo (1 h > 75 %)');
E.serie(200, () => E.rack(30, 80));
ok(E.tg.filter(x => /Envejecimiento/.test(x)).length === 1, 'sigue en rojo: no repite');

// 3. Mantenimiento reinicia el ciclo
let o = E.eval(E.exec(IND60, { topic: 'mantenimiento', payload: { indice: 'envejecimiento' } }));
ok(E.tarjeta('envejecimiento').estado === 'verde' && E.tarjeta('envejecimiento').dias === 0, 'mantenimiento: vuelve a verde, 0 días');
E.serie(70, () => E.rack(30, 80));
ok(E.tg.filter(x => /Envejecimiento/.test(x)).length === 2, 'nuevo ciclo: vuelve a avisar');

// 4. Umbrales reales: 2 h a 30 °C / 80 % no alcanzan para evaluar envejecimiento (mínimo 24 h)
E = entorno({ real: true });
E.serie(3600, () => E.rack(30, 80));
ok(E.tarjeta('envejecimiento').estado === 'verde' && /se evalúa desde 24 h/.test(E.tarjeta('envejecimiento').valor), 'real: con 2 h de datos todavía no evalúa envejecimiento');
ok(E.tarjeta('corrosion').carga < 0.05 && E.tarjeta('corrosion').estado === 'verde', 'real: 2 h con HR 80 % es menos del 5 % del umbral de 72 h');
E = entorno({ real: true });
E.serie(720, () => E.amb({ pm10: 35 }), 5000);
ok(Math.abs(E.tarjeta('polvo').carga - 35 / 75000) < 0.0005, 'real: polvo usa 75 000 µg·h/m³ (1 h a 35 = 0.05 %)');

// 5. Eventos de inicio y fin, y condiciones activas
E = entorno();
E.serie(5, () => E.rack(23, 45));
E.serie(10, () => E.rack(28, 70));
let p = E.ultimaPagina;
ok(p.activos.some(c => /27 °C/.test(c.texto)) && p.activos.some(c => /60 %/.test(c.texto)), 'activos: temperatura > 27 y humedad > 60');
ok(p.eventos.some(e => /sobre 27 °C/.test(e.texto)) && p.eventos.some(e => /sobre 60 %/.test(e.texto)), 'eventos de inicio registrados');
E.clock += 120000;
E.serie(3, () => E.rack(23, 45));
p = E.ultimaPagina;
ok(p.activos.length === 0 && /bajó de 27 °C \(duró 2 min\)/.test(p.eventos.map(e => e.texto).join('|')), 'eventos de fin con duración y sin activos: ' + p.eventos[0].texto);
E.serie(3, () => E.rack(25, 90, { dew_point: 23.5 }));
ok(E.ultimaPagina.activos.some(c => /rocío/.test(c.texto) && c.nivel === 'critico'), 'condensación: condición crítica activa');
E.dato(E.amb({ pm10: 300, pm2_5: 150, pm1_0: 90 }));
ok(E.ultimaPagina.activos.some(c => /polvo/.test(c.texto)), 'PM10 300: episodio de polvo activo');
ok(E.ultimaPagina.eventos.length <= 20, 'eventos limitados a 20');

// 6. Salud del PMS5003: ventana reciente que se recupera
E = entorno();
for (let i = 0; i < 12; i++) { E.dato(i % 2 ? ej('ambiente-con-falla') : E.amb({ pm1_0: 30, pm2_5: 20, pm10: 25 })); E.clock += 5000; }
ok(E.ultimaPagina.pms_falla === true && E.tarjeta('pms').estado === 'rojo', 'tramas perdidas e imposibles: sensor en falla y tarjeta roja');
ok(E.ultimaPagina.activos.some(c => /partículas con fallas/.test(c.texto)), 'falla del sensor como condición activa');
for (let i = 0; i < 12; i++) { E.dato(E.amb()); E.clock += 5000; }
ok(E.ultimaPagina.pms_falla === false && E.tarjeta('pms').estado === 'verde', 'tras 12 tramas buenas (1 min en demo) el sensor se recupera');
ok(E.ultimaPagina.eventos.some(e => /recuperado/.test(e.texto)), 'evento de recuperación');
E = entorno({ real: true });
for (let i = 0; i < 200; i++) { E.dato(i < 6 ? ej('ambiente-con-falla') : E.amb()); E.clock += 5000; }
ok(E.ultimaPagina.pms_falla === false && E.tarjeta('pms').estado === 'verde', 'real: 6 tramas perdidas hace más de 10 min ya no cuentan');

// 7. Flama
E = entorno();
E.dato(E.rack(24, 50)); E.clock += 2000;
E.dato(ej('rack-con-flama'));
ok(E.tg.length === 1 && /FLAMA/.test(E.tg[0]) && E.ultimaPagina.general === 'rojo', 'flama: aviso inmediato y estado general rojo');
ok(E.ultimaPagina.eventos[0].texto === 'Flama detectada en el rack', 'flama en eventos recientes');
E.clock += 1000; E.dato(ej('rack-con-flama'));
ok(E.tg.length === 1, 'flama sigue: no repite');
E.clock += 1000; E.dato(E.rack(24, 50)); E.clock += 180000; E.dato(ej('rack-con-flama'));
ok(E.tg.length === 2, 'flama vuelve después de 2 min: avisa otra vez');

// 8. Subida rápida (tiempo real)
E = entorno();
E.serie(400, (i) => E.rack(24 + Math.min(i, 300) * 0.02, 50));
ok(E.tg.some(x => /Subida rápida/.test(x)) && E.ultimaPagina.eventos.some(e => /Subida rápida/.test(e.texto)), 'subida de 6 °C en 10 min: aviso y evento');

// 9. Pronóstico y nodos
E = entorno();
const pr = (v) => ({ topic: 'pronostico', payload: { ok: true, sitio: 'Mérida, Yucatán', riesgo: v.length > 0, ventanas: v.map(d => ({ desde: d })),
    texto: v.length ? 'Riesgo de sal: hoy 14:00–19:00.' : 'Sin riesgo de sal en las próximas 24 h.' } });
E.eval(pr([]));
ok(E.tg.length === 0, 'sin riesgo: sin aviso');
E.eval(pr(['2026-10-09T14:00']));
ok(E.tg.length === 1 && /🌊 Riesgo de sal/.test(E.tg[0]) && E.ultimaPagina.eventos[0].icono === '🌊', 'riesgo nuevo: aviso y evento');
E.eval(pr(['2026-10-09T14:00']));
ok(E.tg.length === 1, 'mismo pronóstico: no repite');
E.eval({ topic: 'site/estado/rack-01', payload: ej('estado-online-rack') });
E.eval({ topic: 'site/estado/rack-01', payload: ej('estado-offline') });
ok(E.tg.length === 2 && /rack-01 desconectado/.test(E.tg[1]) && E.ultimaPagina.general === 'rojo', 'offline: aviso y estado general rojo');
E.eval({ topic: 'site/estado/rack-01', payload: JSON.stringify(ej('estado-offline')) });
ok(E.tg.length === 2, 'offline repetido: no repite');
E.eval({ topic: 'site/estado/rack-01', payload: ej('estado-online-rack') });
ok(E.tg.length === 3 && /reconectado/.test(E.tg[2]), 'vuelve: aviso de reconexión');
ok(E.eval({ topic: 'site/estado/rack-02', payload: ej('estado-offline') }) === null, 'node_id distinto al tema: se ignora');

// 10. Simulación: contadores aparte, prefijo y página
E = entorno({ real: true });
E.serie(30, () => E.rack(23, 45));
E.store.mvp47modo = { sim: true, fase: { n: 2, total: 6, nombre: 'Noche' } };
const paginaAntes = E.ultimaPagina;
E.serie(70, () => E.rack(30, 80));
ok(E.ultimaPagina === paginaAntes, 'datos reales durante la simulación no redibujan la página');
const horasReales = E.store.mvp47.indices.envejecimiento.horas;
ok(horasReales > 0.03 && horasReales < 0.06, 'los datos reales siguen acumulando en sus contadores (unos 3 min reales)');
for (let i = 0; i < 70; i++) { E.dato(E.rack(30, 80), { sim: true }); E.clock += 2000; }
ok(E.ultimaPagina.modo.sim === true && E.ultimaPagina.modo.fase.n === 2, 'mensajes simulados: página en modo simulación con su fase');
ok(E.store.mvp47sim.indices.envejecimiento.horas > 2 && E.store.mvp47.indices.envejecimiento.horas === horasReales, 'la simulación acumula aparte (más de 2 h simuladas) sin tocar los reales');
ok(E.tg.some(x => /^\[SIMULACIÓN\] .*Envejecimiento/.test(x)), 'avisos simulados llevan el prefijo [SIMULACIÓN]');
E.dato(ej('rack-con-flama'));
ok(E.tg.some(x => /^🔥 FLAMA/.test(x)), 'una flama real durante la simulación sí avisa por Telegram (sin prefijo)');
E.store.mvp47modo = { sim: false };
ok(E.eval({ topic: 'refrescar' })[0].payload.modo.sim === false, 'al detener: refrescar dibuja los datos reales');
ok(E.dato(E.rack(30, 80), { sim: true }) === null, 'mensajes simulados después de detener: se ignoran');

// 11. Telegram
E = entorno();
ok(E.exec(TG, { payload: { text: 'hola' } }) === null && E.status.text === 'Telegram sin configurar', 'sin token: no envía y lo marca');
E = entorno({ env: { TELEGRAM_TOKEN: '123:ABC', TELEGRAM_CHAT: '-100555' } });
o = E.exec(TG, { payload: { text: 'x'.repeat(5000) } });
ok(o.url === 'https://api.telegram.org/bot123:ABC/sendMessage' && o.method === 'POST' && o.payload.chat_id === '-100555' && o.payload.text.length === 4000,
   'con token: POST a sendMessage, chat del entorno, texto recortado a 4000');
ok(!/123:ABC/.test(EVA + IND1 + TG), 'el token no está escrito en ningún código');

// 12. Tareas por evento con datos reales: "Atender ahora" y avisos nuevos (sin prefijo)
E = entorno({ real: true });
E.serie(5, () => E.rack(24, 50));
E.serie(3, () => E.rack(25, 90, { dew_point: 23.5 }));
let at = E.ultimaPagina.atender;
ok(at.length === 1 && at[0].id === 'rocio' && /Deshumidifica/.test(at[0].accion), 'condensación ahora: en "Atender ahora" con acción');
ok(E.tg.length === 1 && /^💧 Riesgo de condensación: solo 1\.5 °C sobre el punto de rocío\.\nAcción: Deshumidifica/.test(E.tg[0]), 'condensación ahora: aviso por Telegram con margen y acción');
E.serie(3, () => E.rack(24, 50)); E.clock += 10 * 60000;
E.serie(3, () => E.rack(25, 90, { dew_point: 23.5 }));
ok(E.tg.length === 1, 'condensación otra vez antes de 30 min: no repite el aviso');
E.serie(3, () => E.rack(24, 50)); E.clock += 31 * 60000;
E.serie(3, () => E.rack(25, 90, { dew_point: 23.5 }));
ok(E.tg.length === 2, 'condensación después de 30 min: avisa de nuevo');
E.serie(3, () => E.rack(24, 50));
ok(E.ultimaPagina.atender.length === 0, 'sin riesgo: "Atender ahora" vacío');

E = entorno({ real: true });
for (let i = 0; i < 24; i++) { E.dato(i % 2 ? ej('ambiente-con-falla') : E.amb()); E.clock += 5000; }
ok(E.ultimaPagina.pms_falla === true && E.ultimaPagina.atender.some(x => x.id === 'pms' && /límpialo/.test(x.accion)), 'sensor con fallas: en "Atender ahora" con acción');
ok(E.tg.filter(x => /^📟 Sensor de partículas con fallas: .* % tramas perdidas/.test(x) && /\nAcción: Revisa su conexión/.test(x)).length === 1, 'sensor con fallas: un aviso por Telegram con acción');

E = entorno({ real: true });
E.serie(400, (i) => E.rack(24 + Math.min(i, 300) * 0.02, 50));
ok(E.ultimaPagina.atender.some(x => x.id === 'subida' && /aire acondicionado/.test(x.accion)), 'subida rápida: en "Atender ahora" con acción');
ok(E.tg.some(x => /Subida rápida.*\nAcción: Revisa el aire/.test(x)), 'subida rápida: aviso con acción');
ok(E.tg.filter(x => /Subida rápida/.test(x)).length === 1 && /en todo el rack \(posiciones A y B\)/.test(E.tg.find(x => /Subida/.test(x))),
   'subida en A y B: UN aviso que dice "todo el rack" y manda revisar el aire');
ok(/1 subida rápida \(última: todo el rack\)/.test(E.tarjeta('termico').valor), 'tarjeta térmica: ' + E.tarjeta('termico').valor);
E.clock += 16 * 60000; E.dato(E.rack(30, 50));
ok(!E.ultimaPagina.atender.some(x => x.id === 'subida'), 'subida rápida: se quita de "Atender ahora" a los 15 min');

// subida local: solo la posición A
const dos = (ta, tb) => { const m = E.rack(ta, 50); m.positions[1].temp = tb; return m; };
E = entorno({ real: true });
E.serie(400, (i) => dos(24 + Math.min(i, 300) * 0.02, 24));
at = E.ultimaPagina.atender.find(x => x.id === 'subida');
ok(at && at.tipo === 'local' && /solo en la posición A/.test(at.texto) && /flujo de aire cerca de la posición A/.test(at.accion),
   'subida solo en A: "Atender ahora" la marca local y manda revisar el equipo y el flujo de aire cerca de A');
ok(E.tg.some(x => /^🌡️ Subida rápida de temperatura solo en la posición A del rack: .*\nAcción: Revisa el equipo y el flujo de aire cerca de la posición A/.test(x)),
   'subida solo en A: aviso por Telegram con la acción local');
ok(E.ultimaPagina.eventos.some(e => /solo en la posición A/.test(e.texto)), 'subida local en eventos recientes');
// empieza en A y luego sube B: segundo aviso "ahora abarca todo el rack"
E = entorno({ real: true });
E.serie(20, () => dos(24, 24));
E.serie(400, (i) => dos(24 + Math.min(i, 150) * 0.04, 24 + Math.max(0, Math.min(i - 200, 150)) * 0.04));
const sub = E.tg.filter(x => /[Ss]ubida rápida/.test(x));
ok(sub.length === 2 && /solo en la posición A/.test(sub[0]) && /ahora abarca todo el rack \(posiciones A y B\)\.\nAcción: Revisa el aire/.test(sub[1]) &&
   E.store.mvp47.indices.termico.subidas === 1, 'local que se vuelve general: 2 avisos (local y luego todo el rack) pero cuenta 1');
ok(E.ultimaPagina.atender.find(x => x.id === 'subida').tipo === 'general', '"Atender ahora" se actualiza a todo el rack');

E = entorno({ real: true });
E.dato(E.rack(24, 50)); E.clock += 2000;
E.dato(ej('rack-con-flama'));
E.eval({ topic: 'site/estado/amb-01', payload: Object.assign(ej('estado-offline'), { node_id: 'amb-01' }) });
at = E.ultimaPagina.atender;
ok(at[0].id === 'flama' && /extintor/.test(at[0].accion) && at.some(x => x.id === 'offline' && /amb-01/.test(x.texto) && /Wi-Fi/.test(x.accion)),
   'flama primero y nodo desconectado con su acción en "Atender ahora"');
ok(/^🔥 FLAMA.*\nAcción: Verifica/.test(E.tg[0]) && /^⚠️ Nodo amb-01 desconectado\.\nAcción: Revisa su alimentación/.test(E.tg[1]), 'flama y nodo: avisos con acción');

// Subida lenta (aire apagado de noche): no es subida rápida, pero al pasar de 32 °C avisa
E = entorno({ real: true });
E.serie(30 * 50, (i) => E.rack(24 + (i * 2 / 60) * 0.2, 50));   // 0.2 °C/min durante 50 min: 24 -> 34 °C
ok(!E.tg.some(x => /Subida rápida/.test(x)) && E.store.mvp47.indices.termico.subidas === 0, 'subida lenta (0.2 °C/min): no cuenta como subida rápida');
ok(E.tg.filter(x => /^🌡️ El rack superó 32 °C .*\nAcción: Revisa el aire acondicionado ya/.test(x)).length === 1, 'pasa de 32 °C: un aviso inmediato con acción');
ok(E.ultimaPagina.atender.some(x => x.id === 't32' && /32 °C/.test(x.texto)), 'más de 32 °C en "Atender ahora"');
ok(E.ultimaPagina.actual.subida_15 > 2.5 && E.ultimaPagina.actual.subida_15 < 5, 'la página muestra la subida de 15 min que usa el aviso (+' + E.ultimaPagina.actual.subida_15.toFixed(1) + ' °C)');
E.serie(5, () => E.rack(30, 50));
ok(!E.ultimaPagina.atender.some(x => x.id === 't32'), 'baja de 32 °C: se quita de "Atender ahora"');
process.exit(fails ? 1 : 0);
