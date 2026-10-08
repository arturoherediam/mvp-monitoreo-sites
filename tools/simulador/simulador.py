#!/usr/bin/env python3
"""Simulador de nodos (tarea 4.2): publica JSON del contrato v1 sin necesitar hardware.

Simula el nodo rack (rack-01, cada 2 s) y el nodo ambiente (amb-01, cada 5 s), cada uno
con su propio usuario MQTT, su estado retenido y su testamento (LWT), igual que harán los
firmwares reales. No requiere instalar nada: solo Python 3 (cliente MQTT 3.1.1 incluido).

Uso:
    python3 tools/simulador/simulador.py                      # escenario normal
    python3 tools/simulador/simulador.py --escenario demo     # recorre todos los escenarios
    python3 tools/simulador/simulador.py --escenario flama --velocidad 4

Contraseñas (nunca en el código ni en el repo): se leen de las variables de entorno
SIM_RACK_PASS y SIM_AMB_PASS, o se piden por teclado sin mostrarlas.

Escenarios: normal, calor, flama, falla, caido, demo.   Detener con Ctrl+C.
"""
import argparse
import getpass
import json
import math
import os
import random
import socket
import sys
import threading
import time
from collections import deque

A, B = 17.62, 243.12  # Magnus (acuerdo del contrato JSON)

# ---------------------------------------------------------------- escenarios
# Cada escenario es un ciclo de (efecto, segundos). El tiempo es el simulado
# (con --velocidad 2, 10 s simulados pasan en 5 s reales).
ESCENARIOS = {
    "normal": [(None, 3600)],
    "calor": [(None, 10), ("calor", 90), (None, 40)],
    "flama": [(None, 10), ("flama", 15), (None, 30)],
    "falla": [(None, 10), ("falla", 30), (None, 20)],
    "caido": [(None, 15), ("caido", 20), (None, 20)],
    "demo": [(None, 20), ("calor", 75), (None, 20), ("flama", 15), (None, 15),
             ("falla", 30), (None, 15), ("caido", 20), (None, 20)],
}


class Reloj:
    """Tiempo simulado desde que arrancó el simulador."""

    def __init__(self, velocidad):
        self.v = velocidad
        self.t0 = time.monotonic()

    def ahora(self):
        return (time.monotonic() - self.t0) * self.v

    def dormir(self, seg_simulados):
        time.sleep(max(0.0, seg_simulados / self.v))


def efecto_activo(escenario, t):
    ciclo = ESCENARIOS[escenario]
    total = sum(d for _, d in ciclo)
    t %= total
    for efecto, dur in ciclo:
        if t < dur:
            return efecto, t  # (efecto, segundos dentro de esa fase)
        t -= dur
    return None, 0


# ---------------------------------------------------------------- MQTT mínimo 3.1.1
def _cadena(s):
    b = s.encode("utf-8")
    return len(b).to_bytes(2, "big") + b


def _longitud(n):
    out = bytearray()
    while True:
        d, n = n % 128, n // 128
        out.append(d | (0x80 if n else 0))
        if not n:
            return bytes(out)


class ErrorMQTT(Exception):
    pass


