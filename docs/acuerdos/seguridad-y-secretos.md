# Seguridad y secretos

El repositorio es **público**: ningún secreto entra a Git, ni siquiera temporalmente. Lo que se sube una vez queda en el historial.

## Dónde viven las contraseñas

Todas en 1Password, en tres bóvedas:

| Bóveda | Quién la ve | Qué contiene |
| --- | --- | --- |
| Gateway | Solo Arturo | Administrador de MQTT, Node-RED, SSH de la Orange Pi, contraseña del hotspot |
| Nodo rack | Luis Mario y Arturo | Usuario y contraseña MQTT del rack, contraseña del hotspot |
| Nodo ambiente | Priscila y Arturo | Usuario y contraseña MQTT del ambiente, contraseña del hotspot |

## MQTT

- **Un usuario por rol:** `nodo_rack`, `nodo_ambiente`, `dashboard` (Node-RED) y `admin`.
- Contraseñas generadas por 1Password, de 20 caracteres o más y distintas entre sí.
- **ACL:** cada nodo solo escribe en `site/datos` y en su propio `site/estado/<node_id>`. El dashboard solo lee. Solo `admin` administra. Ver `gateway/mosquitto/acl.example`.

## Firmware

- Las credenciales van en `include/secrets.h`, que está ignorado con `**/secrets.h` en `.gitignore`.
- El repositorio incluye `include/secrets.example.h` con valores falsos.
- Opcional: una plantilla `secrets.h.tpl` con referencias de 1Password y `op inject` para generarlo.

## Antes de subir cambios

- Corre `gitleaks` sobre el repo antes del primer push (`tools/configurar_repo.sh` lo exige).
- Activa *secret scanning* y *push protection* en GitHub (gratis en repos públicos). El workflow `validar.yml` también corre gitleaks en cada pull request.

## Si un secreto se sube por error

Se considera comprometido. Se cambia de inmediato en 1Password y en el dispositivo. Borrar el commit no basta.

## Hotspot y gateway

- WPA2 o superior con una contraseña larga propia, no la de la casa o la escuela.
- La Orange Pi no se deja con credenciales de fábrica.
- Después del concurso se cambian todas las contraseñas del gateway.

## Limitaciones conocidas del MVP

### MQTT sin TLS

En el MVP el broker Mosquitto escucha en el puerto 1883 **sin cifrado**. Usuario, contraseña y datos viajan en claro entre los nodos y el gateway.

- **Por qué se acepta:** la red es un hotspot propio, aislado de Internet y con WPA2, y solo se conectan los dispositivos del equipo. Agregar TLS exige certificados, validación de fecha y hora en el ESP32 y más memoria, y no cabe en el plazo del concurso.
- **Qué lo mitiga:** WPA2 con contraseña larga, un usuario MQTT por rol con contraseñas distintas, ACL por tema y rotación de todas las credenciales al terminar el concurso.
- **Riesgo que queda:** quien entre a la red WiFi puede leer el tráfico y capturar las credenciales MQTT. Por eso el hotspot no se comparte fuera del equipo y el broker nunca se expone a Internet.

### Trabajo futuro: cifrar MQTT con TLS

1. Crear una autoridad certificadora propia y un certificado para el broker.
2. Configurar un listener en el puerto 8883 en Mosquitto y cerrar el 1883.
3. Cargar el certificado de la CA en el firmware (`WiFiClientSecure::setCACert`) y comprobar el consumo de memoria del ESP32.
4. Sincronizar la hora por NTP en los nodos, porque la validación del certificado la necesita.
5. Definir cómo se renuevan los certificados y quién lo hace.
