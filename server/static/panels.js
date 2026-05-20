let _currentPanel = 'chat';
let _skillsData = null; // cached skills list

async function switchPanel(name) {
  _currentPanel = name;
  // Skills, Memory, Profiles are now in Settings panel
  if (['skills', 'memory', 'profiles'].includes(name)) {
    toggleSettings();
    return;
  }
  // Update nav tabs (icon nav only - mobile removed)
  document.querySelectorAll('.nav-tab, .icon-nav-btn').forEach(t => {
    if (t.dataset.panel) {
      t.classList.toggle('active', t.dataset.panel === name);
    }
  });
  // Update panel views
  document.querySelectorAll('.panel-view').forEach(p => p.classList.remove('active'));
  const panelEl = $('panel' + name.charAt(0).toUpperCase() + name.slice(1));
  if (panelEl) panelEl.classList.add('active');

  // Lazy-load panel data
  if (name === 'tasks') await loadCrons();
  if (name === 'workspaces') await loadWorkspacesPanel();
  if (name === 'todos') loadTodos();
  if (name === 'billing') await loadBillingPanel();
  if (name === 'assets') await loadAssetsPanel();
}

// ── Cron panel ──
async function loadCrons() {
  const box = $('cronList');
  try {
    const data = await api('/api/crons');
    if (!data.jobs || !data.jobs.length) {
      box.innerHTML = `<div style="padding:16px;color:var(--muted);font-size:12px">${esc(t('cron_no_jobs'))}</div>`;
      return;
    }
    box.innerHTML = '';
    for (const job of data.jobs) {
      const item = document.createElement('div');
      item.className = 'cron-item';
      item.id = 'cron-' + job.id;
      const statusClass = job.enabled === false ? 'disabled' : job.state === 'paused' ? 'paused' : job.last_status === 'error' ? 'error' : 'active';
      const statusLabel = job.enabled === false ? t('cron_status_off') : job.state === 'paused' ? t('cron_status_paused') : job.last_status === 'error' ? t('cron_status_error') : t('cron_status_active');
      const nextRun = job.next_run_at ? new Date(job.next_run_at).toLocaleString() : t('not_available');
      const lastRun = job.last_run_at ? new Date(job.last_run_at).toLocaleString() : t('never');
      item.innerHTML = `
        <div class="cron-header" onclick="toggleCron('${job.id}')">
          <span class="cron-name" title="${esc(job.name)}">${esc(job.name)}</span>
          <span class="cron-status ${statusClass}">${statusLabel}</span>
        </div>
        <div class="cron-body" id="cron-body-${job.id}">
          <div class="cron-schedule">${li('clock',12)} ${esc(job.schedule_display || job.schedule?.expression || '')} &nbsp;|&nbsp; ${esc(t('cron_next'))}: ${esc(nextRun)} &nbsp;|&nbsp; ${esc(t('cron_last'))}: ${esc(lastRun)}</div>
          <div class="cron-prompt">${esc((job.prompt||'').slice(0,300))}${(job.prompt||'').length>300?'…':''}</div>
          <div class="cron-actions">
            <button class="cron-btn run" onclick="cronRun('${job.id}')">${li('play',12)} ${esc(t('cron_run_now'))}</button>
            ${job.state==='paused'
              ? `<button class="cron-btn" onclick="cronResume('${job.id}')">${li('play',12)} ${esc(t('cron_resume'))}</button>`
              : `<button class="cron-btn pause" onclick="cronPause('${job.id}')">${li('pause',12)} ${esc(t('cron_pause'))}</button>`}
            <button class="cron-btn" onclick="cronEditOpen('${job.id}',${JSON.stringify(job).replace(/"/g,'&quot;')})">${li('pencil',12)} ${esc(t('edit'))}</button>
            <button class="cron-btn" style="border-color:rgba(201,168,76,.3);color:var(--accent)" onclick="cronDelete('${job.id}')">${li('trash-2',12)} ${esc(t('delete_title'))}</button>
          </div>
          <!-- Inline edit form, hidden by default -->
          <div id="cron-edit-${job.id}" style="display:none;margin-top:8px;border-top:1px solid var(--border);padding-top:8px">
            <input id="cron-edit-name-${job.id}" placeholder="${esc(t('cron_job_name_placeholder'))}" style="width:100%;background:rgba(255,255,255,.05);border:1px solid var(--border2);border-radius:6px;color:var(--text);padding:5px 8px;font-size:12px;outline:none;margin-bottom:5px;box-sizing:border-box">
            <input id="cron-edit-schedule-${job.id}" placeholder="${esc(t('cron_schedule_placeholder'))}" style="width:100%;background:rgba(255,255,255,.05);border:1px solid var(--border2);border-radius:6px;color:var(--text);padding:5px 8px;font-size:12px;outline:none;margin-bottom:5px;box-sizing:border-box">
            <textarea id="cron-edit-prompt-${job.id}" rows="3" placeholder="${esc(t('cron_prompt_placeholder'))}" style="width:100%;background:rgba(255,255,255,.05);border:1px solid var(--border2);border-radius:6px;color:var(--text);padding:5px 8px;font-size:12px;outline:none;resize:none;font-family:inherit;margin-bottom:5px;box-sizing:border-box"></textarea>
            <div id="cron-edit-err-${job.id}" style="font-size:11px;color:var(--accent);display:none;margin-bottom:5px"></div>
            <div style="display:flex;gap:6px">
              <button class="cron-btn run" style="flex:1" onclick="cronEditSave('${job.id}')">${esc(t('save'))}</button>
              <button class="cron-btn" style="flex:1" onclick="cronEditClose('${job.id}')">${esc(t('cancel'))}</button>
            </div>
          </div>
          <div id="cron-output-${job.id}">
            <div class="cron-last-header" style="display:flex;align-items:center;justify-content:space-between">
              <span>${esc(t('cron_last_output'))}</span>
              <button class="cron-btn" style="padding:1px 8px;font-size:10px" onclick="loadCronHistory('${job.id}',this)">${esc(t('cron_all_runs'))}</button>
            </div>
            <div class="cron-last" id="cron-out-text-${job.id}" style="color:var(--muted);font-size:11px">${esc(t('loading'))}</div>
            <div id="cron-history-${job.id}" style="display:none"></div>
          </div>
        </div>`;
      box.appendChild(item);
      // Eagerly load last output for visible items
      loadCronOutput(job.id);
    }
  } catch(e) { box.innerHTML = `<div style="padding:12px;color:var(--accent);font-size:12px">${esc(t('error_prefix'))}${esc(e.message)}</div>`; }
}

let _cronSelectedSkills=[];
let _cronSkillsCache=null;

function toggleCronForm(){
  const form=$('cronCreateForm');
  if(!form)return;
  const open=form.style.display!=='none';
  form.style.display=open?'none':'';
  if(!open){
    $('cronFormName').value='';
    $('cronFormSchedule').value='';
    $('cronFormPrompt').value='';
    $('cronFormDeliver').value='local';
    $('cronFormError').style.display='none';
    _cronSelectedSkills=[];
    _renderCronSkillTags();
    const search=$('cronFormSkillSearch');
    if(search)search.value='';
    // Always re-fetch skills to avoid stale cache
    _cronSkillsCache=null;
    api('/api/skills').then(d=>{_cronSkillsCache=d.skills||[];}).catch(()=>{});
    $('cronFormName').focus();
  }
}

function _renderCronSkillTags(){
  const wrap=$('cronFormSkillTags');
  if(!wrap)return;
  wrap.innerHTML='';
  for(const name of _cronSelectedSkills){
    const tag=document.createElement('span');
    tag.className='skill-tag';
    tag.dataset.skill=name;
    const rm=document.createElement('span');
    rm.className='remove-tag';rm.textContent='×';
    rm.onclick=()=>{_cronSelectedSkills=_cronSelectedSkills.filter(s=>s!==name);tag.remove();};
    tag.appendChild(document.createTextNode(name));
    tag.appendChild(rm);
    wrap.appendChild(tag);
  }
}

// Skill search input handler
(function(){
  const setup=()=>{
    const search=$('cronFormSkillSearch');
    const dropdown=$('cronFormSkillDropdown');
    if(!search||!dropdown)return;
    search.oninput=()=>{
      const q=search.value.trim().toLowerCase();
      if(!q||!_cronSkillsCache){dropdown.style.display='none';return;}
      const matches=_cronSkillsCache.filter(s=>
        !_cronSelectedSkills.includes(s.name)&&
        (s.name.toLowerCase().includes(q)||(s.category||'').toLowerCase().includes(q))
      ).slice(0,8);
      if(!matches.length){dropdown.style.display='none';return;}
      dropdown.innerHTML='';
      for(const s of matches){
        const opt=document.createElement('div');
        opt.className='skill-opt';
        opt.textContent=s.name+(s.category?' ('+s.category+')':'');
        opt.onclick=()=>{
          _cronSelectedSkills.push(s.name);
          _renderCronSkillTags();
          search.value='';
          dropdown.style.display='none';
        };
        dropdown.appendChild(opt);
      }
      dropdown.style.display='';
    };
    search.onblur=()=>setTimeout(()=>{dropdown.style.display='none';},150);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);
  else setTimeout(setup,0);
})();

async function submitCronCreate(){
  const name=$('cronFormName').value.trim();
  const schedule=$('cronFormSchedule').value.trim();
  const prompt=$('cronFormPrompt').value.trim();
  const deliver=$('cronFormDeliver').value;
  const errEl=$('cronFormError');
  errEl.style.display='none';
  if(!schedule){errEl.textContent=t('cron_schedule_required_example');errEl.style.display='';return;}
  if(!prompt){errEl.textContent=t('cron_prompt_required');errEl.style.display='';return;}
  try{
    const body={schedule,prompt,deliver};
    if(name)body.name=name;
    if(_cronSelectedSkills.length)body.skills=_cronSelectedSkills;
    await api('/api/crons/create',{method:'POST',body:JSON.stringify(body)});
    toggleCronForm();
    showToast(t('cron_job_created'));
    await loadCrons();
  }catch(e){
    errEl.textContent=t('error_prefix')+e.message;errEl.style.display='';
  }
}

function _cronOutputSnippet(content) {
  // Extract the response body from a cron output .md file
  const lines = content.split('\n');
  const responseIdx = lines.findIndex(l => l.startsWith('## Response') || l.startsWith('# Response'));
  const body = (responseIdx >= 0 ? lines.slice(responseIdx + 1) : lines).join('\n').trim();
  return body.slice(0, 600) || '(empty)';
}

async function loadCronOutput(jobId) {
  try {
    const data = await api(`/api/crons/output?job_id=${encodeURIComponent(jobId)}&limit=1`);
    const el = $('cron-out-text-' + jobId);
    if (!el) return;
    if (!data.outputs || !data.outputs.length) { el.textContent = t('cron_no_runs_yet'); return; }
    const out = data.outputs[0];
    const ts = out.filename.replace('.md','').replace(/_/g,' ');
    el.textContent = ts + '\n\n' + _cronOutputSnippet(out.content);
  } catch(e) { /* ignore */ }
}

async function loadCronHistory(jobId, btn) {
  const histEl = $('cron-history-' + jobId);
  if (!histEl) return;
  // Toggle: if already open, close it
  if (histEl.style.display !== 'none') {
    histEl.style.display = 'none';
    if (btn) btn.textContent = t('cron_all_runs');
    return;
  }
  if (btn) btn.textContent = t('loading');
  try {
    const data = await api(`/api/crons/output?job_id=${encodeURIComponent(jobId)}&limit=20`);
    if (!data.outputs || !data.outputs.length) {
      histEl.innerHTML = `<div style="font-size:11px;color:var(--muted);padding:4px 0">${esc(t('cron_no_runs_yet'))}</div>`;
    } else {
      histEl.innerHTML = data.outputs.map((out, i) => {
        const ts = out.filename.replace('.md','').replace(/_/g,' ');
        const snippet = _cronOutputSnippet(out.content);
        const id = `cron-hist-run-${jobId}-${i}`;
        return `<div style="border-top:1px solid var(--border);padding:6px 0">
          <div style="display:flex;align-items:center;justify-content:space-between;cursor:pointer" onclick="document.getElementById('${id}').style.display=document.getElementById('${id}').style.display==='none'?'':'none'">
            <span style="font-size:11px;font-weight:600;color:var(--muted)">${esc(ts)}</span>
            <span style="font-size:10px;color:var(--muted);opacity:.6">▸</span>
          </div>
          <div id="${id}" style="display:none;font-size:11px;color:var(--muted);white-space:pre-wrap;line-height:1.5;margin-top:4px;max-height:200px;overflow-y:auto">${esc(snippet)}</div>
        </div>`;
      }).join('');
    }
    histEl.style.display = '';
    if (btn) btn.textContent = t('cron_hide_runs');
  } catch(e) {
    if (btn) btn.textContent = t('cron_all_runs');
  }
}

function toggleCron(id) {
  const body = $('cron-body-' + id);
  if (body) body.classList.toggle('open');
}

async function cronRun(id) {
  try {
    await api('/api/crons/run', {method:'POST', body: JSON.stringify({job_id: id})});
    showToast(t('cron_job_triggered'));
    setTimeout(() => loadCronOutput(id), 5000);
  } catch(e) { showToast(t('failed_colon') + e.message, 4000); }
}

async function cronPause(id) {
  try {
    await api('/api/crons/pause', {method:'POST', body: JSON.stringify({job_id: id})});
    showToast(t('cron_job_paused'));
    await loadCrons();
  } catch(e) { showToast(t('failed_colon') + e.message, 4000); }
}

async function cronResume(id) {
  try {
    await api('/api/crons/resume', {method:'POST', body: JSON.stringify({job_id: id})});
    showToast(t('cron_job_resumed'));
    await loadCrons();
  } catch(e) { showToast(t('failed_colon') + e.message, 4000); }
}

function cronEditOpen(id, job) {
  const form = $('cron-edit-' + id);
  if (!form) return;
  $('cron-edit-name-' + id).value = job.name || '';
  $('cron-edit-schedule-' + id).value = job.schedule_display || (job.schedule && job.schedule.expression) || job.schedule || '';
  $('cron-edit-prompt-' + id).value = job.prompt || '';
  const errEl = $('cron-edit-err-' + id);
  if (errEl) errEl.style.display = 'none';
  form.style.display = '';
}

function cronEditClose(id) {
  const form = $('cron-edit-' + id);
  if (form) form.style.display = 'none';
}

async function cronEditSave(id) {
  const name = $('cron-edit-name-' + id).value.trim();
  const schedule = $('cron-edit-schedule-' + id).value.trim();
  const prompt = $('cron-edit-prompt-' + id).value.trim();
  const errEl = $('cron-edit-err-' + id);
  if (!schedule) { errEl.textContent = t('cron_schedule_required'); errEl.style.display = ''; return; }
  if (!prompt) { errEl.textContent = t('cron_prompt_required'); errEl.style.display = ''; return; }
  try {
    const updates = {job_id: id, schedule, prompt};
    if (name) updates.name = name;
    await api('/api/crons/update', {method:'POST', body: JSON.stringify(updates)});
    showToast(t('cron_job_updated'));
    await loadCrons();
  } catch(e) { errEl.textContent = t('error_prefix') + e.message; errEl.style.display = ''; }
}

async function cronDelete(id) {
  const _delCron=await showConfirmDialog({title:t('cron_delete_confirm_title'),message:t('cron_delete_confirm_message'),confirmLabel:t('delete_title'),danger:true,focusCancel:true});
  if(!_delCron) return;
  try {
    await api('/api/crons/delete', {method:'POST', body: JSON.stringify({job_id: id})});
    showToast(t('cron_job_deleted'));
    await loadCrons();
  } catch(e) { showToast(t('delete_failed') + e.message, 4000); }
}

