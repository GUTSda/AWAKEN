/* unique.js — Pola basic attack & 4 skill khusus Unique Item (Z X C = skill biasa, V = Ultimate).
   • Hanya item Unique yang punya pola serangan & skill sendiri. Item biasa dari Shop tetap pakai pola standar (combatfx.js).
   • Skill Spasi tetap berlaku untuk SEMUA senjata (terpisah dari 4 skill ini).
   • Tiap unique didaftarkan di D.UNIQ[idItem]. Satu entri =
       { pattern:[ {t:'langkah', ...}, ... ]   // urutan basic attack (berulang tiap klik)
         skills:{ z,x,c,v }                     // type: 'toggle' | 'cast' | 'hold' (hold punya press/hold/release)
         mods(R,u) → pengali stat | tick(R,dt,u) | onStrike(R,m) | draw(ctx,R,cx,cy,u) }
   • Langkah pola tersedia: slash, spray, slam, pierce, fan, nova, tpcombo (lihat STEPS). Tambah langkah baru = tambah fungsi di STEPS.
   • Tiap Unique punya: pattern (combo 4 hit) + holdAtk (tahan Basic Attack: charge → lepas) + skills Z/X/C/V. Angka mudah diganti.
   • holdAtk = { th:detik tahan sebelum charge, max:detik charge penuh, start/tick/release/draw }. Tap singkat = basic attack biasa.
   Hook engine: combatfx.js (FX.attack, strike) · dungeon.js (update, attack, ghost) · passives.js (pengali stat) · game.js (tombol, HUD, gambar). */
