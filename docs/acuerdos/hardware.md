# Hardware

Son **tres diseños de PCB**. Cada nodo tiene su propio diseño y su propio firmware. Nada se presenta en protoboard ni en placa perforada (en desarrollo sí se permite protoboard).

| Diseño | Contenido | Diseño a cargo de |
| --- | --- | --- |
| 1. PCB de sensores | SHT41, espacio para el YG1006 y puerto de conexión al nodo rack | Sebastián, 2 días |
| 2. PCB nodo rack | ESP32, TCA9548A en socket, OLED y puertos hacia las PCB de sensores | Sebastián, 3 días |
| 3. PCB nodo ambiente | ESP32, módulo UART TTL con conector PicoBlade hacia el PMS5003, SHT41 y OLED | Diego (esquemático, 1 día) y Sebastián (layout y DRC, 2 días) |

La fabricación y el ensamble son de Diego. Se piden **2 unidades de cada diseño** en un solo lote como respaldo, porque no hay plan B presentable en protoboard.

## Acuerdos

- **Componentes:** todo en *through-hole* o en socket (ESP32, TCA9548A y módulos). Antes del layout se miden los módulos físicos reales, no solo las hojas de datos.
- **PMS5003:** el adaptador se alimenta con 4.5 a 5.5 V y habla UART 3.3 V TTL, así que el ESP32 se conecta sin convertidor de nivel. Se leen PM1.0, PM2.5 y PM10. Sebastián define de dónde sale el riel de 5 V, añade un condensador de reserva cerca del conector (valor a confirmar con la hoja del adaptador) y se mide la tensión con carga en la tarea 2.9 para confirmar que no baja de 4.5 V.
- **Direcciones I2C:** TCA9548A en `0x70`, SHT41 en `0x44` (fija) y OLED en `0x3C`. En el rack los dos SHT41 van detrás del TCA9548A porque comparten dirección.
- **UART del PMS5003:** UART2 del ESP32 (GPIO16 y GPIO17).
- **Programación por USB:** un jumper separa el regulador de 3.3 V del pin 3V3 del ESP32, y se retira mientras se programa por USB.
- **Conexión PCB de sensores a nodo rack:** el medio (conector y cable) lo decide Sebastián a más tardar el 7 de octubre, al cerrar la tarea 2.1. Debe ser polarizado y con cable corto, porque I2C no está pensado para distancias largas.

## Prueba de flama con encendedor

Distancia fija marcada en el banco, nunca cerca de la carcasa, de plásticos o de cables, con un vaso de agua a mano y una persona más presente. Luis Mario confirma con los organizadores del concurso que se permite llama abierta (16 de octubre) y define el protocolo antes del 22 de octubre.
