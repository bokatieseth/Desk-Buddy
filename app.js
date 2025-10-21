/* 工位萌伴园 v0.3 — dev clock, daily rollover, backlog/completed filters, robust nav, and resilient settings actions */
const $ = (sel) => document.querySelector(sel);

/* ===== Dev clock (no system time changes needed) =====
   You can set/clear from Settings, or via console:
     window.__setDevNow('2025-03-05 05:59')  // local time
     window.__clearDevNow()
*/
function getNow(){
  const s = localStorage.getItem('gmb_dev_now'); // 'YYYY-MM-DD HH:MM'
  if (s) {
    const d = new Date(s.replace(' ', 'T'));
    if (!isNaN(d)) return d;
  }
  return new Date();
}
function __setDevNow(ymdhm /* 'YYYY-MM-DD HH:MM' */){
  localStorage.setItem('gmb_dev_now', ymdhm);
  refreshDevStateLabels();
  ensureDayIsCurrent();
  renderToday();
  renderEndButton();
}
function __clearDevNow(){
  localStorage.removeItem('gmb_dev_now');
  refreshDevStateLabels();
  ensureDayIsCurrent();
  renderToday();
  renderEndButton();
}


window.__setDevNow = __setDevNow;
window.__clearDevNow = __clearDevNow;

const todayKey = () => {
  const d = getNow();
  const pad = (n)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
};


const DAY_START_HOUR = 6;    // 6:00 AM (clock-in guard)
const END_CUTOFF_HOUR = 16;  // 4:00 PM (soft confirm)

/* ===== State ===== */
const state = {
  version: 3,
  day: {
    date: todayKey(),
    clockedInAt: null,
    tasks: [],
    rewardsClaimed: 0,
    clockBoxClaimed: false,
    endedAt: null
  },
  collection: [],
  binderPage: 0,
  desk: [null, null, null],
  backlog: [],    // tasks not for today (future/past) + rolled-over
  clockins: {},   // { "YYYY-MM-DD": true } — dates on which user clocked in
  makeups: {}     // { "YYYY-MM-DD": { awarded: true } }

};

let activeDeskSlot = 0;
let binderLastPage = 0;

/* ===== Storage ===== */
function save(){ localStorage.setItem('gmb_state', JSON.stringify(state)); }

/* Bring backlog tasks dated "today" into today's list */
function pullTodayFromBacklog(){
  const today = todayKey();
  const move = [];
  state.backlog = (state.backlog || []).filter(t => {
    if (t.dueDate === today) { move.push(t); return false; }
    return true;
  });
  if (move.length) state.day.tasks.push(...move);
}

/* Keep the Dev-Time card inside Settings, always */
function moveDevCardHome(){
  const card = document.getElementById('devtime-card');
  const settings = document.getElementById('view-settings');
  if (card && settings && card.parentElement !== settings) {
    settings.appendChild(card);
  }
}

/* Show card only on Settings tab (extra guard) */
// Dev Time card should always be visible once inside Settings.
function toggleDevCardVisibility(_which){
  const card = document.getElementById('devtime-card');
  if (!card) return;
  card.style.display = ''; // never hide
}


/* On day change, roll everything to backlog and start a fresh day
   — stamp missing dueDate as the previous day so make-ups can work. */
function ensureDayIsCurrent(){
  const today = todayKey();
  if (!state.day || state.day.date !== today) {
    if (state.day && Array.isArray(state.day.tasks)) {
      const prevDate = state.day.date || today;
      const carryAll = state.day.tasks.map(t => ({
        ...t,
        dueDate: t.dueDate || prevDate
      }));
      if (carryAll.length) state.backlog = [...(state.backlog || []), ...carryAll];
    }
    state.day = {
      date: today,
      clockedInAt: null,
      tasks: [],
      rewardsClaimed: 0,
      clockBoxClaimed: false,
      endedAt: null
    };
    pullTodayFromBacklog();
    save();
  }
}
function lockPageScroll(lock){
  document.documentElement.style.overflow = lock ? 'hidden' : '';
  document.body.style.overscrollBehaviorY = lock ? 'contain' : '';
}

function load(){
  try{
    const raw = localStorage.getItem('gmb_state');
    if (!raw) return;
    const parsed = JSON.parse(raw);
    parsed.backlog ||= [];
    parsed.makeups ||= {};
    parsed.clockins ||= {};


    if (parsed.day?.date !== todayKey()) {
      state.collection = parsed.collection || [];
      state.desk = parsed.desk || [null,null,null];
      state.backlog = parsed.backlog;
      state.makeups = parsed.makeups;
      state.clockins = parsed.clockins || {};


      // move ALL old day tasks into backlog (done + undone), stamp dueDate=prev day if missing
      const prevDate = parsed.day?.date || todayKey();
      const prevAll = (parsed.day?.tasks || []).map(t => ({ ...t, dueDate: t.dueDate || prevDate }));
      if (prevAll.length) state.backlog.push(...prevAll);

      state.day = {
        date: todayKey(),
        clockedInAt: null,
        tasks: [],
        rewardsClaimed: 0,
        clockBoxClaimed: false,
        endedAt: null
      };
      pullTodayFromBacklog();
      save();
    } else {
            Object.assign(state, parsed);    
      state.clockins ||= {};

      if (state.day && state.day.endedAt === undefined) state.day.endedAt = null;
      pullTodayFromBacklog();
    }
  }catch(e){ console.warn(e); }
}

/* ===== Gacha ===== */
/* ===== Gacha (deterministic by catalog; no duplicate binder entries) ===== */

/** Minimal translator shim: use lang.js key if present, else fallback. */
function tr(key, fallback) {
  const dict = (window.L || window.LANG || {});
  return (dict[key] ?? fallback ?? key);
}
// Simple formatter for placeholders like {n} / {title}
function fmt(str, vars){ return String(str).replace(/\{(\w+)\}/g,(m,k)=> (vars?.[k] ?? m)); }
function purgeNoArtFromCollection(){
  const lookup = {};
  ['plush','card','effect'].forEach(t => {
    (CATALOG[t]||[]).forEach(c => { lookup[c.id] = c; });
  });

  // keep items that have art or can be backfilled from catalog
  state.collection = (state.collection || []).map(it => {
    const cat = lookup[it.id];
    if (!it.art && cat?.art) it.art = cat.art;
    return it;
  }).filter(it => !!it.art);

  // unplace desk items that no longer exist
  const ids = new Set(state.collection.map(c=>c.id));
  state.desk = (state.desk || []).map(id => ids.has(id) ? id : null);

  save();
}
// Keep only collectibles that actually have art paths; unplace missing desk items
function enforceArtOnly(){
  // Clean up the user's current collection (backfill art where possible; drop art-less in UI)
  purgeNoArtFromCollection();

  // DO NOT prune the source CATALOG. We still want to award items even if art isn't loaded yet.
  save();
}


/** Rarity helpers */
const RARITY_ORDER = ['common', 'rare', 'epic', 'mythic', 'avia']; // display order low→high
function rarityClass(r) {
  switch (r) {
    case 'rare':   return 'rare';
    case 'epic':   return 'epic';
    case 'mythic': return 'mythic';
    case 'avia':   return 'avia';
    default:       return ''; // common: no special color
  }
}
function rarityLabel(r) {
  return (r === 'avia') ? 'AVIA' : String(r || 'COMMON').toUpperCase();
}
function hydrateI18n(){
  const map = {
    // Bottom tabs
    't-tabToday':   tr('tab.today',     '今日任务'),
    't-tabBinder':  tr('tab.binder',    '收藏册'),
    't-tabDesk':    tr('tab.desk',      '桌面展示'),
    't-tabSettings':tr('tab.settings',  '设置'),

    // Today view
    't-clockIn':      tr('today.clockIn',       '打卡 Clock In'),
    't-clockInHint':  tr('today.clockInHint',   '打卡即送2个盲盒 | Clock in grants 2 blind boxes'),
    't-tasks':        tr('today.tasks',         '任务 Tasks'),
    't-addTask':      tr('today.addTask',       '添加任务 Add'),
    't-progressHint': tr('today.progressHint',  '为大型任务设定“今日目标百分比”；达到目标计为完成。'),
    't-endRules':     tr('today.endRules',      '规则：打卡即送1个； 全完成得2个； 部分完成得1个； 未完成得0个。'),

    // Desk view
    't-deskHint':     tr('desk.hint',           '从收藏选择3个展示到“工位”。'),

    // Settings
    't-demo':         tr('settings.demo',       '演示 Demo'),
    't-about':        tr('settings.about',      '关于 About'),
  };

  Object.entries(map).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });

  // Non-span labels that already exist
  const binderEmpty = document.getElementById('binder-empty');
  if (binderEmpty) binderEmpty.textContent = tr('binder.empty', '还没有收藏哦 No collectibles yet');
}


