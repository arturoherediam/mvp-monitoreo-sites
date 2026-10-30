# Índices de mantenimiento

Reemplaza al "índice de dosis acumulada" (tarea 4.7). Los nodos **no cambian**: siguen enviando el contrato JSON v1. Todo se calcula en **Node-RED** (laptop ahora, Orange Pi después).

## Objetivo

Proteger sitios pequeños de servidores en zonas costeras cuando nadie está viendo (noches, fines de semana, apagones), y decir **cuándo dar mantenimiento** según el estrés acumulado.

> No predecimos el día exacto de una falla. Medimos el estrés ambiental acumulado con modelos y límites publicados, y avisamos cuándo actuar.

## Índices

Cada índice se acumula con el tiempo y se reinicia con el botón **"Mantenimiento hecho"**.

| Índice | Cálculo | Datos | Acción al llegar al umbral |
|---|---|---|---|
| Envejecimiento | Modelo de Peck: `FA = (HR/50)^2.7 · exp[(0.79/k)(1/298.15 − 1/T)]`, `k = 8.617e-5 eV/K`, T en kelvin. Se suman horas equivalentes `FA · Δt`. Referencia 25 °C y 50 % = 1 | temp, hum | Revisar enfriamiento y deshumidificación |
| Corrosión por sal | Horas con HR > 60 % y > 75 %, y horas en que además hay **brisa marina** (viento desde el mar y ≥ 15 km/h) | hum, viento (API) | Inspeccionar y limpiar tarjetas, sellar el cuarto |
| Polvo | `PM10 · Δt` acumulado (µg·h/m³) | pm10 | Limpiar ventiladores y filtros |
| Eventos térmicos | Minutos > 27 °C y > 32 °C; subidas > 5 °C en 15 min | temp | Revisar aire acondicionado y horario |
| Condensación | Minutos con `temp − dew_point < 3 °C` | temp, dew_point | Deshumidificar, buscar puntos fríos |
| Salud del PMS5003 | **Ahora:** % de tramas perdidas (`pms_sin_trama`) y valores imposibles (PM1.0 > PM2.5 o PM2.5 > PM10) en las **últimas 120 tramas (10 min)**: si el sensor se recupera, la tarjeta vuelve a verde. **Acumulado:** horas de uso (vida útil) y PM fijo por más de 1 h | pm, err | Limpiar o reemplazar el sensor |

Ejemplos del factor de envejecimiento: 22 °C / 45 % → 0.55; 27 °C / 60 % → 2.0; 30 °C / 80 % → 5.9.

Lecturas de partículas con HR > 75 % se marcan como **poco confiables** (las partículas absorben agua y se leen de más).

## Brisa marina (API de viento)

- Fuente: **Open-Meteo**, gratis para uso no comercial y educativo, sin clave, datos CC BY 4.0 (hay que dar crédito). Límite: menos de 10 000 consultas al día; usamos 24.
- Consulta cada hora: viento actual, humedad y temperatura exterior, y pronóstico de 24 h.
- Sitio por defecto: **Mérida, Yucatán** (a unos 35 km de la costa); **Progreso** ya está configurado como alternativa costera. En ambos el mar queda al norte: entre 290° y 70°. Se cambia en el nodo "Configuración del sitio".
- En Mérida el viento del mar llega con mucha menos sal que en la costa: ahí el contador de brisa es una señal aproximada.
- Sin internet: el índice usa solo datos internos y el dashboard muestra "sin datos de viento".

## Alertas por Telegram

