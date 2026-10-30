// [4.8] Recibe el lote de 30 s (arreglo de arreglos de filas) y arma UNA transacción.
// Una sola escritura cada 30 s cuida la microSD (acuerdo de red-y-gateway.md).
const filas = [].concat(...(Array.isArray(msg.payload) ? msg.payload : []));
if (!filas.length) return null;
const COLS = ['ts', 'node_id', 'pos', 'temp', 'hum', 'dew_point', 'flame', 'pm1_0', 'pm2_5', 'pm10', 'err'];
const v = x => (x === null || x === undefined) ? 'NULL'
             : (typeof x === 'number' ? (isFinite(x) ? String(x) : 'NULL') : "'" + String(x).replace(/'/g, "''") + "'");
const partes = [];
for (let i = 0; i < filas.length; i += 200) {
    const vals = filas.slice(i, i + 200).map(f => '(' + COLS.map(c => v(f[c])).join(',') + ')');
    partes.push('INSERT INTO lecturas(' + COLS.join(',') + ') VALUES ' + vals.join(',') + ';');
}
msg.topic = 'PRAGMA synchronous=NORMAL; BEGIN; ' + partes.join(' ') + ' COMMIT;';
msg.filas = filas.length;
node.status({ fill: 'green', shape: 'dot', text: filas.length + ' filas · ' + new Date().toLocaleTimeString('es-MX') });
return msg;