/** Stable catalog: one rarity per collectible.  */
const CATALOG = {
  plush: [
    { id:'plush-1',  type:'plush', rarity:'common', fallbackName:'Plush 1',  nameKey:'collectible.plush.1'  },
    { id:'plush-2',  type:'plush', rarity:'common', fallbackName:'Plush 2',  nameKey:'collectible.plush.2'  },
    { id:'plush-3',  type:'plush', rarity:'common', fallbackName:'Plush 3',  nameKey:'collectible.plush.3'  },
    { id:'plush-4',  type:'plush', rarity:'common', fallbackName:'Plush 4',  nameKey:'collectible.plush.4'  },
    { id:'plush-5',  type:'plush', rarity:'common', fallbackName:'Plush 5',  nameKey:'collectible.plush.5'  },
    { id:'plush-6',  type:'plush', rarity:'rare',   fallbackName:'Plush 6',  nameKey:'collectible.plush.6'  },
    { id:'plush-7',  type:'plush', rarity:'rare',   fallbackName:'Plush 7',  nameKey:'collectible.plush.7'  },
    { id:'plush-8',  type:'plush', rarity:'epic',   fallbackName:'Plush 8',  nameKey:'collectible.plush.8'  },
  ],
  card: [
    { id:'card-1',   type:'card',  rarity:'common', fallbackName:'Card 1',   nameKey:'collectible.card.1'   },
    { id:'card-2',   type:'card',  rarity:'common', fallbackName:'Card 2',   nameKey:'collectible.card.2'   },
    { id:'card-3',   type:'card',  rarity:'common', fallbackName:'Card 3',   nameKey:'collectible.card.3'   },
    { id:'card-4',   type:'card',  rarity:'common', fallbackName:'Card 4',   nameKey:'collectible.card.4'   },
    { id:'card-5',   type:'card',  rarity:'rare',   fallbackName:'Card 5',   nameKey:'collectible.card.5'   },
    { id:'card-6',   type:'card',  rarity:'rare',   fallbackName:'Card 6',   nameKey:'collectible.card.6'   },
    { id:'card-7',   type:'card',  rarity:'epic',   fallbackName:'Card 7',   nameKey:'collectible.card.7'   },
    { id:'card-8',   type:'card',  rarity:'mythic', fallbackName:'Card 8',   nameKey:'collectible.card.8'   },
  ],
  effect: [
    { id:'effect-1', type:'effect', rarity:'rare',   fallbackName:'Effect 1', nameKey:'collectible.effect.1' },
    { id:'effect-2', type:'effect', rarity:'rare',   fallbackName:'Effect 2', nameKey:'collectible.effect.2' },
    { id:'effect-3', type:'effect', rarity:'epic',   fallbackName:'Effect 3', nameKey:'collectible.effect.3' },
    { id:'effect-4', type:'effect', rarity:'mythic', fallbackName:'Effect 4', nameKey:'collectible.effect.4' },
    { id:'effect-5', type:'effect', rarity:'avia',   fallbackName:'Effect 5', nameKey:'collectible.effect.5' },
  ]
};
// === Auto-load collectibles from index.txt ===
async function autoLoadCollectibles() {
  try {
    const text = await fetch('./assets/collectibles/index.txt').then(r => r.text());
    text.split(/\r?\n/).forEach(line => {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length < 4) return;
      const [type, rarity, filename, name] = parts;
      const list = CATALOG[type];
      if (!list) return;
      const id = `${type}-${filename.replace(/\.[^.]+$/, '')}`;
      if (list.some(i => i.id === id)) return; // skip duplicates
      list.push({
        id, type, rarity,
        fallbackName: name,
        nameKey: `collectible.${type}.${filename}`,
        art: `./assets/collectibles/${filename}`
      });
    });
  } catch (err) {
    console.warn('No index.txt found or failed to load', err);
  }
}
// Backfill art on an item from the catalog if missing (no side effects otherwise)
function ensureItemArt(item){
  if (!item || item.art) return item;
  const all = [...(CATALOG.plush||[]), ...(CATALOG.card||[]), ...(CATALOG.effect||[])];
  const cat = all.find(x => x.id === item.id);
  if (cat && cat.art) item.art = cat.art;
  return item;
}


function emojiFor(type){ return type==='plush'?'🧸':type==='card'?'🖼️':'✨'; }

/** New rarity roll (adjust numbers anytime). */
function rollRarity(){
  const r = Math.random()*100;
  if (r < 60) return 'common';    // 60%
  if (r < 90) return 'rare';      // 30%
  if (r < 98) return 'epic';      // 8%
  if (r < 99.5) return 'mythic';  // 1.5%
  return 'avia';                  // 0.5%
}
/** Keep type weights similar to before. */
function rollType(){
  const r = Math.random()*100;
  if (r < 60) return 'plush';   // 60%
  if (r < 90) return 'card';    // 30%
  return 'effect';              // 10%
}

function pickFromCatalog(type, rarity){
  const all = [...(CATALOG.plush||[]), ...(CATALOG.card||[]), ...(CATALOG.effect||[])];
  const pick = (arr) => arr[Math.floor(Math.random()*arr.length)];

  const byType = (CATALOG[type] || []);
  const tSameR = byType.filter(x => x.rarity === rarity);
  if (tSameR.length) return pick(tSameR);

  if (byType.length) return pick(byType);

  const aSameR = all.filter(x => x.rarity === rarity);
  if (aSameR.length) return pick(aSameR);

  return all.length ? pick(all) : null;
}




/** Store one row per catalog id; increment count. */
function upsertByCatalog(entry){
  const existing = state.collection.find(c => c.id === entry.id);
  if (existing) {
    existing.count = (existing.count || 0) + 1;
    // If we finally learned the art path from index.txt, keep it
    if (!existing.art && entry.art) existing.art = entry.art;
    // Refresh name from i18n if available
    existing.name = tr(entry.nameKey, entry.fallbackName);
    existing.nameKey = entry.nameKey;
    return existing;
  }
  const c = {
    id: entry.id,
    type: entry.type,
    rarity: entry.rarity,
    count: 1,
    name: tr(entry.nameKey, entry.fallbackName),
    nameKey: entry.nameKey,
    art: entry.art || null    // <-- keep the image path
  };
  state.collection.unshift(c);
  return c;
}


function grantOneRandom(){
  // try a few times to pull a typed/rarity item that has art
  for (let i = 0; i < 30; i++){
    const entry = pickFromCatalog(rollType(), rollRarity());
    if (!entry) continue;
    ensureItemArt(entry);
    if (entry.art) return upsertByCatalog(entry);
  }
  // last resort: any artful entry from the catalog
  const all = [...(CATALOG.plush||[]), ...(CATALOG.card||[]), ...(CATALOG.effect||[])].filter(x => x.art);
  if (all.length) {
    const entry = all[Math.floor(Math.random()*all.length)];
    ensureItemArt(entry);
    return upsertByCatalog(entry);
  }
  // nothing to award (catalog truly empty of art)
  toast('No artful collectibles found in catalog'); 
  return null;
}



/** One-time migration: collapse old duplicates to catalog ids. */
function migrateCollectionToCatalog(){
  if (!Array.isArray(state.collection) || state.collection.length === 0) return;

  const oldList = state.collection.slice();   // keep original for id map
  const idMapOldToNew = {};
  const acc = {};

  const byType = {
    plush: CATALOG.plush,
    card: CATALOG.card,
    effect: CATALOG.effect
  };

  function mapOldToCatalog(old){
    const list = byType[old.type] || [];
    // Try to parse index from name: "Plush 3", "Card 7", "Effect 2"
    const m = (old.name || '').match(/(\d+)\s*$/);
    if (m) {
      const idx = Math.max(1, parseInt(m[1], 10)) - 1;
      if (list[idx]) return list[idx];
    }
    // Fallback: by rarity preference & same type
    const foundSameR = list.find(x => x.rarity === old.rarity) || list[0];
    return foundSameR || null;
  }

  oldList.forEach(old => {
    const entry = mapOldToCatalog(old);
    if (!entry) return;
    idMapOldToNew[old.id] = entry.id;
    const key = entry.id;
    if (!acc[key]) {
      acc[key] = {
        id: entry.id,
        type: entry.type,
        rarity: entry.rarity,
        count: 0,
        name: tr(entry.nameKey, entry.fallbackName),
        nameKey: entry.nameKey
      };
    }
    acc[key].count += (old.count || 1);
  });

  state.collection = Object.values(acc);

  // Remap any desk placements that referred to old UUIDs
  state.desk = (state.desk || []).map(did => idMapOldToNew[did] || did);

  save();
}


/* keep input + label + chip in sync with current override */
function refreshDevStateLabels(){
  const s = localStorage.getItem('gmb_dev_now');  // 'YYYY-MM-DD HH:MM' or null
  const p = document.getElementById('dev-now-state');
  if (p) p.textContent = s ? `模拟时间: ${s}` : '使用系统时间';
  const input = /** @type {HTMLInputElement|null} */(document.getElementById('dev-dt'));
  if (input) input.value = s ? s.replace(' ','T') : '';
  showDevChip();
}

/* ===== Tabs ===== */
function renderTabs(){
  $('#tab-today')?.addEventListener('click', (e)=>{ 
    e.preventDefault?.(); 
    moveDevCardHome();
    toggleDevCardVisibility('today');
    renderToday(); 
    show('today'); 
  });

  $('#tab-binder')?.addEventListener('click', (e)=>{ 
    e.preventDefault?.(); 
    moveDevCardHome();
    toggleDevCardVisibility('binder');
    renderBinder(); 
    show('binder'); 
  });

  $('#tab-desk')?.addEventListener('click', (e)=>{ 
    e.preventDefault?.(); 
    moveDevCardHome();
    toggleDevCardVisibility('desk');
    renderDesk(); 
    show('desk'); 
  });

  $('#tab-settings')?.addEventListener('click', (e)=>{ 
    e.preventDefault?.(); 
    show('settings'); 
    ensureDevTimeUI();          // create if missing
    document.getElementById('devtime-card')?.style.removeProperty('display');
    moveDevCardHome();          // keep inside settings
    refreshDevStateLabels();    // sync
    toggleDevCardVisibility('settings');
  });

  $('#note-today')?.addEventListener('click', (e)=>{
    e.preventDefault?.();
    moveDevCardHome();
    toggleDevCardVisibility('today');
    renderToday();
    show('today');
  });
}

