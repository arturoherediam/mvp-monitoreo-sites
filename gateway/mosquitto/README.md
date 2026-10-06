# Mosquitto

- `mosquitto.conf.example` y `acl.example` son ejemplos sin secretos.
- El archivo de contraseñas se crea en la Orange Pi con `mosquitto_passwd -c /etc/mosquitto/passwd admin` y se agregan los demás usuarios con `mosquitto_passwd /etc/mosquitto/passwd <usuario>`. **Nunca se sube al repo** (está en `.gitignore`).
- Las contraseñas generadas viven en la bóveda Gateway de 1Password.