class ClienteMQTT:
    def __init__(self, host, puerto, client_id, usuario, clave, lwt_topic, lwt_payload, keepalive=30):
        self.host, self.puerto = host, puerto
        self.client_id, self.usuario, self.clave = client_id, usuario, clave
        self.lwt_topic, self.lwt_payload = lwt_topic, lwt_payload
        self.keepalive = keepalive
        self.sock = None
        self.ultimo_envio = 0.0

    def conectar(self):
        s = socket.create_connection((self.host, self.puerto), timeout=5)
        flags = 0x02 | 0x04 | 0x20 | 0x80 | 0x40  # clean + will + will retain + user + pass
        var = _cadena("MQTT") + bytes([4, flags]) + self.keepalive.to_bytes(2, "big")
        pay = (_cadena(self.client_id) + _cadena(self.lwt_topic) + _cadena(self.lwt_payload)
               + _cadena(self.usuario) + _cadena(self.clave))
        cuerpo = var + pay
        s.sendall(bytes([0x10]) + _longitud(len(cuerpo)) + cuerpo)
        resp = b""
        while len(resp) < 4:
            trozo = s.recv(4 - len(resp))
            if not trozo:
                raise ErrorMQTT("el broker cerró la conexión al conectar")
            resp += trozo
        if resp[0] != 0x20 or resp[3] != 0:
            codigos = {1: "versión de protocolo no aceptada", 2: "client_id rechazado",
                       3: "broker no disponible", 4: "usuario o contraseña incorrectos",
                       5: "no autorizado"}
            raise ErrorMQTT(codigos.get(resp[3], f"CONNACK {resp[3]}"))
        s.settimeout(5)
        self.sock = s
        self.ultimo_envio = time.monotonic()

    def publicar(self, topic, payload, retenido=False):
        cuerpo = _cadena(topic) + payload.encode("utf-8")
        self.sock.sendall(bytes([0x30 | (1 if retenido else 0)]) + _longitud(len(cuerpo)) + cuerpo)
        self.ultimo_envio = time.monotonic()

    def ping_si_hace_falta(self):
        if time.monotonic() - self.ultimo_envio > self.keepalive / 2:
            self.sock.sendall(b"\xc0\x00")
            self.ultimo_envio = time.monotonic()

    def desconectar_limpio(self):
        try:
            self.sock.sendall(b"\xe0\x00")
        except OSError:
            pass
        self.cerrar()

    def caida_abrupta(self):
        """Cierra sin DISCONNECT: el broker publica el testamento (LWT)."""
        self.cerrar()

    def cerrar(self):
        if self.sock:
            try:
                self.sock.shutdown(socket.SHUT_RDWR)
            except OSError:
                pass
            self.sock.close()
            self.sock = None


# ---------------------------------------------------------------- física simulada
def punto_de_rocio(t, h):
    g = math.log(h / 100.0) + A * t / (B + t)
    return round(B * g / (A - g), 1)


class Magnitud:
    """Temperatura/humedad con deriva lenta + ruido + desviación por efectos."""

    def __init__(self, base, deriva, ruido, rng):
        self.base, self.deriva, self.ruido, self.rng = base, deriva, ruido, rng
        self.fase = rng.uniform(0, 6.28)

    def valor(self, t, extra=0.0):
        return self.base + self.deriva * math.sin(t / 90.0 + self.fase) + self.rng.gauss(0, self.ruido) + extra


class Tasa:
    """°C/min con ventana de 60 s, como lo calculará el firmware."""

    def __init__(self):
        self.hist = deque()

    def actualizar(self, t, temp):
        self.hist.append((t, temp))
        while self.hist and t - self.hist[0][0] > 60:
            self.hist.popleft()
        t0, v0 = self.hist[0]
        if t - t0 < 20:  # historial insuficiente
            return 0.0
        return round((temp - v0) / ((t - t0) / 60.0), 1)


class Rampa:
    """Desviación que sube durante un efecto y baja al terminar."""

    def __init__(self, sube, baja, tope):
        self.valor, self.sube, self.baja, self.tope = 0.0, sube, baja, tope
        self.t_prev = None

    def paso(self, t, activo):
        dt = 0 if self.t_prev is None else t - self.t_prev
        self.t_prev = t
        if activo:
            self.valor = min(self.tope, self.valor + self.sube * dt / 60.0)
        else:
            self.valor = max(0.0, self.valor - self.baja * dt / 60.0)
        return self.valor


