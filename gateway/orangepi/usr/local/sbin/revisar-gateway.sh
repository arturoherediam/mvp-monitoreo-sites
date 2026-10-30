#!/bin/sh
# Revisión rápida del gateway antes de presentar. En la Orange Pi: sudo revisar-gateway.sh
# Solo lee; no cambia nada. Sale con 0 si todo está bien y con 1 si hay algo que revisar.
F=0
ok ()  { printf '  OK     %s\n' "$1"; }
mal () { printf '  REVISA %s\n' "$1"; F=1; }
inf () { printf '  INFO   %s\n' "$1"; }
[ "$(id -u)" -eq 0 ] || { echo "Correr con sudo: sudo revisar-gateway.sh"; exit 2; }

echo "== Servicios"
for s in hostapd systemd-networkd mosquitto nodered ufw hotspot-watchdog.timer; do
  if systemctl is-active -q "$s"; then ok "$s activo"; else mal "$s no está activo"; fi
done

echo "== Hotspot (antes que nada: antena puesta y vertical)"
st=$(/usr/sbin/hostapd_cli -i wlan0 status 2>/dev/null)
if echo "$st" | grep -q '^state=ENABLED'; then ok "hostapd ENABLED, $(echo "$st" | grep '^ssid\[0\]=' | cut -d= -f2), canal $(echo "$st" | sed -n 's/^channel=//p')"
else mal "hostapd no está ENABLED"; fi
n=$(echo "$st" | sed -n 's/^num_sta\[0\]=//p'); [ -n "$n" ] || n=0
if [ "$n" -ge 2 ]; then ok "$n dispositivos conectados"; else mal "$n dispositivos conectados (se esperan los 2 nodos)"; fi
r=$(journalctl -t hotspot-watchdog --since today -q --no-pager 2>/dev/null | wc -l)
if [ "$r" -eq 0 ]; then ok "sin reinicios automáticos del hotspot hoy"; else mal "$r reinicios automáticos del hotspot hoy (revisar la antena)"; fi

echo "== MQTT"
c=$(ss -Htn state established '( sport = :1883 )' | wc -l)
if [ "$c" -ge 3 ]; then ok "$c conexiones MQTT (Node-RED y nodos)"; else mal "$c conexiones MQTT (se esperan 3: Node-RED y 2 nodos)"; fi

echo "== Histórico"
db=/home/arturo/.node-red/historico.db
if [ -f "$db" ]; then
  f="$db"; [ -f "$db-wal" ] && f="$db-wal"
  m=$(( $(date +%s) - $(stat -c %Y "$f") ))
  if [ "$m" -le 90 ]; then ok "historico.db escrito hace $m s"; else mal "historico.db sin escribir desde hace $m s"; fi
else mal "no existe $db"; fi

echo "== Hora e internet"
if timedatectl show -p NTPSynchronized --value | grep -q yes; then ok "hora sincronizada ($(date '+%d %b %H:%M'))"
else mal "hora sin sincronizar (¿ICS y chrony de la laptop?)"; fi
if ping -c 1 -W 3 1.1.1.1 >/dev/null 2>&1; then ok "internet (viento y Telegram)"
else mal "sin internet: el monitoreo sigue, pero sin viento ni Telegram"; fi

echo "== Recursos"
free -m | awk '/^Mem:/ {printf "  INFO   RAM usada %d de %d MB\n", $3, $2}'
df -h / | awk 'NR==2 {printf "  INFO   microSD %s usada (%s de %s)\n", $5, $3, $2}'
t=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null); [ -n "$t" ] && inf "temperatura del CPU $((t / 1000)) °C"

echo
if [ "$F" -eq 0 ]; then echo "TODO LISTO"; else echo "HAY PUNTOS QUE REVISAR"; fi
exit "$F"
