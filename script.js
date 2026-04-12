// ===== 設定 =====
var BUCKET = 'camp-photos';

// ===== 状態 =====
var db = null;
var currentCampId = null;
var editingCampId = null;
var formMembers  = [];
var formTodos    = [];
var formShopping = [];
var favoriteGroups  = [];
var selectedRating  = 0;
var pendingCompleteId = null;
var pendingPhotoType  = null;
var pendingPhotoSlot  = null;
var pendingPhotoId    = null;
var pendingPhotoFile  = null;

// ===== 初期化 =====
async function init() {
  try {
    var res = await fetch('config.json');
    var cfg = await res.json();
    db = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey);
    await Promise.all([loadCamps(), loadFavoriteGroups()]);
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

function showListView() {
  currentCampId = null;
  showView('list');
}

// ===== キャンプ一覧 =====
async function loadCamps() {
  var { data, error } = await db
    .from('camps')
    .select('*, camp_members(name)')
    .order('start_date', { ascending: true, nullsFirst: false });

  if (error) { console.error(error); return; }

  var planned   = (data || []).filter(c => c.status === 'planned');
  var completed = (data || []).filter(c => c.status === 'completed').reverse();
  renderList('plannedList',   planned);
  renderList('completedList', completed);
}

function renderList(id, camps) {
  var el = document.getElementById(id);
  if (!camps.length) { el.innerHTML = '<p class="empty-msg">まだありません</p>'; return; }
  el.innerHTML = camps.map(c => {
    var members = (c.camp_members || []).map(m => m.name).join('・');
    var dateStr = fmtRange(c.start_date, c.end_date);
    var stars   = c.rating ? '★'.repeat(c.rating) : '';
    return `<div class="camp-card" onclick="showCampDetail('${c.id}')">
      <div class="camp-card-main">
        <div class="camp-card-title">${esc(c.title)}</div>
        ${c.campsite_name ? `<div class="camp-card-site">📍 ${esc(c.campsite_name)}</div>` : ''}
        ${dateStr         ? `<div class="camp-card-date">📅 ${dateStr}</div>` : ''}
        ${members         ? `<div class="camp-card-members">👥 ${esc(members)}</div>` : ''}
      </div>
      <div class="camp-card-right">
        <span class="badge ${c.status}">${c.status === 'planned' ? '予定' : '記録'}</span>
        ${stars ? `<div class="camp-stars" style="color:#F59E0B">${stars}</div>` : ''}
        <span class="camp-arrow">›</span>
      </div>
    </div>`;
  }).join('');
}

// ===== キャンプ詳細 =====
async function showCampDetail(campId) {
  currentCampId = campId;
  showView('detail');
  document.getElementById('detailContent').innerHTML = '<div style="padding:24px;color:#78716C">読み込み中…</div>';

  var [cr, mr, tr, sr, pr] = await Promise.all([
    db.from('camps').select('*').eq('id', campId).single(),
    db.from('camp_members').select('*').eq('camp_id', campId),
    db.from('camp_todos').select('*').eq('camp_id', campId).order('created_at'),
    db.from('camp_shopping').select('*').eq('camp_id', campId).order('created_at'),
    db.from('camp_photos').select('*').eq('camp_id', campId).order('sort_order')
  ]);

  if (cr.error) { document.getElementById('detailContent').innerHTML = '<p style="padding:24px">読み込みエラー</p>'; return; }

  renderDetail(cr.data, mr.data || [], tr.data || [], sr.data || [], pr.data || []);

  document.getElementById('btnEdit').onclick   = () => showEditCampForm(campId);
  document.getElementById('btnDelete').onclick = () => deleteCamp(campId);
}

function renderDetail(camp, members, todos, shopping, photos) {
  var el = document.getElementById('detailContent');

  // Members
  var membersHtml = members.length
    ? members.map(m => `<span class="member-chip">${esc(m.name)}</span>`).join('')
    : '<span style="color:#78716C;font-size:14px">なし</span>';

  // Todos by category
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

  var ratingHtml = (camp.status === 'completed' && camp.rating)
    ? `<div class="detail-rating" style="color:#F59E0B">${'★'.repeat(camp.rating)}</div>`
    : '';

  el.innerHTML = `
    <div class="detail-hero">
      <div class="detail-status-row">
        <span class="badge ${camp.status}">${camp.status === 'planned' ? '予定' : '記録'}</span>
        ${ratingHtml}
      </div>
      <h2 class="detail-title">${esc(camp.title)}</h2>
    </div>
    <div class="detail-body">
      ${camp.campsite_name ? `
      <div class="detail-section">
        <div class="detail-section-title">⛺ キャンプ場</div>
        <p>${esc(camp.campsite_name)}</p>
        ${camp.campsite_address ? `<p class="muted">${esc(camp.campsite_address)}</p>` : ''}
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

      <div class="detail-section">
        <div class="detail-section-title">📸 写真</div>
        <div class="photo-type-label">集合写真</div>
        <div class="photo-slots">${photoSlots('group', gPhotos, 1)}</div>
        <div class="photo-type-label">キャンプ場の写真</div>
        <div class="photo-slots">${photoSlots('campsite', cPhotos, 3)}</div>
        <div class="photo-type-label">幸せの記録</div>
        <div class="photo-slots">${photoSlots('happy', hPhotos, 3)}</div>
      </div>

      <div class="detail-actions">
        ${camp.status === 'planned'
          ? `<button class="btn-complete" onclick="showCompleteModal('${camp.id}','${esc(camp.title)}')">✅ キャンプ完了！記録にする</button>`
          : ''}
        <button class="btn-line" onclick="shareToLine('${camp.id}')">📤 LINEでシェア</button>
      </div>
    </div>`;
}

function todoRow(t) {
  return `<div class="todo-item ${t.is_done ? 'done' : ''}" id="td-${t.id}">
    <button class="todo-check" onclick="toggleTodo('${t.id}',${!t.is_done})">${t.is_done ? '✅' : '⬜'}</button>
    <span class="todo-text">${esc(t.text)}</span>
  </div>`;
}
function shopRow(s) {
  return `<div class="shop-item ${s.is_done ? 'done' : ''}" id="sh-${s.id}">
    <button class="todo-check" onclick="toggleShop('${s.id}',${!s.is_done})">${s.is_done ? '✅' : '⬜'}</button>
    <span class="shop-text">${esc(s.item)}</span>
    ${s.assignee ? `<span class="shop-assignee">${esc(s.assignee)}</span>` : ''}
  </div>`;
}
function photoSlots(type, photos, max) {
  var map = {};
  photos.forEach(p => { map[p.sort_order] = p; });
  var html = '';
  for (var i = 0; i < max; i++) {
    var p = map[i];
    if (p) {
      html += `<div class="photo-slot filled" onclick="openPhotoUpload('${type}',${i},'${p.id}')">
        <img src="${p.image_url}" class="slot-img" alt="写真">
        ${p.comment ? `<div class="slot-comment">${esc(p.comment)}</div>` : ''}
      </div>`;
    } else {
      html += `<div class="photo-slot empty" onclick="openPhotoUpload('${type}',${i},null)">
        <span class="slot-add">＋</span>
      </div>`;
    }
  }
  return html;
}

// ===== チェック切替 =====
async function toggleTodo(id, done) {
  await db.from('camp_todos').update({ is_done: done }).eq('id', id);
  var el = document.getElementById('td-' + id);
  if (el) {
    el.classList.toggle('done', done);
    el.querySelector('.todo-check').textContent = done ? '✅' : '⬜';
  }
}
async function toggleShop(id, done) {
  await db.from('camp_shopping').update({ is_done: done }).eq('id', id);
  var el = document.getElementById('sh-' + id);
  if (el) {
    el.classList.toggle('done', done);
    el.querySelector('.todo-check').textContent = done ? '✅' : '⬜';
  }
}

// ===== フォーム =====
function showNewCampForm() {
  editingCampId = null; formMembers = []; formTodos = []; formShopping = [];
  document.getElementById('formTitle').textContent = '新しいキャンプ';
  clearForm();
  renderFavGroupsRow();
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
  formMembers  = (mr.data || []).map(m => ({ name: m.name }));
  formTodos    = (tr.data || []).map(t => ({ text: t.text, category: t.category, is_done: t.is_done }));
  formShopping = (sr.data || []).map(s => ({ item: s.item, assignee: s.assignee, is_done: s.is_done }));

  document.getElementById('formTitle').textContent    = '編集';
  document.getElementById('fTitle').value            = c.title || '';
  document.getElementById('fCampsiteName').value     = c.campsite_name || '';
  document.getElementById('fCampsiteAddress').value  = c.campsite_address || '';
  document.getElementById('fStartDate').value        = c.start_date || '';
  document.getElementById('fEndDate').value          = c.end_date || '';
  document.getElementById('fMeetingPlace').value     = c.meeting_place || '';
  document.getElementById('fMeetingTime').value      = c.meeting_time ? c.meeting_time.slice(0,5) : '';

  renderFavGroupsRow();
  renderFormMembers(); renderFormTodos(); renderFormShopping(); updateAssigneeOptions();
  showView('form');
}

function clearForm() {
  ['fTitle','fCampsiteName','fCampsiteAddress','fStartDate','fEndDate','fMeetingPlace','fMeetingTime']
    .forEach(id => document.getElementById(id).value = '');
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
      meeting_time:     document.getElementById('fMeetingTime').value || null
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

    // メンバー・Todo・買い出しは全削除→再挿入
    await db.from('camp_members').delete().eq('camp_id', campId);
    if (formMembers.length)
      await db.from('camp_members').insert(formMembers.map(m => ({ camp_id: campId, name: m.name })));

    await db.from('camp_todos').delete().eq('camp_id', campId);
    if (formTodos.length)
      await db.from('camp_todos').insert(formTodos.map(t => ({ camp_id: campId, text: t.text, category: t.category, is_done: t.is_done })));

    await db.from('camp_shopping').delete().eq('camp_id', campId);
    if (formShopping.length)
      await db.from('camp_shopping').insert(formShopping.map(s => ({ camp_id: campId, item: s.item, assignee: s.assignee || null, is_done: s.is_done })));

    currentCampId = campId;
    await loadCamps();
    await showCampDetail(campId);
  } catch (e) {
    console.error(e);
    alert('保存に失敗しました');
    btn.disabled = false; btn.textContent = '保存';
  }
}

// ===== メンバー =====
function addMemberFromInput() {
  var input = document.getElementById('memberInput');
  var name = input.value.trim();
  if (!name) return;
  formMembers.push({ name });
  input.value = '';
  renderFormMembers(); updateAssigneeOptions();
}
function removeMember(i) {
  formMembers.splice(i, 1);
  renderFormMembers(); updateAssigneeOptions();
}
function renderFormMembers() {
  document.getElementById('memberList').innerHTML = formMembers.map((m, i) =>
    `<span class="member-chip">${esc(m.name)}<button type="button" class="chip-remove" onclick="removeMember(${i})">×</button></span>`
  ).join('') || '';
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
  var el = document.getElementById('favGroupsRow');
  el.innerHTML = favoriteGroups.map((g, i) =>
    `<button type="button" class="fav-group-chip" onclick="applyFavGroup(${i})">⭐ ${esc(g.name)}</button>`
  ).join('');
}
function applyFavGroup(i) {
  var names = favoriteGroups[i].members;
  names.forEach(n => { if (!formMembers.find(m => m.name === n)) formMembers.push({ name: n }); });
  renderFormMembers(); updateAssigneeOptions();
}
function showSaveGroupModal() {
  if (!formMembers.length) { alert('先にメンバーを追加してください'); return; }
  document.getElementById('groupNameInput').value = '';
  document.getElementById('saveGroupModal').classList.add('active');
}
function hideSaveGroupModal() {
  document.getElementById('saveGroupModal').classList.remove('active');
}
async function saveGroupConfirm() {
  var name = document.getElementById('groupNameInput').value.trim();
  if (!name) { alert('グループ名を入力してください'); return; }
  var { error } = await db.from('camp_favorite_groups').insert({ name, members: formMembers.map(m => m.name) });
  if (error) { alert('保存に失敗しました'); return; }
  await loadFavoriteGroups();
  renderFavGroupsRow();
  hideSaveGroupModal();
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
  var catIcon = { food: '🍳', activity: '🎯', other: '✨' };
  document.getElementById('todoList').innerHTML = formTodos.length
    ? formTodos.map((t, i) =>
        `<div class="form-item-row">
          <span class="form-item-cat">${catIcon[t.category] || '✨'}</span>
          <span class="form-item-text">${esc(t.text)}</span>
          <button type="button" class="chip-remove" onclick="removeTodoItem(${i})">×</button>
        </div>`).join('')
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
        `<div class="form-item-row">
          <span class="form-item-text">🛒 ${esc(s.item)}</span>
          ${s.assignee ? `<span class="form-item-badge">${esc(s.assignee)}</span>` : ''}
          <button type="button" class="chip-remove" onclick="removeShopRow(${i})">×</button>
        </div>`).join('')
    : '<p class="empty-msg">まだありません</p>';
}

// ===== 写真 =====
function openPhotoUpload(type, slot, photoId) {
  pendingPhotoType = type; pendingPhotoSlot = slot; pendingPhotoId = photoId; pendingPhotoFile = null;
  var titles = { group: '集合写真', campsite: 'キャンプ場の写真', happy: '幸せの記録' };
  document.getElementById('photoModalTitle').textContent = titles[type] || '写真';
  document.getElementById('photoCommentInput').value = '';
  document.getElementById('photoFileInput').value    = '';
  document.getElementById('photoUploadArea').style.display  = 'block';
  document.getElementById('photoPreviewWrap').style.display = 'none';
  document.getElementById('photoModal').classList.add('active');
}
function hidePhotoModal() {
  document.getElementById('photoModal').classList.remove('active');
  pendingPhotoFile = null;
}
function handlePhotoFile(e) {
  var file = e.target.files[0];
  if (!file) return;
  pendingPhotoFile = file;
  var reader = new FileReader();
  reader.onload = function(ev) {
    document.getElementById('photoPreview').src = ev.target.result;
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
    var imageUrl = urlData.publicUrl;
    var comment  = document.getElementById('photoCommentInput').value.trim() || null;
    if (pendingPhotoId) {
      await db.from('camp_photos').update({ image_url: imageUrl, comment }).eq('id', pendingPhotoId);
    } else {
      await db.from('camp_photos').insert({ camp_id: currentCampId, photo_type: pendingPhotoType, image_url: imageUrl, comment, sort_order: pendingPhotoSlot });
    }
    hidePhotoModal();
    await showCampDetail(currentCampId);
  } catch (e) {
    console.error(e);
    alert('アップロードに失敗しました。Supabaseのストレージバケット設定を確認してください。');
  } finally {
    btn.disabled = false; btn.textContent = '写真を保存';
  }
}

// ===== 完了・評価 =====
function showCompleteModal(campId, title) {
  pendingCompleteId = campId; selectedRating = 0;
  document.getElementById('completeCampName').textContent = title;
  document.getElementById('ratingLabel').textContent = 'タップして評価';
  updateStars(0);
  document.getElementById('completeModal').classList.add('active');
}
function hideCompleteModal() {
  document.getElementById('completeModal').classList.remove('active');
}
function setRating(val) {
  selectedRating = val; updateStars(val);
  var labels = ['', 'うーん…', 'まあまあ', 'よかった！', 'とても良かった！', '最高だった！！'];
  document.getElementById('ratingLabel').textContent = labels[val] || '';
}
function updateStars(val) {
  document.querySelectorAll('.star').forEach((s, i) => s.classList.toggle('active', i < val));
}
async function confirmComplete() {
  if (!selectedRating) { alert('評価を選んでください'); return; }
  var { error } = await db.from('camps').update({ status: 'completed', rating: selectedRating }).eq('id', pendingCompleteId);
  if (error) { alert('更新に失敗しました'); return; }
  hideCompleteModal();
  await loadCamps();
  await showCampDetail(pendingCompleteId);
}

// ===== 削除 =====
async function deleteCamp(campId) {
  if (!confirm('このキャンプを削除しますか？')) return;
  var { error } = await db.from('camps').delete().eq('id', campId);
  if (error) { alert('削除に失敗しました'); return; }
  currentCampId = null;
  await loadCamps();
  showView('list');
}

// ===== LINEシェア =====
async function shareToLine(campId) {
  var [cr, mr] = await Promise.all([
    db.from('camps').select('*').eq('id', campId).single(),
    db.from('camp_members').select('name').eq('camp_id', campId)
  ]);
  var c = cr.data;
  var members = (mr.data || []).map(m => m.name);
  var lines = [`⛺ ${c.title}`];
  if (c.campsite_name)    lines.push(`📍 ${c.campsite_name}`);
  if (c.campsite_address) lines.push(`   ${c.campsite_address}`);
  var dr = fmtRange(c.start_date, c.end_date);
  if (dr) lines.push(`📅 ${dr}`);
  if (c.meeting_place) lines.push(`🚗 集合場所: ${c.meeting_place}`);
  if (c.meeting_time)  lines.push(`⏰ 集合時間: ${c.meeting_time.slice(0,5)}`);
  if (members.length)  lines.push(`👥 ${members.join('・')}`);
  lines.push('', '▼ ふぁみキャン△で詳細を確認！', 'https://fami-camp.vercel.app/');
  window.open('https://line.me/R/msg/text/?' + encodeURIComponent(lines.join('\n')), '_blank');
}

// ===== ユーティリティ =====
function esc(s) {
  if (!s) return '';
  var d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
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
  document.getElementById('memberInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addMemberFromInput(); } });
  document.getElementById('todoInput').addEventListener('keydown',   e => { if (e.key === 'Enter') { e.preventDefault(); addTodoFromInput(); } });
  document.getElementById('shopItemInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addShoppingFromInput(); } });
});

init();
