// ===== TABUNGAN HP - app.js =====
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------- Alat bantu ----------
const $ = id => document.getElementById(id);
const T = (id, v) => { $(id).textContent = v; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const rp = n => (n < 0 ? '-Rp' : 'Rp') + Math.abs(Math.round(Number(n) || 0)).toLocaleString('id-ID');
const num = id => Number($(id).value) || 0;
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const toDate = s => new Date(s + 'T00:00:00');
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const diffDays = (a, b) => Math.round((toDate(a) - toDate(b)) / 864e5);
const todayStr = () => iso(new Date());
const tgl = s => toDate(s).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
const weekStart = s => { const d = toDate(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
const sum = (a, k) => a.reduce((t, r) => t + Number(r[k] || 0), 0);
const CAT = { bensin: 'Bensin', makan_minum: 'Makan dan minum', kebutuhan_pribadi: 'Kebutuhan pribadi', keperluan_pekerjaan: 'Keperluan pekerjaan', lain_lain: 'Lain-lain' };

let user = null, S = {}, income = [], expense = [], saving = [], workdays = [], charts = {};

function toast(m) {
  const t = $('toast'); t.textContent = m; t.classList.add('show');
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove('show'), 2800);
}

// ---------- Login / daftar / keluar ----------
const authMsg = m => { $('auth-msg').textContent = m; };
$('btn-login').onclick = async () => {
  authMsg('');
  const { error } = await db.auth.signInWithPassword({ email: $('a-email').value.trim(), password: $('a-password').value });
  if (error) authMsg('Gagal masuk: ' + error.message);
};
$('btn-register').onclick = async () => {
  authMsg('');
  if ($('a-password').value.length < 6) return authMsg('Kata sandi minimal 6 karakter.');
  const { data, error } = await db.auth.signUp({
    email: $('a-email').value.trim(), password: $('a-password').value,
    options: { data: { full_name: $('a-name').value.trim() } }
  });
  if (error) return authMsg('Gagal daftar: ' + error.message);
  if (!data.session) authMsg('Akun dibuat. Cek email untuk konfirmasi, lalu tekan Masuk.');
};
$('btn-logout').onclick = () => db.auth.signOut();

db.auth.onAuthStateChange((ev, session) => { setTimeout(() => handleSession(session), 0); });

async function handleSession(session) {
  if (!session) { user = null; $('app').classList.add('hidden'); $('auth').classList.remove('hidden'); return; }
  if (user && user.id === session.user.id) return;
  user = session.user;
  $('auth').classList.add('hidden'); $('app').classList.remove('hidden');
  T('hello', 'Halo, ' + (user.user_metadata?.full_name || user.email.split('@')[0]));
  await loadAll();
  [resetInd, resetSf, resetExp, resetSv].forEach(f => f());
  $('w-date').value = todayStr();
  $('r-from').value = S.start_date;
  $('r-to').value = iso(addDays(toDate(S.start_date), S.duration_days - 1));
  renderAll(); go('dashboard');
}

// ---------- Ambil data dari Supabase ----------
async function loadAll() {
  const q = (t, k) => db.from(t).select('*').order(k, { ascending: false });
  let s = await db.from('app_settings').select('*').maybeSingle();
  if (!s.error && !s.data) { await db.from('app_settings').insert({ user_id: user.id }); s = await db.from('app_settings').select('*').maybeSingle(); }
  const [i, e, v, w] = await Promise.all([q('income_entries', 'entry_date'), q('expense_entries', 'expense_date'), q('hp_savings', 'saving_date'), q('work_days', 'work_date')]);
  const bad = [s, i, e, v, w].find(r => r.error);
  if (bad) toast('Gagal memuat data: ' + bad.error.message);
  S = s.data || { target_amount: 3700000, start_date: todayStr(), duration_days: 52, default_commission: 37000, daily_install_target: 2, weekly_install_target: 10, rest_days_per_week: 1 };
  income = i.data || []; expense = e.data || []; saving = v.data || []; workdays = w.data || [];
}

// ---------- Navigasi ----------
const TITLES = { dashboard: 'Beranda', indihome: 'IndiHome', shopee: 'ShopeeFood', saving: 'Tabungan', more: 'Menu', expense: 'Pengeluaran', target: 'Target 52 hari', report: 'Laporan', settings: 'Pengaturan' };
function go(v) {
  document.querySelectorAll('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  const nav = ['dashboard', 'indihome', 'shopee', 'saving'].includes(v) ? v : 'more';
  document.querySelectorAll('nav.bottom button').forEach(b => b.classList.toggle('active', b.dataset.view === nav));
  T('page-title', TITLES[v]); window.scrollTo(0, 0);
  if (v === 'report') renderReport();
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => go(b.dataset.view)));

// ---------- Simpan / ubah / hapus (dipakai semua formulir) ----------
function setup(c) {
  const reset = () => {
    $(c.form).reset(); $(c.id).value = ''; $(c.date).value = todayStr();
    $(c.cancel).classList.add('hidden'); T(c.title, c.titleText); c.after && c.after();
  };
  $(c.form).addEventListener('submit', async e => {
    e.preventDefault();
    const id = $(c.id).value, row = c.build();
    const { error } = id ? await db.from(c.table).update(row).eq('id', id)
                         : await db.from(c.table).insert({ ...row, user_id: user.id });
    if (error) return toast('Gagal menyimpan: ' + error.message);
    toast(id ? 'Perubahan disimpan' : 'Tersimpan');
    reset(); await loadAll(); renderAll();
  });
  $(c.cancel).onclick = reset;
  $(c.list).addEventListener('click', async e => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const id = b.dataset.id;
    if (b.dataset.act === 'del') {
      if (!confirm('Hapus data ini?')) return;
      const { error } = await db.from(c.table).delete().eq('id', id);
      if (error) return toast('Gagal menghapus: ' + error.message);
      toast('Dihapus'); await loadAll(); renderAll();
    } else {
      const r = c.rows().find(x => x.id === id); if (!r) return;
      c.fill(r); $(c.id).value = id; $(c.cancel).classList.remove('hidden');
      T(c.title, 'Ubah data'); window.scrollTo(0, 0);
    }
  });
  return reset;
}

const calcInd = () => T('i-total', rp(num('i-count') * num('i-rate')));
const calcSf = () => T('sf-net', rp(num('sf-gross') - num('sf-fuel') - num('sf-meal') - num('sf-other')));
['i-count', 'i-rate'].forEach(id => $(id).addEventListener('input', calcInd));
['sf-gross', 'sf-fuel', 'sf-meal', 'sf-other'].forEach(id => $(id).addEventListener('input', calcSf));

const resetInd = setup({
  form: 'form-indihome', id: 'i-id', date: 'i-date', cancel: 'i-cancel', title: 'i-title', titleText: 'Catat pemasangan IndiHome',
  table: 'income_entries', list: 'list-indihome', rows: () => income,
  build: () => ({ source: 'indihome', entry_date: $('i-date').value, install_count: num('i-count'), commission_rate: num('i-rate'), notes: $('i-notes').value.trim() || null }),
  fill: r => { $('i-date').value = r.entry_date; $('i-count').value = r.install_count; $('i-rate').value = r.commission_rate; $('i-notes').value = r.notes || ''; calcInd(); },
  after: () => { $('i-rate').value = S.default_commission || 37000; calcInd(); }
});
const resetSf = setup({
  form: 'form-shopee', id: 'sf-id', date: 'sf-date', cancel: 'sf-cancel', title: 'sf-title', titleText: 'Catat ShopeeFood',
  table: 'income_entries', list: 'list-shopee', rows: () => income,
  build: () => ({ source: 'shopeefood', entry_date: $('sf-date').value, gross_amount: num('sf-gross'), fuel_cost: num('sf-fuel'), meal_cost: num('sf-meal'), other_cost: num('sf-other'), notes: $('sf-notes').value.trim() || null }),
  fill: r => { $('sf-date').value = r.entry_date; $('sf-gross').value = r.gross_amount; $('sf-fuel').value = r.fuel_cost; $('sf-meal').value = r.meal_cost; $('sf-other').value = r.other_cost; $('sf-notes').value = r.notes || ''; calcSf(); },
  after: calcSf
});
const resetExp = setup({
  form: 'form-expense', id: 'e-id', date: 'e-date', cancel: 'e-cancel', title: 'e-title', titleText: 'Catat pengeluaran',
  table: 'expense_entries', list: 'list-expense', rows: () => expense,
  build: () => ({ expense_date: $('e-date').value, category: $('e-cat').value, amount: num('e-amount'), notes: $('e-notes').value.trim() || null }),
  fill: r => { $('e-date').value = r.expense_date; $('e-cat').value = r.category; $('e-amount').value = r.amount; $('e-notes').value = r.notes || ''; }
});
const resetSv = setup({
  form: 'form-saving', id: 'sv-id', date: 'sv-date', cancel: 'sv-cancel', title: 'sv-title', titleText: 'Catat tabungan',
  table: 'hp_savings', list: 'list-saving', rows: () => saving,
  build: () => ({ saving_date: $('sv-date').value, type: $('sv-type').value, amount: num('sv-amount'), notes: $('sv-notes').value.trim() || null }),
  fill: r => { $('sv-date').value = r.saving_date; $('sv-type').value = r.type; $('sv-amount').value = r.amount; $('sv-notes').value = r.notes || ''; }
});

// ---------- Hitungan keuangan ----------
function totals() {
  const ind = income.filter(r => r.source === 'indihome'), sf = income.filter(r => r.source === 'shopeefood');
  const t = { ind: sum(ind, 'income_amount'), sf: sum(sf, 'gross_amount'), op: sum(sf, 'operational_cost'), exp: sum(expense, 'amount'), installs: sum(ind, 'install_count') };
  t.income = t.ind + t.sf;            // total pendapatan
  t.cost = t.op + t.exp;              // total pengeluaran (tanpa duplikasi)
  t.net = t.income - t.cost;          // saldo operasional
  t.saved = saving.reduce((a, r) => a + (r.type === 'setor' ? 1 : -1) * Number(r.amount), 0); // tabungan HP
  t.target = Number(S.target_amount);
  t.remain = Math.max(0, t.target - t.saved);
  t.pct = t.target ? Math.max(0, Math.min(100, t.saved / t.target * 100)) : 0;
  return t;
}

// ---------- Grafik ----------
function chart(key, canvas, labels, sets, stacked) {
  if (charts[key]) charts[key].destroy();
  charts[key] = new Chart($(canvas), {
    type: 'bar', data: { labels, datasets: sets },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: { x: { stacked }, y: { stacked, ticks: { callback: v => rp(v) } } },
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: c => c.dataset.label + ': ' + rp(c.parsed.y) } } }
    }
  });
}
function series(keys, keyFn) {
  const m = Object.fromEntries(keys.map(k => [k, { ind: 0, sf: 0 }]));
  income.forEach(r => { const k = keyFn(r.entry_date); if (m[k]) m[k][r.source === 'indihome' ? 'ind' : 'sf'] += Number(r.income_amount); });
  return [
    { label: 'IndiHome', data: keys.map(k => m[k].ind), backgroundColor: '#1d4180' },
    { label: 'ShopeeFood', data: keys.map(k => m[k].sf), backgroundColor: '#f59e0b' }
  ];
}