function loadTodos() {
  const panel = $('todoPanel');
  if (!panel) return;
  const sourceMessages = (S.session && Array.isArray(S.session.messages) && S.session.messages.length) ? S.session.messages : S.messages;
  // Parse the most recent todo state from message history
  let todos = [];
  for (let i = sourceMessages.length - 1; i >= 0; i--) {
    const m = sourceMessages[i];
    if (m && m.role === 'tool') {
      try {
        const d = JSON.parse(typeof m.content === 'string' ? m.content : JSON.stringify(m.content));
        if (d && Array.isArray(d.todos) && d.todos.length) {
          todos = d.todos;
          break;
        }
      } catch(e) {}
    }
  }
  if (!todos.length) {
    panel.innerHTML = `<div style="color:var(--muted);font-size:12px;padding:4px 0">${esc(t('todos_no_active'))}</div>`;
    return;
  }
  const statusIcon = {pending:li('square',14), in_progress:li('loader',14), completed:li('check',14), cancelled:li('x',14)};
  const statusColor = {pending:'var(--muted)', in_progress:'var(--blue)', completed:'rgba(100,200,100,.8)', cancelled:'rgba(200,100,100,.5)'};
  panel.innerHTML = todos.map(todo => `
    <div style="display:flex;align-items:flex-start;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);">
      <span style="font-size:14px;display:inline-flex;align-items:center;flex-shrink:0;margin-top:1px;color:${statusColor[todo.status]||'var(--muted)'}">${statusIcon[todo.status]||li('square',14)}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;color:${todo.status==='completed'?'var(--muted)':todo.status==='in_progress'?'var(--text)':'var(--text)'};${todo.status==='completed'?'text-decoration:line-through;opacity:.5':''};line-height:1.4">${esc(todo.content)}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px;opacity:.6">${esc(todo.id)} · ${esc(todo.status)}</div>
      </div>
    </div>`).join('');
}

async function clearConversation() {
  if(!S.session) return;
  const _clrMsg=await showConfirmDialog({title:t('clear_conversation_title'),message:t('clear_conversation_message'),confirmLabel:t('clear'),danger:true,focusCancel:true});
  if(!_clrMsg) return;
  try {
    const data = await api('/api/session/clear', {method:'POST',
      body: JSON.stringify({session_id: S.session.session_id})});
    S.session = data.session;
    S.messages = [];
    S.toolCalls = [];
    syncTopbar();
    renderMessages();
    showToast(t('conversation_cleared'));
  } catch(e) { setStatus(t('clear_failed') + e.message); }
}

// ── Skills panel ──
async function loadSkills() {
  if (_skillsData) { renderSkills(_skillsData); return; }
  const box = $('skillsList');
  try {
    const data = await api('/api/skills');
    _skillsData = data.skills || [];
    renderSkills(_skillsData);
  } catch(e) { box.innerHTML = `<div style="padding:12px;color:var(--accent);font-size:12px">Error: ${esc(e.message)}</div>`; }
}

function renderSkills(skills) {
  const query = ($('skillsSearch').value || '').toLowerCase();
  const filtered = query ? skills.filter(s =>
    (s.name||'').toLowerCase().includes(query) ||
    (s.description||'').toLowerCase().includes(query) ||
    (s.category||'').toLowerCase().includes(query)
  ) : skills;
  // Group by category
  const cats = {};
  for (const s of filtered) {
    const cat = s.category || '(general)';
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(s);
  }
  const box = $('skillsList');
  box.innerHTML = '';
  if (!filtered.length) { box.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:12px">${esc(t('skills_no_match'))}</div>`; return; }
  for (const [cat, items] of Object.entries(cats).sort()) {
    const sec = document.createElement('div');
    sec.className = 'skills-category';
    sec.innerHTML = `<div class="skills-cat-header">${li('folder',12)} ${esc(cat)} <span style="opacity:.5">(${items.length})</span></div>`;
    for (const skill of items.sort((a,b) => a.name.localeCompare(b.name))) {
      const el = document.createElement('div');
      el.className = 'skill-item';
      el.innerHTML = `<span class="skill-name">${esc(skill.name)}</span><span class="skill-desc">${esc(skill.description||'')}</span>`;
      el.onclick = () => openSkill(skill.name, el);
      sec.appendChild(el);
    }
    box.appendChild(sec);
  }
}

function filterSkills() {
  if (_skillsData) renderSkills(_skillsData);
}

async function openSkill(name, el) {
  // Highlight active skill
  document.querySelectorAll('.skill-item').forEach(e => e.classList.remove('active'));
  if (el) el.classList.add('active');
  try {
    const data = await api(`/api/skills/content?name=${encodeURIComponent(name)}`);
    // Show skill content in right panel preview
    $('previewPathText').textContent = name + '.md';
    $('previewBadge').textContent = 'skill';
    $('previewBadge').className = 'preview-badge md';
    showPreview('md');
    let html = renderMd(data.content || '(no content)');
    // Render linked files section if present
    const lf = data.linked_files || {};
    const categories = Object.entries(lf).filter(([,files]) => files && files.length > 0);
    if (categories.length) {
      html += `<div class="skill-linked-files"><div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">${esc(t('linked_files'))}</div>`;
      for (const [cat, files] of categories) {
        html += `<div class="skill-linked-section"><h4>${esc(cat)}</h4>`;
        for (const f of files) {
          html += `<a class="skill-linked-file" href="#" data-skill-name="${esc(name)}" data-skill-file="${esc(f)}">${esc(f)}</a>`;
        }
        html += '</div>';
      }
      html += '</div>';
    }
    $('previewMd').innerHTML = html;
    // Wire linked-file clicks via data attributes (avoids inline JS XSS with apostrophes)
    $('previewMd').querySelectorAll('.skill-linked-file').forEach(a=>{
      a.addEventListener('click',e=>{e.preventDefault();openSkillFile(a.dataset.skillName,a.dataset.skillFile);});
    });
    $('previewArea').classList.add('visible');
    $('fileTree').style.display = 'none';
  } catch(e) { setStatus(t('skill_load_failed') + e.message); }
}

async function openSkillFile(skillName, filePath) {
  try {
    const data = await api(`/api/skills/content?name=${encodeURIComponent(skillName)}&file=${encodeURIComponent(filePath)}`);
    $('previewPathText').textContent = skillName + ' / ' + filePath;
    $('previewBadge').textContent = filePath.split('.').pop() || 'file';
    $('previewBadge').className = 'preview-badge code';
    const ext = filePath.split('.').pop() || '';
    if (['md','markdown'].includes(ext)) {
      showPreview('md');
      $('previewMd').innerHTML = renderMd(data.content || '');
    } else {
      showPreview('code');
      $('previewCode').textContent = data.content || '';
      requestAnimationFrame(() => highlightCode());
    }
  } catch(e) { setStatus(t('skill_file_load_failed') + e.message); }
}

// ── Skill create/edit form ──
let _editingSkillName = null;

function toggleSkillForm(prefillName, prefillCategory, prefillContent) {
  const form = $('skillCreateForm');
  if (!form) return;
  const open = form.style.display !== 'none';
  if (open) { form.style.display = 'none'; _editingSkillName = null; return; }
  $('skillFormName').value = prefillName || '';
  $('skillFormCategory').value = prefillCategory || '';
  $('skillFormContent').value = prefillContent || '';
  $('skillFormError').style.display = 'none';
  _editingSkillName = prefillName || null;
  form.style.display = '';
  $('skillFormName').focus();
}

async function submitSkillSave() {
  const name = ($('skillFormName').value||'').trim().toLowerCase().replace(/\s+/g, '-');
  const category = ($('skillFormCategory').value||'').trim();
  const content = $('skillFormContent').value;
  const errEl = $('skillFormError');
  errEl.style.display = 'none';
  if (!name) { errEl.textContent = t('skill_name_required'); errEl.style.display = ''; return; }
  if (!content.trim()) { errEl.textContent = t('content_required'); errEl.style.display = ''; return; }
  try {
    await api('/api/skills/save', {method:'POST', body: JSON.stringify({name, category: category||undefined, content})});
    showToast(_editingSkillName ? t('skill_updated') : t('skill_created'));
    _skillsData = null;
    _cronSkillsCache = null;
    toggleSkillForm();
    await loadSkills();
  } catch(e) { errEl.textContent = t('error_prefix') + e.message; errEl.style.display = ''; }
}

// ── Memory inline edit ──
let _memoryData = null;

function toggleMemoryEdit() {
  const form = $('memoryEditForm');
  if (!form) return;
  const open = form.style.display !== 'none';
  if (open) { form.style.display = 'none'; return; }
  $('memEditSection').textContent = t('memory_notes_label');
  $('memEditContent').value = _memoryData ? (_memoryData.memory || '') : '';
  $('memEditError').style.display = 'none';
  form.style.display = '';
}

function closeMemoryEdit() {
  const form = $('memoryEditForm');
  if (form) form.style.display = 'none';
}

async function submitMemorySave() {
  const content = $('memEditContent').value;
  const errEl = $('memEditError');
  errEl.style.display = 'none';
  try {
    await api('/api/memory/write', {method:'POST', body: JSON.stringify({section: 'memory', content})});
    showToast(t('memory_saved'));
    closeMemoryEdit();
    await loadMemory(true);
  } catch(e) { errEl.textContent = t('error_prefix') + e.message; errEl.style.display = ''; }
}

// ── Workspace management ──
let _workspaceList = [];  // cached from /api/workspaces

function getWorkspaceFriendlyName(path){
  // Look up the friendly name from the workspace list cache, fallback to last path segment
  if(_workspaceList && _workspaceList.length){
    const match=_workspaceList.find(w=>w.path===path);
    if(match && match.name) return match.name;
  }
  return path.split('/').filter(Boolean).pop()||path;
}

function syncWorkspaceDisplays(){
  const hasSession=!!(S.session&&S.session.workspace);
  const ws=hasSession?S.session.workspace:'';
  const label=hasSession?getWorkspaceFriendlyName(ws):t('no_workspace');

  const sidebarName=$('sidebarWsName');
  const sidebarPath=$('sidebarWsPath');
  if(sidebarName) sidebarName.textContent=label;
  if(sidebarPath) sidebarPath.textContent=ws;

  const composerChip=$('composerWorkspaceChip');
  const composerLabel=$('composerWorkspaceLabel');
  const composerDropdown=$('composerWsDropdown');
  if(!hasSession && composerDropdown) composerDropdown.classList.remove('open');
  if(composerLabel) composerLabel.textContent=label;
  if(composerChip){
    composerChip.disabled=!hasSession;
    composerChip.title=hasSession?ws:t('no_workspace');
    composerChip.classList.toggle('active',!!(composerDropdown&&composerDropdown.classList.contains('open')));
  }
}

async function loadWorkspaceList(){
  try{
    const data = await api('/api/workspaces');
    _workspaceList = data.workspaces || [];
    syncWorkspaceDisplays();
    return data;
  }catch(e){ return {workspaces:[], last:''}; }
}

function _renderWorkspaceAction(label, meta, iconSvg, onClick){
  const opt=document.createElement('div');
  opt.className='ws-opt ws-opt-action';
  opt.innerHTML=`<span class="ws-opt-icon">${iconSvg}</span><span><span class="ws-opt-name">${esc(label)}</span>${meta?`<span class="ws-opt-meta">${esc(meta)}</span>`:''}</span>`;
  opt.onclick=onClick;
  return opt;
}

function _positionComposerWsDropdown(){
  const dd=$('composerWsDropdown');
  const chip=$('composerWorkspaceChip');
  const footer=document.querySelector('.composer-footer');
  if(!dd||!chip||!footer)return;
  const chipRect=chip.getBoundingClientRect();
  const footerRect=footer.getBoundingClientRect();
  let left=chipRect.left-footerRect.left;
  const maxLeft=Math.max(0, footer.clientWidth-dd.offsetWidth);
  left=Math.max(0, Math.min(left, maxLeft));
  dd.style.left=`${left}px`;
}

function _positionProfileDropdown(){
  const dd=$('profileDropdown');
  const chip=$('profileChip');
  const footer=document.querySelector('.composer-footer');
  if(!dd||!chip||!footer)return;
  const chipRect=chip.getBoundingClientRect();
  const footerRect=footer.getBoundingClientRect();
  let left=chipRect.left-footerRect.left;
  const maxLeft=Math.max(0, footer.clientWidth-dd.offsetWidth);
  left=Math.max(0, Math.min(left, maxLeft));
  dd.style.left=`${left}px`;
}

function renderWorkspaceDropdownInto(dd, workspaces, currentWs){
  if(!dd)return;
  dd.innerHTML='';
  for(const w of workspaces){
    const opt=document.createElement('div');
    opt.className='ws-opt'+(w.path===currentWs?' active':'');
    opt.innerHTML=`<span class="ws-opt-name">${esc(w.name)}</span><span class="ws-opt-path">${esc(w.path)}</span>`;
    opt.onclick=()=>switchToWorkspace(w.path,w.name);
    dd.appendChild(opt);
  }
  dd.appendChild(document.createElement('div')).className='ws-divider';
  dd.appendChild(_renderWorkspaceAction(
    t('workspace_choose_path'),
    t('workspace_choose_path_meta'),
    li('folder',12),
    ()=>promptWorkspacePath()
  ));
  const div=document.createElement('div');div.className='ws-divider';dd.appendChild(div);
  dd.appendChild(_renderWorkspaceAction(
    t('workspace_manage'),
    t('workspace_manage_meta'),
    li('settings',12),
    ()=>{closeWsDropdown();switchPanel('workspaces');}
  ));
}

function toggleWsDropdown(){
  const dd=$('wsDropdown');
  if(!dd)return;
  const open=dd.classList.contains('open');
  if(open){closeWsDropdown();}
  else{
    closeProfileDropdown(); // close profile dropdown if open
    loadWorkspaceList().then(data=>{
      renderWorkspaceDropdownInto(dd, data.workspaces, S.session?S.session.workspace:'');
      dd.classList.add('open');
    });
  }
}

function toggleComposerWsDropdown(){
  const dd=$('composerWsDropdown');
  const chip=$('composerWorkspaceChip');
  if(!dd||!chip||chip.disabled)return;
  const open=dd.classList.contains('open');
  if(open){closeWsDropdown();}
  else{
    closeProfileDropdown();
    if(typeof closeModelDropdown==='function') closeModelDropdown();
    loadWorkspaceList().then(data=>{
      renderWorkspaceDropdownInto(dd, data.workspaces, S.session?S.session.workspace:'');
      dd.classList.add('open');
      _positionComposerWsDropdown();
      chip.classList.add('active');
    });
  }
}

function closeWsDropdown(){
  const dd=$('wsDropdown');
  const composerDd=$('composerWsDropdown');
  const composerChip=$('composerWorkspaceChip');
  if(dd)dd.classList.remove('open');
  if(composerDd)composerDd.classList.remove('open');
  if(composerChip)composerChip.classList.remove('active');
}
document.addEventListener('click',e=>{
  if(
    !e.target.closest('#composerWorkspaceChip') &&
    !e.target.closest('#composerWsDropdown')
  ) closeWsDropdown();
});
window.addEventListener('resize',()=>{
  const dd=$('composerWsDropdown');
  if(dd&&dd.classList.contains('open')) _positionComposerWsDropdown();
});

async function loadWorkspacesPanel(){
  const panel=$('workspacesPanel');
  if(!panel)return;
  const data=await loadWorkspaceList();
  renderWorkspacesPanel(data.workspaces);
}

function renderWorkspacesPanel(workspaces){
  const panel=$('workspacesPanel');
  panel.innerHTML='';
  for(const w of workspaces){
    const row=document.createElement('div');row.className='ws-row';
    row.innerHTML=`
      <div class="ws-row-info">
        <div class="ws-row-name">${esc(w.name)}</div>
        <div class="ws-row-path">${esc(w.path)}</div>
      </div>
      <div class="ws-row-actions">
        <button class="ws-action-btn" title="${esc(t('workspace_use_title'))}" onclick="switchToWorkspace('${esc(w.path)}','${esc(w.name)}')">${li('arrow-right',12)} ${esc(t('workspace_use'))}</button>
        <button class="ws-action-btn danger" title="${esc(t('remove'))}" onclick="removeWorkspace('${esc(w.path)}')">${li('x',12)}</button>
      </div>`;
    panel.appendChild(row);
  }
  const addRow=document.createElement('div');addRow.className='ws-add-row';
  addRow.innerHTML=`
    <input id="wsAddInput" placeholder="${esc(t('workspace_add_path_placeholder'))}" style="flex:1;background:rgba(255,255,255,.06);border:1px solid var(--border2);border-radius:7px;color:var(--text);padding:7px 10px;font-size:12px;outline:none;">
    <button class="ws-action-btn" onclick="addWorkspace()">${li('plus',12)} ${esc(t('add'))}</button>`;
  panel.appendChild(addRow);
  const hint=document.createElement('div');
  hint.style.cssText='font-size:11px;color:var(--muted);padding:4px 0 8px';
  hint.textContent=t('workspace_paths_validated_hint');
  panel.appendChild(hint);
}

async function addWorkspace(){
  const input=$('wsAddInput');
  const path=(input?input.value:'').trim();
  if(!path)return;
  try{
    const data=await api('/api/workspaces/add',{method:'POST',body:JSON.stringify({path})});
    _workspaceList=data.workspaces;
    renderWorkspacesPanel(data.workspaces);
    if(input)input.value='';
    showToast(t('workspace_added'));
  }catch(e){setStatus(t('add_failed')+e.message);}
}

async function removeWorkspace(path){
  const _rmWs=await showConfirmDialog({title:t('workspace_remove_confirm_title'),message:t('workspace_remove_confirm_message',path),confirmLabel:t('remove'),danger:true,focusCancel:true});
  if(!_rmWs) return;
  try{
    const data=await api('/api/workspaces/remove',{method:'POST',body:JSON.stringify({path})});
    _workspaceList=data.workspaces;
    renderWorkspacesPanel(data.workspaces);
    showToast(t('workspace_removed'));
  }catch(e){setStatus(t('remove_failed')+e.message);}
}

async function promptWorkspacePath(){
  if(!S.session)return;
  const value=await showPromptDialog({
    title:t('workspace_switch_prompt_title'),
    message:t('workspace_switch_prompt_message'),
    confirmLabel:t('workspace_switch_prompt_confirm'),
    placeholder:t('workspace_switch_prompt_placeholder'),
    value:S.session.workspace||''
  });
  const path=(value||'').trim();
  if(!path)return;
  try{
    const data=await api('/api/workspaces/add',{method:'POST',body:JSON.stringify({path})});
    _workspaceList=data.workspaces||[];
    const target=_workspaceList[_workspaceList.length-1];
    if(!target) throw new Error(t('workspace_not_added'));
    await switchToWorkspace(target.path,target.name);
  }catch(e){
    if(String(e.message||'').includes('Workspace already in list')){
      showToast(t('workspace_already_saved'));
      return;
    }
    showToast(t('workspace_switch_failed')+e.message);
  }
}

async function switchToWorkspace(path,name){
  if(!S.session)return;
  if(S.busy){
    showToast(t('workspace_busy_switch'));
    return;
  }
  if(typeof _previewDirty!=='undefined'&&_previewDirty){
    const discard=await showConfirmDialog({
      title:t('discard_file_edits_title'),
      message:t('discard_file_edits_message'),
      confirmLabel:t('discard'),
      danger:true
    });
    if(!discard)return;
    if(typeof cancelEditMode==='function')cancelEditMode();
    if(typeof clearPreview==='function')clearPreview();
  }
  try{
    closeWsDropdown();
    await api('/api/session/update',{method:'POST',body:JSON.stringify({
      session_id:S.session.session_id, workspace:path, model:S.session.model
    })});
    S.session.workspace=path;
    syncTopbar();
    await loadDir('.');
    showToast(t('workspace_switched_to',name||getWorkspaceFriendlyName(path)));
  }catch(e){setStatus(t('switch_failed')+e.message);}
}

// ── Profile panel + dropdown ──
let _profilesCache = null;

async function loadProfilesPanel() {
  const panel = $('profilesPanel');
  if (!panel) return;
  try {
    const data = await api('/api/profiles');
    _profilesCache = data;
    panel.innerHTML = '';
    if (!data.profiles || !data.profiles.length) {
      panel.innerHTML = `<div style="padding:16px;color:var(--muted);font-size:12px">${esc(t('profiles_no_profiles'))}</div>`;
      return;
    }
    for (const p of data.profiles) {
      const card = document.createElement('div');
      card.className = 'profile-card';
      const meta = [];
      if (p.model) meta.push(p.model.split('/').pop());
      if (p.provider) meta.push(p.provider);
      if (p.skill_count) meta.push(t('profile_skill_count', p.skill_count));
      if (p.has_env) meta.push(t('profile_api_keys_configured'));
      const gwDot = p.gateway_running
        ? `<span class="profile-opt-badge running" title="${esc(t('profile_gateway_running'))}"></span>`
        : `<span class="profile-opt-badge stopped" title="${esc(t('profile_gateway_stopped'))}"></span>`;
      const isActive = p.name === data.active;
      const activeBadge = isActive ? `<span style="color:var(--link);font-size:10px;font-weight:600;margin-left:6px">${esc(t('profile_active'))}</span>` : '';
      card.innerHTML = `
        <div class="profile-card-header">
          <div style="min-width:0;flex:1">
            <div class="profile-card-name${isActive ? ' is-active' : ''}">${gwDot}${esc(p.name)}${p.is_default ? ' <span style="opacity:.5">(default)</span>' : ''}${activeBadge}</div>
            ${meta.length ? `<div class="profile-card-meta">${esc(meta.join(' \u00b7 '))}</div>` : `<div class="profile-card-meta">${esc(t('profile_no_configuration'))}</div>`}
          </div>
          <div class="profile-card-actions">
            ${!isActive ? `<button class="ws-action-btn" onclick="switchToProfile('${esc(p.name)}')" title="${esc(t('profile_switch_title'))}">${esc(t('profile_use'))}</button>` : ''}
            ${!p.is_default ? `<button class="ws-action-btn danger" onclick="deleteProfile('${esc(p.name)}')" title="${esc(t('profile_delete_title'))}">${li('x',12)}</button>` : ''}
          </div>
        </div>`;
      panel.appendChild(card);
    }
  } catch (e) {
    panel.innerHTML = `<div style="color:var(--accent);font-size:12px;padding:12px">Error: ${esc(e.message)}</div>`;
  }
}

function renderProfileDropdown(data) {
  const dd = $('profileDropdown');
  if (!dd) return;
  dd.innerHTML = '';
  const profiles = data.profiles || [];
  const active = data.active || 'default';
  for (const p of profiles) {
    const opt = document.createElement('div');
    opt.className = 'profile-opt' + (p.name === active ? ' active' : '');
    const meta = [];
    if (p.model) meta.push(p.model.split('/').pop());
    if (p.skill_count) meta.push(t('profile_skill_count', p.skill_count));
    const gwDot = `<span class="profile-opt-badge ${p.gateway_running ? 'running' : 'stopped'}"></span>`;
    const checkmark = p.name === active ? ' <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--link)" stroke-width="3" style="vertical-align:-1px"><polyline points="20 6 9 17 4 12"/></svg>' : '';
    opt.innerHTML = `<div class="profile-opt-name">${gwDot}${esc(p.name)}${p.is_default ? ' <span style="opacity:.5;font-weight:400">(default)</span>' : ''}${checkmark}</div>` +
      (meta.length ? `<div class="profile-opt-meta">${esc(meta.join(' \u00b7 '))}</div>` : '');
    opt.onclick = async () => {
      closeProfileDropdown();
      if (p.name === active) return;
      await switchToProfile(p.name);
    };
    dd.appendChild(opt);
  }
  // Divider + Manage link
  const div = document.createElement('div'); div.className = 'ws-divider'; dd.appendChild(div);
  const mgmt = document.createElement('div'); mgmt.className = 'profile-opt ws-manage';
  mgmt.innerHTML = `${li('settings',12)} ${esc(t('manage_profiles'))}`;
  mgmt.onclick = () => { closeProfileDropdown(); openSettingsToProfiles(); };
  dd.appendChild(mgmt);
}

function toggleProfileDropdown() {
  const dd = $('profileDropdown');
  if (!dd) return;
  if (dd.classList.contains('open')) { closeProfileDropdown(); return; }
  closeWsDropdown(); // close workspace dropdown if open
  if(typeof closeModelDropdown==='function') closeModelDropdown();
  api('/api/profiles').then(data => {
    renderProfileDropdown(data);
    dd.classList.add('open');
    _positionProfileDropdown();
    const chip=$('profileChip');
    if(chip) chip.classList.add('active');
  }).catch(e => { showToast(t('profiles_load_failed')); });
}

function closeProfileDropdown() {
  const dd = $('profileDropdown');
  if (dd) dd.classList.remove('open');
  const chip=$('profileChip');
  if(chip) chip.classList.remove('active');
}
document.addEventListener('click', e => {
  if (!e.target.closest('#profileChipWrap') && !e.target.closest('#profileDropdown')) closeProfileDropdown();
});
window.addEventListener('resize',()=>{
  const dd=$('profileDropdown');
  if(dd&&dd.classList.contains('open')) _positionProfileDropdown();
});

async function switchToProfile(name) {
  if (S.busy) { showToast(t('profiles_busy_switch')); return; }

  // Determine whether the current session has any messages.
  // A session with messages is "in progress" and belongs to the current profile —
  // we must not retag it.  We'll start a fresh session for the new profile instead.
  const sessionInProgress = S.session && S.messages && S.messages.length > 0;

  try {
    const data = await api('/api/profile/switch', { method: 'POST', body: JSON.stringify({ name }) });
    S.activeProfile = data.active || name;

    // ── Model ──────────────────────────────────────────────────────────────
    localStorage.removeItem('hermes-webui-model');
    _skillsData = null;
    await populateModelDropdown();
    if (data.default_model) {
      const sel = $('modelSelect');
      const resolved = _applyModelToDropdown(data.default_model, sel);
      const modelToUse = resolved || data.default_model;
      S._pendingProfileModel = modelToUse;
      // Only patch the in-memory session model if we're NOT about to replace the session
      if (S.session && !sessionInProgress) {
        S.session.model = modelToUse;
      }
    }

    // ── Workspace ──────────────────────────────────────────────────────────
    _workspaceList = null;
    await loadWorkspaceList();
    if (data.default_workspace) {
      // Always store the profile default for new sessions
      S._profileDefaultWorkspace = data.default_workspace;

      if (S.session && !sessionInProgress) {
        // Empty session (no messages yet) — safe to update it in place
        try {
          await api('/api/session/update', { method: 'POST', body: JSON.stringify({
            session_id: S.session.session_id,
            workspace: data.default_workspace,
            model: S.session.model,
          })});
          S.session.workspace = data.default_workspace;
        } catch (_) {}
      }
    }

    // ── Session ────────────────────────────────────────────────────────────
    _showAllProfiles = false;

    if (sessionInProgress) {
      // The current session has messages and belongs to the previous profile.
      // Start a new session for the new profile so nothing gets cross-tagged.
      await newSession(false);
      // Apply profile default workspace to the newly created session (fixes #424)
      if (S._profileDefaultWorkspace && S.session) {
        try {
          await api('/api/session/update', { method: 'POST', body: JSON.stringify({
            session_id: S.session.session_id,
            workspace: S._profileDefaultWorkspace,
            model: S.session.model,
          })});
          S.session.workspace = S._profileDefaultWorkspace;
        } catch (_) {}
      }
      updateWorkspaceChip();
      await renderSessionList();
      showToast(t('profile_switched_new_conversation', name));
    } else {
      // No messages yet — just refresh the list and topbar in place
      await renderSessionList();
      syncTopbar();
      showToast(t('profile_switched', name));
    }

    // ── Sidebar panels ─────────────────────────────────────────────────────
    if (_currentPanel === 'skills') await loadSkills();
    if (_currentPanel === 'memory') await loadMemory();
    if (_currentPanel === 'tasks') await loadCrons();
    if (_currentPanel === 'profiles') await loadProfilesPanel();
    if (_currentPanel === 'workspaces') await loadWorkspacesPanel();

  } catch (e) { showToast(t('switch_failed') + e.message); }
}

function toggleProfileForm() {
  const form = $('profileCreateForm');
  if (!form) return;
  form.style.display = form.style.display === 'none' ? '' : 'none';
  if (form.style.display !== 'none') {
    $('profileFormName').value = '';
    $('profileFormClone').checked = false;
    if ($('profileFormBaseUrl')) $('profileFormBaseUrl').value = '';
    if ($('profileFormApiKey')) $('profileFormApiKey').value = '';
    const errEl = $('profileFormError');
    if (errEl) errEl.style.display = 'none';
    $('profileFormName').focus();
  }
}

async function submitProfileCreate() {
  const name = ($('profileFormName').value || '').trim().toLowerCase();
  const cloneConfig = $('profileFormClone').checked;
  const errEl = $('profileFormError');
  if (!name) { errEl.textContent = t('name_required'); errEl.style.display = ''; return; }
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(name)) { errEl.textContent = t('profile_name_rule'); errEl.style.display = ''; return; }
  try {
    const baseUrl = (($('profileFormBaseUrl') && $('profileFormBaseUrl').value) || '').trim();
    const apiKey = (($('profileFormApiKey') && $('profileFormApiKey').value) || '').trim();
    if (baseUrl && !/^https?:\/\//.test(baseUrl)) {
      errEl.textContent = t('profile_base_url_rule'); errEl.style.display = ''; return;
    }
    const payload = { name, clone_config: cloneConfig };
    if (baseUrl) payload.base_url = baseUrl;
    if (apiKey) payload.api_key = apiKey;
    await api('/api/profile/create', { method: 'POST', body: JSON.stringify(payload) });
    toggleProfileForm();
    await loadProfilesPanel();
    showToast(t('profile_created', name));
  } catch (e) {
    errEl.textContent = e.message || t('create_failed');
    errEl.style.display = '';
  }
}

