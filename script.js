// ===== 設定 =====
var BUCKET   = 'camp-photos';
var BIRTHDAY = new Date('2024-02-19T00:00:00'); // ことね誕生日

// ===== 状態 =====
var db = null;
var currentCampId      = null;
var editingCampId      = null;
var currentCampMembers = [];
var formMembers  = [];
var formTodos    = [];
var formShopping = [];
var favoriteGroups    = [];
var selectedRating    = 0;
var pendingCompleteId = null;
var pendingPhotoType  = null;
var pendingPhotoSlot  = null;
var pendingPhotoId    = null;
var pendingPhotoFile  = null;
var gearItems = [];
var wishlistItems = [];
var allBadges = [];
var badgeTargetCampId = null;
var pendingDetailRatings = {};

// ===== 評価カテゴリ =====
var RATING_CATS = [
  { key: 'rating_location', icon: '📍', label: '立地' },
  { key: 'rating_cost',     icon: '💰', label: '費用' },
  { key: 'rating_facility', icon: '🚿', label: '設備' },
  { key: 'rating_kids',     icon: '👶', label: '子供向け' },
  { key: 'rating_nature',   icon: '🌿', label: '自然度' }
];

// ===== マイルストーンバッジ =====
var MILESTONE_BADGES = [
  { icon: '🎉', name: '初キャンプ！',   desc: '記念すべき最初のキャンプ' },
  { icon: '🔥', name: '焚き火マスター', desc: '焚き火を楽しんだ' },
  { icon: '⭐', name: '5回達成！',      desc: 'キャンプ5回の節目' },
  { icon: '🌧️', name: '雨キャン',      desc: '雨の中でもキャンプを楽しんだ' },
  { icon: '❄️', name: '冬キャン',      desc: '冬のキャンプを制覇' },
  { icon: '🌊', name: '海キャン',      desc: '海辺でキャンプ' },
  { icon: '🏔️', name: '山キャン',      desc: '山でキャンプ' },
  { icon: '🌙', name: '夜空が最高',    desc: '満天の星空の夜' }
];

// ===== 器具カテゴリ =====
var GEAR_CATS = [
  { key: 'tent',      icon: '⛺', label: 'テント・タープ' },
  { key: 'cooking',   icon: '🍳', label: '調理器具' },
  { key: 'sleeping',  icon: '😴', label: '寝具' },
  { key: 'lighting',  icon: '🔦', label: 'ランタン・照明' },
  { key: 'furniture', icon: '🪑', label: 'テーブル・チェア' },
  { key: 'outdoor',   icon: '🌲', label: 'アウトドア用品' },
  { key: 'other',     icon: '📦', label: 'その他' }
];

// ===== 天気コード =====
var WX = {
  0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',
  51:'🌦️',53:'🌦️',55:'🌧️',61:'🌧️',63:'🌧️',65:'🌧️',
  71:'❄️',73:'❄️',75:'❄️',77:'🌨️',
  80:'🌦️',81:'🌧️',82:'⛈️',85:'🌨️',86:'🌨️',
  95:'⛈️',96:'⛈️',99:'⛈️'
};

// ===== 初期化 =====
async function init() {
  try {
    var res = await fetch('config.json');
    var cfg = await res.json();
    db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
    await Promise.all([loadCamps(), loadFavoriteGroups(), loadGearItems(), loadWishlistItems(), loadBadges()]);
    renderBadgeStrip();
    var campParam = new URLSearchParams(location.search).get('camp');
    if (campParam) await showCampDetail(campParam);
  } catch (e) {
    console.error('init error', e);
    document.getElementById('plannedList').innerHTML   = '<p class="empty-msg">接続エラー</p>';
    document.getElementById('completedList').innerHTML = '<p class="empty-msg">接続エラー</p>';
  }
}

// ===== ビュー切替 =====
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view' + name[0].toUpperCase() + name.slice(1)).classList.add('active');
  window.scrollTo(0, 0);
}
function showListView() { currentCampId = null; showView('list'); }

// ===== キャンプ一覧 =====
async function loadCamps() {
  var { data, error } = await db
    .from('camps')
    .select('*, camp_members(name, headcount), camp_photos(image_url, photo_type, sort_order)')
    .order('start_date', { ascending: true, nullsFirst: false });
  if (error) { console.error(error); return; }

  var planned   = (data || []).filter(c => c.status === 'planned' || c.status === 'camping');
  var completed = (data || []).filter(c => c.status === 'completed').reverse();
  renderList('plannedList',   planned);
  renderList('completedList', completed);
}

