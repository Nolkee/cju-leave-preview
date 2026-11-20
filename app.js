'use strict';

const screen = document.querySelector('#screen');
const modal = document.querySelector('#modal');
const toast = document.querySelector('#toast');
const storageKey = 'leave-practice-records-v1';
const usageHelpKey = 'leave-usage-help-dismissed-v1';
const starPromptKey = 'leave-star-prompt-dismissed-v1';
const currentTerm = '2026–2027学年第1学期';
const seed = {
  id: 'example', term: '2025–2026学年第1学期', phone: '00000000000',
  type: '校内请假', category: '病假', start: '2025-12-15T03:23', end: '2025-12-15T12:00',
  reason: '身体不适', guardian: '🧊', guardianPhone: '00000000000',
  informed: '是', off: '否', destination: '', files: [], signature: '', count: 1,
  status: 'closed', closedAt: '2025-12-15T19:53:42', closeMethod: '自动销假',
};
const statusText = {pending: '待审批', approved: '未销假', closed: '已销假'};
let records = [seed];
let toastTimer;
let expirationTimer;
let storageSnapshot;
let renderedRecords;
const visitCountKey = 'leave-visit-count-v1';
let visitCount = 0;

function countVisit() {
  try {
    visitCount = (Number(localStorage.getItem(visitCountKey) || '0') || 0) + 1;
    localStorage.setItem(visitCountKey, String(visitCount));
  } catch {
    visitCount = 1;
  }
}

// 全站计数（Cloudflare Worker + KV）：浏览器 ID 去重，全站共用同一套数
const COUNTER_BASE = 'https://cju-leave-preview.ans44454456.workers.dev';
const clientIdKey = 'leave-client-id-v1';
let counterTotals = null; // 最近一次 Worker 返回的 { visitors, bonus, myVisitorRank, myBonusRank }

function getClientId() {
  try {
    const vid = localStorage.getItem(clientIdKey);
    if (vid && /^[A-Za-z0-9-]{8,64}$/.test(vid)) return vid;
  } catch {}
  const vid = 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  try { localStorage.setItem(clientIdKey, vid); } catch {}
  return vid;
}

// 跳转带过来的 ?vid=：认下这个 ID（两站算一个人），然后从地址栏去掉
function adoptVidFromUrl() {
  try {
    const params = new URLSearchParams(location.search || '');
    const vid = params.get('vid');
    if (vid && /^[A-Za-z0-9-]{8,64}$/.test(vid)) {
      try { localStorage.setItem(clientIdKey, vid); } catch {}
      params.delete('vid');
      const qs = params.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }
  } catch {}
}