# ---------------------------------------------------------------- nodos
class NodoBase(threading.Thread):
    def __init__(self, args, reloj, rng, escenario, node_id, tipo, usuario, clave, intervalo):
        super().__init__(daemon=True)
        self.args, self.reloj, self.rng, self.escenario = args, reloj, rng, escenario
        self.node_id, self.tipo, self.intervalo = node_id, tipo, intervalo
        self.topic_estado = f"site/estado/{node_id}"
        offline = json.dumps({"schema": 1, "node_id": node_id, "status": "offline"})
        self.cli = ClienteMQTT(args.host, args.puerto, f"sim-{node_id}", usuario, clave,
                               self.topic_estado, offline)
        self.parar = threading.Event()
        self.seq = 0
        self.boot = None
        self.conectado = False

    def log(self, msg):
        print(f"[{self.reloj.ahora():7.1f}s] {self.node_id:8s} {msg}", flush=True)

    def estado_online(self):
        raise NotImplementedError

    def mensaje(self, t, efecto, t_efecto):
        raise NotImplementedError

    def conectar(self):
        self.cli.conectar()
        self.cli.publicar(self.topic_estado, json.dumps(self.estado_online()), retenido=True)
        self.seq = 0
        self.boot = self.reloj.ahora()
        self.conectado = True
        self.log("conectado, estado online publicado")

    def intervalo_actual(self, efecto):
        return self.intervalo

    def run(self):
        ultimo_efecto = None
        while not self.parar.is_set():
            t = self.reloj.ahora()
            efecto, t_efecto = efecto_activo(self.escenario, t)
            try:
                if efecto != ultimo_efecto:
                    self.log(f"efecto: {efecto or 'normal'}")
                    ultimo_efecto = efecto
                if efecto == "caido":
                    if self.conectado:
                        self.log("caída abrupta (el broker publicará el testamento)")
                        self.cli.caida_abrupta()
                        self.conectado = False
                    self.reloj.dormir(1)
                    continue
                if not self.conectado:
                    self.conectar()
                self.seq += 1
                datos = self.mensaje(t, efecto, t_efecto)
                self.cli.publicar("site/datos", json.dumps(datos))
                if self.args.verboso:
                    self.log(json.dumps(datos))
                self.cli.ping_si_hace_falta()
            except (OSError, ErrorMQTT) as e:
                self.conectado = False
                self.cli.cerrar()
                self.log(f"sin conexión ({e}); reintento en 3 s")
                self.reloj.dormir(3 * self.reloj.v)
                continue
            self.reloj.dormir(self.intervalo_actual(efecto))

    def detener(self):
        self.parar.set()
        self.join(timeout=3)
        if self.conectado:
            try:
                self.cli.publicar(self.topic_estado,
                                  json.dumps({"schema": 1, "node_id": self.node_id, "status": "offline"}),
                                  retenido=True)
            except OSError:
                pass
            self.cli.desconectar_limpio()


class NodoRack(NodoBase):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.temp = {"A": Magnitud(24.3, 0.5, 0.04, self.rng), "B": Magnitud(24.9, 0.5, 0.04, self.rng)}
        self.hum = {"A": Magnitud(55.8, 1.5, 0.15, self.rng), "B": Magnitud(54.1, 1.5, 0.15, self.rng)}
        self.tasa = {"A": Tasa(), "B": Tasa()}
        self.calor = Rampa(sube=2.0, baja=3.0, tope=12.0)
        self.llama = False

    def estado_online(self):
        return {"schema": 1, "node_id": self.node_id, "status": "online", "fw": "sim-1.0.0",
                "sensors": {"tca9548a": True, "sht41_A": True, "sht41_B": True}}

    def intervalo_actual(self, efecto):
        return 1 if efecto == "flama" else self.intervalo  # la flama se repite cada segundo

    def mensaje(self, t, efecto, t_efecto):
        extra = self.calor.paso(t, efecto == "calor")
        posiciones = []
        for pid in ("A", "B"):
            if pid == "B" and efecto == "falla":
                posiciones.append({"id": "B", "temp": None, "hum": None, "dew_point": None,
                                   "rate_c_min": None, "err": ["sht41_B_timeout"]})
                continue
            temp = round(self.temp[pid].valor(t, extra if pid == "A" else extra * 0.3), 2)
            hum = round(max(5.0, min(95.0, self.hum[pid].valor(t, -extra * 0.8 if pid == "A" else 0))), 1)
            pos = {"id": pid, "temp": temp, "hum": hum, "dew_point": punto_de_rocio(temp, hum),
                   "rate_c_min": self.tasa[pid].actualizar(t, temp)}
            if pid == "A":
                pos["flame"] = efecto == "flama"
            posiciones.append(pos)
        return {"schema": 1, "type": "rack", "node_id": self.node_id, "seq": self.seq,
                "uptime_s": int(self.reloj.ahora() - self.boot), "positions": posiciones}