function renderList(id, camps) {
  var el = document.getElementById(id);
  if (!camps.length) { el.innerHTML = '<p class="empty-msg">まだありません</p>'; return; }
  el.innerHTML = camps.map(c => {
    var members = (c.camp_members || []).map(m => m.headcount > 1 ? `${m.name}(${m.headcount}人)` : m.name).join('・');
    var dateStr = fmtRange(c.start_date, c.end_date);
    var stars   = c.rating ? '★'.repeat(c.rating) : '';
    var photos  = c.camp_photos || [];
    var thumb   = photos.find(p => p.photo_type === 'group') || photos[0];
    var thumbHtml = thumb
      ? `<div class="camp-card-thumb"><img src="${thumb.image_url}" alt=""></div>`
      : `<div class="camp-card-thumb"><span class="camp-card-thumb-empty">⛺</span></div>`;
    return `<div class="camp-card" onclick="showCampDetail('${c.id}')">
      ${thumbHtml}
      <div class="camp-card-inner">
        <div class="camp-card-main">
          <div class="camp-card-title">${esc(c.title)}</div>
          ${c.campsite_name ? `<div class="camp-card-site">📍 ${esc(c.campsite_name)}</div>` : ''}
          ${dateStr         ? `<div class="camp-card-date">📅 ${dateStr}</div>` : ''}
          ${members         ? `<div class="camp-card-members">👥 ${esc(members)}</div>` : ''}
        </div>
        <div class="camp-card-right">
          <span class="badge ${c.status}">${statusLabel(c.status)}</span>
          ${c.want_to_revisit ? '<span class="badge revisit">⭐ また行く</span>' : ''}
          ${stars ? `<div class="camp-stars">${stars}</div>` : ''}
          <span class="camp-arrow">›</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function statusLabel(s) {
  return s === 'planned' ? '予定' : s === 'camping' ? '🏕️ キャンプ中' : '記録';
}

// ===== キャンプ詳細 =====
async function showCampDetail(campId) {
  currentCampId = campId;
  showView('detail');
  document.getElementById('detailContent').innerHTML = '<div style="padding:24px;color:#78716C">読み込み中…</div>';

  var [cr, mr, tr, sr, pr, er, gr] = await Promise.all([
    db.from('camps').select('*').eq('id', campId).single(),
    db.from('camp_members').select('*').eq('camp_id', campId),
    db.from('camp_todos').select('*').eq('camp_id', campId).order('created_at'),
    db.from('camp_shopping').select('*').eq('camp_id', campId).order('created_at'),
    db.from('camp_photos').select('*').eq('camp_id', campId).order('sort_order'),
    db.from('camp_expenses').select('*').eq('camp_id', campId).order('created_at'),
    db.from('camp_gear').select('gear_item_id').eq('camp_id', campId)
  ]);

  if (cr.error) { document.getElementById('detailContent').innerHTML = '<p style="padding:24px">読み込みエラー</p>'; return; }

  currentCampMembers = mr.data || [];
  renderDetail(cr.data, mr.data || [], tr.data || [], sr.data || [], pr.data || [], er.data || [], (gr.data || []).map(g => g.gear_item_id));

  document.getElementById('btnEdit').onclick   = () => showEditCampForm(campId);
  document.getElementById('btnDelete').onclick = () => deleteCamp(campId);
}

function renderDetail(camp, members, todos, shopping, photos, expenses, selectedGearIds) {
  var el = document.getElementById('detailContent');

  // ステップバー
  var steps = [
    { key: 'planned',   label: '計画中',    icon: '1' },
    { key: 'camping',   label: 'キャンプ中', icon: '2' },
    { key: 'completed', label: '記録完了',   icon: '3' }
  ];
  var si = steps.findIndex(s => s.key === camp.status);
  var stepBarHtml = '<div class="step-bar">';
  steps.forEach((s, i) => {
    var dotCls = i < si ? 'done' : i === si ? 'active' : '';
    stepBarHtml += `<div class="step-item">
      <div class="step-dot ${dotCls}">${i < si ? '✓' : s.icon}</div>
      <div class="step-label ${dotCls}">${s.label}</div>
    </div>`;
    if (i < steps.length - 1) {
      stepBarHtml += `<div class="step-line ${i < si ? 'done' : ''}"></div>`;
    }
  });
  stepBarHtml += '</div>';

  // メンバー
  var membersHtml = members.length
    ? members.map(m => `<span class="member-chip">${esc(m.name)}${m.headcount > 1 ? `<span style="font-size:11px;color:#52B788;margin-left:2px">(${m.headcount}人)</span>` : ''}</span>`).join('')
    : '<span style="color:#78716C;font-size:14px">なし</span>';

  // ことね年齢バッジ
  var kotoneHtml = '';
  if (camp.start_date) {
    var ka = calcKotoneAge(camp.start_date);
    if (ka.years >= 0 && ka.months >= 0) {
      kotoneHtml = `<div class="kotone-badge">🍀 ことね ${ka.years}歳${ka.months}ヶ月のキャンプ</div>`;
    }
  }

  // Todo by category
  var byCat = { food: [], activity: [], other: [] };
  todos.forEach(t => { (byCat[t.category] || byCat.other).push(t); });
  var todoHtml = '';
  if (byCat.food.length)     todoHtml += `<div class="todo-category-label">🍳 料理</div>` + byCat.food.map(todoRow).join('');
  if (byCat.activity.length) todoHtml += `<div class="todo-category-label">🎯 遊び</div>` + byCat.activity.map(todoRow).join('');
  if (byCat.other.length)    todoHtml += `<div class="todo-category-label">✨ その他</div>` + byCat.other.map(todoRow).join('');
  if (!todos.length) todoHtml = '<p class="empty-msg">なし</p>';

  var shopHtml = shopping.length ? shopping.map(shopRow).join('') : '<p class="empty-msg">なし</p>';

  // Photos
  var gPhotos = photos.filter(p => p.photo_type === 'group');
  var cPhotos = photos.filter(p => p.photo_type === 'campsite');
  var hPhotos = photos.filter(p => p.photo_type === 'happy');

  // 評価
  var ratingHtml = (camp.status === 'completed' && camp.rating)
    ? `<div class="detail-rating">${'★'.repeat(camp.rating)}</div>` : '';

  // 詳細評価セクション（完了キャンプのみ）
  var catRatingSection = '';
  if (camp.status === 'completed') {
    catRatingSection = `<div class="detail-section">
      <div class="detail-section-title">⭐ 詳細評価</div>
      <div class="detail-cat-ratings">
        ${RATING_CATS.map(r => {
          var v = camp[r.key] || 0;
          return `<div class="detail-cat-row">
            <span class="detail-cat-label">${r.icon} ${r.label}</span>
            <div class="detail-cat-stars">
              ${[1,2,3,4,5].map(sv => `<span class="detail-cat-star${sv <= v ? ' active' : ''}" data-field="${r.key}" data-val="${sv}" onclick="setCampDetailRating('${camp.id}','${r.key}',${sv})">${sv <= v ? '★' : '☆'}</span>`).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  // このキャンプのバッジ
  var campBadges = allBadges.filter(b => b.camp_id === camp.id);
  var campBadgeSection = campBadges.length ? `<div class="detail-section">
    <div class="detail-section-title">🏅 バッジ</div>
    <div class="camp-badge-list">
      ${campBadges.map(b => `<div class="camp-badge-item">
        <span class="camp-badge-icon">${b.emoji || '🏅'}</span>
        <div class="camp-badge-info">
          <div class="camp-badge-name">${esc(b.title)}</div>
          ${b.description ? `<div class="camp-badge-desc">${esc(b.description)}</div>` : ''}
        </div>
      </div>`).join('')}
    </div>
  </div>` : '';

  // アクションボタン
  var actionHtml = '';
  if (camp.status === 'planned') {
    actionHtml += `<button class="btn-start" onclick="startCamping('${camp.id}')">🏕️ キャンプ開始！</button>`;
  } else if (camp.status === 'camping') {
    actionHtml += `<button class="btn-complete" onclick="showCompleteModal('${camp.id}','${esc(camp.title)}')">✅ キャンプ完了！記録にする</button>`;
  } else if (camp.status === 'completed') {
    actionHtml += `<button class="btn-add-badge" onclick="showAddBadgeModal('${camp.id}')">🏅 バッジを追加</button>`;
  }
  actionHtml += `<button class="btn-line" onclick="shareToLine('${camp.id}')">📤 LINEでシェア</button>`;

  // 天気セクション（計画中・キャンプ中のみ）
  var weatherSection = '';
  if (camp.status !== 'completed' && camp.start_date && (camp.campsite_address || camp.campsite_name)) {
    weatherSection = `<div class="detail-section" id="weatherSection">
      <div class="detail-section-title">🌤️ 天気予報</div>
      <div id="weatherContent"><p class="weather-error">取得中…</p></div>
    </div>`;
  }

  el.innerHTML = `
    ${stepBarHtml}
    <div class="detail-hero">
      <div class="detail-status-row">
        <span class="badge ${camp.status}">${statusLabel(camp.status)}</span>
        ${ratingHtml}
        ${camp.want_to_revisit ? '<span class="badge revisit">⭐ また行きたい</span>' : ''}
      </div>
      <h2 class="detail-title">${esc(camp.title)}</h2>
      ${kotoneHtml}
    </div>
    <div class="detail-body">
      ${camp.campsite_name ? `
      <div class="detail-section">
        <div class="detail-section-title">⛺ キャンプ場</div>
        <a class="map-link" href="https://maps.google.com/maps?q=${encodeURIComponent(camp.campsite_address || camp.campsite_name)}" target="_blank" rel="noopener">${esc(camp.campsite_name)} <span class="map-link-icon">📍</span></a>
        ${camp.campsite_address ? `<p class="muted map-address">${esc(camp.campsite_address)}</p>` : ''}
      </div>` : ''}

      ${(camp.start_date || camp.end_date) ? `
      <div class="detail-section">
        <div class="detail-section-title">📅 日程</div>
        <p>${fmtRange(camp.start_date, camp.end_date)}</p>
      </div>` : ''}

      ${(camp.meeting_place || camp.meeting_time) ? `
      <div class="detail-section">
        <div class="detail-section-title">📍 集合</div>
        ${camp.meeting_place ? `<p>${esc(camp.meeting_place)}</p>` : ''}
        ${camp.meeting_time  ? `<p class="muted">⏰ ${camp.meeting_time.slice(0,5)}</p>` : ''}
      </div>` : ''}

      ${weatherSection}

      <div class="detail-section">
        <div class="detail-section-title">👥 メンバー</div>
        <div class="chips-wrap">${membersHtml}</div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">📝 やりたいこと</div>
        <div id="detailTodos">${todoHtml}</div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">🛒 買い出しリスト</div>
        <div id="detailShopping">${shopHtml}</div>
      </div>

      <div class="detail-section" id="expenseSection">
        <div class="detail-section-title">💰 費用・精算</div>
        <div id="expenseList">${buildExpenseHtml(expenses)}</div>
        <div class="expense-add-row">
          <input type="text"   id="expDescInput"   class="expense-desc-input"   placeholder="例：イオン 食材">
          <input type="number" id="expAmountInput" class="expense-amount-input" placeholder="金額">
          <select id="expPaidByInput" class="expense-paidby-select">${buildMemberOptions(members)}</select>
          <button class="btn-add-inline" onclick="addExpense()">追加</button>
        </div>
        <div id="settlementContent">${buildSettlementHtml(expenses, members)}</div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">📸 写真</div>
        <div class="photo-type-label">集合写真</div>
        <div class="photo-slots">${photoSlots('group', gPhotos, 1)}</div>
        <div class="photo-type-label">キャンプ場の写真</div>
        <div class="photo-slots">${photoSlots('campsite', cPhotos, 3)}</div>
        <div class="photo-type-label">幸せの記録</div>
        <div class="photo-slots">${photoSlots('happy', hPhotos, 3)}</div>
      </div>

      <div class="detail-section">
        <div class="detail-section-title">🎒 持ち物リスト</div>
        <div id="campGearList">${buildGearSectionHtml(selectedGearIds || [])}</div>
      </div>

      ${(camp.notes || camp.want_to_revisit) ? `
      <div class="detail-section">
        <div class="detail-section-title">🗒️ メモ</div>
        ${camp.notes ? `<p class="notes-text">${esc(camp.notes)}</p>` : ''}
        ${camp.want_to_revisit ? '<div class="revisit-flag">⭐ またここに行きたい！</div>' : ''}
      </div>` : ''}

      ${catRatingSection}
      ${campBadgeSection}

      <div class="detail-actions">${actionHtml}</div>
    </div>`;

  // 天気を非同期取得
  if (camp.status !== 'completed' && camp.start_date) {
    var query = camp.campsite_address || camp.campsite_name;
    if (query) loadWeather(query, camp.start_date, camp.end_date || camp.start_date);
  }
}

// ===== ことね年齢 =====
function calcKotoneAge(dateStr) {
  var d = new Date(dateStr + 'T00:00:00');
  var y = d.getFullYear() - BIRTHDAY.getFullYear();
  var m = d.getMonth()    - BIRTHDAY.getMonth();
  if (m < 0) { y--; m += 12; }
  return { years: y, months: m };
}

// ===== ステップ =====
async function startCamping(campId) {
  if (!confirm('キャンプを開始しますか？\nステータスを「キャンプ中」にします。')) return;
  var { error } = await db.from('camps').update({ status: 'camping' }).eq('id', campId);
  if (error) { alert('更新に失敗しました'); return; }
  await loadCamps();
  await showCampDetail(campId);
}

// ===== 天気 =====
function extractGeoQuery(raw) {
  // 郵便番号を除去（〒XXX-XXXX または XXX-XXXX）
  var q = raw.replace(/〒?\d{3}-\d{4}\s*/g, '').trim();
  // 都道府県 + 市区町村レベルまで切り出す（例：愛知県設楽町）
  var m = q.match(/^(.+?[市区町村])/);
  if (m) return m[1];
  // 郵便番号だけ除去した形で返す
  return q;
}

async function loadWeather(query, startDate, endDate) {
  var el = document.getElementById('weatherContent');
  if (!el) return;
  try {
    var geoQuery = extractGeoQuery(query);
    var geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(geoQuery)}&count=1&language=ja&format=json`);
    var geo    = await geoRes.json();
    if (!geo.results || !geo.results.length) {
      // 郡を除いた形で再試行（例：北設楽郡設楽町 → 設楽町）
      var retry = geoQuery.replace(/.+郡/, '');
      if (retry !== geoQuery) {
        var geoRes2 = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(retry)}&count=1&language=ja&format=json`);
        var geo2 = await geoRes2.json();
        if (geo2.results && geo2.results.length) { geo = geo2; }
      }
    }
    if (!geo.results || !geo.results.length) {
      // 都道府県を除いた市区町村名で再試行（例：三重県伊賀市 → 伊賀市）
      var cityOnly = geoQuery.replace(/^.+?[都道府県]/, '');
      if (cityOnly !== geoQuery) {
        var geoRes3 = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityOnly)}&count=1&language=ja&format=json`);
        var geo3 = await geoRes3.json();
        if (geo3.results && geo3.results.length) { geo = geo3; }
      }
    }
    if (!geo.results || !geo.results.length) {
      // 市区町村の語尾を除いた名前で再試行（例：伊賀市 → 伊賀）
      var cityBase = geoQuery.replace(/^.+?[都道府県]/, '').replace(/[市区町村]$/, '');
      if (cityBase && cityBase !== geoQuery) {
        var geoRes4 = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityBase)}&count=1&language=ja&format=json`);
        var geo4 = await geoRes4.json();
        if (geo4.results && geo4.results.length) { geo = geo4; }
      }
    }
    if (!geo.results || !geo.results.length) {
      el.innerHTML = '<p class="weather-error">場所を特定できませんでした</p>'; return;
    }
    var { latitude: lat, longitude: lon } = geo.results[0];

    var today = new Date(); today.setHours(0,0,0,0);
    var start = new Date(startDate + 'T00:00:00');
    var end   = new Date((endDate || startDate) + 'T00:00:00');
    var from  = start < today ? today : start;
    var to    = new Date(from); to.setDate(from.getDate() + 6);
    if (end < to) to = end;
    if (to < from) { el.innerHTML = '<p class="weather-error">キャンプ期間が過ぎています</p>'; return; }

    var daysUntil = Math.round((from - today) / (1000 * 60 * 60 * 24));
    if (daysUntil > 15) {
      el.innerHTML = `<p class="weather-error">🗓️ キャンプまであと${daysUntil}日。16日前になると予報が表示されます。</p>`;
      return;
    }

    var wxRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max&timezone=Asia%2FTokyo&start_date=${isoDate(from)}&end_date=${isoDate(to)}`);
    var wx    = await wxRes.json();
    if (!wx.daily) { el.innerHTML = '<p class="weather-error">天気データを取得できませんでした</p>'; return; }

    var dayNames = ['日','月','火','水','木','金','土'];
    var html = '<div class="weather-scroll">';
    wx.daily.time.forEach((ds, i) => {
      var d    = new Date(ds + 'T00:00:00');
      var lbl  = d.getTime() === today.getTime() ? '今日' : `${d.getMonth()+1}/${d.getDate()}(${dayNames[d.getDay()]})`;
      var code = wx.daily.weathercode[i];
      var tmax = Math.round(wx.daily.temperature_2m_max[i]);
      var tmin = Math.round(wx.daily.temperature_2m_min[i]);
      var prob = wx.daily.precipitation_probability_max?.[i];
      var probHtml = prob != null ? `<div class="weather-prob">${prob}%</div>` : '';
      html += `<div class="weather-day${d.getTime()===today.getTime()?' today':''}">
        <div class="weather-day-label">${lbl}</div>
        <div class="weather-icon">${WX[code]||'🌡️'}</div>
        <div class="weather-temp">${tmax}°<span>/${tmin}°</span></div>
        ${probHtml}
      </div>`;
    });
    html += '</div>';
    el.innerHTML = html;
  } catch (e) {
    console.error('weather', e);
    if (el) el.innerHTML = '<p class="weather-error">天気の取得に失敗しました</p>';
  }
}

