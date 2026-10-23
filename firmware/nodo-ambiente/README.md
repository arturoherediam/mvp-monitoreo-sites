# Firmware del nodo ambiente (`amb-01`)

Responsable: Priscila. Tareas 6.2 a 6.4 (ver `docs/plan/wbs.md`). Versión 0.1.0 (PR #51).

Mide temperatura, humedad y partículas del cuarto y las publica por MQTT con el contrato de `docs/acuerdos/contrato-json.md`. Usa la librería común de `../common`.

## Qué hace

- Lee el SHT41 (temperatura y humedad) y calcula el punto de rocío y la velocidad de cambio con `firmware/common` (`Meteo`).
- Lee el PMS5003 de forma continua por UART2 (`lib/Pms5003`) para no perder bytes; una trama se considera vigente durante 3 s.
- Publica un mensaje cada **5 s** en `site/datos` (armado con `Contrato`).
- Publica su estado retenido en `site/estado/amb-01` y deja un LWT `offline` (con `MqttNodo`: reconexión con espera creciente).
- Muestra las lecturas y el estado de la red en la OLED.

## Conexiones (PROVISIONALES)

> Pueden cambiar con el diseño de la PCB del nodo ambiente (tareas 2.4, 2.5 y la revisión cruzada 2.6, Diego y Sebastián). Si cambian, actualiza esta tabla **y** las constantes al inicio de `src/main.cpp` en el mismo pull request.

| Señal | ESP32 | Notas |
| --- | --- | --- |
| I²C SDA | GPIO 21 | SHT41 y OLED en el mismo bus |
| I²C SCL | GPIO 22 | |
| PMS5003 (UART2) | GPIO 16 y 17 | Cuál es RX y cuál TX lo define Sebastián. 9600 baudios. 
| Alimentación del PMS5003 | 5 V | Rango 4.5 a 5.5 V; la lógica del UART es de 3.3 V |

| Dispositivo I²C | Dirección |
| --- | --- |
| SHT41 | `0x44` |
| OLED SSD1306 | `0x3C` (128×64; cambia `OLED_ALTO` a 32 si es 128×32) |

## Mensajes

| Topic | Contenido | Cuándo |
| --- | --- | --- |
| `site/datos` | `schema`, `type: "ambiente"`, `node_id`, `seq` (empieza en 1), `uptime_s`, `temp`, `hum`, `dew_point`, `rate_c_min`, `pm1_0`, `pm2_5`, `pm10` | Cada 5 s |
| `site/estado/amb-01` (retenido) | `status: "online"`, `fw`, estado del SHT41 y del PMS5003 | Al conectar y cuando cambia el estado de un sensor |
| `site/estado/amb-01` (LWT, retenido) | `status: "offline"` | Lo publica el broker si el nodo se desconecta |

Ejemplos: `docs/acuerdos/ejemplos/ambiente.json`, `ambiente-con-falla.json` y `ambiente-con-falla-sht41.json`.

## Errores

Si un sensor falla, sus valores van en `null` y se agrega el código en `err`:

| Código | Significado |
| --- | --- |
| `sht41_timeout` | El SHT41 no respondió |
| `pms_sin_trama` | No llegó una trama válida del PMS5003 en los últimos 3 s |

El gateway usa estos códigos para el índice de salud del PMS5003 (tarea 4.7).

## Configuración (inicio de `src/main.cpp`)

| Constante | Valor | Para qué |
| --- | --- | --- |
| `PERIODO_MS` | 5000 | Periodo de publicación (contrato) |
| `PMS_VIGENCIA_MS` | 3000 | Antigüedad máxima de una trama del PMS5003 |
| `PMS_USAR_ATM` | `true` | Valores atmosféricos (`true`) o CF=1 (`false`). Decisión: **atmosférico** (issue #31) |
| `OLED_ALTO` | 64 | Alto de la pantalla en píxeles |

## Compilar y cargar

1. Copia `include/secrets.example.h` a `include/secrets.h` (ignorado por Git) y llena los valores desde 1Password: hotspot (`MVP Gateway · Hotspot`) y usuario `nodo_ambiente` (`MVP Gateway · Mosquitto · nodo_ambiente`). Las constantes son `WIFI_SSID`, `WIFI_PASSWORD`, `MQTT_HOST`, `MQTT_PORT`, `MQTT_USER`, `MQTT_PASSWORD` y `NODE_ID`. **Nunca subas `secrets.h`.**
2. Compila y carga desde esta carpeta:
   ```bash
   pio run -t upload
   pio device monitor        # 115200 baudios
   ```

## Pruebas

- Lector del PMS5003: `test/test_pms5003` (`pio test`).
- Librería común: pruebas del punto de rocío (25 °C y 60 % dan 16.7 °C; 30 °C y 70 % dan 23.9 °C).
- Contrato: `python3 tools/validar_ejemplos.py` y el simulador (`tools/simulador/`).
## Monitor serie

En cada ciclo de 5 s, el monitor serie muestra si el mensaje se envió y el estado de cada sensor:

## Pendientes

- **PMS5003:** llegó el sensor de repuesto; falta validar la lectura de partículas con hardware (tareas 6.2 y 6.4).
- Verificar con el sensor nuevo que los valores atmosféricos y CF=1 se comporten como se espera.
- Confirmar pines (RX y TX del PMS5003) con la PCB final (2.6).
- El campo `sensors` del estado de `amb-01` aún no está documentado en `docs/acuerdos/contrato-json.md`.