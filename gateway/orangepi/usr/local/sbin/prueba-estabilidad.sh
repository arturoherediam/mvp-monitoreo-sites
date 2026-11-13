#!/bin/sh
# Prueba de estabilidad de 24 h con corte de energía (tarea 7.6). Solo lee; no cambia nada del sistema.
# Uso (en la Orange Pi):
#   sudo prueba-estabilidad.sh inicio   al empezar: guarda el punto de partida
#   sudo prueba-estabilidad.sh corte    justo antes de desconectar la luz (desconectar en menos de 30 s)
#   sudo prueba-estabilidad.sh final    al terminar: imprime la tabla de criterios (OK / REVISA)
# Guarda su estado en /var/lib/mvp-pruebas/. Lee el histórico (SQLite) y el contexto de Node-RED en solo lectura.
[ "$(id -u)" -eq 0 ] || { echo "Correr con sudo: sudo prueba-estabilidad.sh inicio|corte|final"; exit 2; }
case "$1" in inicio|corte|final) ;; *) echo "Uso: sudo prueba-estabilidad.sh inicio|corte|final"; exit 2;; esac
DB=${MVP_DB:-/home/arturo/.node-red/historico.db}
CTX=${MVP_CTX:-/home/arturo/.node-red/context/d47_tab/flow.json}
DIR=${MVP_DIR:-/var/lib/mvp-pruebas}
mkdir -p "$DIR"
WD=$(journalctl -t hotspot-watchdog -o short-unix -q --no-pager 2>/dev/null | cut -d' ' -f1 | cut -d. -f1 | tr '\n' ' ')
RAM=$(free -m | awk '/^Mem:/ {print $3}')
TEMP=$(cat /sys/class/thermal/thermal_zone0/temp 2>/dev/null || echo 0)
DISCO=$(df --output=pcent / | tail -1 | tr -dc 0-9)
ARRANQUE=${MVP_ARRANQUE:-$(awk '/^btime/ {print $2}' /proc/stat)}
NR=$(systemctl show nodered -p NRestarts --value 2>/dev/null || echo 0)
export DB CTX DIR WD RAM TEMP DISCO ARRANQUE NR
exec python3 -I - "$1" <<'PY'
import json, os, sqlite3, sys, time, datetime as dt

modo = sys.argv[1]
E = os.environ
DIR, DB, CTX = E['DIR'], E['DB'], E['CTX']
ahora = time.time()
hora = lambda s: dt.datetime.fromtimestamp(s).strftime('%d %b %H:%M:%S')
INTERVALO = {'rack': 2.0, 'ambiente': 5.0}     # s entre mensajes (contrato v1)

def contadores():
    try:
        with open(CTX, encoding='utf-8') as f:
            S = json.load(f).get('mvp47') or {}
        I = S.get('indices') or {}
        return {k: {c: v for c, v in I[k].items() if isinstance(v, (int, float))} for k in I}
    except Exception as e:
        return {'error': str(e)}

def sistema():
    return {'ram_mb': int(E['RAM']), 'cpu_c': int(E['TEMP']) / 1000, 'disco_pct': int(E['DISCO'] or 0),
            'arranque': int(E['ARRANQUE']), 'nodered_reinicios': int(E['NR'] or 0)}

def db():
    return sqlite3.connect('file:' + DB + '?mode=ro', uri=True)

ruta = lambda n: os.path.join(DIR, 'estabilidad-' + n + '.json')
def guardar(n, d):
    with open(ruta(n), 'w') as f: json.dump(d, f, indent=1)
def leer(n):
    try:
        with open(ruta(n)) as f: return json.load(f)
    except FileNotFoundError: return None

if modo == 'inicio':
    c = db()
    filas = c.execute('SELECT COUNT(*) FROM lecturas').fetchone()[0]
    d = {'t': ahora, 'sistema': sistema(), 'contadores': contadores(), 'filas': filas}
    guardar('inicio', d)
    if os.path.exists(ruta('corte')): os.remove(ruta('corte'))
    print('Inicio guardado:', hora(ahora))
    print('  RAM %d MB · CPU %.0f °C · microSD %d %% · %d lecturas en el histórico' %
          (d['sistema']['ram_mb'], d['sistema']['cpu_c'], d['sistema']['disco_pct'], filas))
    k = d['contadores']
    if 'error' in k: print('  AVISO: no pude leer los contadores de Node-RED:', k['error'])
    else: print('  Envejecimiento: %.1f h con datos' % k.get('envejecimiento', {}).get('horas', 0))
    print('Siguiente: dejar todo sin tocar. Antes del corte: sudo prueba-estabilidad.sh corte')
    sys.exit(0)