async function deleteProfile(name) {
  const _delProf=await showConfirmDialog({title:t('profile_delete_confirm_title',name),message:t('profile_delete_confirm_message'),confirmLabel:t('delete_title'),danger:true,focusCancel:true});
  if(!_delProf) return;
  try {
    await api('/api/profile/delete', { method: 'POST', body: JSON.stringify({ name }) });
    await loadProfilesPanel();
    showToast(t('profile_deleted', name));
  } catch (e) { showToast(t('delete_failed') + e.message); }
}

// ── Memory panel ──
async function loadMemory(force) {
  const panel = $('memoryPanel');
  try {
    const data = await api('/api/memory');
    _memoryData = data;  // cache for edit form
    const fmtTime = ts => ts ? new Date(ts*1000).toLocaleString() : '';
    panel.innerHTML = `
      <div class="memory-section">
        <div class="memory-section-title">
          <span style="display:inline-flex;align-items:center;gap:6px">${li('brain',14)} ${esc(t('my_notes'))}</span>
          <span class="memory-mtime">${fmtTime(data.memory_mtime)}</span>
        </div>
        ${data.memory
          ? `<div class="memory-content preview-md">${renderMd(data.memory)}</div>`
          : `<div class="memory-empty">${esc(t('no_notes_yet'))}</div>`}
      </div>
      <div class="memory-section">
        <div class="memory-section-title">
          <span style="display:inline-flex;align-items:center;gap:6px">${li('user',14)} ${esc(t('user_profile'))}</span>
          <span class="memory-mtime">${fmtTime(data.user_mtime)}</span>
        </div>
        ${data.user
          ? `<div class="memory-content preview-md">${renderMd(data.user)}</div>`
          : `<div class="memory-empty">${esc(t('no_profile_yet'))}</div>`}
      </div>`;
  } catch(e) { panel.innerHTML = `<div style="color:var(--accent);font-size:12px">${esc(t('error_prefix'))}${esc(e.message)}</div>`; }
}

// Drag and drop
const wrap=$('composerWrap');let dragCounter=0;
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('dragenter',e=>{e.preventDefault();if(e.dataTransfer.types.includes('Files')){dragCounter++;wrap.classList.add('drag-over');}});
document.addEventListener('dragleave',e=>{dragCounter--;if(dragCounter<=0){dragCounter=0;wrap.classList.remove('drag-over');}});
document.addEventListener('drop',e=>{e.preventDefault();dragCounter=0;wrap.classList.remove('drag-over');const files=Array.from(e.dataTransfer.files);if(files.length){addFiles(files);$('msg').focus();}});

// ── Settings panel ───────────────────────────────────────────────────────────

let _settingsDirty = false;
let _settingsThemeOnOpen = null; // track theme at open time for discard revert
let _settingsSection = 'conversation';

