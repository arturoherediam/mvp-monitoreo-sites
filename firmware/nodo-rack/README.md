# Firmware del nodo rack (`rack-01`)

Responsable: Luis Mario. Tareas 5.2 a 5.5 (ver `docs/plan/wbs.md`). Versión 1.0.0 (PR #54).

Mide temperatura y humedad en dos posiciones del rack, vigila la flama y publica todo por MQTT con el contrato de `docs/acuerdos/contrato-json.md`.

## Qué hace

- Lee dos SHT41 (posiciones **A** y **B**) a través del multiplexor TCA9548A.
- Calcula el punto de rocío (Magnus, a = 17.62, b = 243.12) y la velocidad de cambio en °C/min con una ventana de 60 s.
- Vigila el sensor de flama YG1006 (módulo con comparador LM393) en la posición A.
- Publica un mensaje cada **2 s** en `site/datos`. Si detecta flama, publica **de inmediato** y repite cada 1 s mientras siga activa (QoS 0).
- Publica su estado retenido en `site/estado/rack-01` y deja un LWT `offline` para cuando se desconecta.
- Muestra en la OLED las lecturas de A y B, el estado de la red y la flama.
- Si el bus I²C se atora, lo libera (9 pulsos de reloj) y reintenta.

## Conexiones (PROVISIONALES)

> Pueden cambiar con el diseño de las PCB (tareas 2.2, 2.3 y la revisión cruzada 2.6, Sebastián y Diego). Si cambian, actualiza esta tabla **y** las constantes al inicio de `src/main.cpp` en el mismo pull request.

| Señal | ESP32 | Notas |
| --- | --- | --- |
| I²C SDA | GPIO 21 | 100 kHz (`I2C_HZ`) |
| I²C SCL | GPIO 22 | |
| Flama YG1006 (salida DO) | GPIO 34 | Solo entrada, sin pull-up interno. Activa en bajo (LOW = flama) |

| Dispositivo I²C | Dirección | Canal del TCA9548A |
| --- | --- | --- |
| TCA9548A | `0x70` | — |
| OLED SSD1306 | `0x3C` | Bus principal (fuera del multiplexor) |
| SHT41 posición **A** (arriba, con el YG1006) | `0x44` | Canal **2** (SD2/SC2) |
| SHT41 posición **B** | `0x44` | Canal **0** (SD0/SC0) |

Los dos SHT41 tienen la misma dirección; por eso van en canales distintos del multiplexor. La posición A va arriba del rack y la B más abajo, bien separadas, para que el gateway distinga una subida de todo el rack de una local (ver `docs/acuerdos/indices-mantenimiento.md`).

## Mensajes

| Topic | Contenido | Cuándo |
| --- | --- | --- |
| `site/datos` | `schema`, `type: "rack"`, `node_id`, `seq` (empieza en 1), `uptime_s`, `positions` (A y B con `temp`, `hum`, `dew_point`, `rate_c_min`; A además `flame`) | Cada 2 s y de inmediato con flama |
| `site/estado/rack-01` (retenido) | `status: "online"`, `fw`, estado de `tca9548a`, `sht41_A`, `sht41_B` | Al conectar y cuando cambia el estado de un sensor |
| `site/estado/rack-01` (LWT, retenido) | `status: "offline"` | Lo publica el broker si el nodo se desconecta |

Ejemplos: `docs/acuerdos/ejemplos/rack.json`, `rack-con-flama.json` y `rack-con-falla.json`.

## Errores

Si un sensor falla, sus valores van en `null` y se agrega el código en `err`:

| Código | Significado |
| --- | --- |
| `sht41_A_timeout`, `sht41_B_timeout` | El SHT41 de esa posición no respondió o falló el CRC |
| `mux_sin_respuesta` | El TCA9548A no responde |

## Configuración (inicio de `src/main.cpp`)

| Constante | Valor | Para qué |
| --- | --- | --- |
| `USAR_RED` | `true` | `false` para probar sensores y OLED sin Wi-Fi ni broker |
| `PERIODO_DATOS_MS` | 2000 | Periodo de publicación (contrato) |
| `REPETIR_FLAMA_MS` | 1000 | Repetición mientras hay flama |
| `ANTIRREBOTE_MS` | 50 | Antirrebote del sensor de flama |
| `FLAMA_ACTIVA_EN_BAJO` | `true` | Lógica del módulo LM393 |
| `I2C_HZ` | 100000 | Bájalo a 50000 si la OLED sale con ruido |

## Compilar y cargar

1. Copia `include/secrets.example.h` a `include/secrets.h` (ignorado por Git) y llena los valores desde 1Password: hotspot (`MVP Gateway · Hotspot`) y usuario `nodo_rack` (`MVP Gateway · Mosquitto · nodo_rack`). Las constantes son `WIFI_SSID`, `WIFI_PASSWORD`, `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASSWORD` y `NODE_ID`. **Nunca subas `secrets.h`.**
2. Compila y carga desde esta carpeta:
   ```bash
   pio run -t upload
   pio device monitor        # 115200 baudios
   ```
3. En el monitor serie verás cada 2 s las lecturas de A y B (temperatura, humedad, rocío, tasa y fallos) y los avisos de flama.

## Pruebas

- Contrato: `python3 tools/validar_ejemplos.py` y el simulador (`tools/simulador/`).
- Flama: prueba con encendedor (tarea 5.5).

## Pendientes

- Confirmar pines y canales con las PCB finales (2.6).
- Después del concurso: usar la librería común `firmware/common` (`Contrato`, `MqttNodo`, `Meteo`) en lugar del código propio de JSON, MQTT y punto de rocío. Hoy la librería solo tiene funciones para el nodo ambiente.
- El LWT se registra con QoS 1; en la librería común es QoS 0. No afecta al gateway, pero conviene unificarlo al migrar.