// ---------- Tampilan: Beranda ----------
function renderDash() {
  const t = totals();
  T('s-saved', rp(t.saved)); T('s-pct', t.pct.toFixed(1) + '%'); T('s-target', rp(t.target)); T('s-remain', rp(t.remain));
  $('bar').style.width = t.pct + '%';
  T('s-indihome', rp(t.ind)); T('s-shopee', rp(t.sf)); T('s-expense', rp(t.cost));
  T('s-net', rp(t.net)); T('s-installs', t.installs); T('s-income', rp(t.income));
  const days = Array.from({ length: 14 }, (_, i) => iso(addDays(new Date(), i - 13)));
  chart('daily', 'chart-daily', days.map(d => d.slice(8) + '/' + d.slice(5, 7)), series(days, d => d), true);
  const ws = Array.from({ length: 8 }, (_, i) => weekStart(iso(addDays(new Date(), (i - 7) * 7))));
  chart('weekly', 'chart-weekly', ws.map(d => d.slice(8) + '/' + d.slice(5, 7)), series(ws, weekStart), true);
}

// ---------- Tampilan: Daftar riwayat ----------
const acts = id => `<div class="act"><button data-act="edit" data-id="${id}">Ubah</button><button class="d" data-act="del" data-id="${id}">Hapus</button></div>`;
const item = (l1, l2, amt, cls, id) => `<div class="item"><div class="l"><b>${l1}</b><small>${l2}</small></div><div class="r"><b class="${cls}">${amt}</b>${acts(id)}</div></div>`;
const put = (el, html, msg) => { $(el).innerHTML = html || `<div class="empty">${msg}</div>`; };
const filt = (arr, dk, p) => arr.filter(r => {
  const d = r[dk], q = $(p + '-search').value.toLowerCase(), f = $(p + '-from').value, to = $(p + '-to').value;
  return (!f || d >= f) && (!to || d <= to) && (!q || (r.notes || '').toLowerCase().includes(q));
});
const note = r => r.notes ? ' · ' + esc(r.notes) : '';
function renderLists() {
  put('list-indihome', filt(income.filter(r => r.source === 'indihome'), 'entry_date', 'i')
    .map(r => item(tgl(r.entry_date), `${r.install_count} pemasangan × ${rp(r.commission_rate)}${note(r)}`, '+' + rp(r.income_amount), 'pos', r.id)).join(''), 'Belum ada catatan IndiHome.');
  put('list-shopee', filt(income.filter(r => r.source === 'shopeefood'), 'entry_date', 'sf')
    .map(r => item(tgl(r.entry_date), `Kotor ${rp(r.gross_amount)} · Biaya ${rp(r.operational_cost)}${note(r)}`, rp(r.net_amount), r.net_amount >= 0 ? 'pos' : 'neg', r.id)).join(''), 'Belum ada catatan ShopeeFood.');
  const cat = $('e-catfilter').value;
  put('list-expense', filt(expense.filter(r => !cat || r.category === cat), 'expense_date', 'e')
    .map(r => item(CAT[r.category], tgl(r.expense_date) + note(r), '-' + rp(r.amount), 'neg', r.id)).join(''), 'Belum ada pengeluaran.');
  put('list-saving', saving.map(r => item(r.type === 'setor' ? 'Setor' : 'Ambil', tgl(r.saving_date) + note(r),
    (r.type === 'setor' ? '+' : '-') + rp(r.amount), r.type === 'setor' ? 'pos' : 'neg', r.id)).join(''), 'Belum ada catatan tabungan.');
  put('list-workday', workdays.slice(0, 15).map(w => `<div class="item"><div class="l"><b>${tgl(w.work_date)}</b><small>${w.status === 'istirahat' ? 'Istirahat' : 'Kerja'}</small></div><div class="r"><div class="act"><button class="d" data-wdel="${w.id}">Hapus</button></div></div></div>`).join(''), 'Belum ada hari yang ditandai.');
}
['i', 'sf', 'e'].forEach(p => ['-search', '-from', '-to'].forEach(s => $(p + s).addEventListener('input', renderLists)));
$('e-catfilter').addEventListener('change', renderLists);

