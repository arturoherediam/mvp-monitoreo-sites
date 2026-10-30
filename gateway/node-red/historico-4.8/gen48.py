"""Genera flujo-mvp-4.8.json (histórico en SQLite). Uso: python3 gen48.py [--base id] [--db ruta] [--salida archivo]"""
import argparse, json, os, re
D = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(description='Genera flujo-mvp-4.8.json')
ap.add_argument('--base', default='d43_ui_base', help='id del ui-base del dashboard (flujo 4.3)')
ap.add_argument('--db', default='/home/arturo/.node-red/historico.db', help='ruta del archivo SQLite')
ap.add_argument('--salida', default=os.path.join(D, '..', 'flujo-mvp-4.8.json'))
A = ap.parse_args()
code = lambda n: open(os.path.join(D, n), encoding='utf-8').read()
esquema = re.sub(r'--[^\n]*', '', open(os.path.join(D, '..', '..', 'db', 'esquema.sql'), encoding='utf-8').read())
esquema = ' '.join(esquema.split())

TAB, BROKER, THEME = 'd48_tab', 'mvp_broker', 'd43_ui_theme'
N = []
def add(d): N.append(d); return d
def fn(i, name, src, outputs, x, y, wires):
    add({"id": i, "type": "function", "z": TAB, "name": name, "func": src, "outputs": outputs, "timeout": 0, "noerr": 0,
         "initialize": "", "finalize": "", "libs": [], "x": x, "y": y, "wires": wires})
def inject(i, name, repeat, delay, x, y, wires):
    add({"id": i, "type": "inject", "z": TAB, "name": name, "props": [{"p": "payload"}], "repeat": repeat, "crontab": "",
         "once": True, "onceDelay": delay, "topic": "", "payload": "", "payloadType": "date", "x": x, "y": y, "wires": wires})
def sqlite(i, name, modo, x, y, wires):
    add({"id": i, "type": "sqlite", "z": TAB, "mydb": "d48_db", "sqlquery": modo, "sql": "", "name": name, "x": x, "y": y, "wires": wires})
def group(i, name, order, show=True):
    add({"id": i, "type": "ui-group", "name": name, "page": "d48_ui_page", "width": "12", "height": "1", "order": order,
         "showTitle": show, "className": "", "visible": True, "disabled": False, "groupType": "default"})
def chart(i, g, name, ymin, y):
    add({"id": i, "type": "ui-chart", "z": TAB, "group": g, "name": name, "label": "", "order": 1, "chartType": "line",
         "category": "topic", "categoryType": "msg", "xAxisLabel": "", "xAxisProperty": "x", "xAxisPropertyType": "property",
         "xmin": "", "xmax": "", "bins": 10, "xAxisType": "time", "xAxisFormat": "", "xAxisFormatType": "auto",
         "yAxisLabel": "", "yAxisProperty": "y", "yAxisPropertyType": "property", "ymin": ymin, "ymax": "", "action": "append",
         "stackSeries": False, "pointShape": "false", "pointRadius": 4, "showLegend": True, "removeOlder": 8,
         "removeOlderUnit": "86400", "removeOlderPoints": "", "colors": ["#1f77b4", "#d62728", "#2ca02c", "#ff7f0e", "#9467bd", "#8c564b"],
         "textColor": ["#666666"], "textColorDefault": True, "gridColor": ["#e5e5e5"], "gridColorDefault": True,
         "width": 12, "height": 6, "className": "", "interpolation": "linear", "x": 1180, "y": y, "wires": []})

add({"id": TAB, "type": "tab", "label": "MVP histórico 4.8", "disabled": False,
     "info": "Histórico en SQLite (" + A.db + "): escribe site/datos en lotes de 30 s (WAL, synchronous=NORMAL), "
             "resume por hora, borra lecturas de más de 30 días y muestra la página Histórico (24 h y 7 días). "
             "Requiere node-red-node-sqlite y los flujos 4.1 (broker mvp_broker) y 4.3 (dashboard). Esquema: gateway/db/esquema.sql"})
