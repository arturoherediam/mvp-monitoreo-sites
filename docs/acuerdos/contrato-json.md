# Contrato JSON de los nodos

Ambos nodos publican telemetría en `site/datos`, con un campo `type` fijo en cada firmware (`rack` o `ambiente`), y su estado en `site/estado/<node_id>`. **Node-RED agrega la marca de tiempo; los nodos no la envían.**

Los esquemas están en [`schemas/`](schemas) y los ejemplos en [`ejemplos/`](ejemplos). `python3 tools/validar_ejemplos.py` comprueba que los ejemplos cumplan el esquema y que el punto de rocío sea coherente.

## Telemetría del nodo rack (cada 2 s)

```json
{"schema":1,"type":"rack","node_id":"rack-01","seq":1042,"uptime_s":3125,
 "positions":[
  {"id":"A","temp":24.31,"hum":55.8,"dew_point":14.9,"rate_c_min":0.4,"flame":false},
  {"id":"B","temp":24.90,"hum":54.1,"dew_point":15.0,"rate_c_min":0.1}]}
```

## Telemetría del nodo ambiente (cada 5 s)

```json
{"schema":1,"type":"ambiente","node_id":"amb-01","seq":88,"uptime_s":912,
 "temp":29.4,"hum":71.2,"dew_point":23.6,"rate_c_min":0.0,
 "pm1_0":9,"pm2_5":14,"pm10":21}
```

## Estado retenido en `site/estado/<node_id>`

Se publica al conectar (retenido). El testamento (LWT) publica el mismo topic con `offline`.

```json
{"schema":1,"node_id":"rack-01","status":"online","fw":"1.0.0",
 "sensors":{"tca9548a":true,"sht41_A":true,"sht41_B":true}}
{"schema":1,"node_id":"rack-01","status":"offline"}
```

## Reglas

| Regla | Acuerdo |
| --- | --- |
| Unidades | °C, %HR y µg/m³ |
| Sensor con falla | El valor va en `null` y se agrega `"err":["sht41_B_timeout"]` |
| Códigos de error | `sht41_<pos>_timeout`, `mux_sin_respuesta`, `pms_sin_trama` |
| Partículas | PM1.0, PM2.5 y PM10 en µg/m³. Priscila define en la tarea 6.2 si usa los valores CF=1 o los atmosféricos de la trama del PMS5003 |
| Punto de rocío | Calculado en el firmware con Magnus (a = 17.62, b = 243.12). Pruebas: 25 °C y 60 % dan 16.7 °C; 30 °C y 70 % dan 23.9 °C |
| Velocidad de cambio | `rate_c_min` en °C/min con ventana de 60 s |
| Flama | Va en el mensaje periódico (campo `flame` de la posición que lleva el YG1006) y se publica además de inmediato al detectarla |
| `seq` | Contador que sube en cada publicación; sirve para detectar pérdidas y duplicados |
| `node_id` | Único por placa (`rack-01`, `amb-01`), definido en `secrets.h` o `config.h` |
| Marca de tiempo | La agrega Node-RED al recibir |

## Flama y QoS 0

PubSubClient solo publica con QoS 0. Para que la flama no dependa de un solo mensaje, el firmware del rack la repite cada segundo mientras esté activa, y Node-RED descarta duplicados con `seq`. Luis Mario confirma este punto antes del 9 de octubre.

## Cambios al contrato

Solo por pull request aprobado por Arturo, Luis Mario y Priscila. Si cambia la forma de los mensajes, se sube `schema` y se actualizan esquemas y ejemplos en el mismo pull request.
