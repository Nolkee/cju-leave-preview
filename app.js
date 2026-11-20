'use strict';

const screen = document.querySelector('#screen');
const modal = document.querySelector('#modal');
const toast = document.querySelector('#toast');
const storageKey = 'leave-practice-records-v1';
const currentTerm = '2026–2027学年第1学期';
const seed = {
  id: 'example', term: '2025–2026学年第1学期', phone: '00000000000',
  type: '校内请假', category: '病假', start: '2025-12-15T03:23', end: '2025-12-15T12:00',
  reason: '身体不适', guardian: '林先生', guardianPhone: '00000000000',
  informed: '是', off: '否', destination: '', files: [], signature: '', count: 1,
  status: 'closed', closedAt: '2025-12-15T19:53:42', closeMethod: '自动销假',
};
const statusText = {pending: '待审批', approved: '未销假', closed: '已销假'};
let records = [seed];
let toastTimer;
let expirationTimer;
let storageSnapshot;
let renderedRecords;

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
  toastTimer = setTimeout(() => { toast.textContent = ''; }, 3600);
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
      <section class="panel application-info"><h2>请假信息</h2>
        <div class="stats"><span>学期 <strong>${currentTerm}</strong></span><span>本学期请假次数 <strong id="term-count">${termCount()}</strong></span></div>
        <div class="form-grid">
          ${field('phone', '个人手机号', '<input id="phone" name="phone" type="tel" inputmode="numeric" pattern="[0-9]{11}" title="请输入 11 位数字" maxlength="11" value="00000000000" required><small data-count="phone"></small>', 'full')}
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
  document.querySelector('#mobile-back').hidden = page === 'records';
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
void updateRecords().then(() => render());