function switchSettingsSection(name){
  const map={conversation:'Conversation',preferences:'Preferences',system:'System',skills:'Skills',memory:'Memory',profiles:'Profiles',about:'About',gitea:'Gitea',smtp:'SMTP'};
  if(!map[name]) name='conversation';
  _settingsSection=name;
  Object.entries(map).forEach(([key, title])=>{
    const tab=$('settingsTab'+title);
    const pane=$('settingsPane'+title);
    const active=key===name;
    if(tab){
      tab.classList.toggle('active',active);
      tab.setAttribute('aria-selected',active?'true':'false');
    }
    if(pane) pane.classList.toggle('active',active);
  });
  // Lazy-load data when tab is activated
  if(name==='skills' && _skillsData===null) loadSkills();
  if(name==='memory') loadMemory();
  if(name==='profiles') loadProfilesPanel();
  if(name==='gitea') loadGiteaPanel();
  if(name==='smtp') loadSmtpPanel();
}

// Open Settings and navigate to the Profiles tab
function openSettingsToProfiles(){
  const overlay=$('settingsOverlay');
  if(!overlay) return;
  overlay.style.display='';
  loadSettingsPanel();
  switchSettingsSection('profiles');
}

function _syncHermesPanelSessionActions(){
  const hasSession=!!S.session;
  const visibleMessages=hasSession?(S.messages||[]).filter(m=>m&&m.role&&m.role!=='tool').length:0;
  const title=hasSession?(S.session.title||t('untitled')):t('active_conversation_none');
  const meta=$('hermesSessionMeta');
  if(meta){
    meta.textContent=hasSession
      ? t('active_conversation_meta', title, visibleMessages)
      : t('active_conversation_none');
  }
  const setDisabled=(id,disabled)=>{
    const el=$(id);
    if(!el)return;
    el.disabled=!!disabled;
    el.classList.toggle('disabled',!!disabled);
  };
  setDisabled('btnDownload',!hasSession||visibleMessages===0);
  setDisabled('btnExportJSON',!hasSession);
  setDisabled('btnClearConvModal',!hasSession||visibleMessages===0);
}

function toggleSettings(){
  const overlay=$('settingsOverlay');
  if(!overlay) return;
  if(overlay.style.display==='none'){
    _settingsDirty = false;
    _settingsThemeOnOpen = localStorage.getItem('hermes-theme') || document.documentElement.dataset.theme || 'dark';
    _settingsSection = 'conversation';
    overlay.style.display='';
    loadSettingsPanel();
  } else {
    _closeSettingsPanel();
  }
}

function _resetSettingsPanelState(){
  _settingsSection = 'conversation';
  switchSettingsSection('conversation');
  const bar=$('settingsUnsavedBar');
  if(bar) bar.style.display='none';
}

function _hideSettingsPanel(){
  const overlay=$('settingsOverlay');
  if(!overlay) return;
  _resetSettingsPanelState();
  overlay.style.display='none';
}

// Close with unsaved-changes check. If dirty, show a confirm dialog.
function _closeSettingsPanel(){
  if(!_settingsDirty){
    // Nothing changed -- revert any live preview and close
    _revertSettingsPreview();
    _hideSettingsPanel();
    return;
  }
  // Dirty -- show inline confirm bar
  _showSettingsUnsavedBar();
}

// Revert live DOM/localStorage to what they were when the panel opened
function _revertSettingsPreview(){
  if(_settingsThemeOnOpen){
    localStorage.setItem('hermes-theme', _settingsThemeOnOpen);
    if(typeof _applyTheme==='function') _applyTheme(_settingsThemeOnOpen);
    else document.documentElement.dataset.theme = _settingsThemeOnOpen;
  }
}

// Show the "Unsaved changes" bar inside the settings panel
function _showSettingsUnsavedBar(){
  let bar = $('settingsUnsavedBar');
  if(bar){ bar.style.display=''; return; }
  // Create it
  bar = document.createElement('div');
  bar.id = 'settingsUnsavedBar';
  bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(233,69,96,.12);border:1px solid rgba(233,69,96,.3);border-radius:8px;padding:10px 14px;margin:0 0 12px;font-size:13px;';
  bar.innerHTML = `<span style="color:var(--text)">${esc(t('settings_unsaved_changes'))}</span>`
    + '<span style="display:flex;gap:8px">'
    + `<button onclick="_discardSettings()" style="padding:5px 12px;border-radius:6px;border:1px solid var(--border2);background:rgba(255,255,255,.06);color:var(--muted);cursor:pointer;font-size:12px;font-weight:600">${esc(t('discard'))}</button>`
    + `<button onclick="saveSettings(true)" style="padding:5px 12px;border-radius:6px;border:none;background:var(--accent);color:#fff;cursor:pointer;font-size:12px;font-weight:600">${esc(t('save'))}</button>`
    + '</span>';
  const body = document.querySelector('.settings-main') || document.querySelector('.settings-body') || document.querySelector('.settings-panel');
  if(body) body.prepend(bar);
}

function _discardSettings(){
  _revertSettingsPreview();
  _settingsDirty = false;
  _hideSettingsPanel();
}

// Mark settings as dirty whenever anything changes
function _markSettingsDirty(){
  _settingsDirty = true;
}

async function loadSettingsPanel(){
  try{
    const settings=await api('/api/settings');
    const resolvedLanguage=(typeof resolvePreferredLocale==='function')
      ? resolvePreferredLocale(settings.language, localStorage.getItem('hermes-lang'))
      : (settings.language || localStorage.getItem('hermes-lang') || 'en');
    // Keep settings modal and current page strings in sync with the resolved locale.
    if(typeof setLocale==='function'){
      setLocale(resolvedLanguage);
      if(typeof applyLocaleToDOM==='function') applyLocaleToDOM();
    }
    // Populate model dropdown from /api/models
    const modelSel=$('settingsModel');
    if(modelSel){
      modelSel.innerHTML='';
      try{
        const models=await api('/api/models');
        for(const g of (models.groups||[])){
          const og=document.createElement('optgroup');
          og.label=g.provider;
          for(const m of g.models){
            const opt=document.createElement('option');
            opt.value=m.id;opt.textContent=m.label;
            og.appendChild(opt);
          }
          modelSel.appendChild(og);
        }
      }catch(e){}
      modelSel.value=settings.default_model||'';
      modelSel.addEventListener('change',_markSettingsDirty,{once:false});
    }
    // Send key preference
    const sendKeySel=$('settingsSendKey');
    if(sendKeySel){sendKeySel.value=settings.send_key||'enter';sendKeySel.addEventListener('change',_markSettingsDirty,{once:false});}
    // Theme preference
    const themeSel=$('settingsTheme');
    if(themeSel){themeSel.value=settings.theme||'dark';themeSel.addEventListener('change',_markSettingsDirty,{once:false});}
    // Language preference — populate from LOCALES bundle
    const langSel=$('settingsLanguage');
    if(langSel){
      langSel.innerHTML='';
      if(typeof LOCALES!=='undefined'){
        for(const [code,bundle] of Object.entries(LOCALES)){
          const opt=document.createElement('option');
          opt.value=code;opt.textContent=bundle._label||code;
          langSel.appendChild(opt);
        }
      }
      langSel.value=resolvedLanguage;
      langSel.addEventListener('change',_markSettingsDirty,{once:false});
    }
    const showUsageCb=$('settingsShowTokenUsage');
    if(showUsageCb){showUsageCb.checked=!!settings.show_token_usage;showUsageCb.addEventListener('change',_markSettingsDirty,{once:false});}
    const showCliCb=$('settingsShowCliSessions');
    if(showCliCb){showCliCb.checked=!!settings.show_cli_sessions;showCliCb.addEventListener('change',_markSettingsDirty,{once:false});}
    const syncCb=$('settingsSyncInsights');
    if(syncCb){syncCb.checked=!!settings.sync_to_insights;syncCb.addEventListener('change',_markSettingsDirty,{once:false});}
    const updateCb=$('settingsCheckUpdates');
    if(updateCb){updateCb.checked=settings.check_for_updates!==false;updateCb.addEventListener('change',_markSettingsDirty,{once:false});}
    const soundCb=$('settingsSoundEnabled');
    if(soundCb){soundCb.checked=!!settings.sound_enabled;soundCb.addEventListener('change',_markSettingsDirty,{once:false});}
    const notifCb=$('settingsNotificationsEnabled');
    if(notifCb){notifCb.checked=!!settings.notifications_enabled;notifCb.addEventListener('change',_markSettingsDirty,{once:false});}
    const bubbleCb=$('settingsBubbleLayout');
    if(bubbleCb){bubbleCb.checked=!!settings.bubble_layout;bubbleCb.addEventListener('change',_markSettingsDirty,{once:false});}
    // Bot name
    const botNameField=$('settingsBotName');
    if(botNameField){botNameField.value=settings.bot_name||'Hermes';botNameField.addEventListener('input',_markSettingsDirty,{once:false});}
    // Password field: always blank (we don't send hash back)
    const pwField=$('settingsPassword');
    if(pwField){pwField.value='';pwField.addEventListener('input',_markSettingsDirty,{once:false});}
    // Show auth buttons only when auth is active
    try{
      const authStatus=await api('/api/auth/status');
      _setSettingsAuthButtonsVisible(!!authStatus.auth_enabled);
    }catch(e){}
    _syncHermesPanelSessionActions();
    switchSettingsSection(_settingsSection);
  }catch(e){
    showToast(t('settings_load_failed')+e.message);
  }
}

function _setSettingsAuthButtonsVisible(active){
  const signOutBtn=$('btnSignOut');
  if(signOutBtn) signOutBtn.style.display=active?'':'none';
  const disableBtn=$('btnDisableAuth');
  if(disableBtn) disableBtn.style.display=active?'':'none';
}

function _applySavedSettingsUi(saved, body, opts){
  const {sendKey,showTokenUsage,showCliSessions,theme,language}=opts;
  window._sendKey=sendKey||'enter';
  window._showTokenUsage=showTokenUsage;
  window._showCliSessions=showCliSessions;
  window._soundEnabled=body.sound_enabled;
  window._notificationsEnabled=body.notifications_enabled;
  window._botName=body.bot_name||'Hermes';
  document.body.classList.toggle('bubble-layout', !!body.bubble_layout);
  if(typeof applyBotName==='function') applyBotName();
  if(typeof setLocale==='function') setLocale(language);
  if(typeof applyLocaleToDOM==='function') applyLocaleToDOM();
  if(typeof startGatewaySSE==='function'){
    if(showCliSessions) startGatewaySSE();
    else if(typeof stopGatewaySSE==='function') stopGatewaySSE();
  }
  _setSettingsAuthButtonsVisible(!!saved.auth_enabled);
  _settingsDirty=false;
  _settingsThemeOnOpen=theme;
  const bar=$('settingsUnsavedBar');
  if(bar) bar.style.display='none';
  renderMessages();
  if(typeof syncTopbar==='function') syncTopbar();
  if(typeof renderSessionList==='function') renderSessionList();
}

async function saveSettings(andClose){
  const model=($('settingsModel')||{}).value;
  const sendKey=($('settingsSendKey')||{}).value;
  const showTokenUsage=!!($('settingsShowTokenUsage')||{}).checked;
  const showCliSessions=!!($('settingsShowCliSessions')||{}).checked;
  const pw=($('settingsPassword')||{}).value;
  const theme=($('settingsTheme')||{}).value||'dark';
  const language=($('settingsLanguage')||{}).value||'en';
  const body={};
  if(model) body.default_model=model;

  if(sendKey) body.send_key=sendKey;
  body.theme=theme;
  body.language=language;
  body.show_token_usage=showTokenUsage;
  body.show_cli_sessions=showCliSessions;
  body.sync_to_insights=!!($('settingsSyncInsights')||{}).checked;
  body.check_for_updates=!!($('settingsCheckUpdates')||{}).checked;
  body.sound_enabled=!!($('settingsSoundEnabled')||{}).checked;
  body.notifications_enabled=!!($('settingsNotificationsEnabled')||{}).checked;
  body.bubble_layout=!!($('settingsBubbleLayout')||{}).checked;
  document.body.classList.toggle('bubble-layout', body.bubble_layout);
  const botName=(($('settingsBotName')||{}).value||'').trim();
  body.bot_name=botName||'Hermes';
  // SMTP settings
  const smtpHost=(($('smtpHost')||{}).value||'').trim();
  const smtpPort=(($('smtpPort')||{}).value||'').trim();
  const smtpUser=(($('smtpUser')||{}).value||'').trim();
  const smtpPass=(($('smtpPass')||{}).value||'').trim();
  const smtpFrom=(($('smtpFrom')||{}).value||'').trim();
  if(smtpHost) body.smtp_host=smtpHost;
  if(smtpPort) body.smtp_port=smtpPort;
  if(smtpUser) body.smtp_user=smtpUser;
  if(smtpPass) body.smtp_pass=smtpPass;
  if(smtpFrom) body.smtp_from=smtpFrom;
  // Password: only act if the field has content; blank = leave auth unchanged
  if(pw && pw.trim()){
    try{
      const saved=await api('/api/settings',{method:'POST',body:JSON.stringify({...body,_set_password:pw.trim()})});
      _applySavedSettingsUi(saved, body, {sendKey,showTokenUsage,showCliSessions,theme,language});
      showToast(t(saved.auth_just_enabled?'settings_saved_pw':'settings_saved_pw_updated'));
      _hideSettingsPanel();
      return;
    }catch(e){showToast(t('settings_save_failed')+e.message);return;}
  }
  try{
    const saved=await api('/api/settings',{method:'POST',body:JSON.stringify(body)});
    _applySavedSettingsUi(saved, body, {sendKey,showTokenUsage,showCliSessions,theme,language});
    showToast(t('settings_saved'));
    _hideSettingsPanel();
  }catch(e){
    showToast(t('settings_save_failed')+e.message);
  }
}

async function signOut(){
  try{
    await api('/api/auth/logout',{method:'POST',body:'{}'});
    window.location.href='/login';
  }catch(e){
    showToast(t('sign_out_failed')+e.message);
  }
}

async function disableAuth(){
  const _disAuth=await showConfirmDialog({title:t('disable_auth_confirm_title'),message:t('disable_auth_confirm_message'),confirmLabel:t('disable'),danger:true,focusCancel:true});
  if(!_disAuth) return;
  try{
    await api('/api/settings',{method:'POST',body:JSON.stringify({_clear_password:true})});
    showToast(t('auth_disabled'));
    // Hide both auth buttons since auth is now off
    const disableBtn=$('btnDisableAuth');
    if(disableBtn) disableBtn.style.display='none';
    const signOutBtn=$('btnSignOut');
    if(signOutBtn) signOutBtn.style.display='none';
  }catch(e){
    showToast(t('disable_auth_failed')+e.message);
  }
}

// ── Gitea panel ───────────────────────────────────────────────────────────────

let _giteaReposCache = null;

async function loadGiteaPanel(){
  const urlInput=$('giteaUrl');
  const userInput=$('giteaUsername');
  const tokenInput=$('giteaToken');
  const statusBadge=$('giteaStatusBadge');
  const reposSection=$('giteaReposSection');
  if(!urlInput) return;

  // Load saved settings
  try{
    const data=await api('/api/gitea');
    if(urlInput) urlInput.value=data.gitea_url||'http://localhost:3000';
    if(userInput) userInput.value=data.gitea_username||'';
    if(tokenInput) tokenInput.value=data.gitea_token||'';
    _updateGiteaStatus(data.gitea_connected, statusBadge);
    if(data.gitea_connected){
      if(reposSection) reposSection.style.display='';
      await loadGiteaRepos();
    }else{
      if(reposSection) reposSection.style.display='none';
    }
  }catch(e){
    _updateGiteaStatus(false, statusBadge);
  }
}

function _updateGiteaStatus(connected, badge){
  if(!badge) return;
  if(connected){
    badge.textContent=t('gitea_connected');
    badge.style.background='var(--green,#4caf50)';
  }else{
    badge.textContent=t('gitea_not_connected');
    badge.style.background='var(--muted)';
  }
}