/* Robust navigation & settings actions via delegation (safety net) */
function bindGlobalDelegation(){
  if (window.__delegationBound) return;
  window.__delegationBound = true;

  document.addEventListener('click', (ev) => {
    const el = ev.target instanceof Element ? ev.target.closest(
      '#tab-today, #tab-binder, #tab-desk, #tab-settings, #note-today, '+
      '#reset-btn, #gift-10, '+
      '#dev-set, #dev-clear'
    ) : null;
    if (!el) return;

    // nav
    if (el.matches('#tab-today, #note-today')) { ev.preventDefault(); moveDevCardHome(); toggleDevCardVisibility('today'); renderToday(); show('today'); return; }
    if (el.matches('#tab-binder'))             { ev.preventDefault(); moveDevCardHome(); toggleDevCardVisibility('binder'); renderBinder(); show('binder'); return; }
    if (el.matches('#tab-desk'))               { ev.preventDefault(); moveDevCardHome(); toggleDevCardVisibility('desk'); renderDesk(); show('desk'); return; }
    if (el.matches('#tab-settings'))           { ev.preventDefault(); show('settings'); ensureDevTimeUI(); moveDevCardHome(); refreshDevStateLabels(); toggleDevCardVisibility('settings'); return; }

    // settings actions
    if (el.matches('#reset-btn')) {
      ev.preventDefault();
      if (!confirm('确定要清空所有数据吗？')) return;
      localStorage.removeItem('gmb_state');
      location.reload();
      return;
    }
    if (el.matches('#gift-10')) {
      ev.preventDefault();
      for(let i=0;i<10;i++){ grantOneRandom(); }
      save();
      alert('已添加10个随机收藏（演示用）');
      return;
    }
        // dev time (safety net: works even if direct binds didn't attach)
    if (el.matches('#dev-set')) {
      ev.preventDefault();
      const input = /** @type {HTMLInputElement|null} */(document.getElementById('dev-dt'));
      const str = input && input.value
        ? input.value.replace('T',' ').slice(0,16)
        : (()=>{
            const d = new Date();
            const pad = (n)=>String(n).padStart(2,'0');
            return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
          })();
      window.__setDevNow(str);
      refreshDevStateLabels();
      ensureDayIsCurrent();
      renderToday(); renderEndButton();
      toast('已设置模拟时间：' + str);
      return;
    }
    if (el.matches('#dev-clear')) {
      ev.preventDefault();
      window.__clearDevNow();
      refreshDevStateLabels();
      ensureDayIsCurrent();
      renderToday(); renderEndButton();
      toast('已恢复为系统时间');
      return;
    }
  }, { passive:false });
}

function show(which){
  ['today','binder','desk','settings'].forEach(id => {
    $('#view-'+id)?.classList.toggle('active', id===which);
    $('#tab-'+id)?.classList.toggle('active', id===which);
  });
}

