const fs = require('fs'), vm = require('vm'), path = require('path');
const RAIZ = path.join(__dirname, '..', '..', '..') + '/';   // raíz del repositorio
const base = fs.readFileSync(path.join(__dirname, 'indices.js'), 'utf8');
const ej = n => JSON.parse(fs.readFileSync(RAIZ + 'docs/acuerdos/ejemplos/' + n + '.json', 'utf8'));
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK    ' : 'FALLA ') + m); if (!c) fails++; };
const cerca = (a, b, tol) => Math.abs(a - b) <= (tol || 1e-6);

function entorno(acel) {
    const code = acel ? base.replace('ACELERACION: 1,', 'ACELERACION: ' + acel + ',') : base;
    const E = { clock: 1e12, store: {} };
    const flow = { get: k => E.store[k] ? JSON.parse(JSON.stringify(E.store[k])) : undefined,
                   set: (k, v) => { E.store[k] = JSON.parse(JSON.stringify(v)); } };
    E.run = (topic, payload) => vm.runInNewContext('(function(){' + code + '})()',
        { flow, msg: { topic, payload }, Date: { now: () => E.clock }, Math, JSON, isFinite, Object, Array });
    E.rack = (t, hr, extra) => {
        const m = ej('rack');
        m.positions.forEach(p => { p.temp = t; p.hum = hr; p.dew_point = t - 10; Object.assign(p, extra || {}); });
        return m;
    };
    E.amb = (o) => Object.assign(ej('ambiente'), o || {});
    // envía n mensajes cada paso_ms
    E.serie = (n, paso, fn) => { let o; for (let i = 0; i < n; i++) { o = E.run('site/datos', fn(i)); E.clock += paso; } return o; };
    return E;
}

// 1. Peck: 1 hora a 25 °C / 50 % = 1 hora equivalente; factores de referencia
let E = entorno();
let o = E.serie(1801, 2000, () => E.rack(25, 50));
ok(cerca(o.payload.indices.envejecimiento.horas, 1, 1e-9) && cerca(o.payload.indices.envejecimiento.horas_eq, 1, 1e-9), 'Peck: 1 h a 25 °C/50 % = 1 h equivalente');
[[22, 45, 0.55], [27, 60, 2.01], [30, 80, 5.91]].forEach(([t, hr, f]) => {
    o = E.run('site/datos', E.rack(t, hr));
    ok(cerca(o.payload.actual.factor, f, 0.005), `Peck ${t} °C/${hr} %: factor ${o.payload.actual.factor.toFixed(2)} ≈ ${f}`);
});

// 2. Se toma la posición peor (máximo) entre A y B
E = entorno();
const m2 = ej('rack'); m2.positions[0].temp = 30; m2.positions[0].hum = 80; m2.positions[1].temp = 22; m2.positions[1].hum = 45;
o = E.run('site/datos', m2);
ok(cerca(o.payload.actual.factor, 5.91, 0.005) && o.payload.actual.t_max === 30, 'usa la posición más desfavorable');

// 3. Huecos: no se acumula si pasan más de 10 s (rack)
E = entorno();
E.run('site/datos', E.rack(25, 50)); E.clock += 60000;
o = E.run('site/datos', E.rack(25, 50));
ok(o.payload.indices.envejecimiento.horas === 0, 'hueco de 60 s no se acumula');
E.clock += 2000; o = E.run('site/datos', E.rack(25, 50));
ok(cerca(o.payload.indices.envejecimiento.horas, 2000 / 3600000), 'después del hueco vuelve a acumular');

// 4. Modo demo: 60× acelera lo acumulado
E = entorno(60);
o = E.serie(31, 2000, () => E.rack(25, 50));   // 60 s reales
ok(cerca(o.payload.indices.envejecimiento.horas, 1, 1e-9) && o.payload.aceleracion === 60, 'modo demo 60×: 1 min real = 1 h');