async function giteaConnect(){
  const urlInput=$('giteaUrl');
  const userInput=$('giteaUsername');
  const tokenInput=$('giteaToken');
  const statusBadge=$('giteaStatusBadge');
  const reposSection=$('giteaReposSection');
  const connectBtn=$('giteaConnectBtn');

  if(!urlInput || !userInput || !tokenInput) return;

  const gitea_url=urlInput.value.trim();
  const gitea_username=userInput.value.trim();
  const gitea_token=tokenInput.value.trim();

  if(!gitea_username || !gitea_token){
    showToast(t('gitea_connect_failed')+'Username and token required');
    return;
  }

  if(connectBtn){
    connectBtn.textContent=t('loading');
    connectBtn.disabled=true;
  }

  try{
    const saved=await api('/api/gitea',{method:'POST',body:JSON.stringify({gitea_url,gitea_username,gitea_token})});
    _updateGiteaStatus(saved.gitea_connected, statusBadge);
    if(saved.gitea_connected){
      if(reposSection) reposSection.style.display='';
      await loadGiteaRepos();
      showToast(t('gitea_connected'));
    }else{
      showToast(t('gitea_connect_failed')+'Check credentials');
    }
  }catch(e){
    showToast(t('gitea_connect_failed')+e.message);
    _updateGiteaStatus(false, statusBadge);
  }finally{
    if(connectBtn){
      connectBtn.textContent=t('gitea_connect');
      connectBtn.disabled=false;
    }
  }
}

