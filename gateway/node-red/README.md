# node-red

Flujos de Node-RED exportados. No subir `flows_cred.json` (está en `.gitignore`).

## Flujos

| Archivo | Tarea | Qué hace |
| --- | --- | --- |
| `flujo-mvp-4.1.json` | 4.1 | Se suscribe a `site/datos` y `site/estado/+`, valida el contrato v1 y muestra el resultado en la barra de depuración. Contiene la configuración del broker (`mvp_broker`). |
| `flujo-mvp-4.3.json` | 4.3 | Dashboard v1 con Dashboard 2.0 (`@flowfuse/node-red-dashboard`): estado de los nodos, alertas, rack A y B, ambiente y gráficas. Usa el broker `mvp_broker` del flujo 4.1, así que **importa primero el 4.1**. |

## Importar el dashboard 4.3

1. Importa `flujo-mvp-4.1.json` si todavía no está (menú, Import, elegir el archivo).
2. Importa `flujo-mvp-4.3.json` como flujo nuevo y despliega (Deploy).
3. Abre http://localhost:1880/mvp-site/monitoreo. Usa la ruta `/mvp-site` para no chocar con otro dashboard en `/dashboard`.
4. Corre el simulador: `python3 tools/simulador/simulador.py --escenario demo --velocidad 4`.

Con el escenario `demo` debe verse: gauges y gráficas moviéndose; el indicador de flama del rack A en rojo con la alerta crítica; el rack B con `—` y su error; las partículas del ambiente con `pms_sin_trama`; y los nodos en "Desconectado" y de vuelta en "En línea" cuando el simulador cierra la conexión.

El dashboard todavía no tiene umbrales de temperatura, humedad ni partículas: las alertas son flama, nodo desconectado o sin datos, y errores de sensor. Los umbrales se definen cuando el equipo los acuerde.

No subas una exportación de Node-RED hecha después de configurar el broker: puede incluir credenciales. Usa los archivos de esta carpeta, que no las tienen.
