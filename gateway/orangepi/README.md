# Orange Pi Zero 3: sistema base del gateway

Responsable: Arturo. Tareas 4.5 y 4.6 (ver `docs/plan/wbs.md`). Fases 0 a 2 hechas el 21 y 22 oct; fases 3 (hotspot, tarea 4.5) y 4 (Mosquitto, firewall y Node-RED, tarea 4.6) hechas el 29 oct. Sigue la 4.8 (histórico en SQLite) y la 7.2 (prueba con los nodos reales).

Las carpetas `etc/` y `usr/` tienen **los archivos exactos** que se aplicaron en la Orange Pi, con la misma ruta que en el sistema (`etc/netplan/...` va en `/etc/netplan/...`). No contienen secretos: `hostapd.conf.example` es una plantilla y el archivo real con la contraseña solo existe en la Orange Pi.

## Estado actual

| Elemento | Valor |
| --- | --- |
| Placa | Orange Pi Zero 3, 1 GB de RAM, disipador y ventilador |
| Sistema | Armbian 26.11 *rolling* (comunidad), Debian 13 "trixie" Minimal, kernel 6.18.57-current-sunxi64 |
| Nombre | `mvp-gateway` |
| Ethernet (`end0`) | IP fija **10.42.1.2/24**; además conserva el DHCP del ICS de la laptop (ruta a internet y DNS) |
| Wi-Fi (`wlan0`) | Hotspot de los nodos con hostapd: WPA2, 2.4 GHz, canal 6, país MX; IP fija **10.42.0.1/24** y DHCP de 10.42.0.100 a .149 (systemd-networkd) |
| Paquetes congelados | Kernel, DTB, firmware y BSP de Armbian con `apt-mark hold` (29 oct) |
| MQTT | Mosquitto en el puerto 1883, sin acceso anónimo, 4 usuarios (`admin`, `dashboard`, `nodo_rack`, `nodo_ambiente`) con ACL por tema |
| Firewall | ufw: entrada denegada salvo SSH y Node-RED desde la laptop (`end0`), MQTT y DHCP desde los nodos (`wlan0`) |
| Node-RED | 5.0.9 sobre Node.js 24.22.2, servicio `nodered` del usuario `arturo`, Dashboard 2.0 1.31.0, editor con usuario y contraseña, contexto en disco |
| Vigilancia del hotspot | `hotspot-watchdog.timer` cada minuto: si hay 0 dispositivos durante 3 min (o hostapd no está activo), reinicia hostapd |
| Bluetooth | Apagado (`aw859a-bluetooth` y `bluetooth` deshabilitados): no se usa y comparte la radio con el Wi-Fi |
| Dashboard | http://10.42.1.2:1880/mvp-site/monitoreo y `/mvp-site/mantenimiento` (desde la laptop) |
| Red | `systemd-networkd` con netplan (la imagen mínima no trae NetworkManager) |
| Hora | `systemd-timesyncd` toma la hora de la laptop (chrony en 10.42.1.1) |
| Zona horaria | America/Merida |
| Acceso | SSH **solo con llave**, usuario `arturo` con `sudo`; root no entra por SSH |
| Memoria y disco | 13 % de 970 MB en uso; 5 % de 29 GB (microSD) |

## Archivos aplicados