async function loadGiteaRepos(){
  const reposList=$('giteaReposList');
  if(!reposList) return;

  reposList.innerHTML=`<div style="color:var(--muted);font-size:12px;padding:8px">${esc(t('loading'))}</div>`;
  _giteaReposCache=null;

  try{
    const data=await api('/api/gitea/repos');
    _giteaReposCache=data.repos||[];
    if(_giteaReposCache.length===0){
      reposList.innerHTML=`<div style="color:var(--muted);font-size:12px;padding:8px">${esc(t('gitea_no_repos'))}</div>`;
      return;
    }
    reposList.innerHTML=_giteaReposCache.map(r=>`
      <div style="display:flex;align-items:center;justify-content:space-between;padding:8px;border-bottom:1px solid var(--border);gap:8px">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.name)}</div>
          ${r.description?`<div style="font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(r.description)}</div>`:''}
          ${r.private?`<span style="font-size:10px;color:var(--accent);border:1px solid var(--accent);border-radius:3px;padding:0 4px">${esc(t('gitea_private'))}</span>`:''}
        </div>
        <button class="sm-btn" style="padding:4px 10px;font-size:11px;flex-shrink:0" onclick="giteaCloneRepo('${esc(r.clone_url)}','${esc(r.name)}')" data-i18n="gitea_clone">${esc(t('gitea_clone'))}</button>
      </div>
    `).join('');
  }catch(e){
    reposList.innerHTML=`<div style="color:var(--accent);font-size:12px;padding:8px">${esc(t('gitea_fetch_failed'))}${esc(e.message)}</div>`;
  }
}

async function giteaCloneRepo(cloneUrl, name){
  const reposList=$('giteaReposList');
  try{
    const data=await api('/api/gitea/clone',{method:'POST',body:JSON.stringify({clone_url:cloneUrl,name:name})});
    if(data.ok){
      showToast(t('gitea_clone_success')+data.name);
      // Update workspace list if available
      if(typeof loadWorkspaceList==='function') loadWorkspaceList();
      // Update current session workspace if needed
      if(S.session && S.session.workspace!==data.path){
        showConfirmDialog({title:t('workspace_switch_prompt_title'),message:t('workspace_switch_prompt_message'),confirmLabel:t('workspace_switch_prompt_confirm')}).then(ok=>{
          if(ok && typeof switchWorkspace==='function') switchWorkspace(data.path);
        });
      }
    }
  }catch(e){
    showToast(t('gitea_clone_failed')+e.message);
  }
}

async function loadSmtpPanel(){
  try{
    const settings=await api('/api/settings');
    const hostEl=$('smtpHost');if(hostEl){hostEl.value=settings.smtp_host||'';hostEl.addEventListener('input',_markSettingsDirty);}
    const portEl=$('smtpPort');if(portEl){portEl.value=settings.smtp_port||587;portEl.addEventListener('input',_markSettingsDirty);}
    const userEl=$('smtpUser');if(userEl){userEl.value=settings.smtp_user||'';userEl.addEventListener('input',_markSettingsDirty);}
    const passEl=$('smtpPass');if(passEl){passEl.value='';passEl.placeholder='leave blank to keep current';passEl.addEventListener('input',_markSettingsDirty);}
    const fromEl=$('smtpFrom');if(fromEl){fromEl.value=settings.smtp_from||'';fromEl.addEventListener('input',_markSettingsDirty);}
    _updateSmtpStatus(!!settings.smtp_host);
  }catch(e){}
}

function _updateSmtpStatus(configured){
  const badge=$('smtpStatusBadge');
  if(!badge) return;
  if(configured){
    badge.textContent='OK';
    badge.style.background='var(--accent-green,#22c55e)';
  }else{
    badge.textContent='—';
    badge.style.background='var(--muted)';
  }
}

async function testSmtpSettings(){
  const host=$('smtpHost')?.value.trim();
  const port=parseInt($('smtpPort')?.value)||587;
  const user=$('smtpUser')?.value.trim();
  const pass=$('smtpPass')?.value;
  const from=$('smtpFrom')?.value.trim();
  const resultEl=$('smtpTestResult');
  const btn=$('smtpTestBtn');
  if(!resultEl||!btn) return;
  resultEl.style.display='none';
  btn.disabled=true;
  btn.textContent=(typeof t==='function'?t('smtp_test'):'Test Connection')+'…';
  try{
    const body={};
    if(host) body.smtp_host=host;
    if(port) body.smtp_port=port;
    if(user) body.smtp_user=user;
    if(pass) body.smtp_pass=pass;
    if(from) body.smtp_from=from;
    const res=await api('/api/settings/smtp-test',{method:'POST',body:JSON.stringify(body)});
    resultEl.textContent=typeof t==='function'?t('smtp_test_success'):'Connection successful!';
    resultEl.style.color='var(--accent-green,#22c55e)';
    resultEl.style.display='block';
  }catch(e){
    resultEl.textContent=(typeof t==='function'?t('smtp_test_failed'):'Failed: ')+(e.message||String(e));
    resultEl.style.color='var(--accent,#e84560)';
    resultEl.style.display='block';
  }finally{
    btn.disabled=false;
    btn.textContent=typeof t==='function'?t('smtp_test'):'Test Connection';
  }
}

// ── SMTP settings save — integrated into main saveSettings flow ──
// The SMTP fields are read by saveSettings() which sends them as part of the settings payload.

// Close settings on overlay click (not panel click) -- with unsaved-changes check
document.addEventListener('click',e=>{
  const overlay=$('settingsOverlay');
  if(overlay&&e.target===overlay) _closeSettingsPanel();
});

// ── Cron completion alerts ────────────────────────────────────────────────────

let _cronPollSince=Date.now()/1000;  // track from page load
let _cronPollTimer=null;
let _cronUnreadCount=0;

function startCronPolling(){
  if(_cronPollTimer) return;
  _cronPollTimer=setInterval(async()=>{
    if(document.hidden) return;  // don't poll when tab is in background
    try{
      const data=await api(`/api/crons/recent?since=${_cronPollSince}`);
      if(data.completions&&data.completions.length>0){
        for(const c of data.completions){
          showToast(t('cron_completion_status', c.name, c.status==='error' ? t('status_failed') : t('status_completed')),4000);
          _cronPollSince=Math.max(_cronPollSince,c.completed_at);
        }
        _cronUnreadCount+=data.completions.length;
        updateCronBadge();
      }
    }catch(e){}
  },30000);
}

function updateCronBadge(){
  const tab=document.querySelector('.nav-tab[data-panel="tasks"]');
  if(!tab) return;
  let badge=tab.querySelector('.cron-badge');
  if(_cronUnreadCount>0){
    if(!badge){
      badge=document.createElement('span');
      badge.className='cron-badge';
      tab.style.position='relative';
      tab.appendChild(badge);
    }
    badge.textContent=_cronUnreadCount>9?'9+':_cronUnreadCount;
    badge.style.display='';
  }else if(badge){
    badge.style.display='none';
  }
}

// Clear cron badge when Tasks tab is opened
const _origSwitchPanel=switchPanel;
switchPanel=async function(name){
  if(name==='tasks'){_cronUnreadCount=0;updateCronBadge();}
  return _origSwitchPanel(name);
};

// Start polling on page load
startCronPolling();

// ── Background agent error tracking ──────────────────────────────────────────

const _backgroundErrors=[];  // {session_id, title, message, ts}

function trackBackgroundError(sessionId, title, message){
  // Only track if user is NOT currently viewing this session
  if(S.session&&S.session.session_id===sessionId) return;
  _backgroundErrors.push({session_id:sessionId, title:title||t('untitled'), message, ts:Date.now()});
  showErrorBanner();
}

function showErrorBanner(){
  let banner=$('bgErrorBanner');
  if(!banner){
    banner=document.createElement('div');
    banner.id='bgErrorBanner';
    banner.className='bg-error-banner';
    const msgs=document.querySelector('.messages');
    if(msgs) msgs.parentNode.insertBefore(banner,msgs);
    else document.body.appendChild(banner);
  }
  const latest=_backgroundErrors[0];  // FIFO: show oldest (first) error
  if(!latest){banner.style.display='none';return;}
  const count=_backgroundErrors.length;
  const msg=count>1?t('bg_error_multi',count):t('bg_error_single',latest.title);
  banner.innerHTML=`<span>\u26a0 ${esc(msg)}</span><div style="display:flex;gap:6px;flex-shrink:0"><button class="reconnect-btn" onclick="navigateToErrorSession()">${esc(t('view'))}</button><button class="reconnect-btn" onclick="dismissErrorBanner()">${esc(t('dismiss'))}</button></div>`;
  banner.style.display='';
}

function navigateToErrorSession(){
  const latest=_backgroundErrors.shift();  // FIFO: show oldest error first
  if(latest){
    loadSession(latest.session_id);renderSessionList();
  }
  if(_backgroundErrors.length===0) dismissErrorBanner();
  else showErrorBanner();
}

function dismissErrorBanner(){
  _backgroundErrors.length=0;
  const banner=$('bgErrorBanner');
  if(banner) banner.style.display='none';
}

// ── Billing panel ──
async function loadBillingPanel() {
  const box = $('billingPanel');
  if (!box) return;
  try {
    const [plansData, subData, usageData] = await Promise.all([
      api('/api/billing/plans'),
      api('/api/billing/subscription'),
      api('/api/billing/usage'),
    ]);
    const plans = plansData.plans || [];
    const subscription = subData.subscription;
    const plan = subData.plan;
    const usage = usageData.usage || {};
    const limit = usageData.limit || {};
    const remaining = usageData.remaining_prompts || 0;
    const monthKey = usageData.month_key || '';

    let currentPlanHtml = '';
    if (subscription && plan) {
      const expiresDate = new Date(subscription.expires_at * 1000).toLocaleDateString();
      const cycleLabel = subscription.billing_cycle === 'yearly' ? '年付' : '月付';
      currentPlanHtml = `
        <div class="billing-current">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <span class="billing-plan-badge" style="background:linear-gradient(135deg,#f5c542,#e8952f);padding:3px 10px;border-radius:12px;font-size:11px;font-weight:700;color:#000">${esc(plan.name)}</span>
            <span style="font-size:11px;color:var(--muted)">${esc(cycleLabel)}</span>
            <span class="billing-status" style="background:rgba(52,199,89,.15);color:#34c759;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:600">活跃</span>
          </div>
          <div style="font-size:12px;color:var(--muted)">到期时间: ${esc(expiresDate)}</div>
          <div style="font-size:12px;color:var(--muted);margin-top:4px">到期后如需继续服务，请续订</div>
        </div>
      `;
    } else {
      currentPlanHtml = `
        <div class="billing-current" style="text-align:center;padding:16px 0">
          <div style="font-size:13px;color:var(--muted);margin-bottom:8px">您还没有订阅任何套餐</div>
          <div style="font-size:12px;color:var(--muted)">选择一个套餐开始使用</div>
        </div>
      `;
    }

    // Usage stats
    const promptPercent = limit.prompts_per_month > 0 ? Math.round((usage.prompt_count / limit.prompts_per_month) * 100) : 0;
    const usageHtml = `
      <div class="billing-usage">
        <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:8px">${esc(monthKey)} 用量</div>
        <div class="billing-progress-bar">
          <div class="billing-progress-fill" style="width:${promptPercent}%"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--muted);margin-top:4px">
          <span>${usage.prompt_count || 0} / ${limit.prompts_per_month || 0} 次对话</span>
          <span>剩余 ${remaining} 次</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
          <div class="billing-stat">
            <div style="font-size:11px;color:var(--muted)">Agents</div>
            <div style="font-size:14px;font-weight:600">${usage.agent_count || 0} / ${limit.agents_count || 0}</div>
          </div>
          <div class="billing-stat">
            <div style="font-size:11px;color:var(--muted)">Skills</div>
            <div style="font-size:14px;font-weight:600">${usage.skill_count || 0} / ${limit.skills_count || 0}</div>
          </div>
        </div>
      </div>
    `;

    // Plans
    let plansHtml = '';
    for (const p of plans) {
      const monthlyPrice = (p.monthly_price / 100).toFixed(0);
      const yearlyPrice = (p.yearly_price / 100).toFixed(0);
      const isCurrent = subscription && subscription.plan_id === p.id;
      const featuresList = (p.features || []).map(f => `<li>${esc(f)}</li>`).join('');
      plansHtml += `
        <div class="billing-plan-card ${isCurrent ? 'current' : ''}">
          <div class="billing-plan-name">${esc(p.name)}</div>
          <div class="billing-plan-price">
            <span class="price-monthly">¥${monthlyPrice}<small>/月</small></span>
            <span class="price-yearly">¥${yearlyPrice}<small>/年</small></span>
          </div>
          <ul class="billing-plan-features">${featuresList}</ul>
          <div style="margin-top:10px">
            <select class="billing-cycle-select" id="cycle_${esc(p.id)}">
              <option value="monthly">月付 ¥${monthlyPrice}</option>
              <option value="yearly" selected>年付 ¥${yearlyPrice}</option>
            </select>
          </div>
          ${isCurrent
            ? `<button class="billing-btn current" disabled>当前套餐</button>`
            : subscription
              ? `<button class="billing-btn upgrade" onclick="upgradePlan('${esc(p.id)}')">${p.id === 'pro' || parseInt(monthlyPrice) > parseInt((plan?.monthly_price || 0) / 100) ? '升级' : '变更'}</button>`
              : `<button class="billing-btn subscribe" onclick="subscribePlan('${esc(p.id)}')">立即订阅</button>`
          }
        </div>
      `;
    }

    box.innerHTML = `
      ${currentPlanHtml}
      ${usageHtml}
      <div style="font-size:11px;font-weight:600;color:var(--muted);margin:14px 0 8px">选择套餐</div>
      <div class="billing-plans-grid">${plansHtml}</div>
      ${subscription ? `<button class="billing-btn cancel" onclick="cancelSubscription()" style="width:100%;margin-top:12px">取消订阅</button>` : ''}
      <!-- Recharge Section -->
      <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
        <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:8px" data-i18n="recharge_select_amount">选择金额</div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px">
          <button class="recharge-amount-btn" onclick="openRechargeDialog(30)" data-i18n-title="recharge_amount_hint">¥30</button>
          <button class="recharge-amount-btn" onclick="openRechargeDialog(100)" data-i18n-title="recharge_amount_hint">¥100</button>
          <button class="recharge-amount-btn" onclick="openRechargeDialog(500)" data-i18n-title="recharge_amount_hint">¥500</button>
        </div>
        <div style="display:flex;gap:6px;align-items:center">
          <input type="number" id="rechargeCustomAmount" placeholder="自定义金额" min="1" style="flex:1;background:var(--input-bg);border:1px solid var(--border2);border-radius:8px;padding:6px 10px;font-size:12px;color:var(--text);outline:none" data-i18n-placeholder="recharge_custom">
          <button class="billing-btn subscribe" style="width:auto;padding:6px 14px;font-size:12px" onclick="openRechargeDialog()" data-i18n="recharge_confirm">充值</button>
        </div>
      </div>
    `;
  } catch (e) {
    box.innerHTML = `<div style="padding:12px;color:var(--accent);font-size:12px">${esc(t('error_prefix'))}${esc(e.message)}</div>`;
  }
}

async function subscribePlan(planId) {
  const cycle = $('cycle_' + planId)?.value || 'yearly';
  try {
    await api('/api/billing/subscribe', { plan_id: planId, billing_cycle: cycle }, 'POST');
    showToast('订阅成功');
    await loadBillingPanel();
  } catch (e) {
    showToast('订阅失败: ' + e.message);
  }
}

async function upgradePlan(planId) {
  const cycle = $('cycle_' + planId)?.value || 'yearly';
  try {
    await api('/api/billing/upgrade', { plan_id: planId, billing_cycle: cycle }, 'POST');
    showToast('升级成功');
    await loadBillingPanel();
  } catch (e) {
    showToast('升级失败: ' + e.message);
  }
}

async function cancelSubscription() {
  if (!confirm('确定要取消订阅吗？取消后您仍可使用到当前订阅到期日。')) return;
  try {
    await api('/api/billing/cancel', {}, 'POST');
    showToast('已取消订阅');
    await loadBillingPanel();
  } catch (e) {
    showToast('取消失败: ' + e.message);
  }
}

// ── Payment Dialog ──
let _selectedPaymentMethod = null;
let _pendingPayment = null;
let _paymentCheckInterval = null;

function showPaymentDialog(planId, cycle, isUpgrade = false, currentPlanId = null) {
  const plans = { standard: { name: '标准版', price: 99 }, professional: { name: '专业版', price: 299 }, pro: { name: 'Pro版', price: 899 } };
  const plan = plans[planId];
  if (!plan) return;

  const price = cycle === 'yearly' ? plan.price * 10 : plan.price;
  const priceLabel = `¥${price}`;

  _pendingPayment = { planId, cycle, isUpgrade, currentPlanId, price };
  _selectedPaymentMethod = null;

  // Update summary
  const summaryHtml = `
    <div class="payment-summary-title">订单摘要</div>
    <div class="payment-summary-plan">${plan.name} ${cycle === 'yearly' ? '(年付)' : '(月付)'}</div>
    <div class="payment-summary-price">${priceLabel}<small>${cycle === 'yearly' ? '/年' : '/月'}</small></div>
  `;
  $('paymentSummary').innerHTML = summaryHtml;

  // Reset payment methods
  document.querySelectorAll('.payment-method').forEach(el => el.classList.remove('selected'));
  document.getElementById('check_wechat').innerHTML = '';
  document.getElementById('check_alipay').innerHTML = '';

  // Hide QR section
  $('paymentQrSection').style.display = 'none';

  // Reset buttons
  const confirmBtn = $('paymentConfirmBtn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = '选择支付方式';

  // Show dialog
  $('paymentDialogOverlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function selectPaymentMethod(method) {
  _selectedPaymentMethod = method;

  // Update UI
  document.querySelectorAll('.payment-method').forEach(el => el.classList.remove('selected'));
  document.querySelector(`.payment-method[data-method="${method}"]`).classList.add('selected');

  const checkWechat = document.getElementById('check_wechat');
  const checkAlipay = document.getElementById('check_alipay');
  checkWechat.innerHTML = method === 'wechat' ? '<span style="color:#fff;font-size:12px">✓</span>' : '';
  checkAlipay.innerHTML = method === 'alipay' ? '<span style="color:#fff;font-size:12px">✓</span>' : '';

  // Show QR section
  $('paymentQrSection').style.display = 'block';
  $('paymentQrTitle').textContent = '请扫码支付';
  $('payMethodName').textContent = method === 'wechat' ? '微信' : '支付宝';
  $('paymentAmount').textContent = `¥${_pendingPayment.price}`;

  // Enable confirm button
  const confirmBtn = $('paymentConfirmBtn');
  confirmBtn.disabled = false;
  confirmBtn.textContent = '确认支付';
}

async function confirmPayment() {
  if (!_selectedPaymentMethod || !_pendingPayment) {
    showToast('请选择支付方式');
    return;
  }

  const confirmBtn = $('paymentConfirmBtn');
  confirmBtn.disabled = true;
  confirmBtn.textContent = '处理中...';

  try {
    // Simulate payment processing
    const result = await api('/api/billing/create_payment', {
      plan_id: _pendingPayment.planId,
      billing_cycle: _pendingPayment.cycle,
      payment_method: _selectedPaymentMethod,
    }, 'POST');

    if (result.payment_url) {
      // Show processing status
      $('paymentQrSection').innerHTML = `
        <div class="payment-status">
          <div class="payment-status-icon pending">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div class="payment-status-title">等待支付</div>
          <div class="payment-status-desc">请在${_selectedPaymentMethod === 'wechat' ? '微信' : '支付宝'}中完成支付</div>
        </div>
      `;

      // Start polling for payment status
      startPaymentCheck(result.order_id);
    } else {
      // Direct subscription (simulated instant payment)
      await completePayment(result);
    }
  } catch (e) {
    showToast('支付失败: ' + e.message);
    confirmBtn.disabled = false;
    confirmBtn.textContent = '确认支付';
  }
}

async function startPaymentCheck(orderId) {
  if (_paymentCheckInterval) clearInterval(_paymentCheckInterval);

  _paymentCheckInterval = setInterval(async () => {
    try {
      const status = await api(`/api/billing/payment_status?order_id=${orderId}`);
      if (status.status === 'paid') {
        clearInterval(_paymentCheckInterval);
        await completePayment(status);
      } else if (status.status === 'cancelled' || status.status === 'failed') {
        clearInterval(_paymentCheckInterval);
        showPaymentFailed();
      }
    } catch (e) {
      // Ignore polling errors
    }
  }, 3000);
}

async function completePayment(result) {
  // Stop polling
  if (_paymentCheckInterval) {
    clearInterval(_paymentCheckInterval);
    _paymentCheckInterval = null;
  }

  // Show success
  const qrSection = $('paymentQrSection');
  qrSection.innerHTML = `
    <div class="payment-status">
      <div class="payment-status-icon success">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="payment-status-title">支付成功</div>
      <div class="payment-status-desc">感谢您的订阅！</div>
    </div>
  `;

  showToast('订阅成功！');
  closePaymentDialog();
  await loadBillingPanel();
}

function showPaymentFailed() {
  const qrSection = $('paymentQrSection');
  qrSection.innerHTML = `
    <div class="payment-status">
      <div class="payment-status-icon failed">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </div>
      <div class="payment-status-title">支付取消</div>
      <div class="payment-status-desc">您已取消支付</div>
    </div>
  `;
}

function closePaymentDialog() {
  $('paymentDialogOverlay').style.display = 'none';
  document.body.style.overflow = '';
  _pendingPayment = null;
  _selectedPaymentMethod = null;
  if (_paymentCheckInterval) {
    clearInterval(_paymentCheckInterval);
    _paymentCheckInterval = null;
  }
}

// Wire up payment dialog events
document.addEventListener('DOMContentLoaded', () => {
  const overlay = $('paymentDialogOverlay');
  const closeBtn = $('paymentDialogClose');
  const cancelBtn = $('paymentCancelBtn');

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePaymentDialog();
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', closePaymentDialog);
  if (cancelBtn) cancelBtn.addEventListener('click', closePaymentDialog);
});

// Update subscribe/upgrade functions to use payment dialog
const _originalSubscribePlan = subscribePlan;
subscribePlan = async function(planId) {
  const cycle = $('cycle_' + planId)?.value || 'yearly';
  showPaymentDialog(planId, cycle, false);
};

const _originalUpgradePlan = upgradePlan;
upgradePlan = async function(planId) {
  const cycle = $('cycle_' + planId)?.value || 'yearly';
  const subData = await api('/api/billing/subscription');
  showPaymentDialog(planId, cycle, true, subData.subscription?.plan_id);
};

// ── Recharge ──
let _rechargeAmount = 0;
let _rechargeMethod = null;

// Admin-configured personal QR codes (replace URLs with actual QR code images)
const RECHARGE_QR_CODES = {
  wechat: '/static/qrcode_wechat.png',
  alipay: '/static/qrcode_alipay.png',
};

function openRechargeDialog(amount) {
  const customInput = $('rechargeCustomAmount');
  if (amount === undefined) {
    amount = customInput ? parseInt(customInput.value) || 0 : 0;
  }
  if (amount <= 0) {
    showToast(t('recharge_amount_invalid') || '请输入有效金额');
    return;
  }

  _rechargeAmount = amount;
  _rechargeMethod = null;

  // Update display
  $('rechargeDisplayAmount').textContent = `¥${amount}`;

  // Reset payment methods
  document.querySelectorAll('.recharge-method').forEach(el => el.classList.remove('selected'));
  $('rechargeCheckWechat').innerHTML = '';
  $('rechargeCheckAlipay').innerHTML = '';

  // Hide QR section
  $('rechargeQrSection').style.display = 'none';

  // Reset confirm button
  $('rechargeConfirmBtn').disabled = true;
  $('rechargeConfirmBtn').textContent = t('recharge_select_method') || '选择支付方式';

  // Show dialog
  $('rechargeDialogOverlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function selectRechargeMethod(method) {
  _rechargeMethod = method;

  // Update UI
  document.querySelectorAll('.recharge-method').forEach(el => el.classList.remove('selected'));
  document.querySelector(`.recharge-method[data-method="${method}"]`).classList.add('selected');

  $('rechargeCheckWechat').innerHTML = method === 'wechat' ? '<span style="color:#fff;font-size:12px">✓</span>' : '';
  $('rechargeCheckAlipay').innerHTML = method === 'alipay' ? '<span style="color:#fff;font-size:12px">✓</span>' : '';

  // Show QR code
  $('rechargeQrSection').style.display = 'block';
  $('rechargeQrTitle').textContent = t('recharge_scan_qr') || '请扫码支付';
  $('rechargePayMethodName').textContent = method === 'wechat' ? '微信' : '支付宝';
  $('rechargeAmountLabel').textContent = `¥${_rechargeAmount}`;

  // Set QR code image
  const qrImg = $('rechargeQrImg');
  const methodLabel = method === 'wechat' ? '微信支付收款码' : '支付宝收款码';
  $('rechargeQrLabel').textContent = methodLabel;

  // Use configured QR code URL, with fallback to local file
  qrImg.src = RECHARGE_QR_CODES[method] || `/static/qrcode_${method}.png`;
  qrImg.onerror = function() {
    // If custom URL fails, try local file
    this.src = `/static/qrcode_${method}.png`;
  };

  // Enable confirm button
  $('rechargeConfirmBtn').disabled = false;
  $('rechargeConfirmBtn').textContent = t('recharge_confirm') || '确认支付';
}

function confirmRecharge() {
  if (!_rechargeMethod) {
    showToast(t('recharge_select_amount_first') || '请先选择支付方式');
    return;
  }

  const btn = $('rechargeConfirmBtn');
  btn.disabled = true;
  btn.textContent = t('recharge_processing') || '处理中...';

  // Simple manual confirm — no API call, just show success
  setTimeout(() => {
    $('rechargeQrSection').innerHTML = `
      <div class="recharge-status">
        <div class="recharge-status-icon success">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="recharge-status-title">${t('recharge_success') || '充值成功！'}</div>
        <div class="recharge-status-desc">感谢您的充值！</div>
      </div>
    `;

    showToast(t('recharge_success') || '充值成功！');
    setTimeout(() => closeRechargeDialog(), 1500);
  }, 500);
}

function closeRechargeDialog() {
  $('rechargeDialogOverlay').style.display = 'none';
  document.body.style.overflow = '';
  _rechargeAmount = 0;
  _rechargeMethod = null;
}

// Recharge dialog event handlers
document.addEventListener('DOMContentLoaded', () => {
  const overlay = $('rechargeDialogOverlay');
  const closeBtn = $('rechargeDialogClose');
  const cancelBtn = $('rechargeCancelBtn');

  if (overlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeRechargeDialog();
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', closeRechargeDialog);
  if (cancelBtn) cancelBtn.addEventListener('click', closeRechargeDialog);
});

// ── Chat Task Files (Files Panel) ────────────────────────────────────��────────

let _taskFiles = [];  // { id, name, size, modified, category, source, exists }

// ── File type helpers ─────────────────────────────────────────────────────────
const _imgExts = new Set(['png','jpg','jpeg','gif','svg','webp','bmp','ico']);
const _videoExts = new Set(['mp4','webm','ogg','mov','avi','m4v','mkv']);
const _pdfExts = new Set(['pdf']);
const _officeExts = new Set(['docx','doc','xlsx','xls','pptx','ppt','wps']);
const _textExts = new Set(['txt','md','py','js','ts','json','csv','sh','css','yaml','yml','toml','log','env','html','htm']);

function _fileCategory(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (_imgExts.has(ext)) return 'image';
  if (_videoExts.has(ext)) return 'video';
  if (_pdfExts.has(ext)) return 'pdf';
  if (_officeExts.has(ext)) return 'office';
  if (_textExts.has(ext)) return 'text';
  return 'binary';
}

function _fileIcon(name, size) {
  const ext = name.split('.').pop().toLowerCase();
  const cat = _fileCategory(name);
  if (cat === 'image') return '<img src="/api/chat-files/' + name + '/content" style="width:' + (size||28) + 'px;height:' + (size||28) + 'px;object-fit:cover;border-radius:4px;border:1px solid var(--border);background:var(--code-bg)" loading="lazy" onerror="this.outerHTML=\'<span class=\\\'file-type-badge\\\' style=\\\'width:' + (size||28) + 'px;height:' + (size||28) + 'px\\\'' + ext.slice(0,3).toUpperCase() + '</span>\'">';
  const labels = { image: 'IMG', video: 'VID', pdf: 'PDF', office: ext.slice(0,4).toUpperCase(), text: ext.slice(0,3).toUpperCase(), binary: ext.slice(0,3).toUpperCase() };
  return '<span class="file-type-badge" style="width:' + (size||28) + 'px;height:' + (size||28) + 'px;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:var(--muted);background:var(--border)">' + (labels[cat]||ext.slice(0,3).toUpperCase()) + '</span>';
}

async function loadTaskFilesPanel() {
  // Render the Files panel inside the rightpanel
  const panel = $('panelWorkspace');
  if (!panel) return;
  const header = panel.querySelector('.panel-header span');
  if (header) header.textContent = 'Files';

  // Build task files HTML
  const container = panel.querySelector('.file-tree') || _buildTaskFilesContainer(panel);
  _renderTaskFilesList(container);

  // Clear breadcrumb and preview
  const bc = $('breadcrumbBar');
  if (bc) bc.style.display = 'none';
  const preview = $('previewArea');
  if (preview) preview.classList.remove('visible');
}

function _buildTaskFilesContainer(panel) {
  let tree = panel.querySelector('.file-tree');
  if (!tree) {
    tree = document.createElement('div');
    tree.className = 'file-tree task-files-list';
    tree.id = 'taskFilesList';
    const existing = panel.querySelector('.breadcrumb-bar, .preview-area');
    panel.insertBefore(tree, existing || panel.querySelector('.panel-actions'));
  }
  return tree;
}

async function _renderTaskFilesList(container) {
  try {
    const res = await api('/api/chat-files');
    _taskFiles = res.files || [];
  } catch (e) {
    _taskFiles = [];
  }

  if (!_taskFiles.length) {
    container.innerHTML = '<div style="padding:20px 12px;color:var(--muted);font-size:12px;text-align:center">' +
      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.35;margin-bottom:8px;display:block;margin:0 auto 8px">' +
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>' +
      '</svg>No task files yet.<br><span style="font-size:11px;opacity:.7">Upload attachments in chat or use the button below.</span>' +
      '<div style="margin-top:12px"><button class="tf-btn primary" onclick="uploadTaskFiles()" style="display:inline-flex;align-items:center;gap:6px;padding:6px 14px">' +
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>Upload Files</button></div>' +
      '</div>';
    return;
  }

  const parts = [];
  for (const f of _taskFiles) {
    const en = esc(f.name);
    const sizeStr = f.size ? formatSize(f.size) : '';
    const dateStr = f.modified ? new Date(f.modified * 1000).toLocaleDateString() : '';
    const cat = f.category || _fileCategory(f.name);

    parts.push('<div class="task-file-item" data-id="' + esc(f.id) + '">' +
      '<div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0;cursor:pointer" onclick="openTaskFile(\'' + esc(f.id) + '\')">' +
        _fileIcon(f.name, 32) +
        '<div style="min-width:0">' +
          '<div style="font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + en + '</div>' +
          '<div style="font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(f.source||'') + (sizeStr ? ' · ' + sizeStr : '') + (dateStr ? ' · ' + dateStr : '') + '</div>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:2px;flex-shrink:0">' +
        '<button class="tf-btn" onclick="event.stopPropagation();openTaskFile(\'' + esc(f.id) + '\')" title="Preview">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>' +
        '</button>' +
        '<button class="tf-btn" onclick="event.stopPropagation();downloadTaskFile(\'' + esc(f.id) + '\')" title="Download">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
        '</button>' +
        '<button class="tf-btn" onclick="event.stopPropagation();forwardTaskFileByEmail(\'' + esc(f.id) + '\')" title="Send by email">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>' +
        '</button>' +
        '<button class="tf-btn" onclick="event.stopPropagation();addTaskFileToAssets(\'' + esc(f.id) + '\')" title="Add to Assets">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
        '</button>' +
        '<button class="tf-btn danger" onclick="event.stopPropagation();removeTaskFile(\'' + esc(f.id) + '\')" title="Remove">' +
          '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 1 2 2 2v2"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>');
  }
  container.innerHTML = parts.join('');
}

let _taskFilesInput = null;

function uploadTaskFiles() {
  if (!_taskFilesInput) {
    _taskFilesInput = document.createElement('input');
    _taskFilesInput.type = 'file';
    _taskFilesInput.multiple = true;
    _taskFilesInput.accept = '*/*';
    _taskFilesInput.style.display = 'none';
    _taskFilesInput.onchange = async (e) => {
      const files = Array.from(e.target.files);
      if (!files.length) return;
      _taskFilesInput.value = '';
      await uploadTaskFilesToServer(files);
    };
    document.body.appendChild(_taskFilesInput);
  }
  _taskFilesInput.click();
}

async function uploadTaskFilesToServer(files) {
  const container = $('taskFilesList');
  for (const f of files) {
    try {
      const data = await fileToBase64(f);
      const res = await api('/api/chat-files', {
        method: 'POST',
        body: JSON.stringify({
          name: f.name,
          source: 'upload',
          data: data,
        }),
      });
      if (res.error) throw new Error(res.error);
    } catch (e) {
      showToast('Upload failed: ' + (e.message || f.name), 4000);
    }
  }
  // Refresh the list
  if (container) _renderTaskFilesList(container);
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function openTaskFile(fileId) {
  const f = _taskFiles.find(x => x.id === fileId);
  if (!f) return;

  // Show in preview area using the existing preview logic
  _previewCurrentPath = '/api/chat-files/' + fileId + '/content';
  _previewCurrentName = f.name;

  const previewArea = $('previewArea');
  const fileTree = $('fileTree') || $('taskFilesList');
  const panel = $('panelWorkspace');

  if (panel) {
    const header = panel.querySelector('.panel-header span');
    if (header) header.textContent = esc(f.name);
  }

  if (fileTree) fileTree.style.display = 'none';
  if ($('breadcrumbBar')) $('breadcrumbBar').style.display = 'none';
  if (previewArea) {
    previewArea.classList.add('visible');
    $('previewPathText').textContent = f.name;
    $('previewBadge').textContent = f.category || _fileCategory(f.name);
    $('previewBadge').className = 'preview-badge ' + (f.category || 'text');

    const cat = f.category || _fileCategory(f.name);
    $('previewCode').style.display = 'none';
    $('previewImgWrap').style.display = 'none';
    $('previewMd').style.display = 'none';

    const imgWrap = $('previewImgWrap');
    if (cat === 'image') {
      $('previewImg').src = '/api/chat-files/' + fileId + '/content';
      imgWrap.style.display = '';
    } else if (cat === 'text') {
      // Fetch text content and show
      try {
        const text = await fetch('/api/chat-files/' + fileId + '/content').then(r => r.text());
        $('previewCode').textContent = text;
        $('previewCode').style.display = '';
      } catch (e) { console.warn(e); }
    } else {
      // Binary types: show info only, offer download/open
      $('previewCode').innerHTML = '<div style="padding:16px;text-align:center">' +
        '<div style="font-size:48px;margin-bottom:12px">' + _fileIcon(f.name, 64) + '</div>' +
        '<div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:4px">' + esc(f.name) + '</div>' +
        '<div style="font-size:12px;color:var(--muted)">' + (f.size ? formatSize(f.size) : '') + ' · ' + (f.category||'').toUpperCase() + '</div>' +
        '<div style="margin-top:16px;display:flex;gap:8px;justify-content:center">' +
          '<button class="tf-btn primary" onclick="downloadTaskFile(\'' + esc(fileId) + '\')">Download</button>' +
          '<button class="tf-btn" onclick="forwardTaskFileByEmail(\'' + esc(fileId) + '\')">Send by Email</button>' +
        '</div>' +
      '</div>';
      $('previewCode').style.display = '';
    }
    $('previewEditArea').style.display = 'none';
  }
}

function downloadTaskFile(fileId) {
  const f = _taskFiles.find(x => x.id === fileId);
  if (!f) return;
  const a = document.createElement('a');
  a.href = '/api/chat-files/' + fileId + '/content';
  a.download = f.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function forwardTaskFileByEmail(fileId) {
  const f = _taskFiles.find(x => x.id === fileId);
  if (!f) return;
  showPromptDialog({
    title: 'Send by Email',
    message: 'Enter the recipient email address:',
    inputValue: '',
    inputPlaceholder: 'recipient@example.com',
    confirmLabel: 'Send',
  }).then(async (email) => {
    if (!email || !email.trim()) return;
    try {
      await api('/api/chat-files/forward', {
        method: 'POST',
        body: JSON.stringify({ id: fileId, to: email.trim(), subject: 'Hermes Task File: ' + f.name }),
      });
      showToast('Email sent to ' + email.trim());
    } catch (e) {
      showToast(e.message || 'Failed to send email', 5000);
    }
  });
}

async function addTaskFileToAssets(fileId) {
  const f = _taskFiles.find(x => x.id === fileId);
  if (!f) return;
  try {
    await api('/api/chat-files/add-to-assets', {
      method: 'POST',
      body: JSON.stringify({ id: fileId }),
    });
    showToast('Added to Assets: ' + f.name);
    if (_currentPanel === 'assets') loadAssetsPanel();
  } catch (e) {
    showToast(e.message || 'Failed to add to Assets', 5000);
  }
}

async function removeTaskFile(fileId) {
  try {
    await api('/api/chat-files/remove', { method: 'POST', body: JSON.stringify({ id: fileId }) });
    _taskFiles = _taskFiles.filter(f => f.id !== fileId);
    const container = $('taskFilesList');
    if (container) _renderTaskFilesList(container);
    showToast('File removed');
  } catch (e) {
    showToast(e.message || 'Failed to remove file', 4000);
  }
}

// ── Asset Library ──────────────────────────────────────────────────────────────

const _assets = [];  // cached assets list

function filterAssets() {
  const q = ($('assetsSearch')?.value || '').toLowerCase();
  _renderAssetsListView(q);
}

async function loadAssetsPanel() {
  try {
    const res = await api('/api/assets');
    const assets = res.assets || [];
    _assets.length = 0;
    assets.forEach(a => _assets.push(a));
    closeAssetDetail();
    _renderAssetsListView('');
  } catch (e) {
    const list = $('assetsListView');
    if (list) list.innerHTML = `<div style="color:var(--accent);font-size:12px;padding:8px">Failed to load assets: ${esc(e.message || e)}</div>`;
  }
}

// ── List view rendering (grid + date grouping) ──
function _renderAssetsListView(filter) {
  const list = $('assetsListView');
  if (!list) return;
  const filtered = filter
    ? _assets.filter(a => a.name.toLowerCase().includes(filter) || (a.source_path || '').toLowerCase().includes(filter))
    : _assets;
  if (!filtered.length) {
    list.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:12px;padding:20px 0">
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.4;margin-bottom:8px">
        <rect x="2" y="3" width="20" height="18" rx="2"/>
        <path d="M8 12h8"/>
        <path d="M12 8v8"/>
      </svg>
      ${_assets.length ? 'No assets match' : 'No assets yet.<br><span style="font-size:11px">Use the + Add button to save workspace files.</span>'}
    </div>`;
    return;
  }

  const videoExts = ['mp4','webm','ogg','mov','avi','m4v'];

  // Group assets by date (Today / Yesterday / This Week / Earlier)
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const groups = { today: [], yesterday: [], thisWeek: [], earlier: [] };
  const dayMs = 86400000;

  filtered.forEach(a => {
    const ts = a.modified ? a.modified * 1000 : 0;
    const assetDay = new Date(ts).setHours(0,0,0,0);
    if (assetDay >= today) groups.today.push(a);
    else if (assetDay >= today - dayMs) groups.yesterday.push(a);
    else if (assetDay >= today - 7 * dayMs) groups.thisWeek.push(a);
    else groups.earlier.push(a);
  });

  const groupLabel = { today: 'Today', yesterday: 'Yesterday', thisWeek: 'This Week', earlier: 'Earlier' };

  function buildGridItem(a) {
    const ext = a.name.split('.').pop().toLowerCase();
    const isImg = ['png','jpg','jpeg','gif','svg','webp','bmp','ico'].includes(ext);
    const isVideo = videoExts.includes(ext);
    const fileUrl = a.exists ? '/api/assets/' + esc(a.name) : '';
    const en = esc(a.name);

    let thumb;
    if (isImg && a.exists) {
      thumb = '<img class="asset-thumb" src="' + fileUrl + '" alt="' + en + '" loading="lazy" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--border);background:var(--code-bg)">';
    } else if (isVideo && a.exists) {
      thumb = '<img class="asset-thumb" src="' + fileUrl + '" alt="' + en + '" loading="lazy" style="width:48px;height:48px;object-fit:cover;border-radius:6px;border:1px solid var(--border);background:var(--code-bg)" onerror="this.style.display=\'none\'">';
    } else {
      thumb = '<span class="asset-thumb-label">' + ext.slice(0,3).toUpperCase() + '</span>';
    }

    return '<div class="asset-grid-item" data-name="' + en + '" onclick="openAssetDetail(\'' + en + '\',\'' + ext + '\')" title="' + en + '">' +
      thumb +
      '<span class="asset-name">' + en + '</span>' +
    '</div>';
  }

  function buildGroup(key, assets) {
    if (!assets.length) return '';
    const id = 'assetGrp_' + key;
    const collapsed = _collapsedAssetGroups && _collapsedAssetGroups.has(key);
    const caret = collapsed ? '▸' : '▾';
    let html = '<div class="asset-date-group">';
    html += '<div class="asset-date-header" onclick="toggleAssetGroup(\'' + key + '\')">';
    html += '<span class="asset-date-caret' + (collapsed ? ' collapsed' : '') + '">' + caret + '</span>';
    html += '<span>' + groupLabel[key] + '</span>';
    html += '<span style="margin-left:auto;font-weight:400;opacity:.7">' + assets.length + '</span>';
    html += '</div>';
    html += '<div class="assets-grid"' + (collapsed ? ' style="display:none"' : '') + ' id="' + id + '">';
    html += assets.map(a => buildGridItem(a)).join('');
    html += '</div></div>';
    return html;
  }

  list.innerHTML =
    buildGroup('today', groups.today) +
    buildGroup('yesterday', groups.yesterday) +
    buildGroup('thisWeek', groups.thisWeek) +
    buildGroup('earlier', groups.earlier);
}

