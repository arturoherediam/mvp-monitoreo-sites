// Prueba el modo simulación de punta a punta con el flujo generado (botón -> simulador -> índices -> página)
const fs = require('fs'), vm = require('vm'), path = require('path');
const F = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'flujo-mvp-4.7.json'), 'utf8'));
const byId = Object.fromEntries(F.map(n => [n.id, n]));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALLA ') + m); if (!c) fails++; };

let clock = Date.UTC(2026, 9, 10, 20, 0, 0); const store = {}; const tg = []; let pagina = null; const status = {};
const flow = { get: k => store[k] ? JSON.parse(JSON.stringify(store[k])) : undefined,
               set: (k, v) => { if (v === undefined) delete store[k]; else store[k] = JSON.parse(JSON.stringify(v)); } };
function entregar(id, msg) {
    const n = byId[id];
    let out;
    if (n.type === 'function') {
        out = vm.runInNewContext('(function(){' + n.func + '})()', { flow, msg: JSON.parse(JSON.stringify(msg)),
            node: { status: s => { status[id] = s; }, warn: () => {} }, env: { get: k => ({ TELEGRAM_TOKEN: '1:T', TELEGRAM_CHAT: '-9' })[k] },
            Date: Object.assign(function (x) { return new Date(x === undefined ? clock : x); }, { now: () => clock }), Math, JSON, isFinite, Object, Array, String, parseInt });
    } else if (n.type === 'http request') {
        if (/telegram/.test(msg.url)) { tg.push(msg.payload.text); out = Object.assign({}, msg, { statusCode: 200, payload: { ok: true } }); }
        else return;                                   // sin internet en esta prueba
    } else if (n.type === 'ui-template') { pagina = msg.payload; return; }
    else out = msg;
    if (out === null || out === undefined) return;
    const outs = Array.isArray(out) ? out : [out];
    (n.wires || []).forEach((dest, i) => { const o = outs[i]; if (!o) return; (Array.isArray(o) ? o : [o]).forEach(m => dest.forEach(d => entregar(d, m))); });
}
// la página envía por su salida (cableada a "Calcular índices" y "Simulador")
const boton = (payload, topic) => byId.d47_ui.wires[0].forEach(d => entregar(d, { topic: topic || 'sim/control', payload }));
const segundos = (s) => { for (let i = 0; i < s; i++) { clock += 1000; entregar('d47_tick', { topic: 'tick' }); } };
const tarjeta = id => pagina.tarjetas.find(t => t.id === id);
const activo = re => (pagina.activos || []).some(c => re.test(c.texto));

const atender = () => (pagina.atender || []).map(x => x.id).join(',');
const linea = id => (pagina.atender || []).find(x => x.id === id);
let marca = 0; const nuevosTg = () => { const n = tg.slice(marca); marca = tg.length; return n; };
let reloj0 = 0;                                         // segundos desde "Iniciar simulación"
const hasta = s => { segundos(s - reloj0); reloj0 = s; };   // avanza hasta el segundo s
const finFase = n => hasta((n - 1) * 20 + 19);            // último segundo de la fase n (fases de 20 s)

entregar('d47_ini', { topic: 'inicio' });
ok(byId.d47_tick && byId.d47_tick.repeat === '1' && byId.d47_sim.outputs === 2, 'el flujo tiene el tick de 1 s y el nodo Simulador');
ok(byId.d47_ui.wires[0].includes('d47_ind') && byId.d47_ui.wires[0].includes('d47_sim'), 'la página está cableada a índices y al simulador');
ok(byId.d47_sim.wires[1].includes('d47_eval'), 'el simulador también habla con "Evaluar umbrales" (pronóstico y estado de nodos)');
// algo de datos reales antes
const rack = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '..', 'docs', 'acuerdos', 'ejemplos', 'rack.json'), 'utf8'));
for (let i = 0; i < 5; i++) { clock += 2000; entregar('d47_in_datos', { topic: 'site/datos', payload: rack }); }
const realAntes = JSON.stringify(store.mvp47.indices);
ok(pagina && pagina.modo.sim === false, 'antes de simular: página con datos reales');
segundos(5);
ok(store.mvp47sim === undefined, 'el tick no genera nada si la simulación está apagada');

boton({ accion: 'iniciar' });
ok(pagina.modo.sim === true && pagina.pronostico && /simulado/.test(pagina.pronostico.texto), 'iniciar: página en modo simulación con pronóstico simulado');
ok(pagina.nodos['rack-01'] === 'online' && pagina.nodos['amb-01'] === 'online', 'iniciar: los dos nodos simulados en línea');
ok(nuevosTg().some(t => /^\[SIMULACIÓN\] 🌊 .*Mantén puertas cerradas/.test(t)), 'TAREA cerrar puertas (pronóstico): aviso por Telegram con prefijo y acción');

finFase(1);
ok(pagina.modo.fase.n === 1 && pagina.modo.fase.total === 9 && pagina.modo.fase.id === 'normal', 'fase 1/9: oficina normal');
ok(pagina.tarjetas.every(t => t.estado === 'verde') && atender() === '' && pagina.activos.every(c => c.nivel === 'info'),
   'fase 1: todo en verde, nada que atender, solo el viento del mar como información');