// ---------- Tampilan: Tabungan ----------
function renderSaving() {
  const t = totals();
  T('sv-total', rp(t.saved)); T('sv-pct', t.pct.toFixed(1) + '%'); T('sv-remain', rp(t.remain));
  $('sv-bar').style.width = t.pct + '%';
  const setor = saving.filter(r => r.type === 'setor').map(r => r.saving_date).sort();
  let eta = '-';
  if (t.remain <= 0 && t.saved > 0) eta = 'Target tercapai 🎉';
  else if (setor.length && t.saved > 0) {
    const perDay = t.saved / Math.max(1, diffDays(todayStr(), setor[0]) + 1);
    const d = iso(addDays(new Date(), Math.ceil(t.remain / perDay)));
    const end = iso(addDays(toDate(S.start_date), S.duration_days - 1));
    eta = tgl(d) + (d > end ? ' (melewati batas target)' : '');
  }
  T('sv-eta', eta);
}

// ---------- Tampilan: Target 52 hari ----------
function renderTarget() {
  const t = totals(), start = S.start_date, dur = Number(S.duration_days), td = todayStr();
  const end = iso(addDays(toDate(start), dur - 1));
  const before = diffDays(start, td);
  const dayNum = before > 0 ? 0 : Math.min(dur, diffDays(td, start) + 1);
  T('t-day', dayNum); T('t-duration', dur); $('t-bar').style.width = (dayNum / dur * 100) + '%';
  T('t-range', tgl(start) + ' sampai ' + tgl(end)); $('t-start').value = start;
  T('t-startinfo', before > 0 ? `Target dimulai ${before} hari lagi.` : td > end ? 'Periode target sudah selesai.' : `Target sedang berjalan, berakhir ${tgl(end)}.`);
  const rest = workdays.filter(w => w.status === 'istirahat' && w.work_date >= start && w.work_date <= end);
  const upto = td < end ? td : end;
  const workNow = Math.max(0, dayNum - rest.filter(w => w.work_date <= upto).length);
  const real = sum(income.filter(r => r.source === 'indihome' && r.entry_date >= start && r.entry_date <= end), 'install_count');
  const goal = workNow * Number(S.daily_install_target), diff = real - goal;
  T('t-workdays', dur - rest.length); T('t-rest', rest.length);
  T('t-dtarget', S.daily_install_target); T('t-wtarget', S.weekly_install_target);
  T('t-real', real); T('t-diff', (diff > 0 ? '+' : '') + diff);
  const daysLeft = before > 0 ? dur : Math.max(1, diffDays(end, td) + 1);
  T('t-dsave', rp(t.remain / daysLeft)); T('t-wsave', rp(t.remain / daysLeft * 7));
}
$('list-workday').addEventListener('click', async e => {
  const b = e.target.closest('button[data-wdel]'); if (!b) return;
  const { error } = await db.from('work_days').delete().eq('id', b.dataset.wdel);
  if (error) return toast('Gagal menghapus: ' + error.message);
  await loadAll(); renderAll();
});
$('form-workday').addEventListener('submit', async e => {
  e.preventDefault();
  const { error } = await db.from('work_days').upsert({ user_id: user.id, work_date: $('w-date').value, status: $('w-status').value }, { onConflict: 'user_id,work_date' });
  if (error) return toast('Gagal menyimpan: ' + error.message);
  toast('Status disimpan'); await loadAll(); renderAll();
});

