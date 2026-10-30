// Telegram con cola y reintentos (corrección del 30 oct).
// Recibe: (1) avisos nuevos {payload: {text}}, (2) el resultado de cada envío {topic: 'tg-resultado'}
// y (3) un pulso cada 15 s {topic: 'tg-pulso'}. Envía de a uno y en orden al nodo http request.
// Si un envío falla (sin internet, cambio de red), reintenta a los 15 s, 1 min y luego cada 5 min.
// La cola vive en el contexto del flujo (se guarda en disco): sobrevive a un reinicio de Node-RED.
// Un aviso que sale más de 1 min tarde lleva "[retrasado, HH:MM]" con su hora original.
// El token y el chat NO van en el flujo: variables de entorno TELEGRAM_TOKEN y TELEGRAM_CHAT.
const ESPERAS = [15000, 60000, 300000];   // espera después del 1.º, 2.º y 3.º fallo (luego, 5 min)
const VIGENCIA = 2 * 3600000;             // un aviso con más de 2 h sin enviarse se descarta
const MAXIMO = 50;                        // avisos en cola como máximo
const SIN_RESPUESTA = 30000;              // si un envío no responde en 30 s, se da por fallido
const token = env.get('TELEGRAM_TOKEN');
const chat = env.get('TELEGRAM_CHAT');
if (!token || !chat) {
    node.status({ fill: 'yellow', shape: 'ring', text: 'Telegram sin configurar' });
    return null;
}
const ahora = Date.now();
const antes = JSON.stringify(flow.get('mvp47tg') || null);
const E = flow.get('mvp47tg') || { cola: [], sig: 1, enviando: null, desde: 0 };
const hora = t => new Date(t).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false });
const espera = n => ESPERAS[Math.min(n - 1, ESPERAS.length - 1)];

if (msg.topic === 'tg-resultado') {
    const r = msg.tg || {};
    if (E.enviando === r.id) E.enviando = null;
    const i = E.cola.findIndex(x => x.id === r.id);
    if (i >= 0) {
        if (r.ok) E.cola.splice(i, 1);
        else if (r.permanente) { node.warn('Telegram rechazó el aviso y se descarta (' + r.detalle + '): ' + E.cola[i].texto.slice(0, 80)); E.cola.splice(i, 1); }
        else { E.cola[i].intentos++; E.cola[i].proximo = ahora + espera(E.cola[i].intentos); E.error = r.detalle; }
    }
} else if (msg.topic !== 'tg-pulso') {
    const texto = String((msg.payload && msg.payload.text) || '').slice(0, 4000);
    if (texto) {
        E.cola.push({ id: E.sig++, texto: texto, t0: ahora, intentos: 0, proximo: ahora });
        while (E.cola.length > MAXIMO) { const d = E.cola.shift(); node.warn('Cola de Telegram llena: se descarta el aviso de las ' + hora(d.t0)); }
    }
}
E.cola = E.cola.filter(x => {
    if (ahora - x.t0 <= VIGENCIA) return true;
    node.warn('Aviso de Telegram sin enviar por más de 2 h, se descarta: ' + x.texto.slice(0, 80));
    if (E.enviando === x.id) E.enviando = null;
    return false;
});
if (E.enviando !== null && ahora - E.desde > SIN_RESPUESTA) {      // envío perdido (p. ej. reinicio a mitad)
    const x = E.cola.find(y => y.id === E.enviando);
    if (x) { x.intentos++; x.proximo = ahora + espera(x.intentos); }
    E.enviando = null;
}
let salida = null;
const h = E.cola[0];
if (E.enviando === null && h && h.proximo <= ahora) {
    E.enviando = h.id; E.desde = ahora;
    const tarde = ahora - h.t0 > 60000;
    salida = {
        url: 'https://api.telegram.org/bot' + token + '/sendMessage',
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        requestTimeout: 20000,
        payload: { chat_id: chat, text: (tarde ? '[retrasado, ' + hora(h.t0) + '] ' : '') + h.texto },
        tg: { id: h.id }
    };
}
if (!E.cola.length) delete E.error;
if (JSON.stringify(E) !== antes) flow.set('mvp47tg', E);     // escribe solo si cambió (cuida la microSD)
const n = E.cola.length;
if (!n) node.status({ fill: 'green', shape: 'dot', text: 'al día' });
else if (E.enviando !== null) node.status({ fill: 'blue', shape: 'dot', text: 'enviando · en cola: ' + n });
else node.status({ fill: 'red', shape: 'ring', text: 'sin enviar: ' + n + ' · reintento ' + new Date(E.cola[0].proximo).toLocaleTimeString('es-MX') });
return salida;