// Track collapsed state for date groups
const _collapsedAssetGroups = new Set();

function toggleAssetGroup(key) {
  if (_collapsedAssetGroups.has(key)) {
    _collapsedAssetGroups.delete(key);
  } else {
    _collapsedAssetGroups.add(key);
  }
  const group = _assets; // re-render current view
  const q = ($('assetsSearch')?.value || '').toLowerCase();
  _renderAssetsListView(q);
}

// ── Asset detail view ──
function openAssetDetail(name, ext) {
  const list = $('assetsListView');
  const detail = $('assetsDetailView');
  if (!list || !detail) return;

  _currentPreviewAsset = name;
  const asset = _assets.find(a => a.name === name);

  list.style.display = 'none';
  detail.style.display = 'block';

  const fileUrl = `/api/assets/${encodeURIComponent(name)}`;
  const htmlParts = [];

  // Dual-column detail layout: header + body (preview | actions sidebar) + footer
  const sizeStr = asset && asset.size ? formatSize(asset.size) : '';
  const dateStr = asset && asset.modified ? new Date(asset.modified * 1000).toLocaleString() : '';
  const sourcePath = asset ? (asset.source_path || '') : '';

  detail.innerHTML =
    // Header
    '<div class="asset-detail-layout">' +
      '<div class="asset-detail-header">' +
        '<button class="asset-action-btn" onclick="closeAssetDetail()" title="Back" style="flex-shrink:0">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>' +
        '</button>' +
        '<div style="min-width:0;flex:1">' +
          '<div style="font-size:12px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(name) + '</div>' +
          '<div style="font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + (sourcePath ? esc(sourcePath) : '') + (sizeStr ? ' · ' + sizeStr : '') + '</div>' +
        '</div>' +
      '</div>' +
      // Body: preview | actions sidebar
      '<div class="asset-detail-body">' +
        // Preview pane
        '<div class="asset-detail-preview" id="assetDetailPreview">' +
          _buildAssetPreviewHtml(name, ext, fileUrl, asset) +
        '</div>' +
        // Actions sidebar
        '<div class="asset-detail-actions">' +
          // Info block
          '<div class="asset-info-block">' +
            '<div class="asset-info-name">' + esc(name) + '</div>' +
            '<div class="asset-info-meta">' +
              (sizeStr ? '<div>Size: ' + esc(sizeStr) + '</div>' : '') +
              (dateStr ? '<div>Modified: ' + esc(dateStr) + '</div>' : '') +
              (sourcePath ? '<div>Source: ' + esc(sourcePath) + '</div>' : '') +
            '</div>' +
          '</div>' +
          // Action rows
          (asset && asset.exists ? (
            '<div class="asset-action-row" onclick="pushAssetToChat(\'' + esc(name) + '\')">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
              '<span>Push to chat</span>' +
            '</div>' +
            '<div class="asset-action-row" onclick="copyAssetToWorkspace(\'' + esc(name) + '\')">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>' +
              '<span>Copy to workspace</span>' +
            '</div>'
          ) : '') +
          (isOfficeExt || isPdfExt ? (
            '<div class="asset-action-row" onclick="openAssetExternal(\'' + esc(name) + '\')">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>' +
              '<span>Open with app</span>' +
            '</div>'
          ) : '') +
          '<div class="asset-action-row" onclick="downloadAsset(\'' + esc(name) + '\')">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
            '<span>Download</span>' +
          '</div>' +
          '<div class="asset-action-row danger" onclick="removeAssetFromDetail(\'' + esc(name) + '\')">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 1 2 2 2v2"/></svg>' +
            '<span>Remove</span>' +
          '</div>' +
        '</div>' + // end actions
      '</div>' +   // end body
    '</div>';      // end layout

  // Lazy-load dynamic content (markdown, text files)
  _loadAssetDetailContent(name, ext, fileUrl);
}