function isoDate(d) {
  return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
}

// ===== 費用・精算 =====
function buildMemberOptions(members) {
  if (!members.length) return '<option value="">先にメンバーを登録</option>';
  return '<option value="">支払い者</option>' + members.map(m => `<option value="${esc(m.name)}">${esc(m.name)}</option>`).join('');
}

function buildExpenseHtml(expenses) {
  if (!expenses.length) return '<p class="empty-msg" id="expEmpty">まだありません</p>';
  return expenses.map(e =>
    `<div class="expense-row" id="exp-${e.id}">
      <span class="expense-desc">${esc(e.description)}</span>
      <span class="expense-payer">${esc(e.paid_by)}</span>
      <span class="expense-amount">¥${Number(e.amount).toLocaleString()}</span>
      <button class="expense-del" onclick="deleteExpense('${e.id}')">×</button>
    </div>`
  ).join('');
}

function buildSettlementHtml(expenses, members) {
  if (!expenses.length || !members.length) return '';
  var result = calcSettlement(expenses, members);
  if (!result) return '';
  var html = `<div class="settlement-box">
    <div class="settlement-title">💸 精算</div>
    <div class="settlement-total">合計 ¥${result.totalAmount.toLocaleString()} ÷ ${result.totalHeadcount}人 = ¥${result.perHead.toLocaleString()}/人</div>`;
  if (!result.txns.length) {
    html += '<div class="settlement-even">✅ 精算なし（ちょうど！）</div>';
  } else {
    result.txns.forEach(t => {
      html += `<div class="settlement-item">
        <span class="settlement-from">${esc(t.from)}</span>
        <span class="settlement-arrow">→</span>
        <span class="settlement-to">${esc(t.to)}</span>
        <span class="settlement-amount">¥${t.amount.toLocaleString()}</span>
      </div>`;
    });
  }
  return html + '</div>';
}

function calcSettlement(expenses, members) {
  var totalHeadcount = members.reduce((s, m) => s + (m.headcount || 1), 0);
  var totalAmount    = expenses.reduce((s, e) => s + Number(e.amount), 0);
  if (!totalAmount || !totalHeadcount) return null;
  var perHead = totalAmount / totalHeadcount;

  var balance = {};
  members.forEach(m => { balance[m.name] = -(perHead * (m.headcount || 1)); });
  expenses.forEach(e => { balance[e.paid_by] = (balance[e.paid_by] || 0) + Number(e.amount); });

  var pos = Object.entries(balance).filter(([,v]) => v >  1).map(([n,v]) => ({name:n, amount:v})).sort((a,b) => b.amount-a.amount);
  var neg = Object.entries(balance).filter(([,v]) => v < -1).map(([n,v]) => ({name:n, amount:-v})).sort((a,b) => b.amount-a.amount);

  var txns = [], pi = 0, ni = 0;
  while (pi < pos.length && ni < neg.length) {
    var p = pos[pi], n = neg[ni];
    var amt = Math.min(p.amount, n.amount);
    txns.push({ from: n.name, to: p.name, amount: Math.round(amt) });
    p.amount -= amt; n.amount -= amt;
    if (p.amount < 1) pi++;
    if (n.amount < 1) ni++;
  }
  return { totalAmount, totalHeadcount, perHead: Math.round(perHead), txns };
}

