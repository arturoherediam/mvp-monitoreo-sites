# Proyecto de Altium Designer (`MVP_Monitoreo`)

Proyecto unificado de hardware para los tres diseños de PCB del sistema de monitoreo de sites.

## Estructura del proyecto

| Archivo | Descripción | Autoría |
| --- | --- | --- |
| `MVP_Monitoreo.PrjPcb` | Archivo maestro del proyecto de Altium Designer | Sebastián y Diego |
| `MVP_Monitoreo.BomDoc` | Configuración de ActiveBOM de los componentes | Diego |
| `Nodo_Sensores.SchDoc` / `Nodo_Sensores_pcb.PcbDoc` | Esquemático y PCB de sensores (SHT41 + YG1006) | Sebastián (diseño) y Diego (revisión) |
| `Nodo_rack.SchDoc` / `Nodo_rack_pcb.PcbDoc` | Esquemático y PCB del nodo rack (ESP32 + TCA9548A + OLED) | Sebastián (diseño) y Diego (revisión) |
| `Nodo_Ambiente.SchDoc` / `Nodo_Ambiente_pcb.PcbDoc` | Esquemático y PCB del nodo ambiente (ESP32 + SHT41 + PMS5003 + OLED) | Sebastián (esquemático) y Diego (revisión y layout de PCB) |
| `libs/Schematic-Lib-PhilsLab.SchLib` | Librería de símbolos de esquemático del proyecto | — |
| `libs/PcbLib1.PcbLib` | Librería de huellas adicionales | — |

> **Nota sobre librerías:** Las huellas y modelos 3D ya se encuentran embebidos dentro de cada archivo `.PcbDoc`, por lo que el proyecto abre, muestra la vista 3D y permite exportar salidas sin requerir librerías externas pesadas.

## Cómo trabajar en el proyecto (flujo Git)

1. Clona o actualiza (`git pull`) el repositorio y crea una rama para tu cambio (`feat/hw-<tema>` o `fix/hw-<placa>`).
2. Abre `hardware/altium/MVP_Monitoreo.PrjPcb` directamente desde tu clon local en Altium Designer.
3. **Regla para archivos binarios:** `.SchDoc` y `.PcbDoc` son binarios y no se pueden fusionar automáticamente. **Un documento lo edita una sola persona a la vez** (avisa al equipo en el issue antes de modificar una placa).
4. Si un cambio modifica el layout final para fabricación, actualiza también el PDF, la vista 3D y el `.zip` de Gerbers en la carpeta correspondiente (`hardware/pcb-*/`) antes de abrir el Pull Request.