async function callCounter(path) {
  try {
    const res = await fetch(`${COUNTER_BASE}${path}?vid=${encodeURIComponent(getClientId())}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (typeof data.visitors === 'number' && typeof data.bonus === 'number') {
      counterTotals = data;
      return data;
    }
  } catch {}
  return null;
}

function loadStoredRecords() {
  try {
    const snapshot = localStorage.getItem(storageKey);
    if (snapshot === storageSnapshot) return;
    const saved = snapshot === null ? [seed] : JSON.parse(snapshot);
    if (Array.isArray(saved)) {
      records = saved;
      storageSnapshot = snapshot;
    }
  } catch {
    // Keep the in-memory records when browser storage is unavailable.
  }
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function announce(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  // 用 popover 把提示提到最顶层，盖在弹框遮罩之上
  if (message) {
    try { toast.showPopover(); } catch {}
  }
  toastTimer = setTimeout(() => {
    toast.textContent = '';
    try { toast.hidePopover(); } catch {}
  }, 3600);
}

function storeRecords(next) {
  records = next;
  try {
    const snapshot = JSON.stringify(next);
    localStorage.setItem(storageKey, snapshot);
    storageSnapshot = snapshot;
    return true;
  } catch {
    return false;
  }
}

function endTimestamp(record) {
  return record.endTimestamp ?? Date.parse(record.end);
}

function closeExpired(items, now) {
  let changed = false;
  const next = items.map(record => {
    if (record.status !== 'approved' || !(endTimestamp(record) <= now)) return record;
    changed = true;
    return {...record, status: 'closed', closedAt: record.end, closeMethod: '自动销假'};
  });
  return changed ? next : items;
}

function scheduleExpiration() {
  clearTimeout(expirationTimer);
  let nextEnd = Infinity;
  for (const record of records) {
    if (record.status === 'approved' && Number.isFinite(endTimestamp(record))) {
      nextEnd = Math.min(nextEnd, endTimestamp(record));
    }
  }
  if (Number.isFinite(nextEnd)) {
    const delay = Math.min(60000, Math.max(0, nextEnd - Date.now()));
    expirationTimer = setTimeout(() => { void updateRecords(); }, delay);
  }
}

async function updateRecords(change = items => items) {
  const update = () => {
    loadStoredRecords();
    const now = Date.now();
    const current = closeExpired(records, now);
    const next = closeExpired(change(current), now);
    const saved = next === records || storeRecords(next);
    scheduleExpiration();
    refreshRecordsView();
    return saved;
  };
  return navigator.locks ? navigator.locks.request(storageKey, update) : update();
}

function announceChange(message, saved) {
  announce(saved ? message : `${message}。浏览器存储不可用，刷新后将丢失本次操作。`);
}

function termCount(items = records) {
  return items.filter(record => record.term === currentTerm).length;
}

function minutes(start, end) {
  return Math.max(0, Math.round((new Date(end) - new Date(start)) / 60000)) || 0;
}

function duration(total, showMinutes = true) {
  const days = Math.floor(total / 1440);
  const hours = Math.floor(total / 60) % 24;
  return showMinutes ? `${days}天${hours}小时${total % 60}分钟` : `${days} 天 ${hours} 小时`;
}

function dateText(value) {
  return escapeHtml(value.replace('T', ' '));
}

function dateRange(record) {
  return `<span class="date-range">
    <span>${dateText(record.start)} 至</span>
    <span>${dateText(record.end)}</span>
  </span>`;
}

function nowLocal() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

function heading(title, showBack = true) {
  return `<div class="page-head">
    ${showBack ? '<a class="back" href="#records">返回请假记录</a>' : ''}
    <h1 tabindex="-1">${title}</h1>
  </div>`;
}

function metadata(items) {
  return `<dl class="meta">${items.map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

function badge(status) {
  return `<span class="status ${status === 'pending' ? 'pending' : ''}">${statusText[status]}</span>`;
}

function list() {
  const total = records.reduce((sum, record) => sum + minutes(record.start, record.end), 0);
  const cards = records.map(record => {
    const id = escapeHtml(record.id);
    return `<article class="record">
      <div class="record-heading">
        <h2>${escapeHtml(record.reason)}</h2>
        <details class="record-options">
          <summary aria-label="更多操作"><span aria-hidden="true">⋯</span></summary>
          <div class="record-option-list"><button type="button" class="btn danger" data-delete="${id}">删除记录</button></div>
        </details>
      </div>
      <div class="record-body">${badge(record.status)}${metadata([
        ['请假类型', escapeHtml(record.type)],
        ['请假时间', dateRange(record)],
        ['外出地点', record.off === '是' ? escapeHtml(record.destination) : '未离校'],
      ])}</div>
      <div class="actions">
        <a class="btn" href="#detail/${id}" aria-label="查看${escapeHtml(record.reason)}的请假详情">查看</a>
        ${record.status === 'pending' ? '' : `<button class="btn" data-proof="${id}">请假证明</button>`}
      </div>
    </article>`;
  }).join('');
  return `<div class="narrow leave-list">
    ${heading('请假申请', false)}
    <div class="stats"><span>在校期间请假 <strong>${records.length} 次</strong></span><span>总时长 <strong>${duration(total, false)}</strong></span></div>
    ${cards}<p class="end">${cards ? '没有更多了' : '暂无请假记录'}</p>
    <div class="actions footer-actions"><a class="btn primary" href="#apply">申请</a></div>
  </div>`;
}

const star = '<span class="req" aria-hidden="true">*</span>';

function field(name, label, input, extra = '') {
  return `<div class="field ${extra}"><label for="${name}">${label}${star}</label>${input}</div>`;
}

function select(name, label, options) {
  return field(name, label, `<div class="select-field"><select id="${name}" name="${name}" required><option value="">请选择</option>${options.map(option => `<option>${option}</option>`).join('')}</select></div>`);
}

function choice(name, label) {
  return `<fieldset class="choice-field"><legend>${label}${star}</legend><div class="segment">
    <label><input type="radio" name="${name}" value="是">是</label>
    <label><input type="radio" name="${name}" value="否" checked>否</label>
  </div></fieldset>`;
}

function form() {
  return `<div class="narrow">
    ${heading('请假申请')}
    <form id="application" autocomplete="off">
      <div class="quick-actions">
        <button type="button" class="btn quick-btn" data-template="sick">一键病假</button>
        <button type="button" class="btn quick-btn" data-template="personal">一键事假</button>
      </div>
      <section class="panel application-info"><h2>请假信息</h2>
        <div class="stats"><span>学期 <strong>${currentTerm}</strong></span><span>本学期请假次数 <strong id="term-count">${termCount()}</strong></span></div>
        <div class="form-grid">
          ${field('phone', '个人手机号', '<input id="phone" name="phone" type="tel" inputmode="numeric" pattern="[0-9]{11}" title="请输入 11 位数字" maxlength="11" value="13389734623" required><small data-count="phone"></small>', 'full')}
          ${select('type', '请假类型', ['校内请假', '校外请假'])}
          ${select('category', '事由类型', ['病假', '事假', '其他'])}
          <fieldset class="time-range full" data-time-open="false"><legend>请假时间${star}</legend>
            <button type="button" class="time-trigger" aria-controls="time-inputs" aria-expanded="false" data-empty>请选择</button>
            <div class="time-inputs" id="time-inputs">
            <label>开始时间 <input id="start" name="start" type="datetime-local" required></label>
            <label>结束时间 <input id="end" name="end" type="datetime-local" required></label>
          </div></fieldset>
          <p class="duration-row full">请假时长 <output id="duration" for="start end">0小时0分钟</output></p>
          ${field('reason', '请假原因', '<textarea id="reason" name="reason" maxlength="100" placeholder="请输入请假原因" required></textarea><small data-count="reason"></small>', 'full reason-field')}
          ${field('guardian', '监护人姓名', '<input id="guardian" name="guardian" maxlength="30" placeholder="请输入" required><small data-count="guardian"></small>')}
          ${field('guardianPhone', '监护人电话', '<input id="guardianPhone" name="guardianPhone" type="tel" inputmode="tel" pattern="[0-9\\-]{7,13}" maxlength="13" title="请输入 7 至 13 位数字或短横线" placeholder="例如 00000000000" required><small data-count="guardianPhone"></small>')}
          ${choice('informed', '告知监护人')}
          ${choice('off', '是否离校')}
          <div class="full" id="destination-row" hidden>${field('destination', '外出地点', '<input id="destination" name="destination" maxlength="100" placeholder="请输入外出地点" disabled>')}</div>
        </div>
      </section>
      <p class="notice material-notice">请提交相关证明</p>
      <section class="panel application-material"><h2>请假材料</h2>
        <label class="btn file-picker"><span>选择图片</span><input id="material" aria-label="选择图片" type="file" accept="image/*" multiple></label>
        <div id="uploads" class="upload-list"></div>
      </section>
      <div class="actions footer-actions"><button class="btn primary" id="submit-application">提交</button></div>
    </form>
  </div>`;
}

function pictures(files, removable = false) {
  return files.map((file, index) => `<figure class="attachment">
    <img src="${escapeHtml(file.src)}" alt="${escapeHtml(file.name)}">
    <figcaption>${escapeHtml(file.name)}</figcaption>
    ${removable ? `<button type="button" data-remove="${index}" aria-label="移除${escapeHtml(file.name)}">移除</button>` : ''}
  </figure>`).join('');
}

function details(record) {
  const id = escapeHtml(record.id);
  const guardian = record.id === seed.id ? seed.guardian : record.guardian;
  const closeMethod = record.closeMethod?.replace(/（演练）$/, '');
  return `<div class="narrow details">
    ${heading('请假详情')}
    <div class="panel">
      <ol class="progress" aria-label="办理进度">
        <li class="done">学生</li>
        <li class="${record.status !== 'pending' ? 'done' : ''}">辅导员</li>
        <li class="${record.status === 'closed' ? 'done' : ''}">结束</li>
      </ol>
    </div>
    <p class="detail-status">${badge(record.status)}</p>
    <section class="panel"><h2>请假信息</h2>${metadata([
      ['学期', escapeHtml(record.term)], ['本学期请假次数', record.count],
      ['个人手机号', escapeHtml(record.phone)], ['请假类型', escapeHtml(record.type)],
      ['事由类型', escapeHtml(record.category)], ['请假时间', dateRange(record)],
      ['请假时长', duration(minutes(record.start, record.end))], ['请假原因', escapeHtml(record.reason)],
      ['监护人姓名', escapeHtml(guardian)], ['监护人电话', escapeHtml(record.guardianPhone)],
      ['告知监护人', escapeHtml(record.informed)], ['是否离校', escapeHtml(record.off)],
      ...(record.off === '是' ? [['外出地点', escapeHtml(record.destination)]] : []),
    ])}</section>
    <section class="panel"><h2>请假材料</h2>${record.files.length ? `<div class="upload-list">${pictures(record.files)}</div>` : '<p>暂无材料</p>'}</section>
    <section class="panel"><h2>学生签字</h2>${record.signature ? `<img class="sign-preview" src="${escapeHtml(record.signature)}" alt="学生签字">` : '<p>暂无签字</p>'}</section>
    ${record.status === 'closed' ? `<section class="panel"><h2>销假信息</h2>${metadata([['销假时间', dateText(record.closedAt)], ['销假方式', escapeHtml(closeMethod)]])}</section>` : ''}
    ${record.status !== 'closed' ? `<div class="actions footer-actions"><button class="btn primary" data-transition="${id}">${record.status === 'pending' ? '审批通过' : '销假'}</button></div>` : ''}
  </div>`;
}

async function thumbnail(file) {
  if (!file.type.startsWith('image/') || file.size > 15 * 1024 * 1024) {
    throw new Error('请选择不超过 15 MB 的图片');
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const ratio = Math.min(1, 860 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return {name: file.name, src: canvas.toDataURL('image/jpeg', 0.77)};
  } finally {
    URL.revokeObjectURL(url);
  }
}

function wireForm(application) {
  const controls = application.elements;
  const uploadList = application.querySelector('#uploads');
  const submit = application.querySelector('#submit-application');
  const timeRange = application.querySelector('.time-range');
  const timeToggle = application.querySelector('.time-trigger');
  const attachments = [];
  const updateUploads = () => { uploadList.innerHTML = pictures(attachments, true); };

  function setTimeOpen(open) {
    timeRange.dataset.timeOpen = String(open);
    timeToggle.setAttribute('aria-expanded', String(open));
  }

  function update() {
    for (const counter of application.querySelectorAll('[data-count]')) {
      const input = controls[counter.dataset.count];
      counter.textContent = `${input.value.length}/${input.maxLength}`;
    }
    const total = minutes(controls.start.value, controls.end.value);
    controls.end.setCustomValidity(controls.start.value && controls.end.value && !total ? '结束时间必须晚于开始时间' : '');
    application.querySelector('#duration').textContent = total ? duration(total) : '0小时0分钟';
    const dates = [controls.start.value, controls.end.value].filter(Boolean);
    timeToggle.textContent = dates.length ? dates.map(value => value.replace('T', ' ')).join(' 至 ') : '请选择';
    timeToggle.toggleAttribute('data-empty', dates.length === 0);
    const offCampus = controls.off.value === '是';
    application.querySelector('#destination-row').hidden = !offCampus;
    controls.destination.disabled = !offCampus;
    controls.destination.required = offCampus;
    for (const name of ['reason', 'guardian', 'destination']) {
      const input = controls[name];
      input.setCustomValidity(input.value && !input.value.trim() ? '请填写有效内容' : '');
    }
  }

  const templates = {
    sick: {category: '病假', reason: '生病'},
    personal: {category: '事假', reason: '事假'},
  };

  function applyTemplate(kind) {
    const template = templates[kind];
    if (!template) return;
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    controls.type.value = '校内请假';
    controls.category.value = template.category;
    controls.start.value = `${day}T00:00`;
    controls.end.value = `${day}T23:59`;
    controls.reason.value = template.reason;
    controls.guardian.value = '高女士';
    controls.guardianPhone.value = '13398384611';
    controls.informed.value = '是';
    controls.off.value = '否';
    update();
    announce(`已填入${template.category}模板，请核对后提交`);
  }

  application.querySelectorAll('[data-template]').forEach(button => {
    button.addEventListener('click', () => applyTemplate(button.dataset.template));
  });

  // 请假类型和是否离校联动：改成校外请假，是否离校同步改成是；改回校内，同步改回否
  controls.type.addEventListener('change', () => {
    controls.off.value = controls.type.value === '校外请假' ? '是' : '否';
    update();
  });

  application.addEventListener('input', update);
  application.addEventListener('change', update);
  timeToggle.addEventListener('click', () => setTimeOpen(timeRange.dataset.timeOpen === 'false'));
  timeRange.addEventListener('invalid', () => setTimeOpen(true), true);
  application.addEventListener('click', event => {
    const remove = event.target.closest('[data-remove]');
    if (!remove) return;
    attachments.splice(Number(remove.dataset.remove), 1);
    updateUploads();
  });
  controls.material.addEventListener('change', async () => {
    const selection = [...controls.material.files];
    if (!selection.length) return;
    submit.disabled = true;
    controls.material.disabled = true;
    try {
      if (selection.length + attachments.length > 3) {
        announce('最多可添加 3 张图片');
        return;
      }
      for (const file of selection) {
        try {
          attachments.push(await thumbnail(file));
        } catch {
          announce('图片无法读取，请选择小于 15 MB 的 JPG 或 PNG 图片');
        }
      }
      updateUploads();
    } finally {
      controls.material.value = '';
      controls.material.disabled = false;
      submit.disabled = false;
    }
  });
  application.addEventListener('submit', event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(application));
    delete data.material;
    for (const name of ['reason', 'guardian', 'destination']) data[name] = (data[name] || '').trim();
    confirmApplication(data, attachments);
  });
  // 新增默认模板：打开表单即按常用值预填（时间当天一整天、监护人高女士、告知监护人是）
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  controls.start.value = `${todayStr}T00:00`;
  controls.end.value = `${todayStr}T23:59`;
  controls.guardian.value = '高女士';
  controls.guardianPhone.value = '13398384611';
  controls.informed.value = '是';
  update();
}

function openDialog(title, content, buttons, onConfirm = () => {}) {
  modal.innerHTML = `<h2 id="dialog-title">${title}</h2>${content}<form method="dialog" class="actions">${buttons}</form>`;
  modal.returnValue = '';
  modal.addEventListener('close', () => {
    const choice = modal.returnValue;
    modal.returnValue = '';
    if (choice === 'confirm') onConfirm();
    refreshRecordsView();
  }, {once: true});
  modal.showModal();
}

const titleHintKey = 'leave-title-hint-count-v1';
const TITLE_HINT_MAX = 3;
const usageHelpHtml = `<p class="usage-notice">此项目仅用于学习交流，请勿用于虚假请假、伪造请假证明或冒充正式校务系统。</p>
  <dl class="usage-help">
    <div><dt>方法一</dt><dd>直接在浏览器中打开<a href="https://cju-leave-preview.pages.dev/" class="copy-link" aria-label="点击复制网址">网址</a>。</dd></div>
    <div><dt>方法二（推荐）</dt><dd>在支持此功能的浏览器中：
      <ol class="help-steps">
        <li>打开「分享」或「更多」菜单</li>
        <li>选择「添加到主屏幕」或「创建快捷方式」。</li>
      </ol>
      下次点桌面带有企业微信图标的「请假申请」快捷方式即可打开～</dd></div>
  </dl>
  <p class="usage-tip"><strong>温馨提示：</strong>大陆网络访问时，直接打开这个网址即可；使用科学上网访问本站时，会自动跳转到 Vercel 版本。</p>`;
const githubMarkSvg = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>`;

function starLinksHtml() {
  return `<div class="star-links">
      <a class="btn" href="https://github.com/Nolkee/cju-leave-preview" target="_blank" rel="noopener">★ Star</a>
      <a class="btn" href="https://github.com/Nolkee" target="_blank" rel="noopener">${githubMarkSvg}Follow</a>
    </div>`;
}

function bindStarLinks() {
  modal.querySelectorAll('.star-links a').forEach(link => {
    link.addEventListener('click', () => modal.close());
  });
}

function bonusButtonHtml() {
  return `<button type="button" class="bonus-link" data-bonus>🎁 Bonus</button>`;
}

function bonusPopupHtml(latest) {
  const num = n => (typeof n === 'number' && n > 0 ? String(n) : '—');
  const bonusRank = latest && typeof latest.myBonusRank === 'number' ? latest.myBonusRank : null;
  const visitorRank = latest && typeof latest.myVisitorRank === 'number' ? latest.myVisitorRank : null;
  return `<div class="bonus-result">
    <p>你是</p>
    <p>第 <strong data-bonus-rank>${bonusRank === null ? '…' : num(bonusRank)}</strong> 个点击 Bonus</p>
    <p>第 <strong data-visitor-rank>${visitorRank === null ? '…' : num(visitorRank)}</strong> 个访问此网站</p>
    <p>的 CJUer</p>
    <p class="bonus-visits">这是你第 ${visitCount} 次访问本站</p>
  </div>`;
}

async function openBonusPopup() {
  // 弹窗和彩带一起出现：先开弹窗（数先占位），彩带同步飞，数到了再填
  openDialog('Bonus', bonusPopupHtml(counterTotals),
    '<button value="ok" class="btn primary" autofocus>知道了</button>');
  fireConfetti();
  const data = await callCounter('/bonus');
  const latest = data || counterTotals;
  if (!modal.open) return;
  const setRank = (attr, value) => {
    const el = modal.querySelector(`[data-${attr}]`);
    if (el) el.textContent = (typeof value === 'number' && value > 0) ? String(value) : '—';
  };
  setRank('bonus-rank', latest && latest.myBonusRank);
  setRank('visitor-rank', latest && latest.myVisitorRank);
}

// 彩带飞溅：手写小彩带，不走 CDN，离线也能飞
const confettiCanvas = document.querySelector('#confetti');
let confettiRaf = 0;
function fireConfetti() {
  if (!confettiCanvas || typeof confettiCanvas.showPopover !== 'function') return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  confettiCanvas.width = Math.round(w * dpr);
  confettiCanvas.height = Math.round(h * dpr);
  const ctx = confettiCanvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colors = ['#5c63d7', '#f59e0b', '#ec4899', '#22c55e', '#3b82f6', '#eab308', '#ef4444'];
  const pieces = Array.from({ length: 140 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.7,
    y: h * 0.25 + (Math.random() - 0.5) * 60,
    vx: (Math.random() - 0.5) * 420,
    vy: -Math.random() * 380 - 60,
    size: 5 + Math.random() * 7,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 12,
    circle: Math.random() < 0.5,
  }));
  const start = performance.now();
  const duration = 2800;
  let last = start;
  try { confettiCanvas.showPopover(); } catch {}
  cancelAnimationFrame(confettiRaf);
  (function tick(now) {
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    ctx.clearRect(0, 0, w, h);
    for (const p of pieces) {
      p.vy += 900 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.circle) { ctx.beginPath(); ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      else ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
      ctx.restore();
    }
    if (now - start < duration) {
      confettiRaf = requestAnimationFrame(tick);
    } else {
      try { confettiCanvas.hidePopover(); } catch {}
      ctx.clearRect(0, 0, w, h);
    }
  })(start);
}

function showUsageHelp() {
  try {
    if (localStorage.getItem(usageHelpKey) === '1') return;
  } catch {
    // The help stays available when browser storage is blocked.
  }

  openDialog('使用帮助', usageHelpHtml,
  `${bonusButtonHtml()}<button value="confirm" class="btn">不再提示</button><button value="ok" class="btn primary" autofocus>OK</button>`, 
  () => {
    try {
      localStorage.setItem(usageHelpKey, '1');
    } catch {
      announce('浏览器无法保存「不再提示」设置');
    }
  });
}

function showStarPrompt() {
  openDialog('觉得好用，欢迎点个 Star 或 Follow 我～', starLinksHtml(), 
    `${bonusButtonHtml()}<button value="confirm" class="btn">不再显示</button><button value="ok" class="btn primary" autofocus>知道了</button>`, 
    () => {
      try {
        localStorage.setItem(starPromptKey, '1');
      } catch {
        announce('浏览器无法保存「不再显示」设置');
      }
    });
  bindStarLinks();
}

function showCombinedPopup() {
  // 点顶栏「请假申请」再次打开：使用帮助 + Star / Follow 合在一个框里，只显示 OK
  openDialog('使用帮助', `${usageHelpHtml}
  <div class="star-section">
    <p class="star-heading">觉得好用，欢迎点个 Star 或 Follow 我～</p>
    ${starLinksHtml()}
  </div>`,
  `${bonusButtonHtml()}<button value="ok" class="btn primary" autofocus>OK</button>`);
  bindStarLinks();
}

function hideTitleHint() {
  const hint = document.querySelector('#title-hint');
  const title = document.querySelector('#mobile-title');
  if (hint) { hint.hidden = true; if (hint._timer) clearTimeout(hint._timer); }
  if (title) title.classList.remove('title-pulse');
}

function showTitleHint() {
  // 提醒动画只在最初打开网站的前 3 次显示
  let count = 0;
  try { count = Number(localStorage.getItem(titleHintKey) || '0') || 0; } catch {}
  if (count >= TITLE_HINT_MAX) return;
  try { localStorage.setItem(titleHintKey, String(count + 1)); } catch {}
  const hint = document.querySelector('#title-hint');
  const title = document.querySelector('#mobile-title');
  if (!hint || !title) return;
  hint.hidden = false;
  title.classList.add('title-pulse');
  hint._timer = setTimeout(hideTitleHint, 6000);
}

function confirmApplication(data, files) {
  let signed = false;
  openDialog('确认提交', `<p class="helper">学生签字（选填）</p><canvas id="signature" width="840" height="280" aria-label="学生签字区"></canvas><button type="button" class="btn" id="clear-signature">清空签字</button>`,
    '<button value="cancel" class="btn" autofocus>继续填写</button><button value="confirm" class="btn primary">确认提交</button>', async () => {
      const id = `practice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const saved = await updateRecords(items => [{
        ...data, id, endTimestamp: Date.parse(data.end),
        term: currentTerm, count: termCount(items) + 1,
        files: [...files], signature: signed ? canvas.toDataURL() : '', status: 'pending',
      }, ...items]);
      announceChange('请假申请已提交', saved);
      location.hash = `detail/${id}`;
    });
  const canvas = modal.querySelector('canvas');
  const context = canvas.getContext('2d');
  context.strokeStyle = '#15192d';
  context.lineWidth = 5;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  let pointer;
  const point = event => {
    const box = canvas.getBoundingClientRect();
    return [(event.clientX - box.left) * canvas.width / box.width, (event.clientY - box.top) * canvas.height / box.height];
  };
  canvas.addEventListener('pointerdown', event => {
    if (pointer !== undefined || event.button !== 0) return;
    pointer = event.pointerId;
    canvas.setPointerCapture(pointer);
    const [x, y] = point(event);
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + 0.1, y + 0.1);
    context.stroke();
    signed = true;
  });
  canvas.addEventListener('pointermove', event => {
    if (pointer !== event.pointerId) return;
    const [x, y] = point(event);
    context.lineTo(x, y);
    context.stroke();
    context.beginPath();
    context.moveTo(x, y);
  });
  canvas.addEventListener('lostpointercapture', () => { pointer = undefined; });
  modal.querySelector('#clear-signature').addEventListener('click', () => {
    context.clearRect(0, 0, canvas.width, canvas.height);
    signed = false;
  });
}