async function addExpense() {
  var desc   = document.getElementById('expDescInput').value.trim();
  var amount = parseInt(document.getElementById('expAmountInput').value, 10);
  var paidBy = document.getElementById('expPaidByInput').value;
  if (!desc || !amount || !paidBy) { alert('説明・金額・支払い者を全て入力してください'); return; }

  var { error } = await db.from('camp_expenses').insert({ camp_id: currentCampId, description: desc, amount, paid_by: paidBy });
  if (error) { alert('追加に失敗しました'); return; }

  document.getElementById('expDescInput').value   = '';
  document.getElementById('expAmountInput').value = '';
  await refreshExpenses();
}

async function deleteExpense(id) {
  var { error } = await db.from('camp_expenses').delete().eq('id', id);
  if (error) { alert('削除に失敗しました'); return; }
  await refreshExpenses();
}

async function refreshExpenses() {
  var { data } = await db.from('camp_expenses').select('*').eq('camp_id', currentCampId).order('created_at');
  var expenses = data || [];
  var listEl = document.getElementById('expenseList');
  var settEl = document.getElementById('settlementContent');
  if (listEl) listEl.innerHTML = buildExpenseHtml(expenses);
  if (settEl) settEl.innerHTML = buildSettlementHtml(expenses, currentCampMembers);
}

// ===== チェック切替 =====
async function toggleTodo(id, done) {
  await db.from('camp_todos').update({ is_done: done }).eq('id', id);
  var el = document.getElementById('td-' + id);
  if (el) { el.classList.toggle('done', done); el.querySelector('.todo-check').textContent = done ? '✅' : '⬜'; }
}
async function toggleShop(id, done) {
  await db.from('camp_shopping').update({ is_done: done }).eq('id', id);
  var el = document.getElementById('sh-' + id);
  if (el) { el.classList.toggle('done', done); el.querySelector('.todo-check').textContent = done ? '✅' : '⬜'; }
}

function todoRow(t) {
  return `<div class="todo-item ${t.is_done?'done':''}" id="td-${t.id}">
    <button class="todo-check" onclick="toggleTodo('${t.id}',${!t.is_done})">${t.is_done?'✅':'⬜'}</button>
    <span class="todo-text">${esc(t.text)}</span>
  </div>`;
}
function shopRow(s) {
  return `<div class="shop-item ${s.is_done?'done':''}" id="sh-${s.id}">
    <button class="todo-check" onclick="toggleShop('${s.id}',${!s.is_done})">${s.is_done?'✅':'⬜'}</button>
    <span class="shop-text">${esc(s.item)}</span>
    ${s.assignee ? `<span class="shop-assignee">${esc(s.assignee)}</span>` : ''}
  </div>`;
}
function photoSlots(type, photos, max) {
  var map = {}; photos.forEach(p => { map[p.sort_order] = p; });
  var html = '';
  for (var i = 0; i < max; i++) {
    var p = map[i];
    if (p) {
      html += `<div class="photo-slot filled" onclick="openPhotoUpload('${type}',${i},'${p.id}')">
        <img src="${p.image_url}" class="slot-img" alt="">
        ${p.comment ? `<div class="slot-comment">${esc(p.comment)}</div>` : ''}
      </div>`;
    } else {
      html += `<div class="photo-slot empty" onclick="openPhotoUpload('${type}',${i},null)"><span class="slot-add">＋</span></div>`;
    }
  }
  return html;
}

// ===== フォーム =====
function showNewCampForm() {
  editingCampId = null; formMembers = []; formTodos = []; formShopping = [];
  document.getElementById('formTitle').textContent = '新しいキャンプ';
  clearForm(); renderFavGroupsRow();
  renderFormMembers(); renderFormTodos(); renderFormShopping(); updateAssigneeOptions();
  showView('form');
}

async function showEditCampForm(campId) {
  editingCampId = campId;
  var [cr, mr, tr, sr] = await Promise.all([
    db.from('camps').select('*').eq('id', campId).single(),
    db.from('camp_members').select('*').eq('camp_id', campId),
    db.from('camp_todos').select('*').eq('camp_id', campId).order('created_at'),
    db.from('camp_shopping').select('*').eq('camp_id', campId).order('created_at')
  ]);
  var c = cr.data;
  formMembers  = (mr.data || []).map(m => ({ name: m.name, headcount: m.headcount || 1 }));
  formTodos    = (tr.data || []).map(t => ({ text: t.text, category: t.category, is_done: t.is_done }));
  formShopping = (sr.data || []).map(s => ({ item: s.item, assignee: s.assignee, is_done: s.is_done }));

  document.getElementById('formTitle').textContent      = '編集';
  document.getElementById('fTitle').value               = c.title || '';
  document.getElementById('fCampsiteName').value        = c.campsite_name || '';
  document.getElementById('fCampsiteAddress').value     = c.campsite_address || '';
  document.getElementById('fStartDate').value           = c.start_date || '';
  document.getElementById('fEndDate').value             = c.end_date || '';
  document.getElementById('fMeetingPlace').value        = c.meeting_place || '';
  document.getElementById('fMeetingTime').value         = c.meeting_time ? c.meeting_time.slice(0,5) : '';
  document.getElementById('fNotes').value               = c.notes || '';
  document.getElementById('fRevisit').checked           = c.want_to_revisit || false;

  renderFavGroupsRow(); renderFormMembers(); renderFormTodos(); renderFormShopping(); updateAssigneeOptions();
  showView('form');
}

function clearForm() {
  ['fTitle','fCampsiteName','fCampsiteAddress','fStartDate','fEndDate','fMeetingPlace','fMeetingTime','fNotes']
    .forEach(id => document.getElementById(id).value = '');
  document.getElementById('fRevisit').checked = false;
}

function cancelForm() {
  if (currentCampId) { showCampDetail(currentCampId); } else { showView('list'); }
}

async function saveCamp() {
  var title = document.getElementById('fTitle').value.trim();
  if (!title) { alert('タイトルを入力してください'); return; }

  var btn = document.getElementById('btnSave');
  btn.disabled = true; btn.textContent = '保存中…';

  try {
    var data = {
      title,
      campsite_name:    document.getElementById('fCampsiteName').value.trim()    || null,
      campsite_address: document.getElementById('fCampsiteAddress').value.trim() || null,
      start_date:       document.getElementById('fStartDate').value  || null,
      end_date:         document.getElementById('fEndDate').value    || null,
      meeting_place:    document.getElementById('fMeetingPlace').value.trim()    || null,
      meeting_time:     document.getElementById('fMeetingTime').value || null,
      notes:            document.getElementById('fNotes').value.trim() || null,
      want_to_revisit:  document.getElementById('fRevisit').checked
    };

    var campId;
    if (editingCampId) {
      var { error } = await db.from('camps').update(data).eq('id', editingCampId);
      if (error) throw error;
      campId = editingCampId;
    } else {
      data.status = 'planned';
      var { data: row, error } = await db.from('camps').insert(data).select().single();
      if (error) throw error;
      campId = row.id;
    }

    await db.from('camp_members').delete().eq('camp_id', campId);
    if (formMembers.length)
      await db.from('camp_members').insert(
        formMembers.map(m => ({ camp_id: campId, name: m.name, headcount: m.headcount || 1 }))
      );

    await db.from('camp_todos').delete().eq('camp_id', campId);
    if (formTodos.length)
      await db.from('camp_todos').insert(
        formTodos.map(t => ({ camp_id: campId, text: t.text, category: t.category, is_done: t.is_done }))
      );

    await db.from('camp_shopping').delete().eq('camp_id', campId);
    if (formShopping.length)
      await db.from('camp_shopping').insert(
        formShopping.map(s => ({ camp_id: campId, item: s.item, assignee: s.assignee || null, is_done: s.is_done }))
      );

    currentCampId = campId;
    await loadCamps();
    await showCampDetail(campId);
  } catch (e) {
    console.error(e); alert('保存に失敗しました');
    btn.disabled = false; btn.textContent = '保存';
  }
}