class NodoAmbiente(NodoBase):
    def __init__(self, *a, **k):
        super().__init__(*a, **k)
        self.t = Magnitud(29.4, 0.8, 0.05, self.rng)
        self.h = Magnitud(71.2, 2.0, 0.2, self.rng)
        self.tasa = Tasa()
        self.pm = [Magnitud(9, 2, 0.8, self.rng), Magnitud(14, 3, 1.0, self.rng), Magnitud(21, 4, 1.5, self.rng)]
        self.calor = Rampa(sube=1.0, baja=2.0, tope=6.0)

    def estado_online(self):
        return {"schema": 1, "node_id": self.node_id, "status": "online", "fw": "sim-1.0.0",
                "sensors": {"sht41": True, "pms5003": True}}

    def mensaje(self, t, efecto, t_efecto):
        extra = self.calor.paso(t, efecto == "calor")
        temp = round(self.t.valor(t, extra), 2)
        hum = round(max(5.0, min(95.0, self.h.valor(t, -extra * 0.8))), 1)
        d = {"schema": 1, "type": "ambiente", "node_id": self.node_id, "seq": self.seq,
             "uptime_s": int(self.reloj.ahora() - self.boot), "temp": temp, "hum": hum,
             "dew_point": punto_de_rocio(temp, hum), "rate_c_min": self.tasa.actualizar(t, temp)}
        if efecto == "falla":
            d.update({"pm1_0": None, "pm2_5": None, "pm10": None, "err": ["pms_sin_trama"]})
        else:
            p1, p25, p10 = (max(0, round(m.valor(t))) for m in self.pm)
            p25, p10 = max(p25, p1), max(p10, p25)  # PM1.0 <= PM2.5 <= PM10
            d.update({"pm1_0": p1, "pm2_5": p25, "pm10": p10})
        return d


# ---------------------------------------------------------------- programa
def pedir_clave(variable, usuario):
    valor = os.environ.get(variable)
    if valor:
        return valor
    return getpass.getpass(f"Contraseña de {usuario}: ")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--host", default="localhost")
    ap.add_argument("--puerto", type=int, default=1883)
    ap.add_argument("--escenario", choices=sorted(ESCENARIOS), default="normal")
    ap.add_argument("--velocidad", type=float, default=1.0, help="factor de tiempo simulado (2 = el doble de rápido)")
    ap.add_argument("--solo", choices=["rack", "ambiente"], help="simular un solo nodo")
    ap.add_argument("--usuario-rack", default="nodo_rack")
    ap.add_argument("--usuario-ambiente", default="nodo_ambiente")
    ap.add_argument("--semilla", type=int, help="semilla del ruido, para resultados repetibles")
    ap.add_argument("--verboso", action="store_true", help="imprime cada mensaje publicado")
    args = ap.parse_args()
    if args.velocidad <= 0:
        sys.exit("--velocidad debe ser mayor que 0")

    reloj = Reloj(args.velocidad)
    rng = random.Random(args.semilla)
    nodos = []
    if args.solo in (None, "rack"):
        clave = pedir_clave("SIM_RACK_PASS", args.usuario_rack)
        nodos.append(NodoRack(args, reloj, rng, args.escenario, "rack-01", "rack",
                              args.usuario_rack, clave, 2))
    if args.solo in (None, "ambiente"):
        clave = pedir_clave("SIM_AMB_PASS", args.usuario_ambiente)
        nodos.append(NodoAmbiente(args, reloj, rng, args.escenario, "amb-01", "ambiente",
                                  args.usuario_ambiente, clave, 5))

    print(f"Escenario '{args.escenario}' a velocidad x{args.velocidad:g} hacia {args.host}:{args.puerto}. Ctrl+C para detener.")
    reloj.t0 = time.monotonic()
    for n in nodos:
        try:
            n.conectar()
        except (OSError, ErrorMQTT) as e:
            sys.exit(f"No se pudo conectar como {n.cli.usuario}: {e}")
        n.start()
    try:
        while any(n.is_alive() for n in nodos):
            time.sleep(0.5)
    except KeyboardInterrupt:
        print("\nDeteniendo…")
    for n in nodos:
        n.detener()


if __name__ == "__main__":
    main()