(function (D) {
  const PI = Math.PI, PI2 = PI * 2, cos = Math.cos, sin = Math.sin, atan2 = Math.atan2, hyp = Math.hypot;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const walkOk = (R, x, y) => [[-9, -9], [9, -9], [-9, 9], [9, 9]].every(([dx, dy]) => D._c.walk(R, x + dx, y + dy));
  const useRes = (R, n) => { const u = R.u; if (!u || u.rs === undefined || u.rs < n) return false; u.rs -= n; return true; };
  const stunMob = (m, t) => { if (!m.isBoss && !m.dead) m.stun = Math.max(m.stun || 0, t); };
  const adiff = (a, b) => (((a - b + PI) % PI2) + PI2) % PI2 - PI;
  const FU = () => D.FX.u, C = () => D._c, col = () => D.ROLES[D.state.role].color;
  const FIRE = '#ff7a3a', GOLD = '#ffd54a', AC = '#6fe0b0', AW = '#bff5ff';
  const fl = (R, x, y, t, c) => R.ft.push({ x, y, t: String(t), c: c || '#fff', life: .9 });

  /* ---------- geometri ---------- */
  const alive = (R) => R.mobs.filter((m) => !m.dead);
  const inCircle = (R, x, y, r) => alive(R).filter((m) => hyp(m.x - x, m.y - y) < r + m.r * .5);
  const inCone = (R, x, y, a, range, half) => alive(R).filter((m) => { const d = hyp(m.x - x, m.y - y) - m.r; return d < range && (d < 14 || Math.abs(adiff(atan2(m.y - y, m.x - x), a)) <= half); });
  const inLine = (R, x, y, a, len, w) => alive(R).filter((m) => { const dx = m.x - x, dy = m.y - y, al = dx * cos(a) + dy * sin(a), pe = Math.abs(-dx * sin(a) + dy * cos(a)); return al > -m.r && al < len + m.r && pe < w / 2 + m.r; });
  const nearest = (R, x, y, max) => { let t = null, bd = max; for (const m of alive(R)) { const d = hyp(m.x - x, m.y - y); if (d < bd) { bd = d; t = m; } } return t; };

  /* ---------- efek bantu ---------- */
  const strike = (R, m, mult, o) => FU().strike(R, m, mult, o);
  const burn = (R, m, mul, dur, c) => { if (m.dead) return; (m.sts = m.sts || {}).burn = { t: dur || 3, tick: .5, dps: R.s.atk * (mul || 1) / (dur || 3), c: c || FIRE }; };
  function burst(R, x, y, r, c, big) {
    const u = FU(), V = u.st(R); u.ring(V, x, y, 6, r, .35, c, 6, true); u.ring(V, x, y, 3, r * .55, .25, '#fff', 3, true);
    u.flash(V, x, y, r * .7, .18, c); u.spark(V, x, y, big ? 30 : 16, c, { v0: 70, v1: 300 });
  }
  function dashAlong(R, ang, dist) {
    const V = FU().st(R); V.gh.push({ x: R.p.x, y: R.p.y, a: ang, life: .4, max: .4, c: col() });
    for (let d = 0; d < dist; d += 6) {
      const s = Math.min(6, dist - d), bx = R.p.x, by = R.p.y; C().move(R, R.p, cos(ang) * s, sin(ang) * s, 9);
      if (R.p.x === bx && R.p.y === by) break; if (d % 30 === 0) V.gh.push({ x: R.p.x, y: R.p.y, a: ang, life: .3, max: .3, c: col() });
    }
  }
  const clampPt = (R, aim, range) => { const a = atan2(aim.y - R.p.y, aim.x - R.p.x), l = Math.min(range, hyp(aim.x - R.p.x, aim.y - R.p.y)); return { x: R.p.x + cos(a) * l, y: R.p.y + sin(a) * l, a }; };
  const rgba = (rgb, a) => `rgba(${rgb},${a})`;

  /* =====================  LANGKAH POLA BASIC ATTACK  ===================== */
  const STEPS = {
    slash(R, ang, o) {                                     // tebasan berbusur (o.burn = bakar)
      const u = FU(), V = u.st(R), c = o.col || col(), dir = o.dir || 1, rng = o.range || R.s.range + 12, span = o.span || 2.6, dur = Math.min(.26, R.s.cd * .9);
      V.sw = { k: 'slash', t: 0, dur, ang, dir, lunge: o.lunge || 8 };
      u.add(V, { k: 'arc', fol: 1, a: ang, dir, span, r: rng + 10, th: o.th || 30, life: dur * 1.7, sw: .5, c });
      u.later(V, dur * .35, () => {
        const h = inCone(R, R.p.x, R.p.y, ang, rng, span / 2);
        h.forEach((m) => { strike(R, m, o.mult || 1, { kb: o.kb || 6, c, ang }); if (o.burn) burn(R, m, o.burn); });
        if (h.length) u.spark(V, R.p.x + cos(ang) * rng * .8, R.p.y + sin(ang) * rng * .8, 8, c, { a: ang, sp: .8 });
      });
      return 0;
    },
    spray(R, ang, o) {                                     // semburan (api) berbentuk kerucut, beberapa denyut
      const u = FU(), V = u.st(R), c = o.col || col(), rng = o.range || 120, half = o.half || .55, n = o.pulses || 3;
      V.sw = { k: 'thrust', t: 0, dur: .32, ang };
      for (let i = 0; i < n; i++) u.later(V, .06 + i * .09, () => {
        u.spark(V, R.p.x + cos(ang) * 18, R.p.y + sin(ang) * 18, 18, i % 2 ? GOLD : c, { a: ang, sp: half, v0: 150, v1: 400, l: 1.4, sz: 1.3 });
        u.flash(V, R.p.x + cos(ang) * rng * .55, R.p.y + sin(ang) * rng * .55, rng * .42, .13, c);
        inCone(R, R.p.x, R.p.y, ang, rng, half).forEach((m) => { strike(R, m, o.mult || .5, { n: 3, c, ang }); if (o.burn) burn(R, m, o.burn); });
      });
      return .1 + n * .09;
    },
    slam(R, ang, o) {                                      // hantaman area di depan
      const u = FU(), V = u.st(R), c = o.col || col(), dur = .4, r = o.r || 90;
      V.sw = { k: 'smash', t: 0, dur, ang, lunge: 12 };
      u.later(V, dur * .55, () => {
        const x = R.p.x + cos(ang) * (o.dist || 60), y = R.p.y + sin(ang) * (o.dist || 60); burst(R, x, y, r, c);
        const h = inCircle(R, x, y, r); h.forEach((m) => { strike(R, m, o.mult || 1.5, { kb: o.kb || 14, c, ang }); if (o.burn) burn(R, m, o.burn); });
        V.shk = Math.max(V.shk, 6); if (h.length) u.hitstop(R, .05);
      });
      return .12;
    },
    pierce(R, ang, o) {                                    // garis lurus (tusukan / tembakan)
      const u = FU(), V = u.st(R), c = o.col || col(), len = o.len || 200, w = o.w || 30;
      V.sw = { k: 'thrust', t: 0, dur: .26, ang };
      u.later(V, .09, () => {
        const x0 = R.p.x + cos(ang) * 14, y0 = R.p.y + sin(ang) * 14;
        u.add(V, { k: 'line', x1: x0, y1: y0, x2: x0 + cos(ang) * len, y2: y0 + sin(ang) * len, w: o.vw || Math.max(8, w * .5), life: .22, c });
        u.ring(V, x0 + cos(ang) * len, y0 + sin(ang) * len, 4, 26, .2, '#fff', 3);
        inLine(R, R.p.x, R.p.y, ang, len, w).forEach((m) => { strike(R, m, o.mult || 1, { kb: o.kb || 4, c, ang }); if (o.burn) burn(R, m, o.burn); });
      });
      return 0;
    },
    fan(R, ang, o) { const n = o.n || 3, sp = o.spread || .3; for (let i = 0; i < n; i++) STEPS.pierce(R, ang + (i - (n - 1) / 2) * sp, o); return .1; },
    nova(R, ang, o) {                                      // ledakan di sekeliling diri
      const u = FU(), V = u.st(R), c = o.col || col(), r = o.r || 110;
      V.sw = { k: 'raise', t: 0, dur: .35, ang };
      u.later(V, .15, () => { burst(R, R.p.x, R.p.y, r, c); const h = inCircle(R, R.p.x, R.p.y, r); h.forEach((m) => { strike(R, m, o.mult || 1.3, { kb: o.kb || 10, c }); if (o.burn) burn(R, m, o.burn); }); V.shk = Math.max(V.shk, 4); });
      return .15;
    },
    fireballs(R, ang, o) {                                 // MAGE: 3 bola api beruntun; 3× kena musuh yang sama → ledakan kecil +2% Mana
      const u = FU(), V = u.st(R), U = S(R), c = o.col || col(), len = o.len || 300, cnt = new Map();
      V.sw = { k: 'cast', t: 0, dur: .5, wu: .12, ang, big: false };
      if (U.on.z) useRes(R, .5);                           // Combustion Field: biaya Mana tambahan tiap menyihir
      for (let i = 0; i < 3; i++) u.later(V, .12 + i * .13, () => {
        const a = ang + (i - 1) * .04, ox = R.p.x + cos(a) * 26, oy = R.p.y + sin(a) * 26; let t = null, bd = 1e9;
        for (const m of inLine(R, ox, oy, a, len, 26)) { const d = hyp(m.x - ox, m.y - oy); if (d < bd) { bd = d; t = m; } }
        const L = t ? Math.max(20, bd) : len;
        u.add(V, { k: 'line', x1: ox, y1: oy, x2: ox + cos(a) * L, y2: oy + sin(a) * L, w: 12, life: .16, c: i % 2 ? GOLD : c });
        u.spark(V, ox, oy, 5, c, { a, sp: .4 });
        if (!t) return;
        strike(R, t, o.mult || .5, { n: 5, c, ang: a }); burn(R, t, .15, 2, c);
        const n = (cnt.get(t) || 0) + 1; cnt.set(t, n);
        if (n === 3) {
          burst(R, t.x, t.y, 55, c); inCircle(R, t.x, t.y, 55).forEach((m) => strike(R, m, .5, { n: 4, c, kb: 6 }));
          U.rs = Math.min(100, (U.rs || 0) + 2); fl(R, t.x, t.y - 26, '+2% MANA', '#6fe0ff');
        }
      });
      return .5;
    },
    dshot(R, ang, o) {                                     // ARCHER: Double Shot (panah tembus kalau Wind Infusion aktif, 1% Stamina / tembakan)
      const u = FU(), V = u.st(R), U = S(R), s = R.s; V.sw = { k: 'draw', t: 0, dur: .3, wu: .1, ang, big: false };
      u.later(V, .1, () => {
        for (let i = 0; i < 2; i++) {
          let pierce = false; if (U.on.z) { if (useRes(R, 1)) pierce = true; else { U.on.z = false; fl(R, R.p.x, R.p.y - 28, 'Stamina habis — Wind OFF', '#ff6b5a'); } }
          const a = ang + (i ? .045 : -.045), x = R.p.x + cos(a) * 20, y = R.p.y + sin(a) * 20, spd = 1100, c = pierce ? '#bff5ff' : (o.col || col());
          V.pj.push({ k: 'arrow', x, y, a, spd, life: (s.range + 190) / spd, mult: o.mult || .65, big: false, pierce, rad: pierce ? 8 : 6, c, at: s.arrow, hit: [], t: 0 });
          u.spark(V, x, y, 4, c, { a, sp: .3, v0: 120, v1: 300 });
        }
      });
      return 0;
    },
    cleave(R, ang, o) {                                    // FIGHTER: tebasan berputar lambat, area luas, abaikan 15% armor (≈ +15% damage)
      const u = FU(), V = u.st(R), c = o.col || col(), r = o.r || 105, dur = .55;
      V.sw = { k: 'flurry', t: 0, dur, ang, lunge: 6 };
      u.add(V, { k: 'arc', fol: 1, a: ang, dir: 1, span: 5.8, r: r + 8, th: 44, life: dur * 1.1, sw: .5, c });
      u.later(V, dur * .45, () => {
        burst(R, R.p.x, R.p.y, r * .9, c); const h = inCircle(R, R.p.x, R.p.y, r);
        h.forEach((m) => strike(R, m, (o.mult || 1.6) * 1.15, { kb: o.kb || 12, c, ang })); V.shk = Math.max(V.shk, 4); if (h.length) u.hitstop(R, .04);
      });
      return .35;
    },
    bash(R, ang, o) {                                      // TANK: Shield Bash (dorongan perisai)
      const u = FU(), V = u.st(R), U = S(R), c = o.col || col(); V.sw = { k: 'smash', t: 0, dur: .35, ang, lunge: 12 }; U.bash = 0;
      u.later(V, .14, () => {
        const h = inCone(R, R.p.x, R.p.y, ang, 78, .8); U.bash = h.length ? R.t : 0;
        h.forEach((m) => strike(R, m, o.mult || 1, { kb: 30, c, ang, n: 8 })); u.ring(V, R.p.x + cos(ang) * 46, R.p.y + sin(ang) * 46, 6, 40, .2, '#fff', 3); V.shk = Math.max(V.shk, 3);
      });
      return .1;
    },
    guard(R, ang, o) {                                     // TANK: tebasan pedang tajam; combo sukses (bash lalu slash kena) → shield 3% Max HP
      const U = S(R), u = FU(), V = u.st(R), c = o.col || col(), ok = U.bash && R.t - U.bash < 1.2;
      STEPS.slash(R, ang, { mult: o.mult || 1.3, col: c, range: 66, span: 2.2, th: 28, kb: 8 });
      u.later(V, .12, () => { if (ok && inCone(R, R.p.x, R.p.y, ang, 78, 1.1).length) { U.sh = R.s.hp * .03; U.shT = 6; U.hp0 = R.hp; D.FX.buffFx(R, '#8fc4ff'); fl(R, R.p.x, R.p.y - 30, 'SHIELD +3%', '#8fc4ff'); } U.bash = 0; });
      return 0;
    },
    tpcombo(R, ang, o) {                                   // teleport ke belakang musuh terdekat → combo basic attack normal (3 hit)
      const u = FU(), V = u.st(R), t = nearest(R, R.p.x, R.p.y, o.range || 340), role = D.state.role;
      if (!t) { D.FX.role[role](R, ang, 0); return 0; }
      const a = atan2(t.y - R.p.y, t.x - R.p.x), ox = R.p.x, oy = R.p.y, ok = (x, y) => [[-9, -9], [9, -9], [-9, 9], [9, 9]].every(([dx, dy]) => C().walk(R, x + dx, y + dy));
      let done = false;
      for (const off of [t.r + 26, t.r + 40, t.r + 14]) { const x = t.x + cos(a) * off, y = t.y + sin(a) * off; if (ok(x, y)) { R.p.x = x; R.p.y = y; done = true; break; } }
      if (!done) for (const sd of [1.57, -1.57]) { const x = t.x + cos(a + sd) * (t.r + 26), y = t.y + sin(a + sd) * (t.r + 26); if (ok(x, y)) { R.p.x = x; R.p.y = y; done = true; break; } }
      if (done) {
        const c = o.col || col(); V.gh.push({ x: ox, y: oy, a, life: .4, max: .4, c }); u.ring(V, ox, oy, 6, 46, .3, c, 4, true); u.ring(V, R.p.x, R.p.y, 6, 56, .3, '#fff', 3, true);
        u.flash(V, R.p.x, R.p.y, 34, .16, c); u.spark(V, R.p.x, R.p.y, 14, c, {}); R.inv = Math.max(R.inv, .3);
      }
      for (let i = 0; i < 3; i++) u.later(V, .08 + i * .24, () => { if (t.dead) return; D.FX.role[role](R, atan2(t.y - R.p.y, t.x - R.p.x), i); });
      return .95;
    },

    /* ================= FIGHTER — Ironwill Greataxe (Heavy Impact) ================= */
    overhead(R, ang, o) {                                  // Hit 1 Overhead Cleave: banting vertikal, hitlag 0.05 dtk saat kontak
      const u = FU(), V = u.st(R), c = o.col || col(), dur = .42, r = o.r || 82;
      V.sw = { k: 'smash', t: 0, dur, ang, lunge: 10 };
      u.later(V, dur * .55, () => {
        const x = R.p.x + cos(ang) * 62, y = R.p.y + sin(ang) * 62; burst(R, x, y, r, c);
        u.add(V, { k: 'line', x1: x, y1: y - 110, x2: x, y2: y, w: 16, life: .18, c: GOLD });
        const h = inCircle(R, x, y, r); h.forEach((m) => strike(R, m, o.mult || 1.5, { kb: 10, c, ang, n: 9 }));
        V.shk = Math.max(V.shk, 6); if (h.length) u.hitstop(R, .05);
      });
      return .1;
    },
    tackle(R, ang, o) {                                    // Hit 3 Shoulder Tackle (dorong + stagger) → Spin 360°
      const u = FU(), V = u.st(R), c = o.col || col();
      V.sw = { k: 'smash', t: 0, dur: .4, ang, lunge: 14 }; R.inv = Math.max(R.inv, .25); dashAlong(R, ang, o.dash || 58);
      u.later(V, .08, () => {
        const h = inCone(R, R.p.x, R.p.y, ang, 84, .8); h.forEach((m) => { strike(R, m, o.mult || 1, { kb: 30, c, ang, n: 8 }); stunMob(m, .5); });
        u.ring(V, R.p.x + cos(ang) * 40, R.p.y + sin(ang) * 40, 6, 44, .2, '#fff', 3); V.shk = Math.max(V.shk, 4); if (h.length) u.hitstop(R, .04);
      });
      u.later(V, .4, () => STEPS.cleave(R, ang, { mult: o.spin || 1.3, r: 104, col: c, kb: 14 }));
      return .9;
    },
    quake(R, ang, o) {                                     // Hit 4 Earthshatter Slam: angkat tinggi → hantam, tanah retak berapi, knockback
      const u = FU(), V = u.st(R), c = o.col || col(), r = o.r || 125;
      V.sw = { k: 'raise', t: 0, dur: .4, ang };
      u.later(V, .4, () => { V.sw = { k: 'smash', t: 0, dur: .4, ang, lunge: 8 }; });
      u.later(V, .62, () => {
        const x = R.p.x + cos(ang) * 75, y = R.p.y + sin(ang) * 75;
        for (let i = 0; i < 9; i++) { const a = ang + (i - 4) * .3, l = rnd(110, 170), j = rnd(-.15, .15); u.add(V, { k: 'line', x1: x, y1: y, x2: x + cos(a) * l * .5, y2: y + sin(a) * l * .5, w: 7, life: .8, c: '#ffb06a' }); u.add(V, { k: 'line', x1: x + cos(a) * l * .5, y1: y + sin(a) * l * .5, x2: x + cos(a + j) * l, y2: y + sin(a + j) * l, w: 5, life: .8, c: '#ff5a2a' }); }
        burst(R, x, y, r, '#ff7a3a', true); u.ring(V, x, y, 10, r * 1.2, .45, GOLD, 7, true);
        const h = inCircle(R, x, y, r); h.forEach((m) => { strike(R, m, o.mult || 2.8, { kb: 34, c: '#ff7a3a', n: 12, ang }); burn(R, m, .6, 3, FIRE); });
        V.shk = Math.max(V.shk, 14); if (h.length) u.hitstop(R, .09);
      });
      return .65;
    },

    /* ================= MAGE — Embercall Staff (Catalyst) ================= */
    twinEmber(R, ang, o) {                                 // Hit 1: 2 bola api melayang, melengkung mengejar target terdekat
      const u = FU(), V = u.st(R), U = S(R), c = o.col || col(); V.sw = { k: 'cast', t: 0, dur: .42, wu: .14, ang, big: false };
      if (U.on.z) useRes(R, .5);
      u.later(V, .14, () => {
        const t = nearest(R, R.p.x, R.p.y, 380), sp = t ? .75 : .22;
        for (const sd of [-1, 1]) {
          const a = ang + sd * sp, x = R.p.x + cos(a) * 30, y = R.p.y + sin(a) * 30;
          V.pj.push({ k: 'orb', x, y, a, spd: 470, tgt: t, life: 1.3, mult: o.mult || .7, big: false, oc: false, rad: 9, c: sd > 0 ? GOLD : c, hit: [], t: 0 }); u.spark(V, x, y, 6, c, { a, sp: .5 });
        }
      });
      return 0;
    },
    flameStep(R, ang, o) {                                 // Hit 2: side-step tipis + kibasan staf → gelombang api busur
      const U = S(R), side = (U.fs = -(U.fs || 1)); R.inv = Math.max(R.inv, .2); dashAlong(R, ang + side * PI / 2, 46);
      STEPS.slash(R, ang, { mult: o.mult || 1.2, col: o.col || col(), range: 150, span: 2.1, th: 36, dir: side, kb: 8, burn: .25, lunge: 0 });
      return 0;
    },
    vortex(R, ang, o) {                                    // Hit 3: pusaran api di kaki target, menarik musuh 0.5 dtk
      const u = FU(), V = u.st(R), c = o.col || col(), r = o.r || 80, t = nearest(R, R.p.x + cos(ang) * 110, R.p.y + sin(ang) * 110, 280);
      const x = t ? t.x : R.p.x + cos(ang) * 130, y = t ? t.y : R.p.y + sin(ang) * 130; V.sw = { k: 'raise', t: 0, dur: .5, ang };
      u.ring(V, x, y, r * .3, r, .55, c, 3, true); u.ring(V, x, y, r * .2, r * .8, .5, GOLD, 3, true);
      for (let i = 0; i < 5; i++) u.later(V, .05 + i * .1, () => {
        for (const m of alive(R)) { const dx = x - m.x, dy = y - m.y, d = hyp(dx, dy); if (d > r * 1.6 || d < 8) continue; const sp = Math.min(d, (m.isBoss ? 30 : 280) * .1); C().move(R, m, dx / d * sp, dy / d * sp, m.r - 2); }
        u.spark(V, x + rnd(-r, r) * .7, y + rnd(-r, r) * .7, 3, Math.random() < .5 ? c : GOLD, { a: -PI / 2, sp: .6, v0: 40, v1: 130 });
      });
      u.later(V, .55, () => { burst(R, x, y, r, c); inCircle(R, x, y, r).forEach((m) => { strike(R, m, o.mult || 1, { n: 6, c }); burn(R, m, .25, 2, c); }); });
      return .35;
    },
    erupt(R, ang, o) {                                     // Hit 4 Ignition Erupt: staf ke tanah → pilar api eksplosif di bawah tiap musuh
      const u = FU(), V = u.st(R), c = o.col || col(); V.sw = { k: 'smash', t: 0, dur: .45, ang, lunge: 4 }; let hs = false;
      const list = inCone(R, R.p.x, R.p.y, ang, 230, 1.0).sort((a, b) => hyp(a.x - R.p.x, a.y - R.p.y) - hyp(b.x - R.p.x, b.y - R.p.y)).slice(0, 6);
      const pts = list.length ? list.map((m) => [m.x, m.y]) : [[R.p.x + cos(ang) * 100, R.p.y + sin(ang) * 100], [R.p.x + cos(ang) * 170, R.p.y + sin(ang) * 170]];
      pts.forEach(([x, y], i) => {
        u.ring(V, x, y, 12, 62, .3 + i * .07, '#ff5a4a', 3, true);
        u.later(V, .3 + i * .07, () => {
          burst(R, x, y, 62, c, true); u.add(V, { k: 'line', x1: x, y1: y - 150, x2: x, y2: y, w: 22, life: .3, c: GOLD });
          inCircle(R, x, y, 62).forEach((m) => { strike(R, m, o.mult || 1.5, { kb: 12, c, n: 10 }); burn(R, m, .6, 3, c); stunMob(m, .5); hs = true; });
          V.shk = Math.max(V.shk, 6); if (hs) { hs = false; u.hitstop(R, .05); }
        });
      });
      return .35;
    },

    /* ================= TANK — Bastion Aegis (Shield-Breaker) ================= */
    edgeThrust(R, ang, o) {                                // Hit 1: tepi perisai + dorong badan ke depan (stagger)
      const u = FU(), V = u.st(R), c = o.col || col(); V.sw = { k: 'smash', t: 0, dur: .35, ang, lunge: 12 }; dashAlong(R, ang, 30);
      u.later(V, .12, () => {
        const h = inCone(R, R.p.x, R.p.y, ang, 82, .8); h.forEach((m) => { strike(R, m, o.mult || 1.1, { kb: 30, c, ang, n: 8 }); stunMob(m, .6); });
        u.ring(V, R.p.x + cos(ang) * 46, R.p.y + sin(ang) * 46, 6, 40, .2, '#fff', 3); V.shk = Math.max(V.shk, 3);
      });
      return .1;
    },
    vault(R, ang, o) {                                     // Hit 2: tusuk pedang → tendang chestplate musuh ke belakang
      const u = FU(), V = u.st(R), c = o.col || col(); let h = []; V.sw = { k: 'thrust', t: 0, dur: .4, ang };
      u.later(V, .1, () => { h = inCone(R, R.p.x, R.p.y, ang, 86, .5); h.forEach((m) => strike(R, m, o.mult || 1.2, { kb: 4, c, ang, n: 6 })); u.spark(V, R.p.x + cos(ang) * 70, R.p.y + sin(ang) * 70, 8, c, { a: ang, sp: .5 }); });
      u.later(V, .28, () => { h.forEach((m) => { if (m.dead) return; strike(R, m, .7, { kb: 46, c, ang, n: 8 }); stunMob(m, .4); }); if (h.length) { u.ring(V, R.p.x + cos(ang) * 60, R.p.y + sin(ang) * 60, 6, 44, .2, '#fff', 3); u.hitstop(R, .04); } });
      return .2;
    },
    aegisSlam(R, ang, o) {                                 // Hit 3: perisai dihantam ke tanah → gelombang kejut fisik
      const u = FU(), V = u.st(R), c = o.col || col(), r = o.r || 118; V.sw = { k: 'smash', t: 0, dur: .45, ang, lunge: 2 };
      u.later(V, .25, () => {
        burst(R, R.p.x, R.p.y, r, c, true); u.ring(V, R.p.x, R.p.y, 10, r * 1.15, .4, '#fff', 5, true);
        const h = inCircle(R, R.p.x, R.p.y, r); h.forEach((m) => { strike(R, m, o.mult || 1.5, { kb: 22, c, n: 9 }); stunMob(m, .6); });
        V.shk = Math.max(V.shk, 8); if (h.length) u.hitstop(R, .05);
      });
      return .2;
    },
    counter(R, ang, o) {                                   // Hit 4 Shield Counter Cleave: putar perisai tarik musuh ke tengah → tebasan horizontal berat
      const u = FU(), V = u.st(R), c = o.col || col(), px = R.p.x + cos(ang) * 58, py = R.p.y + sin(ang) * 58; let n = 0;
      V.sw = { k: 'flurry', t: 0, dur: .3, ang, lunge: 0 }; u.add(V, { k: 'arc', fol: 1, a: ang, dir: 1, span: 5, r: 92, th: 30, life: .3, sw: .4, c });
      u.later(V, .12, () => inCone(R, R.p.x, R.p.y, ang, 150, 1.1).forEach((m) => { if (m.isBoss) return; const dx = px - m.x, dy = py - m.y, d = hyp(dx, dy); if (d < 6) return; C().move(R, m, dx / d * Math.min(d, 90), dy / d * Math.min(d, 90), m.r - 2); n++; }));
      u.later(V, .32, () => STEPS.slash(R, ang, { mult: o.mult || 2.6, col: c, range: 106, span: 3.2, th: 42, kb: 16, lunge: 14 }));
      u.later(V, .45, () => { if (!n) return; const U = S(R); U.sh = R.s.hp * .03; U.shT = 6; U.hp0 = R.hp; D.FX.buffFx(R, '#8fc4ff'); fl(R, R.p.x, R.p.y - 30, 'SHIELD +3%', '#8fc4ff'); u.hitstop(R, .06); });
      return .6;
    },

    /* ================= ARCHER — Windpiercer Bow (Acrobatic Archery) ================= */
    snap(R, ang, o) {                                      // Hit 1: Double Snap-Shot sambil mundur 1 tap
      STEPS.dshot(R, ang, { mult: o.mult || .6, col: o.col }); R.inv = Math.max(R.inv, .15); dashAlong(R, ang + PI, 30); return 0;
    },
    gale(R, ang, o) {                                      // Hit 2: Piercing Gale — 1 panah berputar cepat, menembus lurus
      const u = FU(), V = u.st(R), s = R.s; V.sw = { k: 'draw', t: 0, dur: .38, wu: .14, ang, big: true };
      u.later(V, .14, () => {
        const x = R.p.x + cos(ang) * 22, y = R.p.y + sin(ang) * 22, spd = 1500;
        V.pj.push({ k: 'arrow', x, y, a: ang, spd, life: (s.range + 300) / spd, mult: o.mult || 1.7, big: true, pierce: true, rad: 11, c: AW, at: s.arrow, hit: [], t: 0 });
        u.ring(V, x, y, 4, 36, .2, AW, 3); u.spark(V, x, y, 10, AW, { a: ang, sp: .3, v0: 150, v1: 380 }); V.shk = Math.max(V.shk, 2.5);
      });
      return .1;
    },
    vaultShot(R, ang, o) {                                 // Hit 3: backflip lompati musuh / menjauh + 3 panah menyebar
      const u = FU(), V = u.st(R), s = R.s, t = nearest(R, R.p.x, R.p.y, 130), ja = t ? atan2(t.y - R.p.y, t.x - R.p.x) : ang + PI, jd = t ? hyp(t.x - R.p.x, t.y - R.p.y) + t.r + 70 : 150;
      R.inv = Math.max(R.inv, .45); dashAlong(R, ja, jd); V.sw = { k: 'draw', t: 0, dur: .4, wu: .1, ang, big: false };
      u.ring(V, R.p.x, R.p.y, 6, 50, .3, AW, 3, true);
      u.later(V, .1, () => { for (let i = -1; i <= 1; i++) { const a = ang + i * .26, x = R.p.x + cos(a) * 20, y = R.p.y + sin(a) * 20; V.pj.push({ k: 'arrow', x, y, a, spd: 1050, life: (s.range + 120) / 1050, mult: o.mult || .75, big: false, pierce: false, rad: 6, c: o.col || col(), at: s.arrow, hit: [], t: 0 }); } });
      return .2;
    },
    windblade(R, ang, o) {                                 // Hit 4 Rain of Windblades: panah raksasa ke tanah → badai angin kecil
      const u = FU(), V = u.st(R), t = nearest(R, R.p.x, R.p.y, 320), x = t ? t.x : R.p.x + cos(ang) * 200, y = t ? t.y : R.p.y + sin(ang) * 200, r = 95;
      V.sw = { k: 'draw', t: 0, dur: .45, wu: .2, ang, big: true }; u.ring(V, x, y, 12, r, .35, AW, 3, true);
      u.later(V, .22, () => u.add(V, { k: 'line', x1: x - 40, y1: y - 230, x2: x, y2: y, w: 14, life: .2, c: AW }));
      u.later(V, .35, () => {
        burst(R, x, y, r, AC, true); const h = inCircle(R, x, y, r); h.forEach((m) => { strike(R, m, o.mult || 1.9, { kb: 14, c: AW, n: 10 }); stunMob(m, .4); m.slow = Math.max(m.slow || 0, 1.5); });
        V.shk = Math.max(V.shk, 6); if (h.length) u.hitstop(R, .06);
      });
      for (let i = 1; i <= 5; i++) u.later(V, .35 + i * .3, () => {
        u.ring(V, x, y, 20, r * .9, .3, AW, 2); u.spark(V, x + rnd(-r, r) * .7, y + rnd(-r, r) * .5, 4, AW, { a: rnd(0, PI2), sp: .3, v0: 80, v1: 180 });
        inCircle(R, x, y, r * .9).forEach((m) => { strike(R, m, .3, { n: 3, c: AW }); m.slow = Math.max(m.slow || 0, 1); });
      });
      return .45;
    }
  };

  /* =====================  ENGINE UNIQUE  ===================== */
  const DEF = Object.freeze({ atk: 1, spd: 1, taken: 1, crit: 0, cd: 1, ls: 0, root: false, ghost: false, skr: 1, cc: false });   // skr = laju cooldown skill X & C (2 = cooldown 2× lebih cepat)
  let slowT = 0, slowK = 1; const CK = ['bdash', 'tempest', 'quake', 'charge', 'lock'];
  const S = (R) => R.u || (R.u = { cd: { z: 0, x: 0, c: 0, v: 0 }, on: {}, tm: {}, hold: null, pi: 0, last: -9, m: DEF });
  D.UNIQ = {};
  const cur = () => { const e = D.state && D.state.equipment; if (!e) return null; for (const s of ['weapon', 'offhand']) if (D.UNIQ[e[s]]) return D.UNIQ[e[s]]; return null; };

  const toggleSk = (n, i, c, msg) => ({ n, i, type: 'toggle', cd: .5,
    press(R, aim, u, k) { u.on[k] = !u.on[k]; D.FX.buffFx(R, c); fl(R, R.p.x, R.p.y - 28, `${msg} ${u.on[k] ? 'ON' : 'OFF'}`, c); } });
  const formSk = (n, i, c, cd, dur, msg, fn) => ({ n, i, type: 'cast', cd, status: (R, u) => (u.tm.form > 0 ? Math.ceil(u.tm.form) + 's' : ''),
    press(R, aim, u) { u.tm.form = dur; D.FX.buffFx(R, c); burst(R, R.p.x, R.p.y, 130, c, true); fl(R, R.p.x, R.p.y - 30, msg, c); if (fn) fn(R, u); D.Cine.flash(c, .25); } });

  D.Uniq = {
    cur, S, STEPS,
    /* ----- dipakai engine lain ----- */
    atkMul: (R) => (R.u ? R.u.m.atk : 1), spdMul: (R) => (R.u ? R.u.m.spd : 1), takenMul: (R) => (R.u ? R.u.m.taken : 1),
    critAdd: (R) => (R.u ? R.u.m.crit : 0), cdMul: (R) => (R.u ? R.u.m.cd : 1), lsExtra: (R) => (R.u ? R.u.m.ls : 0),
    rooted: (R) => !!(R.u && R.u.m.root), ccImmune: (R) => !!(R.u && R.u.m.cc),
    afterHurt(R, raw) { const d = cur(); if (d && d.afterHurt && R.u) d.afterHurt(R, raw, R.u); }, ghost: (R) => !!(R.u && R.u.m.ghost),
    onStrike(R, m, r) { const d = cur(); if (d && d.onStrike && !m.dead) d.onStrike(R, m, r); },

    /* basic attack: dipanggil FX.attack. true = pola unique menangani (pola standar dilewati) */
    attack(R, ang) {
      const d = cur(); if (!d || !d.pattern) return false; const u = S(R);
      if (u.bl || u.nv || u.ch) return true;                       // sedang channel Dragon Blitz / Supernova: tidak menyerang biasa
      if (R.t - u.last > R.s.cd + .8) u.pi = 0;
      const st = d.pattern[u.pi % d.pattern.length]; u.pi++; u.last = R.t;
      const ext = STEPS[st.t](R, ang, st) || 0; if (ext) R.atkT = Math.max(R.atkT, ext);
      return true;
    },

    press(k, aim) {
      const R = D.run; if (!R || R.done || R.pop) return false; const d = cur(); if (!d) return false; const sk = d.skills[k]; if (!sk) return false; const u = S(R);
      if (u.hold && u.hold.k !== k) return false;
      if (sk.block && sk.block(R, u)) { fl(R, R.p.x, R.p.y - 26, 'Tidak bisa dipakai sekarang', '#aaa'); return false; }
      if (u.cd[k] > 0) return false;
      if (u.ch || u.ad) this.cancelCh(R, u);                // pakai skill = batalkan charge Hold Attack
      if (sk.type === 'hold') { if (u.hold) return false; u.hold = { k, t: 0 }; if (sk.press(R, aim, u, k) === false) { u.hold = null; return false; } return true; }
      if (sk.press(R, aim, u, k) === false) return false;
      if (u.cd[k] <= 0) u.cd[k] = sk.cd;
      return true;
    },
    release(k) {
      const R = D.run; if (!R || !R.u || !R.u.hold || R.u.hold.k !== k) return;
      const d = cur(), sk = d && d.skills[k], u = R.u, h = u.hold; u.hold = null;
      if (sk && sk.release) sk.release(R, h, u); u.cd[k] = sk ? sk.cd : 1;
    },
    reset(R) { if (R && R.u) { const u = R.u; u.hold = null; u.ch = u.ad = u.tap = null; u.adLock = false; u.bl = u.nv = u.sg = u.rn = u.tn = u.ww = u.dm = null; u.sh = 0; u.tm.form = 0; } CK.concat('nova').forEach((k) => D.Cine.off(k)); slowT = 0; },
    /* slow-motion sesaat (detik NYATA, skala waktu k). Dipakai game.js: dt *= D.Uniq.timeScale(realDt) */
    slowmo(sec, k) { slowT = Math.max(slowT, sec); slowK = k; },
    timeScale(rdt) { if (slowT > 0 && D.run) { slowT -= rdt; return slowK; } slowT = 0; return 1; },
    releaseAll() { const R = D.run; if (R && R.u && R.u.hold) this.release(R.u.hold.k); },

    /* ---- Hold Basic Attack (tahan klik / tombol Serang ≥ holdAtk.th detik → charge, lepas → jurus) ----
       Tap singkat = basic attack biasa (pola combo). game.js memanggil atkDown tiap frame saat tombol ditekan, atkUp saat tidak. */
    hasHold() { const d = cur(); return !!(d && d.holdAtk); },
    atkDown(x, y) { const R = D.run; if (!R || R.done) return; const u = S(R); if (u.adLock) return; u.ad = u.ad || { t: 0 }; u.ad.w = { x, y }; },
    atkUp() {
      const R = D.run; if (!R || !R.u) return; const u = R.u; if (!u.ad && !u.adLock) return;
      const a = u.ad; u.ad = null; u.adLock = false;
      if (u.ch) this.fireCh(R, u);
      else if (a && !R.done && !R.pop && cur()) { const n = u.pi; D.attack(a.w.x, a.w.y); if (u.pi === n) u.tap = { x: a.w.x, y: a.w.y, t: .3 }; }   // tap ditolak (cooldown) → di-buffer 0.3 dtk
    },
    atkCancel() { const R = D.run; if (R && R.u) { if (R.u.ch || R.u.ad) this.cancelCh(R, R.u); R.u.adLock = false; R.u.tap = null; } },
    cancelCh(R, u) { if (u.ch) { u.ch = null; D.Cine.off('lock'); } if (u.ad) { u.ad = null; u.adLock = true; } },
    fireCh(R, u) { const d = cur(), c = u.ch; if (!d || !c) { u.ch = null; return; } u.ch = null; D.Cine.off('lock'); if (d.holdAtk.release) d.holdAtk.release(R, u, c); u.pi = 0; u.last = R.t; },

    update(R, dt) {
      const u = S(R), d = cur();
      for (const k in u.cd) if (u.cd[k] > 0) u.cd[k] -= dt * ((k === 'x' || k === 'c') && u.m ? (u.m.skr || 1) : 1);
      for (const k in u.tm) if (u.tm[k] > 0) u.tm[k] -= dt;
      if (u.cineOn && !(u.tm.cine > 0)) { CK.forEach((k) => D.Cine.off(k)); u.cineOn = false; }
      if (!d) { u.m = DEF; if (u.ch || u.ad) this.cancelCh(R, u); return; }
      if (u.sh > 0) {                                      // shield sementara: serap damage yang baru diterima (HP dikembalikan)
        const drop = (u.hp0 !== undefined ? u.hp0 : R.hp) - R.hp; if (drop > 0.01) { const ab = Math.min(u.sh, drop); R.hp += ab; u.sh -= ab; }
        u.shT -= dt; if (u.shT <= 0) u.sh = 0;
      }
      u.hp0 = R.hp;
      if (d.res) { if (u.rs === undefined) u.rs = 100; if (!d.res.noRegen || !d.res.noRegen(R, u)) u.rs = Math.min(100, u.rs + d.res.regen * dt); }   // resource Mana / Stamina (0-100)
      u.m = d.mods ? Object.assign({}, DEF, d.mods(R, u)) : DEF;
      if (d.tick) d.tick(R, dt, u);
      if (u.hold) { const sk = d.skills[u.hold.k]; u.hold.t += dt; if (sk.hold) sk.hold(R, dt, u.hold, u); if (sk.max && u.hold.t >= sk.max) this.release(u.hold.k); }
      if (u.tap) { u.tap.t -= dt; if (u.tap.t <= 0 || R.done) u.tap = null; else if (R.atkT <= 0) { const n = u.pi; D.attack(u.tap.x, u.tap.y); if (u.pi !== n) u.tap = null; } }
      const ha = d.holdAtk;
      if (ha && u.ad) {                                                              // Hold Attack: charge
        const a = u.ad; a.t += dt;
        if (!u.ch && !u.adLock && a.t >= ha.th && R.atkT <= 0 && !u.hold && !u.bl && !u.nv && !R.pop) { u.ch = { t: 0, k: 0, ang: 0, w: a.w }; u.tap = null; if (ha.start) ha.start(R, u, u.ch); }
        if (u.ch) {
          const c = u.ch; c.t += dt; c.k = Math.min(1, c.t / ha.max); c.w = a.w; c.ang = atan2(a.w.y - R.p.y, a.w.x - R.p.x); R.atkT = Math.max(R.atkT, .12);
          if (ha.tick) ha.tick(R, dt, u, c);
          if (c.t >= ha.max) { this.fireCh(R, u); u.adLock = true; }                 // penuh → otomatis lepas
        }
      }
      if (u.m.ghost) R.inv = Math.max(R.inv, .15);             // untargetable: kebal & musuh kehilangan jejak
    },

    /* info tombol HUD */
    slots(R) {
      const d = cur(); if (!d) return null; const u = S(R);
      return ['z', 'x', 'c', 'v'].map((k) => {
        const s = d.skills[k]; let st = '', on = false;
        if (u.on[k]) { st = 'ON'; on = true; }
        else if (u.hold && u.hold.k === k) { st = u.hold.t.toFixed(1) + 's'; on = true; }
        else if (s.block && s.block(R, u)) st = '🔒';
        else if (u.cd[k] > 0) st = Math.ceil(u.cd[k]) + 's';
        else st = (s.status && s.status(R, u)) || 'Siap';
        return { k, n: s.n, i: s.i, st, on };
      });
    },

    /* overlay gambar dunia (aura, zona) */
    draw(ctx, R, cx, cy) {
      const d = cur(); if (!d) return; const u = S(R), px = R.p.x - cx, py = R.p.y - cy, t = R.t;
      if (d.draw) d.draw(ctx, R, cx, cy, u);
      if (u.ch) {                                                                     // cincin progres charge Hold Attack + visual per role
        const k = u.ch.k; ctx.save(); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(px, py, 38, 0, PI2); ctx.stroke();
        ctx.lineWidth = 4; ctx.strokeStyle = k >= 1 ? GOLD : d.col; ctx.shadowColor = d.col; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(px, py, 38, -PI / 2, -PI / 2 + PI2 * k); ctx.stroke(); ctx.restore();
        if (d.holdAtk.draw) d.holdAtk.draw(ctx, R, cx, cy, u, u.ch, d);
      }
      if (u.sh > 0) { ctx.save(); ctx.strokeStyle = 'rgba(143,200,255,.9)'; ctx.lineWidth = 3; ctx.shadowColor = '#8fc4ff'; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(px, py, 26, 0, PI2); ctx.stroke(); ctx.restore(); }
      if (d.res && u.rs !== undefined) {                    // bar Mana / Stamina kecil di bawah karakter
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(px - 20, py + 24, 40, 5); ctx.fillStyle = d.res.c; ctx.fillRect(px - 19, py + 25, 38 * Math.max(0, u.rs) / 100, 3);
        ctx.font = '9px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.fillText(d.res.n + ' ' + Math.round(u.rs) + '%', px, py + 38); ctx.restore();
      }
      if (u.tm.form > 0) {                                  // aura bentuk ultimate
        const r = d.aura || 50, g = ctx.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, rgba(d.rgb, .05)); g.addColorStop(1, rgba(d.rgb, .3 + .08 * sin(t * 8)));
        ctx.save(); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, PI2); ctx.fill();
        ctx.setLineDash([7, 6]); ctx.lineDashOffset = -t * 40; ctx.strokeStyle = rgba(d.rgb, .9); ctx.lineWidth = 2; ctx.shadowColor = d.col; ctx.shadowBlur = 12; ctx.stroke(); ctx.restore();
      }
      if (u.bl) {                                           // zona Dragon Blitz + penanda charge
        const b = u.bl, r = b.r, k = Math.min(1, b.t / 5);
        ctx.save(); ctx.fillStyle = rgba(d.rgb, .1 + .1 * k); ctx.beginPath(); ctx.arc(px, py, r, 0, PI2); ctx.fill();
        ctx.setLineDash([9, 7]); ctx.lineDashOffset = -t * 50; ctx.strokeStyle = rgba(d.rgb, .95); ctx.lineWidth = 3; ctx.shadowColor = d.col; ctx.shadowBlur = 14; ctx.stroke();
        ctx.setLineDash([]); ctx.shadowBlur = 0; ctx.lineWidth = 4; ctx.strokeStyle = GOLD; ctx.beginPath(); ctx.arc(px, py, r * (.25 + .6 * k), 0, PI2); ctx.stroke();
        ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
        const tx = `${b.t.toFixed(1)}s  ledakan +${Math.round(Math.min(5, b.t) * 5)}%`; ctx.strokeText(tx, px, py - r - 10); ctx.fillText(tx, px, py - r - 10); ctx.restore();
      }
    }
  };

  /* =====================  KIT UNIQUE  ===================== */

  /* ---------- ASSASSIN — Dragonfang Dagger (kit utama, sesuai rancangan) ---------- */
  D.UNIQ.u_assassin = {
    id: 'u_assassin', col: FIRE, rgb: '255,122,58', aura: 85,
    /* pola: slash api ×2 → sembur api → teleport ke belakang musuh terdekat + combo basic attack normal */
    pattern: [
      { t: 'slash', dir: 1, mult: 1.1, col: FIRE, span: 2.6, range: 72, th: 34, burn: .35 },
      { t: 'slash', dir: -1, mult: 1.1, col: FIRE, span: 2.6, range: 72, th: 34, burn: .35 },
      { t: 'spray', mult: .55, col: FIRE, range: 125, half: .55, pulses: 3, burn: .4 },
      { t: 'tpcombo', col: FIRE, range: 340 }
    ],
    mods: (R, u) => ({ spd: u.tm.form > 0 ? 1.5 : 1, root: !!u.bl, ghost: !!u.bl, skr: u.tm.form > 0 ? 2 : 1 }),   // Ultimate Form: X & C cooldown 2× lebih cepat
    onStrike(R, m) { const u = S(R); if (u.on.z || u.tm.form > 0) burn(R, m, .9, 3, FIRE); },   // Burning Ashes / Ultimate Form: basic attack membakar
    tick(R, dt, u) {
      if (u.on.z) {                                                                 // Burning Ashes: bayar 0.1% HP maks / detik
        if (u.tm.form > 0) u.on.z = false;
        else { R.hp = Math.max(1, R.hp - R.s.hp * .001 * dt); if (R.hp <= 1) { u.on.z = false; fl(R, R.p.x, R.p.y - 28, 'HP habis — Ashes OFF', '#ff6b5a'); } }
        if (u.on.z && Math.random() < dt * 10) FU().spark(FU().st(R), R.p.x + rnd(-8, 8), R.p.y + 4, 1, FIRE, { a: -PI / 2, sp: .4, v0: 20, v1: 70, sz: 1.3 });
      }
      if (u.tm.form > 0) {                                                          // Ultimate Form: area kecil, musuh di dalamnya terbakar 2% HP / detik
        u.auraT = (u.auraT || 0) - dt; const V = FU().st(R);
        if (Math.random() < dt * 30) FU().spark(V, R.p.x + rnd(-60, 60), R.p.y + rnd(-30, 30), 1, Math.random() < .5 ? FIRE : GOLD, { a: -PI / 2, sp: .3, v0: 30, v1: 90, sz: 1.5 });
        if (u.auraT <= 0) {
          u.auraT = 1;
          inCircle(R, R.p.x, R.p.y, 85).forEach((m) => { C().trueHit(m, .02 * Math.min(m.max, 1e6)); FU().spark(V, m.x, m.y, 8, FIRE, { a: -PI / 2, sp: .9 }); });
        }
      }
    },
    skills: {
      z: Object.assign(toggleSk('Burning Ashes', '🔥', FIRE, 'BURNING ASHES'), { block: (R, u) => u.tm.form > 0 }),   // tidak bisa dipakai saat Ultimate Form
      x: { n: 'Burning Dash', i: '💨', type: 'cast', cd: 8,
        press(R, aim, u) {
          const u2 = FU(), V = u2.st(R), ang = aim.ang, MAX = 230; let tgt = null, ba = 1e9;
          for (const m of alive(R)) { const dx = m.x - R.p.x, dy = m.y - R.p.y, al = dx * cos(ang) + dy * sin(ang), pe = Math.abs(-dx * sin(ang) + dy * cos(ang)); if (al > 0 && al < MAX + m.r && pe < m.r + 28 && al < ba) { ba = al; tgt = m; } }
          R.atkT = Math.max(R.atkT, .3);
          if (!tgt) { dashAlong(R, ang, MAX); u2.ring(V, R.p.x, R.p.y, 6, 50, .3, FIRE, 4, true); u.cd.x = 3; return; }
          const a = atan2(tgt.y - R.p.y, tgt.x - R.p.x); dashAlong(R, a, Math.max(0, ba - (tgt.r + 22))); R.inv = Math.max(R.inv, .9);
          D.Cine.on('bdash', { bars: 1, zoom: .1, vig: .65 }); u.tm.cine = 1.15; u.cineOn = true; R.hs = Math.max(R.hs || 0, .12);        // auto masuk cutscene
          u2.later(V, .04, () => {
            D.Cine.invert(.3); D.Cine.flash(FIRE, .25);                                                                                   // layar invert
            const a2 = tgt.dead ? a : atan2(tgt.y - R.p.y, tgt.x - R.p.x); V.sw = { k: 'smash', t: 0, dur: .4, ang: a2, lunge: 10 };
            u2.add(V, { k: 'arc', fol: 1, a: a2, dir: 1, span: 1.5, r: 175, th: 64, life: .45, sw: .35, c: FIRE });
            u2.add(V, { k: 'arc', fol: 1, a: a2, dir: -1, span: 1.2, r: 140, th: 40, life: .4, sw: .3, c: GOLD });
            u2.spark(V, R.p.x + cos(a2) * 30, R.p.y + sin(a2) * 30, 46, FIRE, { a: a2, sp: .75, v0: 160, v1: 440, l: 1.6, sz: 1.6 });
            u2.ring(V, R.p.x + cos(a2) * 90, R.p.y + sin(a2) * 90, 10, 110, .4, FIRE, 7, true);
            inCone(R, R.p.x, R.p.y, a2, 175, .75).forEach((m) => { strike(R, m, 2.2, { kb: 26, c: FIRE, n: 12, ang: a2 }); burn(R, m, 1.2, 3, FIRE); });   // cone AOE + burn
            V.shk = Math.max(V.shk, 11); u2.hitstop(R, .08); fl(R, R.p.x, R.p.y - 30, 'BURNING DASH!', FIRE);
          });
          u.cd.x = 8;
        } },
      c: { n: 'Dragon Blitz', i: '🐉', type: 'hold', cd: 14, max: 5,
        status: (R, u) => '', 
        press(R, aim, u) {
          const u2 = FU(), V = u2.st(R), r = 115; u.bl = { t: 0, cut: .1, r };
          burst(R, R.p.x, R.p.y, r, FIRE, true); fl(R, R.p.x, R.p.y - 30, 'DRAGON BLITZ', FIRE); V.sw = { k: 'finish', t: 0, dur: .5, ang: aim.ang, lunge: 0 };
          inCircle(R, R.p.x, R.p.y, r).forEach((m) => strike(R, m, 1, { n: 8, c: FIRE }));                       // musuh di AOE langsung kena
          R.inv = Math.max(R.inv, .3);
        },
        hold(R, dt, h, u) {                                  // slash beruntun gaya basic attack Assassin di dalam AOE
          const b = u.bl; if (!b) return; b.t = h.t; b.cut -= dt; R.inv = Math.max(R.inv, .15);
          if (b.cut <= 0) {
            b.cut = .26; const u2 = FU(), V = u2.st(R), t = nearest(R, R.p.x, R.p.y, b.r), x = t ? t.x : R.p.x + rnd(-b.r, b.r) * .8, y = t ? t.y : R.p.y + rnd(-b.r, b.r) * .8, a = rnd(0, PI);
            V.gh.push({ x: R.p.x, y: R.p.y, a, life: .25, max: .25, c: FIRE });
            for (const k of [0, PI / 2]) u2.add(V, { k: 'line', x1: x - cos(a + k) * 62, y1: y - sin(a + k) * 62, x2: x + cos(a + k) * 62, y2: y + sin(a + k) * 62, w: 9, life: .18, c: k ? GOLD : FIRE });
            u2.ring(V, x, y, 4, 40, .2, '#fff', 3); u2.spark(V, x, y, 6, FIRE, {});
            inCircle(R, x, y, 46).forEach((m) => { if (hyp(m.x - R.p.x, m.y - R.p.y) < b.r + m.r) strike(R, m, .35, { n: 3, c: FIRE }); });
          }
        },
        release(R, h, u) {                                   // meledak: 2× basic attack, +5% tiap detik di-hold (maks 5 dtk)
          const b = u.bl; u.bl = null; if (!b) return; const u2 = FU(), V = u2.st(R), mult = 2 * (1 + .05 * Math.min(5, h.t)), r = b.r * 1.15;
          burst(R, R.p.x, R.p.y, r, FIRE, true); u2.ring(V, R.p.x, R.p.y, 10, r * 1.2, .5, GOLD, 8, true);
          const hit = inCircle(R, R.p.x, R.p.y, r); hit.forEach((m) => { strike(R, m, mult, { kb: 22, c: FIRE, n: 14 }); burn(R, m, .8, 3, FIRE); });
          V.shk = Math.max(V.shk, 12); if (hit.length) u2.hitstop(R, .1); D.Cine.flash(FIRE, .2); R.inv = Math.max(R.inv, .4);
          fl(R, R.p.x, R.p.y - 34, `LEDAKAN ×${mult.toFixed(2)}`, GOLD);
        } },
      v: formSk('ULTIMATE FORM', '🌋', FIRE, 90, 15, 'ULTIMATE FORM!', (R, u) => { u.on.z = false; })
    }
  };

  /* ---------- FIGHTER — Ironwill Greataxe ---------- */
  const FC = '#e0653a', BR = '#cd7f32';
  D.UNIQ.u_fighter = {
    id: 'u_fighter', col: FC, rgb: '205,127,50', aura: 70,
    pattern: [                                                                      // Heavy Impact: Overhead Cleave → Horizontal Sweep → Shoulder Tackle+Spin → Earthshatter Slam
      { t: 'overhead', mult: 1.5, r: 82, col: FC },
      { t: 'slash', dir: -1, mult: 1.4, col: FC, span: 3.7, range: 118, th: 42, kb: 10, lunge: 12 },
      { t: 'tackle', mult: 1.0, spin: 1.3, col: FC, dash: 58 },
      { t: 'quake', mult: 2.8, r: 125, col: FC }
    ],
    holdAtk: {                                                                      // Charge Slash: tahan ≤2 dtk (hyper-armor), lepas = ayunan raksasa, abaikan 30% Armor
      th: .25, max: 2,
      start(R, u, c) { D.FX.buffFx(R, FC); fl(R, R.p.x, R.p.y - 30, 'CHARGE SLASH', FC); },
      tick(R, dt, u, c) { if (Math.random() < dt * (10 + 30 * c.k)) FU().spark(FU().st(R), R.p.x + rnd(-26, 26), R.p.y + rnd(-6, 20), 1, c.k >= 1 ? GOLD : FC, { a: -PI / 2, sp: .3, v0: 30, v1: 100, sz: 1.3 }); if (c.k >= 1 && !c.full) { c.full = true; FU().ring(FU().st(R), R.p.x, R.p.y, 10, 70, .3, GOLD, 4, true); } },
      release(R, u, c) {
        const u2 = FU(), V = u2.st(R), k = c.k, a = c.ang, mult = (2.2 + 3.3 * k) * 1.3, rng = 150 + 25 * k;        // ×1.3 ≈ abaikan 30% armor
        V.sw = { k: 'smash', t: 0, dur: .45, ang: a, lunge: 16 }; R.atkT = Math.max(R.atkT, .5); R.inv = Math.max(R.inv, .15);
        u2.add(V, { k: 'arc', fol: 1, a, dir: 1, span: 3.6, r: rng + 10, th: 66, life: .42, sw: .4, c: FC }); u2.add(V, { k: 'arc', fol: 1, a, dir: -1, span: 3.0, r: rng - 25, th: 34, life: .36, sw: .3, c: GOLD });
        u2.later(V, .12, () => {
          const h = inCone(R, R.p.x, R.p.y, a, rng, 1.5); burst(R, R.p.x + cos(a) * 60, R.p.y + sin(a) * 60, 90 + 40 * k, FC, true);
          h.forEach((m) => strike(R, m, mult, { kb: 24 + 20 * k, c: FC, n: 12, ang: a })); V.shk = Math.max(V.shk, 8 + 6 * k); if (h.length) u2.hitstop(R, .06 + .05 * k); D.Cine.flash(FC, .15);
        });
        fl(R, R.p.x, R.p.y - 34, `CHARGE SLASH ×${mult.toFixed(1)}`, k >= 1 ? GOLD : FC);
      },
      draw(ctx, R, cx, cy, u, c) { const px = R.p.x - cx, py = R.p.y - cy; ctx.save(); ctx.strokeStyle = rgba('224,101,58', .55 + .35 * c.k); ctx.lineWidth = 3; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -R.t * 40; ctx.shadowColor = FC; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(px, py, 150 + 25 * c.k, c.ang - 1.5, c.ang + 1.5); ctx.stroke(); ctx.restore(); }
    },
    mods: (R, u) => ({ cd: u.on.z ? 1 / 1.3 : 1, ls: u.on.z ? .05 : 0, spd: u.ww ? .6 : u.ch ? .5 : 1, taken: (u.tm.form > 0 ? .6 : 1) * (u.ch ? .75 : 1), cc: u.tm.form > 0 || !!u.ch }),   // charge = hyper-armor (kebal CC, damage diterima -25%)
    tick(R, dt, u) {
      const V = FU().st(R);
      if (u.on.z) {                                                                 // Bloodlust Berserk: -1% HP / detik (berhenti di 10% HP)
        if (u.tm.form > 0) u.on.z = false;
        else { R.hp = Math.max(1, R.hp - R.s.hp * .01 * dt); if (R.hp < R.s.hp * .1) { u.on.z = false; fl(R, R.p.x, R.p.y - 28, 'HP rendah — Bloodlust OFF', '#ff6b5a'); } }
        if (u.on.z && Math.random() < dt * 14) FU().spark(V, R.p.x + rnd(-10, 10), R.p.y + 6, 1, '#d1303f', { a: -PI / 2, sp: .4, v0: 20, v1: 70, sz: 1.3 });
      }
      if (u.ww) {                                                                   // Executioner's Whirlwind: putar kapak + vakum musuh
        const w = u.ww; w.tk -= dt; w.sp -= dt;
        for (const m of alive(R)) { const dx = R.p.x - m.x, dy = R.p.y - m.y, d = hyp(dx, dy); if (d > 175 || d < 30) continue; const sp = Math.min(d - 28, (m.isBoss ? 40 : 150) * dt); C().move(R, m, dx / d * sp, dy / d * sp, m.r - 2); }
        if (w.sp <= 0) { w.sp = .28; w.a += 2.1; V.sw = { k: 'flurry', t: 0, dur: .3, ang: w.a, lunge: 0 }; FU().add(V, { k: 'arc', fol: 1, a: w.a, dir: 1, span: 4.2, r: 112, th: 34, life: .3, sw: .4, c: FC }); }
        if (w.tk <= 0) { w.tk = .35; inCircle(R, R.p.x, R.p.y, 118).forEach((m) => strike(R, m, .4, { n: 3, c: FC })); }
        R.atkT = Math.max(R.atkT, .2);
      }
      if (u.tm.form > 0) {                                                          // Avatar of Iron: aura Shockwave konstan
        u.auraT = (u.auraT || 0) - dt;
        if (Math.random() < dt * 20) FU().spark(V, R.p.x + rnd(-30, 30), R.p.y + rnd(-26, 26), 1, BR, { a: -PI / 2, sp: .3, v0: 20, v1: 60, sz: 1.5 });
        if (u.auraT <= 0) { u.auraT = .5; FU().ring(V, R.p.x, R.p.y, 10, 110, .4, BR, 4, true); inCircle(R, R.p.x, R.p.y, 110).forEach((m) => strike(R, m, .45, { kb: 8, c: BR, n: 3 })); V.shk = Math.max(V.shk, 1.5); }
      }
    },
    draw(ctx, R, cx, cy, u) {
      const px = R.p.x - cx, py = R.p.y - cy, t = R.t;
      if (u.tm.form > 0) {                                                          // tubuh perunggu raksasa
        ctx.save(); const g = ctx.createRadialGradient(px, py - 6, 4, px, py - 6, 34); g.addColorStop(0, 'rgba(255,214,140,.55)'); g.addColorStop(1, 'rgba(160,90,30,.15)');
        ctx.fillStyle = g; ctx.strokeStyle = 'rgba(255,200,120,.9)'; ctx.lineWidth = 3; ctx.shadowColor = BR; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(px, py - 6, 30 + 2 * sin(t * 5), 0, PI2); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      if (u.ww) {
        const w = u.ww, k = Math.min(1, w.t / 5); ctx.save(); ctx.strokeStyle = rgba('224,101,58', .9); ctx.lineWidth = 3; ctx.shadowColor = FC; ctx.shadowBlur = 12; ctx.setLineDash([16, 10]); ctx.lineDashOffset = -t * 80;
        ctx.beginPath(); ctx.arc(px, py, 118, 0, PI2); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = GOLD; ctx.beginPath(); ctx.arc(px, py, 118 * (.2 + .7 * k), 0, PI2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
        const tx = `${w.t.toFixed(1)}s  ledakan +${Math.round(Math.min(5, w.t) * 5)}%`; ctx.strokeText(tx, px, py - 128); ctx.fillText(tx, px, py - 128); ctx.restore();
      }
    },
    skills: {
      z: Object.assign(toggleSk('Bloodlust Berserk', '🩸', FC, 'BLOODLUST'), { block: (R, u) => u.tm.form > 0 }),   // AS +30%, lifesteal 5%, -1% HP/dtk; terkunci saat Ultimate
      x: { n: 'Seismic Slam', i: '🪓', type: 'cast', cd: 9,
        press(R, aim, u) {
          const u2 = FU(), V = u2.st(R), ang = aim.ang, L = Math.max(70, Math.min(240, hyp(aim.x - R.p.x, aim.y - R.p.y)));
          dashAlong(R, ang, L); R.inv = Math.max(R.inv, .6); R.atkT = Math.max(R.atkT, .5);                    // melompat ke kursor
          D.Cine.on('quake', { bars: .7, zoom: .1, vig: .45 }); u.tm.cine = .75; u.cineOn = true;               // cinematic singkat: zoom-in
          u2.later(V, .12, () => {
            V.sw = { k: 'smash', t: 0, dur: .45, ang, lunge: 10 }; const x = R.p.x, y = R.p.y;
            for (let i = 0; i < 9; i++) { const a = ang + (i - 4) * .17, l = rnd(120, 175), j = rnd(-.15, .15); u2.add(V, { k: 'line', x1: x, y1: y, x2: x + cos(a) * l * .5, y2: y + sin(a) * l * .5 + 0, w: 6, life: .7, c: '#d9cba0' }); u2.add(V, { k: 'line', x1: x + cos(a) * l * .5, y1: y + sin(a) * l * .5, x2: x + cos(a + j) * l, y2: y + sin(a + j) * l, w: 4, life: .7, c: '#8a6a3a' }); }   // tanah retak
            u2.ring(V, x + cos(ang) * 80, y + sin(ang) * 80, 10, 120, .4, '#d9cba0', 7, true); u2.spark(V, x + cos(ang) * 40, y + sin(ang) * 40, 40, '#d9cba0', { a: ang, sp: .8, v0: 120, v1: 380, l: 1.5, sz: 1.5 });
            const h = inCone(R, x, y, ang, 170, .8); h.forEach((m) => { strike(R, m, 3, { kb: 16, c: '#d9cba0', n: 12, ang }); stunMob(m, 1.5); });   // damage fisik besar + Stun 1.5 dtk
            V.shk = Math.max(V.shk, 14); u2.hitstop(R, .09); fl(R, x, y - 30, 'SEISMIC SLAM!', '#d9cba0');
          });
        } },
      c: { n: "Executioner's Whirlwind", i: '🌀', type: 'hold', cd: 14, max: 5,
        press(R, aim, u) { u.ww = { t: 0, tk: .1, sp: 0, a: aim.ang }; burst(R, R.p.x, R.p.y, 110, FC, true); fl(R, R.p.x, R.p.y - 30, "EXECUTIONER'S WHIRLWIND", FC); },
        hold(R, dt, h, u) { if (u.ww) u.ww.t = h.t; },
        release(R, h, u) {                                   // ledakan pungkasan +5%/dtk; musuh HP < 20% → True Damage
          const w = u.ww; u.ww = null; if (!w) return; const u2 = FU(), V = u2.st(R), mult = 3 * (1 + .05 * Math.min(5, h.t)), r = 150; let tr = 0;
          burst(R, R.p.x, R.p.y, r, FC, true); u2.ring(V, R.p.x, R.p.y, 10, r * 1.2, .5, GOLD, 8, true);
          const hit = inCircle(R, R.p.x, R.p.y, r);
          hit.forEach((m) => { if (m.max && m.hp < m.max * .2) { C().trueHit(m, R.s.atk * mult); tr++; u2.spark(V, m.x, m.y, 14, '#d79cff', {}); } else strike(R, m, mult, { kb: 20, c: FC, n: 12 }); });
          V.shk = Math.max(V.shk, 12); if (hit.length) u2.hitstop(R, .1); D.Cine.flash(FC, .2);
          fl(R, R.p.x, R.p.y - 34, `LEDAKAN ×${mult.toFixed(2)}${tr ? ' · TRUE' : ''}`, tr ? '#d79cff' : GOLD);
        } },
      v: formSk('Avatar of Iron', '🗿', BR, 90, 14, 'AVATAR OF IRON!', (R, u) => { u.on.z = false; })   // Z terkunci, kebal CC, Armor +100% (≈ damage diterima ×0.6)
    }
  };

  /* ---------- MAGE — Embercall Staff ---------- */
  const MC = '#ff7a3a', MC2 = '#ffb06a';
  const meteor = (R, x, y, r, mult, delay) => {            // meteor kecil: telegraph → hantam → damage api AoE + Knockup (≈ stun singkat + dorong)
    const u = FU(), V = u.st(R); u.ring(V, x, y, r, r, delay, '#ff5a4a', 3, true); u.ring(V, x, y, r * .3, r * .9, delay, MC2, 3, true);
    u.later(V, delay, () => { burst(R, x, y, r, MC, true); inCircle(R, x, y, r).forEach((m) => { strike(R, m, mult, { kb: 12, c: MC, n: 10 }); burn(R, m, .8, 3); stunMob(m, .9); u.spark(V, m.x, m.y, 8, MC2, { a: -PI / 2, sp: .5, v0: 100, v1: 260 }); }); V.shk = Math.max(V.shk, 7); });
  };
  D.UNIQ.u_mage = {
    id: 'u_mage', col: MC, rgb: '255,122,58', aura: 48, res: { n: 'MANA', c: '#6fe0ff', regen: 3, noRegen: (R, u) => u.on.z },
    /* pola: 3 bola api beruntun (3× kena musuh sama → ledakan kecil +2% Mana) */
    pattern: [                                                                      // Catalyst: Twin Ember → Flame Step+Arcane Arc → Fiery Vortex → Ignition Erupt
      { t: 'twinEmber', mult: .7, col: MC },
      { t: 'flameStep', mult: 1.2, col: MC },
      { t: 'vortex', mult: 1.0, r: 80, col: MC },
      { t: 'erupt', mult: 1.5, col: MC }
    ],
    holdAtk: {                                                                      // Flame Dash Blast: tahan = jarak & damage naik; lepas = teleport-dash menembus musuh, meledak di belakangnya
      th: .25, max: 1.5,
      start(R, u, c) { D.FX.buffFx(R, MC); fl(R, R.p.x, R.p.y - 30, 'FLAME DASH', MC); },
      tick(R, dt, u, c) { if (Math.random() < dt * 30) { const a = rnd(0, PI2); FU().spark(FU().st(R), R.p.x + cos(a) * 24, R.p.y + sin(a) * 24, 1, Math.random() < .5 ? MC : GOLD, { a: a + PI, sp: .2, v0: 30, v1: 90 }); } },
      release(R, u, c) {
        const u2 = FU(), V = u2.st(R), k = c.k, a = c.ang, L = 190 + 150 * k, hit = inLine(R, R.p.x, R.p.y, a, L, 56); let dist = L;
        if (hit.length) { let far = 0; for (const m of hit) far = Math.max(far, (m.x - R.p.x) * cos(a) + (m.y - R.p.y) * sin(a) + m.r); dist = Math.min(L + 70, far + 50); }   // berhenti sedikit di belakang musuh terjauh
        hit.forEach((m) => { strike(R, m, 1.3 * (1 + .5 * k), { kb: 6, c: MC, n: 8, ang: a }); burn(R, m, .3, 2, MC); });
        R.inv = Math.max(R.inv, .6); R.atkT = Math.max(R.atkT, .45); dashAlong(R, a, dist); V.sw = { k: 'raise', t: 0, dur: .4, ang: a };
        u2.add(V, { k: 'line', x1: R.p.x - cos(a) * dist, y1: R.p.y - sin(a) * dist, x2: R.p.x, y2: R.p.y, w: 26, life: .25, c: MC });
        u2.later(V, .1, () => {
          const r = 105 + 30 * k; burst(R, R.p.x, R.p.y, r, MC, true); u2.ring(V, R.p.x, R.p.y, 10, r * 1.2, .45, GOLD, 7, true);
          const h = inCircle(R, R.p.x, R.p.y, r); h.forEach((m) => { strike(R, m, 2.4 * (1 + .6 * k), { kb: 18, c: MC, n: 14 }); burn(R, m, .7, 3, MC); stunMob(m, .6); });
          V.shk = Math.max(V.shk, 10); if (h.length) u2.hitstop(R, .08); D.Cine.flash(MC, .2); fl(R, R.p.x, R.p.y - 34, `IGNITION ×${(2.4 * (1 + .6 * k)).toFixed(1)}`, GOLD);
        });
      },
      draw(ctx, R, cx, cy, u, c) { const px = R.p.x - cx, py = R.p.y - cy, L = 190 + 150 * c.k; ctx.save(); ctx.strokeStyle = rgba('255,122,58', .7); ctx.lineWidth = 3; ctx.setLineDash([10, 8]); ctx.lineDashOffset = -R.t * 60; ctx.shadowColor = MC; ctx.shadowBlur = 10; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + cos(c.ang) * L, py + sin(c.ang) * L); ctx.stroke(); ctx.setLineDash([]); ctx.beginPath(); ctx.arc(px + cos(c.ang) * L, py + sin(c.ang) * L, 14, 0, PI2); ctx.stroke(); ctx.restore(); }
    },
    mods: (R, u) => ({ atk: u.on.z ? 1.2 : 1, root: !!u.nv, spd: u.ch ? .6 : 1 }),
    tick(R, dt, u) {
      if (u.on.z) {                                                                 // Combustion Field: -0.5% Mana / detik (+0.5% tiap menyihir)
        u.rs = Math.max(0, u.rs - .5 * dt); if (u.rs <= 0) { u.on.z = false; fl(R, R.p.x, R.p.y - 28, 'Mana habis — Field OFF', '#ff6b5a'); }
        if (Math.random() < dt * 14) { const a = rnd(0, PI2); FU().spark(FU().st(R), R.p.x + cos(a) * 20, R.p.y + sin(a) * 20, 1, MC, { a: -PI / 2, sp: .4, v0: 20, v1: 60, sz: 1.3 }); }
      }
      if (u.sg) {                                                                   // Inferno Singularity: tarik musuh ke pusat + damage konstan (radius tumbuh)
        const g = u.sg; g.r = 80 + 28 * Math.min(5, g.t); g.tk -= dt;
        for (const m of alive(R)) { const dx = g.x - m.x, dy = g.y - m.y, d = hyp(dx, dy); if (d > g.r * 1.3 || d < 12) continue; const sp = Math.min(d, (m.isBoss ? 35 : 130) * dt); C().move(R, m, dx / d * sp, dy / d * sp, m.r - 2); }
        if (g.tk <= 0) { g.tk = .4; inCircle(R, g.x, g.y, g.r).forEach((m) => strike(R, m, .3, { n: 2, c: MC })); }
        if (Math.random() < dt * 40) { const a = rnd(0, PI2), r = rnd(g.r * .4, g.r); FU().spark(FU().st(R), g.x + cos(a) * r, g.y + sin(a) * r, 1, Math.random() < .5 ? MC : GOLD, { a: a + PI, sp: .2, v0: 40, v1: 110 }); }
      }
    },
    draw(ctx, R, cx, cy, u) {
      const t = R.t, px = R.p.x - cx, py = R.p.y - cy;
      if (u.on.z) { ctx.save(); ctx.strokeStyle = rgba('255,122,58', .7); ctx.lineWidth = 2; ctx.shadowColor = MC; ctx.shadowBlur = 10; ctx.setLineDash([4, 5]); ctx.lineDashOffset = -t * 30; ctx.beginPath(); ctx.arc(px, py, 30 + 2 * sin(t * 6), 0, PI2); ctx.stroke(); ctx.restore(); }
      if (u.sg) {
        const g = u.sg, gx = g.x - cx, gy = g.y - cy, k = Math.min(1, g.t / 5); ctx.save();
        const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, g.r); gr.addColorStop(0, rgba('40,0,0', .75)); gr.addColorStop(.5, rgba('255,90,40', .2 + .15 * k)); gr.addColorStop(1, rgba('255,122,58', 0));
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(gx, gy, g.r, 0, PI2); ctx.fill();
        ctx.lineWidth = 3; ctx.shadowColor = MC; ctx.shadowBlur = 12;
        for (let i = 0; i < 3; i++) { ctx.strokeStyle = i ? rgba('255,213,74', .7) : rgba('255,122,58', .9); ctx.setLineDash([14, 10]); ctx.lineDashOffset = t * (60 + 25 * i) * (i % 2 ? -1 : 1); ctx.beginPath(); ctx.arc(gx, gy, g.r * (1 - i * .25), 0, PI2); ctx.stroke(); }
        ctx.setLineDash([]); ctx.shadowBlur = 0; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
        const tx = `${g.t.toFixed(1)}s  ledakan +${Math.round(Math.min(5, g.t) * 5)}%`; ctx.strokeText(tx, gx, gy - g.r - 8); ctx.fillText(tx, gx, gy - g.r - 8); ctx.restore();
      }
      if (u.nv) {                                                                   // Supernova: layar meredup + bola api raksasa di atas karakter
        const n = u.nv, k = Math.min(1, n.t / 5); ctx.save();
        ctx.fillStyle = `rgba(0,0,0,${.4 * Math.min(1, n.t / .6)})`; ctx.fillRect(0, 0, 960, 540);
        ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(px, py + 14, 26 + 24 * k, 8 + 6 * k, 0, 0, PI2); ctx.fill();   // bayangan di tanah
        const by = py - 78 - 8 * sin(t * 3), r = 16 + 40 * k, g = ctx.createRadialGradient(px, by, 0, px, by, r * 1.9);
        g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(.3, 'rgba(255,210,90,.95)'); g.addColorStop(.6, 'rgba(255,100,40,.55)'); g.addColorStop(1, 'rgba(255,60,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, by, r * 1.9, 0, PI2); ctx.fill();
        ctx.strokeStyle = rgba('255,213,74', .8); ctx.lineWidth = 2; ctx.shadowColor = MC; ctx.shadowBlur = 16;
        for (let i = 0; i < 8; i++) { const a = i * PI / 4 + t * 1.5, l = r * (1.3 + .4 * sin(t * 7 + i)); ctx.beginPath(); ctx.moveTo(px + cos(a) * r, by + sin(a) * r); ctx.lineTo(px + cos(a) * r * 1.9 * l / r * .8, by + sin(a) * r * 1.9 * l / r * .8); ctx.stroke(); }
        ctx.shadowBlur = 0; ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.lineWidth = 3;
        const tx = `${n.t.toFixed(1)}s  ledakan +${Math.round(Math.min(5, n.t) * 5)}%`; ctx.strokeText(tx, px, by - r * 1.9 - 8); ctx.fillText(tx, px, by - r * 1.9 - 8); ctx.restore();
      }
    },
    skills: {
      z: Object.assign(toggleSk('Combustion Field', '🔥', MC, 'COMBUSTION'), {            // Magic damage +20%, Mana -0.5%/dtk
        press(R, aim, u, k) { if (!u.on[k] && u.rs < 3) { fl(R, R.p.x, R.p.y - 28, 'Mana kurang', '#aaa'); return false; } u.on[k] = !u.on[k]; D.FX.buffFx(R, MC); fl(R, R.p.x, R.p.y - 28, `COMBUSTION ${u.on[k] ? 'ON' : 'OFF'}`, MC); } }),
      x: { n: 'Meteor Blink', i: '☄️', type: 'cast', cd: 9,
        press(R, aim, u) {
          const u2 = FU(), V = u2.st(R), a = atan2(aim.y - R.p.y, aim.x - R.p.x), L = Math.min(340, hyp(aim.x - R.p.x, aim.y - R.p.y)); let f = 1, ok = false, nx = R.p.x, ny = R.p.y;
          for (; f > .1; f -= .05) { nx = R.p.x + cos(a) * L * f; ny = R.p.y + sin(a) * L * f; if (walkOk(R, nx, ny)) { ok = true; break; } }
          if (!ok || L < 40) { fl(R, R.p.x, R.p.y - 26, 'Tujuan tidak valid', '#aaa'); return false; }
          const ox = R.p.x, oy = R.p.y; V.gh.push({ x: ox, y: oy, a, life: .4, max: .4, c: MC }); u2.ring(V, ox, oy, 6, 50, .3, MC2, 4, true);
          R.p.x = nx; R.p.y = ny; R.inv = Math.max(R.inv, .9); R.atkT = Math.max(R.atkT, .3);
          u2.ring(V, nx, ny, 6, 56, .3, '#fff', 3, true); u2.flash(V, nx, ny, 36, .16, MC);
          meteor(R, ox, oy, 100, 2.4, .55); meteor(R, nx, ny, 100, 2.4, .55); fl(R, nx, ny - 30, 'METEOR BLINK!', MC);   // meteor di titik asal & tujuan
        } },
      c: { n: 'Inferno Singularity', i: '🌀', type: 'hold', cd: 14, max: 5,
        press(R, aim, u) {
          const p = clampPt(R, aim, 300), V = FU().st(R); u.sg = { x: p.x, y: p.y, r: 80, t: 0, tk: .2 };
          burst(R, p.x, p.y, 90, MC, true); fl(R, p.x, p.y - 30, 'INFERNO SINGULARITY', MC); R.atkT = Math.max(R.atkT, .3);
        },
        hold(R, dt, h, u) { if (u.sg) u.sg.t = h.t; },
        release(R, h, u) {                                   // ledakan pungkasan: 3× ATK, +5% per detik hold
          const g = u.sg; u.sg = null; if (!g) return; const u2 = FU(), V = u2.st(R), mult = 3 * (1 + .05 * Math.min(5, h.t)), r = g.r * 1.1;
          burst(R, g.x, g.y, r, MC, true); u2.ring(V, g.x, g.y, 10, r * 1.25, .5, GOLD, 8, true);
          const hit = inCircle(R, g.x, g.y, r); hit.forEach((m) => { strike(R, m, mult, { kb: 18, c: MC, n: 14 }); burn(R, m, .8, 3); stunMob(m, .6); });
          V.shk = Math.max(V.shk, 11); if (hit.length) u2.hitstop(R, .09); D.Cine.flash(MC, .2); fl(R, g.x, g.y - 34, `LEDAKAN ×${mult.toFixed(2)}`, GOLD);
        } },
      v: { n: 'Supernova Cataclysm', i: '🌠', type: 'hold', cd: 90, max: 5,
        press(R, aim, u) {
          u.nv = { t: 0 }; D.Cine.on('nova', { bars: 1, zoom: .05, vig: .95 }); D.Cine.flash('#ffb06a', .3);     // letterbox + vignette + kamera meredup
          D.FX.buffFx(R, MC); fl(R, R.p.x, R.p.y - 34, 'SUPERNOVA CATACLYSM', MC); R.atkT = Math.max(R.atkT, .3);
        },
        hold(R, dt, h, u) { const n = u.nv; if (!n) return; n.t = h.t; const V = FU().st(R), a = rnd(0, PI2), r = rnd(50, 110); FU().spark(V, R.p.x + cos(a) * r, R.p.y - 70 + sin(a) * r * .6, 1, Math.random() < .5 ? MC : GOLD, { a: a + PI, sp: .15, v0: 60, v1: 150, sz: 1.4 }); },
        release(R, h, u) {                                   // bola api menghantam tanah: bakar SELURUH arena, +5% per detik hold
          const n = u.nv; u.nv = null; D.Cine.off('nova'); if (!n) return; const u2 = FU(), V = u2.st(R), mult = 8 * (1 + .05 * Math.min(5, h.t));
          D.Cine.flash('#fff', .45); D.Cine.invert(.12);
          for (let i = 0; i < 4; i++) u2.ring(V, R.p.x, R.p.y, 10, 260 + i * 160, .4 + i * .15, i % 2 ? GOLD : MC, 8, true);
          burst(R, R.p.x, R.p.y, 200, MC, true);
          const all = alive(R); all.forEach((m) => { strike(R, m, mult, { kb: 20, c: MC, n: 14 }); burn(R, m, 1.5, 4, MC); stunMob(m, .8); });
          V.shk = Math.max(V.shk, 18); if (all.length) u2.hitstop(R, .12); R.atkT = Math.max(R.atkT, .5);
          fl(R, R.p.x, R.p.y - 36, `CATACLYSM ×${mult.toFixed(2)}`, GOLD);
        } }
    }
  };

  /* ---------- TANK — Bastion Aegis ---------- */
  const TC = '#3498db', HOLY = '#ffe9a0';
  D.UNIQ.u_tank = {
    id: 'u_tank', col: TC, rgb: '52,152,219', aura: 80, res: { n: 'STAMINA', c: '#ffd54a', regen: 6, noRegen: (R, u) => u.on.z },
    pattern: [                                                                      // Shield-Breaker: Edge Thrust → Sword Vault → Aegis Slam → Shield Counter Cleave
      { t: 'edgeThrust', mult: 1.1, col: TC },
      { t: 'vault', mult: 1.2, col: TC },
      { t: 'aegisSlam', mult: 1.5, r: 118, col: TC },
      { t: 'counter', mult: 2.6, col: TC }
    ],
    holdAtk: {                                                                      // Absolute Guard Blast: tahan = serap 80% damage; lepas = ledakan Light damage sebesar damage terserap
      th: .25, max: 4,
      start(R, u, c) { c.abs = 0; c.hp = R.hp; D.FX.buffFx(R, HOLY); fl(R, R.p.x, R.p.y - 30, 'ABSOLUTE GUARD', HOLY); },
      tick(R, dt, u, c) {
        const drop = c.hp - R.hp; if (drop > .01) { c.abs = Math.min(R.s.hp * 2, c.abs + drop * 4); FU().spark(FU().st(R), R.p.x + cos(c.ang) * 30, R.p.y + sin(c.ang) * 30, 8, HOLY, { a: c.ang, sp: 1, v0: 80, v1: 220 }); }   // taken ×0.2 → terserap = drop ×4
        c.hp = R.hp;
      },
      release(R, u, c) {
        const u2 = FU(), V = u2.st(R), dmg = R.s.atk * 1.2 + c.abs, r = 135 + Math.min(40, c.abs / Math.max(1, R.s.hp) * 120);
        burst(R, R.p.x, R.p.y, r, HOLY, true); u2.ring(V, R.p.x, R.p.y, 10, r * 1.2, .5, '#fff', 8, true); V.sw = { k: 'smash', t: 0, dur: .4, ang: c.ang, lunge: 0 }; R.atkT = Math.max(R.atkT, .45);
        const h = inCircle(R, R.p.x, R.p.y, r); h.forEach((m) => { C().trueHit(m, dmg); u2.spark(V, m.x, m.y, 10, HOLY, {}); stunMob(m, .5); if (!m.isBoss && !m.dead) { const dx = m.x - R.p.x, dy = m.y - R.p.y, d = hyp(dx, dy) || 1; C().move(R, m, dx / d * 26, dy / d * 26, m.r - 2); } });
        V.shk = Math.max(V.shk, 10); if (h.length) u2.hitstop(R, .08); D.Cine.flash(HOLY, .2); fl(R, R.p.x, R.p.y - 34, `GUARD BLAST ${Math.round(dmg)}`, GOLD);
      },
      draw(ctx, R, cx, cy, u, c) { const px = R.p.x - cx, py = R.p.y - cy; ctx.save(); ctx.strokeStyle = rgba('255,233,160', .95); ctx.lineWidth = 7; ctx.shadowColor = HOLY; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(px, py, 40, c.ang - .95, c.ang + .95); ctx.stroke();
        ctx.shadowBlur = 0; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3; const tx = `SERAP ${Math.round(c.abs)}`; ctx.strokeText(tx, px, py - 50); ctx.fillText(tx, px, py - 50); ctx.restore(); }
    },
    mods: (R, u) => ({ spd: (u.on.z ? .7 : 1) * (u.ch ? .5 : 1), root: !!u.dm, taken: (u.tm.form > 0 ? .5 : 1) * (u.ch ? .2 : 1) * (u.dm ? Math.max(.4, 1 - (.2 + .06 * Math.min(5, u.dm.t))) : 1) }),
    afterHurt(R, raw, u) {                                                          // Iron Wall: pantulkan 15% damage ke penyerang terdekat
      if (!u.on.z || !(raw > 0)) return; const t = nearest(R, R.p.x, R.p.y, 150); if (!t) return;
      C().trueHit(t, raw * .15); FU().spark(FU().st(R), t.x, t.y, 6, TC, {}); fl(R, t.x, t.y - 22, 'PANTUL', TC);
    },
    tick(R, dt, u) {
      const V = FU().st(R);
      if (u.on.z) { u.rs = Math.max(0, u.rs - .2 * dt); if (u.rs <= 0) { u.on.z = false; fl(R, R.p.x, R.p.y - 28, 'Stamina habis — Stance OFF', '#ff6b5a'); } }
      if (u.dm) {                                                                   // Aegis Judgment: damage holy konstan di dalam kubah
        const d = u.dm; d.tk -= dt; if (d.tk <= 0) { d.tk = .4; inCircle(R, R.p.x, R.p.y, d.r).forEach((m) => strike(R, m, .3, { n: 2, c: HOLY })); }
        if (Math.random() < dt * 25) { const a = rnd(0, PI2); FU().spark(V, R.p.x + cos(a) * d.r * rnd(.3, 1), R.p.y + sin(a) * d.r * rnd(.3, 1), 1, HOLY, { a: -PI / 2, sp: .3, v0: 20, v1: 60, sz: 1.3 }); }
      }
      if (u.tm.form > 0) {                                                          // Bastion Domain: musuh dalam benteng diperlambat
        u.auraT = (u.auraT || 0) - dt; if (u.auraT <= 0) { u.auraT = .3; inCircle(R, R.p.x, R.p.y, 190).forEach((m) => { m.slow = Math.max(m.slow || 0, .5); }); }
      }
    },
    draw(ctx, R, cx, cy, u) {
      const px = R.p.x - cx, py = R.p.y - cy, t = R.t;
      if (u.on.z) { ctx.save(); ctx.strokeStyle = rgba('52,152,219', .85); ctx.lineWidth = 4; ctx.shadowColor = TC; ctx.shadowBlur = 10; ctx.beginPath(); ctx.arc(px, py, 34, -PI * .8, -PI * .2); ctx.stroke(); ctx.beginPath(); ctx.arc(px, py, 34, PI * .2, PI * .8); ctx.stroke(); ctx.restore(); }
      if (u.dm) {
        const d = u.dm, k = Math.min(1, d.t / 5); ctx.save(); const g = ctx.createRadialGradient(px, py, d.r * .2, px, py, d.r); g.addColorStop(0, rgba('255,233,160', .05)); g.addColorStop(1, rgba('255,233,160', .28 + .2 * k));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, d.r, 0, PI2); ctx.fill(); ctx.strokeStyle = rgba('255,233,160', .95); ctx.lineWidth = 3 + 2 * k; ctx.shadowColor = HOLY; ctx.shadowBlur = 16; ctx.stroke();
        ctx.lineWidth = 1.5; ctx.shadowBlur = 0; for (let i = 0; i < 6; i++) { const a = i * PI / 3 + t * .4; ctx.beginPath(); ctx.moveTo(px + cos(a) * d.r * .3, py + sin(a) * d.r * .3); ctx.lineTo(px + cos(a) * d.r, py + sin(a) * d.r); ctx.stroke(); }
        ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
        const tx = `${d.t.toFixed(1)}s  gelombang +${Math.round(Math.min(5, d.t) * 5)}%  ·  DEF kubah -${Math.round((.2 + .06 * Math.min(5, d.t)) * 100)}%`; ctx.strokeText(tx, px, py - d.r - 8); ctx.fillText(tx, px, py - d.r - 8); ctx.restore();
      }
      if (u.tm.form > 0) {                                                          // benteng bayangan raksasa
        ctx.save(); ctx.fillStyle = 'rgba(20,24,50,.28)'; ctx.beginPath(); ctx.arc(px, py, 190, 0, PI2); ctx.fill(); ctx.strokeStyle = 'rgba(90,120,220,.85)'; ctx.lineWidth = 3; ctx.shadowColor = TC; ctx.shadowBlur = 14; ctx.stroke(); ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(15,18,40,.8)'; for (let i = 0; i < 8; i++) { const a = i * PI / 4 + PI / 8, tx = px + cos(a) * 190, ty = py + sin(a) * 190; ctx.fillRect(tx - 9, ty - 16, 18, 26); for (let j = -1; j <= 1; j++) ctx.fillRect(tx + j * 7 - 2, ty - 21, 4, 6); }
        ctx.restore();
      }
    },
    skills: {
      z: Object.assign(toggleSk('Iron Wall Stance', '🏰', TC, 'IRON WALL'), {           // Speed -30%, pantul 15%, Stamina -0.2%/dtk
        press(R, aim, u, k) { if (!u.on[k] && u.rs < 3) { fl(R, R.p.x, R.p.y - 28, 'Stamina kurang', '#aaa'); return false; } u.on[k] = !u.on[k]; D.FX.buffFx(R, TC); fl(R, R.p.x, R.p.y - 28, `IRON WALL ${u.on[k] ? 'ON' : 'OFF'}`, TC); } }),
      x: { n: 'Shield Charge', i: '🛡️', type: 'cast', cd: 9,
        press(R, aim, u) {
          const u2 = FU(), V = u2.st(R), ang = aim.ang, MAX = 260; let tgt = null, ba = 1e9;
          for (const m of alive(R)) { const dx = m.x - R.p.x, dy = m.y - R.p.y, al = dx * cos(ang) + dy * sin(ang), pe = Math.abs(-dx * sin(ang) + dy * cos(ang)); if (al > 0 && al < MAX + m.r && pe < m.r + 30 && al < ba) { ba = al; tgt = m; } }
          R.atkT = Math.max(R.atkT, .3); R.inv = Math.max(R.inv, .5);
          if (!tgt) { dashAlong(R, ang, MAX); u2.ring(V, R.p.x, R.p.y, 6, 50, .3, TC, 4, true); u.cd.x = 3; return; }
          dashAlong(R, atan2(tgt.y - R.p.y, tgt.x - R.p.x), Math.max(0, ba - (tgt.r + 24)));
          D.Cine.on('charge', { bars: 1, zoom: .1, vig: .6 }); u.tm.cine = .9; u.cineOn = true; R.hs = Math.max(R.hs || 0, .28);   // zoom-in + screen freeze singkat
          u2.later(V, .05, () => {
            const x = R.p.x, y = R.p.y; burst(R, x, y, 135, TC, true); u2.ring(V, x, y, 8, 160, .4, '#fff', 6, true); D.Cine.flash('#ffffff', .2);
            inCircle(R, x, y, 135).forEach((m) => { strike(R, m, 2.4, { kb: 22, c: TC, n: 12, ang }); stunMob(m, 1.5); m.tauntT = Math.max(m.tauntT || 0, 5); });   // Stun + Taunt
            V.shk = Math.max(V.shk, 13); u2.hitstop(R, .1); fl(R, x, y - 30, 'SHIELD CHARGE!', TC);
          });
          u.cd.x = 9;
        } },
      c: { n: 'Aegis Judgment', i: '⚖️', type: 'hold', cd: 14, max: 5,
        press(R, aim, u) { u.dm = { t: 0, r: 130, tk: .2 }; burst(R, R.p.x, R.p.y, 130, HOLY, true); fl(R, R.p.x, R.p.y - 30, 'AEGIS JUDGMENT', HOLY); FU().st(R).sw = { k: 'smash', t: 0, dur: .45, ang: aim.ang, lunge: 0 }; R.atkT = Math.max(R.atkT, .4); },
        hold(R, dt, h, u) { if (u.dm) u.dm.t = h.t; },
        release(R, h, u) {                                   // gelombang suci pungkasan: 3× ATK, +5% per detik
          const d = u.dm; u.dm = null; if (!d) return; const u2 = FU(), V = u2.st(R), mult = 3 * (1 + .05 * Math.min(5, h.t)), r = d.r * 1.4;
          burst(R, R.p.x, R.p.y, r, HOLY, true); u2.ring(V, R.p.x, R.p.y, 10, r * 1.2, .5, '#fff', 8, true);
          const hit = inCircle(R, R.p.x, R.p.y, r); hit.forEach((m) => { strike(R, m, mult, { kb: 24, c: HOLY, n: 14 }); stunMob(m, .6); });
          V.shk = Math.max(V.shk, 10); if (hit.length) u2.hitstop(R, .08); D.Cine.flash(HOLY, .2); fl(R, R.p.x, R.p.y - 34, `GELOMBANG SUCI ×${mult.toFixed(2)}`, GOLD);
        } },
      v: formSk('Bastion Domain', '🏯', TC, 90, 14, 'BASTION DOMAIN!')                    // damage diterima -50%, musuh di dalam benteng diperlambat
    }
  };

  /* ---------- ARCHER — Windpiercer Bow ---------- */
  D.UNIQ.u_archer = {
    id: 'u_archer', col: AC, rgb: '111,224,176', aura: 55, res: { n: 'STAMINA', c: '#ffd54a', regen: 8 },
    pattern: [                                                                      // Acrobatic Archery: Double Snap-Shot → Piercing Gale → Acrobatic Vault (3 panah) → Rain of Windblades
      { t: 'snap', mult: .6, col: AC },
      { t: 'gale', mult: 1.7 },
      { t: 'vaultShot', mult: .75, col: AC },
      { t: 'windblade', mult: 1.9 }
    ],
    holdAtk: {                                                                      // Focus Lock On: zoom-in, musuh di sekitar kursor melambat; lepas = panah tembus, PASTI crit
      th: .25, max: 2,
      start(R, u, c) { D.Cine.on('lock', { bars: .5, zoom: .1, vig: .55 }); fl(R, R.p.x, R.p.y - 30, 'FOCUS LOCK ON', AW); },
      tick(R, dt, u, c) { for (const m of alive(R)) if (hyp(m.x - c.w.x, m.y - c.w.y) < 130) m.slow = Math.max(m.slow || 0, .25); },
      release(R, u, c) {
        const u2 = FU(), V = u2.st(R), s = R.s, k = c.k, a = c.ang, mult = 3.2 + 1.8 * k;
        u.tm.gc = 1.2; V.sw = { k: 'draw', t: 0, dur: .4, wu: .08, ang: a, big: true }; R.atkT = Math.max(R.atkT, .4);          // gc → mods: crit +100 (semua kena = crit)
        u2.later(V, .08, () => {
          const x = R.p.x + cos(a) * 22, y = R.p.y + sin(a) * 22, spd = 1700;
          V.pj.push({ k: 'arrow', x, y, a, spd, life: (s.range + 420) / spd, mult, big: true, pierce: true, rad: 11, c: AW, at: s.arrow, hit: [], t: 0 });
          u2.ring(V, x, y, 4, 42, .25, AW, 4); u2.spark(V, x, y, 14, '#fff', { a, sp: .25, v0: 180, v1: 460 }); V.shk = Math.max(V.shk, 5); D.Cine.flash(AW, .15);
        });
        fl(R, R.p.x, R.p.y - 34, `LOCK-ON ×${mult.toFixed(1)} · CRIT`, GOLD);
      },
      draw(ctx, R, cx, cy, u, c) {
        const px = R.p.x - cx, py = R.p.y - cy, wx = c.w.x - cx, wy = c.w.y - cy, r = 46 - 22 * c.k; ctx.save(); ctx.strokeStyle = c.k >= 1 ? 'rgba(255,213,74,.95)' : 'rgba(191,245,255,.9)'; ctx.lineWidth = 2; ctx.shadowColor = AC; ctx.shadowBlur = 10;
        ctx.globalAlpha = .5; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(wx, wy); ctx.stroke(); ctx.globalAlpha = 1; ctx.setLineDash([]);
        ctx.beginPath(); ctx.arc(wx, wy, r, 0, PI2); ctx.stroke(); ctx.beginPath(); ctx.arc(wx, wy, 130, 0, PI2); ctx.globalAlpha = .3; ctx.stroke(); ctx.globalAlpha = 1;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.moveTo(wx + dx * (r - 8), wy + dy * (r - 8)); ctx.lineTo(wx + dx * (r + 10), wy + dy * (r + 10)); ctx.stroke(); } ctx.restore();
      }
    },
    mods: (R, u) => ({ spd: (1 + .05 * (u.gale ? u.gale.n : 0)) * (u.ch ? .5 : 1), cd: u.tm.form > 0 ? .5 : 1, crit: (u.tm.form > 0 ? 100 : 0) + (u.tm.gc > 0 ? 100 : 0) }),   // Ultimate / Lock-On: semua tembakan crit
    onStrike(R, m, r) {
      const u = S(R);
      if (r && r.c) u.gale = { n: Math.min(5, (u.gale ? u.gale.n : 0) + 1), t: 3 };                // tiap crit: speed +5% 3 dtk (stack 5×)
      if (u.tm.frost > 0 && !m.dead) m.slow = Math.max(m.slow || 0, 3);                            // panah es Tempest Reposition
    },
    tick(R, dt, u) {
      if (u.gale) { u.gale.t -= dt; if (u.gale.t <= 0) u.gale = null; }
      if (u.rn) {                                                                   // Arrow Rain Typhoon: hujan panah, makin lama makin rapat
        const g = u.rn, V = FU().st(R); g.t = (u.hold ? u.hold.t : g.t); g.acc += dt * (5 + 2.2 * g.t * 1.4);
        for (let n = 0; g.acc >= 1 && n < 3; n++, g.acc--) {
          const a = rnd(0, PI2), r = Math.sqrt(Math.random()) * g.r, x = g.x + cos(a) * r, y = g.y + sin(a) * r;
          FU().add(V, { k: 'line', x1: x - 14, y1: y - 90, x2: x, y2: y, w: 4, life: .16, c: AW });
          FU().later(V, .14, () => { FU().ring(V, x, y, 3, 22, .2, AC, 2); FU().spark(V, x, y, 3, AW, {}); inCircle(R, x, y, 24).forEach((m) => strike(R, m, .22, { n: 2, c: AC })); });
        }
      }
      if (u.tn) {                                                                   // Gale Force Tempest: bergerak perlahan, menyapu & memutar musuh
        const g = u.tn, V = FU().st(R); if (!(u.tm.form > 0)) { u.tn = null; return; }
        const nx = g.x + cos(g.a) * 55 * dt, ny = g.y + sin(g.a) * 55 * dt; if (C().walk(R, nx, ny)) { g.x = nx; g.y = ny; }
        g.tk -= dt; g.ph += dt * 9;
        for (const m of alive(R)) {
          const dx = g.x - m.x, dy = g.y - m.y, d = hyp(dx, dy); if (d > 105 || d < 6) continue; const w = m.isBoss ? .3 : 1;
          C().move(R, m, (dx / d * 80 + -dy / d * 140) * dt * w, (dy / d * 80 + dx / d * 140) * dt * w, m.r - 2); m.slow = Math.max(m.slow || 0, .4);
        }
        if (g.tk <= 0) { g.tk = .3; inCircle(R, g.x, g.y, 100).forEach((m) => strike(R, m, .4, { n: 3, c: AW })); }
        if (Math.random() < dt * 40) { const a = rnd(0, PI2), r = rnd(20, 95); FU().spark(V, g.x + cos(a) * r, g.y + sin(a) * r * .8, 1, AW, { a: a + PI / 2, sp: .2, v0: 80, v1: 180, sz: 1.2 }); }
      }
    },
    draw(ctx, R, cx, cy, u) {
      const t = R.t;
      if (u.rn) {
        const g = u.rn, gx = g.x - cx, gy = g.y - cy; ctx.save(); ctx.fillStyle = rgba('111,224,176', .1 + .05 * Math.min(1, g.t / 5)); ctx.beginPath(); ctx.arc(gx, gy, g.r, 0, PI2); ctx.fill();
        ctx.setLineDash([9, 7]); ctx.lineDashOffset = -t * 50; ctx.strokeStyle = AW; ctx.lineWidth = 3; ctx.shadowColor = AC; ctx.shadowBlur = 12; ctx.stroke();
        ctx.setLineDash([]); ctx.shadowBlur = 0; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 3;
        const tx = `${g.t.toFixed(1)}s  badai +${Math.round(Math.min(5, g.t) * 5)}%`; ctx.strokeText(tx, gx, gy - g.r - 8); ctx.fillText(tx, gx, gy - g.r - 8); ctx.restore();
      }
      if (u.tn) {
        const g = u.tn, gx = g.x - cx, gy = g.y - cy; ctx.save(); ctx.shadowColor = AC; ctx.shadowBlur = 14;
        for (let i = 0; i < 9; i++) { const k = i / 8, y = gy + 70 - k * 150, rw = 20 + k * 62, off = sin(g.ph + i * .9) * 10; ctx.strokeStyle = rgba('191,245,255', .75 - k * .35); ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(gx + off, y, rw, rw * .28, 0, 0, PI2); ctx.stroke(); }
        ctx.restore();
      }
    },
    skills: {
      z: Object.assign(toggleSk('Wind Infusion', '🌬️', AC, 'WIND'), {                // panah menembus semua musuh sejalur, -1% Stamina / tembakan
        press(R, aim, u, k) { if (!u.on[k] && u.rs < 5) { fl(R, R.p.x, R.p.y - 28, 'Stamina kurang', '#aaa'); return false; } u.on[k] = !u.on[k]; D.FX.buffFx(R, AC); fl(R, R.p.x, R.p.y - 28, `WIND ${u.on[k] ? 'ON' : 'OFF'}`, AC); } }),
      x: { n: 'Tempest Reposition', i: '🌪️', type: 'cast', cd: 9,
        press(R, aim, u) {
          const u2 = FU(), V = u2.st(R), a = aim.ang, s = R.s;
          dashAlong(R, a + PI, 210); R.inv = Math.max(R.inv, .6); R.atkT = Math.max(R.atkT, .4);          // lompat mundur (kiting)
          u2.ring(V, R.p.x, R.p.y, 6, 60, .3, AW, 4, true); u2.spark(V, R.p.x, R.p.y, 14, AW, { a: a + PI, sp: .7 });
          D.Cine.on('tempest', { bars: .8, zoom: .07, vig: .5 }); u.tm.cine = .9; u.cineOn = true; D.Uniq.slowmo(.55, .3); D.Cine.flash('#bff5ff', .2);   // cinematic slow-motion singkat
          u.tm.frost = 1.2;                                                                                  // panah es → Slow
          for (let i = -1; i <= 1; i++) V.pj.push({ k: 'arrow', x: R.p.x + cos(a) * 20, y: R.p.y + sin(a) * 20, a: a + i * .17, spd: 1150, life: (s.range + 260) / 1150, mult: 1.2, big: true, pierce: false, rad: 8, c: '#8fe3ff', at: 'frost', hit: [], t: 0 });
          fl(R, R.p.x, R.p.y - 30, 'TEMPEST REPOSITION!', AW);
        } },
      c: { n: 'Arrow Rain Typhoon', i: '🌧️', type: 'hold', cd: 14, max: 5,
        press(R, aim, u) {
          const p = clampPt(R, aim, 330), V = FU().st(R); u.rn = { x: p.x, y: p.y, r: 125, t: 0, acc: 0 };
          for (let i = 0; i < 16; i++) { const a = i * PI2 / 16; FU().add(V, { k: 'line', x1: R.p.x + cos(a) * 22, y1: R.p.y + sin(a) * 22, x2: R.p.x + cos(a) * 22, y2: R.p.y - 60 - 40 * sin(i), w: 3, life: .3, c: AW }); }   // panah melingkar ke udara
          FU().ring(V, R.p.x, R.p.y, 6, 60, .3, AC, 3, true); fl(R, p.x, p.y - 30, 'ARROW RAIN TYPHOON', AC); R.atkT = Math.max(R.atkT, .3);
        },
        hold(R, dt, h, u) { if (u.rn) u.rn.t = h.t; },
        release(R, h, u) {                                   // ledakan badai pungkasan: 3× ATK, +5% per detik hold
          const g = u.rn; u.rn = null; if (!g) return; const u2 = FU(), V = u2.st(R), mult = 3 * (1 + .05 * Math.min(5, h.t)), r = g.r * 1.1;
          burst(R, g.x, g.y, r, AC, true); u2.ring(V, g.x, g.y, 10, r * 1.3, .5, AW, 8, true);
          const hit = inCircle(R, g.x, g.y, r); hit.forEach((m) => { strike(R, m, mult, { kb: 18, c: AW, n: 14 }); m.slow = Math.max(m.slow || 0, 2); });
          V.shk = Math.max(V.shk, 9); if (hit.length) u2.hitstop(R, .08); D.Cine.flash(AW, .18); fl(R, g.x, g.y - 34, `BADAI ×${mult.toFixed(2)}`, GOLD);
        } },
      v: (() => {
        const v = formSk('Gale Force Tempest', '🌪️', AC, 85, 12, 'GALE FORCE TEMPEST!'), p0 = v.press;   // AS +100%, semua tembakan crit, badai raksasa
        v.press = (R, aim, u) => { p0(R, aim, u); u.tn = { x: R.p.x + cos(aim.ang) * 60, y: R.p.y + sin(aim.ang) * 60, a: aim.ang, tk: .2, ph: 0 }; };
        return v;
      })()
    }
  };
})(window.DSB);
