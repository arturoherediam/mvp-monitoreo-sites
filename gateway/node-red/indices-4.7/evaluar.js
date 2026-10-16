// Evaluar umbrales (tarea 4.7). Entradas:
//   salida de "Calcular índices"   (msg.payload.indices; msg.payload.sim indica simulación)
//   topic 'pronostico'             (salida 2 de "Leer viento", o del simulador con msg.sim)
//   topic 'site/estado/<node_id>'  (MQTT directo: online / offline)
//   topic 'refrescar'              (el simulador pide redibujar la página al iniciar o detener)
// Salidas: 1 -> página de mantenimiento   2 -> mensajes para Telegram { payload: { text } }
// Umbrales: los acumulados NO son norma. REAL = valores iniciales (se ajustan en la tarea 6.5);
// DEMO = se usan cuando el tiempo va acelerado (simulación o ACELERACION > 1) y se declaran al jurado.
const U_REAL = {
    envejecimiento: { amarillo: 1.5, rojo: 3, horas_min: 24 },   // factor promedio vs 25 °C / 50 %
    corrosion: { h_hr60: 360, h_hr75: 72, h_brisa: 24 },         // horas
    polvo: { ugh: 75000 },                                        // µg·h/m³ ≈ 3 meses a 35 µg/m³ de PM10
    termico: { min27: 600, min32: 60, subidas: 3 },
    condensacion: { min: 60 },
    pms: { horas: 26280, perdidas_pct: 5, imposibles: 10, min_fijo: 60, tramas_min: 12 }   // 26 280 h ≈ 3 años
};
const U_DEMO = {
    envejecimiento: { amarillo: 1.5, rojo: 3, horas_min: 1 },
    corrosion: { h_hr60: 3, h_hr75: 1, h_brisa: 0.5 },
    polvo: { ugh: 300 },
    termico: { min27: 60, min32: 30, subidas: 1 },
    condensacion: { min: 30 },
    pms: { horas: 26280, perdidas_pct: 5, imposibles: 3, min_fijo: 60, tramas_min: 6 }
};
const AMARILLO = 0.7;               // carga ≥ 70 % del umbral
const ESPERA_MS = 10 * 60000, ESPERA_FLAMA_MS = 2 * 60000, ESPERA_EPISODIO_MS = 30 * 60000;
const SUBIDA_VISIBLE_MS = 15 * 60000, SUBIDA_VISIBLE_SIM_MS = 20000;   // cuánto se muestra una subida en "Atender ahora"
// tareas por evento: lo que se muestra en "Atender ahora" y se manda por Telegram
const ACCION = {
    flama: 'Verifica el rack de inmediato y ten a mano el extintor',
    subida: 'Revisa el aire acondicionado y la ventilación del cuarto',
    t32: 'Revisa el aire acondicionado ya; si no enfría, abre el cuarto o apaga equipos no esenciales',
    subida_local: 'Revisa el equipo y el flujo de aire cerca de esa posición (rejillas, paneles ciegos, ventiladores)',
    offline: 'Revisa su alimentación y la conexión Wi-Fi',
    pms: 'Revisa su conexión o límpialo; si sigue fallando, reemplázalo',
    rocio: 'Deshumidifica o ventila, y busca puntos fríos'
};
const TXT = {
    envejecimiento: ['Envejecimiento de equipos', 'Revisar enfriamiento y deshumidificación'],
    corrosion: ['Corrosión por sal y humedad', 'Inspeccionar y limpiar tarjetas, sellar el cuarto'],
    polvo: ['Polvo en servidores', 'Limpiar ventiladores y filtros'],
    termico: ['Eventos de temperatura', 'Revisar el aire acondicionado y su horario'],
    condensacion: ['Riesgo de condensación', 'Deshumidificar y buscar puntos fríos'],
    pms: ['Salud del sensor de partículas', 'Limpiar o reemplazar el PMS5003']
};
// condiciones que se registran como eventos: [icono, al empezar, al terminar, nivel]
const COND = {
    flama: ['🔥', 'Flama detectada en el rack', 'Flama apagada', 'critico'],
    t32: ['🌡️', 'Temperatura sobre 32 °C (fuera del rango permitido A1)', 'Temperatura bajó de 32 °C', 'critico'],
    t27: ['🌡️', 'Temperatura sobre 27 °C (fuera del rango recomendado)', 'Temperatura bajó de 27 °C', 'aviso'],
    rocio: ['💧', 'Cerca del punto de rocío (riesgo de condensación)', 'Fuera de riesgo de condensación', 'critico'],
    hr75: ['💦', 'Humedad sobre 75 %: la sal se activa', 'Humedad bajó de 75 %', 'critico'],
    hr60: ['💦', 'Humedad sobre 60 % (límite ASHRAE)', 'Humedad bajó de 60 %', 'aviso'],
    brisa: ['🌊', 'Viento del mar con fuerza para llevar sal', 'Terminó el viento del mar', 'info'],
    polvo: ['🌫️', 'Episodio de polvo (PM10 ≥ 150 µg/m³)', 'Terminó el episodio de polvo', 'aviso'],
    pms: ['📟', 'Sensor de partículas con fallas', 'Sensor de partículas recuperado', 'aviso']
};
const MODO = flow.get('mvp47modo') || { sim: false };
const t = msg.topic || '';
const P = msg.payload || {};
const SIM = t === 'refrescar' ? MODO.sim === true : (P.sim === true || msg.sim === true);
if (SIM && !MODO.sim) return null;                       // mensaje de una simulación ya detenida
const K = SIM ? 'mvp47alertas_sim' : 'mvp47alertas';
const ahora = Date.now();
const S = flow.get(K) || { enviado: {}, alertado: {}, desde: {}, cond: {}, condDesde: {}, flama: false, subidas: 0,
                           pronostico: null, firmaPron: '', nodos: {}, ultimo: null, eventos: [] };
