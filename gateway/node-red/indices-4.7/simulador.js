// Simulador (modo simulación del dashboard). Entradas:
//   topic 'sim/control' -> { accion: 'iniciar' | 'detener' }   (botón de la página)
//   topic 'tick'        -> cada 1 s
// Salidas: 1 -> "Calcular índices" (mensajes con msg.sim = true)   2 -> "Evaluar umbrales" (pronóstico, estado de nodos y refrescar)
// No publica en MQTT: la simulación no se ve en la página 4.3 y usa contadores aparte de los reales.
// 9 fases de 20 s (3 min por ciclo). Con 180× cada fase cuenta como 1 h simulada.
const DUR = 20;
const ACEL = 180;                 // igual que ACELERACION_SIM de "Calcular índices"
const FASES = [
    { id: 'normal', nombre: 'Oficina normal', texto: '23 °C, 50 % y poco polvo: todo en verde' },
    { id: 'noche', nombre: 'Noche sin aire acondicionado', texto: 'sube poco a poco a 30 °C y 82 %, con viento del mar' },
    { id: 'rocio', nombre: 'Condensación', texto: '25 °C y 92 %: a menos de 2 °C del punto de rocío' },
    { id: 'subida', nombre: 'Subida rápida en todo el rack', texto: 'las posiciones A y B suben de 24 a 33 °C en 5 s: falla el aire acondicionado' },
    { id: 'subida_local', nombre: 'Subida rápida local', texto: 'solo la posición A sube a 31 °C: un equipo o el flujo de aire cerca de A' },
    { id: 'flama', nombre: 'Flama en el rack', texto: 'el sensor de flama de la posición A detecta fuego' },
    { id: 'desconexion', nombre: 'Nodo desconectado', texto: 'el nodo de ambiente amb-01 se desconecta y vuelve' },
    { id: 'polvo', nombre: 'Episodio de polvo', texto: 'PM10 de 300 µg/m³ (limpieza u obra cercana)' },
    { id: 'falla', nombre: 'Falla del sensor de partículas', texto: 'tramas perdidas y valores imposibles (se recupera al empezar el siguiente ciclo)' }
].map(f => Object.assign(f, { dur: DUR }));
const CICLO = FASES.reduce((s, f) => s + f.dur, 0);
const ahora = Date.now();
const M = flow.get('mvp47modo') || { sim: false };
const S = flow.get('mvp47sitio') || { nombre: 'Sitio', costa_km: null };

const ruido = a => (Math.random() - 0.5) * 2 * a;
const r2 = v => Math.round(v * 100) / 100;
function rocio(t, h) { const a = 17.62, b = 243.12, g = Math.log(h / 100) + a * t / (b + t); return r2(b * g / (a - g)); }
function faseEn(seg) {
    let s = seg % CICLO;
    for (let i = 0; i < FASES.length; i++) { if (s < FASES[i].dur) return { i: i, f: FASES[i], tf: s }; s -= FASES[i].dur; }
    return { i: 0, f: FASES[0], tf: 0 };
}
function rackEn(id, tf) {
    const x = Math.min(1, tf / DUR);
    switch (id) {
        case 'noche': return [23 + 7 * x, 50 + 32 * x];          // gradual: no cuenta como subida rápida
        case 'rocio': return [25, 92];
        case 'subida': return [24 + 9 * Math.min(1, tf / 5), 55];  // +9 °C en 5 s (15 min simulados)
        case 'subida_local': return [24 + 7 * Math.min(1, tf / 5), 50];   // solo la posición A (ver mensajeRack)
        case 'normal': return [23, 50];
        default: return [24, 50];
    }
}
function estado(id, st) {
    return { topic: 'site/estado/' + id, sim: true, payload: { schema: 1, type: 'status', node_id: id, status: st } };
}
function mensajeRack(fz) {
    const [t, h] = rackEn(fz.f.id, fz.tf);
    M.seq = (M.seq || 0) + 1;
    M.prev = M.prev || {};
    const pos = ['A', 'B'].map((id, k) => {
        const tp = fz.f.id === 'subida_local' && id === 'B' ? 24 : t;      // en la subida local B no se mueve
        const temp = r2(tp - 0.4 * k + ruido(0.08)), hum = r2(Math.min(99, h - 1 * k + ruido(0.3)));
        const ant = M.prev[id];
        const tasa = ant ? r2((temp - ant.t) / ((ahora - ant.ts) * ACEL / 60000)) : 0;   // °C por minuto SIMULADO
        M.prev[id] = { t: temp, ts: ahora };
        const p = { id: id, temp: temp, hum: hum, dew_point: rocio(temp, hum), rate_c_min: tasa };
        if (id === 'A') p.flame = fz.f.id === 'flama';
        return p;
    });
    return { topic: 'site/datos', sim: true, payload: { schema: 1, type: 'rack', node_id: 'rack-01', seq: M.seq,
             uptime_s: Math.round((ahora - M.inicio) / 1000), positions: pos } };
}
function mensajeAmbiente(fz) {
    const [t, h] = rackEn(fz.f.id, fz.tf);
    M.seqAmb = (M.seqAmb || 0) + 1;
    const temp = r2(t - 0.5 + ruido(0.1)), hum = r2(Math.min(99, h + ruido(0.5)));
    const m = { schema: 1, type: 'ambiente', node_id: 'amb-01', seq: M.seqAmb, uptime_s: Math.round((ahora - M.inicio) / 1000),
                temp: temp, hum: hum, dew_point: rocio(temp, hum), rate_c_min: 0 };
    if (fz.f.id === 'polvo') Object.assign(m, { pm1_0: 90, pm2_5: 150, pm10: Math.round(300 + ruido(15)) });
    else if (fz.f.id === 'falla') {
        if (M.seqAmb % 2) Object.assign(m, { pm1_0: null, pm2_5: null, pm10: null, err: ['pms_sin_trama'] });
        else Object.assign(m, { pm1_0: 30, pm2_5: 20, pm10: 25 });                  // imposible: PM1.0 > PM2.5
    } else Object.assign(m, { pm1_0: 9, pm2_5: 14, pm10: Math.round(21 + ruido(2)) });
    return { topic: 'site/datos', sim: true, payload: m };
}
function pronosticoSimulado() {
    const h = new Date(ahora + 3600000);
    const hh = n => String(n % 24).padStart(2, '0') + ':00';
    const texto = 'Riesgo de sal (simulado): hoy ' + hh(h.getHours()) + '–' + hh(h.getHours() + 5) +
                  '. Mantén puertas cerradas y el aire o deshumidificador encendido.';
    return { topic: 'pronostico', sim: true, payload: {
        ok: true, sitio: S.nombre, costa_km: S.costa_km, riesgo: true, texto: texto,
        ventanas: [{ desde: 'sim-' + ahora, hasta: 'sim', horas: 5 }],
        actual: { dir_deg: 10, vel_kmh: 25, temp: 29, hum: 85, punto: 'N', desde_mar: true, brisa: true },
        fuente: 'Simulación (no son datos reales)' } };
}
const infoFase = (fz, ciclo) => ({ n: fz.i + 1, id: fz.f.id, total: FASES.length, nombre: fz.f.nombre, texto: fz.f.texto,
                                   quedan_s: Math.ceil(fz.f.dur - fz.tf), ciclo: ciclo });

