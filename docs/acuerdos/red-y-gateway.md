# Red y gateway

La Orange Pi Zero 3 es el gateway: crea el hotspot al que se conectan los nodos, corre Mosquitto con ACL, Node-RED y SQLite en microSD. Es una solución válida para el MVP, no para producción.

| Elemento | Acuerdo |
| --- | --- |
| Hotspot de los nodos | Creado con `nmcli` en 2.4 GHz (el ESP32 no usa 5 GHz). Subred `10.42.0.0/24`, gateway `10.42.0.1` |
| Enlace Orange Pi y laptop | Ethernet con *Internet Connection Sharing* (ICS) en la laptop Ubuntu 26.04. Subred `10.42.1.0/24`: laptop `10.42.1.1`, Orange Pi `10.42.1.2` fija |
| Subredes | Separadas a propósito: si ambas fueran `10.42.0.0/24` chocarían el hotspot y el ICS |
| Respaldo de internet | La laptop se conecta al hotspot del celular; el celular no se conecta directo a la Orange Pi |
| Canal WiFi | Se escanea en el recinto y se fija 1, 6 u 11 antes de las pruebas de integración |
| VPN | Apagada en la laptop y en la Orange Pi durante desarrollo y demo; rompió el hotspot en el prototipo |
| SQLite | Modo WAL con `synchronous=NORMAL`; escritura agrupada cada 10 a 30 s para cuidar la microSD |
| Modo demo del índice | El índice de dosis acumulada es un modelo no validado empíricamente, basado en ANSI/ISA-71.04. La demo usa un modo acelerado y se declara al jurado |

## ICS en la laptop (tarea 4.9)

Reemplazar `<interfaz>` por la interfaz Ethernet que muestre `nmcli device` y `<wifi>` por la inalámbrica:

```bash
nmcli device
nmcli connection add type ethernet ifname <interfaz> con-name ics-pi \
  ipv4.method shared ipv4.addresses 10.42.1.1/24
nmcli connection up ics-pi
# Solo si ufw está activo:
sudo ufw allow in on <interfaz> to any port 67 proto udp
sudo ufw allow in on <interfaz> to any port 53
sudo ufw route allow in on <interfaz> out on <wifi>
```

## Topics MQTT

| Topic | Quién publica | Quién lee |
| --- | --- | --- |
| `site/datos` | `nodo_rack`, `nodo_ambiente` | `dashboard` |
| `site/estado/<node_id>` (retenido) | el nodo dueño, y su LWT | `dashboard` |