if modo == 'corte':
    if not leer('inicio'): print('Primero: sudo prueba-estabilidad.sh inicio'); sys.exit(1)
    guardar('corte', {'t': ahora, 'contadores': contadores()})
    print('Corte marcado:', hora(ahora))
    print('AHORA: desconecta la Orange Pi y los dos nodos al mismo tiempo (en menos de 30 s).')
    print('Espera 2 min, conecta todo de nuevo y anota la hora. No toques nada más.')
    sys.exit(0)

# ---------------- final ----------------
ini, cor = leer('inicio'), leer('corte')
if not ini: print('No hay inicio guardado: sudo prueba-estabilidad.sh inicio'); sys.exit(1)
t0, t1 = ini['t'], ahora
tc = cor['t'] if cor else None
S = sistema()
res = []
def crit(n, ok, texto): res.append((n, ok, texto))
dur = t1 - t0

c = db()
integridad = c.execute('PRAGMA integrity_check').fetchone()[0]
flujos = c.execute("SELECT DISTINCT node_id, pos FROM lecturas WHERE ts >= ? ORDER BY 1, 2", (t0 * 1000,)).fetchall()
tipos = {}
for nid, pos in flujos:
    tipos[(nid, pos)] = 'rack' if pos else 'ambiente'

# Hueco planeado: el que contiene el corte (desde la última lectura antes del corte hasta la primera después del arranque)
arranque = S['arranque']
huecos_no_plan, completitud, recup, promedios, ultimas = [], [], [], {}, []
for (nid, pos), tipo in tipos.items():
    ts = [r[0] / 1000 for r in c.execute('SELECT ts FROM lecturas WHERE node_id=? AND pos=? AND ts >= ? AND ts <= ? ORDER BY ts',
                                         (nid, pos, t0 * 1000, t1 * 1000))]
    nombre = (nid + ' ' + pos).strip()
    plan = 0.0
    for a, b in zip(ts, ts[1:]):
        if b - a <= 120: continue
        if tc and a <= tc + 60 and b >= arranque:        # el hueco del corte planeado
            plan += b - a
            ultimas.append((nombre, a, b))
        else:
            huecos_no_plan.append((nombre, a, b))
    activo = max(dur - plan, 1)
    esperadas = activo / INTERVALO[tipo]
    completitud.append((nombre, len(ts) / esperadas if esperadas else 0, len(ts), int(esperadas)))
    temps = c.execute('SELECT AVG(temp) FROM lecturas WHERE node_id=? AND pos=? AND ts >= ? AND temp IS NOT NULL',
                      (nid, pos, t0 * 1000)).fetchone()[0]
    if temps is not None: promedios[nombre] = temps

if not tipos:
    crit(1, False, 'No hay lecturas desde el inicio: ¿están conectados los nodos?')
else:
    peor = min(completitud, key=lambda x: x[1])
    crit(1, peor[1] >= 0.99, 'Datos por flujo (sin el corte): ' +
         ', '.join('%s %.1f %%' % (n, 100 * p) for n, p, _, _ in completitud) + ' (mínimo 99 %)')
crit(2, not huecos_no_plan, 'Huecos de más de 2 min fuera del corte: ' +
     ('ninguno' if not huecos_no_plan else '; '.join('%s %s → %s' % (n, hora(a)[7:], hora(b)[7:]) for n, a, b in huecos_no_plan[:5])))

if not tc:
    crit(3, False, 'No se marcó el corte (sudo prueba-estabilidad.sh corte)')
    crit(4, integridad == 'ok', 'Histórico: integrity_check = %s (sin corte marcado)' % integridad)
elif arranque < tc:
    crit(3, False, 'La Orange Pi no se reinició después del corte marcado (arranque %s)' % hora(arranque))
    crit(4, integridad == 'ok', 'Histórico: integrity_check = %s' % integridad)