S.eventos = S.eventos || []; S.cond = S.cond || {}; S.condDesde = S.condDesde || {};
const salidaTg = [];
const r1 = v => Math.round(v * 10) / 10;
const yy = a => a.length > 1 ? a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1] : a.join('');
// descripción de una subida: dónde fue y qué hacer
function lugarSubida(s) {
    if (!s) return { donde: '', corto: '', accion: ACCION.subida };
    const p = s.posiciones || [];
    if (s.tipo === 'local') return { donde: 'solo en la posición ' + yy(p) + ' del rack', corto: 'local en ' + yy(p),
        accion: ACCION.subida_local.replace('esa posición', (p.length > 1 ? 'las posiciones ' : 'la posición ') + yy(p)) };
    if (s.tipo === 'sin_comparar') return { donde: 'en la posición ' + yy(p) + ' (la otra posición no tiene datos)', corto: 'en ' + yy(p), accion: ACCION.subida };
    return { donde: 'en todo el rack (posiciones ' + yy(p) + ')', corto: 'todo el rack', accion: ACCION.subida };
}
const PREFIJO = SIM ? '[SIMULACIÓN] ' : '';

function enviar(clave, texto, espera) {
    const prev = S.enviado[clave];
    if (prev && ahora - prev < (espera === undefined ? ESPERA_MS : espera)) return;
    S.enviado[clave] = ahora;
    salidaTg.push({ payload: { text: PREFIJO + texto } });
}
function evento(icono, texto, nivel) {
    S.eventos.unshift({ ts: ahora, icono: icono, texto: texto, nivel: nivel });
    S.eventos = S.eventos.slice(0, 20);
}
const nivel = c => c >= 1 ? 'rojo' : c >= AMARILLO ? 'amarillo' : 'verde';
const RANGO = { verde: 0, amarillo: 1, rojo: 2 };

