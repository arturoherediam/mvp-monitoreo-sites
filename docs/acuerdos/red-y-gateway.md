# Red y gateway

La Orange Pi Zero 3 es el gateway: crea el hotspot al que se conectan los nodos, corre Mosquitto con ACL, Node-RED y SQLite en microSD. Es una solución válida para el MVP, no para producción.

| Elemento | Acuerdo |
| --- | --- |
| Hotspot de los nodos | Creado con **hostapd** en `wlan0` de la Orange Pi: WPA2, 2.4 GHz (el ESP32 no usa 5 GHz); `systemd-networkd` da las IP por DHCP. Subred `10.42.0.0/24`, gateway `10.42.0.1`. Se cambió de `nmcli` a hostapd el 22 oct: la imagen Armbian mínima no trae NetworkManager y en esta placa el hotspot con `nmcli` fallaba con WPA2 (foros de Armbian, 2024). Ver [gateway/orangepi](../../gateway/orangepi/README.md) |
| Enlace Orange Pi y laptop | Ethernet con *Internet Connection Sharing* (ICS) en la laptop Ubuntu 26.04. Subred `10.42.1.0/24`: laptop `10.42.1.1`, Orange Pi `10.42.1.2` fija en `end0` (conserva también el DHCP del ICS para la ruta a internet y el DNS). Con un cable normal: el cable cruzado que se probó no daba enlace |
| Subredes | Separadas a propósito: si ambas fueran `10.42.0.0/24` chocarían el hotspot y el ICS |
| Respaldo de internet | La laptop se conecta al hotspot del celular; el celular no se conecta directo a la Orange Pi |
| Canal WiFi | Se escanea en el recinto y se fija 1, 6 u 11 antes de las pruebas de integración |
| VPN | Apagada en la laptop y en la Orange Pi durante desarrollo y demo; rompió el hotspot en el prototipo |
| Sistema de la Orange Pi | Armbian 26.11 *rolling* (Debian 13 Minimal, kernel 6.18.57). Se actualiza una vez y se congela el kernel después del hotspot |
| Hora | La laptop es servidor de hora (chrony, `allow 10.42.1.0/24`); la Orange Pi la toma con `systemd-timesyncd` (`NTP=10.42.1.1`). Así la hora es correcta aunque no haya internet |
| Acceso a la Orange Pi | SSH solo con llave, usuario `arturo` con `sudo`, sin root ni contraseñas |
| SQLite | Modo WAL con `synchronous=NORMAL`; escritura agrupada cada 10 a 30 s para cuidar la microSD |
| Índices de mantenimiento | Reemplazan al índice de dosis (ANSI/ISA-71.04 mide gases corrosivos con cupones, y no los medimos). Se calculan en Node-RED con límites ASHRAE, el modelo de Peck y viento de Open-Meteo; dan riesgo relativo, no probabilidad de falla. La demo usa un modo acelerado y se declara al jurado. Ver [indices-mantenimiento.md](indices-mantenimiento.md) |

## ICS en la laptop (tarea 4.9)

Reemplazar `<interfaz>` por la interfaz Ethernet que muestre `nmcli device` y `<wifi>` por la inalámbrica:

```bash
nmcli device
nmcli connection add type ethernet ifname <interfaz> con-name ics-pi \
  ipv4.method shared ipv4.addresses 10.42.1.1/24 ipv6.method disabled
nmcli connection up ics-pi
# Solo si ufw está activo:
sudo ufw allow in on <interfaz> to any port 67 proto udp
sudo ufw allow in on <interfaz> to any port 53
sudo ufw allow in on <interfaz> to any port 123 proto udp   # hora (chrony)
sudo ufw route allow in on <interfaz> out on <wifi>
```

Hora en la laptop (servidor para la Orange Pi):

```bash
sudo apt install -y chrony
echo "allow 10.42.1.0/24" | sudo tee /etc/chrony/conf.d/mvp-gateway.conf
sudo systemctl restart chrony
```

## Topics MQTT

| Topic | Quién publica | Quién lee |
| --- | --- | --- |
| `site/datos` | `nodo_rack`, `nodo_ambiente` | `dashboard` |
| `site/estado/<node_id>` (retenido) | el nodo dueño, y su LWT | `dashboard` |
