import argparse, json, os
D = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser(description='Genera flujo-mvp-4.7.json')
ap.add_argument('--base', default='d43_ui_base', help='id del ui-base del dashboard (en una instalación nueva: d43_ui_base del flujo 4.3)')
ap.add_argument('--salida', default=os.path.join(D, '..', 'flujo-mvp-4.7.json'))
ARGS = ap.parse_args()
code = lambda n: open(os.path.join(D, n), encoding='utf-8').read()

TAB = 'd47_tab'
BASE, THEME = ARGS.base, 'd43_ui_theme'          # base del dashboard y tema del flujo 4.3 (debe estar importado)
BROKER = 'mvp_broker'                             # definido en el flujo 4.1
PAGE, GROUP = 'd47_ui_page', 'd47_g_main'
N = []
def add(d): N.append(d); return d

add({"id": TAB, "type": "tab", "label": "MVP mantenimiento 4.7", "disabled": False,
     "info": "Índices de mantenimiento, viento (Open-Meteo) y alertas por Telegram. Requiere los flujos 4.1 (broker mvp_broker) "
             "y 4.3 (dashboard). Página: <ruta del dashboard>/mantenimiento, por ejemplo http://localhost:1880/dashboard/mantenimiento. "
             "Telegram: variables de entorno TELEGRAM_TOKEN y TELEGRAM_CHAT. Ver docs/acuerdos/indices-mantenimiento.md"})

add({"id": PAGE, "type": "ui-page", "name": "Mantenimiento", "ui": BASE, "path": "/mantenimiento", "icon": "wrench", "layout": "grid",
     "theme": THEME, "breakpoints": [{"name": "Default", "px": "0", "cols": "3"}, {"name": "Tablet", "px": "576", "cols": "6"},
     {"name": "Small Desktop", "px": "768", "cols": "9"}, {"name": "Desktop", "px": "1024", "cols": "12"}],
     "order": 2, "className": "", "visible": "true", "disabled": "false"})
add({"id": GROUP, "type": "ui-group", "name": "Mantenimiento preventivo", "page": PAGE, "width": "12", "height": "1", "order": 1,
     "showTitle": False, "className": "", "visible": True, "disabled": False, "groupType": "default"})

def fn(i, name, src, outputs, x, y, wires):
    add({"id": i, "type": "function", "z": TAB, "name": name, "func": src, "outputs": outputs, "timeout": 0, "noerr": 0,
         "initialize": "", "finalize": "", "libs": [], "x": x, "y": y, "wires": wires})
def inject(i, name, topic, repeat, x, y, wires, delay="0.5"):
    add({"id": i, "type": "inject", "z": TAB, "name": name, "props": [{"p": "payload"}, {"p": "topic", "vt": "str"}],
         "repeat": repeat, "crontab": "", "once": True, "onceDelay": delay, "topic": topic, "payload": "", "payloadType": "date",
         "x": x, "y": y, "wires": wires})
def http(i, name, x, y, wires):
    add({"id": i, "type": "http request", "z": TAB, "name": name, "method": "use", "ret": "obj", "paytoqs": "ignore", "url": "",
         "tls": "", "persist": False, "proxy": "", "insecureHTTPParser": False, "authType": "", "senderr": False, "headers": [],
         "x": x, "y": y, "wires": wires})
def mqtt(i, topic, x, y, wires):
    add({"id": i, "type": "mqtt in", "z": TAB, "name": topic, "topic": topic, "qos": "0", "datatype": "auto-detect", "broker": BROKER,
         "nl": False, "rap": True, "rh": 0, "inputs": 0, "x": x, "y": y, "wires": wires})

# Configuración del sitio (al desplegar)
inject("d47_ini", "Al desplegar", "inicio", "", 140, 40, [["d47_sitio"]], delay="0.1")
fn("d47_sitio", "Configuración del sitio", code('sitio.js'), 1, 380, 40, [[]])

# Datos de los nodos
mqtt("d47_in_datos", "site/datos", 140, 120, [["d47_ind"]])
mqtt("d47_in_estado", "site/estado/+", 150, 300, [["d47_eval"]])

# Viento cada hora
inject("d47_hora", "Cada hora", "viento", "3600", 130, 200, [["d47_consulta"]], delay="5")
fn("d47_consulta", "Consultar viento", code('consulta.js'), 1, 320, 200, [["d47_http_viento"]])
http("d47_http_viento", "Open-Meteo", 500, 200, [["d47_leer"]])
fn("d47_leer", "Leer viento", code('leer-viento.js'), 2, 680, 200, [["d47_ind"], ["d47_eval"]])

# Modo simulación (botón de la página)
inject("d47_tick", "Tick simulación (1 s)", "tick", "1", 1110, 40, [["d47_sim"]], delay="2")
fn("d47_sim", "Simulador", code('simulador.js'), 2, 1300, 40, [["d47_ind"], ["d47_eval"]])

# Índices y umbrales
fn("d47_ind", "Calcular índices", code('indices.js'), 1, 880, 120, [["d47_eval"]])
fn("d47_eval", "Evaluar umbrales", code('evaluar.js'), 2, 1080, 200, [["d47_ui"], ["d47_tg"]])

# Telegram
add({"id": "d47_tg_prueba", "type": "inject", "z": TAB, "name": "Probar Telegram", "props": [{"p": "payload"}],
     "repeat": "", "crontab": "", "once": False, "onceDelay": 0.1, "topic": "", "payload": "{\"text\":\"✅ Prueba de alertas del MVP: Telegram funciona.\"}",
     "payloadType": "json", "x": 1110, "y": 320, "wires": [["d47_tg"]]})
fn("d47_tg", "Telegram: cola y reintentos", code('telegram.js'), 1, 1300, 260, [["d47_http_tg"]])
http("d47_http_tg", "API de Telegram", 1500, 260, [["d47_tg_res"]])
fn("d47_tg_res", "Resultado Telegram", code('resultado-telegram.js'), 1, 1690, 260, [["d47_tg"]])
inject("d47_tg_pulso", "Reintentos cada 15 s", "tg-pulso", "15", 1110, 380, [["d47_tg"]], delay="5")

TPL = code('pagina.vue')
add({"id": "d47_ui", "type": "ui-template", "z": TAB, "group": GROUP, "page": "", "ui": "", "name": "Página de mantenimiento", "order": 1,
     "width": 12, "height": 0, "head": "", "format": TPL, "storeOutMessages": True, "passthru": False, "resendOnRefresh": True,
     "templateScope": "local", "className": "", "x": 1290, "y": 160, "wires": [["d47_ind", "d47_sim"]]})

# ---- comprobaciones de estructura
ids = {n['id'] for n in N}
assert len(ids) == len(N), 'ids duplicados'
externos = {BASE, THEME, BROKER}
for n in N:
    for port in n.get('wires', []):
        for w in port:
            assert w in ids, (n['id'], w)
    if n.get('type') == 'function':
        assert len(n['wires']) == n['outputs'], n['id']
    for k in ('group', 'page', 'ui', 'theme', 'broker'):
        v = n.get(k)
        if v and n['type'] != 'ui-template' or (k == 'group' and v):
            assert v in ids or v in externos, (n['id'], k, v)
json.dump(N, open(ARGS.salida, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print(len(N), 'nodos OK')