function _buildAssetPreviewHtml(name, ext, fileUrl, asset) {
  const isImageExt = ['png','jpg','jpeg','gif','svg','webp','bmp','ico'].includes(ext);
  const isVideoExt = ['mp4','webm','ogg','mov','avi','m4v'].includes(ext);
  const isOfficeExt = ['ppt','pptx','doc','docx','xls','xlsx'].includes(ext);
  const isPdfExt = (ext === 'pdf');
  const isMdExt = (ext === 'md');
  const isHtmlExt = (ext === 'html' || ext === 'htm');
  const isTextExt = ['txt','py','js','ts','json','csv','sh','css','yaml','yml','toml','log','env','md'].includes(ext);

  if (isImageExt) {
    return '<img src="' + fileUrl + '" style="max-width:100%;max-height:50vh;object-fit:contain;border-radius:8px;border:1px solid var(--border)" alt="' + esc(name) + '">';
  } else if (isVideoExt) {
    return '<video src="' + fileUrl + '" controls style="max-width:100%;max-height:50vh;border-radius:8px"></video>';
  } else if (isPdfExt) {
    return '<iframe src="' + fileUrl + '" style="width:100%;height:50vh;border:1px solid var(--border);border-radius:8px"></iframe>';
  } else if (isHtmlExt) {
    return '<iframe src="' + fileUrl + '" style="width:100%;height:50vh;border:1px solid var(--border);border-radius:8px;background:#fff" sandbox="allow-same-origin"></iframe>';
  } else if (isOfficeExt) {
    const officeType = ext.toUpperCase();
    return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;min-height:200px;text-align:center">' +
      '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.5;margin-bottom:12px">' +
        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' +
      '</svg>' +
      '<div style="font-size:14px;font-weight:500;color:var(--text);margin-bottom:4px">' + officeType + ' Document</div>' +
      '<div style="font-size:12px;color:var(--muted);margin-bottom:16px">Preview not available. Use "Open with app" action.</div>' +
      (asset && asset.size ? '<div style="font-size:11px;color:var(--muted)">' + formatSize(asset.size) + '</div>' : '') +
    '</div>';
  } else if (isMdExt) {
    return '<div id="assetDetailMd" style="max-height:50vh;overflow-y:auto;width:100%"></div>';
  } else if (isTextExt) {
    return '<pre id="assetDetailCode" style="max-height:50vh;overflow-y:auto;width:100%;margin:0;white-space:pre-wrap;word-break:break-all"></pre>';
  } else {
    return '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;color:var(--muted)">' +
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.4;margin-bottom:10px">' +
        '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>' +
      '</svg>' +
      '<div style="font-size:13px;font-weight:500;color:var(--text);margin-bottom:4px">' + esc(ext.toUpperCase()) + ' File</div>' +
      '<div style="font-size:12px">Use Download to save this file.</div>' +
    '</div>';
  }
}

// After setting innerHTML for asset detail, call this to lazy-load dynamic content
function _loadAssetDetailContent(name, ext, fileUrl) {
  const isMdExt = (ext === 'md');
  const isTextExt = ['txt','py','js','ts','json','csv','sh','css','yaml','yml','toml','log','env','md'].includes(ext);

  if (isMdExt) {
    const el = $('assetDetailMd');
    if (el) {
      fetch(fileUrl).then(r => r.text()).then(text => {
        if (typeof renderMd === 'function') {
          el.innerHTML = renderMd(text);
          requestAnimationFrame(() => { if (typeof renderKatexBlocks === 'function') renderKatexBlocks(); });
        }
      }).catch(() => { el.textContent = 'Failed to load content'; });
    }
  } else if (isTextExt) {
    const el = $('assetDetailCode');
    if (el) {
      fetch(fileUrl).then(r => r.text()).then(text => { el.textContent = text; }).catch(() => { el.textContent = 'Failed to load content'; });
    }
  }
}
}

function closeAssetDetail() {
  const list = $('assetsListView');
  const detail = $('assetsDetailView');
  if (!list || !detail) return;

  _currentPreviewAsset = null;
  detail.style.display = 'none';
  detail.innerHTML = '';
  list.style.display = '';
}

function downloadAsset(name) {
  const a = document.createElement('a');
  a.href = `/api/assets/${encodeURIComponent(name)}`;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 100);
}

async function removeAssetFromDetail(name) {
  if (!await confirmAction(`Remove "${name}" from asset library?`)) return;
  try {
    closeAssetDetail();
    const workspaces = await api('/api/workspaces');
    const active = workspaces.last || workspaces.workspaces?.[0]?.path;
    await api('/api/assets/remove', { method: 'POST', body: JSON.stringify({ name, workspace: active }) });
    loadAssetsPanel();
  } catch (e) {
    showToast(e.message || e, 'error');
  }
}

// ── Push asset to chat ──
async function pushAssetToChat(name) {
  if (!S.session) { showToast('No active session', 'error'); return; }
  try {
    const rawUrl = `/api/assets/${encodeURIComponent(name)}`;
    const resp = await fetch(rawUrl);
    if (!resp.ok) throw new Error('Failed to fetch asset');
    const blob = await resp.blob();
    const mimeType = blob.type || guessMimeType(name);
    const file = new File([blob], name, { type: mimeType });
    if (typeof addFiles === 'function') {
      addFiles([file]);
      showToast(`Pushed "${name}" to chat`, 'success');
    } else {
      throw new Error('addFiles not available');
    }
  } catch (e) {
    showToast(e.message || 'Failed to push asset', 'error');
  }
}

function guessMimeType(name) {
  const ext = name.split('.').pop().toLowerCase();
  const map = {
    png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', gif:'image/gif', webp:'image/webp', svg:'image/svg+xml', bmp:'image/bmp', ico:'image/x-icon',
    pdf:'application/pdf',
    mp4:'video/mp4', webm:'video/webm', ogg:'video/ogg', mov:'video/quicktime', avi:'video/x-msvideo', m4v:'video/mp4',
    txt:'text/plain', md:'text/markdown', json:'application/json', csv:'text/csv',
    js:'application/javascript', py:'text/x-python', html:'text/html', htm:'text/html', css:'text/css',
    // Office documents
    doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls:'application/vnd.ms-excel', xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt:'application/vnd.ms-powerpoint', pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return map[ext] || 'application/octet-stream';
}

// Open asset with system default application
async function openAssetExternal(name) {
  try {
    const fileUrl = `/api/assets/${encodeURIComponent(name)}`;
    if (window.electronAPI && window.electronAPI.openExternal) {
      // In Electron, convert to file:// URL via a temporary download
      const resp = await fetch(fileUrl);
      if (!resp.ok) throw new Error('Failed to fetch file');
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      // Open the blob URL externally - Electron will handle it
      await window.electronAPI.openExternal(blobUrl);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      showToast(`Opening "${name}"...`, 'success');
    } else {
      // Fallback for browser: download the file and open
      downloadAsset(name);
      showToast('Download started. Open the file from your downloads folder.', 'success');
    }
  } catch (e) {
    showToast('Failed to open file: ' + (e.message || e), 'error');
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  return (bytes/(1024*1024)).toFixed(1) + ' MB';
}

async function removeAsset(name) {
  if (!await confirmAction(`Remove "${name}" from asset library?`)) return;
  try {
    const workspaces = await api('/api/workspaces');
    const active = workspaces.last || workspaces.workspaces?.[0]?.path;
    await api('/api/assets/remove', { method: 'POST', body: JSON.stringify({ name, workspace: active }) });
    loadAssetsPanel();
  } catch (e) {
    showToast(e.message || e, 'error');
  }
}

async function copyAssetToWorkspace(name) {
  try {
    const workspaces = await api('/api/workspaces');
    const active = workspaces.last || workspaces.workspaces?.[0]?.path;
    if (!active) { showToast('No active workspace', 'error'); return; }
    await api('/api/assets/copy', { method: 'POST', body: JSON.stringify({ name, workspace: active }) });
    showToast(`Copied "${name}" to workspace`, 'success');
    // Refresh workspace file tree
    if (typeof loadDir === 'function') loadDir('.');
    // Download the copied file and add to pendingFiles so it can be sent directly
    if (S.session && typeof addFiles === 'function') {
      try {
        const rawUrl = `/api/file/raw?session_id=${encodeURIComponent(S.session.session_id)}&path=${encodeURIComponent(name)}`;
        const resp = await fetch(rawUrl);
        if (resp.ok) {
          const fileBlob = await resp.blob();
          addFiles([new File([fileBlob], name, { type: fileBlob.type || '' })]);
        }
      } catch (e) {
        console.warn('Failed to attach copied file to composer', e);
      }
    }
  } catch (e) {
    showToast(e.message || e, 'error');
  }
}

async function showAssetAddDialog(preselectedName) {
  try {
    const workspaces = await api('/api/workspaces');
    const activeWs = workspaces.last || workspaces.workspaces?.[0]?.path;
    if (!activeWs) { showToast('No active workspace', 'error'); return; }
    // List workspace root directory using /api/list
    const files = await api(`/api/list?session_id=${S.session?.session_id || ''}&path=.`);
    const entries = (files.entries || []).filter(e => e.type !== 'directory');
    const fileEntries = entries.filter(e => e.type !== 'directory').map(e => ({
      name: e.name,
      path: e.name + (e.name.includes('.') ? '' : '')
    }));
    if (!fileEntries.length) {
      showToast('Workspace is empty', 'error');
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'app-dialog-overlay';
    overlay.style.display = 'block';
    overlay.innerHTML = `
      <div class="app-dialog" role="dialog" aria-modal="true" style="max-width:480px">
        <div class="app-dialog-header">
          <div class="app-dialog-title">Add to Asset Library</div>
          <button class="app-dialog-close" type="button" aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div style="display:flex;border-bottom:1px solid var(--border)">
          <button class="asset-add-tab active" data-tab="workspace" style="flex:1;padding:8px;text-align:center;font-size:12px;font-weight:500;color:var(--text);border:none;background:transparent;cursor:pointer;border-bottom:2px solid var(--blue);font-family:inherit">Workspace</button>
          <button class="asset-add-tab" data-tab="local" style="flex:1;padding:8px;text-align:center;font-size:12px;font-weight:500;color:var(--muted);border:none;background:transparent;cursor:pointer;border-bottom:2px solid transparent;font-family:inherit">Local Files</button>
        </div>
        <div id="assetAddBody" style="padding:12px;max-height:400px;overflow-y:auto">
          <div id="assetAddWorkspace" style="display:block">
            <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Workspace: <span style="color:var(--text)">${esc(activeWs)}</span></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px">
              ${fileEntries.map(f => `
                <div class="asset-add-item" data-name="${esc(f.name)}" data-source="workspace" onclick="selectAssetToAdd(this)" style="padding:10px;background:var(--code-bg);border:1px solid var(--border);border-radius:6px;cursor:pointer;text-align:center">
                  <div style="font-size:11px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.name)}</div>
                  <div style="font-size:10px;color:var(--muted)">${f.name.split('.').pop().toUpperCase()}</div>
                </div>
              `).join('')}
            </div>
          </div>
          <div id="assetAddLocal" style="display:none">
            <div style="border:2px dashed var(--border);border-radius:8px;padding:24px;text-align:center;cursor:pointer" onclick="document.getElementById('assetLocalInput').click()">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.5;margin-bottom:8px"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <div style="font-size:12px;color:var(--text)">Click to select files</div>
              <div style="font-size:10px;color:var(--muted);margin-top:4px">Images, PDF, Office, Code, etc.</div>
            </div>
            <input type="file" id="assetLocalInput" multiple accept="image/*,text/*,application/pdf,application/json,.md,.py,.js,.ts,.yaml,.yml,.toml,.csv,.sh,.txt,.log,.env,.ppt,.pptx,.xls,.xlsx,.doc,.docx" style="display:none" onchange="handleLocalFileSelect(this)">
            <div id="assetLocalPreview" style="margin-top:8px;display:none">
              <div style="font-size:11px;color:var(--muted);margin-bottom:4px">Selected files:</div>
              <div id="assetLocalFiles" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px"></div>
            </div>
          </div>
        </div>
        <div class="app-dialog-actions" style="padding:12px;border-top:1px solid var(--border)">
          <button class="app-dialog-btn" onclick="this.closest('.app-dialog-overlay').remove()">Cancel</button>
          <button class="app-dialog-btn confirm" id="assetAddConfirm" onclick="doAddAsset()" disabled>Add</button>
        </div>
      </div>
    `;

    // Tab switching (after overlay is in DOM)
    const tabs = overlay.querySelectorAll('.asset-add-tab');
    tabs.forEach(tab => {
      tab.onclick = () => {
        tabs.forEach(t => {
          t.style.color = 'var(--muted)';
          t.style.borderBottomColor = 'transparent';
        });
        tab.style.color = 'var(--text)';
        tab.style.borderBottomColor = 'var(--blue)';
        const target = tab.dataset.tab;
        overlay.querySelector('#assetAddWorkspace').style.display = target === 'workspace' ? '' : 'none';
        overlay.querySelector('#assetAddLocal').style.display = target === 'local' ? '' : 'none';
        // Reset selection state
        _selectedAssetAddName = '';
        _selectedAssetSource = '';
        const confirmBtn = overlay.querySelector('#assetAddConfirm');
        if (confirmBtn) confirmBtn.disabled = true;
      };
    });

    _assetAddOverlay = overlay;
    overlay.querySelector('.app-dialog-close').onclick = () => { _assetAddOverlay = null; overlay.remove(); };
    overlay.onclick = (e) => { if (e.target === overlay) { _assetAddOverlay = null; overlay.remove(); } };

    // Pre-select a workspace file if specified
    if (preselectedName) {
      const card = overlay.querySelector(`.asset-add-item[data-name="${esc(preselectedName)}"][data-source="workspace"]`);
      if (card) {
        selectAssetToAdd(card);
      }
    }

    document.body.appendChild(overlay);
  } catch (e) {
    showToast(e.message || e, 'error');
  }
}

let _selectedAssetAddName = '';
let _selectedAssetSource = ''; // 'workspace' or 'local'
let _localFileMap = {}; // name -> File object for local files
let _assetAddOverlay = null; // reference to current add-dialog overlay

function selectAssetToAdd(el) {
  document.querySelectorAll('.asset-add-item').forEach(i => i.style.borderColor = 'var(--border)');
  el.style.borderColor = 'var(--blue)';
  _selectedAssetAddName = el.dataset.name;
  _selectedAssetSource = el.dataset.source || 'workspace';
  const confirmBtn = document.getElementById('assetAddConfirm');
  if (confirmBtn) confirmBtn.disabled = false;
}

function handleLocalFileSelect(input) {
  const files = Array.from(input.files || []);
  if (!files.length) return;

  const preview = $('assetLocalPreview');
  const filesDiv = $('assetLocalFiles');
  if (!preview || !filesDiv) return;

  _localFileMap = {};
  _selectedAssetAddName = '';
  _selectedAssetSource = 'local';

  const confirmBtn = document.getElementById('assetAddConfirm');
  if (confirmBtn) confirmBtn.disabled = true;

  preview.style.display = 'block';
  filesDiv.innerHTML = files.map(f => {
    const ext = f.name.split('.').pop().toUpperCase();
    return `
      <div class="asset-add-item" data-name="${esc(f.name)}" data-source="local" onclick="selectAssetToAdd(this)" style="padding:10px;background:var(--code-bg);border:1px solid var(--border);border-radius:6px;cursor:pointer;text-align:center">
        <div style="font-size:11px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(f.name)}</div>
        <div style="font-size:10px;color:var(--muted)">${ext}</div>
      </div>`;
  }).join('');

  // Store File objects keyed by name
  files.forEach(f => { _localFileMap[f.name] = f; });
}

async function doAddAsset() {
  const name = _selectedAssetAddName;
  if (!name) { showToast('Please select a file first', 'error'); return; }
  const overlay = _assetAddOverlay;

  const closeOverlay = () => { try { overlay?.remove(); } catch (_) {} _assetAddOverlay = null; };

  try {
    if (_selectedAssetSource === 'local') {
      const file = _localFileMap[name];
      if (!file) { showToast('File not found', 'error'); closeOverlay(); return; }

      const fd = new FormData();
      fd.append('session_id', S.session?.session_id || '');
      fd.append('file', file, name);
      const uploadRes = await fetch(new URL('/api/upload', location.origin).href, {
        method: 'POST', credentials: 'include', body: fd
      });
      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(errText);
      }
      const uploadData = await uploadRes.json();
      if (uploadData.error) throw new Error(uploadData.error);

      const workspaces = await api('/api/workspaces');
      const activeWs = workspaces.last || workspaces.workspaces?.[0]?.path;
      await api('/api/assets/add', { method: 'POST', body: JSON.stringify({ name: uploadData.filename, source_path: uploadData.filename, workspace: activeWs }) });
    } else {
      const workspaces = await api('/api/workspaces');
      const activeWs = workspaces.last || workspaces.workspaces?.[0]?.path;
      await api('/api/assets/add', { method: 'POST', body: JSON.stringify({ name, source_path: name, workspace: activeWs }) });
    }
    closeOverlay();
    loadAssetsPanel();
  } catch (e) {
    showToast(e.message || e, 'error');
    closeOverlay();
  }
}

// Event wiring