| Archivo | Para qué |
| --- | --- |
| `etc/netplan/20-mvp-gateway.yaml` | Agrega 10.42.1.2 al bloque `all-eth-interfaces` de Armbian (mismo nombre, para que netplan lo combine y conserve el DHCP). Un bloque aparte para `end0` lo ignoraría systemd-networkd |
| `etc/systemd/timesyncd.conf.d/mvp-gateway.conf` | Hora solo desde la laptop: la Orange Pi solo tiene internet a través de ella, así que un respaldo de internet no sirve |
| `etc/ssh/sshd_config.d/10-mvp-gateway.conf` | Solo llave SSH, sin root y sin contraseñas |
| `etc/hostapd/hostapd.conf.example` | Plantilla del hotspot (sin SSID ni contraseña reales) |
| `usr/local/sbin/revisar-gateway.sh` | Revisión rápida antes de presentar (solo lee); ver [`../scripts`](../scripts/README.md) |
| `usr/local/sbin/hotspot-watchdog.sh` y `etc/systemd/system/hotspot-watchdog.{service,timer}` | Vigilancia del hotspot (ver fase 5) |
| `etc/systemd/network/30-wlan0-ap.network` | IP fija 10.42.0.1 y servidor DHCP en `wlan0`, sin ruta ni DNS para los nodos (no necesitan internet) |

## Cómo se instaló (para repetirlo desde cero)

### Fase 0. Imagen en la microSD

1. Descargar de https://www.armbian.com/orangepizero3/ la imagen **Debian 13 (Trixie) Minimal / CLI** (`.img.xz`) y su archivo `.sha`.
2. Verificar la descarga. En Windows (PowerShell):
   ```powershell
   $img = Get-ChildItem *Orangepizero3*.img.xz | Select-Object -First 1
   (Get-FileHash $img.FullName -Algorithm SHA256).Hash.ToLower()
   Get-Content "$($img.FullName).sha"
   ```
   En Linux: `sha256sum -c Armbian_*Orangepizero3*.img.xz.sha`. Los dos valores deben coincidir.
3. Grabar con **balenaEtcher** (valida la escritura). Si Windows pide formatear la tarjeta: **Cancelar**.

### Fase 1. Primer arranque

1. En la laptop, crear el ICS en el adaptador USB-RJ45 (ver `docs/acuerdos/red-y-gateway.md`).
2. Conectar antena, microSD y cable Ethernet; después la fuente de 5 V / 3 A. Esperar 2 a 3 min.
3. Buscar la IP que dio la laptop: `ip neigh show dev <interfaz>`.
4. `ssh root@<ip>` con la contraseña de fábrica `1234`. El asistente de Armbian pide la nueva contraseña de root, crea el usuario `arturo` (con `sudo`) y detecta la zona horaria. Idioma: saltar (sistema en inglés).
5. Copiar la llave desde la laptop: `ssh-copy-id arturo@<ip>`.

### Fase 2. Sistema base (como `arturo`)

```bash
sudo hostnamectl set-hostname mvp-gateway
sudo sed -i 's/\borangepizero3\b/mvp-gateway/g' /etc/hosts
sudo timedatectl set-timezone America/Merida
# Copiar los 3 archivos de etc/ a /etc/ (mismas rutas), y luego:
sudo chmod 600 /etc/netplan/20-mvp-gateway.yaml
sudo netplan generate && sudo netplan apply
sudo systemctl restart systemd-timesyncd
sudo sshd -t && sudo systemctl reload ssh
sudo apt update && sudo apt full-upgrade -y
sudo reboot
```

Comprobaciones (todas pasaron el 22 oct, también después de reiniciar):

```bash
ip -br addr show end0                              # 10.42.1.2/24 y la IP del DHCP
timedatectl timesync-status | grep -E "Server|Leap" # Server: 10.42.1.1, Leap: normal
ssh -o PubkeyAuthentication=no arturo@10.42.1.2    # debe rechazar: Permission denied (publickey)
ssh root@10.42.1.2                                 # debe rechazar
```

### Fase 3. Hotspot (tarea 4.5, 29 oct)

Revisión previa (solo lectura): el chip UWE5622 (driver `sprdwl_ng` / `unisoc_wifi`) soporta modo **AP**; no puede ser AP y cliente a la vez (`{ managed, AP } <= 1`), por eso el internet llega por Ethernet. `wpa_supplicant` corre sin `-i wlan0` y no estorba. `iw` ya viene instalado, pero en `/usr/sbin`: se usa con `sudo`.