- **Inmediatas:** flama, subida rápida de temperatura, temperatura sobre 32 °C (por ejemplo, aire apagado de noche con subida lenta), nodo desconectado, riesgo de condensación y sensor de partículas con fallas. Cada una dice qué hacer ("Acción: …").
- **Preventivas:** pronóstico de brisa marina con humedad alta; índice que llega a su umbral.
- Cada nivel (amarillo, rojo) de un índice avisa **una vez por ciclo de mantenimiento**; flama, subidas, nodos y pronóstico avisan una vez por evento. Condensación y sensor de partículas avisan al empezar cada episodio, como máximo uno cada 30 min.
- El token del bot va en una **variable de entorno**, nunca en el flujo ni en el repo.
- **Sin internet no se pierden:** los avisos esperan en una cola guardada en disco y se reintentan a los 15 s, 1 min y luego cada 5 min, en orden y de a uno. Si salen más de 1 min tarde llevan **[retrasado, HH:MM]** con su hora original. Se descartan (y se registra) si pasan 2 h sin enviarse, si la cola pasa de 50 o si Telegram los rechaza (token o chat incorrectos). Las alertas en pantalla no dependen de internet.

## Dashboard: pestaña Mantenimiento

- **Ahora:** 7 mosaicos con el nivel actual de cada factor de desgaste, en color: envejecimiento (factor × y cuánto aporta la temperatura y cuánto la humedad), humedad (60 % y 75 %, viento del mar), temperatura (27 y 32 °C), subida de temperatura en los últimos 15 min (la misma cifra que usa el aviso: amarillo desde 2.5 °C, rojo arriba de 5 °C; abajo, el cambio en °C/min como dato), margen a la condensación, polvo PM10 (referencias 45 de la OMS y 150 de la EPA, límites diarios de salud usados como indicadores) y salud del sensor de partículas.
- **Atender ahora** (arriba, solo cuando hay algo): flama (grande y en rojo), nodo desconectado, subida rápida (visible 15 min), temperatura sobre 32 °C, riesgo de condensación y sensor de partículas con fallas, cada uno con su acción.
- **Subidas rápidas:** se cuentan **una vez por episodio** (aunque las vean las dos posiciones del rack) y se clasifican por dónde ocurrieron: **todo el rack** (A y B suben: cuarto o aire acondicionado → revisar el aire) o **local** (solo una posición sube y la otra se queda a menos de 2.5 °C: equipo o flujo de aire cerca de esa posición → revisar rejillas, paneles ciegos y ventiladores). Si una subida empieza local y después sube la otra posición, el mismo episodio pasa a "todo el rack" y se avisa otra vez. Si una posición no tiene datos, no se clasifica como local. Con dos sensores se localiza una **zona** del rack, no un servidor: para fallas de un servidor (ventilador, CPU) la fuente correcta son sus propios sensores (IPMI/BMC).
- La subida rápida se avisa en cuanto una posición queda **más de 5 °C arriba de su lectura más baja de los últimos 15 min**: no espera los 15 min (a 1 °C/min avisa a los 5 min, a 2 °C/min a los 2.5 min). Una subida más lenta que ~0.33 °C/min (20 °C/h) nunca es "rápida": para ese caso está el aviso de más de 32 °C.
- **Activos ahora** y **Eventos recientes:** condiciones que están ocurriendo y las últimas 20 (inicio, fin con duración, flama, subidas, nodos, pronóstico).
- **Acumulados:** una tarjeta por índice con barra hacia el umbral, semáforo, días desde el último mantenimiento, acción y botón "Mantenimiento hecho".
- Tarjeta **Afuera** (viento del mar o de tierra, humedad y temperatura exterior) y banner de riesgo de sal para las próximas 24 h.

## Umbrales

Los acumulados **no tienen norma**: son valores iniciales que se ajustan en la tarea 6.5. Con el tiempo acelerado (simulación o demo) se usan umbrales de demostración, y se declara al jurado.

| Índice | Real | Demostración (tiempo acelerado) |
|---|---|---|
| Envejecimiento | Factor promedio 1.5× (amarillo) y 3× (rojo), evaluado desde 24 h de datos | Igual, desde 1 h |
| Corrosión | 360 h con HR > 60 %, 72 h > 75 %, 24 h con brisa marina | 3 h, 1 h y 0.5 h |
| Polvo | 75 000 µg·h/m³ (unos 3 meses a 35 µg/m³; intervalo común de limpieza) | 300 µg·h/m³ |
| Eventos térmicos | 600 min > 27 °C, 60 min > 32 °C, 3 subidas rápidas | 60 min, 30 min, 1 subida |
| Condensación | 60 min | 30 min |
| Sensor de partículas | > 5 % de tramas perdidas o 10 imposibles en 10 min; 26 280 h de uso (~3 años) | > 5 % o 3 imposibles en 1 min |