// ===== メンバー =====
function addMemberFromInput() {
  var input   = document.getElementById('memberInput');
  var hcInput = document.getElementById('memberHeadcount');
  var name    = input.value.trim();
  var hc      = parseInt(hcInput.value, 10) || 1;
  if (!name) return;
  formMembers.push({ name, headcount: hc });
  input.value = ''; hcInput.value = '1';
  renderFormMembers(); updateAssigneeOptions();
}
function removeMember(i) { formMembers.splice(i, 1); renderFormMembers(); updateAssigneeOptions(); }
function renderFormMembers() {
  document.getElementById('memberList').innerHTML = formMembers.map((m, i) =>
    `<span class="member-chip">${esc(m.name)}${m.headcount > 1 ? `(${m.headcount}人)` : ''}<button type="button" class="chip-remove" onclick="removeMember(${i})">×</button></span>`
  ).join('');
}
function updateAssigneeOptions() {
  var sel = document.getElementById('shopAssigneeInput');
  var cur = sel.value;
  sel.innerHTML = '<option value="">担当</option>';
  ['うち', 'みんなで', ...formMembers.map(m => m.name)].forEach(n => {
    var o = document.createElement('option');
    o.value = n; o.textContent = n;
    if (n === cur) o.selected = true;
    sel.appendChild(o);
  });
}

// ===== お気に入りグループ =====
async function loadFavoriteGroups() {
  if (!db) return;
  var { data } = await db.from('camp_favorite_groups').select('*').order('created_at', { ascending: false });
  favoriteGroups = data || [];
}
function renderFavGroupsRow() {
  document.getElementById('favGroupsRow').innerHTML = favoriteGroups.map((g, i) =>
    `<button type="button" class="fav-group-chip" onclick="applyFavGroup(${i})">⭐ ${esc(g.name)}</button>`
  ).join('');
}
function applyFavGroup(i) {
  var g = favoriteGroups[i];
  var names = g.members || [];
  var hcs   = g.headcounts || [];
  names.forEach((n, idx) => {
    if (!formMembers.find(m => m.name === n))
      formMembers.push({ name: n, headcount: hcs[idx] || 1 });
  });
  renderFormMembers(); updateAssigneeOptions();
}
function showSaveGroupModal() {
  if (!formMembers.length) { alert('先にメンバーを追加してください'); return; }
  document.getElementById('groupNameInput').value = '';
  document.getElementById('saveGroupModal').classList.add('active');
}
function hideSaveGroupModal() { document.getElementById('saveGroupModal').classList.remove('active'); }
async function saveGroupConfirm() {
  var name = document.getElementById('groupNameInput').value.trim();
  if (!name) { alert('グループ名を入力してください'); return; }
  var { error } = await db.from('camp_favorite_groups').insert({
    name,
    members:    formMembers.map(m => m.name),
    headcounts: formMembers.map(m => m.headcount || 1)
  });
  if (error) { alert('保存に失敗しました'); return; }
  await loadFavoriteGroups(); renderFavGroupsRow(); hideSaveGroupModal();
}

// ===== やりたいこと =====
function addTodoFromInput() {
  var text = document.getElementById('todoInput').value.trim();
  var cat  = document.getElementById('todoCategory').value;
  if (!text) return;
  formTodos.push({ text, category: cat, is_done: false });
  document.getElementById('todoInput').value = '';
  renderFormTodos();
}
function removeTodoItem(i) { formTodos.splice(i, 1); renderFormTodos(); }
function renderFormTodos() {
  var icon = { food:'🍳', activity:'🎯', other:'✨' };
  document.getElementById('todoList').innerHTML = formTodos.length
    ? formTodos.map((t, i) =>
        `<div class="form-item-row"><span class="form-item-cat">${icon[t.category]||'✨'}</span><span class="form-item-text">${esc(t.text)}</span><button type="button" class="chip-remove" onclick="removeTodoItem(${i})">×</button></div>`
      ).join('')
    : '<p class="empty-msg">まだありません</p>';
}

// ===== 買い出し =====
function addShoppingFromInput() {
  var item     = document.getElementById('shopItemInput').value.trim();
  var assignee = document.getElementById('shopAssigneeInput').value;
  if (!item) return;
  formShopping.push({ item, assignee, is_done: false });
  document.getElementById('shopItemInput').value = '';
  renderFormShopping();
}
function removeShopRow(i) { formShopping.splice(i, 1); renderFormShopping(); }
function renderFormShopping() {
  document.getElementById('shoppingList').innerHTML = formShopping.length
    ? formShopping.map((s, i) =>
        `<div class="form-item-row"><span class="form-item-text">🛒 ${esc(s.item)}</span>${s.assignee?`<span class="form-item-badge">${esc(s.assignee)}</span>`:''}<button type="button" class="chip-remove" onclick="removeShopRow(${i})">×</button></div>`
      ).join('')
    : '<p class="empty-msg">まだありません</p>';
}

// ===== 写真 =====
function openPhotoUpload(type, slot, photoId) {
  pendingPhotoType = type; pendingPhotoSlot = slot; pendingPhotoId = photoId; pendingPhotoFile = null;
  var titles = { group:'集合写真', campsite:'キャンプ場の写真', happy:'幸せの記録' };
  document.getElementById('photoModalTitle').textContent    = titles[type] || '写真';
  document.getElementById('photoCommentInput').value        = '';
  document.getElementById('photoFileInput').value           = '';
  document.getElementById('photoUploadArea').style.display  = 'block';
  document.getElementById('photoPreviewWrap').style.display = 'none';
  document.getElementById('photoModal').classList.add('active');
}
function hidePhotoModal() { document.getElementById('photoModal').classList.remove('active'); pendingPhotoFile = null; }
function handlePhotoFile(e) {
  var file = e.target.files[0]; if (!file) return;
  pendingPhotoFile = file;
  var reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('photoPreview').src               = ev.target.result;
    document.getElementById('photoUploadArea').style.display  = 'none';
    document.getElementById('photoPreviewWrap').style.display = 'block';
  };
  reader.readAsDataURL(file);
}
async function submitPhoto() {
  if (!pendingPhotoFile) { alert('写真を選択してください'); return; }
  var btn = document.getElementById('photoSubmitBtn');
  btn.disabled = true; btn.textContent = 'アップロード中…';
  try {
    var ext  = (pendingPhotoFile.name.split('.').pop() || 'jpg').toLowerCase();
    var path = `${currentCampId}/${pendingPhotoType}_${pendingPhotoSlot}_${Date.now()}.${ext}`;
    var { error: upErr } = await db.storage.from(BUCKET).upload(path, pendingPhotoFile, { upsert: true });
    if (upErr) throw upErr;
    var { data: urlData } = db.storage.from(BUCKET).getPublicUrl(path);
    var comment = document.getElementById('photoCommentInput').value.trim() || null;
    if (pendingPhotoId) {
      await db.from('camp_photos').update({ image_url: urlData.publicUrl, comment }).eq('id', pendingPhotoId);
    } else {
      await db.from('camp_photos').insert({ camp_id: currentCampId, photo_type: pendingPhotoType, image_url: urlData.publicUrl, comment, sort_order: pendingPhotoSlot });
    }
    hidePhotoModal();
    await showCampDetail(currentCampId);
  } catch (e) {
    console.error(e); alert('アップロードに失敗しました');
  } finally {
    btn.disabled = false; btn.textContent = '写真を保存';
  }
}

// ===== 完了・評価 =====
function showCompleteModal(campId, title) {
  pendingCompleteId = campId; selectedRating = 0;
  pendingDetailRatings = {};
  document.getElementById('completeCampName').textContent = title;
  document.getElementById('ratingLabel').textContent = 'タップして評価';
  updateStars(0);
  renderDetailRatingCats();
  document.getElementById('completeModal').classList.add('active');
}

function renderDetailRatingCats() {
  var el = document.getElementById('detailRatingCats');
  if (!el) return;
  el.innerHTML = RATING_CATS.map(r => `
    <div class="dr-cat-row">
      <span class="dr-cat-label">${r.icon} ${r.label}</span>
      <div class="dr-stars">
        ${[1,2,3,4,5].map(v => `<span class="dr-star" data-key="${r.key}" data-val="${v}" onclick="setDetailRating('${r.key}',${v})">★</span>`).join('')}
      </div>
    </div>
  `).join('');
}

function setDetailRating(key, val) {
  pendingDetailRatings[key] = val;
  document.querySelectorAll(`.dr-star[data-key="${key}"]`).forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.val) <= val);
  });
}
function hideCompleteModal() { document.getElementById('completeModal').classList.remove('active'); }
function setRating(val) {
  selectedRating = val; updateStars(val);
  var labels = ['','うーん…','まあまあ','よかった！','とても良かった！','最高だった！！'];
  document.getElementById('ratingLabel').textContent = labels[val] || '';
}
function updateStars(val) {
  document.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('active', i < val));
}
async function confirmComplete() {
  if (!selectedRating) { alert('評価を選んでください'); return; }
  var update = { status: 'completed', rating: selectedRating };
  RATING_CATS.forEach(r => { if (pendingDetailRatings[r.key]) update[r.key] = pendingDetailRatings[r.key]; });
  var { error } = await db.from('camps').update(update).eq('id', pendingCompleteId);
  if (error) { alert('更新に失敗しました'); return; }
  hideCompleteModal(); await loadCamps(); await showCampDetail(pendingCompleteId);
}