if (msg.topic === 'sim/control') {
    const accion = msg.payload && msg.payload.accion;
    if (accion === 'iniciar') {
        flow.set('mvp47sim', undefined);                 // contadores de simulación desde cero
        flow.set('mvp47alertas_sim', undefined);
        const fz = faseEn(0);
        flow.set('mvp47modo', { sim: true, inicio: ahora, seq: 0, seqAmb: 0, ultRack: 0, ultAmb: 0, fase: infoFase(fz, 1) });
        node.status({ fill: 'blue', shape: 'dot', text: 'simulando: ' + fz.f.nombre });
        return [{ topic: 'viento', sim: true, payload: { dir_deg: 10, vel_kmh: 25 } },
                [estado('rack-01', 'online'), estado('amb-01', 'online'), pronosticoSimulado(), { topic: 'refrescar' }]];
    }
    if (accion === 'detener') {
        flow.set('mvp47modo', { sim: false });
        node.status({});
        return [null, { topic: 'refrescar' }];
    }
    return null;
}
if (msg.topic !== 'tick' || !M.sim) return null;

const seg = (ahora - M.inicio) / 1000;
const fz = faseEn(seg);
const ciclo = Math.floor(seg / CICLO) + 1;
const antes = M.fase ? M.fase.id : null;
const salida = [], aEval = [];
if (M.fase && ciclo !== M.fase.ciclo) salida.push({ topic: 'viento', sim: true, payload: { dir_deg: 10, vel_kmh: 25 } });   // renueva el viento cada ciclo
if (fz.f.id === 'desconexion' && antes !== 'desconexion') aEval.push(estado('amb-01', 'offline'));
if (fz.f.id !== 'desconexion' && antes === 'desconexion') aEval.push(estado('amb-01', 'online'));
if (ahora - (M.ultRack || 0) >= 2000) { salida.push(mensajeRack(fz)); M.ultRack = ahora; }
// el ambiente manda cada 1 s en la simulación (cada 5 s en el nodo real) y calla mientras está desconectado
if (fz.f.id !== 'desconexion' && ahora - (M.ultAmb || 0) >= 1000) { salida.push(mensajeAmbiente(fz)); M.ultAmb = ahora; }
M.fase = infoFase(fz, ciclo);
flow.set('mvp47modo', M);
node.status({ fill: 'blue', shape: 'dot', text: 'fase ' + M.fase.n + '/' + FASES.length + ': ' + fz.f.nombre });
return [salida.length ? salida : null, aEval.length ? aEval : null];