```bash
# En la laptop, desde gateway/orangepi/: copiar las plantillas a la Orange Pi
scp etc/hostapd/hostapd.conf.example etc/systemd/network/30-wlan0-ap.network arturo@10.42.1.2:~
# En la Orange Pi:
sudo apt install -y hostapd
sudo systemctl unmask hostapd 2>/dev/null; sudo systemctl stop hostapd
# 1) Hotspot: llenar ssid y wpa_passphrase (8 a 63 caracteres) desde 1Password
sudo install -m 600 ~/hostapd.conf.example /etc/hostapd/hostapd.conf
sudo nano /etc/hostapd/hostapd.conf
# 2) IP fija y DHCP:
sudo install -m 644 ~/30-wlan0-ap.network /etc/systemd/network/
rm ~/hostapd.conf.example ~/30-wlan0-ap.network
sudo systemctl restart systemd-networkd
sudo systemctl enable --now hostapd
# 3) Congelar kernel y firmware:
sudo apt-mark hold armbian-bsp-cli-orangepizero3-current armbian-firmware linux-dtb-current-sunxi64 linux-image-current-sunxi64
```

Comprobaciones (todas pasaron el 29 oct, también después de reiniciar; el DHCP entregó IP a 2 dispositivos, entre ellos un nodo ESP32):

```bash
systemctl is-active hostapd systemd-networkd                          # active, active
ip -br addr show wlan0                                                # UP 10.42.0.1/24
sudo hostapd_cli -i wlan0 status | grep -E "^state|^channel|num_sta"  # ENABLED, 6, num_sta >= 1
networkctl status wlan0 --no-pager | grep -A5 -i lease                # IP entregadas
apt-mark showhold                                                     # los 4 paquetes
```

Con este driver, `iw dev wlan0 info` no muestra el canal e `iw dev wlan0 station dump` no lista los dispositivos conectados (siempre 0); `hostapd_cli` sí da ambos datos.

Deshacer: `sudo systemctl disable --now hostapd`, borrar `/etc/hostapd/hostapd.conf` y `/etc/systemd/network/30-wlan0-ap.network`, y `sudo systemctl restart systemd-networkd`.

**Regla:** el hotspot de la Orange Pi y el de la laptop usan el mismo SSID, contraseña e IP (10.42.0.1) para que la laptop sea el respaldo sin volver a cargar los nodos. **Nunca encender los dos a la vez.**

### Fase 4. Gateway (tarea 4.6, 29 oct)

Todo en la Orange Pi salvo donde se indica. Las contraseñas salen de la bóveda Gateway de 1Password y son **las mismas que en la laptop**, para que los nodos no se vuelvan a cargar.

**Mosquitto** (archivos de `gateway/mosquitto/`):

```bash
sudo apt install -y mosquitto mosquitto-clients
# Copiar mosquitto.conf.example a /etc/mosquitto/conf.d/mvp.conf y acl.example a /etc/mosquitto/acl
sudo mosquitto_passwd -c /etc/mosquitto/passwd admin      # -c solo en el primero
sudo mosquitto_passwd /etc/mosquitto/passwd dashboard
sudo mosquitto_passwd /etc/mosquitto/passwd nodo_rack
sudo mosquitto_passwd /etc/mosquitto/passwd nodo_ambiente
sudo chown mosquitto:mosquitto /etc/mosquitto/passwd /etc/mosquitto/acl
sudo chmod 600 /etc/mosquitto/passwd /etc/mosquitto/acl
sudo systemctl restart mosquitto
```

**Firewall** (dejar abierta la sesión SSH actual y probar SSH desde otra terminal antes de cerrarla):

```bash
sudo apt install -y ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow in on end0  from 10.42.1.0/24 to any port 22   proto tcp comment 'SSH desde la laptop'
sudo ufw allow in on end0  from 10.42.1.0/24 to any port 1880 proto tcp comment 'Node-RED desde la laptop'
sudo ufw allow in on wlan0 from 10.42.0.0/24 to any port 1883 proto tcp comment 'MQTT de los nodos'
sudo ufw allow in on wlan0 to any port 67 proto udp comment 'DHCP del hotspot'
sudo ufw enable
```

