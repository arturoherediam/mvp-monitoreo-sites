# Orange Pi Zero 3: sistema base del gateway

Responsable: Arturo. Tareas 4.5 y 4.6 (ver `docs/plan/wbs.md`). Fases 0 a 2 hechas el 21 y 22 oct; fase 3 (hotspot, tarea 4.5) hecha el 29 oct. Sigue la 4.6 (Mosquitto, firewall y Node-RED).

La carpeta `etc/` tiene **los archivos exactos** que se aplicaron en la Orange Pi, con la misma ruta que en el sistema (`etc/netplan/...` va en `/etc/netplan/...`). No contienen secretos: `hostapd.conf.example` es una plantilla y el archivo real con la contraseña solo existe en la Orange Pi.

## Estado actual

| Elemento | Valor |
| --- | --- |
| Placa | Orange Pi Zero 3, 1 GB de RAM, disipador y ventilador |
| Sistema | Armbian 26.11 *rolling* (comunidad), Debian 13 "trixie" Minimal, kernel 6.18.57-current-sunxi64 |
| Nombre | `mvp-gateway` |
| Ethernet (`end0`) | IP fija **10.42.1.2/24**; además conserva el DHCP del ICS de la laptop (ruta a internet y DNS) |
| Wi-Fi (`wlan0`) | Hotspot de los nodos con hostapd: WPA2, 2.4 GHz, canal 6, país MX; IP fija **10.42.0.1/24** y DHCP de 10.42.0.100 a .149 (systemd-networkd) |
| Paquetes congelados | Kernel, DTB, firmware y BSP de Armbian con `apt-mark hold` (29 oct) |
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

`iw dev wlan0 info` no muestra el canal con este driver; `hostapd_cli` sí.

Deshacer: `sudo systemctl disable --now hostapd`, borrar `/etc/hostapd/hostapd.conf` y `/etc/systemd/network/30-wlan0-ap.network`, y `sudo systemctl restart systemd-networkd`.

**Regla:** el hotspot de la Orange Pi y el de la laptop usan el mismo SSID, contraseña e IP (10.42.0.1) para que la laptop sea el respaldo sin volver a cargar los nodos. **Nunca encender los dos a la vez.**

## Uso diario

- Entrar: `ssh arturo@10.42.1.2`. Si la laptop dice `agent refused operation`: `ssh-add ~/.ssh/id_ed25519`.
- `sudo` en un comando remoto necesita terminal: `ssh -t arturo@10.42.1.2 'sudo ...'`.
- Apagar **siempre** con `sudo poweroff`, esperar a que se apague el LED verde y luego desconectar (cuida la microSD).
- Contraseñas en la bóveda Gateway de 1Password: `MVP Gateway · SSH · root` y `MVP Gateway · SSH · arturo`.

## Lecciones

- **Cable:** el cable cruzado que se tenía no daba enlace (sin luces en ningún extremo, ni con el módem). Un cable normal funcionó. Con puertos gigabit cualquier cable sirve (auto MDI-X), pero tiene que estar bien.
- **Tarjeta bloqueada:** el seguro del adaptador SD hacía que Windows la viera como solo lectura.
- **Imagen rolling:** se actualizó una sola vez (22 oct). El 29 oct, con el hotspot funcionando, se congelaron kernel y firmware (`apt-mark hold`). No correr `apt upgrade` hasta después del concurso.
- **`read` y heredoc:** si se pegan juntos, `read` toma las líneas pegadas como respuesta y el archivo queda con SSID vacío (`Line 9: invalid SSID ''`). Pegar cada `read` solo.
- **`iw: command not found`:** está en `/usr/sbin`, fuera del PATH de un usuario normal. Usar `sudo iw`.

## Siguiente: gateway (tarea 4.6)

Mosquitto con usuarios y ACL (`gateway/mosquitto/`), firewall (MQTT solo desde 10.42.0.0/24), Node-RED con los flujos 4.1, 4.3 y 4.7, y arranque automático. Después, 4.8 (histórico en SQLite) y 7.2 (migrar y probar con los nodos reales).

Por qué hostapd y no `nmcli`: la imagen no trae NetworkManager y en foros de Armbian (2024) el hotspot con `nmcli` en esta placa fallaba con WPA2. Planes de respaldo que no hicieron falta: DietPi o un adaptador Wi-Fi USB con modo AP.
