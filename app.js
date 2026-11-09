'use strict';
/*LOGIC-START*/
const Logic = (() => {
  const CATS = ['facu', 'empleo', 'salud', 'ocio', 'comida'];
  const WEIGHTS = ['liviana', 'media', 'pesada'];
  const ENERGIES = ['alta', 'media', 'baja'];
  const KINDS = ['flor', 'arbol'];
  const MEALS = ['desayuno', 'almuerzo', 'merienda', 'cena', 'snack'];
  const ACTIVITY_LEVELS = { poca: 1.2, moderada: 1.375, mucha: 1.55 };
  const MAX_TEXT = 120;
  const MAX_ITEMS = 1500;
  const MAX_GOALS = 60;
  const MAX_STEPS = 30;
  const MAX_WEEKGOALS = 300;
  const ID_RE = /^[a-z0-9]{6,24}$/;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
  const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

  function uid() {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      const buf = new Uint8Array(12); crypto.getRandomValues(buf);
      for (const b of buf) out += chars[b % 36];
    } else { for (let i = 0; i < 12; i++) out += chars[Math.floor(Math.random() * 36)]; }
    return out;
  }
  const pad = n => String(n).padStart(2, '0');
  function dateToStr(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isDateStr(s) {
    if (typeof s !== 'string') return false;
    const m = DATE_RE.exec(s); if (!m) return false;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y < 2000 || y > 2200 || mo < 1 || mo > 12 || d < 1) return false;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
  }
  function parse(s) { const m = DATE_RE.exec(s); return Date.UTC(+m[1], +m[2] - 1, +m[3]); }
  function fromUTC(ms) { const d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function addDays(s, n) { return fromUTC(parse(s) + n * 86400000); }
  function daysBetween(a, b) { return Math.round((parse(b) - parse(a)) / 86400000); }
  function weekday(s) { return new Date(parse(s)).getUTCDay(); }
  function weekStart(s) { const wd = weekday(s); return addDays(s, wd === 0 ? -6 : 1 - wd); }
  function weekDates(s) { const st = weekStart(s); return Array.from({ length: 7 }, (_, i) => addDays(st, i)); }

  function cleanText(s, max) {
    if (typeof s !== 'string') return '';
    // eslint-disable-next-line no-control-regex
    const t = s.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '').trim();
    return Array.from(t).slice(0, max || MAX_TEXT).join('').trim(); // corta por caracteres completos (no parte emojis)
  }
  const arr = v => Array.isArray(v) ? v : [];
  const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const pick = (v, list, def) => (typeof v === 'string' && list.includes(v)) ? v : def;
  const num = v => (typeof v === 'number' && Number.isFinite(v) && v >= 0) ? Math.min(v, 1e14) : 0;
  const inRange = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

  function sanitizeState(raw) {
    const out = { version: 2, updatedAt: 0, name: '', sound: true, showNumbers: true, energy: null, tasks: [], goals: [], weekGoals: [], blooms: [], recent: [], examples: false,
      profile: { age: 0, height: 0, weight: 0, activity: 'poca' }, meals: [], acts: [], water: [] };
    if (!obj(raw)) return out;
    const seen = new Set();
    const fixId = id => { let v = (typeof id === 'string' && ID_RE.test(id) && !seen.has(id)) ? id : uid(); while (seen.has(v)) v = uid(); seen.add(v); return v; };
    out.updatedAt = num(raw.updatedAt);
    out.name = cleanText(raw.name, 30);
    out.sound = raw.sound !== false;
    out.showNumbers = raw.showNumbers !== false;
    out.examples = raw.examples === true;
    if (obj(raw.energy) && isDateStr(raw.energy.date) && ENERGIES.includes(raw.energy.level)) out.energy = { date: raw.energy.date, level: raw.energy.level };
    if (obj(raw.profile)) {
      const p = raw.profile;
      out.profile = {
        age: (inRange(p.age, 10, 100) && Number.isInteger(p.age)) ? p.age : 0,
        height: inRange(p.height, 120, 220) ? Math.round(p.height) : 0,
        weight: inRange(p.weight, 30, 250) ? Math.round(p.weight * 10) / 10 : 0,
        activity: pick(p.activity, Object.keys(ACTIVITY_LEVELS), 'poca'),
      };
    }
    for (const t of arr(raw.tasks).slice(-MAX_ITEMS)) {
      if (!obj(t)) continue;
      const text = cleanText(t.text); if (!text || !isDateStr(t.date)) continue;
      out.tasks.push({ id: fixId(t.id), text, date: t.date, cat: pick(t.cat, CATS, 'ocio'), weight: pick(t.weight, WEIGHTS, 'media'),
        time: (typeof t.time === 'string' && TIME_RE.test(t.time)) ? t.time : '',
        done: t.done === true, doneDate: (t.done === true && isDateStr(t.doneDate)) ? t.doneDate : '',
        carried: t.carried === true, created: num(t.created), ex: t.ex === true });
    }
    for (const g of arr(raw.goals).slice(0, MAX_GOALS)) {
      if (!obj(g)) continue;
      const text = cleanText(g.text); if (!text) continue;
      const steps = [];
      for (const st of arr(g.steps).slice(0, MAX_STEPS)) {
        if (!obj(st)) continue; const sx = cleanText(st.text); if (!sx) continue;
        steps.push({ id: fixId(st.id), text: sx, done: st.done === true });
      }
      out.goals.push({ id: fixId(g.id), text, cat: pick(g.cat, CATS, 'ocio'), due: isDateStr(g.due) ? g.due : '', steps, ex: g.ex === true });
    }
    for (const w of arr(raw.weekGoals).slice(-MAX_WEEKGOALS)) {
      if (!obj(w)) continue; const text = cleanText(w.text); if (!text || !isDateStr(w.week)) continue;
      out.weekGoals.push({ id: fixId(w.id), text, week: weekStart(w.week), done: w.done === true, ex: w.ex === true });
    }
    for (const b of arr(raw.blooms).slice(-MAX_ITEMS)) {
      if (!obj(b) || !isDateStr(b.date)) continue;
      out.blooms.push({ id: fixId(b.id), src: (typeof b.src === 'string' && ID_RE.test(b.src)) ? b.src : '', date: b.date, cat: pick(b.cat, CATS, 'ocio'), kind: pick(b.kind, KINDS, 'flor'), ex: b.ex === true });
    }
    for (const m of arr(raw.meals).slice(-MAX_ITEMS)) {
      if (!obj(m) || !isDateStr(m.date)) continue;
      const name = cleanText(m.name, 60); if (!name) continue;
      if (!(inRange(m.kcal, 0, 3000))) continue;
      out.meals.push({ id: fixId(m.id), date: m.date, name, kcal: Math.round(m.kcal), meal: pick(m.meal, MEALS, 'snack'), ex: m.ex === true });
    }
    for (const a of arr(raw.acts).slice(-MAX_ITEMS)) {
      if (!obj(a) || !isDateStr(a.date)) continue;
      const name = cleanText(a.name, 60); if (!name) continue;
      if (!inRange(a.minutes, 1, 600) || !inRange(a.kcal, 0, 5000)) continue;
      out.acts.push({ id: fixId(a.id), date: a.date, name, minutes: Math.round(a.minutes), kcal: Math.round(a.kcal), ex: a.ex === true });
    }
    const wdates = new Set();
    for (const w of arr(raw.water).slice(-400)) {
      if (!obj(w) || !isDateStr(w.date) || wdates.has(w.date) || typeof w.count !== 'number' || !Number.isFinite(w.count)) continue;
      wdates.add(w.date); out.water.push({ date: w.date, count: Math.max(0, Math.min(20, Math.round(w.count))) });
    }
    out.recent = arr(raw.recent).filter(x => typeof x === 'string' && /^[a-z0-9]{1,8}$/.test(x)).slice(-12);
    return out;
  }

  // Poda lo viejo ya cumplido (más de un año) para que los datos no crezcan sin fin.
  function pruneOld(state, today) {
    const limit = addDays(today, -365);
    const before = state.tasks.length + state.meals.length + state.acts.length + state.blooms.length + state.weekGoals.length;
    state.tasks = state.tasks.filter(t => !(t.done && t.date < limit));
    state.meals = state.meals.filter(m => m.date >= limit);
    state.acts = state.acts.filter(a => a.date >= limit);
    state.blooms = state.blooms.filter(b => b.date >= limit);
    state.weekGoals = state.weekGoals.filter(w => w.week >= limit);
    return before - (state.tasks.length + state.meals.length + state.acts.length + state.blooms.length + state.weekGoals.length);
  }

  function orderTasks(tasks, energy) {
    const rankHigh = { pesada: 0, media: 1, liviana: 2 };
    const rankLow = { liviana: 0, media: 1, pesada: 2 };
    const rank = energy === 'alta' ? rankHigh : energy === 'baja' ? rankLow : null;
    return tasks.map((t, i) => ({ t, i })).sort((a, b) => {
      if (a.t.done !== b.t.done) return a.t.done ? 1 : -1;
      if (!a.t.done && rank) { const d = rank[a.t.weight] - rank[b.t.weight]; if (d) return d; }
      const ta = a.t.time || '99:99', tb = b.t.time || '99:99';
      if (ta !== tb) return ta < tb ? -1 : 1;
      if (a.t.created !== b.t.created) return (a.t.created || 0) - (b.t.created || 0);
      return a.i - b.i;
    }).map(x => x.t);
  }

  function rollover(tasks, today) {
    let moved = 0;
    const out = tasks.map(t => {
      if (!t.done && t.date < today) { moved++; return Object.assign({}, t, { date: today, carried: true }); }
      return t;
    });
    return { tasks: out, moved };
  }

  function goalProgress(goal) {
    const steps = arr(goal && goal.steps);
    const total = steps.length, done = steps.filter(s => s && s.done).length;
    return { done, total, pct: total ? Math.round(done / total * 100) : 0 };
  }

  function pushRecent(recent, id) { return recent.filter(x => x !== id).concat(id).slice(-12); }

  function pickPhrase(phrases, ctx, recent, rand) {
    ctx = ctx || {}; recent = recent || []; rand = rand || Math.random;
    const want = [];
    if (ctx.kind === 'meta') want.push('meta');
    else {
      if (ctx.energy === 'baja' || ctx.energy === 'alta') want.push(ctx.energy);
      if (ctx.cat) want.push(ctx.cat);
      if (ctx.weight === 'pesada') want.push('pesada');
      if (typeof ctx.hour === 'number') { if (ctx.hour < 11) want.push('manana'); if (ctx.hour >= 20) want.push('noche'); }
    }
    const fresh = phrases.filter(p => !recent.includes(p.id));
    const specific = fresh.filter(p => p.tags.some(tg => want.includes(tg)));
    const general = fresh.filter(p => p.tags.includes('any'));
    const r = rand();
    let pool;
    if (specific.length && (r < 0.7 || !general.length)) pool = specific;
    else if (general.length) pool = general;
    else if (fresh.length) pool = fresh;
    else pool = phrases;
    return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
  }

  function weekSummary(state, today) {
    const ws = weekStart(today), we = addDays(ws, 6);
    const byCat = {}; CATS.forEach(c => { byCat[c] = 0; });
    let total = 0, trees = 0;
    for (const b of state.blooms) {
      if (b.date < ws || b.date > we) continue;
      total++; byCat[b.cat]++; if (b.kind === 'arbol') trees++;
    }
    return { total, trees, byCat };
  }

  // ---- Alimentación y movimiento (valores aproximados de referencia) ----
  function kcalBurned(met, kg, minutes) {
    if (!(typeof met === 'number' && Number.isFinite(met) && met > 0)) return 0;
    const w = (typeof kg === 'number' && Number.isFinite(kg) && kg >= 30 && kg <= 250) ? kg : 60;
    const m = (typeof minutes === 'number' && Number.isFinite(minutes)) ? Math.max(0, Math.min(600, minutes)) : 0;
    return Math.round(met * w * m / 60);
  }
  function dailyNeed(p) {
    if (!obj(p) || !(p.age >= 18) || !(p.height > 0) || !(p.weight > 0)) return null;
    const bmr = 10 * p.weight + 6.25 * p.height - 5 * p.age - 161; // Mifflin-St Jeor, mujeres
    return Math.round(bmr * (ACTIVITY_LEVELS[p.activity] || 1.2));
  }
  function dayBalance(state, date) {
    const eaten = state.meals.filter(m => m.date === date).reduce((a, m) => a + m.kcal, 0);
    const burned = state.acts.filter(a => a.date === date).reduce((a, x) => a + x.kcal, 0);
    const personalNeed = dailyNeed(state.profile);
    const need = personalNeed || 2000;
    return { eaten, burned, need, used: need + burned, personal: !!personalNeed };
  }

  const FOODS = [
    ['f01', 'Café con leche', '1 taza (250 ml)', 120], ['f02', 'Mate amargo', '1 termo', 10], ['f03', 'Medialuna de manteca', '1 unidad', 170],
    ['f04', 'Tostada de pan blanco', '1 rebanada', 70], ['f05', 'Tostada integral', '1 rebanada', 65], ['f06', 'Queso crema', '1 cucharada', 40],
    ['f07', 'Mermelada', '1 cucharada', 50], ['f08', 'Dulce de leche', '1 cucharada', 65], ['f09', 'Manteca', '1 cucharadita', 35],
    ['f10', 'Yogur con frutas', '1 pote (190 g)', 160], ['f11', 'Avena', '3 cucharadas (30 g)', 115], ['f12', 'Huevo', '1 unidad', 75],
    ['f13', 'Galletitas de agua', '3 unidades', 60], ['f14', 'Alfajor de chocolate', '1 unidad', 220], ['f15', 'Barra de cereal', '1 unidad', 95],
    ['f16', 'Factura', '1 unidad', 200], ['f17', 'Tostado de jamón y queso', '1 unidad', 350], ['f18', 'Té sin azúcar', '1 taza', 2],
    ['f19', 'Banana', '1 mediana', 105], ['f20', 'Manzana', '1 mediana', 95], ['f21', 'Naranja', '1 mediana', 60],
    ['f22', 'Frutillas', '1 taza', 50], ['f23', 'Mandarina', '1 unidad', 45], ['f24', 'Milanesa de carne al horno', '1 mediana', 300],
    ['f25', 'Milanesa de pollo al horno', '1 mediana', 280], ['f26', 'Empanada de carne al horno', '1 unidad', 280], ['f27', 'Pizza de muzzarella', '1 porción', 280],
    ['f28', 'Fideos con salsa de tomate', '1 plato', 420], ['f29', 'Arroz blanco', '1 taza cocido', 205], ['f30', 'Ensalada mixta', '1 plato', 50],
    ['f31', 'Aceite', '1 cucharada', 120], ['f32', 'Pechuga de pollo a la plancha', '150 g', 250], ['f33', 'Bife de carne', '150 g', 300],
    ['f34', 'Asado', '1 porción (200 g)', 550], ['f35', 'Choripán', '1 unidad', 450], ['f36', 'Hamburguesa casera con pan', '1 unidad', 450],
    ['f37', 'Tarta de verdura', '1 porción', 300], ['f38', 'Puré de papa', '1 taza', 230], ['f39', 'Papas fritas', '1 porción mediana', 370],
    ['f40', 'Guiso de lentejas', '1 plato', 350], ['f41', 'Sopa de verduras', '1 plato', 90], ['f42', 'Sándwich de jamón y queso', '1 unidad', 300],
    ['f43', 'Ñoquis con salsa', '1 plato', 420], ['f44', 'Sushi', '6 piezas', 250], ['f45', 'Wok de verduras con pollo', '1 plato', 350],
    ['f46', 'Verduras al vapor', '1 plato', 80], ['f47', 'Calabaza al horno', '1 porción', 80], ['f48', 'Agua', '1 vaso', 0],
    ['f49', 'Gaseosa común', '1 vaso (350 ml)', 150], ['f50', 'Gaseosa light', '1 vaso', 2], ['f51', 'Cerveza', '1 lata (473 ml)', 200],
    ['f52', 'Vino', '1 copa', 125], ['f53', 'Jugo de naranja exprimido', '1 vaso', 110], ['f54', 'Chocolate', '1 barrita (25 g)', 135],
    ['f55', 'Helado', '1/4 kg', 500], ['f56', 'Frutos secos', '1 puñado (30 g)', 180], ['f57', 'Papas chips', '1 bolsita (40 g)', 210],
    ['f58', 'Pan francés', '1 mignon (50 g)', 135],
  ].map(([id, name, portion, kcal]) => ({ id, name, portion, kcal }));

  const ACTIVITIES = [
    ['a01', 'Caminar', 3.5], ['a02', 'Caminar rápido', 4.3], ['a03', 'Trotar', 7.0], ['a04', 'Correr', 9.8], ['a05', 'Bici de paseo', 4.0],
    ['a06', 'Bici a fondo', 8.0], ['a07', 'Gym con pesas', 5.0], ['a08', 'Funcional', 8.0], ['a09', 'Yoga', 2.5], ['a10', 'Pilates', 3.0],
    ['a11', 'Bailar', 5.0], ['a12', 'Zumba', 6.5], ['a13', 'Natación', 6.0], ['a14', 'Limpiar la casa', 3.3], ['a15', 'Subir escaleras', 4.0],
    ['a16', 'Hockey o fútbol', 7.0], ['a17', 'Patinar', 7.0],
  ].map(([id, name, met]) => ({ id, name, met }));

  const MENU_COMBOS = {
    desayuno: [['f01', 'f04', 'f06', 'f21'], ['f01', 'f05', 'f05', 'f06', 'f20'], ['f10', 'f11', 'f19'], ['f01', 'f12', 'f12', 'f05'], ['f01', 'f03', 'f03', 'f21'],
      ['f02', 'f05', 'f05', 'f08', 'f19'], ['f01', 'f17', 'f20'], ['f10', 'f11', 'f19', 'f56'], ['f01', 'f05', 'f05', 'f12', 'f12', 'f06', 'f19'], ['f01', 'f17', 'f10'], ['f01', 'f17', 'f10', 'f19']],
    almuerzo: [['f32', 'f30', 'f31', 'f29'], ['f25', 'f38', 'f30'], ['f28', 'f30', 'f21'], ['f45', 'f20'], ['f37', 'f30', 'f31', 'f20'], ['f24', 'f38', 'f30', 'f31'],
      ['f33', 'f39', 'f30'], ['f40', 'f58', 'f21'], ['f43', 'f30', 'f31', 'f22'], ['f24', 'f29', 'f30', 'f31', 'f19'], ['f36', 'f30', 'f31', 'f20'], ['f34', 'f30', 'f31', 'f58'],
      ['f28', 'f32', 'f30', 'f31'], ['f24', 'f39', 'f30', 'f31', 'f21'], ['f34', 'f30', 'f31', 'f58', 'f53'], ['f28', 'f24', 'f30', 'f31']],
    merienda: [['f02', 'f13', 'f06', 'f21'], ['f10', 'f19'], ['f01', 'f05', 'f05', 'f07'], ['f02', 'f15', 'f20'], ['f01', 'f16', 'f23'], ['f10', 'f11', 'f22'],
      ['f01', 'f42'], ['f56', 'f20', 'f02'], ['f01', 'f17'], ['f10', 'f11', 'f19', 'f56']],
    cena: [['f41', 'f37'], ['f32', 'f46', 'f31'], ['f26', 'f26', 'f30'], ['f27', 'f27', 'f30'], ['f45', 'f22'], ['f44', 'f30', 'f21'], ['f33', 'f47', 'f30', 'f31'],
      ['f25', 'f46', 'f38'], ['f28', 'f41'], ['f36', 'f30', 'f31'], ['f24', 'f38', 'f30', 'f31'], ['f36', 'f39', 'f30'], ['f33', 'f38', 'f30', 'f31', 'f20']],
  };
  const MENU_SHARE = { desayuno: 0.25, almuerzo: 0.35, merienda: 0.15, cena: 0.25 };
  const foodById = id => FOODS.find(f => f.id === id);

  function proposeMenu(target, rand) {
    rand = rand || Math.random;
    let tg = (typeof target === 'number' && Number.isFinite(target) && target > 0) ? target : 2000;
    tg = Math.max(1500, Math.min(3200, Math.round(tg)));
    const meals = {}; let total = 0;
    for (const meal of Object.keys(MENU_SHARE)) {
      const goal = tg * MENU_SHARE[meal];
      const ranked = MENU_COMBOS[meal].map(c => { const items = c.map(foodById); const sum = items.reduce((a, f) => a + f.kcal, 0); return { items, sum, d: Math.abs(sum - goal) }; })
        .sort((a, b) => a.d - b.d);
      const ch = ranked[Math.min(ranked.length - 1, Math.floor(rand() * 2))];
      meals[meal] = { items: ch.items, kcal: ch.sum }; total += ch.sum;
    }
    return { target: tg, meals, total };
  }

  const PHRASES = [
    ['p01', '¡Tachado! Qué placer, por favor. 💅', ['any']],
    ['p02', 'Una menos. Sos una máquina imparable. 🚀', ['any']],
    ['p03', 'Mirá vos, haciendo las cosas. ¿Quién te para?', ['any']],
    ['p04', '¡Pum! Otra flor en tu jardín. 🌸', ['any']],
    ['p05', 'Le ganaste a la procrastinación. 1 a 0.', ['any']],
    ['p06', 'Hecho es mejor que perfecto. Y vos lo hiciste.', ['any']],
    ['p07', 'Tu yo de mañana te manda un beso por esto.', ['any']],
    ['p08', 'Si esto fuera un videojuego, acabás de subir de nivel. ✨', ['any']],
    ['p09', 'Tranqui, a tu ritmo. Y tu ritmo hoy está buenísimo.', ['any']],
    ['p10', 'Esto merece un bailecito. Dale, nadie te ve. 💃', ['any']],
    ['p11', 'Cada cosa que tachás es una flor. Ya tenés ramo.', ['any']],
    ['p12', 'Con la batería en rojo y lo hiciste igual. Ídola.', ['baja']],
    ['p13', 'Hoy con esto alcanza y sobra. Mimate.', ['baja']],
    ['p14', 'Despacito también se llega. Que lo diga la tortuga. 🐢', ['baja']],
    ['p15', 'Día bajón y sumaste igual. Eso es tener garra.', ['baja']],
    ['p16', 'Tratate como a tu mejor amiga: con mimos y sin retos.', ['baja']],
    ['p17', '¡Estás on fire! 🔥 Aprovechá la ola.', ['alta']],
    ['p18', 'Hoy venís con todo. Que tiemble la lista.', ['alta']],
    ['p19', 'Energía a full y se nota. Brillás.', ['alta']],
    ['p20', 'Un tema menos. El final ya te tiene miedo. 📚', ['facu']],
    ['p21', 'Estudiar con todo lo que hacés... sos una genia y lo sabés.', ['facu']],
    ['p22', 'Cada hora de estudio es un ladrillo de tu título. Ya es casi una pared.', ['facu']],
    ['p23', 'Laburo listo. Ahora a cuidar a la jefa más importante: vos.', ['empleo']],
    ['p24', 'Lo resolviste con estilo. Que te suban el sueldo. 💸', ['empleo']],
    ['p25', 'Profesional y con onda. Combo completo.', ['empleo']],
    ['p26', 'Tu cuerpo te dice gracias. Literal.', ['salud']],
    ['p27', 'Cuidarte es la mejor inversión. Y no paga impuestos.', ['salud']],
    ['p28', 'Salud: check. Sos tu propia prioridad. 💚', ['salud']],
    ['p29', 'Divertirte también es productivo. Lo dice la ciencia (y Bonita).', ['ocio']],
    ['p30', 'Un rato para vos: el mejor plan del día.', ['ocio']],
    ['p31', 'Disfrutar sin culpa: desbloqueado. 🎉', ['ocio']],
    ['p32', 'Comer rico y nutrirte: tu cuerpo aplaude.', ['comida']],
    ['p33', 'Organizar tu comida es quererte. Y hoy te quisiste.', ['comida']],
    ['p34', 'Eso era un monstruo y lo bajaste. Aplaudite. 👏', ['pesada']],
    ['p35', 'Lo más difícil ya pasó. Y lo hiciste vos, campeona.', ['pesada']],
    ['p36', 'Arrancaste ganando. El día ya es tuyo. ☀️', ['manana']],
    ['p37', 'Cerrás el día con un logro. A dormir orgullosa. 🌙', ['noche']],
    ['p38', 'Un pasito más y tu sueño ya te está saludando. 👋', ['meta']],
    ['p39', 'Los sueños se cumplen así: paso a paso y con onda.', ['meta']],
    ['p40', 'Tu árbol creció. Vos también. 🌳', ['meta']],
    ['p41', '¡Más cerca! Ese sueño tiene tu nombre.', ['meta']],
  ].map(([id, text, tags]) => ({ id, text, tags }));

  return { CATS, WEIGHTS, ENERGIES, MEALS, ACTIVITY_LEVELS, MAX_ITEMS, MAX_WEEKGOALS, MAX_TEXT, uid, dateToStr, isDateStr, addDays, daysBetween, weekday, weekStart, weekDates,
    cleanText, sanitizeState, pruneOld, orderTasks, rollover, goalProgress, pickPhrase, pushRecent, weekSummary, kcalBurned, dailyNeed, dayBalance,
    FOODS, ACTIVITIES, MENU_COMBOS, proposeMenu, PHRASES };
})();
/*LOGIC-END*/

