#!/usr/bin/env python3
"""Valida los ejemplos JSON contra los esquemas del contrato y revisa el punto de rocío.

Uso:  python3 tools/validar_ejemplos.py
Requiere: pip install jsonschema
"""
import json, math, pathlib, sys
from jsonschema import Draft202012Validator

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ACUERDOS = RAIZ / "docs" / "acuerdos"
A, B = 17.62, 243.12
TOLERANCIA = 0.15  # °C

def punto_de_rocio(t, h):
    g = math.log(h / 100.0) + A * t / (B + t)
    return B * g / (A - g)

def esquema_para(nombre):
    if nombre.startswith("rack"): return "rack.schema.json"
    if nombre.startswith("ambiente"): return "ambiente.schema.json"
    return "estado.schema.json"

def lecturas(dato):
    """Devuelve (temp, hum, dew_point) de cada posición o del nodo."""
    if "positions" in dato:
        for p in dato["positions"]:
            yield p["temp"], p["hum"], p["dew_point"], p["id"]
    elif "temp" in dato:
        yield dato["temp"], dato["hum"], dato["dew_point"], "-"

errores = 0

# 1) Vectores de prueba de Magnus
for t, h, esperado in [(25, 60, 16.7), (30, 70, 23.9)]:
    calc = round(punto_de_rocio(t, h), 1)
    ok = calc == esperado
    print(("OK   " if ok else "FALLA"), f"Magnus {t} °C / {h} % = {calc} (esperado {esperado})")
    errores += (not ok)

# 2) Ejemplos contra esquema + coherencia del punto de rocío
for ruta in sorted((ACUERDOS / "ejemplos").glob("*.json")):
    dato = json.loads(ruta.read_text(encoding="utf-8"))
    esquema = json.loads((ACUERDOS / "schemas" / esquema_para(ruta.name)).read_text(encoding="utf-8"))
    fallos = [e.message for e in Draft202012Validator(esquema).iter_errors(dato)]
    for t, h, dp, pos in lecturas(dato):
        if None in (t, h, dp):
            continue
        esperado = punto_de_rocio(t, h)
        if abs(esperado - dp) > TOLERANCIA:
            fallos.append(f"punto de rocío de la posición {pos}: {dp} pero Magnus da {esperado:.1f}")
    print(("OK   " if not fallos else "FALLA"), ruta.name)
    for f in fallos: print("      -", f)
    errores += bool(fallos)

sys.exit(1 if errores else 0)