/* ===== Tiny toast ===== */
function toast(msg, ms=2400){
  let el = document.getElementById('gmb-toast');
  if (!el){
    el = document.createElement('div');
    el.id = 'gmb-toast';
    Object.assign(el.style,{
      position:'fixed', left:'50%', bottom:'calc(72px + 16px)',
      transform:'translateX(-50%)', background:'rgba(0,0,0,.75)',
      color:'#fff', padding:'10px 14px', borderRadius:'12px',
      fontSize:'14px', zIndex:9999, maxWidth:'min(88vw,520px)', textAlign:'center',
      boxShadow:'0 6px 16px rgba(0,0,0,.25)'
    });
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = '0';
  el.style.transition = 'opacity .2s ease';
  requestAnimationFrame(()=>{
    el.style.opacity = '1';
    setTimeout(()=>{ el.style.opacity = '0'; }, ms);
  });
}

/* ===== Dev banner/chip ===== */
function showDevChip(){
  let chip = document.getElementById('dev-chip');
  const s = localStorage.getItem('gmb_dev_now');
  if (!s){
    if (chip) chip.remove();
    return;
  }
  if (!chip){
    chip = document.createElement('button');
    chip.id = 'dev-chip';
    chip.className = 'secondary';
    Object.assign(chip.style,{
      position:'fixed', left:'12px', bottom:'calc(72px + 12px)',
      zIndex: 9998, padding:'8px 10px', borderRadius:'10px',
      background:'#fff', border:'1px solid rgba(0,0,0,.08)', boxShadow:'0 6px 16px rgba(0,0,0,.12)',
      cursor:'pointer'
    });
    chip.addEventListener('click', () => {
      if (confirm('清除模拟时间并恢复系统时间？')) {
        __clearDevNow();
        refreshDevStateLabels();
        ensureDayIsCurrent();
        renderToday(); renderEndButton();
        toast('已恢复为系统时间');
      }
    });
    document.body.appendChild(chip);
  }
  chip.textContent = `DEV 时间: ${s}（点我还原）`;
}

/* ===== Today view ===== */
function renderToday(){
  ensureDayIsCurrent();

  const ciBtn = $('#clockin-btn');
  const ciText = $('#clocked-text');
  if (!ciBtn || !ciText) return;

  // clock-in widget
  if (state.day.clockedInAt) {
    ciBtn.classList.add('hidden'); ciText.classList.remove('hidden');
    const t = new Date(state.day.clockedInAt).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    ciText.textContent = `已打卡 Clocked in: ${t}`;
  } else {
    ciBtn.classList.remove('hidden'); ciText.classList.add('hidden');
  ciBtn.onclick = async () => {
  const now = getNow();
  if (now.getHours() < DAY_START_HOUR) {
    alert('每天 6:00 之后才能打卡 / Clock-in opens at 6:00 AM');
    return;
  }
  state.day.clockedInAt = now.toISOString();
  state.clockins ||= {};
  state.clockins[todayKey()] = true;

if (!state.day.clockBoxClaimed) {
  const first  = grantOneRandom();
  const second = grantOneRandom();
  state.day.clockBoxClaimed = true;
  save();

  if (first)  { try { await showRevealAsync(first); }  catch(e){ console.warn(e); } }
  if (second) { try { await showRevealAsync(second); } catch(e){ console.warn(e); } }
} else {
  save();
}
  renderToday();
};
  }

  // add-task (boolean; route by date). If already ended, force to backlog (due=today).
  const addBtn = $('#task-add');
  if (addBtn) {
    addBtn.onclick = () => {
      const title = $('#task-input').value.trim();
      let dueDate = $('#task-date').value || null;
      if (!title) return;

      const ended = !!state.day.endedAt;
      const isTodayLike = (!dueDate || dueDate === todayKey());

      const task = { id: crypto.randomUUID(), title, dueDate, done: false, completedAt: null };

      if (ended && isTodayLike) {
        task.dueDate = todayKey();
        state.backlog.push(task);
        toast('今天已收工，新任务将进入待办（可明日补领奖励）');
      } else if (!dueDate || dueDate === todayKey()) {
        state.day.tasks.push(task);
      } else {
        state.backlog.push(task);
      }

      $('#task-input').value = '';
      $('#task-date').value = '';
      save(); renderTasks(); renderEndButton(); renderBacklogNote();
      renderBacklogSection(); renderCompletedSection();
  setTimeout(() => {
  const last = document.querySelector('#task-list li:last-child');
  if (last) last.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
}, 0);
    };
  }

  renderTasks();
  renderEndButton();
  renderBacklogNote();
  renderBacklogSection();
  renderCompletedSection();

  // gentle reminder if dev time active
  if (localStorage.getItem('gmb_dev_now')) {
    toast('当前为“模拟时间”模式：请在设置页或左下角小按钮中恢复系统时间以进入新的一天。', 3200);
  }

  function renderBacklogNote(){
    const note = $('#backlog-note'); if (!note) return;
    const t = todayKey();
    const pending = (state.backlog || []).filter(x => !x.done);

    const past    = pending.filter(x => x.dueDate && x.dueDate < t).length;
    const future  = pending.filter(x => x.dueDate && x.dueDate > t).length;
    const undated = pending.filter(x => !x.dueDate).length;
    const total   = past + future + undated;

    if (!total){
      note.classList.add('hidden');
      note.textContent = '';
      return;
    }
    const parts = [];
    if (past) parts.push(`过期 ${past}`);
    if (future) parts.push(`计划 ${future}`);
    if (undated) parts.push(`未设日期 ${undated}`);

    note.textContent = `你有 ${total} 个非今天的任务（${parts.join(' / ')}）。收工时会询问进展；若某个过去日期全部完成，可补领盲盒。`;
    note.classList.remove('hidden');
  }
}

/* ===== Today main list (UNDONE only) ===== */
function renderTasks(){
  const list = $('#task-list'); if (!list) return;
  list.innerHTML = '';
  const undone = (state.day.tasks || []).filter(t => !t.done);
  if (undone.length === 0){
    const p = document.createElement('p'); p.className='muted'; p.textContent='暂无待办 No undone tasks'; list.append(p); return;
  }

  undone.forEach(task => {
    const li = document.createElement('li');

    const left = document.createElement('div');
    const dueStr = task.dueDate ? `截止 Due: ${task.dueDate}` : '';
    left.innerHTML = `
      <div class="title">${task.title}</div>
      <div class="meta">${dueStr || '&nbsp;'}</div>
    `;

    const controls = document.createElement('div');
    controls.style.display='grid';
    controls.style.gridTemplateColumns='auto';
    controls.style.gap='6px';

    const toggle = document.createElement('button');
    toggle.className = 'primary';
    toggle.textContent = '标记完成 Mark Done';
    toggle.onclick = () => {
      task.done = true;
      task.completedAt = getNow().toISOString();
      save(); renderTasks(); renderEndButton(); renderCompletedSection();

      // Jump to Completed section
      const det = document.getElementById('done-details');
      if (det) det.open = true;
      document.getElementById('done-card')?.scrollIntoView({ behavior:'smooth', block:'start' });
    };

    const editDue = document.createElement('button');
    editDue.className='secondary';
    editDue.textContent='日期 Due';
    editDue.onclick = () => {
      const d = prompt('设置截止日期 (YYYY-MM-DD) / Set due date', task.dueDate||'');
      if (d !== null) task.dueDate = d || null;
      save(); renderTasks(); renderBacklogNote(); renderCompletedSection();
    };

    const del = document.createElement('button');
    del.className='danger';
    del.textContent='删除 Delete';
    del.onclick = () => {
      state.day.tasks = state.day.tasks.filter(t=>t.id!==task.id);
      save(); renderTasks(); renderEndButton(); renderCompletedSection();
    };

    controls.append(toggle, editDue, del);
    li.append(left, controls);
    list.append(li);
  });
}

/* ===== Collapsible: Uncompleted backlog ===== */
function ensureBacklogCard(){
  const todayView = $('#view-today'); if (!todayView) return null;
  let card = document.getElementById('unc-card');
  if (card) return card;

  card = document.createElement('div');
  card.className = 'card';
  card.id = 'unc-card';
  card.innerHTML = `
    <details id="unc-details" open>
      <summary style="cursor:pointer;font-weight:700;">
        未完成任务 / Uncompleted (backlog) <span id="unc-count" class="muted small"></span>
      </summary>
      <div style="margin-top:10px;">
        <ul id="unc-list" class="tasks"></ul>
      </div>
    </details>
  `;
  todayView.appendChild(card);
  return card;
}
function renderBacklogSection(){
  ensureBacklogCard();
  const list = document.getElementById('unc-list');
  const count = document.getElementById('unc-count');
  if (!list || !count) return;

  const items = (state.backlog || []).filter(t => !t.done);
  count.textContent = `(${items.length})`;
  list.innerHTML = '';

  if (items.length === 0){
    const p = document.createElement('p'); p.className='muted'; p.textContent='没有未完成任务 No uncompleted backlog'; list.append(p); return;
  }

  items.forEach(task => {
    const li = document.createElement('li');

    const left = document.createElement('div');
    const dueStr = task.dueDate ? `截止 Due: ${task.dueDate}` : '未设日期 / No due';
    left.innerHTML = `
      <div class="title">${task.title}</div>
      <div class="meta">${dueStr}</div>
    `;

    const controls = document.createElement('div');
    controls.style.display='grid';
    controls.style.gridTemplateColumns='auto';
    controls.style.gap='6px';

    const toToday = document.createElement('button');
    toToday.className = 'secondary';
    toToday.textContent = '移到今天 / Move to Today';
    toToday.onclick = () => {
      const idx = state.backlog.findIndex(t => t.id === task.id);
      if (idx >= 0) {
        const [moved] = state.backlog.splice(idx, 1);
        moved.dueDate = todayKey(); // normalize to today
        state.day.tasks.push(moved);
        save(); renderTasks(); renderBacklogSection(); renderEndButton();
      }
    };

    const toggle = document.createElement('button');
    toggle.className = 'secondary';
    toggle.textContent = '标记完成 Mark Done';
    toggle.onclick = () => {
      task.done = true;
      task.completedAt = getNow().toISOString();
      save(); renderBacklogSection(); renderCompletedSection(); renderEndButton();

      const det = document.getElementById('done-details');
      if (det) det.open = true;
      document.getElementById('done-card')?.scrollIntoView({ behavior:'smooth', block:'start' });
    };

    const editDue = document.createElement('button');
    editDue.className='secondary';
    editDue.textContent='日期 Due';
    editDue.onclick = () => {
      const d = prompt('设置截止日期 (YYYY-MM-DD) / Set due date', task.dueDate||'');
      if (d !== null) task.dueDate = d || null;
      save(); renderBacklogSection(); renderCompletedSection();
    };

    const del = document.createElement('button');
    del.className='danger';
    del.textContent='删除 Delete';
    del.onclick = () => {
      state.backlog = state.backlog.filter(t => t.id !== task.id);
      save(); renderBacklogSection();
    };

    controls.append(toToday, toggle, editDue, del);
    li.append(left, controls);
    list.append(li);
  });
}

/* ===== Collapsible: Completed (all dates, range filters) ===== */
function ensureCompletedCard(){
  const todayView = $('#view-today'); if (!todayView) return null;
  let card = document.getElementById('done-card');
  if (card) return card;

  card = document.createElement('div');
  card.className = 'card';
  card.id = 'done-card';
  card.innerHTML = `
    <details id="done-details" open>
      <summary style="cursor:pointer;font-weight:700;">
        已完成 / Completed (all dates) <span id="done-count" class="muted small"></span>
      </summary>
      <div style="margin-top:10px;">
        <div class="row" style="grid-template-columns:auto auto auto auto 1fr; align-items:center; gap:8px; margin-bottom:8px;">
          <label class="small muted">筛选字段:</label>
          <label class="small"><input type="radio" name="done-mode" id="done-mode-due" checked> 截止日期</label>
          <label class="small"><input type="radio" name="done-mode" id="done-mode-completed"> 完成时间</label>
          <span></span>
        </div>
        <div class="row" style="grid-template-columns:auto auto auto auto 1fr; align-items:center; gap:8px; margin-bottom:8px;">
          <label class="small muted" for="done-start">开始:</label>
          <input id="done-start" type="date">
          <label class="small muted" for="done-end">结束:</label>
          <input id="done-end" type="date">
          <button id="done-filter-clear" class="secondary">清除 Clear</button>
        </div>
        <ul id="done-list" class="tasks"></ul>
      </div>
    </details>
  `;
  todayView.appendChild(card);

  // Wire once
  card.querySelector('#done-mode-due')?.addEventListener('change', renderCompletedSection);
  card.querySelector('#done-mode-completed')?.addEventListener('change', renderCompletedSection);
  card.querySelector('#done-start')?.addEventListener('change', renderCompletedSection);
  card.querySelector('#done-end')?.addEventListener('change', renderCompletedSection);
  card.querySelector('#done-filter-clear')?.addEventListener('click', () => {
    const s = /** @type {HTMLInputElement} */(card.querySelector('#done-start'));
    const e = /** @type {HTMLInputElement} */(card.querySelector('#done-end'));
    if (s) s.value=''; if (e) e.value='';
    renderCompletedSection();
  });

  return card;
}
function renderCompletedSection(){
  ensureCompletedCard();
  const list = document.getElementById('done-list');
  const count = document.getElementById('done-count');
  const modeDue = /** @type {HTMLInputElement|null} */(document.getElementById('done-mode-due'));
  const startEl = /** @type {HTMLInputElement|null} */(document.getElementById('done-start'));
  const endEl   = /** @type {HTMLInputElement|null} */(document.getElementById('done-end'));
  if (!list || !count) return;

  const allDone = [
    ...(state.day.tasks || []),
    ...(state.backlog || [])
  ].filter(t => t.done);

  const useDue = !!(modeDue?.checked);
  const start = startEl?.value || '';
  const end   = endEl?.value || '';

  const inRange = (dateStr) => {
    if (!dateStr) return false;
    if (start && dateStr < start) return false;
    if (end && dateStr > end) return false;
    return true;
  };

  const filtered = (!start && !end)
    ? allDone
    : allDone.filter(t => {
        const key = useDue ? (t.dueDate || '') : ((t.completedAt || '').slice(0,10));
        return key && inRange(key);
      });

  count.textContent = `(${allDone.length}${(start||end) ? ` • ${filtered.length} 显示` : ''})`;

  list.innerHTML = '';
  if (filtered.length === 0){
    const p = document.createElement('p'); p.className='muted'; p.textContent='暂无已完成任务（或未命中过滤条件）'; list.append(p); return;
  }

  filtered.forEach(task => {
    const li = document.createElement('li');

    const left = document.createElement('div');
    const dueStr = task.dueDate ? `截止 Due: ${task.dueDate}` : '未设日期 / No due';
    const doneAt = task.completedAt ? new Date(task.completedAt).toLocaleString() : '';
    left.innerHTML = `
      <div class="title">${task.title}</div>
      <div class="meta">${dueStr}${doneAt ? ` • 完成于 ${doneAt}` : ''}</div>
    `;

    const controls = document.createElement('div');
    controls.style.display='grid';
    controls.style.gridTemplateColumns='auto';
    controls.style.gap='6px';

    const undo = document.createElement('button');
    undo.className = 'secondary';
    undo.textContent = '撤销完成 Undo';
    undo.onclick = () => {
      task.done = false;
      task.completedAt = null;
      save(); renderTasks(); renderBacklogSection(); renderCompletedSection(); renderEndButton();
      const det = document.getElementById('unc-details');
      if (det) det.open = true;
    };

    const del = document.createElement('button');
    del.className='danger';
    del.textContent='删除 Delete';
    del.onclick = () => {
      state.day.tasks = (state.day.tasks || []).filter(t => t.id !== task.id);
      state.backlog  = (state.backlog  || []).filter(t => t.id !== task.id);
      save(); renderTasks(); renderBacklogSection(); renderCompletedSection(); renderEndButton();
    };

    controls.append(undo, del);
    li.append(left, controls);
    list.append(li);
  });
}

/* ===== End-of-day logic ===== */
function tasksStatus(){
  const tasks = state.day.tasks || [];
  if (tasks.length === 0) return { all:false, some:false };
  const doneCount = tasks.filter(t => t.done).length;
  return { all: doneCount === tasks.length && tasks.length>0, some: doneCount > 0 };
}
function todaysBoxCountBase(){
  const st = tasksStatus();
  if (st.all) return 3;   // 全完成：3
  if (st.some) return 2;  // 部分完成：2
  return 1;               // 0 个完成（或今天无任务）：1
}

function todaysRemainingToClaim(){
  const base = todaysBoxCountBase();
  const claimed = state.day.rewardsClaimed || 0;
  return Math.max(0, base - claimed);
}
/* === Make-up helpers (cap per past date to 0/1/2 and track counts) === */
function _completionTierForDate(list){
  const total = list.length;
  if (!total) return 0;
  const done = list.filter(t=>t.done).length;
  return (done === total) ? 2 : (done > 0 ? 1 : 0);
}

/* migrate legacy makeups {awarded:true} -> {awardedCount:1} */
function normalizeMakeups(){
  state.makeups ||= {};
  Object.keys(state.makeups).forEach(d => {
    const v = state.makeups[d];
    if (v === true) { state.makeups[d] = { awardedCount: 1 }; return; }
    if (v === false){ state.makeups[d] = { awardedCount: 0 }; return; }
    if (typeof v === 'object' && v){
      if (v.awarded === true && (v.awardedCount == null)) v.awardedCount = 1;
      if (v.awarded === false && (v.awardedCount == null)) v.awardedCount = 0;
    }
  });
}
/* Canonicalize a date-like string to YYYY-MM-DD (or null) */
function canonDate(s){
  if (!s) return null;
  const str = String(s).trim();

  // YYYY-M-D or YYYY-MM-DD
  let m = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m){
    const y=m[1], mo=String(parseInt(m[2],10)).padStart(2,'0'), d=String(parseInt(m[3],10)).padStart(2,'0');
    return `${y}-${mo}-${d}`;
  }
  // MM/DD/YYYY or M/D/YYYY
  m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m){
    const mo=String(parseInt(m[1],10)).padStart(2,'0');
    const d =String(parseInt(m[2],10)).padStart(2,'0');
    const y =m[3];
    return `${y}-${mo}-${d}`;
  }
  // Fallback: anything Date can parse
  const d2 = new Date(str);
  if (!isNaN(d2.getTime())) return d2.toISOString().slice(0,10);

  return null;
}