function render(restoreFocus = false) {
  const [requestedPage, id] = location.hash.slice(1).split('/');
  const record = records.find(item => item.id === id);
  const page = requestedPage === 'apply' ? 'apply' : requestedPage === 'detail' && record ? 'detail' : 'records';
  screen.innerHTML = page === 'apply' ? form() : page === 'detail' ? details(record) : list();
  screen.dataset.page = page;
  renderedRecords = records;
  const title = screen.querySelector('h1');
  document.title = title.textContent;
  document.querySelector('#mobile-title').textContent = title.textContent;
  document.querySelector('#mobile-back').hidden = false;
  const application = screen.querySelector('#application');
  if (application) wireForm(application);
  if (restoreFocus) {
    window.scrollTo(0, 0);
    title.focus({preventScroll: true});
  }
}

function refreshRecordsView() {
  if (modal.open || !screen.dataset.page || renderedRecords === records) return;
  if (screen.dataset.page !== 'apply') {
    render();
    return;
  }
  screen.querySelector('#term-count').textContent = termCount();
  renderedRecords = records;
}

screen.addEventListener('click', event => {
  const button = event.target.closest('[data-delete], [data-proof], [data-transition]');
  if (!button) return;
  const record = records.find(item => item.id === (button.dataset.delete || button.dataset.proof || button.dataset.transition));
  if (!record) return;
  if (button.dataset.delete) {
    const options = button.closest('.record-options');
    options.querySelector('summary').focus({preventScroll: true});
    options.open = false;
    openDialog('删除请假记录', `<p class="helper">确定删除「${escapeHtml(record.reason)}」及其附件和签字？删除后无法恢复。</p>`,
      '<button value="cancel" class="btn" autofocus>取消</button><button value="confirm" class="btn danger confirm-danger">确认删除</button>', async () => {
        const saved = await updateRecords(items => {
          const remaining = items.filter(item => item.id !== record.id);
          return remaining.length === items.length ? items : remaining;
        });
        announceChange('请假记录已删除', saved);
      });
    return;
  }
  if (button.dataset.proof) {
    openDialog('请假证明预览', `<p class="notice">仅供预览 · 无证明效力</p><div class="proof">${metadata([
      ['学生', '林同学'], ['类型', escapeHtml(record.type)],
      ['时间', `${dateText(record.start)} 至 ${dateText(record.end)}`], ['状态', statusText[record.status]],
    ])}</div>`, '<button value="cancel" class="btn primary" autofocus>关闭</button>');
    return;
  }
  const pending = record.status === 'pending';
  const action = pending ? '审批通过' : '销假';
  openDialog(action, `<p class="helper">${pending ? '审批通过后，将在请假结束时自动销假。' : '确认后，这条请假申请将标记为已销假。'}</p>`,
    '<button value="cancel" class="btn" autofocus>取消</button><button value="confirm" class="btn primary">确认</button>', async () => {
      const saved = await updateRecords(items => {
        if (!items.some(item => item.id === record.id && item.status === record.status)) return items;
        return items.map(item => {
          if (item.id !== record.id) return item;
          return pending ? {...item, status: 'approved'} : {...item, status: 'closed', closedAt: nowLocal(), closeMethod: '学生手动销假'};
        });
      });
      const updated = records.find(item => item.id === record.id);
      if (updated) {
        const message = pending && updated.status === 'approved' ? '审批已通过' : '销假已完成';
        announceChange(message, saved);
      }
    });
});