(() => {
  const L = Logic;
  const KEY = 'bonita.v2';
  const OWNER_KEY = 'bonita.owner';
  const SKIP_KEY = 'bonita.sinCuenta';
  const LAST_KEY = 'bonita.ultimaSync';
  const SVGNS = 'http://www.w3.org/2000/svg';
  const CAT_LABEL = { facu: 'Facultad', empleo: 'Empleo', salud: 'Salud', ocio: 'Ocio', comida: 'Comida' };
  const WEIGHT_LABEL = { liviana: 'Liviana', media: 'Media', pesada: 'Pesada' };
  const ENERGY_LABEL = { alta: 'A full', media: 'Normal', baja: 'Bajón' };
  const ENERGY_TIP = {
    alta: 'Venís con todo: arrancá por lo pesado y dejá lo liviano para más tarde.',
    media: 'Energía pareja: alterná algo pesado con algo liviano.',
    baja: 'Día bajón: primero lo liviano. Y regalate un rato para vos.',
  };
  const MEAL_LABEL = { desayuno: 'Desayuno', almuerzo: 'Almuerzo', merienda: 'Merienda', cena: 'Cena', snack: 'Snack' };
  const ACT_LABEL = { poca: 'Poca (mucho tiempo sentada)', moderada: 'Moderada (me muevo bastante)', mucha: 'Mucha (entreno o laburo de pie)' };
  const DOW = ['do', 'lu', 'ma', 'mi', 'ju', 'vi', 'sá'];
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const DOW_LONG = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  // ---- Construcción segura del DOM: nunca innerHTML; solo textContent y una lista cerrada de atributos ----
  const SAFE_ATTRS = /^(class|id|type|role|for|value|placeholder|maxlength|min|max|step|aria-[a-z]+|data-[a-z]+|tabindex|autocomplete|inputmode|title|name|disabled|required|minlength)$/;
  const EVENTS = { onclick: 'click', onsubmit: 'submit', oninput: 'input', onchange: 'change', onkeydown: 'keydown' };
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) for (const k of Object.keys(props)) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'text') el.textContent = String(v);
      else if (EVENTS[k]) { if (typeof v === 'function') el.addEventListener(EVENTS[k], v); }
      else if (SAFE_ATTRS.test(k)) el.setAttribute(k, v === true ? '' : String(v));
    }
    appendKids(el, kids);
    return el;
  }
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVGNS, tag);
    if (attrs) for (const k of Object.keys(attrs)) { if (attrs[k] != null && !/^on/i.test(k) && k !== 'href') el.setAttribute(k, String(attrs[k])); }
    appendKids(el, kids);
    return el;
  }
  function appendKids(el, kids) {
    for (const k of kids.flat()) {
      if (k == null || k === false) continue;
      el.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k);
    }
  }

  // ---- Estado ----
  const today = () => L.dateToStr(new Date());
  let state = L.sanitizeState(null), storageOk = true, movedNotice = 0;
  const ui = { tab: 'hoy', date: today(), form: { cat: 'facu', weight: 'media' }, goalForm: { cat: 'facu' }, mealSel: 'desayuno', foodQuery: '', actSel: 'a01',
    menu: null, confirm: null, settings: false, login: false, migrate: false, loginErr: '', loginBusy: false, celebrate: null, toast: null };

  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } }

  function loadLocal() {
    let raw = null, first = false;
    const txt = lsGet(KEY);
    if (txt === null) first = true;
    else if (txt.length < 2000000) { try { raw = JSON.parse(txt); } catch (e) { raw = null; } }
    state = L.sanitizeState(raw);
    return first;
  }
  function applyRollover() { const r = L.rollover(state.tasks, today()); state.tasks = r.tasks; movedNotice += r.moved; }
  function save(changed) {
    if (changed !== false) state.updatedAt = Date.now();
    storageOk = lsSet(KEY, JSON.stringify(state));
    Cloud.schedulePush();
  }
  function commit() { save(); render(); }

  function seedExamples() {
    const d = today(), now = Date.now(), y = L.addDays(d, -1), y2 = L.addDays(d, -2);
    const T = (text, cat, weight, time, done, date) => ({ id: L.uid(), text, date: date || d, cat, weight, time: time || '', done: !!done, doneDate: done ? (date || d) : '', carried: false, created: now, ex: true });
    const t1 = T('Leer el apunte de Estadística', 'facu', 'pesada', '10:00');
    const t2 = T('Responder mails del laburo', 'empleo', 'media', '09:00', true);
    const t3 = T('Turno con la dermatóloga', 'salud', 'liviana', '17:30');
    const t4 = T('Cine con amigas', 'ocio', 'liviana', '21:00');
    const t5 = T('Preparar viandas de la semana', 'comida', 'media', '');
    const t6 = T('Entregar informe mensual', 'empleo', 'pesada', '', true, y);
    const t7 = T('Clase de yoga', 'salud', 'media', '', true, y2);
    state.tasks = [t1, t2, t3, t4, t5, t6, t7];
    state.blooms = [t2, t6, t7].map(t => ({ id: L.uid(), src: t.id, date: t.date, cat: t.cat, kind: 'flor', ex: true }));
    const g = { id: L.uid(), text: 'Aprobar el final de Estadística', cat: 'facu', due: L.addDays(d, 45), ex: true,
      steps: [{ id: L.uid(), text: 'Juntar los apuntes', done: true }, { id: L.uid(), text: 'Hacer los TP viejos', done: false }, { id: L.uid(), text: 'Simulacro de examen', done: false }] };
    state.goals = [g];
    state.blooms.push({ id: L.uid(), src: g.steps[0].id, date: y, cat: 'facu', kind: 'arbol', ex: true });
    state.weekGoals = [{ id: L.uid(), text: 'Dormir 7 horas tres noches', week: L.weekStart(d), done: false, ex: true }];
    state.meals = [{ id: L.uid(), date: d, name: 'Café con leche', kcal: 120, meal: 'desayuno', ex: true }, { id: L.uid(), date: d, name: 'Tostada integral', kcal: 65, meal: 'desayuno', ex: true }];
    state.acts = [{ id: L.uid(), date: d, name: 'Caminar', minutes: 30, kcal: 105, ex: true }];
    state.water = [{ date: d, count: 3 }];
    state.examples = true;
  }
  function clearExamples() {
    ['tasks', 'goals', 'weekGoals', 'blooms', 'meals', 'acts'].forEach(k => { state[k] = state[k].filter(x => !x.ex); });
    state.water = []; state.examples = false; commit();
  }

  // ---- Nube (Supabase): solo se activa si config.js trae una URL https://<proyecto>.supabase.co y la clave pública ----
  const Cloud = (() => {
    const cfg = (typeof window !== 'undefined' && window.BONITA_CONFIG && typeof window.BONITA_CONFIG === 'object') ? window.BONITA_CONFIG : null;
    const urlOk = cfg && typeof cfg.supabaseUrl === 'string' && /^https:\/\/[a-z0-9-]{3,63}\.supabase\.co$/.test(cfg.supabaseUrl);
    // Solo se acepta la clave PÚBLICA. Si alguien pega la secreta (service_role o sb_secret_), la app no arranca la nube.
    function isPublicKey(k) {
      if (typeof k !== 'string' || !/^[A-Za-z0-9._-]{20,1200}$/.test(k)) return false;
      if (k.startsWith('sb_secret_')) return false;
      if (k.startsWith('sb_publishable_')) return true;
      const parts = k.split('.'); if (parts.length !== 3) return false;
      try { const p = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'))); return p && p.role === 'anon'; } catch (e) { return false; }
    }
    const keyOk = cfg && isPublicKey(cfg.supabaseAnonKey);
    if (cfg && cfg.supabaseAnonKey && !keyOk && typeof console !== 'undefined') console.error('Bonita: la clave de config.js no es la clave pública (anon). No se conecta a la nube.');
    const lib = typeof window !== 'undefined' ? window.supabase : null;
    const enabled = !!(urlOk && keyOk && lib && typeof lib.createClient === 'function');
    let client = null, user = null, timer = null, ready = false, status = enabled ? 'Conectando…' : '';
    // flowType 'pkce': rechaza sesiones inyectadas con tokens en la URL (solo acepta links pedidos desde este navegador)
    if (enabled) client = lib.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' } });

    function friendly(err) {
      const m = (err && typeof err.message === 'string') ? err.message.toLowerCase() : '';
      if (m.includes('invalid login')) return 'Mail o contraseña incorrectos.';
      if (m.includes('not confirmed')) return 'Confirmá tu mail: te mandamos un link para activar la cuenta.';
      if (m.includes('already registered') || m.includes('already been registered')) return 'Ese mail ya tiene cuenta. Probá entrar.';
      if (m.includes('password')) return 'La contraseña tiene que tener al menos 8 caracteres.';
      if (m.includes('rate limit') || m.includes('too many')) return 'Muchos intentos seguidos. Esperá unos minutos.';
      return 'No pudimos conectar. Revisá tu internet y probá de nuevo.';
    }
    async function pull() {
      if (!client || !user) return;
      const { data, error } = await client.from('bonita_estado').select('datos, actualizado').eq('user_id', user.id).maybeSingle();
      if (error) { status = 'Sin conexión: se guarda en este celu'; render(); return; }
      const remoteTime = data && data.actualizado ? (Date.parse(data.actualizado) || 0) : 0;
      const lastSync = Number(lsGet(LAST_KEY)) || 0;
      const localChanged = state.updatedAt > lastSync; // ¿hubo cambios en este dispositivo desde la última sincronización?
      if (data && data.datos && (!localChanged || remoteTime > state.updatedAt)) {
        state = L.sanitizeState(data.datos); state.updatedAt = remoteTime;
        applyRollover(); lsSet(KEY, JSON.stringify(state)); lsSet(LAST_KEY, String(remoteTime));
        status = 'Sincronizado';
      } else { await push(); }
      ready = true; render();
    }
    async function push() {
      if (!client || !user) return;
      const body = JSON.stringify(state);
      if (body.length > 1900000) { status = 'Tus datos son muchos: borrá cosas viejas para sincronizar'; render(); return; }
      const stamp = state.updatedAt || Date.now();
      const { error } = await client.from('bonita_estado').upsert({ user_id: user.id, datos: state, actualizado: new Date(stamp).toISOString() }, { onConflict: 'user_id' });
      status = error ? 'Sin conexión: se guarda en este celu' : 'Sincronizado';
      if (!error) lsSet(LAST_KEY, String(stamp));
      if (ui.settings) renderOverlays();
    }
    function schedulePush() { if (!client || !user || !ready) return; clearTimeout(timer); timer = setTimeout(() => { push(); }, 1500); }
    function wipeLocal() { state = L.sanitizeState(null); lsDel(KEY); lsDel(OWNER_KEY); lsDel(LAST_KEY); }
    function hasOwnData(st) {
      return !!(st.name || st.profile.age || st.profile.weight || ['tasks', 'goals', 'weekGoals', 'meals', 'acts'].some(k => st[k].some(x => !x.ex)));
    }
    async function onUser(u) {
      const prev = user; user = u; ready = false;
      if (!u) { // sesión cerrada (acá o en otra pestaña) o vencida: no dejar datos en el dispositivo
        status = 'Sin cuenta';
        if (prev || lsGet(OWNER_KEY)) { wipeLocal(); render(); }
        return;
      }
      const owner = lsGet(OWNER_KEY);
      if (owner && owner !== u.id) wipeLocal(); // otra usuaria en este dispositivo: no mezclar datos
      else if (!owner && hasOwnData(state)) { ui.migrate = true; ui.login = false; renderOverlays(); return; } // datos sin dueña: preguntar antes de subir
      else if (!owner) wipeLocal();
      lsSet(OWNER_KEY, u.id);
      ui.login = false; await pull();
    }
    async function resolveMigration(upload) {
      ui.migrate = false;
      if (!user) return;
      if (upload) { state.updatedAt = Date.now(); lsDel(LAST_KEY); lsSet(KEY, JSON.stringify(state)); }
      else wipeLocal();
      lsSet(OWNER_KEY, user.id);
      renderOverlays(); await pull();
    }
    async function start() {
      if (!client) return;
      client.auth.onAuthStateChange((ev, session) => { const u = session && session.user ? session.user : null; if ((u && (!user || user.id !== u.id)) || (!u && user)) onUser(u); });
      const { data } = await client.auth.getSession();
      const u = data && data.session ? data.session.user : null;
      if (u) await onUser(u);
      else { status = 'Sin cuenta'; if (lsGet(SKIP_KEY) !== '1') { ui.login = true; renderOverlays(); } }
    }
    async function signIn(email, pass) { const { error } = await client.auth.signInWithPassword({ email, password: pass }); return error ? friendly(error) : ''; }
    async function signUp(email, pass) {
      const { data, error } = await client.auth.signUp({ email, password: pass, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) return friendly(error);
      return data && data.session ? '' : 'Te mandamos un mail para confirmar la cuenta. Abrilo y volvé a entrar.';
    }
    async function signOut() {
      clearTimeout(timer); if (ready) await push();
      await client.auth.signOut();
      user = null; ready = false; wipeLocal(); render();
    }
    async function deleteAccount() {
      const { error } = await client.rpc('borrar_mi_cuenta');
      if (error) return friendly(error);
      await client.auth.signOut(); user = null; ready = false; wipeLocal(); render(); return '';
    }
    return { enabled, start, schedulePush, signIn, signUp, signOut, deleteAccount, resolveMigration, get user() { return user; }, get status() { return status; } };
  })();

  // ---- Sonido suave (solo después de un toque) ----
  let audioCtx = null;
  function chime() {
    if (!state.sound) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = audioCtx.currentTime;
      [659.25, 830.61, 987.77].forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t0 + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.11, t0 + i * 0.09 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.09 + 0.45);
        o.connect(g).connect(audioCtx.destination); o.start(t0 + i * 0.09); o.stop(t0 + i * 0.09 + 0.5);
      });
    } catch (e) { /* sin sonido */ }
  }

  // ---- Dibujos ----
  function hash(str) { let x = 2166136261; for (let i = 0; i < str.length; i++) { x ^= str.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  function flower(x, y, scale, cat, isNew) {
    const inner = s('g', { class: (isNew ? 'pop ' : '') + 'cat-' + cat });
    const sway = s('g', { class: 'sway' });
    sway.appendChild(s('path', { class: 'stem', d: 'M0 0 Q 2 -10 0 -20' }));
    sway.appendChild(s('ellipse', { class: 'leaf', cx: 4, cy: -8, rx: 4, ry: 1.8, transform: 'rotate(-30 4 -8)' }));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      sway.appendChild(s('circle', { class: 'petal', cx: (Math.cos(a) * 4.6).toFixed(2), cy: (-23 + Math.sin(a) * 4.6).toFixed(2), r: 3.9 }));
    }
    sway.appendChild(s('circle', { class: 'center', cx: 0, cy: -23, r: 2.6 }));
    inner.appendChild(sway);
    return s('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(2)})` }, inner);
  }
  function tree(x, y, scale, cat) {
    const inner = s('g', { class: 'cat-' + cat });
    inner.appendChild(s('rect', { class: 'trunk', x: -2.5, y: -22, width: 5, height: 22, rx: 2 }));
    inner.appendChild(s('circle', { class: 'crown', cx: 0, cy: -30, r: 13 }));
    inner.appendChild(s('circle', { class: 'crown', cx: -9, cy: -23, r: 8 }));
    inner.appendChild(s('circle', { class: 'crown', cx: 9, cy: -23, r: 8 }));
    return s('g', { transform: `translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${scale.toFixed(2)})` }, inner);
  }
  function gardenSVG(blooms, goals, height, newId, label) {
    const W = 360, H = height;
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': label });
    svg.appendChild(s('circle', { class: 'sunball', cx: W - 44, cy: 28, r: 15 }));
    svg.appendChild(s('path', { class: 'hill-back', d: `M0 ${H * .55} Q ${W * .3} ${H * .38} ${W * .6} ${H * .52} T ${W} ${H * .48} V ${H} H 0 Z` }));
    const treesG = s('g'); svg.appendChild(treesG);
    svg.appendChild(s('path', { class: 'hill-front', d: `M0 ${H * .72} Q ${W * .25} ${H * .62} ${W * .5} ${H * .7} T ${W} ${H * .66} V ${H} H 0 Z` }));
    const gs = (goals || []).filter(g => L.goalProgress(g).done > 0);
    gs.forEach((g, i) => {
      const p = L.goalProgress(g);
      const x = 30 + ((i + 0.5) / Math.max(gs.length, 1)) * (W - 60);
      treesG.appendChild(tree(x, H * .54, 0.55 + p.pct / 100 * 0.75, g.cat));
    });
    const fl = blooms.filter(b => b.kind === 'flor').map(b => {
      const hv = hash(b.id);
      return { b, x: 12 + (hv % 1000) / 1000 * (W - 24), y: H * .74 + ((hv >>> 10) % 1000) / 1000 * (H * .22) };
    }).sort((a, z) => a.y - z.y);
    for (const f of fl) svg.appendChild(flower(f.x, f.y, 0.9 + (f.y / H) * 0.6, f.b.cat, f.b.id === newId));
    return svg;
  }
  function battery(level) {
    const w = { alta: 26, media: 16, baja: 7 }[level];
    return s('svg', { class: 'battery', viewBox: '0 0 40 22', 'aria-hidden': 'true' },
      s('rect', { class: 'shell', x: 1, y: 1, width: 33, height: 20, rx: 5 }), s('rect', { class: 'tip', x: 35, y: 7, width: 4, height: 8, rx: 1.5 }),
      s('rect', { class: 'lvl-' + level, x: 4.5, y: 4.5, width: w, height: 13, rx: 2.5 }));
  }
  function ring(pct, size, stroke, cls) {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    return s('svg', { class: cls || 'ring', viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true' },
      s('circle', { class: 'bgc', cx: size / 2, cy: size / 2, r }),
      s('circle', { class: 'fgc', cx: size / 2, cy: size / 2, r, 'stroke-dasharray': `${(c * pct / 100).toFixed(2)} ${c.toFixed(2)}`, transform: `rotate(-90 ${size / 2} ${size / 2})` }));
  }
  const checkIcon = () => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: 'M5 12.5l4.5 4.5L19 7.5' }));
  const chev = dir => s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: dir < 0 ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7' }));
  function glassIcon(full) {
    return s('svg', { viewBox: '0 0 36 44', 'aria-hidden': 'true' },
      full ? s('path', { class: 'wt', d: 'M8.6 14 H27.4 L25.5 38 Q25.3 40 23.3 40 H12.7 Q10.7 40 10.5 38 Z' }) : null,
      s('path', { class: 'gl', d: 'M6 5 H30 L26.6 38.3 Q26.3 41 23.6 41 H12.4 Q9.7 41 9.4 38.3 Z' }));
  }
  function bar(pct, cls) { const f = h('div', { class: 'bar-fill ' + cls }); f.style.width = Math.max(0, Math.min(100, pct)).toFixed(0) + '%'; return h('div', { class: 'bar-track' }, f); }

  function prettyDate(d) { const p = d.split('-'); return DOW_LONG[L.weekday(d)] + ' ' + (+p[2]) + ' de ' + MONTHS[+p[1] - 1]; }
  function relDay(d) {
    const t = today();
    if (d === t) return 'Hoy'; if (d === L.addDays(t, 1)) return 'Mañana'; if (d === L.addDays(t, -1)) return 'Ayer';
    return prettyDate(d);
  }

  // ---- Acciones ----
  function addBloom(src, cat, kind) {
    const b = { id: L.uid(), src, date: today(), cat, kind, ex: false };
    state.blooms.push(b);
    if (state.blooms.length > L.MAX_ITEMS) state.blooms = state.blooms.slice(-L.MAX_ITEMS);
    return b;
  }
  function removeBlooms(src) { state.blooms = state.blooms.filter(b => b.src !== src); }
  function celebrate(ctx, bloom) {
    const ph = L.pickPhrase(L.PHRASES, Object.assign({ hour: new Date().getHours() }, ctx), state.recent);
    state.recent = L.pushRecent(state.recent, ph.id);
    ui.celebrate = { phrase: ph.text, cat: ctx.cat || 'ocio', kind: ctx.kind || 'flor', bloomId: bloom.id };
    chime();
  }
  const todayEnergy = () => (state.energy && state.energy.date === today()) ? state.energy.level : null;
  function toggleTask(t) {
    t.done = !t.done;
    if (t.done) { t.doneDate = today(); const b = addBloom(t.id, t.cat, 'flor'); celebrate({ energy: todayEnergy(), cat: t.cat, weight: t.weight }, b); }
    else { t.doneDate = ''; removeBlooms(t.id); }
    commit();
  }
  function deleteItem(listName, item, label) {
    const list = state[listName]; const idx = list.indexOf(item); if (idx < 0) return;
    const removed = state.blooms.filter(b => b.src === item.id);
    list.splice(idx, 1); removeBlooms(item.id);
    showToast(label, () => { state[listName].splice(Math.min(idx, state[listName].length), 0, item); state.blooms.push(...removed); commit(); });
    commit();
  }
  function moveTomorrow(t) { t.date = L.addDays(t.date < today() ? today() : t.date, 1); t.carried = false; showToast('Pasada para el día siguiente. Sin culpa. 😌'); commit(); }
  function addTask(text, date, cat, weight, time) {
    const clean = L.cleanText(text); if (!clean) return false;
    if (state.tasks.length >= L.MAX_ITEMS) {
      const oldest = state.tasks.filter(x => x.done).sort((a, b) => a.date < b.date ? -1 : 1)[0];
      if (!oldest) { showToast('Tenés demasiadas tareas pendientes. Borrá algunas para sumar nuevas.'); return false; }
      state.tasks.splice(state.tasks.indexOf(oldest), 1);
    }
    state.tasks.push({ id: L.uid(), text: clean, date, cat: L.CATS.includes(cat) ? cat : 'ocio', weight: L.WEIGHTS.includes(weight) ? weight : 'media',
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time || '') ? time : '', done: false, doneDate: '', carried: false, created: Date.now(), ex: false });
    commit(); return true;
  }
  function addMeal(name, kcal, meal) {
    const n = L.cleanText(name, 60); const k = Math.round(Number(kcal));
    if (!n || !Number.isFinite(k) || k < 0 || k > 3000) return false;
    state.meals.push({ id: L.uid(), date: today(), name: n, kcal: k, meal: L.MEALS.includes(meal) ? meal : 'snack', ex: false });
    if (state.meals.length > L.MAX_ITEMS) state.meals = state.meals.slice(-L.MAX_ITEMS);
    return true;
  }
  function groupItems(items) { const out = []; for (const f of items) { const g = out.find(x => x.f.id === f.id); if (g) g.n++; else out.push({ f, n: 1 }); } return out; }
  function waterOf(d) { return state.water.find(w => w.date === d); }

  let toastTimer = null;
  function showToast(text, undo) {
    ui.toast = { text, undo }; clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast = null; renderOverlays(); }, 5000);
    renderOverlays();
  }

  // ---- Vistas ----
  function catChooser(current, onPick, idp) {
    return h('div', { class: 'seg', role: 'group', 'aria-label': 'Área' },
      L.CATS.map(c => h('button', { type: 'button', class: 'seg-btn ' + c, id: idp + '-' + c, 'aria-pressed': String(current === c), onclick: () => onPick(c) }, h('span', { class: 'dot ' + c }), CAT_LABEL[c])));
  }
  function keepValues(ids, fn) {
    const vals = ids.map(id => { const el = document.getElementById(id); return el ? el.value : ''; });
    fn();
    ids.forEach((id, i) => { const el = document.getElementById(id); if (el) el.value = vals[i]; });
  }

  function viewHoy() {
    const t = today(), d = ui.date, isToday = d === t;
    const out = [];
    if (state.examples) out.push(h('div', { class: 'note comida' }, h('p', { text: 'Estás viendo ejemplos para que pruebes. Tachá una tarea y mirá la magia. ✨' }),
      h('button', { class: 'btn small', type: 'button', id: 'clear-examples', onclick: clearExamples, text: 'Borrar ejemplos' })));
    if (movedNotice && isToday) out.push(h('div', { class: 'note facu' }, h('p', { text: movedNotice === 1 ? 'Pasamos 1 pendiente de días anteriores a hoy. Cero drama.' : `Pasamos ${movedNotice} pendientes de días anteriores a hoy. Cero drama.` }),
      h('button', { class: 'btn ghost small', type: 'button', onclick: () => { movedNotice = 0; render(); }, text: 'Dale' })));
    if (Cloud.user && /muchos/.test(Cloud.status)) out.push(h('div', { class: 'note ocio' }, h('p', { text: Cloud.status })));
    if (!storageOk) out.push(h('div', { class: 'note ocio' }, h('p', { text: 'Este navegador no deja guardar datos. Lo que cargues se pierde al cerrar.' })));

    if (isToday) {
      const en = todayEnergy();
      if (!en) {
        out.push(h('section', { class: 'card', 'aria-labelledby': 'energy-h' }, h('p', { class: 'eyebrow', text: 'Check-in del día' }),
          h('h2', { id: 'energy-h', text: '¿Cómo viene tu batería hoy?' }),
          h('div', { class: 'energy-opts' }, L.ENERGIES.map(lv => h('button', { type: 'button', class: 'energy-btn ' + lv, id: 'energy-' + lv, onclick: () => { state.energy = { date: today(), level: lv }; commit(); } }, battery(lv), ENERGY_LABEL[lv]))),
          h('p', { class: 'small-note', text: 'Según lo que elijas, te ordenamos el día.' })));
      } else {
        const card = h('section', { class: 'card', 'aria-label': 'Tu energía' },
          h('div', { class: 'energy-set' }, battery(en),
            h('p', { class: 'spacer' }, h('strong', { text: ENERGY_LABEL[en] + '. ' }), ENERGY_TIP[en]),
            h('button', { type: 'button', class: 'link-btn', id: 'energy-change', onclick: () => { state.energy = null; commit(); }, text: 'Cambiar' })));
        if (en === 'baja' && !state.tasks.some(x => x.date === t && x.cat === 'ocio' && !x.done)) {
          card.appendChild(h('div', null, h('button', { type: 'button', class: 'btn ocio', id: 'add-me-time', onclick: () => addTask('Un rato para mí: 20 minutos', t, 'ocio', 'liviana', ''), text: '+ Sumar un rato para mí' })));
        }
        out.push(card);
      }
    }
    const dayBlooms = state.blooms.filter(b => b.date === d && b.kind === 'flor');
    const gw = h('div', { class: 'garden-wrap' }, gardenSVG(dayBlooms, [], 110, ui.celebrate ? ui.celebrate.bloomId : null, dayBlooms.length ? `Jardín del día con ${dayBlooms.length} flores` : 'Jardín del día, todavía sin flores'));
    if (!dayBlooms.length) gw.appendChild(h('p', { class: 'garden-empty', text: isToday ? 'Tachá algo y aparece tu primera flor del día.' : 'Este día no tiene flores.' }));
    out.push(gw);

    const dayTasks = state.tasks.filter(x => x.date === d);
    const ordered = L.orderTasks(dayTasks, isToday ? todayEnergy() : null);
    const doneN = dayTasks.filter(x => x.done).length;
    out.push(h('section', { class: 'card', 'aria-labelledby': 'day-h' },
      h('div', { class: 'datebar' },
        h('button', { class: 'round-btn', type: 'button', 'aria-label': 'Día anterior', id: 'prev-day', onclick: () => { ui.date = L.addDays(d, -1); render(); } }, chev(-1)),
        h('h2', { id: 'day-h', text: relDay(d) }),
        h('button', { class: 'round-btn', type: 'button', 'aria-label': 'Día siguiente', id: 'next-day', onclick: () => { ui.date = L.addDays(d, 1); render(); } }, chev(1))),
      h('p', { class: 'muted', text: dayTasks.length ? `${doneN} de ${dayTasks.length} hechas` + (isToday ? '' : ' · ' + prettyDate(d)) : prettyDate(d) }),
      dayTasks.length ? h('ul', { class: 'tasks' }, ordered.map(taskItem)) : h('p', { class: 'empty', text: 'Nada planeado. Sumá algo abajo o disfrutá el día libre. 🌈' }),
      !isToday ? h('button', { type: 'button', class: 'link-btn', onclick: () => { ui.date = t; render(); }, text: 'Volver a hoy' }) : null));
    out.push(addTaskForm(d));
    return out;
  }

  function taskItem(t) {
    const pending = !t.done;
    return h('li', { class: 'task' + (t.done ? ' done' : '') },
      h('button', { type: 'button', class: 'check c-' + t.cat, role: 'checkbox', 'aria-checked': String(t.done), 'aria-label': (t.done ? 'Desmarcar: ' : 'Marcar como hecha: ') + t.text, onclick: () => toggleTask(t) }, checkIcon()),
      h('div', { class: 'task-body' }, h('span', { class: 'task-text', text: t.text }),
        h('div', { class: 'meta' }, h('span', { class: 'chip ' + t.cat }, h('span', { class: 'dot ' + t.cat }), CAT_LABEL[t.cat]),
          h('span', { class: 'weight-' + t.weight, text: WEIGHT_LABEL[t.weight] }),
          t.time ? h('span', { text: '· ' + t.time }) : null,
          t.carried && pending ? h('span', { text: '· viene de antes' }) : null,
          t.ex ? h('span', { text: '· ejemplo' }) : null)),
      h('div', { class: 'task-actions' },
        pending ? h('button', { type: 'button', class: 'act-icon', title: 'Pasar a mañana', 'aria-label': 'Pasar al día siguiente: ' + t.text, onclick: () => moveTomorrow(t) }, s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: 'M5 12h12M13 6l6 6-6 6' }))) : null,
        h('button', { type: 'button', class: 'act-icon', title: 'Borrar', 'aria-label': 'Borrar: ' + t.text, onclick: () => deleteItem('tasks', t, 'Tarea borrada') }, s('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' }, s('path', { d: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13' })))));
  }

  function addTaskForm(d) {
    const f = ui.form;
    const input = h('input', { class: 'field', id: 'task-text', type: 'text', maxlength: L.MAX_TEXT, placeholder: '¿Qué querés hacer?', autocomplete: 'off', 'aria-label': 'Nueva tarea' });
    const time = h('input', { class: 'field', id: 'task-time', type: 'time', 'aria-label': 'Hora (opcional)' });
    const rel = relDay(d);
    return h('form', { class: 'card add-form', id: 'add-task-form', autocomplete: 'off', onsubmit: e => {
      e.preventDefault();
      if (addTask(input.value, d, f.cat, f.weight, time.value)) { const el = document.getElementById('task-text'); if (el) el.focus(); } else input.focus();
    } },
      h('h2', { text: 'Sumar a ' + (/^(Hoy|Mañana|Ayer)$/.test(rel) ? rel.toLowerCase() : 'el ' + rel.toLowerCase()) }),
      input,
      h('span', { class: 'lbl', text: 'Área' }),
      catChooser(f.cat, c => { f.cat = c; keepValues(['task-text', 'task-time'], render); }, 'cat'),
      h('span', { class: 'lbl', text: '¿Cuánta energía te pide?' }),
      h('div', { class: 'seg', role: 'group', 'aria-label': 'Energía que pide' }, L.WEIGHTS.map(w => h('button', { type: 'button', class: 'seg-btn', id: 'w-' + w, 'aria-pressed': String(f.weight === w), onclick: () => { f.weight = w; keepValues(['task-text', 'task-time'], render); } }, WEIGHT_LABEL[w]))),
      h('div', { class: 'form-row' }, time, h('button', { class: 'btn ' + f.cat, type: 'submit', id: 'add-task-btn', text: '+ Agregar' })));
  }

  function viewSemana() {
    const t = today(), dates = L.weekDates(ui.date), ws = dates[0];
    const days = h('div', { class: 'week' }, dates.map(d => {
      const ts = state.tasks.filter(x => x.date === d), dn = ts.filter(x => x.done).length;
      return h('button', { type: 'button', class: 'day' + (d === t ? ' today' : ''), 'aria-label': `${prettyDate(d)}: ${dn} de ${ts.length} hechas`, onclick: () => { ui.date = d; switchTab('hoy'); } },
        h('span', { text: DOW[L.weekday(d)] }), h('b', { text: String(+d.slice(8)) }), ring(ts.length ? dn / ts.length * 100 : 0, 28, 4));
    }));
    const sum = L.weekSummary(state, ws);
    const max = Math.max(1, ...L.CATS.map(c => sum.byCat[c]));
    const wg = state.weekGoals.filter(w => w.week === ws);
    const wInput = h('input', { class: 'field', id: 'wgoal-text', type: 'text', maxlength: L.MAX_TEXT, placeholder: 'Ej.: ir dos veces al gym', 'aria-label': 'Nueva meta de la semana' });
    return [
      h('section', { class: 'card', 'aria-labelledby': 'wk-h' },
        h('div', { class: 'datebar' },
          h('button', { class: 'round-btn', type: 'button', 'aria-label': 'Semana anterior', onclick: () => { ui.date = L.addDays(ws, -7); render(); } }, chev(-1)),
          h('h2', { id: 'wk-h', text: ws === L.weekStart(t) ? 'Esta semana' : 'Semana del ' + (+ws.slice(8)) + ' de ' + MONTHS[+ws.slice(5, 7) - 1] }),
          h('button', { class: 'round-btn', type: 'button', 'aria-label': 'Semana siguiente', onclick: () => { ui.date = L.addDays(ws, 7); render(); } }, chev(1))),
        days, h('p', { class: 'small-note', text: 'Tocá un día para ver y planear sus tareas.' })),
      h('section', { class: 'card', 'aria-labelledby': 'wg-h' }, h('p', { class: 'eyebrow', text: 'Corto plazo' }), h('h2', { id: 'wg-h', text: 'Metas de la semana' }),
        wg.length ? h('ul', { class: 'steps' }, wg.map(w => h('li', { class: 'step' + (w.done ? ' done' : '') },
          h('button', { type: 'button', class: 'check c-empleo', role: 'checkbox', 'aria-checked': String(w.done), 'aria-label': w.text, onclick: () => {
            w.done = !w.done;
            if (w.done) { const b = addBloom(w.id, 'empleo', 'flor'); celebrate({ kind: 'meta', cat: 'empleo' }, b); } else removeBlooms(w.id);
            commit();
          } }, checkIcon()),
          h('span', { class: 'spacer', text: w.text + (w.ex ? ' (ejemplo)' : '') }),
          h('button', { type: 'button', class: 'tiny-btn', 'aria-label': 'Borrar meta: ' + w.text, onclick: () => deleteItem('weekGoals', w, 'Meta borrada'), text: 'Borrar' })))) :
          h('p', { class: 'empty', text: 'Dos o tres metas chicas alcanzan para una semana bomba.' }),
        h('form', { class: 'form-row', onsubmit: e => { e.preventDefault(); const txt = L.cleanText(wInput.value); if (!txt) return; if (state.weekGoals.length >= L.MAX_WEEKGOALS) state.weekGoals.shift(); state.weekGoals.push({ id: L.uid(), text: txt, week: ws, done: false, ex: false }); commit(); const el = document.getElementById('wgoal-text'); if (el) el.focus(); } },
          wInput, h('button', { class: 'btn empleo', type: 'submit', text: '+ Sumar' }))),
      h('section', { class: 'card', 'aria-labelledby': 'sum-h' }, h('p', { class: 'eyebrow', text: 'Tu semana en flores' }),
        h('h2', { id: 'sum-h', text: sum.total === 1 ? '1 logro esta semana' : `${sum.total} logros esta semana` }),
        h('div', { class: 'bars' }, L.CATS.map(c => h('div', { class: 'bar-row' }, h('span', null, h('span', { class: 'dot ' + c }), ' ' + CAT_LABEL[c]), bar(sum.byCat[c] / max * 100, c), h('span', { class: 'num', text: String(sum.byCat[c]) }))))),
    ];
  }

  function viewComida() {
    const t = today();
    const bal = L.dayBalance(state, t);
    const minor = state.profile.age > 0 && state.profile.age < 18;
    const nums = state.showNumbers && !minor;
    const scale = Math.max(bal.used, bal.eaten, 1);
    const hr = new Date().getHours();
    let msg;
    if (bal.eaten === 0) msg = 'Todavía no anotaste comidas hoy. Cuando quieras, sumá lo que vayas comiendo.';
    else if (hr >= 19 && bal.eaten < bal.used * 0.5) msg = 'Parece que hoy comiste poco para todo lo que hiciste. Tu cuerpo necesita energía: ¿una merienda o cena rica?';
    else msg = 'Comé rico, variado y escuchá a tu cuerpo. 💛';

    const water = waterOf(t); const wc = water ? water.count : 0;
    const glasses = h('div', { class: 'water', role: 'group', 'aria-label': `Agua: ${wc} de 8 vasos` }, Array.from({ length: 8 }, (_, i) => h('button', { type: 'button', class: 'glass', 'aria-label': `Vaso ${i + 1}${i < wc ? ', tomado' : ''}`, onclick: () => {
      const prev = wc; const next = i < wc ? i : i + 1;
      let w = waterOf(t); if (!w) { w = { date: t, count: 0 }; state.water.push(w); if (state.water.length > 400) state.water = state.water.slice(-400); }
      w.count = next;
      const src = 'agua' + t.replace(/-/g, '');
      if (prev < 8 && next >= 8) { const b = addBloom(src, 'salud', 'flor'); celebrate({ cat: 'salud' }, b); }
      if (prev >= 8 && next < 8) removeBlooms(src);
      commit();
    } }, glassIcon(i < wc))));

    const q = ui.foodQuery.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const results = (q ? L.FOODS.filter(f => f.name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(q)) : L.FOODS.slice(0, 8)).slice(0, 10);
    const search = h('input', { class: 'field', id: 'food-q', type: 'search', maxlength: 40, placeholder: 'Buscá: medialuna, milanesa, mate…', autocomplete: 'off', 'aria-label': 'Buscar comida', value: ui.foodQuery,
      oninput: e => { ui.foodQuery = L.cleanText(e.target.value, 40); const pos = e.target.selectionStart; render(); const el = document.getElementById('food-q'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (err) { /* nada */ } } } });
    const customName = h('input', { class: 'field', id: 'custom-name', type: 'text', maxlength: 60, placeholder: 'Otra comida', 'aria-label': 'Nombre de otra comida' });
    const customKcal = h('input', { class: 'field', id: 'custom-kcal', type: 'number', min: 0, max: 3000, step: 1, inputmode: 'numeric', placeholder: 'kcal aprox.', 'aria-label': 'Calorías aproximadas' });

    const todays = state.meals.filter(m => m.date === t);
    const byMeal = L.MEALS.map(m => ({ m, items: todays.filter(x => x.meal === m) })).filter(g => g.items.length);

    const acts = state.acts.filter(a => a.date === t);
    const actSel = L.ACTIVITIES.find(a => a.id === ui.actSel) || L.ACTIVITIES[0];
    const minutes = h('input', { class: 'field', id: 'act-min', type: 'number', min: 1, max: 600, step: 1, inputmode: 'numeric', placeholder: 'Minutos', 'aria-label': 'Minutos de actividad' });
    const kg = state.profile.weight || 60;

    const menu = minor ? null : ui.menu;
    return [
      minor ? h('section', { class: 'card' }, h('p', { class: 'eyebrow', text: 'Tu energía de hoy' }), h('h2', { text: 'Comé rico y variado 💛' }),
        h('p', { class: 'muted', text: 'A tu edad la energía que necesitás depende de cómo estás creciendo, así que no hacemos cuentas de calorías. Si tenés dudas, lo mejor es hablarlo con una profesional de la salud.' })) :
      h('section', { class: 'card', 'aria-labelledby': 'bal-h' }, h('p', { class: 'eyebrow', text: 'Tu energía de hoy' }), h('h2', { id: 'bal-h', text: 'Lo que comiste y lo que usó tu cuerpo' }),
        h('div', { class: 'balance' },
          h('div', { class: 'bal-row' }, h('span', { text: 'Lo que comiste' }), h('span', { class: 'num', text: nums ? bal.eaten + ' kcal' : '' }), bar(bal.eaten / scale * 100, 'comida')),
          h('div', { class: 'bal-row' }, h('span', { text: 'Lo que usó tu cuerpo' }), h('span', { class: 'num', text: nums ? '≈ ' + bal.used + ' kcal' : '' }), bar(bal.used / scale * 100, 'salud')),
          nums && bal.burned ? h('p', { class: 'small-note', text: `Incluye ≈ ${bal.burned} kcal de movimiento.` }) : null),
        h('div', { class: 'note salud' }, h('p', { text: msg })),
        h('p', { class: 'small-note', text: bal.personal ? 'Calculado con tu perfil. Todo es aproximado.' : 'Usamos una referencia general de 2000 kcal. Completá tu perfil en Ajustes para que sea tuya.' })),

      h('section', { class: 'card', 'aria-labelledby': 'water-h' }, h('p', { class: 'eyebrow', text: 'Salud' }), h('h2', { id: 'water-h', text: wc >= 8 ? '¡8 vasos! Hidratadísima. 💧' : `Agua: ${wc} de 8 vasos` }), glasses),

      h('section', { class: 'card', 'aria-labelledby': 'food-h' }, h('p', { class: 'eyebrow', text: 'Alimentación' }), h('h2', { id: 'food-h', text: 'Anotá lo que comiste' }),
        h('div', { class: 'seg', role: 'group', 'aria-label': 'Comida del día' }, L.MEALS.map(m => h('button', { type: 'button', class: 'seg-btn comida', 'aria-pressed': String(ui.mealSel === m), onclick: () => { ui.mealSel = m; keepValues(['custom-name', 'custom-kcal'], render); } }, MEAL_LABEL[m]))),
        search,
        h('div', { class: 'results' }, results.length ? results.map(f => h('button', { type: 'button', class: 'food-pick', 'aria-label': `Agregar ${f.name}, ${f.portion}`, onclick: () => { if (addMeal(f.name, f.kcal, ui.mealSel)) { commit(); showToast(`Anotaste: ${f.name} (${MEAL_LABEL[ui.mealSel].toLowerCase()})`); } } },
          h('span', { text: f.name }), h('small', { text: f.portion + (nums ? ' · ' + f.kcal + ' kcal' : '') }))) : h('p', { class: 'small-note', text: 'No está en la lista. Cargala abajo.' })),
        h('form', { class: 'form-row', onsubmit: e => { e.preventDefault(); if (addMeal(customName.value, customKcal.value === '' ? NaN : Number(customKcal.value), ui.mealSel)) commit(); else showToast('Poné un nombre y las calorías (entre 0 y 3000).'); } },
          customName, customKcal, h('button', { class: 'btn comida', type: 'submit', text: '+ Anotar' })),
        byMeal.length ? byMeal.map(g => h('div', null, h('p', { class: 'lbl', text: MEAL_LABEL[g.m] + (nums ? ' · ' + g.items.reduce((a, x) => a + x.kcal, 0) + ' kcal' : '') }),
          h('ul', { class: 'food-list' }, g.items.map(m => h('li', { class: 'food-item' }, h('span', { class: 'spacer', text: m.name + (m.ex ? ' (ejemplo)' : '') }), nums ? h('span', { class: 'num', text: m.kcal + ' kcal' }) : null,
            h('button', { type: 'button', class: 'tiny-btn', 'aria-label': 'Quitar ' + m.name, onclick: () => deleteItem('meals', m, 'Comida quitada'), text: 'Quitar' })))))) :
          h('p', { class: 'empty', text: 'Hoy todavía no anotaste comidas.' })),

      minor ? null : h('section', { class: 'card', 'aria-labelledby': 'menu-h' }, h('p', { class: 'eyebrow', text: 'Idea rica' }), h('h2', { id: 'menu-h', text: 'Proponeme un menú' }),
        h('p', { class: 'muted', text: 'Un día de comidas caseras y variadas, pensado para la energía que usás.' }),
        h('div', { class: 'row' }, h('button', { type: 'button', class: 'btn comida', id: 'menu-btn', onclick: () => { ui.menu = L.proposeMenu(bal.need); render(); }, text: menu ? '🎲 Otra opción' : '✨ Proponeme' })),
        menu ? h('div', { class: 'stack' }, Object.keys(menu.meals).map(mk => h('div', { class: 'menu-meal' }, h('div', { class: 'row' }, h('h4', { class: 'spacer', text: MEAL_LABEL[mk] + (nums ? ' · ' + menu.meals[mk].kcal + ' kcal' : '') }),
          h('button', { type: 'button', class: 'btn small comida', onclick: () => { menu.meals[mk].items.forEach(f => addMeal(f.name, f.kcal, mk)); commit(); showToast(MEAL_LABEL[mk] + ' anotado. ¡Buen provecho!'); }, text: '¡Lo comí!' })),
          h('ul', null, groupItems(menu.meals[mk].items).map(g => h('li', { text: (g.n > 1 ? g.n + ' × ' : '') + g.f.name + ' (' + g.f.portion + ')' }))))),
          nums ? h('p', { class: 'small-note', text: `Total ≈ ${menu.total} kcal.` }) : null) : null),

      h('section', { class: 'card', 'aria-labelledby': 'act-h' }, h('p', { class: 'eyebrow', text: 'Movimiento' }), h('h2', { id: 'act-h', text: 'Lo que gastaste moviéndote' }),
        h('div', { class: 'results' }, L.ACTIVITIES.map(a => h('button', { type: 'button', class: 'food-pick act-pick', 'aria-pressed': String(ui.actSel === a.id), onclick: () => { ui.actSel = a.id; keepValues(['act-min'], render); } }, h('span', { text: a.name })))),
        h('form', { class: 'form-row', onsubmit: e => {
          e.preventDefault(); const m = Math.round(Number(minutes.value));
          if (!Number.isFinite(m) || m < 1 || m > 600) { showToast('Poné entre 1 y 600 minutos.'); return; }
          const kc = L.kcalBurned(actSel.met, kg, m);
          state.acts.push({ id: L.uid(), date: t, name: actSel.name, minutes: m, kcal: kc, ex: false });
          if (state.acts.length > L.MAX_ITEMS) state.acts = state.acts.slice(-L.MAX_ITEMS);
          const b = addBloom(state.acts[state.acts.length - 1].id, 'salud', 'flor'); celebrate({ cat: 'salud', energy: todayEnergy() }, b); commit();
        } }, minutes, h('button', { class: 'btn salud', type: 'submit', text: '+ ' + actSel.name })),
        acts.length ? h('ul', { class: 'food-list' }, acts.map(a => h('li', { class: 'food-item' }, h('span', { class: 'spacer', text: `${a.name} · ${a.minutes} min` + (a.ex ? ' (ejemplo)' : '') }), nums ? h('span', { class: 'num', text: '≈ ' + a.kcal + ' kcal' }) : null,
          h('button', { type: 'button', class: 'tiny-btn', 'aria-label': 'Quitar ' + a.name, onclick: () => deleteItem('acts', a, 'Actividad quitada'), text: 'Quitar' })))) :
          h('p', { class: 'empty', text: 'Caminar, bailar, limpiar: todo suma.' }),
        h('p', { class: 'small-note', text: state.profile.weight ? 'Calculado con tu peso. Es una estimación.' : 'Estimado para 60 kg. Cargá tu peso en Ajustes si querés más precisión.' })),
      h('p', { class: 'small-note', text: 'Las calorías son valores aproximados de referencia. Si tenés indicaciones de una nutricionista o médica, seguí esas.' }),
    ];
  }

  function viewSuenos() {
    const gf = ui.goalForm, t = today();
    const input = h('input', { class: 'field', id: 'goal-text', type: 'text', maxlength: L.MAX_TEXT, placeholder: 'Ej.: recibirme, mudarme sola, viajar', 'aria-label': 'Nuevo sueño' });
    const due = h('input', { class: 'field', id: 'goal-due', type: 'date', 'aria-label': 'Fecha objetivo (opcional)', min: t });
    const cards = state.goals.map(g => {
      const p = L.goalProgress(g);
      const gr = ring(p.pct, 56, 6, 'goal-ring ring'); gr.appendChild(s('text', { x: 28, y: 32.5, 'text-anchor': 'middle' }, p.pct + '%'));
      const stepInput = h('input', { class: 'field', type: 'text', id: 'step-' + g.id, maxlength: L.MAX_TEXT, placeholder: 'Próximo pasito', 'aria-label': 'Nuevo paso para ' + g.text });
      let daysLeft = '';
      if (g.due) { const n = L.daysBetween(t, g.due); daysLeft = n > 1 ? `Faltan ${n} días` : n === 1 ? 'Falta 1 día' : n === 0 ? '¡Es hoy!' : 'La fecha pasó: ponete otra, sin culpa'; }
      return h('article', { class: 'goal' },
        h('div', { class: 'goal-head' }, gr, h('div', { class: 'spacer' }, h('h3', { text: g.text }),
          h('div', { class: 'meta' }, h('span', { class: 'chip ' + g.cat }, h('span', { class: 'dot ' + g.cat }), CAT_LABEL[g.cat]), h('span', { text: `${p.done} de ${p.total} pasos` }),
            daysLeft ? h('span', { text: '· ' + daysLeft }) : null, g.ex ? h('span', { text: '· ejemplo' }) : null))),
        g.steps.length ? h('ul', { class: 'steps' }, g.steps.map(st => h('li', { class: 'step' + (st.done ? ' done' : '') },
          h('button', { type: 'button', class: 'check c-' + g.cat, role: 'checkbox', 'aria-checked': String(st.done), 'aria-label': st.text, onclick: () => {
            st.done = !st.done;
            if (st.done) { const b = addBloom(st.id, g.cat, 'arbol'); celebrate({ kind: 'meta', cat: g.cat }, b); } else removeBlooms(st.id);
            commit();
          } }, checkIcon()),
          h('span', { class: 'spacer', text: st.text }),
          h('button', { type: 'button', class: 'tiny-btn', 'aria-label': 'Quitar paso: ' + st.text, onclick: () => { g.steps = g.steps.filter(x => x !== st); removeBlooms(st.id); commit(); }, text: 'Quitar' })))) :
          h('p', { class: 'muted', text: 'Partilo en pasitos. Cada uno hace crecer su árbol. 🌳' }),
        h('form', { class: 'form-row', onsubmit: e => { e.preventDefault(); const txt = L.cleanText(stepInput.value); if (!txt) return; if (g.steps.length >= 30) { showToast('Máximo 30 pasos por sueño.'); return; } g.steps.push({ id: L.uid(), text: txt, done: false }); commit(); const el = document.getElementById('step-' + g.id); if (el) el.focus(); } },
          stepInput, h('button', { class: 'btn facu small', type: 'submit', text: '+ Paso' })),
        ui.confirm === g.id ?
          h('div', { class: 'note ocio' }, h('p', { text: '¿Borrar este sueño y sus pasos?' }),
            h('button', { class: 'btn ocio small', type: 'button', onclick: () => { g.steps.forEach(st => removeBlooms(st.id)); state.goals = state.goals.filter(x => x !== g); ui.confirm = null; commit(); }, text: 'Sí, borrar' }),
            h('button', { class: 'btn ghost small', type: 'button', onclick: () => { ui.confirm = null; render(); }, text: 'Cancelar' })) :
          h('div', null, h('button', { type: 'button', class: 'tiny-btn', onclick: () => { ui.confirm = g.id; render(); }, text: 'Borrar sueño' })));
    });
    return [
      h('section', { class: 'card', 'aria-labelledby': 'dr-h' }, h('p', { class: 'eyebrow', text: 'Mediano plazo · 1 a 3 meses' }), h('h2', { id: 'dr-h', text: 'Mis sueños' }),
        cards.length ? cards : h('p', { class: 'empty', text: 'Todavía no cargaste sueños. ¿Qué te gustaría lograr en los próximos meses?' })),
      h('form', { class: 'card add-form', onsubmit: e => {
        e.preventDefault(); const txt = L.cleanText(input.value); if (!txt) { input.focus(); return; }
        if (state.goals.length >= 60) { showToast('Máximo 60 sueños.'); return; }
        state.goals.push({ id: L.uid(), text: txt, cat: gf.cat, due: L.isDateStr(due.value) ? due.value : '', steps: [], ex: false }); commit();
      } },
        h('h2', { text: 'Nuevo sueño' }), input,
        h('span', { class: 'lbl', text: 'Área' }),
        catChooser(gf.cat, c => { gf.cat = c; keepValues(['goal-text', 'goal-due'], render); }, 'gcat'),
        h('label', { class: 'lbl', for: 'goal-due', text: 'Fecha objetivo (opcional)' }),
        h('div', { class: 'form-row' }, due, h('button', { class: 'btn facu', type: 'submit', text: '🌱 Plantar sueño' }))),
    ];
  }

  function viewJardin() {
    const from = L.addDays(today(), -60);
    const bl = state.blooms.filter(b => b.date >= from).slice(-160);
    const flowers = state.blooms.filter(b => b.kind === 'flor').length;
    const steps = state.blooms.filter(b => b.kind === 'arbol').length;
    const treesN = state.goals.filter(g => L.goalProgress(g).done > 0).length;
    const gw = h('div', { class: 'garden-wrap' }, gardenSVG(bl, state.goals, 230, null, `Tu jardín: ${flowers} flores y ${treesN} árboles`));
    if (!bl.length) gw.appendChild(h('p', { class: 'garden-empty', text: 'Tu jardín empieza con tu primer logro.' }));
    return [h('section', { class: 'card', 'aria-labelledby': 'gd-h' }, h('p', { class: 'eyebrow', text: 'Últimos 60 días' }), h('h2', { id: 'gd-h', text: 'Tu jardín' }), gw,
      h('div', { class: 'row' },
        h('div', { class: 'note salud spacer' }, h('p', null, h('strong', { text: String(flowers) }), flowers === 1 ? ' flor: cada cosa hecha florece.' : ' flores: cada cosa hecha florece.')),
        h('div', { class: 'note facu spacer' }, h('p', null, h('strong', { text: String(steps) }), steps === 1 ? ' paso hacia tus sueños.' : ' pasos hacia tus sueños.'))),
      h('div', { class: 'row' }, L.CATS.map(c => h('span', { class: 'chip ' + c }, h('span', { class: 'dot ' + c }), CAT_LABEL[c]))),
      h('p', { class: 'muted', text: 'Acá nada se marchita. Si un día no hacés nada, el jardín te espera igual.' }))];
  }

  // ---- Capas ----
  let overlayRoot = null;
  function renderOverlays() {
    if (!overlayRoot) { overlayRoot = h('div', { id: 'overlays' }); document.body.appendChild(overlayRoot); }
    overlayRoot.replaceChildren();
    if (ui.migrate && Cloud.user) overlayRoot.appendChild(migrateSheet());
    else if (ui.login && Cloud.enabled && !Cloud.user) overlayRoot.appendChild(loginSheet());
    else if (ui.celebrate) overlayRoot.appendChild(celebrateLayer());
    else if (ui.settings) overlayRoot.appendChild(settingsSheet());
    if (ui.toast) {
      const tt = ui.toast;
      overlayRoot.appendChild(h('div', { class: 'toast', role: 'status' }, h('span', { text: tt.text }),
        tt.undo ? h('button', { type: 'button', onclick: () => { ui.toast = null; clearTimeout(toastTimer); tt.undo(); renderOverlays(); }, text: 'Deshacer' }) : null));
    }
  }
  function layer(box, close) {
    const ov = h('div', { class: 'overlay', onclick: e => { if (e.target === ov && close) close(); }, onkeydown: e => { if (e.key === 'Escape' && close) close(); } }, box);
    return ov;
  }
  function celebrateLayer() {
    const c = ui.celebrate;
    const big = s('svg', { class: 'big', viewBox: '-32 -50 64 56', 'aria-hidden': 'true' });
    big.appendChild(c.kind === 'meta' ? s('g', { class: 'pop' }, tree(0, 4, 1, c.cat)) : flower(0, 4, 1.7, c.cat, true));
    const close = () => { ui.celebrate = null; renderOverlays(); };
    const btn = h('button', { class: 'btn ' + c.cat, type: 'button', id: 'celebrate-ok', onclick: close, text: '¡Gracias! 💖' });
    const box = h('div', { class: 'celebrate', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'cel-h' }, big,
      h('h2', { id: 'cel-h', text: c.phrase }), h('p', { text: c.kind === 'meta' ? '+1 paso hacia tu sueño 🌳' : '+1 flor de ' + CAT_LABEL[c.cat] }), btn);
    const colors = ['--ocio', '--facu', '--salud', '--comida', '--empleo'];
    for (let i = 0; i < 18; i++) {
      const p = h('span', { class: 'petal-fx', 'aria-hidden': 'true' });
      const a = (i / 18) * Math.PI * 2;
      p.style.setProperty('--dx', Math.round(Math.cos(a) * (90 + (i % 3) * 30)) + 'px');
      p.style.setProperty('--dy', Math.round(Math.sin(a) * (80 + (i % 4) * 20)) + 'px');
      p.style.setProperty('--rot', (i * 47 % 360) + 'deg');
      p.style.background = 'var(' + colors[i % 5] + ')';
      box.appendChild(p);
    }
    setTimeout(() => btn.focus(), 30);
    return layer(box, close);
  }
  function loginSheet() {
    const email = h('input', { class: 'field', id: 'login-email', type: 'email', maxlength: 120, autocomplete: 'email', placeholder: 'tu@mail.com', 'aria-label': 'Mail', required: true });
    const pass = h('input', { class: 'field', id: 'login-pass', type: 'password', minlength: 8, maxlength: 72, autocomplete: 'current-password', placeholder: 'Contraseña (mínimo 8)', 'aria-label': 'Contraseña', required: true });
    async function go(kind) {
      const em = L.cleanText(email.value, 120), pw = pass.value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { ui.loginErr = 'Revisá el mail.'; keepValues(['login-email'], renderOverlays); return; }
      if (pw.length < 8 || pw.length > 72) { ui.loginErr = 'La contraseña tiene que tener entre 8 y 72 caracteres.'; keepValues(['login-email'], renderOverlays); return; }
      ui.loginBusy = true; ui.loginErr = ''; keepValues(['login-email', 'login-pass'], renderOverlays);
      const msg = kind === 'in' ? await Cloud.signIn(em, pw) : await Cloud.signUp(em, pw);
      ui.loginBusy = false; ui.loginErr = msg;
      if (!Cloud.user) keepValues(['login-email'], renderOverlays);
    }
    const box = h('form', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'login-h', onsubmit: e => { e.preventDefault(); go('in'); } },
      h('h2', { id: 'login-h', text: '¡Hola, bonita! 🌸' }),
      h('p', { class: 'muted', text: 'Entrá con tu cuenta para tener tu día en el celu y en la compu.' }),
      h('label', { class: 'lbl', for: 'login-email', text: 'Mail' }), email,
      h('label', { class: 'lbl', for: 'login-pass', text: 'Contraseña' }), pass,
      ui.loginErr ? h('p', { class: 'err', role: 'alert', text: ui.loginErr }) : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn ocio', type: 'submit', disabled: ui.loginBusy, text: ui.loginBusy ? 'Un segundo…' : 'Entrar' }),
        h('button', { class: 'btn facu', type: 'button', disabled: ui.loginBusy, onclick: () => go('up'), text: 'Crear cuenta' })),
      h('button', { class: 'link-btn', type: 'button', onclick: () => { lsSet(SKIP_KEY, '1'); ui.login = false; renderOverlays(); }, text: 'Seguir sin cuenta (solo en este celu)' }));
    setTimeout(() => { const el = document.getElementById('login-email'); if (el && !el.value) el.focus(); }, 30);
    return layer(box, null);
  }
  function migrateSheet() {
    const box = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mig-h' },
      h('h2', { id: 'mig-h', text: 'Encontramos datos en este celu' }),
      h('p', { class: 'muted', text: 'Hay tareas o comidas guardadas acá sin cuenta. ¿Son tuyas y querés subirlas a ' + (Cloud.user.email || 'tu cuenta') + '?' }),
      h('p', { class: 'small-note', text: 'Si no las reconocés, elegí "Usar solo mi cuenta": se borran de este celu.' }),
      h('div', { class: 'row' },
        h('button', { class: 'btn salud', type: 'button', id: 'mig-up', onclick: () => Cloud.resolveMigration(true), text: 'Sí, subirlas' }),
        h('button', { class: 'btn ghost', type: 'button', id: 'mig-no', onclick: () => Cloud.resolveMigration(false), text: 'Usar solo mi cuenta' })));
    return layer(box, null);
  }
  function settingsSheet() {
    const close = () => { ui.settings = false; ui.confirm = null; renderOverlays(); };
    const pr = state.profile;
    const name = h('input', { class: 'field', id: 'name-input', type: 'text', maxlength: 30, placeholder: 'Tu nombre', autocomplete: 'off', value: state.name });
    const age = h('input', { class: 'field', id: 'p-age', type: 'number', min: 10, max: 100, step: 1, inputmode: 'numeric', value: pr.age || '' });
    const height = h('input', { class: 'field', id: 'p-height', type: 'number', min: 120, max: 220, step: 1, inputmode: 'numeric', value: pr.height || '' });
    const weight = h('input', { class: 'field', id: 'p-weight', type: 'number', min: 30, max: 250, step: 0.1, inputmode: 'decimal', value: pr.weight || '' });
    const level = h('select', { class: 'field', id: 'p-act', 'aria-label': 'Actividad diaria' }, Object.keys(L.ACTIVITY_LEVELS).map(k => { const o = h('option', { value: k, text: ACT_LABEL[k] }); if (pr.activity === k) o.selected = true; return o; }));
    const confirming = ui.confirm;
    const cloudPart = !Cloud.enabled ? h('div', { class: 'note empleo' }, h('p', { text: 'Tus datos quedan solo en este dispositivo. Bonita no tiene publicidad ni estadísticas de uso; lo único que se descarga de afuera son las tipografías (Google Fonts).' })) :
      Cloud.user ? h('div', { class: 'stack' }, h('div', { class: 'note empleo' }, h('p', { text: 'Cuenta: ' + (Cloud.user.email || '') + ' · ' + Cloud.status })),
        h('div', { class: 'row' }, h('button', { class: 'btn ghost small', type: 'button', onclick: () => { Cloud.signOut(); close(); }, text: 'Cerrar sesión' }),
          confirming === '__cuenta' ? null : h('button', { class: 'btn ghost small', type: 'button', onclick: () => { ui.confirm = '__cuenta'; renderOverlays(); }, text: 'Borrar mi cuenta' })),
        confirming === '__cuenta' ? h('div', { class: 'note ocio' }, h('p', { text: 'Se borra tu cuenta y todos tus datos de la nube. No se puede deshacer.' }),
          h('button', { class: 'btn ocio small', type: 'button', onclick: async () => { const m = await Cloud.deleteAccount(); ui.confirm = null; close(); showToast(m || 'Cuenta borrada. ¡Gracias por todo!'); }, text: 'Sí, borrar cuenta' }),
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => { ui.confirm = null; renderOverlays(); }, text: 'Cancelar' })) : null) :
        h('div', { class: 'row' }, h('p', { class: 'spacer muted', text: 'Sin cuenta: tus datos quedan solo en este celu.' }), h('button', { class: 'btn ocio small', type: 'button', onclick: () => { lsDel(SKIP_KEY); ui.settings = false; ui.login = true; renderOverlays(); }, text: 'Entrar o crear cuenta' }));
    const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'set-h' },
      h('div', { class: 'row' }, h('h2', { id: 'set-h', class: 'spacer', text: 'Ajustes' }), h('button', { type: 'button', class: 'btn small ocio', id: 'close-settings', onclick: close, text: 'Listo' })),
      cloudPart,
      h('form', { class: 'add-form', onsubmit: e => {
        e.preventDefault();
        state.name = L.cleanText(name.value, 30);
        const p = L.sanitizeState({ profile: { age: age.value === '' ? 0 : Number(age.value), height: height.value === '' ? 0 : Number(height.value), weight: weight.value === '' ? 0 : Number(weight.value), activity: level.value } }).profile;
        state.profile = p; ui.menu = null; commit();
        showToast(p.age && p.age < 18 ? 'Guardado. Para menores de 18 no estimamos calorías: eso lo ve mejor una profesional.' : 'Guardado ✨');
      } },
        h('label', { class: 'lbl', for: 'name-input', text: '¿Cómo te llamamos?' }), name,
        h('h3', { text: 'Tu perfil (opcional)' }),
        h('p', { class: 'small-note', text: 'Solo se usa para estimar la energía que usa tu cuerpo. No hay metas de peso.' }),
        h('div', { class: 'grid2' }, h('label', { class: 'lbl', for: 'p-age' }, 'Edad', age), h('label', { class: 'lbl', for: 'p-height' }, 'Altura (cm)', height), h('label', { class: 'lbl', for: 'p-weight' }, 'Peso (kg)', weight)),
        h('label', { class: 'lbl', for: 'p-act', text: 'Actividad diaria' }), level,
        h('div', null, h('button', { class: 'btn salud', type: 'submit', text: 'Guardar' }))),
      h('div', { class: 'row' }, h('span', { class: 'spacer', text: 'Sonido al cumplir algo' }),
        h('button', { type: 'button', class: 'seg-btn salud', id: 'sound-toggle', 'aria-pressed': String(state.sound), onclick: () => { state.sound = !state.sound; save(); renderOverlays(); }, text: state.sound ? 'Activado' : 'Apagado' })),
      h('div', { class: 'row' }, h('span', { class: 'spacer', text: 'Mostrar calorías en números' }),
        h('button', { type: 'button', class: 'seg-btn comida', id: 'numbers-toggle', 'aria-pressed': String(state.showNumbers), onclick: () => { state.showNumbers = !state.showNumbers; commit(); }, text: state.showNumbers ? 'Sí' : 'No, solo barras' })),
      confirming === '__all' ?
        h('div', { class: 'note ocio' }, h('p', { text: 'Se borran todas tus tareas, sueños, comidas y flores. No se puede deshacer.' }),
          h('button', { class: 'btn ocio small', type: 'button', id: 'wipe-yes', onclick: () => { const keepName = state.name; state = L.sanitizeState({ name: keepName }); ui.confirm = null; commit(); close(); showToast('Listo, empezaste de cero. 🌱'); }, text: 'Sí, borrar todo' }),
          h('button', { class: 'btn ghost small', type: 'button', onclick: () => { ui.confirm = null; renderOverlays(); }, text: 'Cancelar' })) :
        h('button', { type: 'button', class: 'btn ghost small', id: 'wipe', onclick: () => { ui.confirm = '__all'; renderOverlays(); }, text: 'Borrar todos mis datos' }));
    return layer(sheet, close);
  }

  // ---- Render ----
  function switchTab(tab) { ui.tab = tab; ui.confirm = null; ui.toast = null; render(); window.scrollTo(0, 0); }
  function render() {
    const hr = new Date().getHours();
    const saludo = hr < 12 ? 'Buen día' : hr < 20 ? 'Buenas tardes' : 'Buenas noches';
    document.getElementById('greet').textContent = state.name ? `${saludo}, ${state.name} 🌸` : `${saludo}, bonita 🌸`;
    document.getElementById('today-label').textContent = prettyDate(today());
    const v = ui.tab;
    const content = v === 'hoy' ? viewHoy() : v === 'semana' ? viewSemana() : v === 'comida' ? viewComida() : v === 'suenos' ? viewSuenos() : viewJardin();
    document.getElementById('view').replaceChildren(...content.flat().filter(Boolean));
    document.querySelectorAll('.tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === v)));
    renderOverlays();
  }

  document.querySelectorAll('.tab').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
  document.getElementById('open-settings').addEventListener('click', () => { ui.settings = true; ui.toast = null; renderOverlays(); });
  window.addEventListener('storage', e => {
    if (e.key === OWNER_KEY || e.key === null) { location.reload(); return; } // sesión cambiada en otra pestaña
    if (e.key === KEY) { loadLocal(); render(); }
  });
  let lastDay = today();
  setInterval(() => { const t = today(); if (t !== lastDay) { if (ui.date === lastDay) ui.date = t; lastDay = t; applyRollover(); save(false); render(); } }, 60000);

  const first = loadLocal();
  if (first && !Cloud.enabled) seedExamples();
  applyRollover();
  L.pruneOld(state, today());
  save(false);
  render();
  Cloud.start();
})();