ok(pagina.actual.factor < 1.5 && pagina.actual.brisa === true && pagina.aceleracion === 180, 'fase 1: factor bajo, viento del mar y tiempo a 180×');
ok(nuevosTg().length === 0, 'fase 1: sin avisos');

finFase(2);
ok(pagina.modo.fase.id === 'noche' && tarjeta('corrosion').estado === 'rojo' && tarjeta('envejecimiento').estado !== 'verde',
   'fase 2 (noche sin aire): corrosión en rojo y envejecimiento subiendo (' + tarjeta('envejecimiento').estado + ')');
ok(pagina.eventos.some(e => /sobre 75 %/.test(e.texto)) && pagina.eventos.some(e => /sobre 27 °C/.test(e.texto)), 'fase 2: eventos de humedad > 75 % y temperatura > 27 °C');
ok(store.mvp47sim.indices.corrosion.h_brisa > 0.4 && store.mvp47sim.indices.termico.subidas === 0, 'fase 2: horas con brisa marina; la subida gradual NO cuenta como rápida');
ok(atender() === '', 'fase 2: nada que atender de inmediato');
ok(pagina.actual.tasa < 0.3 && pagina.actual.subida_15 < 2.5, 'fase 2: la página muestra el cambio en tiempo simulado (' + pagina.actual.tasa + ' °C/min, +' + pagina.actual.subida_15.toFixed(1) + ' °C en 15 min): subida lenta, sin aviso');

finFase(3);
let tg3 = nuevosTg();
ok(pagina.modo.fase.id === 'rocio' && activo(/rocío/) && pagina.actual.margen_rocio < 3, 'fase 3 (condensación): condición activa, margen < 3 °C');
ok(atender() === 'rocio' && /Deshumidifica/.test(linea('rocio').accion), 'TAREA deshumidificar ahora: en "Atender ahora" con su acción');
ok(tg3.some(t => /^\[SIMULACIÓN\] 💧 Riesgo de condensación: solo .* °C .*\nAcción: Deshumidifica/.test(t)), 'TAREA deshumidificar ahora: aviso por Telegram con margen y acción');
ok(tarjeta('condensacion').estado === 'rojo' && tarjeta('envejecimiento').estado === 'rojo', 'fase 3: tarjetas de condensación y envejecimiento en rojo');

finFase(4);
let tg4 = nuevosTg();
ok(pagina.modo.fase.id === 'subida' && pagina.actual.t_max > 32 && activo(/sobre 32 °C/), 'fase 4 (subida): el rack pasa de 32 °C');
ok(atender() === 'subida,t32' && /aire acondicionado/.test(linea('subida').accion) && /aire acondicionado/.test(linea('t32').accion),
   'TAREA revisar el aire ya: subida rápida y temperatura sobre 32 °C en "Atender ahora" con su acción');
ok(tg4.some(t => /^\[SIMULACIÓN\] 🌡️ El rack superó 32 °C .*\nAcción: Revisa el aire acondicionado ya/.test(t)), 'TAREA más de 32 °C: aviso por Telegram con acción');
ok(tg4.some(t => /^\[SIMULACIÓN\] 🌡️ Subida rápida.*\nAcción: Revisa el aire/.test(t)), 'TAREA revisar el aire ya: aviso por Telegram con acción');
ok(store.mvp47sim.indices.termico.subidas === 1 && store.mvp47sim.indices.termico.min32 > 0 && tarjeta('termico').estado === 'rojo',
   'fase 4: UNA subida aunque la vean A y B, minutos > 32 °C y tarjeta térmica en rojo');
ok(linea('subida').tipo === 'general' && /todo el rack/.test(linea('subida').texto) && tg4.some(t => /en todo el rack \(posiciones A y B\)/.test(t)),
   'fase 4: clasificada como de todo el rack (aire acondicionado)');

finFase(5);
let tg5l = nuevosTg();
ok(pagina.modo.fase.id === 'subida_local' && atender() === 'subida' && linea('subida').tipo === 'local' && /posición A/.test(linea('subida').accion),
   'TAREA revisar equipo y flujo de aire (subida local): "Atender ahora" dice que solo subió la posición A');
ok(tg5l.some(t => /^\[SIMULACIÓN\] 🌡️ Subida rápida de temperatura solo en la posición A del rack: .*\nAcción: Revisa el equipo y el flujo de aire cerca de la posición A/.test(t)),
   'TAREA revisar equipo y flujo de aire: aviso por Telegram con la acción local');
ok(store.mvp47sim.indices.termico.subidas === 2 && /2 subidas rápidas \(última: local en A\)/.test(tarjeta('termico').valor), 'fase 5: la tarjeta térmica cuenta 2 episodios y dice que el último fue local');

finFase(6);
let tg5 = nuevosTg();
ok(pagina.modo.fase.id === 'flama' && atender() === 'flama' && /extintor/.test(linea('flama').accion) && pagina.general === 'rojo',
   'TAREA atender flama: primera en "Atender ahora" con su acción y estado general rojo (la subida ya no se muestra)');