function closeRecordOptionsOutside(event) {
  for (const options of screen.querySelectorAll('.record-options[open]')) {
    if (!options.contains(event.target)) options.open = false;
  }
}

document.addEventListener('click', closeRecordOptionsOutside);
document.addEventListener('focusin', closeRecordOptionsOutside);
screen.addEventListener('keydown', event => {
  const options = event.target.closest('.record-options[open]');
  if (event.key !== 'Escape' || !options) return;
  event.preventDefault();
  options.open = false;
  options.querySelector('summary').focus({preventScroll: true});
});

window.addEventListener('hashchange', () => {
  if (modal.open) modal.close();
  render(true);
  void updateRecords();
});
window.addEventListener('pageshow', () => { void updateRecords(); });
window.addEventListener('storage', event => {
  if (event.key === storageKey || event.key === null) void updateRecords();
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) void updateRecords();
});
document.querySelector('#mobile-close').addEventListener('click', () => {
  // 浏览器标签页一般不允许脚本直接关闭，关不掉就回首页
  window.close();
  setTimeout(() => { location.hash = '#records'; }, 300);
});
document.querySelector('#mobile-title').addEventListener('click', () => {
  hideTitleHint();
  showCombinedPopup();
});

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

// 使用帮助里的「网址」链接：点一下就复制网址，不跳转
modal.addEventListener('click', async event => {
  const link = event.target.closest('.copy-link');
  if (!link) return;
  event.preventDefault();
  const ok = await copyText(link.href);
  announce(ok ? '网址已复制' : '复制失败，请长按链接复制');
});

