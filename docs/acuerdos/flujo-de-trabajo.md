# Flujo de trabajo

- **Rama `main` protegida:** solo entra código por pull request con 1 aprobación. Nadie hace push directo.
- **Ramas:** `feat/<área>-<tema>`, por ejemplo `feat/rack-flama`. Una rama por tarea y de vida corta.
- **Commits en español** con prefijo: `feat:`, `fix:`, `docs:`, `hw:` (PCB y carcasas), `chore:`.
- **Issues:** título `[ID] tarea` (por ejemplo `[4.8] Histórico en SQLite`), con responsable, fechas y predecesoras del WBS. El pull request lo cierra con `Closes #n`.
- **Revisión cruzada:** Luis Mario y Priscila se revisan el firmware entre ellos. Sebastián y Diego se revisan las PCB. Arturo revisa lo que toca al gateway y al contrato JSON.
- **Carpetas con dueño:** el archivo `.github/CODEOWNERS` asigna cada carpeta a su responsable para que el pull request le pida revisión.
- **Cambios al contrato JSON:** solo por pull request a `docs/acuerdos/contrato-json.md`, aprobado por Arturo, Luis Mario y Priscila.
- **Congelamiento v1.0 el 16 de noviembre de 2026:** después de esa fecha solo entran correcciones de errores con 2 aprobaciones. El tag `v1.0` se pone ese día.
- **Compras y cambios de hardware:** se anotan en `hardware/bom.md` (qué, quién, cuánto, fecha).
- **Si te atrasas:** avisa en el issue el mismo día, con cuántos días y por qué. Las tareas de la ruta crítica se avisan además al equipo.
