// Ejecuta el flujo generado siguiendo sus cables (las funciones salen del JSON, no de los .js sueltos)
const fs = require('fs'), vm = require('vm'), path = require('path');
const RAIZ = path.join(__dirname, '..', '..', '..') + '/';   // raíz del repositorio
const F = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'flujo-mvp-4.7.json'), 'utf8'));
const byId = Object.fromEntries(F.map(n => [n.id, n]));
const ej = n => JSON.parse(fs.readFileSync(RAIZ + 'docs/acuerdos/ejemplos/' + n + '.json', 'utf8'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALLA ') + m); if (!c) fails++; };

let clock = 1e12; const store = {}; const ENV = { TELEGRAM_TOKEN: '1:T', TELEGRAM_CHAT: '-9' };
const flow = { get: k => store[k] ? JSON.parse(JSON.stringify(store[k])) : undefined, set: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); } };
const llegadas = {};   // id de nodo -> mensajes recibidos (para revisar)
const telegramPeticiones = [];

function openMeteo() {
    const H = { time: [], temperature_2m: [], relative_humidity_2m: [], wind_speed_10m: [], wind_direction_10m: [] };
    for (let i = 0; i < 24; i++) { H.time.push('2026-10-10T' + String(i).padStart(2, '0') + ':00'); H.temperature_2m.push(28);
        H.relative_humidity_2m.push(i >= 14 && i <= 18 ? 88 : 60); H.wind_speed_10m.push(i >= 14 && i <= 18 ? 25 : 5); H.wind_direction_10m.push(i >= 14 && i <= 18 ? 20 : 160); }
    return { hourly: H, current: { time: '2026-10-10T13:00', temperature_2m: 30, relative_humidity_2m: 62, wind_speed_10m: 20, wind_direction_10m: 15 } };
}
function entregar(id, msg) {
    const n = byId[id];
    (llegadas[id] = llegadas[id] || []).push(JSON.parse(JSON.stringify(msg)));
    let out;
    if (n.type === 'function') {
        out = vm.runInNewContext('(function(){' + n.func + '})()', { flow, msg: JSON.parse(JSON.stringify(msg)),
            node: { status: () => {}, warn: () => {} }, env: { get: k => ENV[k] },
            Date: Object.assign(function () { return new Date(clock); }, { now: () => clock }), Math, JSON, isFinite, Object, Array, String, parseInt });
    } else if (n.type === 'http request') {
        if (/open-meteo/.test(msg.url)) out = Object.assign({}, msg, { statusCode: 200, payload: openMeteo() });
        else { telegramPeticiones.push(msg); out = Object.assign({}, msg, { statusCode: 200, payload: { ok: true } }); }
    } else if (n.type === 'ui-template' || n.type === 'inject' || n.type === 'mqtt in') {
        out = msg;
        if (n.type === 'ui-template') return;            // la página no reenvía (passthru: false)
    } else throw new Error('tipo no simulado ' + n.type);
    if (out === null || out === undefined) return;
    const outs = Array.isArray(out) ? out : [out];
    (n.wires || []).forEach((destinos, i) => {
        const o = outs[i]; if (!o) return;
        (Array.isArray(o) ? o : [o]).forEach(m => destinos.forEach(d => entregar(d, m)));
    });
}
const pagina = () => { const l = llegadas.d47_ui; return l && l[l.length - 1].payload; };

entregar('d47_ini', { topic: 'inicio' });
ok(store.mvp47sitio && store.mvp47sitio.nombre === 'Mérida, Yucatán', 'al desplegar se guarda la configuración del sitio (Mérida)');
entregar('d47_hora', { topic: 'viento' });
ok(pagina().pronostico && /hoy 14:00–19:00/.test(pagina().pronostico.texto), 'la consulta horaria llega a la página: ' + pagina().pronostico.texto);
ok(telegramPeticiones.length === 1 && /Riesgo de sal/.test(telegramPeticiones[0].payload.text) && telegramPeticiones[0].payload.chat_id === '-9', 'el riesgo de sal sale por Telegram al chat del entorno');
ok(store.mvp47.viento && store.mvp47.viento.dir_deg === 15, 'el viento actual llegó a "Calcular índices"');

for (let i = 0; i < 60; i++) { const m = ej('rack'); m.seq = i + 1; entregar('d47_in_datos', { topic: 'site/datos', payload: m }); clock += 2000; }
entregar('d47_in_datos', { topic: 'site/datos', payload: ej('ambiente') });
const p = pagina();
ok(p.tarjetas.length === 6 && p.general === 'verde' && p.actual.brisa === true, 'datos MQTT -> índices -> umbrales -> página: 6 tarjetas, brisa activa');
entregar('d47_in_datos', { topic: 'site/datos', payload: ej('rack-con-flama') });
ok(pagina().general === 'rojo' && telegramPeticiones.some(x => /FLAMA/.test(x.payload.text)), 'flama: página en rojo y aviso por Telegram');
entregar('d47_in_estado', { topic: 'site/estado/rack-01', payload: ej('estado-offline') });
ok(telegramPeticiones.some(x => /rack-01 desconectado/.test(x.payload.text)) && pagina().nodos['rack-01'] === 'offline', 'nodo desconectado: aviso y se marca en la página');

// botón "Mantenimiento hecho": el template envía hacia "Calcular índices"
ok(byId.d47_ui.wires[0][0] === 'd47_ind', 'el botón de la página está cableado a "Calcular índices"');
entregar('d47_ind', { topic: 'mantenimiento', payload: { indice: 'polvo' } });
ok(pagina().bitacora[0].indice === 'polvo' && pagina().tarjetas.find(t => t.id === 'polvo').dias === 0, 'mantenimiento hecho: queda en la bitácora de la página');
ok(!JSON.stringify(F).includes('1:T'), 'el token no quedó en el flujo');
process.exit(fails ? 1 : 0);