// Bonus 按钮在弹窗里：先关当前弹窗再开 Bonus 框，彩带先飞
modal.addEventListener('click', event => {
  if (!event.target.closest('[data-bonus]')) return;
  modal.close();
  openBonusPopup();
});
void updateRecords().then(() => {
  adoptVidFromUrl();
  countVisit();
  callCounter('/visit');
  render();
  // 打开界面先弹使用说明，点完 OK 或「不再提示」之后再弹 Star / Follow，两个都关掉就到主界面；
  // Star 点了「不再显示」后以后不再弹
  let helpDismissed = false;
  let starDismissed = false;
  try {
    helpDismissed = localStorage.getItem(usageHelpKey) === '1';
    starDismissed = localStorage.getItem(starPromptKey) === '1';
  } catch {}
  if (starDismissed) {
    if (helpDismissed) {
      showTitleHint();
    } else {
      showUsageHelp();
      modal.addEventListener('close', () => showTitleHint(), { once: true });
    }
    return;
  }
  if (helpDismissed) {
    showStarPrompt();
    modal.addEventListener('close', () => showTitleHint(), { once: true });
  } else {
    showUsageHelp();
    modal.addEventListener('close', () => {
      showStarPrompt();
      modal.addEventListener('close', () => showTitleHint(), { once: true });
    }, { once: true });
  }
});
