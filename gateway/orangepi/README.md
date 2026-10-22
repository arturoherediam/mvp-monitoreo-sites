# Orange Pi Zero 3: sistema base del gateway

Responsable: Arturo. Tareas 4.5 y 4.6 (ver `docs/plan/wbs.md`). Fases 0 a 2 hechas el 21 y 22 oct; sigue el hotspot (fase 3, tarea 4.5).

La carpeta `etc/` tiene **los archivos exactos** que se aplicaron en la Orange Pi, con la misma ruta que en el sistema (`etc/netplan/...` va en `/etc/netplan/...`). No contienen secretos.

## Estado actual

| Elemento | Valor |
| --- | --- |
| Placa | Orange Pi Zero 3, 1 GB de RAM, disipador y ventilador |
| Sistema | Armbian 26.11 *rolling* (comunidad), Debian 13 "trixie" Minimal, kernel 6.18.57-current-sunxi64 |
| Nombre | `mvp-gateway` |
| Ethernet (`end0`) | IP fija **10.42.1.2/24**; además conserva el DHCP del ICS de la laptop (ruta a internet y DNS) |
| Wi-Fi (`wlan0`) | Sin usar todavía; será el hotspot de los nodos (10.42.0.1/24) |
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

## Uso diario

- Entrar: `ssh arturo@10.42.1.2`. Si la laptop dice `agent refused operation`: `ssh-add ~/.ssh/id_ed25519`.
- `sudo` en un comando remoto necesita terminal: `ssh -t arturo@10.42.1.2 'sudo ...'`.
- Apagar **siempre** con `sudo poweroff`, esperar a que se apague el LED verde y luego desconectar (cuida la microSD).
- Contraseñas en la bóveda Gateway de 1Password: `MVP Gateway · SSH · root` y `MVP Gateway · SSH · arturo`.

## Lecciones

- **Cable:** el cable cruzado que se tenía no daba enlace (sin luces en ningún extremo, ni con el módem). Un cable normal funcionó. Con puertos gigabit cualquier cable sirve (auto MDI-X), pero tiene que estar bien.
- **Tarjeta bloqueada:** el seguro del adaptador SD hacía que Windows la viera como solo lectura.
- **Imagen rolling:** se actualizó una sola vez (22 oct). Después del hotspot se congela el kernel para que ninguna actualización cambie lo que ya funciona.

## Siguiente: hotspot (tarea 4.5)

Con **hostapd** + `systemd-networkd` (servidor DHCP integrado) en `wlan0`: WPA2, 2.4 GHz, canal fijo 1, 6 u 11, red 10.42.0.0/24 y gateway 10.42.0.1. Se eligió en lugar de `nmcli` porque la imagen no trae NetworkManager y en foros de Armbian (2024) el hotspot con `nmcli` en esta placa fallaba con WPA2, mientras que con hostapd funcionaba. Plan C: DietPi. Plan D: adaptador Wi-Fi USB con modo AP.
