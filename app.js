'use strict';

const screen = document.querySelector('#screen');
const modal = document.querySelector('#modal');
const toast = document.querySelector('#toast');
const storageKey = 'leave-practice-records-v1';
const currentTerm = '2026–2027学年第1学期';
const seed = {
  id: 'example', term: '2025–2026学年第1学期', phone: '00000000000',
  type: '校内请假', category: '病假', start: '2025-12-15T03:23', end: '2025-12-15T12:00',
  reason: '身体不适', guardian: '演示监护人', guardianPhone: '00000000000',
  informed: '是', off: '否', destination: '', files: [], signature: '', count: 1,
  status: 'closed', closedAt: '2025-12-15T19:53:42', closeMethod: '自动销假',
};
const statusText = {pending: '待审批', approved: '未销假', closed: '已销假'};
let records = [seed];
let toastTimer;

try {
  const saved = JSON.parse(localStorage.getItem(storageKey));
  if (Array.isArray(saved)) records = saved;
} catch {
  // The example remains usable when storage is unavailable.
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

function save(next, message) {
  records = next;
  try {
    localStorage.setItem(storageKey, JSON.stringify(records));
    announce(message);
  } catch {
    announce(`${message}。浏览器存储不可用，刷新后将丢失本次操作。`);
  }
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

function nowLocal() {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 19);
}

function heading(title, back, subtitle = '') {
  return `<div class="page-head">
    <a class="back" href="#${back === '用户大厅' ? 'home' : 'records'}">返回${back}</a>
    <h1 tabindex="-1">${title}</h1>${subtitle ? `<p class="helper">${subtitle}</p>` : ''}
  </div>`;
}

function metadata(items) {
  return `<dl class="meta">${items.map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
}

function badge(status) {
  return `<span class="status ${status === 'pending' ? 'pending' : ''}">${statusText[status]}</span>`;
}

function home() {
  return `<section class="hero">
    <div><span class="eyebrow">学生事务</span><h1 tabindex="-1">用户大厅</h1><p>在浏览器中练习提交请假、查看审批和销假。</p></div>
    ${studentCard()}
  </section>
  <div class="home-grid">
    ${leaveEntry('常用功能')}
    <section class="panel">
      <div class="notice-tabs" aria-label="消息分类">
        <button type="button" data-message="notice" aria-pressed="true">通知事项</button>
        <button type="button" data-message="tasks" aria-pressed="false">待办事项</button>
        <button type="button" data-message="announcements" aria-pressed="false">公示事项</button>
      </div>
      <div id="message-panel" aria-live="polite">${homeMessage('notice')}</div>
    </section>
  </div>`;
}

function homeMessage(type) {
  if (type === 'notice') return '<h3>演练说明</h3><p>填写演示资料即可体验流程。申请记录和材料保存在当前浏览器。</p>';
  if (type === 'announcements') return '<p>暂无演练公示</p>';
  const pending = records.filter(record => record.status === 'pending').length;
  return pending ? `<p>有 ${pending} 条演练申请待审批。</p><a class="back" href="#records">查看请假记录</a>` : '<p>暂无待办事项</p>';
}

function studentCard() {
  return `<div class="student">
    <div class="student-top"><span class="avatar" aria-hidden="true">林</span><div><strong>林同学</strong><br><small>演示学生</small></div></div>
    <dl><div><dt>学号</dt><dd>DEMO-2404</dd></div><div><dt>班级</dt><dd>计算机 2404 班</dd></div></dl>
  </div>`;
}

function leaveEntry(title) {
  return `<section class="panel"><h2>${title}</h2><a class="home-entry" href="#records" aria-label="进入请假">
    <span class="tile-icon" aria-hidden="true"></span><div><h3>请假申请</h3><p>查看记录或发起一条新申请</p></div><span class="btn primary" aria-hidden="true">进入请假</span>
  </a></section>`;
}

function mobileTabs(page) {
  return `<nav class="mobile-tabs" aria-label="大厅导航">${[
    ['home', '首页'], ['functions', '功能列表'], ['profile', '个人中心'],
  ].map(([route, title]) => `<a href="#${route}"${route === page ? ' aria-current="page"' : ''}>${title}</a>`).join('')}</nav>`;
}

function list() {
  const total = records.reduce((sum, record) => sum + minutes(record.start, record.end), 0);
  const cards = records.map(record => {
    const id = escapeHtml(record.id);
    return `<article class="record">
      <h2>${escapeHtml(record.reason)}</h2>
      <div class="record-body">${badge(record.status)}${metadata([
        ['请假类型', escapeHtml(record.type)],
        ['请假时间', `${dateText(record.start)} 至<br>${dateText(record.end)}`],
        ['外出地点', record.off === '是' ? escapeHtml(record.destination) : '未离校'],
      ])}</div>
      <div class="actions">
        <a class="btn" href="#detail/${id}" aria-label="查看${escapeHtml(record.reason)}的请假详情">查看</a>
        ${record.status === 'pending' ? '' : `<button class="btn" data-proof="${id}">请假证明</button>`}
      </div>
    </article>`;
  }).join('');
  return `<div class="narrow leave-list">
    ${heading('请假申请', '用户大厅')}
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
  const count = records.filter(record => record.term === currentTerm).length;
  return `<div class="narrow">
    ${heading('请假申请', '请假记录')}
    <form id="application" autocomplete="off">
      <section class="panel application-info"><h2>请假信息</h2>
        <div class="stats"><span>学期 <strong>${currentTerm}</strong></span><span>本学期请假次数 <strong>${count}</strong></span></div>
        <div class="form-grid">
          ${field('phone', '个人手机号', '<input id="phone" name="phone" type="tel" inputmode="numeric" pattern="[0-9]{11}" title="请输入 11 位数字" maxlength="11" value="00000000000" required><small data-count="phone"></small>', 'full')}
          ${select('type', '请假类型', ['校内请假', '校外请假'])}
          ${select('category', '事由类型', ['病假', '事假', '其他'])}
          <fieldset class="time-range full" data-time-open="false"><legend>请假时间${star}</legend>
            <button type="button" class="time-trigger" aria-controls="time-inputs" aria-expanded="false">请选择</button>
            <div class="time-inputs" id="time-inputs">
            <label>开始时间 <input id="start" name="start" type="datetime-local" required></label>
            <label>结束时间 <input id="end" name="end" type="datetime-local" required></label>
          </div></fieldset>
          <p class="duration-row full">请假时长 <output id="duration" for="start end">0小时0分钟</output></p>
          ${field('reason', '请假原因', '<textarea id="reason" name="reason" maxlength="100" placeholder="请输入请假原因" required></textarea><small data-count="reason"></small>', 'full reason-field')}
          ${field('guardian', '监护人姓名', '<input id="guardian" name="guardian" maxlength="30" placeholder="请输入演示姓名" required><small data-count="guardian"></small>')}
          ${field('guardianPhone', '监护人电话', '<input id="guardianPhone" name="guardianPhone" type="tel" inputmode="tel" pattern="[0-9\\-]{7,13}" maxlength="13" title="请输入 7 至 13 位数字或短横线" placeholder="例如 00000000000" required><small data-count="guardianPhone"></small>')}
          ${choice('informed', '告知监护人')}
          ${choice('off', '是否离校')}
          <div class="full" id="destination-row" hidden>${field('destination', '外出地点', '<input id="destination" name="destination" maxlength="100" placeholder="请输入外出地点" disabled>')}</div>
        </div>
      </section>
      <section class="panel application-material"><h2>请假材料</h2>
        <p class="notice">请提交相关证明。演练时可添加图片，也可跳过。</p>
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
  return `<div class="narrow details">
    ${heading('请假详情', '请假记录')}
    <section class="panel"><div class="split"><h2 style="margin:0">办理进度</h2>${badge(record.status)}</div>
      <ol class="progress"><li class="done">学生已提交</li><li class="${record.status !== 'pending' ? 'done' : ''}">${record.status === 'pending' ? '辅导员审批' : '模拟审批通过'}</li><li class="${record.status === 'closed' ? 'done' : ''}">${record.status === 'closed' ? '已销假' : '结束'}</li></ol>
    </section>
    <section class="panel"><h2>请假信息</h2>${metadata([
      ['学期', escapeHtml(record.term)], ['本学期请假次数', record.count],
      ['个人手机号', escapeHtml(record.phone)], ['请假类型', escapeHtml(record.type)],
      ['事由类型', escapeHtml(record.category)], ['请假时间', `${dateText(record.start)} 至 ${dateText(record.end)}`],
      ['请假时长', duration(minutes(record.start, record.end))], ['请假原因', escapeHtml(record.reason)],
      ['监护人姓名', escapeHtml(record.guardian)], ['监护人电话', escapeHtml(record.guardianPhone)],
      ['告知监护人', escapeHtml(record.informed)], ['是否离校', escapeHtml(record.off)],
      ...(record.off === '是' ? [['外出地点', escapeHtml(record.destination)]] : []),
    ])}</section>
    <section class="panel"><h2>请假材料</h2>${record.files.length ? `<div class="upload-list">${pictures(record.files)}</div>` : '<p>暂无材料</p>'}</section>
    <section class="panel"><h2>学生签字</h2>${record.signature ? `<img class="sign-preview" src="${escapeHtml(record.signature)}" alt="学生演练签字">` : '<p>暂无签字</p>'}</section>
    ${record.status === 'closed' ? `<section class="panel"><h2>销假信息</h2>${metadata([['销假时间', dateText(record.closedAt)], ['销假方式', escapeHtml(record.closeMethod)]])}</section>` : ''}
    ${record.status !== 'closed' ? `<div class="actions footer-actions"><button class="btn primary" data-transition="${id}">${record.status === 'pending' ? '模拟审批通过' : '模拟销假'}</button></div>` : ''}
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
  }, {once: true});
  modal.showModal();
}

