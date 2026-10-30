# Histórico en SQLite (tarea 4.8)

Responsable: Arturo. Guarda los datos de `site/datos` en SQLite en la Orange Pi y agrega la página **Histórico** al dashboard (últimas 24 h y últimos 7 días). Acuerdo de `docs/acuerdos/red-y-gateway.md`: modo WAL, `synchronous=NORMAL` y escritura agrupada para cuidar la microSD.

## Cómo funciona

| Parte | Detalle |
| --- | --- |
| Archivo | `/home/arturo/.node-red/historico.db` (cambiar con `gen48.py --db`) |
| Esquema | [`gateway/db/esquema.sql`](../../db/esquema.sql): `lecturas` (una fila por posición del rack y por mensaje del ambiente) y `resumen_hora` |
| Escritura | Un nodo `join` junta 30 s de mensajes y `lote.js` los escribe en **una sola transacción** |
| Resumen y limpieza | Cada hora: recalcula el resumen de las últimas 3 horas y borra lecturas de más de **30 días** (el resumen por hora se queda) |
| Página | `<ruta del dashboard>/historico`: botones 24 h (promedio por minuto) y 7 días (promedio por hora); se refresca cada minuto |
| Validación | `filas.js` descarta lo que no cumple el contrato v1 (`schema`, `node_id`, números) y filtra los códigos de error |
| Volumen | ~105 000 filas al día con un rack (2 posiciones cada 2 s) y un ambiente (cada 5 s) |

## Archivos

| Archivo | Nodo del flujo |
| --- | --- |
| `filas.js` | A filas |
| `lote.js` | SQL del lote |
| `resumen.js` | Resumen por hora y limpieza |
| `consulta.js` | Consulta |
| `series.js` | Series |
| `rango.vue` | Rango del histórico (botones de la página) |
| `gen48.py` | Genera `../flujo-mvp-4.8.json` |
| `historico.test.js` | Pruebas sin Node-RED: `node historico.test.js` (Node 22.5 o más nuevo; usa `node:sqlite`) |

## Instalación en la Orange Pi

Requisitos: flujos 4.1 (broker `mvp_broker`) y 4.3 (dashboard) importados.

1. **Orange Pi** (`arturo@mvp-gateway`): instalar el nodo de SQLite y comprobar que su módulo nativo carga.
   ```bash
   cd ~/.node-red && npm install node-red-node-sqlite && cd ~
   cd ~/.node-red && node -e "require('sqlite3'); console.log('sqlite3 OK')"; cd ~
   ```
   Si la segunda línea falla, npm 11 no corrió el script de instalación de `sqlite3`: `npm install-scripts ls`, aprobarlo con `npm install-scripts approve sqlite3`, `npm rebuild sqlite3` y repetir la comprobación. Si falta compilar: `sudo apt install -y build-essential python3`.
2. **Orange Pi**: `sudo systemctl restart nodered`.
3. **Laptop** (navegador, http://10.42.1.2:1880): menú, Import, `gateway/node-red/flujo-mvp-4.8.json`, Deploy.

## Comprobaciones

- En la pestaña **MVP histórico 4.8**, a los 30 s el nodo "SQL del lote" muestra `N filas · hora` y no hay errores en la barra de depuración.
- **Orange Pi**: `sqlite3` de línea de comandos (opcional, `sudo apt install -y sqlite3`):
  ```bash
  sqlite3 ~/.node-red/historico.db "PRAGMA journal_mode; SELECT node_id, pos, COUNT(*) FROM lecturas GROUP BY 1,2;"
  ```
  Debe decir `wal` y crecer con cada lote.
- Página `http://10.42.1.2:1880/mvp-site/historico`: gráficas de temperatura, humedad y partículas; el botón 7 días muestra datos después de la primera hora.
- Reiniciar Node-RED o la Orange Pi: el histórico sigue ahí.

## Límites conocidos

- La hora de cada lectura es la de la Orange Pi (no tiene reloj con batería): se sincroniza con la laptop. Sin la laptop, después de un reinicio la hora puede quedar atrasada.
- La microSD no es almacenamiento de producción (ver `docs/acuerdos/red-y-gateway.md`).
- Se pierden como máximo 30 s de datos si se corta la luz antes de escribir un lote.
