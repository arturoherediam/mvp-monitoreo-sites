# db

Histórico de SQLite (tarea 4.8). Esquema de referencia: [`esquema.sql`](esquema.sql). Lo crea y lo usa el flujo [`../node-red/flujo-mvp-4.8.json`](../node-red/flujo-mvp-4.8.json); detalles e instalación en [`../node-red/historico-4.8/`](../node-red/historico-4.8/README.md).

- Archivo: `/home/arturo/.node-red/historico.db` en la Orange Pi. **No se sube al repositorio.**
- Modo WAL con `synchronous=NORMAL` y escritura agrupada cada 30 s (acuerdo de `docs/acuerdos/red-y-gateway.md`).
- Tablas: `lecturas` (30 días) y `resumen_hora` (se conserva).