Amarillo desde el 70 % del umbral; rojo al 100 %.

## Modo simulación

Botón **Iniciar simulación** en la página. Recorre **9 fases de 20 s** (3 min por ciclo, y se repite): oficina normal, noche sin aire acondicionado con viento del mar, condensación, subida rápida en todo el rack a 33 °C, subida rápida local (solo la posición A), flama en el rack, nodo de ambiente desconectado, episodio de polvo y falla del sensor de partículas. Usa tiempo acelerado 180× (cada fase cuenta como 1 h) y umbrales de demostración.

- En el primer ciclo las 6 tarjetas llegan a rojo y se prueban todos los avisos: los 6 índices, pronóstico de sal, condensación, subida rápida de todo el rack y local, flama, nodo desconectado y reconectado, y sensor con fallas. En los ciclos siguientes se repiten flama y nodo; los demás respetan su espera.
- En la simulación la subida rápida y el cambio en °C/min se miden en tiempo simulado (15 min simulados = 5 s). Antes del 16 oct el °C/min de la simulación se calculaba en tiempo real y mostraba ~22 °C/min en la fase 2, aunque esa subida es lenta (0.12 °C/min simulados).

- Usa **contadores aparte**: los acumulados reales no se tocan y al detener la página vuelve a los datos reales.
- Los avisos simulados llegan a Telegram con el prefijo **[SIMULACIÓN]**. Los avisos reales (por ejemplo, una flama) siguen funcionando durante la simulación.
- No pasa por MQTT: la página 4.3 no muestra datos simulados (para eso está `tools/simulador/`).

## Reglas de cálculo

- No se acumula en huecos: si un nodo estuvo desconectado, ese tiempo no cuenta.
- **Modo demo:** factor de aceleración (60× = un minuto real cuenta como una hora; la simulación usa 180×), apagado por defecto y declarado al jurado. Solo acelera los acumulados; las subidas rápidas y el PM fijo usan tiempo real. Activa los umbrales de demostración.

## Límites (decirlos al jurado)

- No medimos sal ni gases corrosivos. Medimos las condiciones que los activan: humedad, condensación, partículas y brisa marina.
- Peck usa parámetros de literatura (Ea = 0.79 eV, n = 2.7). Da riesgo **relativo**, no probabilidad de falla.
- El PMS5003 es un sensor de bajo costo: sus lecturas son indicativas.

## Fases

1. **Ahora (laptop):** índices, API de viento, Telegram y pestaña Mantenimiento. Persistencia en el almacén de contexto de archivo de Node-RED.
2. **Con Orange Pi y SQLite (4.6 y 4.8):** totales e historial en SQLite con resúmenes por hora, página de reportes y salud del gateway. La hora se sincroniza desde la laptop con chrony.

## Uso

Instalación, Telegram, modo demo y pruebas: [gateway/node-red/indices-4.7/README.md](../../gateway/node-red/indices-4.7/README.md).

## Referencias

- ASHRAE TC 9.9, *Thermal Guidelines*, 5.ª ed.: rangos recomendado (18–27 °C) y permitido A1 (15–32 °C), cambio máximo de 5 °C en 15 min.
- Límites ASHRAE de contaminación (publicados por Lenovo): ISO 14644-1 clase 8, humedad de delicuescencia > 60 %.
- Peck (1986): modelo temperatura-humedad.
- ISO 9223: concepto de tiempo de humectación como base de la corrosividad atmosférica.
- Open-Meteo: datos de viento y pronóstico (CC BY 4.0).
