<template>
  <div style="display:flex; flex-wrap:wrap; align-items:center; gap:12px; width:100%">
    <div>
      <button v-for="o in opciones" :key="o.v" @click="elegir(o.v)"
              :style="{padding:'6px 14px', marginRight:'6px', borderRadius:'6px', cursor:'pointer',
                       border:'1px solid #0b5cab', fontWeight:'bold',
                       background: rango === o.v ? '#0b5cab' : '#ffffff', color: rango === o.v ? '#ffffff' : '#0b5cab'}">
        {{ o.t }}
      </button>
    </div>
    <div style="color:#555; font-size:0.9em">
      <span v-if="msg && msg.payload && msg.payload.puntos">
        {{ msg.payload.rango === '7d' ? 'Promedio por hora' : 'Promedio por minuto' }} ·
        {{ msg.payload.nodos.join(', ') }} · actualizado {{ msg.payload.hora }}
      </span>
      <span v-else-if="msg && msg.payload">Sin datos todavía en este rango (el histórico se escribe cada 30 s; el resumen por hora, cada hora).</span>
      <span v-else>Cargando…</span>
    </div>
  </div>
</template>

<script>
export default {
  data () { return { opciones: [{ v: '24h', t: 'Últimas 24 h' }, { v: '7d', t: 'Últimos 7 días' }] } },
  computed: { rango () { return (this.msg && this.msg.payload && this.msg.payload.rango) || '24h' } },
  methods: { elegir (v) { this.send({ payload: v }) } }
}
</script>
