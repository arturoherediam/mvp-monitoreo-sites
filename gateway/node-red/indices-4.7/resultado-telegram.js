// Resultado del envío a Telegram: lo regresa a la cola ("Telegram: cola y reintentos").
// No imprime la URL (lleva el token). Errores 4xx (salvo 429) son permanentes: el aviso se descarta.
const ok = msg.statusCode === 200 && !!msg.payload && msg.payload.ok === true;
const codigo = Number(msg.statusCode);
const detalle = String((msg.payload && msg.payload.description) || ('HTTP ' + msg.statusCode)).slice(0, 120);
const permanente = !ok && codigo >= 400 && codigo < 500 && codigo !== 429;
if (ok) node.status({ fill: 'green', shape: 'dot', text: 'entregado ' + new Date().toLocaleTimeString('es-MX') });
else {
    node.status({ fill: 'red', shape: 'ring', text: detalle.slice(0, 60) });
    node.warn('Telegram no aceptó el aviso: ' + detalle + (permanente ? ' (se descarta)' : ' (se reintentará)'));
}
return { topic: 'tg-resultado', tg: { id: msg.tg && msg.tg.id, ok: ok, permanente: permanente, detalle: detalle } };
