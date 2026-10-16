// Calcular índices (tarea 4.7). Entrada:
//   topic 'site/datos'    -> mensaje del contrato JSON v1 (rack o ambiente)
//   topic 'viento'        -> { dir_deg, vel_kmh } desde la API (cada hora)
//   topic 'mantenimiento' -> { indice: 'envejecimiento'|'corrosion'|'polvo'|'termico'|'condensacion'|'pms' }
// Si msg.sim === true (o el modo simulación está activo para 'mantenimiento'), usa contadores aparte:
// la simulación nunca toca los acumulados reales.
// Salida: msg.payload = { indices, actual, bitacora, aceleracion, sim }
const CFG = {
    ACELERACION: 1,                 // modo demo: 60 = una hora por minuto (declararlo al jurado).
                                    // Solo acelera lo acumulado; subidas y PM fijo usan tiempo real
                                    // (en la simulación la subida también usa tiempo simulado).
    ACELERACION_SIM: 180,           // la simulación del dashboard usa 180×: cada fase de 20 s cuenta como 1 h
    HUECO_MS: { rack: 10000, ambiente: 20000 },   // más tiempo sin datos = no se acumula
    PECK: { Ea: 0.79, n: 2.7, k: 8.617e-5, T_REF: 25, HR_REF: 50 },
    HR_ALTA: 60, HR_SAL: 75,        // ASHRAE (delicuescencia) y sal marina
    T_RECOMENDADA: 27, T_PERMITIDA: 32,           // ASHRAE recomendado y A1 permitido
    SUBIDA_C: 5, SUBIDA_MS: 15 * 60000,           // ASHRAE: máx. 5 °C en 15 min
    MARGEN_ROCIO: 3,                // °C entre temperatura y punto de rocío
    PM10_ALTO: 150,                 // µg/m³: límite diario de la EPA, usado como referencia de episodio de polvo
    MAR_DESDE: 290, MAR_HASTA: 70,  // sector del mar (grados de donde viene el viento)
    BRISA_KMH: 15,
    VIENTO_VIGENCIA_MS: 2 * 3600000,
    PM_FIJO_MS: 3600000,            // PM idéntico por 1 h = sospechoso
    VENTANA_PMS: 120,               // salud del PMS5003: últimas 120 tramas (10 min a 5 s)
    VENTANA_PMS_DEMO: 12            // con tiempo acelerado (simulación o demo): últimas 12 tramas (1 min)
};
const SITIO = flow.get('mvp47sitio');     // lo escribe "Configuración del sitio"
if (SITIO) { CFG.MAR_DESDE = SITIO.mar_desde; CFG.MAR_HASTA = SITIO.mar_hasta; CFG.BRISA_KMH = SITIO.brisa_kmh; }
const MODO = flow.get('mvp47modo') || { sim: false };
const SIM = msg.sim === true || (msg.topic === 'mantenimiento' && MODO.sim === true);
const ACEL = SIM ? CFG.ACELERACION_SIM : CFG.ACELERACION;
const VENTANA = ACEL > 1 ? CFG.VENTANA_PMS_DEMO : CFG.VENTANA_PMS;
const K = SIM ? 'mvp47sim' : 'mvp47';
const SUBIDA_MS = SIM ? CFG.SUBIDA_MS / ACEL : CFG.SUBIDA_MS;   // 15 min (simulados en la simulación)
const PASO_HIST_MS = SIM ? 30000 / ACEL : 30000;
const ahora = Date.now();

function nuevo() {
    const z = () => ({ desde: ahora });
    return {
        indices: {
            envejecimiento: Object.assign(z(), { horas_eq: 0, horas: 0 }),
            corrosion: Object.assign(z(), { h_hr60: 0, h_hr75: 0, h_brisa: 0 }),
            polvo: Object.assign(z(), { ugh: 0 }),
            termico: Object.assign(z(), { min27: 0, min32: 0, subidas: 0, ultima: null }),
            condensacion: Object.assign(z(), { min: 0 }),
            pms: Object.assign(z(), { horas: 0, ugh: 0, tramas: 0, perdidas: 0, imposibles: 0, min_fijo: 0 })
        },
        ultimo: {}, historial: {}, armado: {}, episodio: {}, viento: null, pmPrevio: null, ventanaPms: [],
        actual: {}, bitacora: []
    };
}
const S = flow.get(K) || nuevo();
S.ventanaPms = S.ventanaPms || [];
S.episodio = S.episodio || {};

