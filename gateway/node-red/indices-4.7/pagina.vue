<template>
  <div class="m47" v-if="msg && msg.payload">
    <div class="modo" :class="enSim ? 'sim' : 'real'">
      <div v-if="enSim">
        <b>MODO SIMULACIÓN</b>
        <span v-if="fase"> · Fase {{ fase.n }}/{{ fase.total }}: <b>{{ fase.nombre }}</b> ({{ fase.texto }}) · quedan {{ fase.quedan_s }} s</span>
        <div class="nota claro">Tiempo acelerado {{ p.aceleracion || 180 }}× (cada fase de 20 s cuenta como 1 h) y umbrales de demostración. Tus acumulados reales no se modifican.</div>
      </div>
      <div v-else>
        <b>Datos reales</b>
        <span v-if="p.aceleracion > 1"> · MODO DEMO: tiempo acelerado {{ p.aceleracion }}× y umbrales de demostración</span>
      </div>
      <button class="btn-sim" @click="simular(enSim ? 'detener' : 'iniciar')">{{ enSim ? 'Detener simulación' : 'Iniciar simulación' }}</button>
    </div>

    <div v-if="!p.tarjetas" class="nota">{{ enSim ? 'Iniciando la simulación…' : 'Esperando datos de los nodos…' }}</div>
    <template v-else>
      <div class="fila">
        <div class="pill" :class="p.general">Estado general: {{ etiqueta(p.general) }}</div>
      </div>

      <div v-if="p.atender && p.atender.length" class="atender">
        <div class="tit">Atender ahora</div>
        <div v-for="(x, i) in p.atender" :key="i" class="linea" :class="[x.nivel, x.id]">
          <span class="ico">{{ x.icono }}</span>
          <div><b>{{ x.texto }}</b><div class="que">→ {{ x.accion }}</div></div>
        </div>
      </div>

      <div class="banner" :class="p.pronostico ? (p.pronostico.ok ? (p.pronostico.riesgo ? 'amarillo' : 'verde') : 'gris') : 'gris'">
        🌊 {{ p.pronostico ? p.pronostico.texto : 'Esperando el pronóstico de viento…' }}
      </div>

      <div class="seccion">Ahora</div>
      <div class="mosaico">
        <div class="tile" :class="nivelFactor">
          <div class="tt">Envejecimiento de equipos</div>
          <div class="grande">{{ uno(a.factor) }}×</div>
          <div class="det">temperatura ×{{ uno(a.f_temp) }} · humedad ×{{ uno(a.f_hum) }}<span v-if="a.pos_peor"> (posición {{ a.pos_peor }})</span></div>
          <div class="det">1× = equipo a 25 °C y 50 % de humedad</div>
        </div>
        <div class="tile" :class="nivel(a.hr_max, 60, 75)">
          <div class="tt">Humedad en el rack</div>
          <div class="grande">{{ uno(a.hr_max) }} %</div>
          <div class="det">límites: 60 % (ASHRAE) · 75 % (la sal se activa)</div>
          <div class="det">Viento del mar: <b>{{ a.brisa === true ? 'sí' : (a.brisa === false ? 'no' : 'sin datos') }}</b></div>
        </div>
        <div class="tile" :class="nivel(a.t_max, 27, 32)">
          <div class="tt">Temperatura en el rack</div>
          <div class="grande">{{ uno(a.t_max) }} °C</div>
          <div class="det">límites: 27 °C (recomendado) · 32 °C (permitido)</div>
        </div>
        <div class="tile" :class="nivel(a.subida_15, 2.5, 5)">
          <div class="tt">Subida de temperatura</div>
          <div class="grande">+{{ uno(a.subida_15) }} °C</div>
          <div class="det">en los últimos 15 min{{ enSim ? ' simulados' : '' }} · aviso a más de 5 °C</div>
          <div class="det">ahora: {{ a.tasa === null || a.tasa === undefined ? '—' : (a.tasa > 0 ? '+' : '') + uno(a.tasa) }} °C/min</div>
        </div>
        <div class="tile" :class="nivelInverso(margen, 5, 3)">
          <div class="tt">Margen a la condensación</div>
          <div class="grande">{{ uno(margen) }} °C</div>
          <div class="det">distancia al punto de rocío · riesgo bajo 3 °C</div>
        </div>
        <div class="tile" :class="nivel(a.pm10, 45, 150)">
          <div class="tt">Polvo en el aire (PM10)</div>
          <div class="grande">{{ a.pm10 === null || a.pm10 === undefined ? '—' : a.pm10 }} <small>µg/m³</small></div>
          <div class="det">referencias: 45 (OMS) · 150 (EPA)</div>
          <div class="det" v-if="a.pm_confiable === false">humedad alta: lectura poco confiable</div>
        </div>
        <div class="tile" :class="p.pms_falla ? 'rojo' : 'verde'">
          <div class="tt">Sensor de partículas</div>
          <div class="grande">{{ p.pms_falla ? 'Falla' : 'OK' }}</div>
          <div class="det" v-if="a.pms_ventana">{{ uno(a.pms_ventana.perdidas_pct) }} % tramas perdidas · {{ a.pms_ventana.imposibles }} imposibles (últimas {{ a.pms_ventana.n }})</div>
        </div>
      </div>

      <div class="dos">
        <div class="caja">
          <div class="tit">Activos ahora</div>
          <div v-if="!p.activos || !p.activos.length" class="nota">Sin condiciones de riesgo en este momento.</div>
          <span v-for="(c, i) in p.activos" :key="i" class="chip" :class="c.nivel">{{ c.icono }} {{ c.texto }}</span>
          <div class="tit" style="margin-top:12px">Eventos recientes</div>
          <div v-if="!p.eventos || !p.eventos.length" class="nota">Todavía no hay eventos.</div>
          <div v-for="(e, i) in (p.eventos || []).slice(0, 12)" :key="i" class="evento" :class="e.nivel">
            <span class="hora">{{ hora(e.ts) }}</span> {{ e.icono }} {{ e.texto }}
          </div>
        </div>
        <div class="caja">
          <div class="tit">Afuera<span v-if="p.pronostico && p.pronostico.sitio"> · {{ p.pronostico.sitio }}</span></div>
          <template v-if="p.pronostico && p.pronostico.ok">
            <div class="viento">
              <span class="flecha" :style="{ transform: 'rotate(' + (p.pronostico.actual.dir_deg + 180) + 'deg)' }">↑</span>
              <div>
                <b>{{ p.pronostico.actual.punto }} · {{ Math.round(p.pronostico.actual.vel_kmh) }} km/h</b><br>
                <span :class="p.pronostico.actual.desde_mar ? 'mar' : ''">{{ p.pronostico.actual.desde_mar ? 'Viento del mar' : 'Viento de tierra' }}</span>
              </div>
            </div>
            <div>{{ p.pronostico.actual.temp }} °C · {{ p.pronostico.actual.hum }} % de humedad</div>
            <div v-if="p.pronostico.costa_km > 0" class="nota">A unos {{ p.pronostico.costa_km }} km de la costa: el viento del mar llega con menos sal.</div>
            <div class="nota">Datos: {{ p.pronostico.fuente }}</div>
          </template>
          <div v-else class="nota">Sin datos de viento: los índices usan solo los sensores.</div>
        </div>
      </div>

      <div class="seccion">Acumulados desde el último mantenimiento</div>
      <div class="tarjetas">
        <div class="tarjeta" v-for="t in p.tarjetas" :key="t.id">
          <div class="cab"><span class="punto" :class="t.estado"></span><b>{{ t.titulo }}</b></div>
          <div class="barra"><div :class="t.estado" :style="{ width: Math.min(100, Math.round(t.carga * 100)) + '%' }"></div></div>
          <div class="nota">{{ Math.round(t.carga * 100) }} % del umbral · {{ t.dias }} día(s) desde el último mantenimiento</div>
          <div class="valor">{{ t.valor }}</div>
          <div class="accion">Acción: {{ t.accion }}</div>
          <button @click="hecho(t.id, t.titulo)">Mantenimiento hecho</button>
        </div>
      </div>

      <div v-if="p.bitacora && p.bitacora.length" class="nota bitacora">Últimos mantenimientos: {{ ultimos() }}</div>
      <div class="nota">Riesgo relativo calculado con límites ASHRAE y el modelo de Peck. Los umbrales de los acumulados son valores iniciales, no una norma.</div>
    </template>
  </div>
  <div v-else class="nota">Esperando datos de los nodos…</div>
