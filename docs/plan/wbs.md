# WBS del MVP

Son 46 tareas en 8 fases (los IDs 1.3 y 7.3 se eliminaron y no se reutilizan). La holgura se mide contra el 20 de noviembre; los ensayos y el empaque (8.3 a 8.5) tienen fecha fija del 23 al 25 de noviembre. Los días son hábiles de lunes a viernes, incluidos el 2 y el 16 de noviembre. La cadena de PCB (2.1 a 2.9 y 7.4 a 7.8) es la ruta crítica, con 4 días hábiles de holgura.

| ID | Tarea | Responsable | Días háb. | Predecesoras | Inicio | Fin | Holgura (días háb.) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **1. Arranque** | | | | | | | |
| 1.1 | Kickoff: ratificar acuerdos y reparto | Todos | 1 | – | 2 oct | 2 oct | 6 |
| 1.2 | Repo base, docs/acuerdos y ejemplos JSON | Arturo | 1 | 1.1 | 3 oct | 3 oct | 12 |
| **2. Hardware y PCB** | | | | | | | |
| 2.1 | Pinout, voltajes (PMS5003 a 4.5–5.5 V) y conectores | Sebastián | 3 | 1.1 | 5 oct | 7 oct | 6 |
| 2.2 | PCB de sensores (SHT41, espacio YG1006, puerto al nodo rack) | Sebastián | 2 | 2.1 | 8 oct | 9 oct | 6 |
| 2.3 | PCB nodo rack (ESP32, TCA9548A en socket, OLED, puertos a PCB de sensores) | Sebastián | 3 | 2.1, 2.2 | 12 oct | 14 oct | 6 |
| 2.4 | Esquemático del nodo ambiente (apoyo de Diego) | Diego | 1 | 2.1 | 8 oct | 8 oct | 8 |
| 2.5 | Layout y DRC del nodo ambiente | Sebastián | 2 | 2.4 | 15 oct | 16 oct | 4 |
| 2.6 | Revisión cruzada de los 3 diseños (firmware, carcasa, eléctrico) | Sebastián + Diego | 1 | 2.2, 2.3, 2.5 | 19 oct | 19 oct | 4 |
| 2.7 | Pedido y fabricación de PCB (2 unidades de cada diseño, un lote) | Diego (espera) | 8 | 2.6 | 20 oct | 29 oct | 4 |
| 2.8 | Ensamble y soldadura (through-hole y sockets) | Diego | 1 | 2.7 | 30 oct | 30 oct | 4 |
| 2.9 | Prueba eléctrica (continuidad, 3V3/5V, escaneo I2C) | Diego + Sebastián | 2 | 2.8 | 2 nov | 3 nov | 4 |
| **3. Carcasas** | | | | | | | |
| 3.1 | Diseño CAD de carcasas (dimensiones provisionales) | Diego | 6 | 2.1 | 9 oct | 16 oct | 13 |
| 3.2 | Ajuste de carcasas a dimensiones finales | Diego | 1 | 2.6, 3.1 | 20 oct | 20 oct | 12 |
| 3.3 | Impresión/fabricación de carcasas | Diego (máquina) | 4 | 3.2 | 21 oct | 26 oct | 12 |
| 3.4 | Prueba de ajuste de PCB y cableado en carcasa | Diego | 1 | 2.8, 3.3 | 4 nov | 4 nov | 6 |
| **4. Gateway y Node-RED** | | | | | | | |
| 4.1 | Broker + Node-RED en laptop con el contrato v1 | Arturo | 2 | 1.2 | 5 oct | 6 oct | 15 |
| 4.2 | Simulador de nodos (publica JSON de prueba) | Arturo | 1 | 1.2 | 7 oct | 7 oct | 14 |
| 4.3 | Dashboard v1 con datos simulados | Arturo | 4 | 4.1, 4.2 | 8 oct | 13 oct | 14 |
| 4.4 | Llegada de la Orange Pi (10 oct o antes) | Externo | 1 | 1.1 | 10 oct | 10 oct | 14 |
| 4.5 | Validar hotspot en Orange Pi (AP 2.4 GHz, IP fija, DHCP) | Arturo | 2 | 4.4 | 14 oct | 15 oct | 12 |
| 4.6 | Instalar y asegurar gateway (Mosquitto+ACL, firewall, Node-RED, SQLite) | Arturo | 3 | 4.5, 4.3 | 16 oct | 20 oct | 12 |
| 4.7 | Índice de dosis acumulada + API de viento | Arturo | 4 | 4.3 | 29 oct | 3 nov | 10 |
| 4.8 | Histórico en SQLite con escritura agrupada | Arturo | 2 | 4.6 | 23 oct | 26 oct | 14 |
| 4.9 | ICS de la laptop (Ubuntu) y respaldo con hotspot del celular | Arturo | 2 | 4.6 | 4 nov | 5 nov | 6 |
| **5. Nodo rack** | | | | | | | |
| 5.1 | Compra de sensor de flama y de temperatura (3 oct) | Luis Mario | 1 | 1.1 | 3 oct | 3 oct | 12 |
| 5.2 | Banco de pruebas (ESP32+TCA9548A+2 SHT41+OLED+YG1006) | Luis Mario | 4 | 1.2, 5.1 | 5 oct | 8 oct | 12 |
| 5.3 | Firmware v1 del nodo rack (mux, OLED, JSON, MQTT+LWT) | Luis Mario | 6 | 5.2, 6.1 | 9 oct | 16 oct | 12 |
| 5.4 | Integrar YG1006 (GPIO, evento inmediato al broker) | Luis Mario | 2 | 5.3 | 19 oct | 20 oct | 12 |
| 5.5 | Prueba de flama con encendedor: distancia y protocolo repetible | Luis Mario | 2 | 5.4 | 23 oct | 26 oct | 10 |
| **6. Nodo ambiente** | | | | | | | |
| 6.1 | Librería común de firmware (ambos nodos) | Priscila (revisa Luis Mario) | 4 | 1.2 | 5 oct | 8 oct | 12 |
| 6.2 | Banco de pruebas (ESP32+PMS5003+SHT41) | Priscila | 3 | 1.2 | 9 oct | 13 oct | 11 |
| 6.3 | Firmware v1 del nodo ambiente (UART PMS5003, SHT41, JSON, MQTT+LWT) | Priscila | 4 | 6.1, 6.2 | 14 oct | 19 oct | 11 |
| 6.4 | Validación de sensores y recolección de datos | Priscila | 2 | 6.3 | 23 oct | 26 oct | 10 |
| 6.5 | Umbral inicial del índice de dosis (Arturo configura) | Priscila | 2 | 6.4, 4.7 | 10 nov | 11 nov | 6 |
| **7. Integración y pruebas** | | | | | | | |
| 7.1 | E2E de desarrollo: nodos → broker en laptop → dashboard | Arturo, Luis, Priscila | 2 | 5.3, 6.3, 4.3 | 21 oct | 22 oct | 10 |
| 7.2 | Migrar a la Orange Pi y probar con nodos reales | Arturo, Luis, Priscila | 2 | 4.6, 7.1 | 27 oct | 28 oct | 8 |
| 7.4 | Integración con PCB finales (flashear y probar ambos nodos) | Luis, Priscila, Sebastián | 3 | 2.9, 7.2, 5.5, 6.4 | 4 nov | 6 nov | 4 |
| 7.5 | Integración en carcasas | Diego, Luis, Priscila | 1 | 7.4, 3.4 | 9 nov | 9 nov | 4 |
| 7.6 | Estabilidad 24 h y corte de energía (con PCB y carcasas) | Arturo | 2 | 7.5, 4.8, 4.9 | 10 nov | 11 nov | 4 |
| 7.7 | Pruebas de fallo (WiFi, reinicio de gateway, sin internet, flama) | Arturo (apoyo de Luis y Priscila) | 2 | 7.6 | 12 nov | 13 nov | 4 |
| 7.8 | Regresión final = congelamiento de funciones | Arturo, Luis, Priscila | 1 | 7.7, 6.5 | 16 nov | 16 nov | 4 |
| **8. Documentación y entrega** | | | | | | | |
| 8.1 | Documentación técnica por módulo | Todos | 6 | 7.2 | 9 nov | 16 nov | 1 |
| 8.2 | Reporte final, diapositivas y manual de arranque (consolida Arturo) | Todos | 3 | 8.1 | 17 nov | 19 nov | 1 |
| 8.3 | Ensayo general 1 (guion de 6 pasos) | Todos | 1 | 7.8, 8.2 | 23 nov | 23 nov | 0 |
| 8.4 | Ensayo general 2 con cronómetro | Todos | 1 | 8.3 | 24 nov | 24 nov | 0 |
| 8.5 | Stand, repuestos, microSD de respaldo y empaque | Todos | 1 | 8.4 | 25 nov | 25 nov | 0 |
