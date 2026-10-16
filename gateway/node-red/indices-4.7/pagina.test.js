// Revisa la plantilla de la página sin navegador: etiquetas balanceadas, expresiones sin '<'
// y que los métodos y valores calculados funcionen con datos de ejemplo.
const fs = require('fs'), path = require('path'), Module = require('module');
const F = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'flujo-mvp-4.7.json'), 'utf8'));
const t = F.find(n => n.id === 'd47_ui').format;
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALLA ') + m); if (!c) fails++; };

ok(t === fs.readFileSync(path.join(__dirname, 'pagina.vue'), 'utf8'), 'el flujo lleva la misma plantilla que pagina.vue');
const tpl = t.slice(t.indexOf('<template>'), t.lastIndexOf('</template>') + 11);
const VACIAS = new Set(['br', 'img', 'input', 'hr']);
const pila = []; let error = null;
const sinMustache = tpl.replace(/\{\{[\s\S]*?\}\}/g, '').replace(/"[^"]*"/g, '""');
for (const m of sinMustache.matchAll(/<\/?([a-zA-Z][a-zA-Z0-9-]*)[^>]*?(\/?)>/g)) {
    const tag = m[1].toLowerCase(), cierre = m[0][1] === '/';
    if (VACIAS.has(tag) || m[2] === '/') continue;
    if (!cierre) pila.push(tag);
    else if (pila.pop() !== tag) { error = tag; break; }
}
ok(!error && pila.length === 0, 'etiquetas balanceadas' + (error ? ' (falla en ' + error + ')' : ''));
const mustaches = [...tpl.matchAll(/\{\{([\s\S]*?)\}\}/g)].map(x => x[1]);
ok(mustaches.length > 30 && mustaches.every(x => !x.includes('<')), mustaches.length + ' expresiones, ninguna con "<"');

const src = t.slice(t.indexOf('<script>') + 8, t.indexOf('</script>')).replace('export default', 'module.exports =');
const mod = new Module('pagina'); mod._compile(src, 'pagina.js');
const def = mod.exports;
function componente(payload) {
    const c = { msg: { payload }, enviados: [] };
    c.send = m => c.enviados.push(m);
    for (const k in def.methods) c[k] = def.methods[k].bind(c);
    for (const k in def.computed) Object.defineProperty(c, k, { get: def.computed[k].bind(c) });
    return c;
}
const c = componente({ modo: { sim: true, fase: { n: 3, total: 6 } }, nodos: { 'rack-01': 'offline', 'amb-01': 'online' },
    actual: { factor: 2.2, margen_rocio: 4.1, margen_amb: 1.4 }, tarjetas: [{ id: 'polvo', titulo: 'Polvo en servidores' }],
    bitacora: [{ indice: 'polvo', ts: Date.now() }] });
ok(c.enSim === true && c.fase.n === 3 && c.offline.join() === 'rack-01', 'valores calculados: modo, fase y nodos desconectados');
ok(c.margen === 1.4 && c.nivelFactor === 'amarillo' && c.uno(2.25) === '2.3' && c.uno(null) === '—', 'margen mínimo, nivel del factor y formato');
ok(c.nivel(80, 60, 75) === 'rojo' && c.nivel(65, 60, 75) === 'amarillo' && c.nivel(undefined, 1, 2) === 'gris', 'niveles de color');
ok(c.nivelInverso(1.4, 5, 3) === 'rojo' && c.nivelInverso(4, 5, 3) === 'amarillo' && c.nivelInverso(8, 5, 3) === 'verde', 'nivel inverso (margen de condensación)');
c.simular('detener');
ok(c.enviados[0].topic === 'sim/control' && c.enviados[0].payload.accion === 'detener', 'botón de simulación envía sim/control');
global.window = { confirm: (q) => /de la simulación/.test(q) };
c.hecho('polvo', 'Polvo');
ok(c.enviados[1] && c.enviados[1].topic === 'mantenimiento' && c.enviados[1].payload.indice === 'polvo', 'Mantenimiento hecho pide confirmación (aclara que es de la simulación) y envía el índice');
ok(/Polvo en servidores \(/.test(c.ultimos()), 'bitácora con nombre y fecha');
const vacio = componente(undefined);
ok(vacio.enSim === false && vacio.margen === null && vacio.nivelFactor === 'gris', 'sin datos: no falla');
ok(/v-for="\(x, i\) in p\.atender"/.test(tpl) && /\{\{ x\.accion \}\}/.test(tpl) && /Atender ahora/.test(tpl), 'la página muestra "Atender ahora" con la acción de cada tarea');
ok(!/class="offline"/.test(tpl), 'los nodos desconectados se muestran en "Atender ahora" (sin etiqueta aparte)');
process.exit(fails ? 1 : 0);
