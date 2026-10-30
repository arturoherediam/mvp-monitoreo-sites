// [4.8] Cada hora: recalcula el resumen de las últimas 3 horas y borra lecturas de más de DIAS días.
const DIAS = 30;
const H = 3600000;
const ahora = Date.now();
const desde = Math.floor(ahora / H) * H - 3 * H;
msg.topic =
    'INSERT OR REPLACE INTO resumen_hora ' +
    '(hora,node_id,pos,n,temp_avg,temp_min,temp_max,hum_avg,hum_min,hum_max,dew_avg,pm2_5_avg,pm2_5_max,pm10_avg,pm10_max,flama) ' +
    'SELECT (ts/' + H + ')*' + H + ', node_id, pos, COUNT(*), AVG(temp), MIN(temp), MAX(temp), AVG(hum), MIN(hum), MAX(hum), ' +
    'AVG(dew_point), AVG(pm2_5), MAX(pm2_5), AVG(pm10), MAX(pm10), MAX(flame) ' +
    'FROM lecturas WHERE ts >= ' + desde + ' GROUP BY 1, 2, 3; ' +
    'DELETE FROM lecturas WHERE ts < ' + (ahora - DIAS * 24 * H) + ';';
node.status({ fill: 'blue', shape: 'dot', text: 'resumen ' + new Date().toLocaleTimeString('es-MX') });
return msg;