</template>

<script>
export default {
  computed: {
    p () { return (this.msg && this.msg.payload) || {} },
    a () { return this.p.actual || {} },
    enSim () { return !!(this.p.modo && this.p.modo.sim) },
    fase () { return this.p.modo && this.p.modo.fase },
    offline () { return Object.keys(this.p.nodos || {}).filter(k => this.p.nodos[k] === 'offline') },
    margen () {
      const v = [this.a.margen_rocio, this.a.margen_amb].filter(x => typeof x === 'number')
      return v.length ? Math.min.apply(null, v) : null
    },
    nivelFactor () { const f = this.a.factor; return typeof f !== 'number' ? 'gris' : f >= 3 ? 'rojo' : f >= 1.5 ? 'amarillo' : 'verde' }
  },
  methods: {
    uno (v) { return typeof v === 'number' ? (Math.round(v * 10) / 10).toFixed(1) : '—' },
    nivel (v, amarillo, rojo) { return typeof v !== 'number' ? 'gris' : v > rojo ? 'rojo' : v > amarillo ? 'amarillo' : 'verde' },
    nivelInverso (v, amarillo, rojo) { return typeof v !== 'number' ? 'gris' : v < rojo ? 'rojo' : v < amarillo ? 'amarillo' : 'verde' },
    etiqueta (e) { return { verde: 'normal', amarillo: 'atención', rojo: 'acción necesaria' }[e] || e },
    nombre (id) {
      const t = (this.p.tarjetas || []).find(x => x.id === id)
      return t ? t.titulo : id
    },
    hora (ts) { return new Date(ts).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) },
    fecha (ts) { return new Date(ts).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) },
    ultimos () { return (this.p.bitacora || []).slice(0, 5).map(b => this.nombre(b.indice) + ' (' + this.fecha(b.ts) + ')').join(' · ') },
    simular (accion) { this.send({ topic: 'sim/control', payload: { accion: accion } }) },
    hecho (id, titulo) {
      const donde = this.enSim ? ' de la simulación' : ''
      if (window.confirm('¿Confirmas el mantenimiento de "' + titulo + '"' + donde + '? Su contador vuelve a cero.')) {
        this.send({ topic: 'mantenimiento', payload: { indice: id } })
      }
    }
  }
}
</script>

