#!/bin/sh
# Reinicia hostapd si no está activo o si el hotspot lleva LIMITE minutos seguidos sin dispositivos.
# Motivo: el chip UWE5622 deja de transmitir en silencio (hostapd sigue en ENABLED) y un reinicio lo recupera.
LIMITE=3
CUENTA=/run/hotspot-watchdog.cuenta
n=$(/usr/sbin/iw dev wlan0 station dump 2>/dev/null | grep -c '^Station')
if systemctl is-active -q hostapd && [ "$n" -gt 0 ]; then
  echo 0 > "$CUENTA"; exit 0
fi
c=$(( $(cat "$CUENTA" 2>/dev/null || echo 0) + 1 ))
echo "$c" > "$CUENTA"
if [ "$c" -ge "$LIMITE" ]; then
  logger -t hotspot-watchdog "hotspot sin dispositivos durante $c min (o hostapd inactivo): reinicio hostapd"
  systemctl restart hostapd
  echo 0 > "$CUENTA"
fi
