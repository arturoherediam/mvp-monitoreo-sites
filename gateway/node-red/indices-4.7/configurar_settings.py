#!/usr/bin/env python3
"""Prepara settings.js de Node-RED para la tarea 4.7 (laptop ahora, Orange Pi después).

Hace dos cambios y nada más:
  1. Activa el contexto en disco (localfilesystem): los índices sobreviven a un reinicio.
  2. Antes de module.exports, carga ~/.node-red/environment (TELEGRAM_TOKEN, TELEGRAM_CHAT)
     para que funcione igual si Node-RED corre como servicio o desde la terminal.

Guarda una copia en settings.js.antes-4.7 y revisa la sintaxis con node --check;
si algo falla, deja el archivo como estaba.
Uso: python3 configurar_settings.py [ruta a settings.js]   (por defecto ~/.node-red/settings.js)
"""
import os, shutil, subprocess, sys

ruta = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser('~/.node-red/settings.js')
MARCA = '[mvp 4.7]'
VIEJO = '''    //contextStorage: {
    //    default: {
    //        module:"localfilesystem"
    //    },
    //},'''
NUEVO = '''    // [mvp 4.7] contexto en disco: los índices de mantenimiento sobreviven a reinicios
    contextStorage: {
        default: {
            module:"localfilesystem"
        },
    },'''
CARGADOR = r'''// [mvp 4.7] Variables de entorno desde ~/.node-red/environment (TELEGRAM_TOKEN, TELEGRAM_CHAT).
// Ese archivo NO va al repositorio. Funciona con Node-RED como servicio o desde la terminal.
try {
    require('fs').readFileSync(require('path').join(__dirname, 'environment'), 'utf8').split('\n').forEach(function (l) {
        var m = l.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*['"]?(.*?)['"]?\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
    });
} catch (e) { /* sin archivo environment: Telegram queda sin configurar */ }

'''

s = open(ruta, encoding='utf-8').read()
if MARCA in s:
    print('settings.js ya tenía los cambios de la 4.7: no se tocó.')
    sys.exit(0)
if s.count(VIEJO) != 1 or s.count('module.exports = {') != 1:
    print('No encontré el bloque contextStorage comentado o module.exports tal como se esperaba.')
    print('No se cambió nada. Haz el cambio a mano (ver README de indices-4.7).')
    sys.exit(1)

copia = ruta + '.antes-4.7'
shutil.copy2(ruta, copia)
nuevo = s.replace(VIEJO, NUEVO).replace('module.exports = {', CARGADOR + 'module.exports = {', 1)
open(ruta, 'w', encoding='utf-8').write(nuevo)
r = subprocess.run(['node', '--check', ruta], capture_output=True, text=True)
if r.returncode != 0:
    shutil.copy2(copia, ruta)
    print('La revisión de sintaxis falló; se restauró el archivo original.\n' + r.stderr)
    sys.exit(1)
print('Listo. Copia del original: ' + copia)
print('Reinicia Node-RED para aplicar los cambios.')