const P_ = CFG.PECK;
const fTemp = t => Math.exp(P_.Ea / P_.k * (1 / (P_.T_REF + 273.15) - 1 / (t + 273.15)));   // Arrhenius
const fHum = hr => Math.pow(hr / P_.HR_REF, P_.n);                                          // humedad (Peck)
const peck = (t, hr) => hr > 0 ? fHum(hr) * fTemp(t) : null;
const num = v => typeof v === 'number' && isFinite(v);
function enMar(d) {
    return CFG.MAR_DESDE <= CFG.MAR_HASTA ? (d >= CFG.MAR_DESDE && d <= CFG.MAR_HASTA)
                                          : (d >= CFG.MAR_DESDE || d <= CFG.MAR_HASTA);
}
function brisaActiva() {
    const v = S.viento;
    if (!v || ahora - v.ts > CFG.VIENTO_VIGENCIA_MS) return null;      // sin datos de viento
    return enMar(v.dir_deg) && v.vel_kmh >= CFG.BRISA_KMH;
}
// Δt en horas (acelerado), 0 si hubo hueco o es el primer mensaje
function deltaH(id, tipo) {
    const prev = S.ultimo[id];
    S.ultimo[id] = ahora;
    if (prev === undefined) return 0;
    const dt = ahora - prev;
    if (dt <= 0 || dt > CFG.HUECO_MS[tipo]) return 0;
    return dt * ACEL / 3600000;
}
// cuánto subió una posición en la ventana de 15 min (sin modificar el historial)
function aumento(clave, t) {
    const h = S.historial[clave] || [];
    return t - Math.min.apply(null, h.map(x => x[1]).concat([t]));
}
// subidas > 5 °C en 15 min por posición; se rearma cuando vuelve a menos de la mitad
function revisarSubida(clave, t) {
    const h = (S.historial[clave] = S.historial[clave] || []);
    const ultimo = h[h.length - 1];
    if (!ultimo || ahora - ultimo[0] >= PASO_HIST_MS) h.push([ahora, t]);
    while (h.length && ahora - h[0][0] > SUBIDA_MS) h.shift();
    const min = Math.min.apply(null, h.map(x => x[1]).concat([t]));
    if (t - min > CFG.SUBIDA_C) {
        if (S.armado[clave] !== false) { S.armado[clave] = false; return true; }
    } else if (t - min < CFG.SUBIDA_C / 2) {
        S.armado[clave] = true;
    }
    return false;
}
function valido(m) {
    return m && typeof m === 'object' && m.schema === 1 && typeof m.node_id === 'string' &&
        (m.type === 'rack' ? Array.isArray(m.positions) : m.type === 'ambiente');
}
const A = S.actual;
A.subida_ahora = false;
A.subida_evento = null;          // 'nueva' | 'ahora_general' (solo en el mensaje donde ocurre)