// 5. Humedad y brisa marina
E = entorno();
E.run('viento', { dir_deg: 350, vel_kmh: 20 });
o = E.serie(1801, 2000, () => E.rack(28, 80));
const C = o.payload.indices.corrosion;
ok(cerca(C.h_hr60, 1) && cerca(C.h_hr75, 1) && cerca(C.h_brisa, 1), 'HR 80 % con brisa del mar: 1 h en los tres contadores');
ok(o.payload.actual.brisa === true, 'brisa activa (350°, 20 km/h)');
E.run('viento', { dir_deg: 180, vel_kmh: 30 });
o = E.serie(10, 2000, () => E.rack(28, 80));
ok(o.payload.actual.brisa === false && cerca(o.payload.indices.corrosion.h_brisa, 1), 'viento del sur: no es brisa marina');
E.run('viento', { dir_deg: 10, vel_kmh: 10 });
ok(E.run('site/datos', E.rack(28, 80)).payload.actual.brisa === false, 'viento del mar débil (10 km/h): no cuenta');
E.run('viento', { dir_deg: 290, vel_kmh: 15 });
ok(E.run('site/datos', E.rack(28, 80)).payload.actual.brisa === true, 'límites del sector y velocidad incluidos (290°, 15 km/h)');
E.run('viento', { dir_deg: 70, vel_kmh: 15 });
ok(E.run('site/datos', E.rack(28, 80)).payload.actual.brisa === true, 'sector cruza el norte (70° también es mar)');
E.clock += 3 * 3600000;
ok(E.run('site/datos', E.rack(28, 80)).payload.actual.brisa === null, 'viento de hace 3 h: sin datos de viento (null)');
E = entorno();
o = E.serie(100, 2000, () => E.rack(28, 65));
ok(o.payload.indices.corrosion.h_hr60 > 0 && o.payload.indices.corrosion.h_hr75 === 0 && o.payload.indices.corrosion.h_brisa === 0, 'HR 65 % sin viento: solo cuenta > 60 %');

// 6. Eventos térmicos
E = entorno();
o = E.serie(31, 2000, () => E.rack(33, 50));
ok(cerca(o.payload.indices.termico.min27, 1) && cerca(o.payload.indices.termico.min32, 1), '33 °C por 1 min: suma en > 27 y > 32');
E = entorno();
let t = 24;
o = E.serie(451, 2000, (i) => E.rack(24 + Math.min(i, 300) * 0.02, 50));   // +6 °C en 10 min
ok(o.payload.indices.termico.subidas === 1 && o.payload.indices.termico.ultima.tipo === 'general' &&
   o.payload.indices.termico.ultima.posiciones.join() === 'A,B', 'subida de 6 °C en A y B: UN episodio, clasificado como general (A y B)');
o = E.serie(300, 2000, () => E.rack(30, 50));
ok(o.payload.indices.termico.subidas === 1, 'se queda caliente: no repite el evento');
// subida solo en A (B estable): local
const dos = (ta, tb) => { const m = E.rack(ta, 50); m.positions[1].temp = tb; return m; };
E = entorno();
o = E.serie(451, 2000, (i) => dos(24 + Math.min(i, 300) * 0.02, 24));
ok(o.payload.indices.termico.subidas === 1 && o.payload.indices.termico.ultima.tipo === 'local' &&
   o.payload.indices.termico.ultima.posiciones.join() === 'A', 'subida solo en A con B estable: episodio local en A');
// empieza en A y luego sube B: el mismo episodio pasa a general, sin contar otra vez
E = entorno();
E.serie(20, 2000, () => dos(24, 24));
let ev = [];
for (let i = 0; i < 400; i++) { o = E.run('site/datos', dos(24 + Math.min(i, 150) * 0.04, 24 + Math.max(0, Math.min(i - 200, 150)) * 0.04)); E.clock += 2000; if (o.payload.actual.subida_evento) ev.push(o.payload.actual.subida_evento); }
ok(ev.join() === 'nueva,ahora_general' && o.payload.indices.termico.subidas === 1 && o.payload.indices.termico.ultima.tipo === 'general',
   'empieza local en A y después sube B: un solo episodio que pasa a general (' + ev.join() + ')');