function pmsFalla(A, U) {
    const w = A.pms_ventana;
    return !!w && w.n >= U.pms.tramas_min && (w.perdidas_pct > U.pms.perdidas_pct || w.imposibles >= U.pms.imposibles);
}
function cargas(I, A, U) {
    const e = I.envejecimiento, c = I.corrosion, tm = I.termico, p = I.pms, w = A.pms_ventana || { n: 0, perdidas_pct: 0, imposibles: 0 };
    const ue = U.envejecimiento;
    const factor = e.horas > 0 ? e.horas_eq / e.horas : 0;
    const cargaEnv = e.horas < ue.horas_min ? 0
        : factor >= ue.rojo ? 1
        : factor >= ue.amarillo ? AMARILLO + (1 - AMARILLO) * (factor - ue.amarillo) / (ue.rojo - ue.amarillo)
        : AMARILLO * factor / ue.amarillo;
    const ventanaOk = w.n >= U.pms.tramas_min;
    return {
        envejecimiento: { carga: cargaEnv, valor: 'Promedio ' + r1(factor) + '× · ' + r1(e.horas_eq) + ' h equivalentes en ' + r1(e.horas) + ' h' +
                          (e.horas < ue.horas_min ? ' (se evalúa desde ' + ue.horas_min + ' h)' : '') },
        corrosion: { carga: Math.max(c.h_hr60 / U.corrosion.h_hr60, c.h_hr75 / U.corrosion.h_hr75, c.h_brisa / U.corrosion.h_brisa),
                     valor: r1(c.h_hr60) + ' h con HR > 60 % · ' + r1(c.h_hr75) + ' h > 75 % · ' + r1(c.h_brisa) + ' h con brisa marina' },
        polvo: { carga: I.polvo.ugh / U.polvo.ugh, valor: Math.round(I.polvo.ugh) + ' µg·h/m³ de PM10 acumulado' },
        termico: { carga: Math.max(tm.min27 / U.termico.min27, tm.min32 / U.termico.min32, tm.subidas / U.termico.subidas),
                   valor: Math.round(tm.min27) + ' min > 27 °C · ' + Math.round(tm.min32) + ' min > 32 °C · ' + tm.subidas + (tm.subidas === 1 ? ' subida rápida' : ' subidas rápidas') + (tm.ultima ? ' (última: ' + lugarSubida(tm.ultima).corto + ')' : '') },
        condensacion: { carga: I.condensacion.min / U.condensacion.min, valor: Math.round(I.condensacion.min) + ' min cerca del punto de rocío' },
        pms: { carga: Math.max(p.horas / U.pms.horas, ventanaOk ? w.perdidas_pct / U.pms.perdidas_pct : 0,
                               ventanaOk ? w.imposibles / U.pms.imposibles : 0, p.min_fijo / U.pms.min_fijo),
               valor: 'Ahora (últimas ' + w.n + ' tramas): ' + r1(w.perdidas_pct) + ' % perdidas, ' + w.imposibles + ' imposibles · ' +
                      Math.round(p.horas) + ' h de uso (' + r1(100 * p.horas / U.pms.horas) + ' % de su vida)' }
    };
}