async function setCampDetailRating(campId, field, val) {
  var update = {}; update[field] = val;
  await db.from('camps').update(update).eq('id', campId);
  document.querySelectorAll(`.detail-cat-star[data-field="${field}"]`).forEach(s => {
    var sv = parseInt(s.dataset.val);
    s.classList.toggle('active', sv <= val);
    s.textContent = sv <= val ? '★' : '☆';
  });
}

// ===== 削除 =====
async function deleteCamp(campId) {
  if (!confirm('このキャンプを削除しますか？')) return;
  var { error } = await db.from('camps').delete().eq('id', campId);
  if (error) { alert('削除に失敗しました'); return; }
  currentCampId = null; await loadCamps(); showView('list');
}

// ===== シェア共通 =====
async function openShare(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return;
    } catch(e) {
      if (e.name === 'AbortError') return; // ユーザーがキャンセル
    }
  }
  window.open('https://line.me/R/msg/text/?' + encodeURIComponent(text), '_blank');
}

// ===== LINEシェア（リッチ版） =====
async function shareToLine(campId) {
  try {
  var [cr, mr, tr, sr, gr, pr, br] = await Promise.all([
    db.from('camps').select('*').eq('id', campId).single(),
    db.from('camp_members').select('*').eq('camp_id', campId),
    db.from('camp_todos').select('*').eq('camp_id', campId),
    db.from('camp_shopping').select('*').eq('camp_id', campId),
    db.from('camp_gear').select('gear_item_id').eq('camp_id', campId),
    db.from('camp_photos').select('*').eq('camp_id', campId).order('sort_order'),
    db.from('badges').select('*').eq('camp_id', campId).order('created_at')
  ]);
  var c        = cr.data;
  var members  = mr.data || [];
  var todos    = tr.data || [];
  var shopping = sr.data || [];
  var photos   = pr.data || [];
  var badges   = br.data || [];

  var L = [];

  if (c.status === 'completed') {
    // ===== 記録シェア =====
    L.push('┄'.repeat(14));
    L.push(`🏕️ ${c.title}`);
    if (c.rating) L.push('★'.repeat(c.rating) + '☆'.repeat(5 - c.rating));
    L.push('┄'.repeat(14));
    L.push('');
    if (c.campsite_name) {
      L.push(`📍 ${c.campsite_name}`);
      if (c.campsite_address) L.push(`   ${c.campsite_address}`);
    }
    var dr = fmtRange(c.start_date, c.end_date);
    if (dr) L.push(`📅 ${dr}`);
    L.push('');
    if (members.length) {
      L.push(`👥 ${members.map(m => m.headcount > 1 ? `${m.name}(${m.headcount}人)` : m.name).join('・')}`);
      L.push('');
    }
    var doneTodos = todos.filter(t => t.is_done);
    if (doneTodos.length) {
      var food = doneTodos.filter(t => t.category === 'food');
      var act  = doneTodos.filter(t => t.category === 'activity');
      var oth  = doneTodos.filter(t => t.category === 'other');
      L.push('📝 やったこと');
      if (food.length) L.push(`   🍳 ${food.map(t => t.text).join('・')}`);
      if (act.length)  L.push(`   🎯 ${act.map(t => t.text).join('・')}`);
      if (oth.length)  L.push(`   ✨ ${oth.map(t => t.text).join('・')}`);
      L.push('');
    }
    var photoComments = photos.filter(p => p.comment);
    if (photoComments.length) {
      L.push('📸 写真メモ');
      photoComments.forEach(p => L.push(`   ・${p.comment}`));
      L.push('');
    }
    if (c.notes) {
      L.push('🗒️ メモ');
      c.notes.split('\n').forEach(line => { if (line.trim()) L.push('   ' + line.trim()); });
      L.push('');
    }
    if (c.want_to_revisit) {
      L.push('⭐ またここに行きたい！');
      L.push('');
    }
    var hasCatRating = RATING_CATS.some(r => c[r.key]);
    if (hasCatRating) {
      L.push('📊 詳細評価');
      RATING_CATS.forEach(r => {
        var v = c[r.key] || 0;
        if (v) L.push(`   ${r.icon} ${r.label}\t${'★'.repeat(v)}${'☆'.repeat(5 - v)}`);
      });
      L.push('');
    }
    if (badges.length) {
      L.push('🏅 バッジ');
      L.push('   ' + badges.map(b => `${b.emoji || '🏅'} ${b.title}`).join('　'));
      L.push('');
    }

  } else {
    // ===== 予定シェア =====
    L.push('┄'.repeat(14));
    L.push(`⛺ ${c.title}`);
    L.push('┄'.repeat(14));
    L.push('');
    if (c.campsite_name) {
      L.push(`📍 ${c.campsite_name}`);
      if (c.campsite_address) L.push(`   ${c.campsite_address}`);
    }
    var dr = fmtRange(c.start_date, c.end_date);
    if (dr) L.push(`📅 ${dr}`);
    L.push('');
    if (c.meeting_place || c.meeting_time) {
      L.push('🚗 集合');
      if (c.meeting_place) L.push(`   ${c.meeting_place}`);
      if (c.meeting_time)  L.push(`   ⏰ ${c.meeting_time.slice(0,5)}`);
      L.push('');
    }
    if (members.length) {
      L.push(`👥 ${members.map(m => m.headcount > 1 ? `${m.name}(${m.headcount}人)` : m.name).join('・')}`);
      L.push('');
    }
    var food = todos.filter(t => t.category === 'food');
    var act  = todos.filter(t => t.category === 'activity');
    var oth  = todos.filter(t => t.category === 'other');
    if (todos.length) {
      L.push('📝 やること');
      if (food.length) L.push(`   🍳 ${food.map(t=>t.text).join('・')}`);
      if (act.length)  L.push(`   🎯 ${act.map(t=>t.text).join('・')}`);
      if (oth.length)  L.push(`   ✨ ${oth.map(t=>t.text).join('・')}`);
      L.push('');
    }
    if (shopping.length) {
      L.push('🛒 買い出し');
      var byA = {};
      shopping.forEach(s => { var a = s.assignee || 'その他'; (byA[a]=byA[a]||[]).push(s.item); });
      Object.entries(byA).forEach(([a, items]) => L.push(`   ${a}：${items.join('・')}`));
      L.push('');
    }
    var selectedGearIds = new Set((gr.data || []).map(g => g.gear_item_id));
    var selectedGear = gearItems.filter(g => selectedGearIds.has(g.id));
    if (selectedGear.length) {
      L.push('🎒 持ち物');
      GEAR_CATS.forEach(cat => {
        var items = selectedGear.filter(g => g.category === cat.key);
        if (items.length) L.push(`   ${cat.icon} ${items.map(g => g.name).join('・')}`);
      });
      L.push('');
    }
  }

  L.push('▼ ふぁみキャン△で詳細を確認！');
  L.push('https://fami-camp.vercel.app/?camp=' + campId);

  await openShare(L.join('\n'));
  } catch(e) {
    console.error('shareToLine error', e);
    alert('シェアに失敗しました');
  }
}

// ===== 器具管理 =====
async function loadGearItems() {
  if (!db) return;
  var { data } = await db.from('gear_items').select('*').order('created_at');
  gearItems = data || [];
}

function showGearView() {
  renderGearView();
  showView('gear');
}

function renderGearView() {
  var el = document.getElementById('gearListContent');
  if (!gearItems.length) {
    el.innerHTML = '<p class="empty-msg">まだありません<br><span style="font-size:13px;color:var(--muted)">右上の ＋ から追加してください</span></p>';
    return;
  }
  var byCat = {};
  gearItems.forEach(g => { (byCat[g.category] = byCat[g.category] || []).push(g); });
  var html = '';
  GEAR_CATS.forEach(cat => {
    var items = byCat[cat.key] || [];
    if (!items.length) return;
    html += `<div class="gear-category-section">
      <div class="gear-cat-header">${cat.icon} ${cat.label}</div>`;
    items.forEach(g => {
      html += `<div class="gear-item-row">
        <span class="gear-item-name">${esc(g.name)}</span>
        <button class="btn-gear-del" onclick="deleteGearItem('${g.id}')">×</button>
      </div>`;
    });
    html += '</div>';
  });
  el.innerHTML = html;
}

function showAddGearModal() {
  document.getElementById('gearNameInput').value = '';
  document.getElementById('gearCategoryInput').selectedIndex = 0;
  document.getElementById('addGearModal').classList.add('active');
}
function hideAddGearModal() { document.getElementById('addGearModal').classList.remove('active'); }

