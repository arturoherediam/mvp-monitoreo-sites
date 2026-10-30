-- Histórico del MVP (tarea 4.8). SQLite en la microSD de la Orange Pi: ~/.node-red/historico.db
-- Lo crea el flujo 4.8 al arrancar (nodo "Crear esquema"); este archivo es la referencia.
-- ts y hora en milisegundos desde 1970 (hora de la Orange Pi, sincronizada con la laptop).
PRAGMA journal_mode=WAL;

-- Una fila por punto de medición y mensaje: rack = una por posición (A, B); ambiente = pos ''.
CREATE TABLE IF NOT EXISTS lecturas (
  ts        INTEGER NOT NULL,
  node_id   TEXT    NOT NULL,
  pos       TEXT    NOT NULL DEFAULT '',
  temp      REAL,
  hum       REAL,
  dew_point REAL,
  flame     INTEGER,
  pm1_0     REAL,
  pm2_5     REAL,
  pm10      REAL,
  err       TEXT
);
CREATE INDEX IF NOT EXISTS lecturas_ts ON lecturas(ts);

-- Resumen por hora; se recalcula cada hora para las últimas 3 horas y no se borra.
CREATE TABLE IF NOT EXISTS resumen_hora (
  hora      INTEGER NOT NULL,
  node_id   TEXT    NOT NULL,
  pos       TEXT    NOT NULL DEFAULT '',
  n         INTEGER,
  temp_avg  REAL, temp_min REAL, temp_max REAL,
  hum_avg   REAL, hum_min  REAL, hum_max  REAL,
  dew_avg   REAL,
  pm2_5_avg REAL, pm2_5_max REAL,
  pm10_avg  REAL, pm10_max  REAL,
  flama     INTEGER,
  PRIMARY KEY (hora, node_id, pos)
);
