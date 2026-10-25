# Hardware

Son **tres diseños de PCB**. Cada nodo tiene su propio diseño y su propio firmware. Nada se presenta en protoboard ni en placa perforada (en desarrollo sí se permite protoboard).

| Diseño | Contenido | Diseño a cargo de |
| --- | --- | --- |
| 1. PCB de sensores | SHT41, espacio para el YG1006 y puerto de conexión al nodo rack | Sebastián (esquemático y layout) y Diego (revisión final) |
| 2. PCB nodo rack | ESP32, TCA9548A en socket, OLED y puertos hacia las PCB de sensores | Sebastián (esquemático y layout) y Diego (revisión final) |
| 3. PCB nodo ambiente | ESP32, módulo UART TTL con conector PicoBlade hacia el PMS5003, SHT41 y OLED | Sebastián (esquemático) y Diego (revisión y layout completo) |

El proyecto unificado de Altium Designer vive en `hardware/altium/MVP_Monitoreo.PrjPcb` y las salidas de fabricación (esquemático en PDF, vista 3D y Gerbers) están en cada carpeta `hardware/pcb-*/`. La fabricación y el ensamble son de Diego. Se piden **2 unidades de cada diseño** en un solo lote como respaldo, porque no hay plan B presentable en protoboard.

## Acuerdos

- **Componentes:** todo en *through-hole* o en socket (ESP32, TCA9548A y módulos). Antes del layout se miden los módulos físicos reales, no solo las hojas de datos.
- **PMS5003:** el adaptador se alimenta con 4.5 a 5.5 V y habla UART 3.3 V TTL, así que el ESP32 se conecta sin convertidor de nivel. Se leen PM1.0, PM2.5 y PM10. Sebastián define de dónde sale el riel de 5 V, añade un condensador de reserva cerca del conector (valor a confirmar con la hoja del adaptador) y se mide la tensión con carga en la tarea 2.9 para confirmar que no baja de 4.5 V.
- **Direcciones I2C:** TCA9548A en `0x70`, SHT41 en `0x44` (fija) y OLED en `0x3C`. En el rack los dos SHT41 van detrás del TCA9548A porque comparten dirección.
- **UART del PMS5003:** UART2 del ESP32 (GPIO16 y GPIO17).
- **Programación por USB:** un jumper separa el regulador de 3.3 V del pin 3V3 del ESP32, y se retira mientras se programa por USB.
- **Conexión PCB de sensores a nodo rack:** el medio (conector y cable) lo decide Sebastián a más tardar el 7 de octubre, al cerrar la tarea 2.1. Debe ser polarizado y con cable corto, porque I2C no está pensado para distancias largas.

## Pinout definitivo en las PCB (diferencias respecto a protoboard)

En el diseño final de las PCB algunos pines y canales del multiplexor cambiaron respecto a los valores provisionales usados en protoboard. **El equipo de firmware debe actualizar estas constantes al pasar de protoboard a las PCB finales:**

### 1. Nodo rack (`Nodo_rack.SchDoc`) — Firmware de Luis Mario (`firmware/nodo-rack/src/main.cpp`)

| Señal / Función | En protoboard (actual en código) | **En PCB final (esquemático)** | Cambio requerido en `src/main.cpp` |
| --- | --- | --- | --- |
| **I2C SDA** (bus principal: OLED `P1` y entrada `U2` PCA9548A) | `GPIO 21` (`PIN_SDA = 21`) | **`D22` (`GPIO 22`)** | ⚠️ **Invertido:** cambiar `PIN_SDA = 22` |
| **I2C SCL** (bus principal: OLED `P1` y entrada `U2` PCA9548A) | `GPIO 22` (`PIN_SCL = 22`) | **`D21` (`GPIO 21`)** | ⚠️ **Invertido:** cambiar `PIN_SCL = 21` |
| **Sensor de flama YG1006** (`FLAME_S`, pin 2 de `J1`) | `GPIO 34` (`PIN_FLAMA = 34`) | **`D18` (`GPIO 18`)** | ⚠️ **Cambió de pin:** cambiar `PIN_FLAMA = 18` |
| **SHT41 posición A** (canal del PCA9548A `U2`) | Canal `2` (`SD2`/`SC2`, `CANAL_A = 2`) | **Canal `2` (`SD2`/`SC2`, pines 3 y 4 de `J1`)** | ✅ Sin cambio (`CANAL_A = 2`) |
| **SHT41 posición B** (canal del PCA9548A `U2`) | Canal `0` (`SD0`/`SC0`, `CANAL_B = 0`) | **Canal `3` (`SD3`/`SC3`, pines 5 y 6 de `J1`)** | ⚠️ **Cambió de canal:** cambiar `CANAL_B = 3` |