ok(tg5.some(t => /^\[SIMULACIÓN\] 🔥 FLAMA.*\nAcción: Verifica/.test(t)), 'TAREA atender flama: aviso por Telegram con acción');

finFase(7);
let tg6 = nuevosTg();
ok(pagina.modo.fase.id === 'desconexion' && pagina.nodos['amb-01'] === 'offline' && atender() === 'offline' &&
   /amb-01/.test(linea('offline').texto) && /Wi-Fi/.test(linea('offline').accion), 'TAREA revisar nodo: "Atender ahora" dice qué nodo y qué revisar');
ok(tg5.concat(tg6).some(t => /^\[SIMULACIÓN\] ⚠️ Nodo amb-01 desconectado.*\nAcción: Revisa su alimentación/.test(t)), 'TAREA revisar nodo: aviso por Telegram con acción');
ok(pagina.eventos.some(e => /amb-01 desconectado/.test(e.texto)) && store.mvp47modo.ultAmb < clock - 15000, 'fase 7: el nodo de ambiente deja de enviar datos');

finFase(8);
let tg7 = nuevosTg();
ok(tg7.some(t => /^\[SIMULACIÓN\] ✅ Nodo amb-01 reconectado/.test(t)) && pagina.nodos['amb-01'] === 'online', 'al terminar la fase 7 el nodo se reconecta y avisa');
ok(pagina.modo.fase.id === 'polvo' && activo(/polvo/) && pagina.actual.pm10 >= 250 && tarjeta('polvo').estado === 'rojo', 'fase 8 (polvo): episodio activo, PM10 ≈ 300 y tarjeta en rojo');
ok(atender() === '', 'fase 8: el nodo ya no aparece en "Atender ahora"');

finFase(9);
let tg8 = nuevosTg();
ok(pagina.modo.fase.id === 'falla' && pagina.pms_falla === true && tarjeta('pms').estado === 'rojo', 'fase 9 (falla del sensor): sensor en falla y tarjeta roja');
ok(atender() === 'pms' && /límpialo/.test(linea('pms').accion), 'TAREA revisar sensor: en "Atender ahora" con su acción');
ok(tg8.some(t => /^\[SIMULACIÓN\] 📟 Sensor de partículas con fallas: .* % tramas perdidas.*\nAcción: Revisa su conexión/.test(t)), 'TAREA revisar sensor: aviso por Telegram con acción');

// las 6 tareas por acumulación llegaron a rojo y avisaron por Telegram con su acción
const TIT = { envejecimiento: 'Envejecimiento', corrosion: 'Corrosión', polvo: 'Polvo', termico: 'Eventos de temperatura', condensacion: 'Riesgo de condensación:', pms: 'Salud del sensor' };
Object.keys(TIT).forEach(id => ok(tg.some(t => t.startsWith('[SIMULACIÓN] 🔴 ' + TIT[id]) && /\nAcción: /.test(t)) && tarjeta(id).accion,
   'TAREA acumulada "' + id + '": llegó a rojo en el primer ciclo, avisó por Telegram y su tarjeta tiene acción'));
ok(tg.length > 0 && tg.every(t => t.startsWith('[SIMULACIÓN] ')), 'los ' + tg.length + ' avisos de la simulación llevan el prefijo [SIMULACIÓN]');

hasta(180 + 19);   // ciclo 2, fase 1
ok(pagina.modo.fase.n === 1 && pagina.modo.fase.ciclo === 2, 'el ciclo dura 3 min y vuelve a empezar');
ok(pagina.pms_falla === false && atender() === '' && pagina.eventos.some(e => /recuperado/.test(e.texto)), 'el sensor se recupera solo durante la fase normal');
hasta(180 + 119);  // ciclo 2, fase 6 (flama)
let tgC2 = nuevosTg();
ok(tgC2.some(t => /FLAMA/.test(t)) && !tgC2.some(t => /💧|📟/.test(t)), 'ciclo 2: la flama vuelve a avisar; condensación y sensor no se repiten antes de 30 min');

boton({ indice: 'polvo' }, 'mantenimiento');
ok(tarjeta('polvo').estado === 'verde' && store.mvp47sim.bitacora[0].indice === 'polvo' && store.mvp47.bitacora.length === 0,
   'Mantenimiento hecho durante la simulación reinicia solo el contador simulado');
ok(JSON.stringify(store.mvp47.indices) === realAntes, 'los acumulados reales no cambiaron durante toda la simulación');

boton({ accion: 'detener' });
ok(pagina.modo.sim === false && pagina.tarjetas.every(t => t.estado === 'verde') && atender() === '', 'detener: la página vuelve a los datos reales');
const n = tg.length; segundos(10);
ok(tg.length === n && store.mvp47modo.sim === false, 'después de detener ya no se generan datos ni avisos');
entregar('d47_ini', { topic: 'inicio' });
ok(store.mvp47modo.sim === false, 'al desplegar, el modo vuelve a datos reales');
ok(Object.keys(store).every(k => JSON.stringify(store[k]).length < 60000), 'el estado guardado es pequeño (cabe en el contexto en disco)');
process.exit(fails ? 1 : 0);