**Node-RED:**

```bash
bash <(curl -sL https://github.com/node-red/linux-installers/releases/latest/download/install-update-nodered-deb)
```

En `node-red admin init`: sin estadísticas; **seguridad sí** (usuario `admin`, acceso completo; 1Password `MVP Gateway · Node-RED · admin`); Projects no; `flows.json`; *credential secret* propio (1Password `MVP Gateway · Node-RED · credentialSecret`); **módulos externos en Function: No** (ningún flujo los usa).

```bash
cd ~/.node-red && npm install @flowfuse/node-red-dashboard@1.31.0 && cd ~
# Telegram: crear ~/.node-red/environment (chmod 600) como en gateway/node-red/indices-4.7/README.md
# Desde la laptop: scp gateway/node-red/indices-4.7/configurar_settings.py arturo@10.42.1.2:~
python3 ~/configurar_settings.py && rm ~/configurar_settings.py
# admin init de Node-RED 5 deja uiHost en 127.0.0.1: abrirlo a todas las interfaces (el firewall limita 1880 a la laptop)
sed -i -E 's|^([[:space:]]*)uiHost:[[:space:]]*"127\.0\.0\.1"|\1uiHost: "0.0.0.0"|' ~/.node-red/settings.js
sudo systemctl enable --now nodered
```