- **Pinout del conector `J1` (8 pines, hacia las 2 PCB de sensores):** Pin 1 = `+3V3`, Pin 2 = `FLAME_S` (`D18`), Pin 3 = `SD2`, Pin 4 = `SC2`, Pin 5 = `SD3`, Pin 6 = `SC3`, Pin 7 = `+3V3`, Pin 8 = `GND`.
- **Pinout de `P1` (OLED en nodo rack, 4 pines):** Pin 1 = `SDA`, Pin 2 = `SCL`, Pin 3 = `+3V3`, Pin 4 = `GND`.

### 2. PCB de sensores (`Nodo_Sensores.SchDoc`)

- **Conector `P3` (6 pines, hacia `J1` del nodo rack):** Pin 1 = `NC` (sin conexión), Pin 2 = `D0` del sensor de flama `YG1006` (`U6`), Pin 3 = `SDA` del `GY-SHT41` (`U5`), Pin 4 = `SCL` del `GY-SHT41` (`U5`), Pin 5 = `GND`, Pin 6 = `+3V3`.

### 3. Nodo ambiente (`Nodo_Ambiente.SchDoc`) — Firmware de Priscila (`firmware/nodo-ambiente/src/main.cpp`)

| Señal / Función | En protoboard (actual en código) | **En PCB final (esquemático)** | Cambio requerido en `src/main.cpp` |
| --- | --- | --- | --- |
| **I2C SDA** (`GY-SHT41` `U9` y OLED `P2` pin 4) | `GPIO 21` (`PIN_SDA = 21`) | **`D22` (`GPIO 22`)** | ⚠️ **Invertido:** cambiar `PIN_SDA = 22` |
| **I2C SCL** (`GY-SHT41` `U9` y OLED `P2` pin 3) | `GPIO 22` (`PIN_SCL = 22`) | **`D21` (`GPIO 21`)** | ⚠️ **Invertido:** cambiar `PIN_SCL = 21` |
| **UART2 hacia `PMS_Adaptor` (`U10`)** | `PMS_RX = 16`, `PMS_TX = 17` | Red `TX` en **`TX2` (`GPIO 17`)** → pin `RX` de `U10`<br>Red `RX` en **`RX2` (`GPIO 16`)** → pin `TX` de `U10` | ✅ Confirmado: `PMS_RX = 16` y `PMS_TX = 17` (nota: verificar en el arnés físico del adaptador que el pin `TX` del sensor llegue a `GPIO 16`) |
| **Alimentación 5 V (`J3` USB Tipo A)** | 5 V | `VBUS` (`+5V`) alimenta `VCC` de `U10` (`PMS_Adaptor`) | — |

- **Pinout de `P2` (OLED en nodo ambiente, 4 pines):** Pin 1 = `GND`, Pin 2 = `+3V3`, Pin 3 = `SCL`, Pin 4 = `SDA`.

## Prueba de flama con encendedor

Distancia fija marcada en el banco, nunca cerca de la carcasa, de plásticos o de cables, con un vaso de agua a mano y una persona más presente. Luis Mario confirma con los organizadores del concurso que se permite llama abierta (16 de octubre) y define el protocolo antes del 22 de octubre.