function hasUnawardedPastDates(){
  const today = todayKey();
  const tasks = (state.backlog || []).filter(t => !!canonDate(t.dueDate));
  const byDate = tasks.reduce((acc, t) => {
    const k = canonDate(t.dueDate);
    (acc[k] ||= []).push(t);
    return acc;
  }, {});

  return Object.keys(byDate).some(dateStr => {
    if (dateStr >= today) return false;
    const allDone = byDate[dateStr].length > 0 && byDate[dateStr].every(t => t.done);
    const already = state.makeups?.[dateStr]?.awarded === true;
    const clocked = !!(state.clockins && state.clockins[dateStr]);
    return allDone && !already && clocked; // require clock-in on that past date

  });
}


function renderEndButton(){
  ensureDayIsCurrent();
  const btn = $('#endday-btn'); if (!btn) return;

  if (state.day?.endedAt) {
    btn.textContent = '今天已收工（明天再来）';
    btn.disabled = true;
    btn.onclick = null;
    return;
  }

  const remainingToday = todaysRemainingToClaim();
  const normalText = `结束一天并开启 ${remainingToday} 个盲盒`;

  btn.textContent = normalText;
  // Always allow 收工 (as requested). If no boxes, it still ends the day.
  btn.disabled = false;
  btn.onclick = () => openEndRewards();
}

function groupByDate(items){
  return items.reduce((acc, t) => {
    const k = t.dueDate || 'NO_DATE';
    (acc[k] ||= []).push(t);
    return acc;
  }, {});
}

// Only prompt for backlog tasks that are NOT already done.
// Then award 1 make-up box per PAST date whose tasks are ALL done and not yet awarded.
function checkMakeupsOnClockOut(){
  const today = todayKey();
  let makeupsToGrant = 0;

  // Ask only for non-today, not-yet-done items (normalize dates for the prompt)
  (state.backlog || []).forEach(t => {
    const dd = canonDate(t.dueDate);
    if ((dd !== today) && !t.done) {
      const ok = confirm(`「${t.title}」${dd ? `（${dd}）` : '（未设置日期）'}进展顺利吗？\n确定 = 顺利 / 取消 = 未完成`);
      t.done = !!ok;
      t.completedAt = t.done ? getNow().toISOString() : null;
    }
  });

  // Group by canonical date and award at most ONE per past date
  const dated = (state.backlog || []).map(t => ({ ...t, dueDate: canonDate(t.dueDate) })).filter(t => t.dueDate);
  const byDate = dated.reduce((acc, t) => {
    (acc[t.dueDate] ||= []).push(t);
    return acc;
  }, {});

  Object.keys(byDate).forEach(dateStr => {
    if (dateStr < today) {
      const allDone = byDate[dateStr].length > 0 && byDate[dateStr].every(t => t.done);
      const already = state.makeups?.[dateStr]?.awarded === true;
      const clocked = !!(state.clockins && state.clockins[dateStr]);
      if (allDone && !already && clocked) {
        state.makeups ||= {};
        state.makeups[dateStr] = { awarded: true }; // cap: 1 box per past date
        makeupsToGrant += 1;
      }

    }
  });

  save();
  return makeupsToGrant;
}



async function openEndRewards(){
  ensureDayIsCurrent();

  if (state.day?.endedAt) {
    alert('今天已经结束过啦。');
    return;
  }

  // Soft guard: before 16:00, ask for confirmation (no hard block)
  const now = getNow();
  if (now.getHours() < END_CUTOFF_HOUR) {
    const ok = confirm('今天还早着，确定要收工吗？请确认今日任务已完成。');
    if (!ok) return;
  }

  const remainingToday = todaysRemainingToClaim();
  const makeups = checkMakeupsOnClockOut();
  const total = remainingToday + makeups;

  // Mark today's portion as claimed so button can't mint more
  if (remainingToday > 0) {
    state.day.rewardsClaimed = (state.day.rewardsClaimed || 0) + remainingToday;
  }
  save();

  if (total <= 0) {
    toast('今天没有可开启的盲盒');
    // still mark ended: user chose to 收工
    state.day.endedAt = getNow().toISOString();
    save(); renderEndButton();
    return;
  }

for (let i = 0; i < total; i++) {
  const item = grantOneRandom();
  if (!item) { console.warn('No item granted (empty catalog?)'); continue; }
  try { await showRevealAsync(item); } catch(e){ console.warn(e); }
}

  state.day.endedAt = getNow().toISOString();
  save();
  renderEndButton();
}

/* ===== Binder ===== */
function renderBinder(){
  // Grab slots safely
  const gridSlots = [...Array(8).keys()].map(i => document.getElementById('binder-slot-'+i));
  const empty = document.getElementById('binder-empty');
  const binder = document.getElementById('binder');

  // If required DOM isn’t present, bail gracefully
  if (!empty || !binder || gridSlots.some(s => !s)) return;

  // Normalize collection
  const coll = Array.isArray(state.collection) ? state.collection : [];
  coll.forEach((_, i) => { if (gridSlots[i]) gridSlots[i].innerHTML = ''; });

  // Empty state
  if (coll.length === 0){
    empty.style.display = 'block';
    binder.classList.add('hidden');
    return;
  }

  empty.style.display = 'none';
  binder.classList.remove('hidden');

  // Page math (8 items per spread)
  const pageSize = 8;
  const maxPage = Math.max(0, Math.ceil(coll.length / pageSize) - 1);
  if (state.binderPage == null || Number.isNaN(state.binderPage)) state.binderPage = 0;
  state.binderPage = Math.min(Math.max(0, state.binderPage), maxPage);
  const start = state.binderPage * pageSize;

  // Fill visible items
  const items = coll.slice(start, start + pageSize);
  items.forEach((item, idx) => {
    const slot = gridSlots[idx];
    if (!slot) return;

    const tile = document.createElement('div');
    tile.className = 'tile';

    const art = document.createElement('div');
    art.className = 'art';
   ensureItemArt(item);
if (!item.art) return; // skip rendering this tile if it somehow lacks art
art.innerHTML = `<img src="${item.art}" alt="${item.name}" style="width:100%;height:100%;object-fit:contain;">`;


    const name = document.createElement('div');
    name.textContent = item.name;

    const meta = document.createElement('div');
    meta.className = 'meta';
    const r = document.createElement('span');
    r.className = 'tag ' + rarityClass(item.rarity);
    r.textContent = rarityLabel(item.rarity);
    const cnt = document.createElement('span');
    cnt.className = 'tag';
    cnt.textContent = 'x' + (item.count || 1);
    meta.append(r, cnt);

    tile.append(art, name, meta);
    tile.style.cursor = 'pointer';
    tile.addEventListener('click', () => {
      try {
        if (typeof window.showViewer === 'function') window.showViewer(item);
        else showReveal(item);
      } catch(e){ console.warn('viewer open failed:', e); }
    });

    slot.innerHTML = '';
    slot.append(tile);
  });

  // Wire pager (with guards)
  const prevBtn = document.getElementById('binder-prev');
  const nextBtn = document.getElementById('binder-next');

  if (prevBtn) {
    prevBtn.onclick = () => {
      if (state.binderPage <= 0) return;
      state.binderPage = Math.max(0, state.binderPage - 1);
      animateFlip('prev');
      renderBinder();
    };
  }
  if (nextBtn) {
    nextBtn.onclick = () => {
      if (state.binderPage >= maxPage) return;
      state.binderPage = Math.min(maxPage, state.binderPage + 1);
      animateFlip('next');
      renderBinder();
    };
  }

  // Page flip animation helper
  const dir = state.binderPage > binderLastPage ? 'next'
            : state.binderPage < binderLastPage ? 'prev'
            : null;
  if (dir) animateFlip(dir);
  binderLastPage = state.binderPage;

  function animateFlip(direction){
    const left = document.querySelector('.binder .spread .page.left');
    const right = document.querySelector('.binder .spread .page.right');
    const target = direction === 'next' ? right : left;
    if (!target) return;
    target.classList.remove('turn-left','turn-right');
    void target.offsetWidth;
    target.classList.add(direction === 'next' ? 'turn-right' : 'turn-left');
    setTimeout(() => target.classList.remove('turn-left','turn-right'), 460);
  }
}