// ---------- Pengaturan & tanggal mulai ----------
async function saveSettings(obj) {
  const { error } = await db.from('app_settings').update(obj).eq('user_id', user.id);
  if (error) return toast('Gagal menyimpan: ' + error.message);
  toast('Pengaturan disimpan'); await loadAll(); renderAll();
}
$('form-start').addEventListener('submit', e => { e.preventDefault(); saveSettings({ start_date: $('t-start').value }); });
$('btn-start-today').onclick = () => saveSettings({ start_date: todayStr() });
$('form-settings').addEventListener('submit', e => {
  e.preventDefault();
  saveSettings({ target_amount: num('st-target'), start_date: $('st-start').value, duration_days: num('st-duration'), default_commission: num('st-commission'), rest_days_per_week: num('st-rest'), daily_install_target: num('st-daily'), weekly_install_target: num('st-weekly') });
});
function fillSettings() {
  $('st-target').value = S.target_amount; $('st-start').value = S.start_date; $('st-duration').value = S.duration_days;
  $('st-commission').value = S.default_commission; $('st-rest').value = S.rest_days_per_week;
  $('st-daily').value = S.daily_install_target; $('st-weekly').value = S.weekly_install_target;
}

// ---------- Laporan ----------
function reportData() {
  const src = $('r-source').value, per = $('r-period').value;
  let from = $('r-from').value, to = $('r-to').value;
  if (per === 'total') { from = S.start_date; to = iso(addDays(toDate(S.start_date), S.duration_days - 1)); }
  const keyFn = per === 'day' ? d => d : per === 'week' ? weekStart : per === 'month' ? d => d.slice(0, 7) : () => 'Total ' + S.duration_days + ' hari';
  const ok = d => (!from || d >= from) && (!to || d <= to);
  const rows = {}, get = k => (rows[k] = rows[k] || { k, inc: 0, cost: 0, exp: 0 });
  income.forEach(r => { if ((src === 'all' || r.source === src) && ok(r.entry_date)) { const o = get(keyFn(r.entry_date)); o.inc += Number(r.income_amount); o.cost += Number(r.operational_cost); } });
  if (src === 'all') expense.forEach(r => { if (ok(r.expense_date)) get(keyFn(r.expense_date)).exp += Number(r.amount); });
  const label = k => per === 'day' ? tgl(k) : per === 'week' ? 'Minggu ' + tgl(k) : per === 'month' ? toDate(k + '-01').toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : k;
  return Object.values(rows).sort((a, b) => a.k.localeCompare(b.k)).map(o => ({ ...o, net: o.inc - o.cost - o.exp, label: label(o.k) }));
}
function renderReport() {
  const d = reportData();
  $('report-body').innerHTML = d.map(o => `<tr><td>${esc(o.label)}</td><td>${rp(o.inc)}</td><td>${rp(o.cost)}</td><td>${rp(o.exp)}</td><td><b>${rp(o.net)}</b></td></tr>`).join('')
    || '<tr><td colspan="5" class="empty">Tidak ada data pada filter ini.</td></tr>';
  chart('report', 'chart-report', d.map(o => o.label), [
    { label: 'Pendapatan', data: d.map(o => o.inc), backgroundColor: '#1d4180' },
    { label: 'Bersih', data: d.map(o => o.net), backgroundColor: '#16a34a' }
  ], false);
}
$('btn-report').onclick = renderReport;
$('btn-csv').onclick = () => {
  const d = reportData(); if (!d.length) return toast('Belum ada data untuk diekspor');
  const lines = [['Periode', 'Pendapatan', 'Biaya ShopeeFood', 'Pengeluaran', 'Bersih'], ...d.map(o => [o.label, o.inc, o.cost, o.exp, o.net])];
  const csv = '\ufeff' + lines.map(l => l.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'laporan-' + todayStr() + '.csv'; a.click();
};

// ---------- Gambar ulang semuanya ----------
function renderAll() {
  renderDash(); renderLists(); renderSaving(); renderTarget(); fillSettings();
  if ($('view-report').classList.contains('active')) renderReport();
}
