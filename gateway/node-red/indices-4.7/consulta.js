// Consultar viento: arma la URL de Open-Meteo (cada hora). El nodo http request usa msg.url.
// Datos de Open-Meteo, licencia CC BY 4.0 (dar crédito en el dashboard).
const S = flow.get('mvp47sitio');
if (!S) { node.status({ fill: 'red', shape: 'ring', text: 'falta configuración del sitio' }); return null; }
const VARS = 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m';
msg.url = 'https://api.open-meteo.com/v1/forecast' +
    '?latitude=' + S.lat + '&longitude=' + S.lon +
    '&current=' + VARS + '&hourly=' + VARS +
    '&forecast_hours=24&wind_speed_unit=kmh&timezone=America%2FMexico_City';
msg.method = 'GET';
node.status({ fill: 'blue', shape: 'dot', text: 'consultando ' + S.nombre });
return msg;