if (P.indices) {
    const U = P.aceleracion > 1 ? U_DEMO : U_REAL;
    const A = P.actual || {};
    const C = cargas(P.indices, A, U);
    const tarjetas = Object.keys(TXT).map(id => {
        const est = nivel(C[id].carga);
        if (S.desde[id] !== P.indices[id].desde) { S.desde[id] = P.indices[id].desde; S.alertado[id] = 'verde'; }  // hubo mantenimiento
        if (RANGO[est] > RANGO[S.alertado[id] || 'verde']) {     // cada nivel avisa una sola vez por ciclo de mantenimiento
            S.alertado[id] = est;
            enviar('indice/' + id + '/' + est, (est === 'rojo' ? '🔴 ' : '🟡 ') + TXT[id][0] + ': ' +
                   (est === 'rojo' ? 'mantenimiento necesario' : 'acercándose al umbral') + '.\n' + C[id].valor + '\nAcción: ' + TXT[id][1], 0);
        }
        return { id: id, titulo: TXT[id][0], estado: est, carga: Math.min(C[id].carga, 1.5), valor: C[id].valor, accion: TXT[id][1],
                 dias: Math.floor((ahora - P.indices[id].desde) / 86400000) };
    });
    // condiciones actuales -> eventos de inicio y fin
    const cond = Object.assign({}, A.condiciones || {}, { pms: pmsFalla(A, U) });
    Object.keys(COND).forEach(k => {
        const antes = !!S.cond[k], ya = !!cond[k];
        if (ya && !antes) { S.condDesde[k] = ahora; evento(COND[k][0], COND[k][1], COND[k][3]); }
        if (!ya && antes) {
            const min = Math.round((ahora - (S.condDesde[k] || ahora)) / 60000);
            evento('✓', COND[k][2] + ' (duró ' + (min < 1 ? 'menos de 1' : min) + ' min)', 'info');
        }
        S.cond[k] = ya;
    });
    if (A.flama && !S.flama) enviar('flama', '🔥 FLAMA detectada en el rack.\nAcción: ' + ACCION.flama + '.', ESPERA_FLAMA_MS);
    if (A.flama !== undefined) S.flama = !!A.flama;
    if (A.subida_evento && A.subida) {
        const L = lugarSubida(A.subida);
        const clave = 'subida/' + A.subida.tipo + '/' + (A.subida.tipo === 'local' ? A.subida.posiciones.join('') : '');
        if (A.subida_evento === 'nueva') {
            evento('📈', 'Subida rápida ' + L.donde + ': más de 5 °C en 15 min (máx. ' + r1(A.t_max) + ' °C)', 'critico');
            enviar(clave, '🌡️ Subida rápida de temperatura ' + L.donde + ': más de 5 °C en 15 min. Temperatura máxima: ' + r1(A.t_max) + ' °C.\nAcción: ' + L.accion + '.');
        } else {                                            // empezó en una posición y ya abarca todo el rack
            evento('📈', 'La subida rápida ahora abarca todo el rack (posiciones ' + yy(A.subida.posiciones) + ')', 'critico');
            enviar(clave, '🌡️ La subida rápida ahora abarca todo el rack (posiciones ' + yy(A.subida.posiciones) + ').\nAcción: ' + L.accion + '.');
        }
        S.subidaHasta = ahora + (SIM ? SUBIDA_VISIBLE_SIM_MS : SUBIDA_VISIBLE_MS);
        S.ultSubida = A.subida;
    }
    S.tMax = A.t_max;
    const margenes = [A.margen_rocio, A.margen_amb].filter(x => typeof x === 'number');
    const margen = margenes.length ? Math.min.apply(null, margenes) : null;
    if (cond.rocio && S.condDesde.rocio === ahora)
        enviar('rocio', '💧 Riesgo de condensación: ' + (margen === null ? '' : 'solo ' + r1(margen) + ' °C sobre el punto de rocío.') +
               '\nAcción: ' + ACCION.rocio + '.', ESPERA_EPISODIO_MS);
    if (cond.t32 && S.condDesde.t32 === ahora)
        enviar('t32', '🌡️ El rack superó 32 °C (fuera del rango permitido A1): ' + r1(A.t_max) + ' °C.\nAcción: ' + ACCION.t32 + '.', ESPERA_EPISODIO_MS);
    if (cond.pms && S.condDesde.pms === ahora) {
        const w = A.pms_ventana || {};
        enviar('pms', '📟 Sensor de partículas con fallas: ' + r1(w.perdidas_pct || 0) + ' % tramas perdidas y ' + (w.imposibles || 0) +
               ' valores imposibles en las últimas ' + (w.n || 0) + ' tramas.\nAcción: ' + ACCION.pms + '.', ESPERA_EPISODIO_MS);
    }
    S.ultimo = { tarjetas: tarjetas, actual: A, bitacora: P.bitacora, aceleracion: P.aceleracion };
} else if (t === 'pronostico') {
    S.pronostico = P;
    const firma = P.ok && P.riesgo ? P.ventanas.map(w => w.desde).join(',') : '';
    if (firma && firma !== S.firmaPron) {
        evento('🌊', P.texto, 'aviso');
        enviar('pronostico/' + firma, '🌊 ' + P.texto + ' (' + P.sitio + ')', 0);
    }
    S.firmaPron = firma;
} else if (t.indexOf('site/estado/') === 0) {
    let p = P;
    if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { return null; } }
    const id = t.slice('site/estado/'.length);
    if (!p || p.node_id !== id || (p.status !== 'online' && p.status !== 'offline')) return null;
    const antes = S.nodos[id];
    if (p.status !== antes) {
        if (p.status === 'offline') { evento('⚠️', 'Nodo ' + id + ' desconectado', 'critico'); enviar('offline/' + id, '⚠️ Nodo ' + id + ' desconectado.\nAcción: ' + ACCION.offline + '.', 0); }
        else if (antes === 'offline') { evento('✅', 'Nodo ' + id + ' reconectado', 'info'); enviar('online/' + id, '✅ Nodo ' + id + ' reconectado.', 0); }
    }
    S.nodos[id] = p.status;
} else if (t !== 'refrescar') {
    return null;
}

