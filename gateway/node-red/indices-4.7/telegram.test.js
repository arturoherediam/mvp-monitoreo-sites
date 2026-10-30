// Pruebas de la cola de Telegram con reintentos (telegram.js + resultado-telegram.js), sin Node-RED ni internet.
const fs = require('fs'), vm = require('vm'), path = require('path');
const TG = fs.readFileSync(path.join(__dirname, 'telegram.js'), 'utf8');
const RES = fs.readFileSync(path.join(__dirname, 'resultado-telegram.js'), 'utf8');
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALLA ') + m); if (!c) fails++; };

function entorno () {
    const E = { clock: Date.UTC(2026, 9, 30, 18, 0, 0), store: {}, red: 'bien', entregados: [], avisos: [], peticiones: 0 };
    const flow = { get: k => E.store[k] ? JSON.parse(JSON.stringify(E.store[k])) : undefined, set: (k, v) => { E.store[k] = JSON.parse(JSON.stringify(v)); E.escrituras = (E.escrituras || 0) + 1; } };
    const node = { status: s => { E.status = s; }, warn: w => E.avisos.push(String(w)) };
    const env = { get: k => ({ TELEGRAM_TOKEN: '1:T', TELEGRAM_CHAT: '-9' })[k] };
    const FDate = Object.assign(function (x) { return new Date(x === undefined ? E.clock : x); }, { now: () => E.clock });
    const corre = (c, msg) => vm.runInNewContext('(function(){' + c + '})()', { msg, flow, node, env, Date: FDate, Math, JSON, isFinite, Object, Array, String, Number });
    // Simula: cola -> http request -> resultado -> cola (y así hasta que la cola no envíe nada)
    E.paso = msg => {
        let salida = corre(TG, msg);
        while (salida) {
            E.peticiones++;
            if (!/sendMessage$/.test(salida.url) || salida.requestTimeout !== 20000) throw new Error('petición rara');
            let r;
            if (E.red === 'bien') { E.entregados.push(salida.payload.text); r = Object.assign({}, salida, { statusCode: 200, payload: { ok: true } }); }
            else if (E.red === 'caida') r = Object.assign({}, salida, { statusCode: 'ETIMEDOUT', payload: 'no response from server' });
            else if (E.red === 'rechazo') r = Object.assign({}, salida, { statusCode: 400, payload: { ok: false, description: 'Bad Request: chat not found' } });
            else if (E.red === 'muda') return;                   // la petición nunca regresa
            salida = corre(TG, corre(RES, r));
        }
    };
    E.aviso = t => E.paso({ payload: { text: t } });
    E.pulso = () => E.paso({ topic: 'tg-pulso' });
    E.avanza = (ms, cada) => { const fin = E.clock + ms; while (E.clock < fin) { E.clock += (cada || 15000); E.pulso(); } };
    E.cola = () => (E.store.mvp47tg ? E.store.mvp47tg.cola : []);
    return E;
}

// 1. Con internet: sale de inmediato y sin prefijo
let E = entorno();
E.aviso('🔥 FLAMA en rack-01');
ok(E.entregados.length === 1 && E.entregados[0] === '🔥 FLAMA en rack-01' && E.cola().length === 0 && E.status.text === 'al día', 'con internet: se entrega al instante, sin prefijo, cola vacía');

// 2. Falla y se recupera al primer reintento (caso del cambio de red del 30 oct)
E = entorno(); E.red = 'caida';
E.aviso('🔥 FLAMA en rack-01');
ok(E.entregados.length === 0 && E.cola().length === 1 && /sin enviar: 1/.test(E.status.text), 'falla: el aviso queda en cola y se ve en el estado');
ok(E.avisos.some(w => /se reintentará/.test(w)), 'falla temporal: aviso "se reintentará" en la barra de depuración');
E.red = 'bien'; E.avanza(15000);
ok(E.entregados.length === 1 && E.entregados[0] === '🔥 FLAMA en rack-01', 'a los 15 s se reintenta y se entrega (sin prefijo: menos de 1 min tarde)');