else:
    rec = []
    for (nid, pos) in tipos:
        p = c.execute('SELECT MIN(ts) FROM lecturas WHERE node_id=? AND pos=? AND ts >= ?', (nid, pos, arranque * 1000)).fetchone()[0]
        rec.append(((nid + ' ' + pos).strip(), (p / 1000 - arranque) if p else None))
    peor = max((r for _, r in rec if r is not None), default=None)
    ok3 = peor is not None and all(r is not None for _, r in rec) and peor <= 300
    crit(3, ok3, 'Recuperación (desde que arrancó la Orange Pi, %s): ' % hora(arranque)[7:] +
         ', '.join('%s %s' % (n, ('%.0f s' % r) if r is not None else 'sin datos') for n, r in rec) + ' (máximo 5 min)')
    ult = c.execute('SELECT MAX(ts) FROM lecturas WHERE ts < ?', (arranque * 1000,)).fetchone()[0]
    perdida = (tc - ult / 1000) if ult else None
    ok4 = integridad == 'ok' and ult is not None and ult / 1000 >= tc - 30
    crit(4, ok4, 'Histórico: integrity_check = %s; última lectura antes del corte %s (corte marcado %s)' %
         (integridad, hora(ult / 1000)[7:] if ult else '—', hora(tc)[7:]))

k0, k1 = ini.get('contadores', {}), contadores()
if 'error' in k0 or 'error' in k1:
    crit(5, False, 'No pude leer los contadores de Node-RED: ' + str(k1.get('error') or k0.get('error')))
else:
    h0 = k0.get('envejecimiento', {}).get('horas', 0); h1 = k1.get('envejecimiento', {}).get('horas', 0)
    plan_h = (max((b - a for _, a, b in ultimas), default=0)) / 3600
    esperado = (dur / 3600) - plan_h
    bajaron = [i for i in k0 if i in k1 and k1[i].get('desde') == k0[i].get('desde') and
               any(k1[i].get(c, 0) < v - 1e-6 for c, v in k0[i].items() if c not in ('desde', 'ultima'))]
    ok5 = not bajaron and (h1 - h0) >= 0.9 * esperado
    crit(5, ok5, 'Contadores: envejecimiento %.1f h → %.1f h (+%.1f h; se esperaban ~%.1f h). %s' %
         (h0, h1, h1 - h0, esperado, 'Ninguno bajó' if not bajaron else 'BAJARON: ' + ', '.join(bajaron)))

wd = [int(x) for x in E['WD'].split()] if E['WD'].strip() else []
wd = [x for x in wd if x >= t0]
crit(6, not wd, 'Reinicios automáticos del hotspot durante la prueba: %d%s' %
     (len(wd), '' if not wd else ' (' + ', '.join(hora(x)[7:] for x in wd[:5]) + ')'))

s0 = ini['sistema']
ok7 = S['cpu_c'] < 70 and S['disco_pct'] < 80 and S['ram_mb'] - s0['ram_mb'] < 150
crit(7, ok7, 'Orange Pi: RAM %d → %d MB, CPU %.0f °C, microSD %d %%, reinicios de Node-RED desde el arranque: %d' %
     (s0['ram_mb'], S['ram_mb'], S['cpu_c'], S['disco_pct'], S['nodered_reinicios']))

if len(promedios) >= 2:
    dif = max(promedios.values()) - min(promedios.values())
    crit(8, dif <= 2, 'Temperatura promedio: ' + ', '.join('%s %.1f °C' % (n, v) for n, v in sorted(promedios.items())) +
         ' (diferencia %.1f °C, máximo 2)' % dif)
else:
    crit(8, False, 'Faltan lecturas de temperatura para comparar')

print('Prueba de estabilidad 7.6: %s → %s (%.1f h)' % (hora(t0), hora(t1), dur / 3600))
print('Corte marcado: %s · arranque de la Orange Pi: %s' % (hora(tc) if tc else '—', hora(arranque)))
print()
for n, ok, texto in res:
    print('  %-6s %d. %s' % ('OK' if ok else 'REVISA', n, texto))
print()
todo = all(ok for _, ok, _ in res)
print('PRUEBA APROBADA' if todo else 'HAY CRITERIOS QUE REVISAR')
guardar('final', {'t': t1, 'resultado': [(n, ok, t) for n, ok, t in res], 'aprobada': todo})
sys.exit(0 if todo else 1)
PY
