// [4.8] Convierte un mensaje de site/datos (contrato v1) en filas para la tabla lecturas.
// Rack: una fila por posición. Ambiente: una fila con pos ''. Lo que no cumple el contrato se descarta.
const p = msg.payload;
if (!p || typeof p !== 'object' || p.schema !== 1) return null;
const id = String(p.node_id || '');
if (!/^[a-z0-9-]{1,32}$/.test(id)) return null;
const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
// Códigos de error: en el ambiente van en p.err; en el rack, en cada posición (q.err) y, si los hay, en p.err (mux).
const codigos = (...listas) => [].concat(...listas.map(l => Array.isArray(l) ? l : []))
    .filter(e => typeof e === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(e)).join(',') || null;
const ts = Date.now();
const filas = [];
if (p.type === 'rack' && Array.isArray(p.positions)) {
    for (const q of p.positions) {
        if (!q || typeof q.id !== 'string' || !/^[A-Z]$/.test(q.id)) continue;
        filas.push({ ts, node_id: id, pos: q.id, temp: num(q.temp), hum: num(q.hum), dew_point: num(q.dew_point),
                     flame: q.flame === true ? 1 : (q.flame === false ? 0 : null),
                     pm1_0: null, pm2_5: null, pm10: null, err: codigos(p.err, q.err) });
    }
} else if (p.type === 'ambiente') {
    filas.push({ ts, node_id: id, pos: '', temp: num(p.temp), hum: num(p.hum), dew_point: num(p.dew_point), flame: null,
                 pm1_0: num(p.pm1_0), pm2_5: num(p.pm2_5), pm10: num(p.pm10), err: codigos(p.err) });
}
if (!filas.length) return null;
msg.payload = filas;
return msg;