if (msg.topic === 'viento') {
    const p = msg.payload || {};
    if (num(p.dir_deg) && num(p.vel_kmh)) S.viento = { dir_deg: p.dir_deg, vel_kmh: p.vel_kmh, ts: ahora };
} else if (msg.topic === 'mantenimiento') {
    const nombre = msg.payload && msg.payload.indice;
    if (!S.indices[nombre]) return null;
    S.indices[nombre] = nuevo().indices[nombre];
    if (nombre === 'pms') S.ventanaPms = [];
    S.bitacora.unshift({ indice: nombre, ts: ahora });
    S.bitacora = S.bitacora.slice(0, 20);
} else if (msg.topic === 'site/datos') {
    let m = msg.payload;
    if (typeof m === 'string') { try { m = JSON.parse(m); } catch (e) { return null; } }
    if (!valido(m)) return null;
    const I = S.indices;
    const dh = deltaH(m.node_id, m.type);
    const dmin = dh * 60;

    if (m.type === 'rack') {
        A.flama = m.positions.some(p => p.flame === true);
        const pos = m.positions.filter(p => num(p.temp) && num(p.hum));
        if (pos.length) {
            let peor = pos[0];
            pos.forEach(p => { if (peck(p.temp, p.hum) > peck(peor.temp, peor.hum)) peor = p; });
            const fa = peck(peor.temp, peor.hum) || 0;
            const tMax = Math.max.apply(null, pos.map(p => p.temp));
            const hrMax = Math.max.apply(null, pos.map(p => p.hum));
            const brisa = brisaActiva();
            I.envejecimiento.horas_eq += fa * dh;
            I.envejecimiento.horas += dh;
            if (hrMax > CFG.HR_ALTA) I.corrosion.h_hr60 += dh;
            if (hrMax > CFG.HR_SAL) I.corrosion.h_hr75 += dh;
            if (hrMax > CFG.HR_ALTA && brisa) I.corrosion.h_brisa += dh;
            if (tMax > CFG.T_RECOMENDADA) I.termico.min27 += dmin;
            if (tMax > CFG.T_PERMITIDA) I.termico.min32 += dmin;
            // Subida rápida: se cuenta UNA vez por episodio y se clasifica por dónde ocurrió.
            //   general: todas las posiciones con datos suben (cuarto o aire acondicionado)
            //   local:   solo algunas suben (equipo o flujo de aire cerca de esa posición)
            //   sin_comparar: solo hay una posición con datos (no se puede localizar)
            const nodo = m.node_id;
            const subieron = pos.filter(p => revisarSubida(nodo + '/' + p.id, p.temp)).map(p => p.id);
            // lo que se muestra en la página: cuánto subió la posición que más subió en la ventana de 15 min
            A.subida_15 = Math.max.apply(null, pos.map(p => aumento(nodo + '/' + p.id, p.temp)));
            const ep = S.episodio[nodo];
            const ids = pos.map(p => p.id);
            if (subieron.length && !ep) {
                // las demás posiciones acompañan si ya subieron al menos la mitad del umbral
                const acompanan = pos.filter(p => subieron.indexOf(p.id) < 0 && aumento(nodo + '/' + p.id, p.temp) >= CFG.SUBIDA_C / 2).map(p => p.id);
                const en = subieron.concat(acompanan).sort();
                const tipo = ids.length < 2 ? 'sin_comparar' : en.length === ids.length ? 'general' : 'local';
                S.episodio[nodo] = { desde: ahora, posiciones: en, tipo: tipo };
                I.termico.subidas++;
                A.subida_ahora = true; A.subida_evento = 'nueva';
            } else if (subieron.length && ep) {
                ep.posiciones = ep.posiciones.concat(subieron.filter(x => ep.posiciones.indexOf(x) < 0)).sort();
                if (ep.tipo === 'local' && ids.every(x => ep.posiciones.indexOf(x) >= 0)) { ep.tipo = 'general'; A.subida_evento = 'ahora_general'; }
            }
            if (S.episodio[nodo]) {
                const e = S.episodio[nodo];
                I.termico.ultima = { nodo: nodo, tipo: e.tipo, posiciones: e.posiciones, ts: e.desde };
                A.subida = I.termico.ultima;
                // termina cuando todas las posiciones se rearmaron
                if (!A.subida_evento && pos.every(p => S.armado[nodo + '/' + p.id] !== false)) delete S.episodio[nodo];
            }
            const margenes = pos.filter(p => num(p.dew_point)).map(p => p.temp - p.dew_point);
            const margen = margenes.length ? Math.min.apply(null, margenes) : null;
            const rocio = margen !== null && margen < CFG.MARGEN_ROCIO;
            if (rocio) I.condensacion.min += dmin;
            const tasas = pos.filter(p => num(p.rate_c_min)).map(p => p.rate_c_min);
            Object.assign(A, {
                factor: fa, f_temp: fTemp(peor.temp), f_hum: fHum(peor.hum), pos_peor: peor.id,
                t_max: tMax, hr_max: hrMax, tasa: tasas.length ? Math.max.apply(null, tasas) : null,
                margen_rocio: margen, rocio_rack: rocio
            });
        }
    } else {
        const P = I.pms;
        P.tramas++;
        const pm = [m.pm1_0, m.pm2_5, m.pm10];
        const hayPm = pm.every(num);
        let r = 'ok';
        if (!hayPm) {
            if ((m.err || []).includes('pms_sin_trama')) { P.perdidas++; r = 'perdida'; }
        } else {
            P.horas += dh;
            P.ugh += m.pm10 * dh;
            I.polvo.ugh += m.pm10 * dh;
            if (m.pm1_0 > m.pm2_5 || m.pm2_5 > m.pm10) { P.imposibles++; r = 'imposible'; }
            const firma = pm.join('/');
            if (S.pmPrevio && S.pmPrevio.firma === firma) {
                if (ahora - S.pmPrevio.desde >= CFG.PM_FIJO_MS) P.min_fijo += dmin;
            } else {
                S.pmPrevio = { firma: firma, desde: ahora };
            }
        }
        S.ventanaPms.push(r);
        while (S.ventanaPms.length > VENTANA) S.ventanaPms.shift();
        const amb = num(m.temp) && num(m.dew_point) ? m.temp - m.dew_point : null;
        if (amb !== null && amb < CFG.MARGEN_ROCIO) I.condensacion.min += dmin;
        A.margen_amb = amb;
        A.pm_confiable = !(num(m.hum) && m.hum > CFG.HR_SAL);
        A.pm10 = hayPm ? m.pm10 : null;
    }
} else {
    return null;
}

const v = S.ventanaPms;
A.pms_ventana = { n: v.length, perdidas_pct: v.length ? 100 * v.filter(x => x === 'perdida').length / v.length : 0,
                  imposibles: v.filter(x => x === 'imposible').length };
const brisaAhora = brisaActiva();
A.condiciones = {
    t27: A.t_max > CFG.T_RECOMENDADA, t32: A.t_max > CFG.T_PERMITIDA,
    hr60: A.hr_max > CFG.HR_ALTA, hr75: A.hr_max > CFG.HR_SAL,
    rocio: !!A.rocio_rack || (num(A.margen_amb) && A.margen_amb < CFG.MARGEN_ROCIO),
    brisa: brisaAhora === true, polvo: num(A.pm10) && A.pm10 >= CFG.PM10_ALTO, flama: !!A.flama
};
flow.set(K, S);
msg.payload = {
    indices: S.indices,
    actual: Object.assign({}, A, { brisa: brisaAhora, viento: S.viento }),
    bitacora: S.bitacora,
    aceleracion: ACEL,
    sim: SIM
};
return msg;
