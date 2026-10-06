#!/usr/bin/env bash
# Primer push del repositorio, seguridad y protección de main. Lo corre Arturo una sola vez,
# desde la raíz del repo, con gh autenticado.
#
# Uso: tools/configurar_repo.sh <nombre-del-repo> [usuario-github ...]
#      Los usuarios se invitan como colaboradores con permiso de escritura.
set -euo pipefail

REPO="${1:?Uso: tools/configurar_repo.sh <nombre-del-repo> [usuario-github ...]}"
shift || true

command -v gh >/dev/null       || { echo "Falta gh (https://cli.github.com)."; exit 1; }
command -v gitleaks >/dev/null || { echo "Falta gitleaks: instálalo y vuelve a correr este script."; exit 1; }
gh auth status >/dev/null      || { echo "Corre 'gh auth login' primero."; exit 1; }

echo "==> 1/6 Buscando secretos con gitleaks"
gitleaks dir . --redact 2>/dev/null || gitleaks detect --no-git --source . --redact

echo "==> 2/6 Preparando git"
[ -d .git ] || git init -b main
git add .
if git ls-files | grep -Eq '(^|/)secrets\.h$'; then
  echo "ERROR: secrets.h está en el stage. Revisa .gitignore."; exit 1
fi
git status --short
read -r -p "¿Se ve bien lo que se va a subir? [s/N] " ok
[ "$ok" = "s" ] || { echo "Cancelado."; exit 1; }
git commit -m "chore: estructura base del repositorio, acuerdos y ejemplos JSON"

echo "==> 3/6 Creando el repositorio público y subiendo"
gh repo create "$REPO" --public --source=. --remote=origin --push

echo "==> 4/6 Activando secret scanning y push protection"
gh api -X PATCH "repos/{owner}/{repo}" --input - <<'JSON'
{"security_and_analysis":{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}}
JSON

echo "==> 5/6 Protegiendo main (pull request con 1 aprobación)"
# enforce_admins=false deja a Arturo poder saltarse la regla en una emergencia.
# Cuando todo esté estable, ponlo en true.
gh api -X PUT "repos/{owner}/{repo}/branches/main/protection" --input - <<'JSON'
{"required_status_checks":null,"enforce_admins":false,
 "required_pull_request_reviews":{"required_approving_review_count":1,"dismiss_stale_reviews":true},
 "restrictions":null}
JSON

echo "==> 6/6 Invitando colaboradores"
for u in "$@"; do
  gh api -X PUT "repos/{owner}/{repo}/collaborators/$u" -f permission=push >/dev/null && echo "  invitado: $u"
done

echo
echo "Listo. Siguientes pasos:"
echo "  1. Cada persona acepta la invitación por correo o en https://github.com/notifications."
echo "  2. python3 tools/crear_issues.py --dry-run   y luego sin --dry-run para crear los issues."
