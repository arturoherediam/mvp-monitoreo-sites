// [4.8] Convierte las filas de la consulta en series para las 3 gráficas y un resumen para la página.
// Por gráfica: primero un mensaje vacío (borra lo anterior) y luego un mensaje por serie con [{x, y}].
const filas = Array.isArray(msg.payload) ? msg.payload : [];
const nombre = f => f.pos ? f.node_id + ' ' + f.pos : f.node_id;
const r1 = v => (typeof v === 'number' && isFinite(v)) ? Math.round(v * 10) / 10 : null;
function series(campo, etiqueta) {
    const s = {};
    for (const f of filas) {
        const y = r1(f[campo]);
        if (y === null) continue;
        const k = etiqueta ? nombre(f) + ' ' + etiqueta : nombre(f);
        (s[k] = s[k] || []).push({ x: f.x, y: y });
    }
    return [{ payload: [] }].concat(Object.keys(s).sort().map(k => ({ topic: k, payload: s[k] })));
}
const temp = series('t'), hum = series('h');
const pm = series('p25', 'PM2.5').concat(series('p10', 'PM10').slice(1));
const nodos = [...new Set(filas.map(nombre))].sort();
const info = { payload: { rango: msg.rango, puntos: filas.length, nodos: nodos,
                          hora: new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) } };
node.status({ fill: 'green', shape: 'dot', text: msg.rango + ' · ' + filas.length + ' filas' });
return [temp, hum, pm, info];
