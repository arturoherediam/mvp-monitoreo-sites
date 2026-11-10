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

Umbrales **teóricos** (tarea 6.5, 10 nov): cada valor tiene su fuente o se declara como criterio del equipo. **No se calibraron en sitios de servidores reales**; validarlos en campo es trabajo futuro y se dice así al jurado. Con el tiempo acelerado (simulación o demo) se usan los umbrales de demostración.

Tipo: **Fuente** = el número sale de una norma, guía o hoja de datos. **Derivado** = se calcula a partir de valores con fuente. **Criterio** = ninguna norma lo define; es decisión del equipo.

| Índice | Real (rojo) | Fuente o razón | Tipo | Demostración |
|---|---|---|---|---|
| Envejecimiento | Factor promedio 1.5× (amarillo) y 3× (rojo), desde 24 h de datos | Modelo de Peck (Ea 0.79 eV, n ≈ 2.7) [1]. 2× = borde de lo recomendado por ASHRAE (27 °C / 60 %) [2]; 3× ≈ 27 °C con 70 % o 25 °C con 75 % (la sal se activa) [2, 4] | Derivado | Igual, desde 1 h |
| Corrosión, HR > 75 % | 10 h | ISO 9223: tiempo de humectación de un interior con clima controlado τ1 ≤ 10 h al año [5]. 75 % = delicuescencia del NaCl, 75.3 % a 25 °C [4] | Fuente | 1 h |
| Corrosión, HR > 60 % | 250 h | ISO 9223: τ2 ≤ 250 h al año, interior sin control de clima [5]. 60 % = humedad de delicuescencia del polvo según ASHRAE [3] | Fuente | 3 h |
| Corrosión, brisa marina | 24 h con viento del mar ≥ 15 km/h | 15 km/h ≈ 4 m/s, inicio de la espuma (*whitecaps*) que produce el aerosol marino [6]. Las 24 h: criterio | Fuente (viento) y criterio (horas) | 0.5 h |
| Polvo | 32 400 µg·h/m³ = 90 días a 15 µg/m³ | Guía anual de PM10 de la OMS 2021: 15 µg/m³ [7]; 90 días = intervalo de limpieza trimestral (criterio). El PMS5003 tiene ±10 µg/m³ abajo de 100 µg/m³ [10]: la dosis es aproximada | Fuente y criterio | 300 µg·h/m³ |
| Eventos térmicos | 600 min > 27 °C, 60 min > 32 °C, 3 subidas rápidas | Límites de ASHRAE: recomendado 18–27 °C, permitido A1 15–32 °C, máximo 5 °C en 15 min [2]. ASHRAE **no define** cuánto tiempo se puede estar en el rango permitido ("periodos cortos sin definir"; su herramienta es el factor X) [8]: los minutos son criterio | Fuente (límites) y criterio (minutos) | 60 min, 30 min, 1 subida |
| Condensación | 60 min con margen < 3 °C | Margen de 3 °C sobre el punto de rocío de ISO 8502-4 [9]. Los 60 min son criterio, más estrictos que τ1 de ISO 9223 [5] | Fuente (margen) y criterio (minutos) | 30 min |
| Sensor de partículas | > 25 % de tramas perdidas o 10 imposibles en 10 min; 26 280 h de uso | 26 280 h = MTTF ≥ 3 años de Plantower [10]. 25 % = la EPA exige al menos 75 % de datos para un promedio válido [11]. "Imposible" = PM1.0 > PM2.5 o PM2.5 > PM10, porque cada fracción incluye a la menor. Las 10 imposibles: criterio | Fuente y criterio | > 25 % o 3 imposibles en 1 min |

Otros valores con fuente: subida rápida > 5 °C en 15 min [2]; subida local si la otra posición sube menos de 2.5 °C (la mitad del límite de ASHRAE, derivado); episodio de polvo con PM10 ≥ 150 µg/m³ (límite de 24 h de la EPA) [11]; partículas poco confiables con HR > 75 %, porque el sensor Plantower lee de más [12]. Amarillo desde el 70 % del umbral (criterio).

Cambios del 10 nov (6.5): corrosión > 75 % de 72 h a 10 h, > 60 % de 360 h a 250 h, polvo de 75 000 a 32 400 µg·h/m³ (los anteriores no tenían fuente) y tramas perdidas de 5 % a 25 %.

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

1. Peck, D. S. (1986). Comprehensive model for humidity testing correlation. *IEEE International Reliability Physics Symposium*, 44–50. Parámetros típicos: n de 2.5 a 3 y Ea de 0.7 a 0.9 eV.
2. ASHRAE TC 9.9, *Thermal Guidelines for Data Processing Environments*, 5.ª ed. (2021): recomendado 18–27 °C y punto de rocío −9 a 15 °C con HR máxima de 60 %; permitido A1 15–32 °C; cambio máximo de 20 °C por hora y de 5 °C en 15 min.
3. ASHRAE TC 9.9, *Gaseous and Particulate Contamination Guidelines for Data Centers* (2011), publicados por fabricantes (por ejemplo Lenovo): limpieza ISO 14644-1 clase 8 y humedad de delicuescencia del polvo > 60 %.
4. Greenspan, L. (1977). Humidity fixed points of binary saturated aqueous solutions. *Journal of Research of the National Bureau of Standards*, 81A(1), 89–96. NaCl: 75.47 % a 20 °C, 75.29 % a 25 °C, 75.09 % a 30 °C.
5. ISO 9223 (1992; revisada en 2012). Corrosión de metales: corrosividad de la atmósfera. Tiempo de humectación: horas con HR > 80 % y T > 0 °C; τ1 ≤ 10 h/año (interior con clima controlado), τ2 ≤ 250 h/año (interior sin control de clima).
6. O'Dowd, C. D. y de Leeuw, G. (2007). Marine aerosol production: a review of the current knowledge. *Phil. Trans. R. Soc. A*, 365, 1753–1774: la espuma empieza con viento de unos 4 m/s.
7. OMS (2021). *Global Air Quality Guidelines*: PM10 15 µg/m³ anual y 45 µg/m³ en 24 h.
8. Upsite Technologies, serie sobre los rangos recomendado y permitido de ASHRAE (rango permitido para "periodos cortos sin definir" y factor X).
9. ISO 8502-4: la superficie debe estar al menos 3 °C arriba del punto de rocío.
10. Plantower, hoja de datos del PMS5003: MTTF ≥ 3 años; error de ±10 µg/m³ de 0 a 100 µg/m³ y ±10 % de 100 a 500 µg/m³.
11. EPA de EE. UU.: NAAQS de PM10, 150 µg/m³ en 24 h; 40 CFR 50, apéndice N: un promedio de 24 h es válido con al menos 75 % de los datos.
12. Jayaratne, R. et al. (2018). The influence of humidity on the performance of a low-cost air particle mass sensor and the effect of atmospheric fog. *Atmospheric Measurement Techniques*, 11, 4883–4890: aumentos importantes con HR arriba de ~75 %.
13. Open-Meteo: datos de viento y pronóstico (CC BY 4.0).
