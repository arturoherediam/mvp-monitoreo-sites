# pcb-nodo-rack

- **Responsables:** Sebastián (diseño de esquemático y layout de PCB) y Diego (revisión y cierre final). Tarea 2.3.
- **Estado:** Terminada (DRC sin errores).
- **Contenido:** ESP32 de 30 pines en socket (`U3`), multiplexor I2C PCA9548A/TCA9548A en socket (`U2`, `0x70`), conector para pantalla OLED (`P1`, `0x3C`) y puerto de 8 pines (`J1`) hacia las dos PCB de sensores.

## Archivos en esta carpeta

- `Nodo_rack_esquematico.pdf`: esquemático exportado en PDF para consulta sin Altium.
- `Nodo_rack_3D.png`: vista 3D de la placa terminada.
- `fabricacion/Nodo_rack_gerbers.zip`: archivos Gerber y NC Drill listos para fabricación.
- Fuentes editables (`.SchDoc` y `.PcbDoc`): en `hardware/altium/MVP_Monitoreo.PrjPcb`.
- Lista de materiales: en `hardware/bom.md`.
