# Simulador de nodos

Tarea 4.2. Publica mensajes del contrato JSON v1 como lo harán los nodos reales, para desarrollar el dashboard y las alertas sin hardware. No necesita instalar nada: solo Python 3.

Simula dos nodos, cada uno con su propia conexión, su usuario MQTT, su estado retenido y su testamento (LWT):

| Nodo | `node_id` | Usuario | Periodo |
| --- | --- | --- | --- |
| Rack | `rack-01` (posiciones A y B, flama en A) | `nodo_rack` | 2 s (1 s con flama) |
| Ambiente | `amb-01` | `nodo_ambiente` | 5 s |

## Uso

```
python3 tools/simulador/simulador.py --escenario demo
```

Las contraseñas se piden por teclado sin mostrarse, o se leen de `SIM_RACK_PASS` y `SIM_AMB_PASS`. **Nunca van en el código ni en el repositorio.** Se detiene con Ctrl+C, que publica el estado `offline` de forma ordenada.

| Opción | Qué hace |
| --- | --- |
| `--escenario` | `normal`, `calor`, `flama`, `falla`, `caido` o `demo` |
| `--velocidad N` | Tiempo simulado N veces más rápido (con 4, un minuto pasa en 15 s) |
| `--solo rack` o `--solo ambiente` | Simula un solo nodo |
| `--host`, `--puerto` | Broker (por defecto `localhost:1883`) |
| `--verboso` | Imprime cada mensaje publicado |
| `--semilla N` | Ruido repetible |

## Escenarios

| Escenario | Qué ocurre | Qué permite probar |
| --- | --- | --- |
| `normal` | Valores estables con ruido | Dashboard en reposo |
| `calor` | Temperatura sube hasta unos 2 °C/min en el rack A y 1 °C/min en el ambiente, y luego baja | Alerta por velocidad de cambio, índice de dosis |
| `flama` | `flame: true` en la posición A durante 15 s, repetido cada segundo | Alerta de incendio (estado de flama, no eventos sueltos) |
| `falla` | Rack B con `null` y `sht41_B_timeout`; ambiente con `pms_sin_trama` | Mensajes con `err` y valores nulos |
| `caido` | Cierra la conexión sin avisar: el broker publica el LWT `offline`; luego reconecta con `seq` reiniciado | Estado del nodo y reinicios |
| `demo` | Recorre todos en un ciclo de unos 4.5 minutos | Presentación al jurado |

Cada fase se repite en ciclo. Los efectos empiezan unos segundos después de arrancar.

## Qué se comprobó

Contra un broker de prueba que aplica la misma ACL y valida cada mensaje con los esquemas de `docs/acuerdos/schemas/`: todos los mensajes del simulador cumplen el esquema, el punto de rocío es coherente con Magnus, y los LWT y estados retenidos salen como indica el contrato. Con Mosquitto real se comprueba en la prueba de la tarea 4.2 (ver issue).
