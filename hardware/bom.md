# Lista de materiales y compras

Anota aquí cada compra o cambio: qué, quién, cuánto, fecha. Las cantidades y los costos se completan al comprar.

| Componente | Cantidad | Responsable | Estado | Fecha | Costo |
| --- | --- | --- | --- | --- | --- |
| ESP32 DevKit | por confirmar | Equipo | Ya se tiene | | |
| SHT41 | por confirmar | Equipo | Ya se tiene | | |
| OLED SSD1306 128x32 | por confirmar | Equipo | Ya se tiene | | |
| TCA9548A | por confirmar | Equipo | Ya se tiene | | |
| PMS5003 con adaptador UART 3.3 V TTL (PicoBlade) | por confirmar | Equipo | Ya se tiene | | |
| Sensor de flama YG1006 (módulo de 4 pines con comparador LM393) | 1 | Luis Mario | Comprado | 2026-10-03 | $44 |
| Sensor de temperatura adicional (SHT41) | 1 | Luis Mario | Comprado | 2026-10-03 | $125 |
| Orange Pi Zero 3 (1 GB) con disipador y ventilador | 1 | Arturo | Recibida; sistema base instalado el 22 oct | | |
| microSD para la Orange Pi | 1 | Arturo | Ya se tiene (falta una segunda de respaldo, tarea 8.5) | | |
| Fuente USB-C 5 V / 3 A para la Orange Pi | 1 | Arturo | Comprada | | |
| Adaptador USB a RJ45 (Realtek r8152) para la laptop | 1 | Arturo | Comprado | | |
| Cable Ethernet normal (el cruzado no funcionó) | 1 | Arturo | Ya se tiene | | |
| PMS5003 de reemplazo (el actual no funciona) | 1 | Equipo | Pedido | | |
| PCB: lote de 2 unidades por diseño (3 diseños) | 6 | Diego | Pendiente (pedido el 20 oct) | | |
| Carcasas (impresión) | 2 | Diego | Pendiente | | |

---

## BOM por placa (diseño en Altium Designer)

Desglose de componentes por cada una de las tres placas del proyecto (`hardware/altium/MVP_Monitoreo.PrjPcb`).

### 1. PCB de sensores (`Nodo_Sensores`) — 2 unidades por rack

| Designador | Componente / Comentario | Huella / Paquete | Cant. por placa |
| --- | --- | --- | --- |
| `U5` | Módulo sensor de temperatura y humedad `GY-SHT41` (I2C `0x44`) | `SHT41` (THT 4 pines, 2.54 mm) | 1 |
| `U6` | Módulo sensor de flama `YG1006` | `YG1006` (THT 3 pines, 2.54 mm) | 1 |
| `P3` | Header macho 6 pines 2.54 mm (`TSW-106-23-F-S`) — conexión hacia el nodo rack | THT 1×6, 2.54 mm | 1 |

### 2. PCB nodo rack (`Nodo_rack`) — 1 unidad

| Designador | Componente / Comentario | Huella / Paquete | Cant. por placa |
| --- | --- | --- | --- |
| `U3` | `ESP32- 30 pin` DevKit (en socket) | `ESP32 - 30 pin` | 1 |
| `U2` | Multiplexor I2C `PCA9548A` / `TCA9548A` (en socket, `0x70`) | `PCA9548A` (24 pines) | 1 |
| `P1` | Header 4 pines 2.54 mm (`TSW-104-08`) — pantalla OLED SSD1306 (`0x3C`) | THT 1×4, 2.54 mm | 1 |
| `J1` | Conector 8 pines 2.54 mm (`8 pin strip`) — puertos hacia las 2 PCB de sensores | `8 Pin_2.54mm` | 1 |

### 3. PCB nodo ambiente (`Nodo_Ambiente`) — 1 unidad

| Designador | Componente / Comentario | Huella / Paquete | Cant. por placa |
| --- | --- | --- | --- |
| `U7` | `ESP32- 30 pin` DevKit (en socket) | `ESP32 - 30 pin` | 1 |
| `U9` | Módulo sensor de temperatura y humedad `GY-SHT41` (I2C `0x44`) | `SHT41` (THT 4 pines, 2.54 mm) | 1 |
| `U10` | Adaptador UART TTL con conector PicoBlade para `PMS5003` (`PMS_Adaptor`) | `PMS_Adaptor` (4 pines) | 1 |
| `P2` | Header 4 pines 2.54 mm (`TSW-104-08`) — pantalla OLED SSD1306 (`0x3C`) | THT 1×4, 2.54 mm | 1 |
| `J3` | Conector USB Tipo A hembra THT (`614004190021`) — alimentación de 5 V | THT USB-A | 1 |