add({"id": "d48_db", "type": "sqlitedb", "db": A.db, "mode": "RWC"})
add({"id": "d48_ui_page", "type": "ui-page", "name": "Histórico", "ui": A.base, "path": "/historico", "icon": "chart-line",
     "layout": "grid", "theme": THEME, "breakpoints": [{"name": "Default", "px": "0", "cols": "3"}, {"name": "Tablet", "px": "576", "cols": "6"},
     {"name": "Small Desktop", "px": "768", "cols": "9"}, {"name": "Desktop", "px": "1024", "cols": "12"}],
     "order": 3, "className": "", "visible": "true", "disabled": "false"})
group("d48_g_r", "Rango", 1, False)
group("d48_g_t", "Temperatura (°C)", 2)
group("d48_g_h", "Humedad relativa (%)", 3)
group("d48_g_p", "Partículas PM2.5 y PM10 (µg/m³)", 4)

# Escritura
add({"id": "d48_mqtt", "type": "mqtt in", "z": TAB, "name": "site/datos", "topic": "site/datos", "qos": "0", "datatype": "json",
     "broker": BROKER, "nl": False, "rap": True, "rh": 0, "inputs": 0, "x": 110, "y": 60, "wires": [["d48_filas"]]})
fn("d48_filas", "A filas", code('filas.js'), 1, 290, 60, [["d48_join"]])
add({"id": "d48_join", "type": "join", "z": TAB, "name": "Lote de 30 s", "mode": "custom", "build": "array", "property": "payload",
     "propertyType": "msg", "key": "topic", "joiner": "\\n", "joinerType": "str", "useparts": False, "accumulate": False,
     "timeout": "30", "count": "", "reduceRight": False, "reduceExp": "", "reduceInit": "", "reduceInitType": "", "reduceFixup": "",
     "x": 470, "y": 60, "wires": [["d48_lote"]]})
fn("d48_lote", "SQL del lote", code('lote.js'), 1, 650, 60, [["d48_w"]])
inject("d48_i_esq", "Al arrancar", "", "2", 120, 120, [["d48_esq"]])
fn("d48_esq", "Crear esquema", "msg.topic = " + json.dumps(esquema, ensure_ascii=False) + ";\nreturn msg;", 1, 300, 120, [["d48_w"]])
inject("d48_i_res", "Cada hora", "3600", "90", 120, 180, [["d48_res"]])
fn("d48_res", "Resumen por hora y limpieza", code('resumen.js'), 1, 330, 180, [["d48_w"]])
sqlite("d48_w", "Escribir (lote)", "batch", 860, 120, [[]])

# Lectura y página
inject("d48_i_ref", "Refrescar cada minuto", "60", "20", 140, 300, [["d48_q"]])
fn("d48_q", "Consulta", code('consulta.js'), 1, 520, 320, [["d48_r"]])
sqlite("d48_r", "Leer", "msg.topic", 690, 320, [["d48_ser"]])
fn("d48_ser", "Series", code('series.js'), 4, 860, 320, [["d48_ch_t"], ["d48_ch_h"], ["d48_ch_p"], ["d48_ui"]])
chart("d48_ch_t", "d48_g_t", "Temperatura", "", 260)
chart("d48_ch_h", "d48_g_h", "Humedad", "0", 320)
chart("d48_ch_p", "d48_g_p", "Partículas", "0", 380)
add({"id": "d48_ui", "type": "ui-template", "z": TAB, "group": "d48_g_r", "page": "", "ui": "", "name": "Rango del histórico",
     "order": 1, "width": 12, "height": 0, "head": "", "format": code('rango.vue'), "storeOutMessages": True, "passthru": False,
     "resendOnRefresh": True, "templateScope": "local", "className": "", "x": 1180, "y": 440, "wires": [["d48_q"]]})

# Errores de SQLite a la barra de depuración
add({"id": "d48_catch", "type": "catch", "z": TAB, "name": "Errores SQLite", "scope": ["d48_w", "d48_r"], "uncaught": False,
     "x": 120, "y": 500, "wires": [["d48_dbg"]]})
add({"id": "d48_dbg", "type": "debug", "z": TAB, "name": "Error histórico", "active": True, "tosidebar": True, "console": True,
     "tostatus": True, "complete": "error", "targetType": "msg", "statusVal": "error.message", "statusType": "msg", "x": 330, "y": 500, "wires": []})

json.dump(N, open(A.salida, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('Escrito', os.path.relpath(A.salida), '·', len(N), 'nodos')
