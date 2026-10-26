# pcb-nodo-ambiente

- **Responsables:** Sebastián (diseño de esquemático) y Diego (revisión de esquemático y diseño completo del layout de PCB). Tareas 2.4 y 2.5.
- **Estado:** Terminada (DRC sin errores).
- **Contenido:** ESP32 de 30 pines en socket (`U7`), módulo UART TTL con conector PicoBlade al PMS5003 (`U10`), sensor SHT41 (`U9`, `0x44`), conector para pantalla OLED (`P2`, `0x3C`) y conector USB Tipo A (`J3`) para el riel de 5 V.

## Archivos en esta carpeta

- `Nodo_Ambiente_esquematico.pdf`: esquemático exportado en PDF para consulta sin Altium.
- `Nodo_Ambiente_3D.png`: vista 3D de la placa terminada.
- `fabricacion/Nodo_Ambiente_gerbers.zip`: archivos Gerber y NC Drill listos para fabricación.
- Fuentes editables (`.SchDoc` y `.PcbDoc`): en `hardware/altium/MVP_Monitoreo.PrjPcb`.
- Lista de materiales: en `hardware/bom.md`.
