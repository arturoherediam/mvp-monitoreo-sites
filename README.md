# MVP de monitoreo ambiental y de seguridad para sites de servidores pequeños

Proyecto integrador del equipo para el **Concurso de Proyectos Integradores del 26 de noviembre de 2026**.

Dos nodos con ESP32 miden el ambiente de un site pequeño de servidores y lo envían por MQTT a un gateway
(Orange Pi Zero 3) que guarda el histórico, calcula índices de mantenimiento y avisa por el dashboard y por Telegram.

- **Nodo rack:** temperatura y humedad en dos posiciones del rack (SHT41 detrás de un TCA9548A), detección de flama (YG1006) y pantalla OLED.
- **Nodo ambiente:** temperatura y humedad (SHT41), partículas PM1.0, PM2.5 y PM10 (PMS5003) y pantalla OLED.
- **Gateway:** hotspot Wi-Fi 2.4 GHz, Mosquitto con ACL, Node-RED con Dashboard 2.0, histórico en SQLite, índices de mantenimiento con viento de Open-Meteo y avisos por Telegram (con cola y reintentos si no hay internet).

```
nodo rack ─┐                                                            ┌─▶ dashboard (monitoreo, mantenimiento, histórico)
           ├─ Wi-Fi 2.4 GHz ─▶ Orange Pi (Mosquitto → Node-RED → SQLite) ┤
nodo amb. ─┘                         │ Ethernet (ICS)                   └─▶ Telegram
                                     ▼
                       laptop ─▶ internet (Wi-Fi del recinto o celular)
```

> Es un MVP para el concurso, no un producto. Los índices de mantenimiento usan modelos y límites publicados (Peck, ASHRAE) con umbrales **teóricos**: no se calibraron en sitios de servidores reales y así se declaran ([docs/acuerdos/indices-mantenimiento.md](docs/acuerdos/indices-mantenimiento.md)).

## Estructura

```
docs/acuerdos/            acuerdos del equipo (contrato JSON, red, secretos, flujo de trabajo, hardware)
docs/plan/                WBS con responsables, fechas y holgura
firmware/common/          librería común (JSON, punto de rocío, MQTT)
firmware/nodo-rack/       proyecto PlatformIO del nodo rack
firmware/nodo-ambiente/   proyecto PlatformIO del nodo ambiente
gateway/node-red/         flujos de Node-RED (4.1 validación, 4.3 dashboard, 4.7 mantenimiento y Telegram, 4.8 histórico), sin credenciales
gateway/mosquitto/        configuración y ACL de ejemplo (sin contraseñas)
gateway/orangepi/         instalación de la Orange Pi paso a paso: sistema, hotspot (hostapd), firewall, Node-RED y vigilancia del hotspot
gateway/scripts/          ICS de la laptop, respaldo de internet y lista antes de presentar
gateway/db/               esquema de SQLite
hardware/altium/          proyecto de Altium Designer (3 esquemáticos, 3 PCB y librerías)
hardware/pcb-sensores/    diseño 1: esquemático en PDF, vista 3D y Gerbers
hardware/pcb-nodo-rack/   diseño 2: esquemático en PDF, vista 3D y Gerbers
hardware/pcb-nodo-ambiente/ diseño 3: esquemático en PDF, vista 3D y Gerbers
hardware/carcasas/        medidas, materiales e imágenes de las carcasas
hardware/bom.md           lista de materiales por placa y registro de compras
tools/                    simulador, validador de ejemplos, scripts del repo
```

## Equipo

| Persona | Responsabilidad |
| --- | --- |
| Arturo | Gateway (Orange Pi), laptop, Node-RED, repositorio e integración |
| Diego | PCB del nodo ambiente, revisión final del hardware, carcasas, fabricación y ensamble |
| Priscila | Nodo ambiente y librería común de firmware |
| Luis Mario | Nodo rack y sensor de flama |
| Sebastián | Esquemáticos de los 3 nodos, PCB de sensores y PCB del nodo rack |

## Cómo empezar

1. Lee `docs/acuerdos/flujo-de-trabajo.md` y `docs/acuerdos/seguridad-y-secretos.md`.
2. Busca tus tareas en los issues (cada tarea del WBS es un issue con título `[ID] tarea`).
3. **Firmware:** copia `include/secrets.example.h` a `include/secrets.h` (ignorado por Git) y llénalo desde 1Password.
4. **Contrato JSON:** cualquier mensaje que publiques debe pasar `python3 tools/validar_ejemplos.py` (ver `docs/acuerdos/contrato-json.md`).
5. **Gateway:** la Orange Pi se instala con [gateway/orangepi/README.md](gateway/orangepi/README.md); antes de cada prueba o presentación, `sudo revisar-gateway.sh` en la Orange Pi y la lista de [gateway/scripts/README.md](gateway/scripts/README.md).
6. **Hardware:** abre `hardware/altium/MVP_Monitoreo.PrjPcb` con Altium Designer desde tu clon del repo. Cada placa tiene su esquemático en PDF, vista 3D y Gerbers en `hardware/pcb-*/` (ver `hardware/altium/README.md`).

## Reglas que no se negocian

- Ningún secreto entra a Git. El repositorio es público.
- `main` está protegida: todo entra por pull request con 1 aprobación.
- El contrato JSON solo cambia con un pull request aprobado por Arturo, Luis Mario y Priscila.
- Congelamiento de funciones el 16 de noviembre de 2026 (v1.0).

## Licencia

MIT. Ver el archivo `LICENSE`.