async function saveGearItem() {
  var name     = document.getElementById('gearNameInput').value.trim();
  var category = document.getElementById('gearCategoryInput').value;
  if (!name) { alert('器具名を入力してください'); return; }
  var { error } = await db.from('gear_items').insert({ name, category });
  if (error) { alert('追加に失敗しました'); return; }
  await loadGearItems();
  renderGearView();
  hideAddGearModal();
}

async function deleteGearItem(id) {
  if (!confirm('この器具を削除しますか？')) return;
  var { error } = await db.from('gear_items').delete().eq('id', id);
  if (error) { alert('削除に失敗しました'); return; }
  await loadGearItems();
  renderGearView();
}

async function toggleCampGear(gearItemId, checked) {
  if (checked) {
    await db.from('camp_gear').insert({ camp_id: currentCampId, gear_item_id: gearItemId });
  } else {
    await db.from('camp_gear').delete().eq('camp_id', currentCampId).eq('gear_item_id', gearItemId);
  }
}

function buildGearSectionHtml(selectedIds) {
  if (!gearItems.length) {
    return `<p class="gear-empty-hint"><span onclick="showGearView()" style="color:var(--green-light);cursor:pointer;text-decoration:underline">器具マスターへ →</span> から器具を登録すると表示されます</p>`;
  }
  var selectedSet = new Set(selectedIds);
  var byCat = {};
  gearItems.forEach(g => { (byCat[g.category] = byCat[g.category] || []).push(g); });
  var html = '';
  GEAR_CATS.forEach(cat => {
    var items = byCat[cat.key] || [];
    if (!items.length) return;
    html += `<div class="gear-check-category"><div class="gear-check-cat-label">${cat.icon} ${cat.label}</div>`;
    items.forEach(g => {
      var chk = selectedSet.has(g.id) ? 'checked' : '';
      html += `<label class="gear-check-label">
        <input type="checkbox" class="gear-checkbox" ${chk} onchange="toggleCampGear('${g.id}', this.checked)">
        <span class="gear-check-text">${esc(g.name)}</span>
      </label>`;
    });
    html += '</div>';
  });
  return html || '<p class="gear-empty-hint">器具が登録されていません</p>';
}

async function shareGearListToLine() {
  if (!gearItems.length) { alert('器具が登録されていません'); return; }
  var L = [];
  L.push('┄'.repeat(14));
  L.push('🎒 うちの器具リスト');
  L.push('┄'.repeat(14));
  L.push('');
  GEAR_CATS.forEach(cat => {
    var items = gearItems.filter(g => g.category === cat.key);
    if (!items.length) return;
    L.push(`${cat.icon} ${cat.label}`);
    items.forEach(g => L.push(`   ・${g.name}`));
    L.push('');
  });
  L.push('▼ ふぁみキャン△');
  L.push('https://fami-camp.vercel.app/');
  await openShare(L.join('\n'));
}

// ===== メニューシート =====
function showMenuSheet() { document.getElementById('menuSheet').classList.add('active'); }
function hideMenuSheet() { document.getElementById('menuSheet').classList.remove('active'); }

// ===== 記録簿 =====
async function showDashboard() {
  showView('dashboard');
  var el = document.getElementById('dashboardContent');
  el.innerHTML = '<div style="padding:24px;color:#78716C">読み込み中…</div>';

  var { data: camps } = await db.from('camps')
    .select('*, camp_members(headcount)')
    .eq('status', 'completed')
    .order('start_date', { ascending: false });
  camps = camps || [];

  var totalCamps = camps.length;
  var totalNights = camps.reduce((s, c) => {
    if (c.start_date && c.end_date && c.start_date !== c.end_date)
      return s + Math.round((new Date(c.end_date) - new Date(c.start_date)) / 86400000);
    return s + 1;
  }, 0);
  var totalPeople = camps.reduce((s, c) =>
    s + (c.camp_members || []).reduce((ss, m) => ss + (m.headcount || 1), 0), 0);

  var statsHtml = `<div class="dash-stats">
    <div class="dash-stat"><div class="dash-stat-num">${totalCamps}</div><div class="dash-stat-label">回のキャンプ</div></div>
    <div class="dash-stat"><div class="dash-stat-num">${totalNights}</div><div class="dash-stat-label">泊の思い出</div></div>
    <div class="dash-stat"><div class="dash-stat-num">${totalPeople}</div><div class="dash-stat-label">人のべ参加</div></div>
  </div>`;

  var byCampYear = {};
  camps.forEach(c => { if (c.start_date) { var y = c.start_date.slice(0,4); byCampYear[y] = (byCampYear[y]||0)+1; } });
  var years = Object.keys(byCampYear).sort();
  var maxCount = Math.max(1, ...Object.values(byCampYear));
  var chartHtml = years.length ? `<div class="dash-section">
    <div class="dash-section-title">📅 年別キャンプ回数</div>
    <div class="dash-chart">${years.map(y => `
      <div class="dash-bar-row">
        <div class="dash-bar-label">${y}</div>
        <div class="dash-bar-track"><div class="dash-bar-fill" style="width:${Math.round(byCampYear[y]/maxCount*100)}%"></div></div>
        <div class="dash-bar-count">${byCampYear[y]}</div>
      </div>`).join('')}
    </div>
  </div>` : '';

  var sorted = [...camps].sort((a,b) => (b.rating||0) - (a.rating||0));
  var recordHtml = sorted.length ? `<div class="dash-section">
    <div class="dash-section-title">🏕️ キャンプ記録</div>
    ${sorted.map(c => {
      var stars = c.rating ? '★'.repeat(c.rating) + '<span class="dash-dim-stars">★</span>'.repeat(5-c.rating) : '';
      var cats = RATING_CATS.map(r => {
        var v = c[r.key] || 0;
        return v ? `<span class="dash-cat-badge" title="${r.label}">${r.icon}${'★'.repeat(v)}</span>` : '';
      }).join('');
      return `<div class="dash-camp-card" onclick="showCampDetail('${c.id}')">
        <div class="dash-camp-title">${esc(c.title)}</div>
        ${c.campsite_name ? `<div class="dash-camp-meta">📍 ${esc(c.campsite_name)}</div>` : ''}
        ${c.start_date ? `<div class="dash-camp-meta">📅 ${fmtRange(c.start_date, c.end_date)}</div>` : ''}
        ${stars ? `<div class="dash-camp-stars">${stars}</div>` : ''}
        ${cats ? `<div class="dash-cat-badges">${cats}</div>` : ''}
      </div>`;
    }).join('')}
  </div>` : '';

  var badgesSection = `<div class="dash-section" id="dashBadgeSection">
    <div class="dash-section-title">🏅 バッジコレクション</div>
    <div id="dashBadgeList">${buildBadgeListHtml()}</div>
    <button class="btn-primary" onclick="showAddBadgeModal(null)" style="margin-top:14px">＋ バッジを追加</button>
  </div>`;

  el.innerHTML = statsHtml + chartHtml + recordHtml + badgesSection;
}

// ===== ギャラリー =====
async function showGallery() {
  showView('gallery');
  var el = document.getElementById('galleryContent');
  el.innerHTML = '<div style="padding:24px;color:#78716C">読み込み中…</div>';

  var [photosRes, campsRes] = await Promise.all([
    db.from('camp_photos').select('*').order('created_at', { ascending: false }),
    db.from('camps').select('id,title,start_date').order('start_date', { ascending: false })
  ]);
  var photos = photosRes.data || [];
  var camps  = campsRes.data || [];

  if (!photos.length) { el.innerHTML = '<p class="empty-msg" style="padding:24px">まだ写真がありません</p>'; return; }

  var campMap = {};
  camps.forEach(c => { campMap[c.id] = c; });
  var byCamp = {};
  photos.forEach(p => { (byCamp[p.camp_id] = byCamp[p.camp_id] || []).push(p); });
  var campIds = Object.keys(byCamp).sort((a,b) => {
    var ca = campMap[a], cb = campMap[b];
    return ((cb&&cb.start_date)||'').localeCompare((ca&&ca.start_date)||'');
  });

  el.innerHTML = campIds.map(cid => {
    var camp = campMap[cid];
    var title = camp ? esc(camp.title) : '不明';
    var dateStr = camp && camp.start_date ? fmtDate(camp.start_date) : '';
    return `<div class="gallery-group">
      <div class="gallery-group-hdr" onclick="showCampDetail('${cid}')">
        <div class="gallery-group-info"><div class="gallery-group-title">${title}</div>${dateStr?`<div class="gallery-group-date">${dateStr}</div>`:''}</div>
        <span class="camp-arrow">›</span>
      </div>
      <div class="gallery-grid">${byCamp[cid].map(p =>
        `<div class="gallery-photo" onclick="window.open('${p.image_url}','_blank')">
          <img src="${p.image_url}" alt="${esc(p.comment||'')}" loading="lazy">
          ${p.comment ? `<div class="gallery-caption">${esc(p.comment)}</div>` : ''}
        </div>`
      ).join('')}</div>
    </div>`;
  }).join('');
}

