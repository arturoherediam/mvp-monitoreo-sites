#!/usr/bin/env python3
"""Crea en GitHub un issue por tarea del WBS a partir de issues_wbs.csv.

Requisitos: gh instalado y autenticado (gh auth login).
Uso (desde la raíz del repo):
    python3 tools/crear_issues.py --dry-run     # solo muestra lo que haría
    python3 tools/crear_issues.py               # crea etiquetas, hitos e issues
Es idempotente en etiquetas e hitos; los issues se crean solo si no existe
uno con el mismo título.
"""
import csv, json, subprocess, sys, pathlib

CSV = pathlib.Path(__file__).with_name("issues_wbs.csv")
DRY = "--dry-run" in sys.argv

def gh(*args, check=True):
    if DRY:
        print("gh", *args[:6], "..." if len(args) > 6 else "")
        return ""
    r = subprocess.run(["gh", *args], capture_output=True, text=True)
    if check and r.returncode:
        sys.exit(f"gh {' '.join(args[:3])} falló: {r.stderr.strip()}")
    return r.stdout

rows = list(csv.DictReader(open(CSV, encoding="utf-8")))

existing = set()
if not DRY:
    out = gh("issue", "list", "--state", "all", "--limit", "500", "--json", "title")
    existing = {i["title"] for i in json.loads(out or "[]")}

for lab in sorted({r["labels"] for r in rows}):
    gh("label", "create", lab, "--force")
for ms in sorted({r["milestone"] for r in rows}):
    gh("api", "repos/{owner}/{repo}/milestones", "-f", f"title={ms}", check=False)

for r in rows:
    if r["title"] in existing:
        print("ya existe:", r["title"]); continue
    gh("issue", "create", "--title", r["title"], "--body", r["body"],
       "--label", r["labels"], "--milestone", r["milestone"])
    print("creado:", r["title"])
