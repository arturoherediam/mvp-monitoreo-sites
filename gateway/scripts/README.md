# scripts

Red de la laptop y lista antes de presentar (tarea 4.9). El hotspot (4.5), el gateway (4.6) y el histórico (4.8) están en la Orange Pi: ver [`../orangepi`](../orangepi/README.md).

## ICS y respaldo de internet

Cómo se configura el ICS en la laptop y los resultados de las pruebas: [`docs/acuerdos/red-y-gateway.md`](../../docs/acuerdos/red-y-gateway.md#ics-en-la-laptop-tarea-49).

Respaldo si no hay internet en el recinto, en la **laptop**:

```bash
nmcli device wifi connect "<hotspot del celular>" --ask   # por Wi-Fi, no por USB
nmcli connection up "<red de siempre>"                    # para regresar
```

No hay que tocar la Orange Pi. Si un aviso de Telegram falla durante el cambio, se reintenta solo (el nodo "Telegram: cola y reintentos" muestra cuántos esperan); **Probar Telegram** (pestaña 4.7) confirma que ya hay salida.

Sin internet en absoluto, el monitoreo sigue completo (nodos, dashboard, histórico y alertas en pantalla); solo faltan viento y Telegram.

## Revisión del gateway

`gateway/orangepi/usr/local/sbin/revisar-gateway.sh` solo lee y resume en una pantalla: servicios, hotspot y dispositivos, reinicios automáticos de la última hora (y el total del día, como dato), conexiones MQTT, última escritura del histórico, hora, internet, RAM, microSD y temperatura. Termina en **TODO LISTO** o **HAY PUNTOS QUE REVISAR**.

Instalarlo o actualizarlo:

```bash
# Laptop, desde la raíz del repo:
scp gateway/orangepi/usr/local/sbin/revisar-gateway.sh arturo@10.42.1.2:~
# Orange Pi:
sudo install -m 755 ~/revisar-gateway.sh /usr/local/sbin/ && rm ~/revisar-gateway.sh
sudo revisar-gateway.sh
```

## Lista antes de presentar

Físico:
- [ ] Antena de la Orange Pi conectada (u.FL asegurado), vertical y lejos de metal.
- [ ] Orange Pi con su fuente de 5 V / 3 A; cable Ethernet normal a la laptop.
- [ ] Nodos rack y ambiente encendidos con sus eliminadores de 5 V.
- [ ] Celular con datos y batería para el respaldo de internet.

Laptop:
- [ ] VPN apagada y **hotspot de la laptop apagado**.
- [ ] `ics-pi` activa (`nmcli -f NAME,DEVICE connection show --active`).
- [ ] Internet en el Wi-Fi del recinto o en el hotspot del celular.

Orange Pi y dashboard:
- [ ] `sudo revisar-gateway.sh` dice **TODO LISTO**.
- [ ] Un teléfono ve la red de los nodos.
- [ ] Monitoreo: los dos nodos en línea. Mantenimiento: sin alertas inesperadas. Histórico: con datos.
- [ ] **Probar Telegram**: entregado.

Si algo falla: antena primero; luego `sudo revisar-gateway.sh`; contingencia: hotspot de la laptop (mismo nombre, contraseña e IP) y Node-RED de la laptop (`node-red -u ~/.node-red-mvp`), con la Orange Pi apagada.