function confirmApplication(data, files) {
  let signed = false;
  openDialog('确认提交', `<p class="helper">学生签字（选填）</p><canvas id="signature" width="840" height="280" aria-label="学生签字区"></canvas><button type="button" class="btn" id="clear-signature">清空签字</button>`,
    '<button value="cancel" class="btn" autofocus>继续填写</button><button value="confirm" class="btn primary">确认提交</button>', () => {
      const record = {
        ...data, id: `practice-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        term: currentTerm, count: records.filter(item => item.term === currentTerm).length + 1,
        files: [...files], signature: signed ? canvas.toDataURL() : '', status: 'pending',
      };
      save([record, ...records], '演练申请已提交');
      location.hash = `detail/${record.id}`;
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
  const page = ['home', 'functions', 'profile', 'records', 'apply', 'detail'].includes(requestedPage) ? requestedPage : 'home';
  const homeScreen = ['home', 'functions', 'profile'].includes(page);
  const views = {
    home, functions: () => `${heading('功能列表', '用户大厅')}${leaveEntry('学生事务')}`,
    profile: () => `${heading('个人中心', '用户大厅')}${studentCard()}`,
    records: list, apply: form, detail: () => record ? details(record) : list(),
  };
  screen.innerHTML = views[page]() + (homeScreen ? mobileTabs(page) : '');
  screen.dataset.page = page;
  const title = screen.querySelector('h1');
  document.title = `${title.textContent} · 请假练习台`;
  document.querySelector('#mobile-title').textContent = title.textContent;
  const mobileBack = document.querySelector('#mobile-back');
  mobileBack.hidden = homeScreen;
  mobileBack.href = page === 'records' ? '#home' : '#records';
  document.querySelectorAll('[data-nav]').forEach(link => {
    if (link.dataset.nav === (homeScreen ? 'home' : 'records')) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const application = screen.querySelector('#application');
  if (application) wireForm(application);
  if (restoreFocus) {
    window.scrollTo(0, 0);
    title.focus({preventScroll: true});
  }
}

screen.addEventListener('click', event => {
  const message = event.target.closest('[data-message]');
  if (message) {
    screen.querySelectorAll('[data-message]').forEach(button => button.setAttribute('aria-pressed', String(button === message)));
    screen.querySelector('#message-panel').innerHTML = homeMessage(message.dataset.message);
    return;
  }
  const button = event.target.closest('[data-proof], [data-transition]');
  if (!button) return;
  const record = records.find(item => item.id === (button.dataset.proof || button.dataset.transition));
  if (!record) return;
  if (button.dataset.proof) {
    openDialog('请假证明预览', `<p class="notice">仅供演练 · 无证明效力</p><div class="proof">${metadata([
      ['学生', '林同学（演示）'], ['类型', escapeHtml(record.type)],
      ['时间', `${dateText(record.start)} 至 ${dateText(record.end)}`], ['状态', statusText[record.status]],
    ])}</div>`, '<button value="cancel" class="btn primary" autofocus>关闭</button>');
    return;
  }
  const pending = record.status === 'pending';
  const action = pending ? '模拟审批通过' : '模拟销假';
  openDialog(action, `<p class="helper">${pending ? '确认后，这条演练申请将进入未销假状态。' : '确认后，这条演练申请将标记为已销假。'}</p>`,
    '<button value="cancel" class="btn" autofocus>取消</button><button value="confirm" class="btn primary">确认</button>', () => {
      const updated = pending ? {...record, status: 'approved'} : {...record, status: 'closed', closedAt: nowLocal(), closeMethod: '学生手动销假（演练）'};
      save(records.map(item => item.id === record.id ? updated : item), pending ? '演练审批已通过' : '演练销假已完成');
      render(true);
    });
});

window.addEventListener('hashchange', () => {
  if (modal.open) modal.close();
  render(true);
});
render();