/* ===== Desk ===== */
/* Slot pill helpers (polyfill; safe to add once) */
/* Slot pill helpers (robust; handle click + pointerdown via delegation) */
(function(){
  if (window.__deskPillsInstalled) return;
  window.__deskPillsInstalled = true;

  window.setActiveSlot = function(i){
    activeDeskSlot = i;
    [0,1,2].forEach(idx => {
      const b = document.getElementById('slot-'+idx);
      if (b) b.classList.toggle('active', idx === activeDeskSlot);
    });
  };

  window.bindSlotPillsOnce = function(){
    if (window.__deskPillsBound) return;
    window.__deskPillsBound = true;

    const wrap = document.querySelector('.slot-pills');
    if (!wrap) return;

    const handler = (ev) => {
      const btn = ev.target && ev.target.closest?.('.pill');
      if (!btn) return;
      ev.preventDefault?.(); ev.stopPropagation?.();
      const idx = Number((btn.id || '').replace('slot-',''));
      if (!Number.isNaN(idx)) setActiveSlot(idx);
    };

    // handle both touch and mouse consistently
    wrap.addEventListener('pointerdown', handler, { passive:false });
    wrap.addEventListener('click',       handler, { passive:false });
  };
})();


function renderDesk(){
  const sel = $('#desk-source'); if (!sel) return;
  sel.innerHTML = '';

  // how many copies already placed
  const placedCounts = (state.desk || []).reduce((m, id) => {
    if (!id) return m; m[id] = (m[id] || 0) + 1; return m;
  }, {});

  // options only for items with free copies
  (state.collection || []).forEach(item => {
    const used = placedCounts[item.id] || 0;
    const free = Math.max(0, (item.count || 0) - used);
    if (free <= 0) return; // cannot place more than you own

    const opt = document.createElement('option');
    opt.value = item.id;
    opt.value = item.id;
opt.textContent = `${emojiFor(item.type)} ${item.name} [${rarityLabel(item.rarity)}] x${item.count}`;
    sel.append(opt);
  });

// render stickers (with type-based scale)
(state.desk || []).forEach((id, i) => {
  const box = $('#desk-item-' + i);
  if (!box) return;

  if (!id) {
    box.textContent = '空 Empty';
    box.style.transform = '';
    box.removeAttribute('data-type');
    return;
  }

  const item = (state.collection || []).find(x => x.id === id);
  if (!item) {
    box.textContent = '空 Empty';
    box.style.transform = '';
    box.removeAttribute('data-type');
    return;
  }

  // scale by item type
  const scale =
    item.type === 'card'  ? 0.8 :
    item.type === 'plush' ? 1.2 :
    1.0;

  box.dataset.type = item.type;                 // (optional) handy for CSS
  box.style.transform = `scale(${scale})`;
  box.style.transformOrigin = 'center center';

box.innerHTML = item.art
  ? `<img class="sticker" src="${item.art}" alt="${item.name}">`
  : `<div class="sticker">${emojiFor(item.type)}</div>`;


});


  // ensure pills reflect current selection
  bindSlotPillsOnce?.();
  setActiveSlot?.(activeDeskSlot);

  // placement with cap check
  const placeBtn = $('#desk-place');
  if (placeBtn) placeBtn.onclick = () => {
    const id = sel.value; if (!id) return;

    const used = (state.desk || []).filter(x => x === id).length;
    const own  = ((state.collection || []).find(x => x.id === id)?.count) || 0;
    if (used >= own){ toast('该藏品没有可用副本可放置'); return; }

    state.desk[activeDeskSlot] = id;
    save(); renderDesk();
  };
}
// minimal shim so calls don't crash even if you never added the helper
window.lockPageScroll ||= function(lock){
  document.documentElement.style.overflow = lock ? 'hidden' : '';
  document.body.style.overscrollBehaviorY = lock ? 'contain' : '';
};

