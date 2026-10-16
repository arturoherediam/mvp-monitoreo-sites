// Configuración del sitio (se ejecuta al desplegar). La leen "Calcular índices",
// "Consultar viento" y "Leer viento". Para cambiar de sitio, cambia SITIO_ACTIVO.
const SITIOS = {
    merida:   { nombre: 'Mérida, Yucatán',   lat: 20.97, lon: -89.62, costa_km: 35 },
    progreso: { nombre: 'Progreso, Yucatán', lat: 21.28, lon: -89.66, costa_km: 0 }
};
const SITIO_ACTIVO = 'merida';

flow.set('mvp47sitio', Object.assign({
    mar_desde: 290, mar_hasta: 70,   // en ambos el mar está al norte (grados de donde viene el viento)
    brisa_kmh: 15,
    hr_sal_ext: 75                   // humedad exterior para el riesgo de sal del pronóstico
}, SITIOS[SITIO_ACTIVO]));
flow.set('mvp47modo', { sim: false });      // al desplegar o reiniciar, la página vuelve a datos reales
node.status({ fill: 'blue', shape: 'dot', text: SITIOS[SITIO_ACTIVO].nombre });
return null;