flow.set(K, S);
const tarjetas = S.ultimo ? S.ultimo.tarjetas : [];
const peor = tarjetas.reduce((m, x) => RANGO[x.estado] > RANGO[m] ? x.estado : m, 'verde');
const general = S.flama || Object.values(S.nodos).includes('offline') ? 'rojo' : peor;
const activos = Object.keys(COND).filter(k => S.cond[k]).map(k => ({ icono: COND[k][0], texto: COND[k][1], nivel: COND[k][3] }));
// "Atender ahora": tareas por evento activas, de la más grave a la menos grave, con su acción
const atender = [];
if (S.flama) atender.push({ id: 'flama', icono: '🔥', texto: 'Flama detectada en el rack', accion: ACCION.flama, nivel: 'critico' });
Object.keys(S.nodos).filter(k => S.nodos[k] === 'offline').forEach(k =>
    atender.push({ id: 'offline', icono: '⚠️', texto: 'Nodo ' + k + ' desconectado', accion: ACCION.offline, nivel: 'critico' }));
if (S.subidaHasta && ahora < S.subidaHasta) {
    const L = lugarSubida(S.ultSubida);
    atender.push({ id: 'subida', tipo: S.ultSubida ? S.ultSubida.tipo : 'general', icono: '🌡️', texto: 'Subida rápida de temperatura ' + L.donde,
                   accion: L.accion, nivel: 'critico' });
}
if (S.cond.t32) atender.push({ id: 't32', icono: '🌡️', texto: 'Temperatura sobre 32 °C (' + r1((S.ultimo && S.ultimo.actual.t_max) || 0) + ' °C)', accion: ACCION.t32, nivel: 'critico' });
if (S.cond.rocio) atender.push({ id: 'rocio', icono: '💧', texto: 'Riesgo de condensación', accion: ACCION.rocio, nivel: 'critico' });
if (S.cond.pms) atender.push({ id: 'pms', icono: '📟', texto: 'Sensor de partículas con fallas', accion: ACCION.pms, nivel: 'aviso' });
const pagina = (SIM === !!MODO.sim) ? {
    topic: 'tablero',
    payload: Object.assign({}, S.ultimo || {}, { general: general, pronostico: S.pronostico, nodos: S.nodos,
        eventos: S.eventos, activos: activos, atender: atender, pms_falla: !!S.cond.pms, modo: { sim: !!MODO.sim, fase: MODO.fase || null } })
} : null;                                                 // datos reales durante una simulación: solo alertas
return [pagina, salidaTg.length ? salidaTg : null];
