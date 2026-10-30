#!/bin/sh
# Reinicia hostapd si no está activo o si el hotspot lleva LIMITE minutos seguidos sin dispositivos.
# Motivo: el chip UWE5622 deja de transmitir en silencio (hostapd sigue en ENABLED) y un reinicio lo recupera.
# Cuenta con hostapd_cli: con este driver, "iw station dump" siempre da 0.
LIMITE=3
CUENTA=/run/hotspot-watchdog.cuenta
n=$(/usr/sbin/hostapd_cli -i wlan0 status 2>/dev/null | sed -n 's/^num_sta\[0\]=//p')
[ -n "$n" ] || n=0
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