En el editor (http://10.42.1.2:1880, desde la laptop): importar `flujo-mvp-4.1.json`, poner usuario `dashboard` y su contraseña en el broker `mvp_broker` (pestaña Security), Deploy; después importar `flujo-mvp-4.3.json` y `flujo-mvp-4.7.json` con Deploy.

Comprobaciones (todas pasaron el 29 oct, también después de reiniciar sin tocar nada):

```bash
systemctl is-enabled hostapd systemd-networkd mosquitto nodered ufw   # enabled ×5
systemctl is-active hostapd systemd-networkd mosquitto nodered        # active ×4
sudo ufw status | head -3                                             # Status: active
sudo ss -tn state established '( sport = :1883 )'                     # Node-RED (127.0.0.1) y cada nodo (10.42.0.x)
free -h | head -2                                                     # ~200 MB usados de 970 MB
```

Además: mensajes del nodo ambiente validados (OK) cada 5 s en la barra de depuración, dashboard con datos, viento de Open-Meteo y prueba de Telegram entregada.

### Fase 5. Estabilidad del hotspot (29 oct)

**Falla observada:** a las 19:43, unos 17 min después de reiniciar, los dos nodos salieron del Wi-Fi con 30 s de diferencia y no volvieron. El teléfono ya no veía la red, pero hostapd seguía en `state=ENABLED` y `type AP`, y el kernel no registró ningún error. `sudo systemctl restart hostapd` lo recuperó. Es decir: el chip UWE5622 deja de transmitir **en silencio**.

**Respuesta:**

1. **Vigilancia automática.** Un *timer* de systemd revisa cada minuto cuántos dispositivos hay (con `hostapd_cli`, `num_sta[0]`); con 0 durante 3 min seguidos (o hostapd inactivo) reinicia hostapd y lo registra. Efecto secundario aceptado: si los nodos están apagados a propósito, reinicia hostapd cada 3 min (sin consecuencias).
   ```bash
   # Desde la laptop, desde gateway/orangepi/:
   scp usr/local/sbin/hotspot-watchdog.sh etc/systemd/system/hotspot-watchdog.service etc/systemd/system/hotspot-watchdog.timer arturo@10.42.1.2:~
   # En la Orange Pi:
   sudo install -m 755 ~/hotspot-watchdog.sh /usr/local/sbin/
   sudo install -m 644 ~/hotspot-watchdog.service ~/hotspot-watchdog.timer /etc/systemd/system/
   rm ~/hotspot-watchdog.sh ~/hotspot-watchdog.service ~/hotspot-watchdog.timer
   sudo systemctl daemon-reload && sudo systemctl enable --now hotspot-watchdog.timer
   ```
   Prueba (29 oct): con los dos nodos apagados, a los 3 min registró `reinicio hostapd`; al encenderlos se conectaron solos (`num_sta[0]=2`).
   La primera versión contaba con `iw ... station dump`, que con este driver siempre da 0: reiniciaba hostapd cada 3 min aunque los nodos estuvieran conectados (se vio en el registro de hostapd: `associated` sin `disassociated` antes de cada reinicio). Se corrigió para contar con `hostapd_cli`.
2. **Bluetooth apagado.** `aw859a-bluetooth.service` (corre `hciattach_opi` y enciende la parte Bluetooth del chip) y `bluetooth.service` (BlueZ). **No** tocar `aw859a-wifi.service`.
   ```bash
   sudo systemctl disable --now aw859a-bluetooth.service bluetooth.service
   ```
   Deshacer: `sudo systemctl enable --now aw859a-bluetooth.service bluetooth.service`. Después de reiniciar: sin `hciattach`, sin `MARLIN_BLUETOOTH` en `dmesg` y el hotspot con los nodos conectados.

Comprobar: `systemctl list-timers hotspot-watchdog.timer` y `sudo journalctl -t hotspot-watchdog` (cada reinicio que hizo).

**Segunda caída (21:12) y causa real: la antena.** Al mover la laptop y los nodos, los dos nodos salieron del Wi-Fi en el mismo segundo y ni el teléfono veía la red; dos reinicios de hostapd no la recuperaron. **Al acomodar la antena volvieron.** La Orange Pi Zero 3 no tiene antena integrada: usa una externa en un conector u.FL de la placa, que se afloja fácil. Es probable que la caída de las 19:43 haya tenido la misma causa.

**Prueba larga (29 al 30 oct, sin mover nada):** unas 10.5 h sin reinicios de la vigilancia y con los dos nodos conectados al final (`num_sta[0]=2`).

**Cuidar la antena:**
- Asegurar el conector u.FL con un poco de cinta o una gota de silicón caliente en el borde, sin tapar el contacto ni jalar el cable.
- Fijar el cable de la antena a la caja de la Orange Pi (la caja de acrílico que vino con la placa) para que moverla no lo jale.
- Antena vertical, a la vista y lejos de metal (laptop, rack, monitor).

**Si los nodos se desconectan, revisar en este orden:** (1) la antena y su conector; (2) que un teléfono a 30 cm vea `ESP32-Proyecto`; (3) `sudo hostapd_cli -i wlan0 status` y `sudo journalctl -t hotspot-watchdog`. La vigilancia y el Bluetooth apagado se quedan: cubren una caída del chip, pero no pueden arreglar una antena floja.

Si alguna vez la caída vuelve con la antena bien y el reinicio de hostapd no basta, el siguiente paso sería recargar el driver o usar un adaptador Wi-Fi USB con modo AP y driver del kernel (por ejemplo, chips RT5370/RT5372 con `rt2800usb` o MT7610U/MT7612U con `mt76`).

## Uso diario

- Entrar: `ssh arturo@10.42.1.2`. Si la laptop dice `agent refused operation`: `ssh-add ~/.ssh/id_ed25519`.
- `sudo` en un comando remoto necesita terminal: `ssh -t arturo@10.42.1.2 'sudo ...'`.
- Apagar **siempre** con `sudo poweroff`, esperar a que se apague el LED verde y luego desconectar (cuida la microSD).
- Contraseñas en la bóveda Gateway de 1Password: `MVP Gateway · SSH · root` y `MVP Gateway · SSH · arturo`; Mosquitto (`MVP Gateway · Mosquitto · <usuario>`), editor de Node-RED (`MVP Gateway · Node-RED · admin`) y su *credential secret*.
- Editor de Node-RED: http://10.42.1.2:1880. Dashboard: http://10.42.1.2:1880/mvp-site/monitoreo y `/mvp-site/mantenimiento`.
- Registro de Node-RED: `sudo journalctl -u nodered -n 50`. Reinicios automáticos del hotspot: `sudo journalctl -t hotspot-watchdog`. Reiniciarlo: `sudo systemctl restart nodered`.
- Ver mensajes MQTT: `mosquitto_sub -h localhost -u dashboard -P "$PW" -t 'site/#' -v` (leer antes la contraseña con `read -rsp`).

## Lecciones

- **Cable:** el cable cruzado que se tenía no daba enlace (sin luces en ningún extremo, ni con el módem). Un cable normal funcionó. Con puertos gigabit cualquier cable sirve (auto MDI-X), pero tiene que estar bien.
- **Tarjeta bloqueada:** el seguro del adaptador SD hacía que Windows la viera como solo lectura.
- **Imagen rolling:** se actualizó una sola vez (22 oct). El 29 oct, con el hotspot funcionando, se congelaron kernel y firmware (`apt-mark hold`). No correr `apt upgrade` hasta después del concurso.
- **`read` y heredoc:** si se pegan juntos, `read` toma las líneas pegadas como respuesta y el archivo queda con SSID vacío (`Line 9: invalid SSID ''`). Pegar cada `read` solo.
- **`iw: command not found`:** está en `/usr/sbin`, fuera del PATH de un usuario normal. Usar `sudo iw`.
- **Instalador de Node-RED:** el script cambió de nombre a `install-update-nodered-deb`; el anterior (`update-nodejs-and-nodered-deb`) ya da *Not Found*.
- **Node-RED 5:** `admin init` escribe `settings.js` con otro formato y con `uiHost: "127.0.0.1"`. `configurar_settings.py` ya tolera el formato nuevo; `uiHost` se cambia con `sed`.
- **Revisar la herramienta antes de confiar en ella:** `iw station dump` daba 0 con nodos conectados. Antes de automatizar una decisión, comparar la medida con otra fuente (aquí, `hostapd_cli` y el registro de hostapd).
- **Antena primero:** dos nodos que se caen en el mismo segundo y un teléfono que no ve la red apuntan a algo físico (antena u.FL floja), no al software.
- **El hotspot puede caer sin avisar:** `state=ENABLED` no garantiza que transmita. Lo que sí lo confirma es que un teléfono vea la red o que haya dispositivos conectados (`num_sta`).
- **`sudo` y pegar varias líneas:** si `sudo` pide contraseña a mitad de un bloque, toma las líneas pegadas como contraseña. Correr `sudo -v` antes.
- **Mosquitto en Debian** escribe conexiones y desconexiones en `/var/log/mosquitto/mosquitto.log`, no en `journalctl`.
- **Pegar comandos:** si aparece `^[[200~` al inicio, la terminal pegó caracteres de control; volver a pegar la línea sola.

## Siguiente

Hechos el 30 oct: **4.8** histórico en SQLite (ver [`../node-red/historico-4.8`](../node-red/historico-4.8/README.md)), **7.2** prueba con los dos nodos completos (rack con flama y ambiente) y **4.9** ICS y respaldo de internet (ver [`../scripts`](../scripts/README.md)).

Sigue: integración con las PCB y los enclosures (7.4 y 7.5) y las pruebas de estabilidad y de fallo (7.6 y 7.7). Antes de cada prueba: `sudo revisar-gateway.sh`.

Por qué hostapd y no `nmcli`: la imagen no trae NetworkManager y en foros de Armbian (2024) el hotspot con `nmcli` en esta placa fallaba con WPA2. Planes de respaldo que no hicieron falta: DietPi o un adaptador Wi-Fi USB con modo AP.