<style>
.m47 { width: 100%; font-size: 14px; }
.m47 .modo { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; padding: 10px 12px; border-radius: 6px; margin-bottom: 12px; }
.m47 .modo.real { background: #eceff1; color: #263238; }
.m47 .modo.sim { background: #4527a0; color: #fff; }
.m47 .modo .claro { color: #d1c4e9; }
.m47 .btn-sim { margin: 0; padding: 8px 14px; border-radius: 4px; border: 1px solid #4527a0; background: #fff; color: #4527a0; font-weight: bold; cursor: pointer; }
.m47 .fila { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 12px; align-items: stretch; }
.m47 .pill, .m47 .offline { padding: 6px 12px; border-radius: 6px; font-weight: bold; }
.m47 .pill.verde { background: #e8f5e9; color: #1b5e20; }
.m47 .pill.amarillo { background: #fff8e1; color: #8a5a00; }
.m47 .pill.rojo { background: #c62828; color: #fff; }
.m47 .offline { background: #c62828; color: #fff; }
.m47 .atender { border: 2px solid #c62828; border-radius: 6px; padding: 8px 10px; margin-bottom: 12px; background: #fff; }
.m47 .atender .tit { color: #b71c1c; font-weight: bold; }
.m47 .atender .linea { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border-radius: 6px; margin-top: 6px; }
.m47 .atender .linea.critico { background: #fdecea; border-left: 6px solid #c62828; }
.m47 .atender .linea.aviso { background: #fff8e1; border-left: 6px solid #f9a825; }
.m47 .atender .linea.flama { background: #c62828; color: #fff; font-size: 18px; animation: m47pulso 1s infinite alternate; }
.m47 .atender .ico { font-size: 22px; line-height: 1.2; }
.m47 .atender .que { font-size: 14px; margin-top: 2px; }
@keyframes m47pulso { from { opacity: 1; } to { opacity: 0.75; } }
.m47 .banner { padding: 10px 12px; border-radius: 6px; margin-bottom: 12px; font-weight: bold; }
.m47 .banner.verde { background: #e8f5e9; color: #1b5e20; }
.m47 .banner.amarillo { background: #f9a825; color: #212121; }
.m47 .banner.gris { background: #eceff1; color: #455a64; }
.m47 .seccion { font-weight: bold; font-size: 15px; margin: 4px 0 8px; color: #263238; }
.m47 .mosaico { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; margin-bottom: 14px; }
.m47 .tile { border-radius: 6px; padding: 10px 12px; border-left: 6px solid #90a4ae; background: #f5f7f9; }
.m47 .tile.verde { border-left-color: #2e7d32; background: #edf7ee; }
.m47 .tile.amarillo { border-left-color: #f9a825; background: #fff8e1; }
.m47 .tile.rojo { border-left-color: #c62828; background: #fdecea; }
.m47 .tile .tt { font-size: 12px; color: #455a64; text-transform: uppercase; }
.m47 .tile .grande { font-size: 30px; font-weight: bold; line-height: 1.2; margin: 4px 0; }
.m47 .tile.rojo .grande { color: #b71c1c; }
.m47 .tile.amarillo .grande { color: #8a5a00; }
.m47 .tile .det { font-size: 12px; color: #455a64; }
.m47 .dos { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 14px; }
.m47 .caja { flex: 1 1 300px; border: 1px solid #d5dbe3; border-radius: 6px; padding: 10px 12px; }
.m47 .tit { color: #6b7280; font-size: 12px; text-transform: uppercase; margin-bottom: 6px; }
.m47 .chip { display: inline-block; padding: 4px 10px; border-radius: 14px; margin: 0 6px 6px 0; font-size: 13px; font-weight: bold; }
.m47 .chip.critico { background: #c62828; color: #fff; }
.m47 .chip.aviso { background: #f9a825; color: #212121; }
.m47 .chip.info { background: #e3f2fd; color: #0b5cab; }
.m47 .evento { font-size: 13px; padding: 3px 0 3px 8px; border-left: 3px solid #cfd8dc; margin-bottom: 3px; }
.m47 .evento.critico { border-left-color: #c62828; }
.m47 .evento.aviso { border-left-color: #f9a825; }
.m47 .evento.info { border-left-color: #90a4ae; color: #455a64; }
.m47 .hora { color: #6b7280; font-variant-numeric: tabular-nums; margin-right: 4px; }
.m47 .viento { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
.m47 .flecha { display: inline-block; font-size: 28px; line-height: 1; color: #0b5cab; }
.m47 .mar { color: #0b5cab; font-weight: bold; }
.m47 .nota { color: #6b7280; font-size: 12px; margin-top: 4px; }
.m47 .tarjetas { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 12px; }
.m47 .tarjeta { border: 1px solid #d5dbe3; border-radius: 6px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; }
.m47 .cab { display: flex; align-items: center; gap: 8px; }
.m47 .punto { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.m47 .punto.verde, .m47 .barra .verde { background: #2e7d32; }
.m47 .punto.amarillo, .m47 .barra .amarillo { background: #f9a825; }
.m47 .punto.rojo, .m47 .barra .rojo { background: #c62828; }
.m47 .barra { height: 8px; background: #eceff1; border-radius: 4px; overflow: hidden; }
.m47 .barra div { height: 100%; }
.m47 .valor { font-size: 13px; }
.m47 .accion { font-size: 13px; font-weight: bold; }
.m47 .tarjeta button { margin-top: 6px; align-self: flex-start; padding: 6px 10px; border: 1px solid #0b5cab; color: #0b5cab; background: #fff; border-radius: 4px; cursor: pointer; }
.m47 .bitacora { margin-top: 12px; }
</style>
