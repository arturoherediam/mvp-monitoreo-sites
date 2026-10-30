// [4.8] Arma la consulta de la página Histórico. Entrada: '24h' o '7d' desde la página, o el refresco periódico.
// 24 h: promedio por minuto desde lecturas. 7 días: promedio por hora desde resumen_hora.
let rango = flow.get('rango_historico') || '24h';
if (msg.payload === '24h' || msg.payload === '7d') { rango = msg.payload; flow.set('rango_historico', rango); }
const H = 3600000, ahora = Date.now();
if (rango === '7d') {
    msg.topic = 'SELECT hora AS x, node_id, pos, temp_avg AS t, hum_avg AS h, pm2_5_avg AS p25, pm10_avg AS p10 ' +
                'FROM resumen_hora WHERE hora >= ' + (ahora - 7 * 24 * H) + ' ORDER BY 1';
} else {
    msg.topic = 'SELECT (ts/60000)*60000 AS x, node_id, pos, AVG(temp) AS t, AVG(hum) AS h, AVG(pm2_5) AS p25, AVG(pm10) AS p10 ' +
                'FROM lecturas WHERE ts >= ' + (ahora - 24 * H) + ' GROUP BY 1, 2, 3 ORDER BY 1';
}
msg.rango = rango;
return msg;