// 3. Esperas crecientes: 15 s, 1 min y luego cada 5 min
E = entorno(); E.red = 'caida';
E.aviso('A');
const t0 = E.clock, intentos = [];
for (let s = 0; s < 20 * 60; s += 5) { E.clock = t0 + s * 1000; const antes = E.peticiones; E.pulso(); if (E.peticiones > antes) intentos.push(s); }
ok(JSON.stringify(intentos.slice(0, 4)) === JSON.stringify([15, 75, 375, 675]), 'reintentos a los 15 s, +1 min, +5 min, +5 min: ' + intentos.slice(0, 4).join(', ') + ' s');

// 4. Internet vuelve tarde: sale con [retrasado, HH:MM] y en orden
E = entorno(); E.red = 'caida';
E.aviso('🔥 FLAMA en rack-01'); E.clock += 1000; E.aviso('⚠️ Nodo amb-01 desconectado');
E.avanza(10 * 60000, 5000); E.red = 'bien'; E.avanza(6 * 60000, 5000);
const hh = new Date(Date.UTC(2026, 9, 30, 18, 0, 0)).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
ok(E.entregados.length === 2 && E.entregados[0] === '[retrasado, ' + hh + '] 🔥 FLAMA en rack-01' && /^\[retrasado, .*\] ⚠️ Nodo amb-01/.test(E.entregados[1]),
   'internet vuelve 10 min después: los dos salen en orden con [retrasado, ' + hh + ']');

// 5. Más de 2 h sin internet: se descarta y se registra
E = entorno(); E.red = 'caida';
E.aviso('viejo'); E.avanza(2 * 3600000 + 60000, 60000);
ok(E.cola().length === 0 && E.avisos.some(w => /más de 2 h, se descarta: viejo/.test(w)), 'más de 2 h sin enviar: se descarta y se avisa');
E.red = 'bien'; E.avanza(60000); ok(E.entregados.length === 0, 'el aviso viejo ya no se manda cuando vuelve internet');

// 6. Cola llena: máximo 50, se descartan los más viejos
E = entorno(); E.red = 'caida';
for (let i = 1; i <= 55; i++) { E.aviso('aviso ' + i); E.clock += 1000; }
ok(E.cola().length === 50 && E.cola()[0].texto === 'aviso 6' && E.avisos.filter(w => /Cola de Telegram llena/.test(w)).length === 5, 'cola llena: quedan 50 y se descartan los 5 más viejos');

// 7. Error permanente (token o chat mal): se descarta y no bloquea a los demás
E = entorno(); E.red = 'rechazo';
E.aviso('mal'); ok(E.cola().length === 0 && E.avisos.some(w => /se descarta/.test(w)), 'error 400 (chat no existe): se descarta, no se reintenta');

// 8. Petición que nunca responde (reinicio a mitad de un envío): se reintenta a los 30 s
E = entorno(); E.red = 'muda';
E.aviso('perdido'); ok(E.store.mvp47tg.enviando !== null, 'envío en curso registrado');
E.red = 'bien'; E.avanza(30000, 15000); E.avanza(30000, 15000);
ok(E.entregados.length === 1 && E.cola().length === 0, 'sin respuesta en 30 s: se da por fallido y se reintenta');

// 9. Sobrevive a un reinicio de Node-RED: la cola está en el contexto (en disco)
E = entorno(); E.red = 'caida';
E.aviso('antes del reinicio');
const guardado = JSON.parse(JSON.stringify(E.store));
const E2 = entorno(); E2.store = guardado; E2.clock = E.clock + 60000; E2.pulso();
ok(E2.entregados.length === 1 && E2.entregados[0] === 'antes del reinicio', 'después de reiniciar, la cola guardada se envía');

// 10. Uno a la vez: mientras hay un envío en curso no sale otro
E = entorno(); E.red = 'muda';
E.aviso('uno'); const p = E.peticiones; E.aviso('dos');
ok(E.peticiones === p && E.cola().length === 2, 'un solo envío a la vez (el segundo espera)');

// 11. Escritura en disco solo si cambia algo
E = entorno(); E.aviso('x'); const w = E.escrituras; E.avanza(5 * 60000);
ok(E.escrituras === w, 'los pulsos sin cambios no escriben el contexto (cuida la microSD)');

console.log(fails ? '\n' + fails + ' FALLA(S)' : '\nTodas las pruebas pasaron');
process.exit(fails ? 1 : 0);