function ensureRevealDialog(){
  let dlg = document.getElementById('reveal');
  if (dlg && dlg.nodeName.toLowerCase() === 'dialog') return dlg;

  // Build a minimal dialog if absent or wrong tag
  if (dlg) dlg.remove();
  dlg = document.createElement('dialog');
  dlg.id = 'reveal';
  dlg.innerHTML = `
    <div class="reveal-card">
      <header style="display:flex;justify-content:space-between;align-items:center;">
        <h3 id="reveal-title" style="margin:0;">获得新藏品！</h3>
        <button id="reveal-close" class="secondary">关闭</button>
      </header>
      <div id="reveal-art" style="width:100%;height:220px;display:flex;align-items:center;justify-content:center;margin:12px 0;"></div>
      <div class="row" style="gap:8px;margin:8px 0;">
        <span id="reveal-rarity" class="tag">COMMON</span>
        <span id="reveal-type" class="tag">PLUSH</span>
      </div>
      <div id="reveal-name" style="font-weight:700;margin:6px 0 12px;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="reveal-share" class="secondary">分享</button>
        <button id="reveal-close-2" class="primary">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(dlg);

  // Wire close buttons
  dlg.querySelector('#reveal-close')?.addEventListener('click', () => dlg.close());
  dlg.querySelector('#reveal-close-2')?.addEventListener('click', () => dlg.close());

  return dlg;
}

/* ===== Reveal ===== */
function showRevealAsync(item){
  return new Promise((resolve) => {
    $('#reveal-title').textContent = '获得新藏品！';
    const artHost = $('#reveal-art');
   ensureItemArt(item);
if (!item || !item.art) return; // should not happen now
artHost.innerHTML = `<img src="${item.art}" alt="${item.name}" style="width:100%;height:100%;object-fit:contain;">`;


    $('#reveal-rarity').textContent = rarityLabel(item.rarity);
    $('#reveal-type').textContent = item.type.toUpperCase();
    $('#reveal-rarity').className = 'tag ' + rarityClass(item.rarity);
    $('#reveal-name').textContent = item.name;

    const dlg = $('#reveal');
    dlg.className = '';
    dlg.id = 'reveal';
    dlg.classList.add('rarity-' + (item.rarity || 'common'));
    const card = dlg.querySelector('.reveal-card');
    burstConfetti(card);

    const onClose = () => {
      dlg.removeEventListener('close', onClose);
      dlg.removeEventListener('cancel', onClose);
      lockPageScroll(false);
      document.activeElement?.blur?.();
      resolve();
    };
    dlg.addEventListener('close',  onClose, { once:true });
    dlg.addEventListener('cancel', onClose, { once:true });

    $('#reveal-close').onclick = () => dlg.close();
    $('#reveal-share').onclick = async () => {
      const text = `我在「工位萌伴园」开到：${item.rarity.toUpperCase()} ${item.type.toUpperCase()} — ${item.name} 🎁`;
      if (navigator.share){
        try{ await navigator.share({ title:'工位萌伴园', text, url: location.href }); } catch(e){}
      } else {
        try { await navigator.clipboard.writeText(text + ' ' + location.href); alert('已复制分享文案到剪贴板（可粘贴到微信群/朋友圈）'); }
        catch(e){ alert('复制失败，请手动复制'); }
      }
    };

    // lock + open (rAF avoids occasional mobile bar jank)
    requestAnimationFrame(() => { lockPageScroll(true); dlg.showModal(); });
  });
}


function showReveal(item){
  $('#reveal-title').textContent = '获得新藏品！';
  const artHost = $('#reveal-art');
 ensureItemArt(item);
if (!item || !item.art) return; // should not happen now
artHost.innerHTML = `<img src="${item.art}" alt="${item.name}" style="width:100%;height:100%;object-fit:contain;">`;


  $('#reveal-rarity').textContent = rarityLabel(item.rarity);
  $('#reveal-type').textContent = item.type.toUpperCase();
  $('#reveal-rarity').className = 'tag ' + rarityClass(item.rarity);
  $('#reveal-name').textContent = item.name;

  const dlg = $('#reveal');
  dlg.className = '';
  dlg.id = 'reveal';
  dlg.classList.add('rarity-' + (item.rarity || 'common'));
  const card = dlg.querySelector('.reveal-card');
  burstConfetti(card);

  const onClose = () => {
    dlg.removeEventListener('close', onClose);
    dlg.removeEventListener('cancel', onClose);
    lockPageScroll(false);
    document.activeElement?.blur?.();
  };
  dlg.addEventListener('close',  onClose, { once:true });
  dlg.addEventListener('cancel', onClose, { once:true });

  $('#reveal-close').onclick = () => dlg.close();
  $('#reveal-share').onclick = async () => {
    const text = `我在「工位萌伴园」开到：${item.rarity.toUpperCase()} ${item.type.toUpperCase()} — ${item.name} 🎁`;
    if (navigator.share){
      try{ await navigator.share({ title:'工位萌伴园', text, url: location.href }); } catch(e){}
    } else {
      try { await navigator.clipboard.writeText(text + ' ' + location.href); alert('已复制分享文案到剪贴板（可粘贴到微信群/朋友圈）'); }
      catch(e){ alert('复制失败，请手动复制'); }
    }
  };

  requestAnimationFrame(() => { lockPageScroll(true); dlg.showModal(); });
}
window.showViewer = function(item){
  if (!item) return;

  // Title = item name (no “获得新藏品！”)
  $('#reveal-title').textContent = item.name || '查看藏品';

  // Art
  const artHost = $('#reveal-art');
  if (item.art) {
    artHost.innerHTML = `<img src="${item.art}" alt="${item.name}" style="width:100%;height:100%;object-fit:contain;">`;
  } else {
    artHost.textContent = emojiFor(item.type);
  }

  // Meta
  $('#reveal-rarity').textContent = rarityLabel(item.rarity);
  $('#reveal-type').textContent = item.type.toUpperCase();
  $('#reveal-rarity').className = 'tag ' + rarityClass(item.rarity);
  $('#reveal-name').textContent = item.name;

  // Dialog open (no confetti)
  const dlg = $('#reveal');
  dlg.className = '';
  dlg.id = 'reveal';
  dlg.classList.add('rarity-' + (item.rarity || 'common'));

  const onClose = () => {
    dlg.removeEventListener('close', onClose);
    dlg.removeEventListener('cancel', onClose);
    lockPageScroll(false);
    document.activeElement?.blur?.();
  };
  dlg.addEventListener('close',  onClose, { once:true });
  dlg.addEventListener('cancel', onClose, { once:true });

  $('#reveal-close').onclick = () => dlg.close();
  $('#reveal-share').onclick = async () => {
    const text = `我在「工位萌伴园」查看：${item.rarity.toUpperCase()} ${item.type.toUpperCase()} — ${item.name} 🎁`;
    if (navigator.share){
      try{ await navigator.share({ title:'工位萌伴园', text, url: location.href }); } catch(e){}
    } else {
      try { await navigator.clipboard.writeText(text + ' ' + location.href); alert('已复制分享文案到剪贴板'); }
      catch(e){ alert('复制失败，请手动复制'); }
    }
  };

  requestAnimationFrame(() => { lockPageScroll(true); dlg.showModal(); });
};

/* ===== Settings ===== */
function attachSettings(){
  if (window.__settingsBound) return;
  window.__settingsBound = true;

  $('#reset-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!confirm('确定要清空所有数据吗？')) return;
    localStorage.removeItem('gmb_state'); location.reload();
  });
  $('#gift-10')?.addEventListener('click', (e) => {
    e.preventDefault();
    for(let i=0;i<10;i++){ grantOneRandom(); }
    save(); alert('已添加10个随机收藏（演示用）');
  });

  ensureDevTimeUI();
}
/* === Runtime layout fixes (binder overflow + bottom padding) === */
(function injectRuntimeCSS(){
  if (document.getElementById('gmb-runtime-css')) return;
  const style = document.createElement('style');
  style.id = 'gmb-runtime-css';
  style.textContent = `
    /* prevent UI from hiding behind bottom nav; give binder room */
    #view-today { padding-bottom: 120px; }
    #view-binder, .binder { padding-bottom: 120px; }
    .binder .spread { overflow: visible; } /* keep page-flip arrows visible */
    body { overflow-x: hidden; }
  `;
  document.head.appendChild(style);
})();
// === Dev Time card: create if missing, move into Settings, wire buttons, sync UI
function ensureDevTimeUI(){
  const settings = document.getElementById('view-settings');
  if (!settings) return;

  // 1) Create the card if it doesn't exist (or reuse the one in HTML)
  let card = document.getElementById('devtime-card');
  if (!card) {
    card = document.createElement('div');
    card.className = 'card';
    card.id = 'devtime-card';
    card.innerHTML = `
      <h2>开发时间 / Dev Time</h2>
      <div class="row">
        <input id="dev-dt" type="datetime-local" title="模拟现在 / Fake now">
        <button id="dev-set" class="secondary">设置 Set</button>
      </div>
      <div class="row" style="margin-top:8px;">
        <button id="dev-clear" class="danger">清除模拟时间 / Use Real Time</button>
        <p id="dev-now-state" class="muted small" style="margin:8px 0 0 8px;"></p>
      </div>
    `;
  }

  // 2) Ensure it lives inside Settings and is visible
  if (card.parentElement !== settings) settings.appendChild(card);
  card.style.display = '';

  // 3) Wire buttons once
  wireDevTimeButtons();

  // 4) Sync labels/inputs with current override
  refreshDevStateLabels();
}

function wireDevTimeButtons(){
  const card = document.getElementById('devtime-card');
  if (!card || card.dataset.bound === '1') return;
  card.dataset.bound = '1';

  document.getElementById('dev-set')?.addEventListener('click', (e) => {
    e.preventDefault?.();
    const input = /** @type {HTMLInputElement|null} */(document.getElementById('dev-dt'));
    const str = input && input.value
      ? input.value.replace('T',' ').slice(0,16)
      : (()=>{ const d=new Date(); const pad=(n)=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; })();
    window.__setDevNow(str);
    refreshDevStateLabels();
    ensureDayIsCurrent();
    renderToday(); renderEndButton();
    toast('已设置模拟时间：' + str);
  });

  document.getElementById('dev-clear')?.addEventListener('click', (e) => {
    e.preventDefault?.();
    window.__clearDevNow();
    refreshDevStateLabels();
    ensureDayIsCurrent();
    renderToday(); renderEndButton();
    toast('已恢复为系统时间');
  });
}

/* =========================
   Drop-in safety wrapper (no deletions needed)
   Paste this AFTER your existing showRevealAsync/showReveal
   ========================= */

// 0) Fallback confetti so missing function never crashes
window.burstConfetti = window.burstConfetti || function(){ /* no-op */ };

// 1) Ensure #reveal dialog exists (or build a minimal one)
function ensureRevealDialog(){
  let dlg = document.getElementById('reveal');
  if (dlg && dlg.nodeName.toLowerCase() === 'dialog') return dlg;

  if (dlg) dlg.remove();
  dlg = document.createElement('dialog');
  dlg.id = 'reveal';
  dlg.innerHTML = `
    <div class="reveal-card">
      <header style="display:flex;justify-content:space-between;align-items:center;">
        <h3 id="reveal-title" style="margin:0;">获得新藏品！</h3>
        <button id="reveal-close" class="secondary">关闭</button>
      </header>
      <div id="reveal-art" style="width:100%;height:220px;display:flex;align-items:center;justify-content:center;margin:12px 0;"></div>
      <div class="row" style="gap:8px;margin:8px 0;">
        <span id="reveal-rarity" class="tag">COMMON</span>
        <span id="reveal-type" class="tag">PLUSH</span>
      </div>
      <div id="reveal-name" style="font-weight:700;margin:6px 0 12px;"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;">
        <button id="reveal-share" class="secondary">分享</button>
        <button id="reveal-ok" class="primary">OK</button>
      </div>
    </div>
  `;
  document.body.appendChild(dlg);

  dlg.querySelector('#reveal-close')?.addEventListener('click', () => dlg.close());
  dlg.querySelector('#reveal-ok')?.addEventListener('click', () => dlg.close());

  return dlg;
}

// 2) Safe renderer used as fallback
async function __safeShowRevealAsync(item){
  const dlg = ensureRevealDialog();

  // Populate
  const artHost = document.getElementById('reveal-art');
  const titleEl = document.getElementById('reveal-title');
  const rarEl   = document.getElementById('reveal-rarity');
  const typeEl  = document.getElementById('reveal-type');
  const nameEl  = document.getElementById('reveal-name');

  if (titleEl) titleEl.textContent = '获得新藏品！';

  if (artHost) {
    if (item && item.art) {
      artHost.innerHTML = `<img src="${item.art}" alt="${item.name||''}" style="width:100%;height:100%;object-fit:contain;">`;
    } else {
      // Use your existing emoji fallback for type
      const emoji = (typeof emojiFor === 'function') ? emojiFor(item?.type || 'plush') : '🎁';
      artHost.textContent = emoji;
    }
  }

  if (rarEl) {
    const lab = (typeof rarityLabel === 'function') ? rarityLabel(item?.rarity) : (item?.rarity || 'COMMON').toUpperCase();
    rarEl.textContent = lab;
    rarEl.className = 'tag ' + (typeof rarityClass === 'function' ? rarityClass(item?.rarity) : '');
  }
  if (typeEl) typeEl.textContent = (item?.type || '').toUpperCase();
  if (nameEl) nameEl.textContent = item?.name || '';

  const card = dlg.querySelector('.reveal-card');
  if (typeof window.burstConfetti === 'function' && card) {
    try { window.burstConfetti(card); } catch(e){ console.warn('confetti failed', e); }
  }

  // Open dialog with fallback
  const openDialog = () => {
    try {
      lockPageScroll?.(true);
      if (typeof dlg.showModal === 'function') dlg.showModal();
      else dlg.setAttribute('open','');
    } catch (e) {
      console.warn('showModal failed; fallback to attribute', e);
      dlg.setAttribute('open','');
    }
  };

  return new Promise((resolve) => {
    const onClose = () => {
      dlg.removeEventListener('close', onClose);
      dlg.removeEventListener('cancel', onClose);
      lockPageScroll?.(false);
      document.activeElement?.blur?.();
      resolve();
    };
    dlg.addEventListener('close', onClose, { once:true });
    dlg.addEventListener('cancel', onClose, { once:true });

    const shareBtn = document.getElementById('reveal-share');
    if (shareBtn) {
      shareBtn.onclick = async () => {
        const text = `我在「工位萌伴园」开到：${(item?.rarity||'').toUpperCase()} ${(item?.type||'').toUpperCase()} — ${item?.name||''} 🎁`;
        if (navigator.share) { try { await navigator.share({ title:'工位萌伴园', text, url: location.href }); } catch(_){} }
        else { try { await navigator.clipboard.writeText(text + ' ' + location.href); alert('已复制分享文案到剪贴板'); } catch(_){} }
      };
    }
requestAnimationFrame(() => {
  openDialog();                 // puts <dialog> into the top layer
  requestAnimationFrame(() => { // next frame = now truly in top layer
    try { window.burstConfetti(dlg); } catch(_) {}
  });
});

  });
}

// 3) Monkey-patch: preserve originals, fall back to safe when they throw
(function(){
  const origAsync = window.showRevealAsync;
  const origSync  = window.showReveal;

  window.showRevealAsync = async function(item){
    try {
      // Ensure dialog exists before calling original (many originals assume it)
      ensureRevealDialog();
      if (typeof origAsync === 'function') {
        return await origAsync(item);
      }
    } catch (e) {
      console.warn('original showRevealAsync failed, using safe fallback:', e);
    }
    return __safeShowRevealAsync(item);
  };

  // Keep API parity: showReveal → delegate to async
  window.showReveal = function(item){
    try {
      if (typeof origSync === 'function') {
        // Wrap original in try so a throw still falls through
        return origSync(item);
      }
    } catch (e) {
      console.warn('original showReveal failed, using safe fallback:', e);
    }
    // Fallback to async version (fire-and-forget)
    (async ()=>{ await __safeShowRevealAsync(item); })();
  };
})();
// ----- Full-screen, top-layer confetti (works with <dialog>) -----
// CSS once
// ================== Top-most Confetti via Overlay Dialog ==================
// CSS (once)
(function injectConfettiCSS(){
  const id = 'gmb-confetti-css';
  if (document.getElementById(id)) return;
  const css = document.createElement('style');
  css.id = id;
  css.textContent = `
    @keyframes gmb-confetti-fall {
      0%   { transform: translate3d(var(--x,0), -8%, 0) rotate(var(--r,0deg)); opacity: 0; }
      10%  { opacity: 1; }
      100% { transform: translate3d(var(--x,0), 108%, 0) rotate(calc(var(--r,0deg) + 540deg)); opacity: 0; }
    }
    #gmb-confetti-dialog {
      padding: 0; border: 0; background: transparent;
      width: 100vw; height: 100vh;
      pointer-events: none; /* never block clicks */
    }
    #gmb-confetti-layer {
      position: fixed; inset: 0; overflow: hidden;
      pointer-events: none;
      z-index: 2147483647; /* top inside this dialog */
    }
    .gmb-confetti-piece {
      position: absolute; width: 8px; height: 14px; border-radius: 2px;
      will-change: transform, opacity;
      animation: gmb-confetti-fall var(--dur,1200ms) ease-out forwards;
    }
    @media (prefers-reduced-motion: reduce) {
      .gmb-confetti-piece { animation: none !important; display: none !important; }
    }
  `;
  document.head.appendChild(css);
})();

// Create (or reuse) the overlay dialog that always sits above your reveal
function ensureConfettiDialog(){
  let dlg = document.getElementById('gmb-confetti-dialog');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'gmb-confetti-dialog';
    dlg.setAttribute('aria-hidden','true');
    dlg.innerHTML = `<div id="gmb-confetti-layer"></div>`;
    document.body.appendChild(dlg);
  }
  return dlg;
}

// Open the overlay on TOP of the current reveal dialog and paint confetti
function openConfettiOverlay(opts = {}){
  const dlg = ensureConfettiDialog();
  const layer = dlg.querySelector('#gmb-confetti-layer');

  // Make sure it’s empty & visible
  layer.textContent = '';

  // Open AFTER your reveal dialog so it stacks above it in the top layer
  try { if (!dlg.open && typeof dlg.showModal === 'function') dlg.showModal(); }
  catch (e) { dlg.setAttribute('open',''); } // very old browsers fallback

  // Next frame = dialog is in top layer; now paint confetti across viewport
  requestAnimationFrame(() => {
    const W = layer.clientWidth  || window.innerWidth;
    const count = Math.max(16, Math.min(260, opts.count ?? 160));
    const colors = opts.colors || ['#ff5858','#ffd266','#82e0aa','#74b9ff','#a29bfe','#ff9ff3'];
    const durationMin = opts.durationMin ?? 900;
    const durationMax = opts.durationMax ?? 1600;

    let done = 0;
    const total = count;

    const makePiece = () => {
      const d = document.createElement('i');
      d.className = 'gmb-confetti-piece';
      d.style.left = `${Math.random() * W}px`;
      d.style.top  = `-12px`;
      d.style.background = colors[(Math.random() * colors.length) | 0];
      d.style.setProperty('--x', `${(Math.random() * 2 - 1) * 140}px`);
      d.style.setProperty('--r', `${(Math.random() * 360) | 0}deg`);
      d.style.setProperty('--dur', `${(Math.random() * (durationMax - durationMin) + durationMin) | 0}ms`);
      if (Math.random() < 0.3) { d.style.width = '6px';  d.style.height = '10px'; }
      if (Math.random() < 0.2) { d.style.width = '10px'; d.style.height = '16px'; }
      d.addEventListener('animationend', () => { d.remove(); if (++done >= total) closeConfettiOverlay(); }, { once:true });
      layer.appendChild(d);
    };

    for (let i = 0; i < count; i++) setTimeout(makePiece, i * 4);
  });
}

function closeConfettiOverlay(){
  const dlg = document.getElementById('gmb-confetti-dialog');
  if (dlg && dlg.open) { try { dlg.close(); } catch(_) { dlg.removeAttribute('open'); } }
}

// Public API your code already calls
window.burstConfetti = function(_el, opts){
  // Respect reduced motion
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  openConfettiOverlay(opts);
};


// mount inside the top-most open dialog if present (top layer), else body
function getTopLayerHost(){
  // Prefer the last-opened modal dialog
  const openDialogs = Array.from(document.querySelectorAll('dialog[open]'));
  return openDialogs.length ? openDialogs[openDialogs.length - 1] : document.body;
}

function ensureConfettiLayer(){
  const host = getTopLayerHost();
  // ensure dialog doesn't clip
  if (host.nodeName.toLowerCase() === 'dialog') {
    host.style.overflow = 'visible';
  }

  // scope layer to the host so it shares the dialog's top layer
  let layer = host.querySelector(':scope > .gmb-confetti-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'gmb-confetti-layer';
    host.appendChild(layer); // append last to be on top within the dialog
  }
  return layer;
}

function createConfetti(_ignored, opts = {}){
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const layer = ensureConfettiLayer();
    const W = layer.clientWidth  || window.innerWidth;
    const count = Math.max(16, Math.min(240, opts.count ?? 140));
    const colors = opts.colors || ['#ff5858','#ffd266','#82e0aa','#74b9ff','#a29bfe','#ff9ff3'];
    const durationMin = opts.durationMin ?? 900;
    const durationMax = opts.durationMax ?? 1600;

    const makePiece = () => {
      const d = document.createElement('i');
      d.className = 'gmb-confetti-piece';
      d.style.left = `${Math.random() * W}px`;
      d.style.top  = `-12px`;
      d.style.background = colors[(Math.random() * colors.length) | 0];
      d.style.setProperty('--x', `${(Math.random() * 2 - 1) * 120}px`);
      d.style.setProperty('--r', `${(Math.random() * 360) | 0}deg`);
      d.style.setProperty('--dur', `${(Math.random() * (durationMax - durationMin) + durationMin) | 0}ms`);
      // size variance
      if (Math.random() < 0.3) { d.style.width = '6px'; d.style.height = '10px'; }
      if (Math.random() < 0.2) { d.style.width = '10px'; d.style.height = '16px'; }
      layer.appendChild(d);
      d.addEventListener('animationend', () => d.remove(), { once: true });
    };

    for (let i = 0; i < count; i++) setTimeout(makePiece, i * 4);
  } catch (e) {
    console.warn('confetti error:', e);
  }
}

// replace burstConfetti to use the top-layer version
window.burstConfetti = (/* host ignored */ _, opts) => createConfetti(null, opts);

/* ===== Boot ===== */
(async function boot(){
  load();
  migrateCollectionToCatalog();
  normalizeMakeups();
  ensureDayIsCurrent();
  renderTabs();
  bindGlobalDelegation();

  // Load the external catalog first
  await autoLoadCollectibles();
  // 🔒 Never allow no-art entries in state or catalog
  enforceArtOnly();
  // Now render UI that can grant items
  renderToday();
  renderBinder();
  renderDesk();

  initSlotSelectors?.();
  show('desk');
  attachSettings();
  ensureDevTimeUI();
  refreshDevStateLabels();
  showDevChip();
  moveDevCardHome();
  toggleDevCardVisibility('desk');
  hydrateI18n();
})();