// B sin datos: no se puede localizar
E = entorno();
o = E.serie(451, 2000, (i) => { const m = dos(24 + Math.min(i, 300) * 0.02, 0); delete m.positions[1].temp; m.positions[1].err = ['sht41_B_timeout']; return m; });
ok(o.payload.indices.termico.subidas === 1 && o.payload.indices.termico.ultima.tipo === 'sin_comparar', 'B sin datos: la subida en A no se marca como local');
// mantenimiento borra la última subida
o = E.run('mantenimiento', { indice: 'termico' });
ok(o.payload.indices.termico.subidas === 0 && o.payload.indices.termico.ultima === null, 'mantenimiento térmico reinicia subidas y última subida');

// 7. Condensación
E = entorno();
o = E.serie(31, 2000, () => E.rack(24, 90, { dew_point: 22.3 }));
ok(cerca(o.payload.indices.condensacion.min, 1) && o.payload.actual.rocio_rack === true, 'margen de 1.7 °C al rocío: cuenta condensación');
o = E.serie(10, 2000, () => E.rack(24, 50, { dew_point: 13 }));
ok(cerca(o.payload.indices.condensacion.min, 1, 1e-9) && o.payload.actual.rocio_rack === false, 'margen amplio: deja de contar (se queda en 1 min)');

// 8. Ambiente: polvo y salud del PMS5003
E = entorno();
o = E.serie(721, 5000, () => E.amb({ pm10: 20 + Math.random() }));
ok(cerca(o.payload.indices.polvo.ugh, 20.5, 0.6) && cerca(o.payload.indices.pms.horas, 1), 'PM10 ≈ 20 por 1 h ≈ 20 µg·h/m³ y 1 h de uso');
o = E.run('site/datos', ej('ambiente-con-falla'));
ok(o.payload.indices.pms.perdidas === 1 && o.payload.indices.pms.tramas === 722, 'pms_sin_trama cuenta trama perdida');
o = E.run('site/datos', E.amb({ pm1_0: 30, pm2_5: 20, pm10: 25 }));
ok(o.payload.indices.pms.imposibles === 1, 'PM1.0 > PM2.5: valor imposible');
o = E.run('site/datos', E.amb({ hum: 85 }));
ok(o.payload.actual.pm_confiable === false, 'HR 85 %: lectura de PM poco confiable');
E = entorno();
o = E.serie(1000, 5000, () => E.amb({ pm1_0: 9, pm2_5: 14, pm10: 21 }));    // 83 min idénticos
ok(o.payload.indices.pms.min_fijo > 20 && o.payload.indices.pms.min_fijo < 25, `PM idéntico > 1 h: ${o.payload.indices.pms.min_fijo.toFixed(1)} min marcados como fijos`);
o = E.run('site/datos', ej('ambiente-con-falla-sht41'));
ok(o !== null && o.payload.indices.pms.tramas === 1001, 'SHT41 ambiente caído: PM sigue contando');

// 9. Mantenimiento: reinicia solo ese índice y anota bitácora
E = entorno();
E.serie(100, 5000, () => E.amb());
E.serie(100, 2000, () => E.rack(30, 80));
o = E.run('mantenimiento', { indice: 'polvo' });
ok(o.payload.indices.polvo.ugh === 0 && o.payload.indices.polvo.desde === E.clock && o.payload.indices.envejecimiento.horas > 0 && o.payload.indices.pms.ugh > 0,
   'reinicia polvo, no envejecimiento ni el contador del PMS');
ok(o.payload.bitacora[0].indice === 'polvo', 'bitácora registra el mantenimiento');
ok(E.run('mantenimiento', { indice: 'otro' }) === null, 'índice desconocido: se ignora');

// 10. Mensajes inválidos y otros temas
ok(E.run('site/datos', { hola: 1 }) === null && E.run('site/datos', 'texto') === null && E.run('otro', {}) === null, 'inválidos y temas ajenos: sin salida');
ok(E.run('site/datos', JSON.stringify(ej('rack'))) !== null, 'acepta el JSON como texto');
ok(E.run('site/datos', ej('rack-con-falla')) !== null, 'rack con un sensor en null: usa el otro');

process.exit(fails ? 1 : 0);
