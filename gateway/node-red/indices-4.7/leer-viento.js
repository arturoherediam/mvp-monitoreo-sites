// Leer viento: respuesta de Open-Meteo -> 2 salidas
//   1: { topic: 'viento', payload: { dir_deg, vel_kmh, temp, hum } }  para "Calcular índices"
//   2: resumen para el dashboard y Telegram: viento actual, desde el mar o no, y riesgo de sal en 24 h
const S = flow.get('mvp47sitio') || { nombre: '?', mar_desde: 290, mar_hasta: 70, brisa_kmh: 15, hr_sal_ext: 75, costa_km: null };
const HORAS_MIN_RIESGO = 2;          // ventana de al menos 2 h seguidas
const num = v => typeof v === 'number' && isFinite(v);
const enMar = d => S.mar_desde <= S.mar_hasta ? (d >= S.mar_desde && d <= S.mar_hasta)
                                               : (d >= S.mar_desde || d <= S.mar_hasta);
const brisa = (dir, vel) => enMar(dir) && vel >= S.brisa_kmh;
const PUNTOS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
const punto = d => PUNTOS[Math.round(d / 45) % 8];

function falla(texto) {
    node.status({ fill: 'red', shape: 'ring', text: texto });
    return [null, { topic: 'pronostico', payload: { ok: false, sitio: S.nombre, texto: 'Sin datos de viento (' + texto + ')' } }];
}

if (msg.statusCode !== undefined && msg.statusCode !== 200) return falla('HTTP ' + msg.statusCode);
let p = msg.payload;
if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { return falla('respuesta no es JSON'); } }
if (!p || typeof p !== 'object' || !p.hourly || !Array.isArray(p.hourly.time)) return falla('respuesta incompleta');

const H = p.hourly;
const c = p.current || {};
const act = {
    dir_deg: num(c.wind_direction_10m) ? c.wind_direction_10m : H.wind_direction_10m && H.wind_direction_10m[0],
    vel_kmh: num(c.wind_speed_10m) ? c.wind_speed_10m : H.wind_speed_10m && H.wind_speed_10m[0],
    temp: num(c.temperature_2m) ? c.temperature_2m : H.temperature_2m && H.temperature_2m[0],
    hum: num(c.relative_humidity_2m) ? c.relative_humidity_2m : H.relative_humidity_2m && H.relative_humidity_2m[0]
};
if (!num(act.dir_deg) || !num(act.vel_kmh)) return falla('sin viento actual');

// Ventanas de riesgo: brisa marina y humedad exterior alta
const hoy = (typeof c.time === 'string' ? c.time : H.time[0]).slice(0, 10);
const ventanas = [];
let v = null;
H.time.forEach((t, i) => {
    const d = H.wind_direction_10m[i], s = H.wind_speed_10m[i], hr = H.relative_humidity_2m[i];
    const riesgo = num(d) && num(s) && num(hr) && brisa(d, s) && hr >= S.hr_sal_ext;
    if (riesgo) {
        if (!v) { v = { desde: t, hasta: t, horas: 0 }; ventanas.push(v); }
        v.hasta = t; v.horas++;
    } else v = null;
});
const reales = ventanas.filter(w => w.horas >= HORAS_MIN_RIESGO);
const dia = t => t.slice(0, 10) === hoy ? 'hoy' : 'mañana';
const hora = t => t.slice(11, 16);
const fin = t => { const h = (parseInt(t.slice(11, 13), 10) + 1) % 24; return (h < 10 ? '0' : '') + h + ':00'; };
const texto = reales.length
    ? 'Riesgo de sal: ' + reales.map(w => dia(w.desde) + ' ' + hora(w.desde) + '–' + fin(w.hasta)).join(', ') +
      '. Mantén puertas cerradas y el aire o deshumidificador encendido.'
    : 'Sin riesgo de sal en las próximas 24 h.';

const desdeMar = enMar(act.dir_deg);
node.status({ fill: reales.length ? 'yellow' : 'green', shape: 'dot',
              text: punto(act.dir_deg) + ' ' + act.vel_kmh + ' km/h' + (desdeMar ? ' (del mar)' : '') });
return [
    { topic: 'viento', payload: act },
    { topic: 'pronostico', payload: {
        ok: true, sitio: S.nombre, costa_km: S.costa_km,
        actual: Object.assign({}, act, { punto: punto(act.dir_deg), desde_mar: desdeMar, brisa: brisa(act.dir_deg, act.vel_kmh) }),
        riesgo: reales.length > 0, ventanas: reales, texto: texto,
        fuente: 'Open-Meteo (CC BY 4.0)'
    } }
];