// ===== 行きたいリスト =====
async function loadWishlistItems() {
  if (!db) return;
  var { data } = await db.from('wishlist_camps').select('*').order('created_at', { ascending: false });
  wishlistItems = data || [];
}

async function showWishlist() {
  showView('wishlist');
  renderWishlist();
}

function renderWishlist() {
  var el = document.getElementById('wishlistContent');
  if (!wishlistItems.length) {
    el.innerHTML = '<p class="empty-msg" style="padding:24px">まだありません<br><span style="font-size:13px;color:var(--muted)">右上の ＋ から追加してください</span></p>';
    return;
  }
  el.innerHTML = wishlistItems.map(w => `
    <div class="wishlist-card">
      <div class="wishlist-card-main">
        <div class="wishlist-name">⭐ ${esc(w.name)}</div>
        ${w.address ? `<div class="wishlist-detail">📍 ${esc(w.address)}</div>` : ''}
        ${w.memo    ? `<div class="wishlist-detail" style="color:var(--muted)">${esc(w.memo)}</div>` : ''}
      </div>
      <div class="wishlist-actions">
        <button class="btn-wishlist-plan" onclick="planFromWishlist('${w.id}')">計画する</button>
        <button class="btn-gear-del" onclick="deleteWishlistItem('${w.id}')">×</button>
      </div>
    </div>
  `).join('');
}

function showAddWishlistModal() {
  document.getElementById('wishNameInput').value = '';
  document.getElementById('wishAddressInput').value = '';
  document.getElementById('wishMemoInput').value = '';
  document.getElementById('addWishlistModal').classList.add('active');
}
function hideAddWishlistModal() { document.getElementById('addWishlistModal').classList.remove('active'); }

async function saveWishlistItem() {
  var name    = document.getElementById('wishNameInput').value.trim();
  var address = document.getElementById('wishAddressInput').value.trim() || null;
  var memo    = document.getElementById('wishMemoInput').value.trim() || null;
  if (!name) { alert('キャンプ場名を入力してください'); return; }
  var { error } = await db.from('wishlist_camps').insert({ name, address, memo });
  if (error) { alert('追加に失敗しました'); return; }
  await loadWishlistItems(); renderWishlist(); hideAddWishlistModal();
}

async function deleteWishlistItem(id) {
  if (!confirm('リストから削除しますか？')) return;
  var { error } = await db.from('wishlist_camps').delete().eq('id', id);
  if (error) { alert('削除に失敗しました'); return; }
  await loadWishlistItems(); renderWishlist();
}

function planFromWishlist(id) {
  var w = wishlistItems.find(x => x.id === id);
  if (!w) return;
  showNewCampForm();
  setTimeout(() => {
    document.getElementById('fCampsiteName').value    = w.name    || '';
    document.getElementById('fCampsiteAddress').value = w.address || '';
  }, 0);
}

function showWishlistPickModal() {
  var el = document.getElementById('wishlistPickList');
  if (!wishlistItems.length) {
    el.innerHTML = '<p class="empty-msg" style="padding:12px">行きたいリストはまだありません</p>';
  } else {
    el.innerHTML = wishlistItems.map(w => `
      <div class="wishlist-pick-item" onclick="applyWishlistItem('${w.id}')">
        <div class="wishlist-name">⭐ ${esc(w.name)}</div>
        ${w.address ? `<div class="wishlist-detail">${esc(w.address)}</div>` : ''}
      </div>
    `).join('');
  }
  document.getElementById('wishlistPickModal').classList.add('active');
}
function hideWishlistPickModal() { document.getElementById('wishlistPickModal').classList.remove('active'); }

function applyWishlistItem(id) {
  var w = wishlistItems.find(x => x.id === id);
  if (!w) return;
  document.getElementById('fCampsiteName').value    = w.name    || '';
  document.getElementById('fCampsiteAddress').value = w.address || '';
  hideWishlistPickModal();
}

// ===== バッジ =====
async function loadBadges() {
  if (!db) return;
  var { data } = await db.from('badges').select('*').order('created_at', { ascending: false });
  allBadges = data || [];
}

function renderBadgeStrip() {
  var el = document.getElementById('badgeStrip');
  if (!el) return;
  if (!allBadges.length) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="badge-strip-inner">
    <span class="badge-strip-label">🏅 バッジ</span>
    <div class="badge-strip-scroll">${allBadges.map(b =>
      `<div class="badge-strip-item" title="${esc(b.title)}">${b.emoji || '🏅'}</div>`
    ).join('')}</div>
  </div>`;
}

function buildBadgeListHtml() {
  if (!allBadges.length) return '<p class="empty-msg">まだバッジがありません</p>';
  return allBadges.map(b => `
    <div class="badge-collection-item">
      <span class="badge-col-icon">${b.emoji || '🏅'}</span>
      <div class="badge-col-info">
        <div class="badge-col-name">${esc(b.title)}</div>
        ${b.description ? `<div class="badge-col-desc">${esc(b.description)}</div>` : ''}
      </div>
      <button class="btn-gear-del" onclick="deleteBadge('${b.id}')">×</button>
    </div>
  `).join('');
}

function showAddBadgeModal(campId) {
  badgeTargetCampId = campId;
  document.getElementById('badgeNameInput').value = '';
  document.getElementById('badgeIconInput').value = '';
  document.getElementById('badgeDescInput').value = '';
  document.getElementById('badgePresets').innerHTML = MILESTONE_BADGES.map((b, i) =>
    `<button class="badge-preset-btn" onclick="selectBadgePreset(${i})">${b.icon} ${b.name}</button>`
  ).join('');
  document.getElementById('addBadgeModal').classList.add('active');
}
function hideAddBadgeModal() { document.getElementById('addBadgeModal').classList.remove('active'); }

function selectBadgePreset(i) {
  var b = MILESTONE_BADGES[i];
  document.getElementById('badgeNameInput').value = b.name;
  document.getElementById('badgeIconInput').value = b.icon;
  document.getElementById('badgeDescInput').value = b.desc;
}

async function saveBadge() {
  var name = document.getElementById('badgeNameInput').value.trim();
  var icon = document.getElementById('badgeIconInput').value.trim() || '🏅';
  var desc = document.getElementById('badgeDescInput').value.trim() || null;
  if (!name) { alert('バッジ名を入力してください'); return; }
  var record = { title: name, emoji: icon, description: desc };
  if (badgeTargetCampId) record.camp_id = badgeTargetCampId;
  var { error } = await db.from('badges').insert(record);
  if (error) { alert('追加に失敗しました: ' + error.message); return; }
  await loadBadges();
  renderBadgeStrip();
  hideAddBadgeModal();
  var dashEl = document.getElementById('dashBadgeList');
  if (dashEl) dashEl.innerHTML = buildBadgeListHtml();
  if (badgeTargetCampId === currentCampId) await showCampDetail(currentCampId);
}

async function deleteBadge(id) {
  if (!confirm('このバッジを削除しますか？')) return;
  var { error } = await db.from('badges').delete().eq('id', id);
  if (error) { alert('削除に失敗しました'); return; }
  await loadBadges();
  renderBadgeStrip();
  var dashEl = document.getElementById('dashBadgeList');
  if (dashEl) dashEl.innerHTML = buildBadgeListHtml();
}

// ===== ユーティリティ =====
function esc(s) {
  if (!s) return '';
  var d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}
function fmtDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' });
}
function fmtRange(start, end) {
  if (!start && !end) return '';
  if (start && end && start !== end) return `${fmtDate(start)} 〜 ${fmtDate(end)}`;
  return fmtDate(start || end);
}

// ===== キーボード =====
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('memberInput').addEventListener('keydown',    e => { if (e.key==='Enter'){e.preventDefault();addMemberFromInput();} });
  document.getElementById('todoInput').addEventListener('keydown',      e => { if (e.key==='Enter'){e.preventDefault();addTodoFromInput();} });
  document.getElementById('shopItemInput').addEventListener('keydown',  e => { if (e.key==='Enter'){e.preventDefault();addShoppingFromInput();} });
  document.getElementById('gearNameInput').addEventListener('keydown',  e => { if (e.key==='Enter'){e.preventDefault();saveGearItem();} });
});

init();
