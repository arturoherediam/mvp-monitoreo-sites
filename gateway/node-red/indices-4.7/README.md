# Índices de mantenimiento (tarea 4.7)

Código fuente del flujo `../flujo-mvp-4.7.json`. Qué calcula y por qué: [docs/acuerdos/indices-mantenimiento.md](../../../docs/acuerdos/indices-mantenimiento.md).

| Archivo | Nodo del flujo |
| --- | --- |
| `sitio.js` | Configuración del sitio (Mérida por defecto; Progreso como alternativa) |
| `consulta.js` | Consultar viento (Open-Meteo, cada hora) |
| `leer-viento.js` | Leer viento (viento actual y riesgo de sal en 24 h) |
| `indices.js` | Calcular índices |
| `evaluar.js` | Evaluar umbrales (semáforos, eventos y avisos; umbrales reales y de demostración) |
| `simulador.js` | Simulador (botón "Iniciar simulación" de la página) |
| `pagina.vue` | Plantilla de la página de mantenimiento |
| `telegram.js` | Preparar Telegram |
| `gen47.py` | Genera `../flujo-mvp-4.7.json` con el código de arriba (opción `--base` para el id del dashboard) |
| `configurar_settings.py` | Prepara `settings.js` de Node-RED (contexto en disco y variables de Telegram) |
| `*.test.js` | Pruebas: no requieren Node-RED ni internet |

Si cambias un `.js`, regenera el flujo y corre las pruebas desde la raíz del repo:

```bash
python3 gateway/node-red/indices-4.7/gen47.py
for t in gateway/node-red/indices-4.7/*.test.js; do node "$t" || echo "FALLÓ $t"; done
```

## 1. Bot de Telegram (una sola vez)

1. En Telegram abre **@BotFather**, envía `/newbot`, ponle nombre y un usuario que termine en `bot`. Copia el **token**.
2. Crea un grupo (por ejemplo "MVP alertas"), agrega al equipo y al bot. En el grupo envía `/start@<usuario_del_bot>`.
3. Abre en el navegador `https://api.telegram.org/bot<TOKEN>/getUpdates` y busca `"chat":{"id":-100…`. Ese número negativo es el **chat**. Si sale vacío, envía otro mensaje al grupo y recarga.
4. Guarda el token en 1Password. No lo pegues en el chat, en el flujo ni en el repo.
5. Crea el archivo de variables (fuera del repo, solo lo lee tu usuario):

```bash
read -s -p "Token del bot: " T; echo; read -p "Chat id: " C
printf "TELEGRAM_TOKEN='%s'\nTELEGRAM_CHAT='%s'\n" "$T" "$C" > ~/.node-red/environment
chmod 600 ~/.node-red/environment; unset T C
```

## 2. settings.js (una sola vez)

```bash
python3 gateway/node-red/indices-4.7/configurar_settings.py
```

Funciona con el `settings.js` de Node-RED 4 y 5 (tolera espacios, tabs y fin de línea distintos). Hace solo dos cambios y guarda una copia en `settings.js.antes-4.7`:

- Activa el **contexto en disco**: los índices y los avisos ya enviados sobreviven a un reinicio (Node-RED guarda cada 30 s).
- Carga `~/.node-red/environment` al arrancar, así funciona igual como servicio o desde la terminal.

Después **reinicia Node-RED**: `sudo systemctl restart nodered` si es servicio, o Ctrl+C y `node-red` si lo corres en una terminal.

Para deshacer: `cp ~/.node-red/settings.js.antes-4.7 ~/.node-red/settings.js` y reinicia.

## 3. Importar y revisar

1. Deben estar importados los flujos 4.1 (broker `mvp_broker`) y 4.3 (dashboard).
2. Importa `flujo-mvp-4.7.json` como flujo nuevo y despliega. Si al desplegar Node-RED dice que la página "Mantenimiento" no está bien configurada, tu dashboard tiene otro id (Dashboard 2.0 solo admite una base). Búscalo con `grep -B1 -A3 '"type": "ui-base"' ~/.node-red/flows.json` y genera el flujo con ese id: `python3 gateway/node-red/indices-4.7/gen47.py --base <id> --salida ~/flujo-4.7-local.json`. No subas ese archivo al repo.
3. Revisa los estados debajo de los nodos: "Configuración del sitio" dice **Mérida, Yucatán**; "Leer viento" muestra la dirección y velocidad del viento (si dice error, revisa internet).
4. Presiona el botón del nodo **Probar Telegram**: debe llegar el mensaje al grupo y "Resultado Telegram" decir **entregado**.
5. Abre `<ruta del dashboard>/mantenimiento` (por ejemplo http://localhost:1880/dashboard/mantenimiento) y presiona **Iniciar simulación**, o corre el simulador de nodos: `python3 tools/simulador/simulador.py --escenario demo --velocidad 4`.

## 4. Simulación y modo demo

**Simulación (recomendada para presentar):** botón **Iniciar simulación** en la página. Nueve fases de 20 s (3 min por ciclo): normal, noche sin aire, condensación, subida rápida en todo el rack, subida rápida local (solo la posición A), flama, nodo desconectado, polvo y falla del sensor. En el primer ciclo prueba las 6 tarjetas, el bloque "Atender ahora" y todos los avisos; usa contadores aparte, así que no ensucia los datos reales. Los avisos llegan a Telegram con "[SIMULACIÓN]".

**Modo demo con datos reales:** en el nodo **Calcular índices** cambia `ACELERACION: 1` por `ACELERACION: 60` y despliega: un minuto real cuenta como una hora en los acumulados. La página muestra "MODO DEMO" y se declara al jurado. Las subidas rápidas y el PM fijo siguen usando tiempo real.

Al terminar, regresa a `ACELERACION: 1` y presiona **Mantenimiento hecho** en cada tarjeta para borrar lo acumulado en la demo.

## Cambiar de sitio o umbrales

- Sitio (coordenadas, dirección del mar, viento mínimo): nodo **Configuración del sitio**.
- Umbrales de los índices acumulados (valores de demo): al inicio de **Evaluar umbrales**.
- Límites ASHRAE, humedad y modelo de Peck: al inicio de **Calcular índices**.

Si los cambias en el editor, copia el cambio al `.js` de esta carpeta y regenera el flujo para que el repo quede igual.
