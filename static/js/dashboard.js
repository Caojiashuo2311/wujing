// ===== State =====
let currentUser = null;
let selectedTarget = null;
let analysisTab = null;       // null | 'enemy' | 'our' | 'battlefield' | 'analysis'
let analysisSubTab = 'dite';
let expandedNav = null;
let currentView = null;
let customModules = JSON.parse(localStorage.getItem('customAnalysisModules') || '[]');
let customData = JSON.parse(localStorage.getItem('targetCustomData') || '{}');
let analysisCustomData = JSON.parse(localStorage.getItem('analysisCustomData') || '{}');
let editAnalysisImages = [];
let typingTimer = null;

// ===== Init =====
document.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch('/api/me');
    const data = await res.json();
    if (data.user) { currentUser = data.user; document.getElementById('usernameDisplay').textContent = data.user.username; }
    else { location.href = '/login'; return; }
  } catch { location.href = '/login'; return; }
  // Restore persisted plan documents
  const savedPlan = localStorage.getItem('planDocuments');
  if (savedPlan) { try { DATA.planDocuments = JSON.parse(savedPlan); } catch(e) {} }
  startClock();
  renderNav();
  renderTargets();

  // Auto-open analysis tab if redirected from situation page
  const autoTab = localStorage.getItem('autoAnalysisTab');
  const autoSub = localStorage.getItem('autoAnalysisSubTab');
  if (autoTab) {
    // Show loading view first, then open analysis after delay
    analysisTab = autoTab;
    analysisSubTab = autoSub || { enemy:'dite', our:'liliang', battlefield:'ziran', analysis:'woqing' }[autoTab] || 'dite';
    expandedNav = 'analysis';
    renderNav();
    // show loading UI
    const mapView = document.getElementById('mapView');
    const detailView = document.getElementById('targetDetailView');
    const analysisViewEl = document.getElementById('analysisView');
    const loadingViewEl = document.getElementById('loadingView');
    if (mapView && detailView && analysisViewEl && loadingViewEl) {
      mapView.classList.add('hidden');
      detailView.classList.add('hidden');
      analysisViewEl.classList.add('hidden');
      loadingViewEl.classList.remove('hidden');
      const middleCol = document.querySelector('.middle');
      if (middleCol) middleCol.style.display = 'none';
      setTimeout(() => {
        loadingViewEl.classList.add('hidden');
        // clean auto flags now to avoid loop
        localStorage.removeItem('autoAnalysisTab');
        localStorage.removeItem('autoAnalysisSubTab');
        renderRightArea();
      }, 6000);
    } else {
      // Fallback if elements not ready
      localStorage.removeItem('autoAnalysisTab');
      localStorage.removeItem('autoAnalysisSubTab');
      renderRightArea();
    }
  }
});

// ===== Clock =====
function startClock() {
  const el = document.getElementById('timeDisplay');
  setInterval(() => {
    const now = new Date();
    el.textContent = now.toLocaleString('zh-CN', { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false });
  }, 1000);
}

// ===== Logout =====
async function logout() {
  await fetch('/api/logout', { method:'POST' });
  localStorage.clear();
  location.href = '/login';
}

// ===== Navigation =====
const navItems = [
  { id:'situation', label:'情况输入', icon:'/static/images/icons/icon_edit.png', href:'/situation' },
  { id:'analysis', label:'分析判断情况', icon:'/static/images/icons/icon_search.png', children:[
    { id:'enemy', label:'敌情', query:'enemy' },
    { id:'our', label:'我情', query:'our' },
    { id:'battlefield', label:'战场环境', query:'battlefield' },
    { id:'analysis_sub', label:'综合分析研判', query:'analysis' },
  ]},
  { id:'decision', label:'形成构想方案', icon:'/static/images/icons/icon_stamp.png', view:'decision' },
  { id:'concept', label:'定下作战决心', icon:'/static/images/icons/icon_bulb.png', view:'decisionPage' },
  { id:'plan', label:'拟制作战计划', icon:'/static/images/icons/icon_plan.png', view:'planPage' },
  { id:'wargame', label:'实施作战推演', icon:'/static/images/icons/icon_target.png', view:'wargamePage' },
];

function toggleSearchBox() {
  const input = document.getElementById('sidebarSearchInput');
  const btn = document.getElementById('searchBtn');
  if (input.style.display === 'none') {
    input.style.display = 'block';
    btn.style.display = 'none';
    input.focus();
  } else {
    input.style.display = 'none';
    btn.style.display = 'flex';
    input.value = '';
    filterNav('');
  }
}

function filterNav(keyword) {
  const container = document.getElementById('sidebarNav');
  const btns = container.querySelectorAll('.nav-btn');
  const kw = keyword.trim().toLowerCase();
  btns.forEach(btn => {
    const text = btn.textContent.toLowerCase();
    btn.parentElement.style.display = (!kw || text.includes(kw)) ? '' : 'none';
  });
}

function renderNav() {
  const container = document.getElementById('sidebarNav');
  container.innerHTML = '';
  navItems.forEach(item => {
    const div = document.createElement('div');
    // Main button
    const btn = document.createElement('button');
    btn.className = 'nav-btn';
    btn.innerHTML = `<img src="${item.icon || '/static/images/icons/icon_search.png'}"><span style="flex:1;text-align:left">${item.label}</span>`;
    if (item.children) {
      btn.innerHTML += `<span class="arrow">${expandedNav === item.id ? '▲' : '▼'}</span>`;
      btn.onclick = () => { expandedNav = expandedNav === item.id ? null : item.id; renderNav(); };
    } else if (item.view) {
      btn.onclick = () => { selectedTarget = null; analysisTab = null; currentView = item.view; renderRightArea(); };
    } else {
      btn.onclick = () => { location.href = item.href; };
    }
    div.appendChild(btn);
    // Children
    if (item.children && expandedNav === item.id) {
      const childDiv = document.createElement('div');
      childDiv.className = 'nav-children';
      item.children.forEach(sub => {
        const cbtn = document.createElement('button');
        cbtn.className = 'nav-child';
        cbtn.textContent = sub.label;
        cbtn.onclick = (e) => {
          e.stopPropagation();
          selectedTarget = null;
          currentView = null;
          const tabMap = { enemy:'dite', our:'liliang', battlefield:'ziran', analysis:'woqing' };
          analysisTab = sub.query;
          analysisSubTab = tabMap[sub.query] || 'dite';
          renderRightArea();
        };
        childDiv.appendChild(cbtn);
      });
      div.appendChild(childDiv);
    }
    container.appendChild(div);
  });
}

// ===== Target List =====
function renderTargets() {
  const list = document.getElementById('targetList');
  list.innerHTML = '';
  DATA.targets.forEach(t => {
    const btn = document.createElement('button');
    btn.className = 'target-item' + (selectedTarget === t.id ? ' active' : '');
    const iconColors = {yuezao:'red',shuigang:'orange',beipanjiang:'blue',faer:'red',panzhou:'green',pannan:'purple',biandian:'orange',tai794:'blue'};
    const c = iconColors[t.id]||'red';
    btn.innerHTML = `<div class="target-icon ${c}"><img src="${DATA.targetIcons[t.id] || '/static/images/icons/icon_factory.png'}"></div><span class="target-name color-${c}">${t.name}</span>`;
    btn.onclick = () => { selectedTarget = t.id; analysisTab = null; currentView = null; renderTargets(); renderRightArea(); };
    list.appendChild(btn);
  });
}

// ===== Show Map Detail =====
function showMapDetail() {
  const mapView = document.getElementById('mapView');
  mapView.innerHTML = '<img src="/static/images/enemy_flow_map.jpeg" alt="敌特分子活动情况图">';
  
  const detailView = document.getElementById('targetDetailView');
  const analysisViewEl = document.getElementById('analysisView');
  
  mapView.classList.remove('hidden');
  detailView.classList.add('hidden');
  analysisViewEl.classList.add('hidden');
  
  const middleCol = document.querySelector('.middle');
  if (middleCol) middleCol.style.display = '';
}

// ===== Right Area =====
function renderRightArea() {
  const mapView = document.getElementById('mapView');
  const detailView = document.getElementById('targetDetailView');
  const analysisViewEl = document.getElementById('analysisView');
  const loadingViewEl = document.getElementById('loadingView');
  const decisionViewEl = document.getElementById('decisionView');

  // Always hide loading view first
  if (loadingViewEl) loadingViewEl.classList.add('hidden');
  
  mapView.classList.add('hidden');
  detailView.classList.add('hidden');
  analysisViewEl.classList.add('hidden');
  loadingViewEl.classList.add('hidden');
  if (decisionViewEl) { decisionViewEl.classList.add('hidden'); decisionViewEl.style.display = 'none'; }

  // Show/hide entire middle column (visible on home and target detail views)
  const middleCol = document.querySelector('.middle');
  const isHomeOrTarget = !currentView && !analysisTab;
  if (middleCol) middleCol.style.display = isHomeOrTarget ? '' : 'none';

  if (currentView === 'decision' || currentView === 'decisionPage') {
    if (decisionViewEl) { decisionViewEl.classList.remove('hidden'); decisionViewEl.style.display = 'flex'; }
    if (currentView === 'decisionPage') renderDecisionPageView();
    else renderDecisionView();
  } else if (currentView === 'planPage') {
    if (decisionViewEl) { decisionViewEl.classList.remove('hidden'); decisionViewEl.style.display = 'flex'; }
    renderPlanPageView();
  } else if (currentView === 'wargamePage') {
    if (decisionViewEl) { decisionViewEl.classList.remove('hidden'); decisionViewEl.style.display = 'flex'; }
    renderWargamePageView();
  } else if (analysisTab) {
    analysisViewEl.classList.remove('hidden');
    renderAnalysis();
  } else if (selectedTarget) {
    detailView.classList.remove('hidden');
    renderTargetDetail();
  } else {
    mapView.classList.remove('hidden');
    mapView.innerHTML = '<img src="/static/images/target_map_v3.jpeg" alt="目标分布图">';
  }
}

// ===== Target Detail =====
function renderTargetDetail() {
  const t = DATA.targets.find(x => x.id === selectedTarget);
  if (!t) return;
  const custom = customData[selectedTarget];
  const title = custom?.title || t.title;
  const desc = custom?.content || t.description;
  const images = custom?.images || t.extraImages || [t.image];
  const container = document.getElementById('targetDetailView');
  container.innerHTML = `
    <div class="target-detail-border"></div>
    <div class="target-detail-header">
      <h3>${title}</h3>
      <button class="btn-blue" onclick="startEditTarget()" style="position:absolute;right:24px;top:12px;z-index:10;padding:4px 12px;font-size:0.75rem;border-radius:4px;background:rgba(255,255,255,0.2);color:#fff;border:1px solid rgba(255,255,255,0.4);cursor:pointer">编辑</button>
    </div>
    <div class="target-detail-text"><p id="typedText"></p></div>
    <div class="target-detail-images" data-title="${title}" data-content="${desc}">
      ${images.map(img => `<img data-src="${img}" alt="" class="clickable-image" style="background:#333;opacity:0;transition:opacity 0.3s" data-img="${img}">`).join('')}
    </div>
  `;
  // Show text immediately (PPT style)
  document.getElementById('typedText').textContent = desc;
  
  // Async load images
  setTimeout(() => {
    const imageContainer = document.querySelector('.target-detail-images');
    if (imageContainer) {
      const imgs = imageContainer.querySelectorAll('.clickable-image');
      const titleText = imageContainer.getAttribute('data-title');
      const contentText = imageContainer.getAttribute('data-content');
      imgs.forEach((img, idx) => {
        setTimeout(() => {
          const src = img.getAttribute('data-src');
          img.src = src;
          img.style.opacity = '1';
          img.addEventListener('click', (e) => {
            e.stopPropagation();
            openImageModal(img.getAttribute('data-img'), titleText, contentText);
          });
        }, idx * 100);
      });
    }
  }, 0);
}

function closeTargetDetail() {
  selectedTarget = null;
  renderTargets();
  renderRightArea();
}

// ===== Image Modal =====
function openImageModal(imageSrc, title, content) {
  const modal = document.getElementById('imageModal');
  document.getElementById('imageModalImg').src = imageSrc;
  document.getElementById('imageModalTitle').textContent = title;
  document.getElementById('imageModalContent').textContent = content;
  modal.classList.remove('hidden');
}

function closeImageModal() {
  const modal = document.getElementById('imageModal');
  modal.classList.add('hidden');
}

let editImages = [];

function startEditTarget() {
  const t = DATA.targets.find(x => x.id === selectedTarget);
  if (!t) return;
  const custom = customData[selectedTarget];
  editImages = custom?.images ? [...custom.images] : [...(t.extraImages || [t.image])];
  const container = document.getElementById('targetDetailView');
  container.innerHTML = `
    <div class="target-detail-header"><h3>编辑目标信息</h3>
      <div style="display:flex;gap:8px">
        <button class="btn-blue" onclick="saveEditTarget()" style="padding:6px 16px;border-radius:4px;background:#1976d2;color:#fff;font-weight:bold;cursor:pointer;border:none">保存</button>
        <button class="btn-military" onclick="renderTargetDetail()" style="padding:6px 16px;border-radius:4px;background:#555;color:#fff;cursor:pointer;border:none">取消</button>
      </div>
    </div>
    <div style="padding:16px;display:flex;flex-direction:column;gap:12px;flex:1;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:8px">
        <label style="color:#fff;font-size:0.85rem;min-width:40px">标题：</label>
        <input id="editTitle" value="${custom?.title || t.title}" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.3);border-radius:4px;color:#fff;font-size:0.9rem">
      </div>
      <div style="display:flex;gap:8px;flex:1">
        <label style="color:#fff;font-size:0.85rem;min-width:40px;padding-top:10px">内容：</label>
        <textarea id="editContent" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.3);border-radius:4px;color:#fff;font-size:0.9rem;resize:none">${custom?.content || t.description}</textarea>
      </div>
      <div>
        <label style="color:#fff;font-size:0.85rem">图片（点击替换）：</label>
        <div id="editImagesRow" style="display:flex;gap:8px;margin-top:8px"></div>
      </div>
    </div>
  `;
  renderEditImages();
}

function renderEditImages() {
  const row = document.getElementById('editImagesRow');
  row.innerHTML = editImages.map((img, i) => `
    <label style="cursor:pointer;flex:1;position:relative">
      <img src="${img}" style="width:100%;height:100px;object-fit:cover;border-radius:4px;border:2px solid rgba(255,255,255,0.3)">
      <div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.6);color:#fff;font-size:0.6rem;padding:2px 6px;border-radius:3px">替换</div>
      <input type="file" accept="image/*" style="display:none" onchange="replaceEditImage(this,${i})">
    </label>
  `).join('') + `
    <label style="cursor:pointer;width:80px;height:100px;border:2px dashed rgba(255,255,255,0.3);border-radius:4px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.5);font-size:2rem">
      +
      <input type="file" accept="image/*" style="display:none" onchange="addEditImage(this)">
    </label>`;
}

function replaceEditImage(input, idx) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => { editImages[idx] = e.target.result; renderEditImages(); };
  reader.readAsDataURL(file);
}

function addEditImage(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => { editImages.push(e.target.result); renderEditImages(); };
  reader.readAsDataURL(file);
}

function saveEditTarget() {
  const title = document.getElementById('editTitle').value;
  const content = document.getElementById('editContent').value;
  customData[selectedTarget] = { title, content, images: editImages };
  localStorage.setItem('targetCustomData', JSON.stringify(customData));
  renderTargetDetail();
}

// ===== Analysis Card Editing (for grid cards) =====
function startEditAnalysisCard(tab, sub) {
  const key = `${tab}_${sub}`;
  const custom = analysisCustomData[key] || {};
  const el = document.getElementById('analysisView');
  
  // Get card label
  let cardLabel = '';
  if (tab === 'enemy') {
    const item = DATA.enemyInfo[sub];
    cardLabel = item ? item.label : '';
  } else if (tab === 'our') {
    const item = DATA.ourInfo[sub];
    cardLabel = item ? item.label : '';
  } else if (tab === 'battlefield') {
    const item = DATA.battlefieldEnv[sub];
    cardLabel = item ? item.label : '';
  } else if (tab === 'analysis_detail') {
    const categories = {
      woqing: '我情分析',
      duibi: '敌我对比',
      zhanchang: '战场环境分析',
    };
    cardLabel = categories[sub] || '';
  } else if (tab === 'custom') {
    const mod = customModules.find(m => m.id === sub);
    cardLabel = mod ? mod.name : '';
  }
  
  editAnalysisImages = custom.images ? [...custom.images] : [];
  
  el.innerHTML = `
    <div class="analysis-border"></div>
    <div class="target-detail-header">
      <h3>编辑卡片</h3>
      <div style="display:flex;gap:8px">
        <button class="btn-blue" onclick="saveEditAnalysisCard('${tab}','${sub}')" style="padding:6px 16px;border-radius:4px;background:#1976d2;color:#fff;font-weight:bold;cursor:pointer;border:none">保存</button>
        <button class="btn-military" onclick="renderAnalysisGrid(document.getElementById('analysisView'))" style="padding:6px 16px;border-radius:4px;background:#555;color:#fff;cursor:pointer;border:none">取消</button>
      </div>
    </div>
    <div style="padding:16px;display:flex;flex-direction:column;gap:12px;flex:1;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:8px">
        <label style="color:#fff;font-size:0.85rem;min-width:40px">标题：</label>
        <input id="editCardTitle" value="${custom.title || cardLabel}" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.3);border-radius:4px;color:#fff;font-size:0.9rem">
      </div>
      <div style="display:flex;gap:8px;flex:1">
        <label style="color:#fff;font-size:0.85rem;min-width:40px;padding-top:10px">内容：</label>
        <textarea id="editCardContent" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.3);border-radius:4px;color:#fff;font-size:0.9rem;resize:none">${custom.content || ''}</textarea>
      </div>
      <div>
        <label style="color:#fff;font-size:0.85rem">图片（点击替换或添加）：</label>
        <div id="editCardImagesRow" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"></div>
      </div>
    </div>
  `;
  renderEditCardImages();
}

function renderEditCardImages() {
  const container = document.getElementById('editCardImagesRow');
  container.innerHTML = editAnalysisImages.map((img, i) => `
    <div style="position:relative;width:80px;height:80px;border-radius:4px;overflow:hidden;background:rgba(0,0,0,0.3)">
      <img src="${img}" style="width:100%;height:100%;object-fit:cover">
      <label style="position:absolute;bottom:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;font-size:0.6rem;padding:2px 4px;border-radius:2px;cursor:pointer">替换
        <input type="file" accept="image/*" style="display:none" onchange="replaceCardImage(this,${i})">
      </label>
      <button style="position:absolute;top:2px;right:2px;background:rgba(255,0,0,0.7);color:#fff;border:none;border-radius:2px;width:16px;height:16px;padding:0;cursor:pointer;font-size:0.7rem" onclick="removeCardImage(${i})">×</button>
    </div>
  `).join('') + `
    <label style="cursor:pointer;width:80px;height:80px;border:2px dashed rgba(255,255,255,0.3);border-radius:4px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.5);font-size:2rem">
      +
      <input type="file" accept="image/*" style="display:none" onchange="addCardImage(this)">
    </label>
  `;
}

function replaceCardImage(input, idx) {
  if (!input.files[0]) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    editAnalysisImages[idx] = e.target.result;
    renderEditCardImages();
  };
  reader.readAsDataURL(input.files[0]);
}

function addCardImage(input) {
  if (!input.files[0]) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    editAnalysisImages.push(e.target.result);
    renderEditCardImages();
  };
  reader.readAsDataURL(input.files[0]);
}

function removeCardImage(idx) {
  editAnalysisImages.splice(idx, 1);
  renderEditCardImages();
}

function saveEditAnalysisCard(tab, sub) {
  const key = `${tab}_${sub}`;
  const title = document.getElementById('editCardTitle').value.trim();
  const content = document.getElementById('editCardContent').value.trim();
  
  if (!title) {
    alert('标题不能为空');
    return;
  }
  
  analysisCustomData[key] = { title, content, images: editAnalysisImages };
  localStorage.setItem('analysisCustomData', JSON.stringify(analysisCustomData));
  renderAnalysisGrid(document.getElementById('analysisView'));
}

// ===== Edit Analysis Title Only =====
function startEditAnalysisTitle() {
  const key = `${analysisTab}_${analysisSubTab}`;
  const custom = analysisCustomData[key] || {};
  
  // Get current title
  let currentTitle = custom.title || '';
  if (!currentTitle) {
    if (analysisTab === 'enemy') {
      const category = DATA.enemyInfo[analysisSubTab];
      currentTitle = category ? category.label : '';
    } else if (analysisTab === 'our') {
      const item = DATA.ourInfo[analysisSubTab];
      currentTitle = item ? item.label : '';
    } else if (analysisTab === 'battlefield') {
      const item = DATA.battlefieldEnv[analysisSubTab];
      currentTitle = item ? item.label : '';
    }
  }
  
  const el = document.getElementById('analysisView');
  el.innerHTML = `
    <div class="analysis-border"></div>
    <div class="target-detail-header">
      <h3>编辑分类名称</h3>
      <div style="display:flex;gap:8px">
        <button class="btn-blue" onclick="saveEditAnalysisTitle()" style="padding:6px 16px;border-radius:4px;background:#1976d2;color:#fff;font-weight:bold;cursor:pointer;border:none">保存</button>
        <button class="btn-military" onclick="renderRightArea()" style="padding:6px 16px;border-radius:4px;background:#555;color:#fff;cursor:pointer;border:none">取消</button>
      </div>
    </div>
    <div style="padding:16px;display:flex;flex-direction:column;gap:12px;flex:1;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:8px">
        <label style="color:#fff;font-size:0.85rem;min-width:60px">分类名称：</label>
        <input id="editTitleInput" value="${currentTitle}" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.3);border-radius:4px;color:#fff;font-size:0.9rem">
      </div>
    </div>
  `;
}

function saveEditAnalysisTitle() {
  const key = `${analysisTab}_${analysisSubTab}`;
  const newTitle = document.getElementById('editTitleInput').value.trim();
  
  if (!newTitle) {
    alert('分类名称不能为空');
    return;
  }
  
  // Update or create custom data with new title
  if (!analysisCustomData[key]) {
    analysisCustomData[key] = {};
  }
  analysisCustomData[key].title = newTitle;
  localStorage.setItem('analysisCustomData', JSON.stringify(analysisCustomData));
  renderRightArea();
}

// ===== Helper: strip HTML tags for textarea display =====
function stripHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || '';
}

// ===== Analysis Content Editing =====
function startEditAnalysis() {
  const key = `${analysisTab}_${analysisSubTab}`;
  const custom = analysisCustomData[key] || {};
  const el = document.getElementById('analysisView');
  
  // Get current content from original data or custom data
  let currentTitle = '';
  let currentContent = '';
  let currentImages = [];
  
  // Check if custom data exists
  const hasCustomData = custom.contentTitle || custom.title || custom.content || custom.images;
  
  if (hasCustomData) {
    // Use custom data if available (contentTitle for section heading, title for tab label)
    currentTitle = custom.contentTitle || '';
    currentContent = custom.content || '';
    currentImages = custom.images ? [...custom.images] : [];
  } else {
    // Use original data - show section title (not tab label) for content editing
    if (analysisTab === 'enemy') {
      const category = DATA.enemyInfo[analysisSubTab];
      if (category) {
        // Use section title for content heading, not the tab label
        if (category.sections && category.sections.length > 0) {
          currentTitle = category.sections[0].title || category.label || '';
          currentContent = category.sections[0].content || '';
          currentImages = category.sections[0].image ? [category.sections[0].image] : [];
        } else {
          currentTitle = category.label || '';
        }
      }
    } else if (analysisTab === 'our') {
      const item = DATA.ourInfo[analysisSubTab];
      if (item) {
        currentTitle = item.label || '';
        currentContent = item.content || '';
        currentImages = item.images ? [...item.images] : (item.image ? [item.image] : []);
      }
    } else if (analysisTab === 'battlefield') {
      const item = DATA.battlefieldEnv[analysisSubTab];
      if (item) {
        currentTitle = item.label || '';
        currentContent = item.content || '';
        currentImages = item.image ? [item.image] : [];
      }
    }
  }
  
  // Strip HTML tags for textarea display
  currentContent = stripHtml(currentContent);
  editAnalysisImages = currentImages;
  
  el.innerHTML = `
    <div class="analysis-border"></div>
    <div class="target-detail-header">
      <h3>编辑分析内容</h3>
      <div style="display:flex;gap:8px">
        <button class="btn-blue" onclick="saveEditAnalysis()" style="padding:6px 16px;border-radius:4px;background:#1976d2;color:#fff;font-weight:bold;cursor:pointer;border:none">保存</button>
        <button class="btn-military" onclick="renderRightArea()" style="padding:6px 16px;border-radius:4px;background:#555;color:#fff;cursor:pointer;border:none">取消</button>
      </div>
    </div>
    <div style="padding:16px;display:flex;flex-direction:column;gap:12px;flex:1;overflow-y:auto">
      <div style="display:flex;align-items:center;gap:8px">
        <label style="color:#fff;font-size:0.85rem;min-width:60px">内容标题：</label>
        <input id="editAnalysisTitle" value="${currentTitle}" placeholder="内容区域显示的标题（不影响标签名称）" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.3);border-radius:4px;color:#fff;font-size:0.9rem">
      </div>
      <div style="display:flex;gap:8px;flex:1">
        <label style="color:#fff;font-size:0.85rem;min-width:40px;padding-top:10px">内容：</label>
        <textarea id="editAnalysisContent" style="flex:1;padding:10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.3);border-radius:4px;color:#fff;font-size:0.9rem;resize:none">${currentContent}</textarea>
      </div>
      <div>
        <label style="color:#fff;font-size:0.85rem">图片（点击替换或添加）：</label>
        <div id="editAnalysisImagesRow" style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap"></div>
      </div>
    </div>
  `;
  renderEditAnalysisImages();
}

function renderEditAnalysisImages() {
  const row = document.getElementById('editAnalysisImagesRow');
  row.innerHTML = editAnalysisImages.map((img, i) => `
    <div style="position:relative;width:80px;height:80px;border:2px solid rgba(255,255,255,0.3);border-radius:4px;overflow:hidden;cursor:pointer">
      <img src="${img}" style="width:100%;height:100%;object-fit:cover">
      <label style="position:absolute;bottom:2px;right:2px;background:rgba(0,0,0,0.6);color:#fff;font-size:0.6rem;padding:2px 4px;border-radius:2px;cursor:pointer">替换
        <input type="file" accept="image/*" style="display:none" onchange="replaceAnalysisImage(this,${i})">
      </label>
      <button style="position:absolute;top:2px;right:2px;background:rgba(255,0,0,0.7);color:#fff;border:none;border-radius:2px;width:16px;height:16px;padding:0;cursor:pointer;font-size:0.7rem" onclick="removeAnalysisImage(${i})">×</button>
    </div>
  `).join('') + `
    <label style="cursor:pointer;width:80px;height:80px;border:2px dashed rgba(255,255,255,0.3);border-radius:4px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,0.5);font-size:2rem">
      +
      <input type="file" accept="image/*" style="display:none" onchange="addAnalysisImage(this)">
    </label>`;
}

function replaceAnalysisImage(input, idx) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    editAnalysisImages[idx] = e.target.result;
    renderEditAnalysisImages();
  };
  reader.readAsDataURL(file);
}

function addAnalysisImage(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    editAnalysisImages.push(e.target.result);
    renderEditAnalysisImages();
  };
  reader.readAsDataURL(file);
}

function removeAnalysisImage(idx) {
  editAnalysisImages.splice(idx, 1);
  renderEditAnalysisImages();
}

function saveEditAnalysis() {
  const contentTitle = document.getElementById('editAnalysisTitle').value;
  const content = document.getElementById('editAnalysisContent').value;
  const key = `${analysisTab}_${analysisSubTab}`;
  // Preserve existing tab title (set via "编辑名称"), only update content fields
  const existing = analysisCustomData[key] || {};
  analysisCustomData[key] = { ...existing, contentTitle, content, images: editAnalysisImages };
  localStorage.setItem('analysisCustomData', JSON.stringify(analysisCustomData));
  renderRightArea();
}

// ===== Analysis Rendering =====
function renderAnalysis() {
  const el = document.getElementById('analysisView');
  if (analysisTab === 'analysis') {
    renderAnalysisGrid(el);
  } else if (analysisTab === 'analysis_diqing') {
    renderDiqingDetailView(el);
  } else if (analysisTab === 'analysis_woqing') {
    renderAnalysisWoqingView(el);
  } else if (analysisTab === 'enemy') {
    renderEnemyView(el);
  } else if (analysisTab === 'our') {
    renderOurView(el);
  } else if (analysisTab === 'battlefield') {
    renderBattlefieldView(el);
  } else if (analysisTab === 'analysis_detail') {
    renderAnalysisDetailView(el);
  }
}

// ===== Analysis Grid (2x2) =====
function renderAnalysisGrid(el) {
  let customCards = customModules.map(m => `
    <div class="card" onclick="setAnalysisTab('analysis_detail','${m.id}')" style="background:linear-gradient(135deg,#1a5276,#2a7aaa);position:relative">
      <div class="card-label">${m.name}</div>
      <button class="card-edit-btn" onclick="event.stopPropagation();startEditAnalysisCard('custom','${m.id}')" style="position:absolute;top:4px;right:4px;background:#1976d2;color:#fff;border:none;border-radius:3px;padding:4px 8px;font-size:0.7rem;cursor:pointer">编辑</button>
    </div>`).join('');

  el.innerHTML = `
    <div class="analysis-border"></div>
    <div class="analysis-title-bar">
      <img src="/static/images/icons/icon_bulb.png"><h2>综合分析研判</h2>
    </div>
    <div class="card-grid">
      <div class="card" onclick="analysisTab='analysis_diqing';renderRightArea()" style="position:relative">
        <img src="/static/images/zh_dijing.png">
        <button class="card-edit-btn" onclick="event.stopPropagation();startEditAnalysisCard('analysis_diqing','')" style="position:absolute;top:4px;right:4px;background:#1976d2;color:#fff;border:none;border-radius:3px;padding:4px 8px;font-size:0.7rem;cursor:pointer">编辑</button>
      </div>
      <div class="card" onclick="analysisTab='analysis_woqing';analysisSubTab='page1';renderRightArea()" style="position:relative">
        <img src="/static/images/zh_wojing.png">
        <button class="card-edit-btn" onclick="event.stopPropagation();startEditAnalysisCard('analysis_woqing','page1')" style="position:absolute;top:4px;right:4px;background:#1976d2;color:#fff;border:none;border-radius:3px;padding:4px 8px;font-size:0.7rem;cursor:pointer">编辑</button>
      </div>
      <div class="card" onclick="analysisTab='analysis_detail';analysisSubTab='duibi';renderRightArea()" style="position:relative;background:linear-gradient(135deg,rgba(26,82,118,0.7),rgba(42,122,170,0.7)),url('/static/images/敌我能力对比.jpg');background-size:cover;background-position:center;display:flex;align-items:center;justify-content:center">
        <div style="font-size:2.4rem;font-weight:900;color:#ffd700;text-align:center;letter-spacing:4px;text-shadow:0 2px 8px rgba(0,0,0,0.5)">敌我能力对比</div>
        <button class="card-edit-btn" onclick="event.stopPropagation();startEditAnalysisCard('analysis_detail','duibi')" style="position:absolute;top:4px;right:4px;background:#1976d2;color:#fff;border:none;border-radius:3px;padding:4px 8px;font-size:0.7rem;cursor:pointer">编辑</button>
      </div>
      <div class="card" onclick="analysisTab='battlefield';analysisSubTab='ziran';renderRightArea()" style="position:relative">
        <img src="/static/images/zh_zhanchang.png">
        <button class="card-edit-btn" onclick="event.stopPropagation();startEditAnalysisCard('battlefield','ziran')" style="position:absolute;top:4px;right:4px;background:#1976d2;color:#fff;border:none;border-radius:3px;padding:4px 8px;font-size:0.7rem;cursor:pointer">编辑</button>
      </div>
      ${customCards}
    </div>
    
  `;
}

// ===== Diqing Detail View =====
function renderDiqingDetailView(el) {
  el.innerHTML = `
    <div class="analysis-border"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(0,0,0,0.2)">
      <div style="flex:1">
        <div class="detail-title" style="margin:0;font-size:2.4rem">敌特活动态势图</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-military" onclick="analysisTab='analysis';renderRightArea()" style="padding:6px 12px;border-radius:4px;background:#1976d2;color:#fff;cursor:pointer;border:none;font-size:0.85rem">返回</button>
      </div>
    </div>
    <div class="detail-content" style="display:flex;flex-direction:column;flex:1;min-height:0;padding:16px">
      <div style="flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden">
        <img src="/static/images/diqing.jpg" style="max-width:100%;max-height:100%;object-fit:contain;border-radius:4px">
      </div>
    </div>
  `;
}

// ===== Analysis Woqing View (4 pages, 2 cards per page) =====
function renderAnalysisWoqingView(el) {
  const pages = [
    { id:'page1', cards:[
      { title:'兵力配置', content:'支队总兵力XXX人，其中，首长机关XX人、机动中队XX人、后勤"一组三队"XX人可随时担负月照机场重要目标防卫任务，友邻基干民兵10人、民警10人可随时增援。', image:'/static/images/woqing1.jpg' },
      { title:'作战能力', content:'所属力量齐装满员、训练有素；基层组织健全，官兵立场坚定、士气高昂；军地联保机制健全，资源丰富、渠道畅通。', image:'/static/images/woqing2.jpg' }
    ]},
    { id:'page2', cards:[
      { title:'侦察情报能力', content:'支队XX名兼职情报侦查员战斗全市XX支民兵侦察侦测分队XXX人，情报触角遍布3区、1市，可延伸至各乡镇（街道）。', image:'/static/images/woqing3.jpg' },
      { title:'指挥控制能力', content:'全市建有地面应急指挥中心X个、基本指挥所2个、机动指挥所1个；支队建有1个基本指挥所，网络、视频、北斗、短波等指挥通联手段延伸至各中队。', image:'/static/images/woqing4.jpg' }
    ]},
    { id:'page3', cards:[
      { title:'信息通信能力', content:'全市有信息动员机构1个、大型网络安全企业8家、网络数据信息56家、公有云3台套、通信运营企业4个，无线电管理机构1个、无线电管理技术支撑单位1个。', image:'/static/images/woqing5.jpg' },
      { title:'目标防卫能力', content:'支队XX个"两看"执勤分队战备值班力量XX人，共XX名兵力可用于加强就近重要目标防卫；X个机动中队XX名兵力能快速机动支援辖区重要目标防卫。', image:'/static/images/woqing6.jpg' }
    ]},
    { id:'page4', cards:[
      { title:'政治工作能力', content:'支队共有营级以上党委1个，基层党支部13个，国动系统编建认知攻防民兵分队4支80人，可为我政治工作提供有力支撑。', image:'/static/images/woqing7.jpg' },
      { title:'后勤保障能力', content:'支队后勤保障充沛，后勤体系稳固，食品弹药储备充盈，补给畅通，后勤方面敌缺我足。', image:'/static/images/woqing8.jpg' }
    ]}
  ];
  
  const currentPageIdx = pages.findIndex(p => p.id === analysisSubTab);
  const currentPage = pages[currentPageIdx] || pages[0];
  const pageNum = currentPageIdx + 1;
  
  let cardsHtml = currentPage.cards.map(card => `
    <div style="display:flex;gap:16px;margin-bottom:24px;align-items:stretch">
      <img src="${card.image}" style="width:40%;flex-shrink:0;object-fit:contain;border-radius:4px">
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center">
        <h3 style="color:#ffd700;font-size:1.8rem;margin:0 0 12px 0;text-align:center">${card.title}</h3>
        <p style="font-size:1.1rem;line-height:2;color:#c8d4e8;margin:0">${card.content}</p>
      </div>
    </div>
  `).join('');
  
  el.innerHTML = `
    <div class="analysis-border"></div>
    <button class="arrow-btn arrow-left" onclick="navAnalysisWoqingPage(-1)">◀</button>
    <button class="arrow-btn arrow-right" onclick="navAnalysisWoqingPage(1)">▶</button>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(0,0,0,0.2)">
      <div style="flex:1">
        <div class="detail-title" style="margin:0;font-size:2.4rem">我情分析</div>
        <div class="detail-subtitle" style="margin:0;font-size:0.85rem">${pageNum} / ${pages.length}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-military" onclick="analysisTab='analysis';renderRightArea()" style="padding:6px 12px;border-radius:4px;background:#1976d2;color:#fff;cursor:pointer;border:none;font-size:0.85rem">返回</button>
      </div>
    </div>
    <div class="detail-content" style="display:flex;flex-direction:column;flex:1;min-height:0;padding:16px">
      <div class="detail-text-area" style="flex:1;overflow-y:auto">${cardsHtml}</div>
    </div>
  `;
}

function navAnalysisWoqingPage(dir) {
  const pages = ['page1', 'page2', 'page3', 'page4'];
  let idx = pages.indexOf(analysisSubTab);
  idx += dir;
  if (idx < 0) idx = pages.length - 1;
  if (idx >= pages.length) idx = 0;
  analysisSubTab = pages[idx];
  renderRightArea();
}

function setAnalysisTab(tab, sub) {
  analysisTab = tab;
  analysisSubTab = sub;
  showLoadingAndRender();
}

function switchAnalysisSubTab(subTabId) {
  analysisSubTab = subTabId;
  renderRightArea();
}

function showLoadingAndRender() {
  // Show loading view
  const mapView = document.getElementById('mapView');
  const detailView = document.getElementById('targetDetailView');
  const analysisViewEl = document.getElementById('analysisView');
  const loadingViewEl = document.getElementById('loadingView');
  
  mapView.classList.add('hidden');
  detailView.classList.add('hidden');
  analysisViewEl.classList.add('hidden');
  loadingViewEl.classList.remove('hidden');
  
  // Hide middle column
  const middleCol = document.querySelector('.middle');
  if (middleCol) middleCol.style.display = 'none';
  
  // Delay and show analysis result
  setTimeout(() => {
    loadingViewEl.classList.add('hidden');
    renderRightArea();
  }, 6000);
}

// ===== Enemy View =====
function renderEnemyView(el) {
  const tabs = Object.values(DATA.enemyInfo);
  const current = DATA.enemyInfo[analysisSubTab];
  if (!current) return;

  // Check if user uploaded custom content for this subTab
  const userContent = localStorage.getItem('userSituationContent');
  const userImage = localStorage.getItem('userSituationImage');
  const userTargetSub = localStorage.getItem('userSituationTargetSub');
  
  // Check for custom analysis data
  const key = `${analysisTab}_${analysisSubTab}`;
  const customAnalysis = analysisCustomData[key] || {};

  let sections;
  if (userContent && userTargetSub === analysisSubTab) {
    // Replace all sections with user's input (same inline styles as default)
    const img = userImage ? `<img src="${userImage}" alt="" style="position:absolute;top:6px;left:6px;right:6px;bottom:6px;width:calc(100% - 12px);height:calc(100% - 12px);object-fit:contain;">` : '';
    sections = `
      <div style="flex:1 1 0;display:flex;min-height:0;overflow:hidden;border-bottom:2px solid rgba(255,255,255,0.15);">
        <div style="width:40%;flex-shrink:0;position:relative;padding:6px;">${img}</div>
        <div style="flex:1;padding:10px 16px;overflow-y:auto;display:flex;flex-direction:column;justify-content:center;">
          <h3 style="font-size:1.6rem;font-weight:900;color:#ff0000;margin-bottom:8px;text-align:center;letter-spacing:4px;">情况通报</h3>
          <p style="font-size:1.1rem;line-height:1.8;color:#fff;font-weight:700;text-align:left;text-indent:2em;">${userContent}</p>
        </div>
      </div>`;
  } else {
    sections = current.sections.map((s, i) => {
      const title = customAnalysis.contentTitle || s.title;
      const content = customAnalysis.content || s.content;
      const images = customAnalysis.images || [s.image];
      const image = images[0] || s.image;
      return `
      <div style="flex:1 1 0;display:flex;min-height:0;overflow:hidden;border-bottom:2px solid rgba(255,255,255,0.15);">
        <div style="width:40%;flex-shrink:0;position:relative;padding:6px;">
          <img src="${image}" alt="" style="position:absolute;top:${i===0?'6px':'0'};left:6px;right:6px;bottom:${i===0?'6px':'0'};width:calc(100% - 12px);height:calc(100% - ${i===0?'12px':'6px'});object-fit:contain;object-position:top;">
        </div>
        <div style="flex:1;padding:10px 16px;overflow-y:auto;display:flex;flex-direction:column;justify-content:center;">
          <h3 style="font-size:1.6rem;font-weight:900;color:#ff0000;margin-bottom:8px;text-align:center;letter-spacing:4px;">${title}</h3>
          <p style="font-size:1.1rem;line-height:1.8;color:#fff;font-weight:700;text-align:left;text-indent:2em;">${content}</p>
        </div>
      </div>`;
    }).join('');
  }

  let tabBtns = tabs.map(t => {
    const tCustom = analysisCustomData[`${analysisTab}_${t.id}`] || {};
    return `<button class="tab-btn${analysisSubTab===t.id?' active':''}" onclick="switchAnalysisSubTab('${t.id}')">${tCustom.title || t.label}</button>`;
  }).join('');

  el.innerHTML = `
    <div class="analysis-border"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:rgba(0,0,0,0.2)">
      <div class="tab-bar" style="flex:1">${tabBtns}</div>
      <div style="display:flex;gap:8px">
        <button class="btn-military" onclick="startEditAnalysisTitle()" style="padding:6px 12px;border-radius:4px;background:#1976d2;color:#fff;cursor:pointer;border:none;font-size:0.85rem">编辑名称</button>
        <button class="btn-military" onclick="startEditAnalysis()" style="padding:6px 12px;border-radius:4px;background:#1976d2;color:#fff;cursor:pointer;border:none;font-size:0.85rem">编辑内容</button>
      </div>
    </div>
    <div style="flex:1;display:flex;flex-direction:column;overflow:hidden;">${sections}</div>
  `;
}

// ===== Our Situation View =====
function renderOurView(el) {
  const items = Object.values(DATA.ourInfo);
  const subTabs = items.map(x => x.id);
  const current = DATA.ourInfo[analysisSubTab] || items[0];
  const idx = subTabs.indexOf(analysisSubTab);

  const userContent = localStorage.getItem('userSituationContent');
  const userImage = localStorage.getItem('userSituationImage');
  const userTargetSub = localStorage.getItem('userSituationTargetSub');
  const useCustom = userContent && userTargetSub === analysisSubTab;
  
  // Check for custom analysis data
  const key = `${analysisTab}_${analysisSubTab}`;
  const customAnalysis = analysisCustomData[key] || {};

  // Use custom title for tab labels if available
  let tabBtns = items.map(t => {
    const tKey = `${analysisTab}_${t.id}`;
    const tCustom = analysisCustomData[tKey] || {};
    const label = tCustom.title || t.label;
    return `<button class="tab-btn${(current.id===t.id)?' active':''}" onclick="switchAnalysisSubTab('${t.id}')">${label}</button>`;
  }).join('');

  const hasCustom = !!(customAnalysis.contentTitle || customAnalysis.title || customAnalysis.content || (customAnalysis.images && customAnalysis.images.length));
  const displayTitle = customAnalysis.contentTitle || current.label.replace(/^[①-⑩]\s*/,'');
  const displayContent = customAnalysis.content || current.content;
  const displayImages = (customAnalysis.images && customAnalysis.images.length)
    ? customAnalysis.images
    : (current.images || (current.image ? [current.image] : []));

  let bodyHTML = '';

  if (useCustom && !hasCustom) {
    const displayImage = userImage || current.image;
    bodyHTML = `<div class="detail-body">
      <div class="detail-image"><img src="${displayImage}"></div>
      <div class="detail-text-area"><p>${userContent}</p></div>
    </div>`;
  } else if (current.layout === 'grid4') {
    const imgs = displayImages;
    bodyHTML = `<div class="detail-body" style="gap:12px">
      <div style="width:45%;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:4px;flex-shrink:0">
        ${imgs.map(src => `<img src="${src}" style="width:100%;height:100%;object-fit:cover;border-radius:4px">`).join('')}
      </div>
      <div class="detail-text-area" style="display:flex;flex-direction:column;justify-content:center;padding:24px 32px">
        <h3 style="font-size:2rem;font-weight:bold;color:#ffd700;margin-bottom:20px;text-align:center">${displayTitle}</h3>
        <p style="font-size:1.4rem;line-height:2.4;color:#fff;text-indent:2em">${displayContent}</p>
      </div>
    </div>`;
  } else if (current.layout === 'stack2') {
    const imgs = displayImages;
    bodyHTML = `<div class="detail-body" style="gap:12px">
      <div style="width:40%;display:flex;flex-direction:column;gap:4px;flex-shrink:0">
        ${imgs.map(src => `<img src="${src}" style="flex:1;min-height:0;width:100%;object-fit:cover;border-radius:4px">`).join('')}
      </div>
      <div class="detail-text-area" style="display:flex;flex-direction:column;justify-content:center;padding:24px 32px">
        <h3 style="font-size:2rem;font-weight:bold;color:#ffd700;margin-bottom:20px;text-align:center">${displayTitle}</h3>
        <p style="font-size:1.4rem;line-height:2.4;color:#fff;text-indent:2em">${displayContent}</p>
      </div>
    </div>`;
  } else if (current.layout === 'cards' && !hasCustom) {
    bodyHTML = `
      <div style="flex:1;display:flex;flex-direction:column;gap:12px;overflow:auto;padding:0 16px">
        <div style="display:flex;gap:12px;flex-shrink:0">
          <div style="flex:1;background:rgba(200,210,220,0.85);border-radius:8px;padding:16px">
            <h3 style="font-size:1.1rem;font-weight:bold;color:#1565c0;margin-bottom:8px;text-align:center">住宿保障</h3>
            <p style="font-size:0.9rem;line-height:1.8;color:#333">支队共配备宿营车4辆，行军床100张，班用帐篷13顶，展开可满足约230人宿营保障。</p>
          </div>
          <div style="flex:1;background:rgba(200,210,220,0.85);border-radius:8px;padding:16px">
            <h3 style="font-size:1.1rem;font-weight:bold;color:#1565c0;margin-bottom:8px;text-align:center">饮食保障</h3>
            <p style="font-size:0.9rem;line-height:1.8;color:#333">支队配备炊事车1辆，野战给养单元9套，技术状态良好；炊事人员专业技能过硬，能快速完成热食保障。</p>
          </div>
          <div style="flex:1;background:rgba(200,210,220,0.85);border-radius:8px;padding:16px">
            <h3 style="font-size:1.1rem;font-weight:bold;color:#ff4500;margin-bottom:8px;text-align:center">水电保障</h3>
            <p style="font-size:0.9rem;line-height:1.8;color:#333">立足宿营场地条件，可依托机场进行保障。极端情况时，可利用支队配备的汽油发电机组（2台）、消防车（1辆）等进行保障。</p>
          </div>
        </div>
        <div style="flex-shrink:0">
          <h3 style="font-size:1.3rem;font-weight:bold;color:#ff4500;text-align:center;margin-bottom:8px">后勤保障实力统计</h3>
          <table style="width:100%;border-collapse:collapse;font-size:0.9rem;color:#fff">
            <thead><tr style="background:rgba(0,80,160,0.7)">
              <th style="padding:10px;border:1px solid rgba(255,255,255,0.3)">分类</th>
              <th style="padding:10px;border:1px solid rgba(255,255,255,0.3)">车辆</th>
              <th style="padding:10px;border:1px solid rgba(255,255,255,0.3)">器材</th>
              <th style="padding:10px;border:1px solid rgba(255,255,255,0.3)">实力</th>
            </tr></thead>
            <tbody>
              <tr style="background:rgba(0,40,100,0.5)"><td style="padding:8px;border:1px solid rgba(255,255,255,0.2);text-align:center">住宿保障</td><td style="padding:8px;border:1px solid rgba(255,255,255,0.2);text-align:center">宿营车4辆</td><td style="padding:8px;border:1px solid rgba(255,255,255,0.2);text-align:center">行军床100张　班用帐篷13顶</td><td style="padding:8px;border:1px solid rgba(255,255,255,0.2);text-align:center">230人宿营保障</td></tr>
              <tr style="background:rgba(0,40,100,0.3)"><td style="padding:8px;border:1px solid rgba(255,255,255,0.2);text-align:center">饮食保障</td><td style="padding:8px;border:1px solid rgba(255,255,255,0.2);text-align:center">炊事车1辆</td><td style="padding:8px;border:1px solid rgba(255,255,255,0.2);text-align:center">野战给养单元9套</td><td style="padding:8px;border:1px solid rgba(255,255,255,0.2);text-align:center">能快速完成热食保障</td></tr>
              <tr style="background:rgba(0,40,100,0.5)"><td style="padding:8px;border:1px solid rgba(255,255,255,0.2);text-align:center">水电保障</td><td style="padding:8px;border:1px solid rgba(255,255,255,0.2);text-align:center">无</td><td style="padding:8px;border:1px solid rgba(255,255,255,0.2);text-align:center">汽油发电机组2台　消防车1辆</td><td style="padding:8px;border:1px solid rgba(255,255,255,0.2);text-align:center">结合机场条件进行保障</td></tr>
            </tbody>
          </table>
        </div>
      </div>`;
  } else {
    const displayImage = displayImages[0] || current.image;
    bodyHTML = `<div class="detail-body">
      <div class="detail-image"><img src="${displayImage}"></div>
      <div class="detail-text-area" style="display:flex;flex-direction:column;justify-content:center;padding:24px 32px">
        <h3 style="font-size:2rem;font-weight:bold;color:#ffd700;margin-bottom:20px;text-align:center">${displayTitle}</h3>
        <p style="font-size:1.4rem;line-height:2.4;color:#fff;text-indent:2em">${displayContent}</p>
      </div>
    </div>`;
  }

  el.innerHTML = `
    <div class="analysis-border"></div>
    <button class="arrow-btn arrow-left" onclick="navSubTab('our',-1)">◀</button>
    <button class="arrow-btn arrow-right" onclick="navSubTab('our',1)">▶</button>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:rgba(0,0,0,0.2)">
      <div class="tab-bar" style="flex:1">${tabBtns}</div>
      <div style="display:flex;gap:8px">
        <button class="btn-military" onclick="startEditAnalysisTitle()" style="padding:6px 12px;border-radius:4px;background:#1976d2;color:#fff;cursor:pointer;border:none;font-size:0.85rem">编辑名称</button>
        <button class="btn-military" onclick="startEditAnalysis()" style="padding:6px 12px;border-radius:4px;background:#1976d2;color:#fff;cursor:pointer;border:none;font-size:0.85rem">编辑内容</button>
      </div>
    </div>
    <div class="detail-content" style="padding-top:8px">
      ${bodyHTML}
    </div>
  `;
}

// ===== Battlefield View =====
function renderBattlefieldView(el) {
  const items = Object.values(DATA.battlefieldEnv);
  const subTabs = items.map(x => x.id);
  const current = DATA.battlefieldEnv[analysisSubTab] || items[0];
  const idx = subTabs.indexOf(analysisSubTab);

  const userContent = localStorage.getItem('userSituationContent');
  const userImage = localStorage.getItem('userSituationImage');
  const userTargetSub = localStorage.getItem('userSituationTargetSub');
  const useCustom = userContent && userTargetSub === analysisSubTab;
  
  // Check for custom analysis data
  const key = `${analysisTab}_${analysisSubTab}`;
  const customAnalysis = analysisCustomData[key] || {};
  const customImages = customAnalysis.images || [];
  const hasCustom = !!(customAnalysis.contentTitle || customAnalysis.title || customAnalysis.content || customImages.length);
  const displayImage = customImages[0] || (useCustom && userImage ? userImage : current.image);
  const displayContent = customAnalysis.content || (useCustom ? userContent : current.content);
  const displayTitle = customAnalysis.contentTitle || (useCustom ? '情况通报' : current.label);

  let tabBtns = items.map(t => {
    const tCustom = analysisCustomData[`${analysisTab}_${t.id}`] || {};
    return `<button class="tab-btn${(current.id===t.id)?' active':''}" onclick="switchAnalysisSubTab('${t.id}')">${tCustom.title || t.label}</button>`;
  }).join('');

  // Special layout to match PPT exactly
  let bodyHTML;
  if (analysisSubTab === 'ziran' && !useCustom && !hasCustom) {
    const ziranText = `六盘水市地处云贵高原交界处，以<b style="color:#ffd700">喀斯特地貌</b>为主，山地、丘陵广布，地势<b style="color:#ffd700">东高西底、起伏较大</b>。"<b style="color:#ffd700">铁路、公路、机场</b>"立体枢纽四省通衢，率先实现了县县通高铁，交通便利。六盘水市属亚热带季风湿润气候，<b style="color:#ffd700">年平均气温14℃，夏季均温19℃，冬季均温4.8℃，号称"中国凉都"</b>。水纹两江分流、喀斯特循环、高落差水能为核心特征。月照机场周边多为山林地，<b style="color:#ffd700">植被茂密、地形复杂，海拔高、雨雾天气多、能见度低</b>。`;
    bodyHTML = `
      <div style="display:flex;flex:1;min-height:0;overflow:hidden;">
        <div style="width:50%;padding:4px 4px 4px 20px;">
          <img src="/static/images/xinxi_map.png" style="width:100%;height:100%;object-fit:contain;">
        </div>
        <div style="width:50%;padding:8px 14px;overflow-y:auto;display:flex;flex-direction:column;justify-content:center;">
          <h3 style="font-size:2.2rem;font-weight:900;color:#ff6600;text-align:center;margin-bottom:8px;letter-spacing:6px;text-shadow:0 2px 4px rgba(0,0,0,0.3);">自然环境</h3>
          <p style="font-size:1.5rem;line-height:1.8;color:#ffffff;font-weight:900;text-indent:2em;">${ziranText}</p>
        </div>
      </div>`;
  } else if (analysisSubTab === 'shehui' && !useCustom && !hasCustom) {
    const shehuiText = `六盘水位于贵州西部，属"三线建设"城市，<b style="color:#ffd700">共有47个少数民族聚居，民风淳朴</b>，社会治安良好，特别是近三年来连续被评为"双拥模范城市"，<b style="color:#ffd700">群众基础较好</b>，当地人民对部队拥护爱戴。<b style="color:#ffd700">但月照机场地处较为偏僻山区，民众受教育程度偏低，容易被不法分子威逼利诱。</b>`;
    bodyHTML = `
      <div style="display:flex;flex:1;min-height:0;overflow:hidden;">
        <div style="width:18%;display:flex;align-items:center;justify-content:flex-end;padding:8px 0 8px 16px;">
          <img src="/static/images/shehui_map_cropped.png" style="max-width:100%;max-height:100%;object-fit:contain;">
        </div>
        <div style="width:40%;display:flex;align-items:center;justify-content:center;padding:2px;">
          <img src="/static/images/shehui_img19.jpeg" style="max-width:100%;max-height:100%;object-fit:contain;">
        </div>
        <div style="width:42%;padding:4px 10px;overflow-y:auto;display:flex;flex-direction:column;justify-content:center;">
          <h3 style="font-size:2.2rem;font-weight:900;color:#ff6600;text-align:center;margin-bottom:4px;letter-spacing:6px;text-shadow:0 2px 4px rgba(0,0,0,0.3);">社会环境</h3>
          <p style="font-size:1.6rem;line-height:1.8;color:#ffffff;font-weight:900;text-indent:2em;">${shehuiText}</p>
        </div>
      </div>`;
  } else if (analysisSubTab === 'xinxi' && !useCustom && !hasCustom) {
    const xinxiText = `六盘水市共有5G基站5000余个、光缆线路20.55万公里，<b style="color:#ffd700">覆盖行政村以上单位，公安天网系统完备</b>；全市信息网络发达，<b style="color:#ffd700">"大数据"资源丰富，媒体平台健全</b>；市内信息通信密集、用频设备繁多，<b style="color:#ffd700">电磁管控难度大</b>。`;
    bodyHTML = `
      <div style="display:flex;flex:1;min-height:0;overflow:hidden;">
        <div style="width:55%;padding:4px 4px 4px 40px;">
          <img src="/static/images/xinxi_map.png" style="width:100%;height:100%;object-fit:contain;">
        </div>
        <div style="width:45%;padding:8px 14px;overflow-y:auto;display:flex;flex-direction:column;justify-content:center;">
          <h3 style="font-size:2.2rem;font-weight:900;color:#ff6600;text-align:center;margin-bottom:8px;letter-spacing:6px;text-shadow:0 2px 4px rgba(0,0,0,0.3);">信息环境</h3>
          <p style="font-size:1.5rem;line-height:1.85;color:#ffffff;font-weight:900;text-indent:2em;">${xinxiText}</p>
        </div>
      </div>`;
  } else {
    bodyHTML = `
      <div class="section-rows">
        <div class="section-row" style="flex:1">
          <div class="section-img"><img src="${displayImage}"></div>
          <div class="section-text"><h3>${displayTitle}</h3><p>${displayContent}</p></div>
        </div>
      </div>`;
  }

  el.innerHTML = `
    <div class="analysis-border"></div>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:rgba(0,0,0,0.2)">
      <div class="tab-bar" style="flex:1">${tabBtns}</div>
      <div style="display:flex;gap:8px">
        <button class="btn-military" onclick="startEditAnalysisTitle()" style="padding:6px 12px;border-radius:4px;background:#1976d2;color:#fff;cursor:pointer;border:none;font-size:0.85rem">编辑名称</button>
        <button class="btn-military" onclick="startEditAnalysis()" style="padding:6px 12px;border-radius:4px;background:#1976d2;color:#fff;cursor:pointer;border:none;font-size:0.85rem">编辑内容</button>
      </div>
    </div>
    ${bodyHTML}
  `;
}

// ===== Analysis Detail (woqing/duibi/zhanchang) =====
function renderAnalysisDetailView(el) {
  // Check if it's a custom module
  const mod = customModules.find(m => m.id === analysisSubTab);
  if (mod) {
    el.innerHTML = `
      <div class="analysis-border"></div>
      <div class="detail-content">
        <div class="detail-title">${mod.name}</div>
        <div class="detail-text-area" style="flex:1"><p>${mod.content}</p></div>
      </div>
    `;
    return;
  }

  // Standard analysis sub-categories
  const categories = {
    woqing: { label:'我情分析', data: DATA.analysisData.woqing },
    duibi: { label:'敌我对比', data: DATA.analysisData.duibi },
    zhanchang: { label:'战场环境分析', data: DATA.analysisData.zhanchang },
  };
  const subTabs = Object.keys(categories);
  const idx = subTabs.indexOf(analysisSubTab);
  const cat = categories[analysisSubTab];
  if (!cat) return;

  const items = Object.values(cat.data);
  
  // Special layout for duibi (敌我对比) - side-by-side with image on left
  if (analysisSubTab === 'duibi') {
    let duibiContent = items.map(item => `
      <div style="display:flex;gap:16px;margin-bottom:32px;align-items:flex-start">
        ${item.image ? `<img src="${item.image}" style="width:35%;flex-shrink:0;height:160px;object-fit:cover;border-radius:4px">` : ''}
        <div style="flex:1">
          <h3 style="color:#e94560;font-size:2rem;margin:0 0 12px 0;text-align:center">${item.title}</h3>
          <p style="font-size:1.2rem;line-height:2;color:#c8d4e8;margin:0">${item.content}</p>
        </div>
      </div>
    `).join('');
    
    el.innerHTML = `
      <div class="analysis-border"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(0,0,0,0.2)">
        <div style="flex:1">
          <div class="detail-title" style="margin:0;font-size:3.2rem">${cat.label}</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-military" onclick="startEditAnalysisTitle()" style="padding:6px 12px;border-radius:4px;background:#1976d2;color:#fff;cursor:pointer;border:none;font-size:0.85rem">编辑名称</button>
          <button class="btn-military" onclick="startEditAnalysis()" style="padding:6px 12px;border-radius:4px;background:#1976d2;color:#fff;cursor:pointer;border:none;font-size:0.85rem">编辑内容</button>
        </div>
      </div>
      <div class="detail-content" style="display:flex;flex-direction:column;flex:1;min-height:0">
        <div class="detail-text-area" style="flex:1;overflow-y:auto;padding:16px">${duibiContent}</div>
      </div>
    `;
    return;
  }
  
  // Default layout for other analysis types
  let content = items.map(item => {
    let itemHtml = `<div style="margin-bottom:16px"><h3 style="color:#00aaff;font-size:1rem;margin-bottom:4px">${item.title}</h3>`;
    if (item.image) {
      itemHtml += `<img src="${item.image}" style="width:100%;max-height:200px;object-fit:cover;border-radius:4px;margin-bottom:8px">`;
    }
    itemHtml += `<p style="font-size:0.9rem;line-height:2;color:#c8d4e8">${item.content}</p></div>`;
    return itemHtml;
  }).join('');

  el.innerHTML = `
    <div class="analysis-border"></div>
    <button class="arrow-btn arrow-left" onclick="navAnalysisSub(-1)">◀</button>
    <button class="arrow-btn arrow-right" onclick="navAnalysisSub(1)">▶</button>
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 16px;background:rgba(0,0,0,0.2)">
      <div style="flex:1">
        <div class="detail-title" style="margin:0;font-size:1.2rem">${cat.label}</div>
        <div class="detail-subtitle" style="margin:0;font-size:0.85rem">${idx+1} / ${subTabs.length}</div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-military" onclick="startEditAnalysisTitle()" style="padding:6px 12px;border-radius:4px;background:#1976d2;color:#fff;cursor:pointer;border:none;font-size:0.85rem">编辑名称</button>
        <button class="btn-military" onclick="startEditAnalysis()" style="padding:6px 12px;border-radius:4px;background:#1976d2;color:#fff;cursor:pointer;border:none;font-size:0.85rem">编辑内容</button>
      </div>
    </div>
    <div class="detail-content">
      <div class="detail-text-area" style="flex:1">${content}</div>
    </div>
  `;
}

function navSubTab(type, dir) {
  let tabs;
  if (type === 'our') tabs = Object.keys(DATA.ourInfo);
  else if (type === 'battlefield') tabs = Object.keys(DATA.battlefieldEnv);
  else return;
  let idx = tabs.indexOf(analysisSubTab);
  idx += dir;
  if (idx < 0) idx = tabs.length - 1;
  if (idx >= tabs.length) idx = 0;
  analysisSubTab = tabs[idx];
  renderRightArea();
}

function navAnalysisSub(dir) {
  const subs = ['woqing','duibi','zhanchang'];
  let idx = subs.indexOf(analysisSubTab);
  idx += dir;
  if (idx < 0) idx = subs.length - 1;
  if (idx >= subs.length) idx = 0;
  analysisSubTab = subs[idx];
  renderRightArea();
}

// ===== Decision Page View (定下作战决心 inline) =====
function renderDecisionPageView() {
  const el = document.getElementById('decisionView');
  el.innerHTML = `
    <style>
      .dcp-outer { display:flex; flex:1; min-height:0; overflow:hidden; gap:0; }
      .dcp-map-area { flex:1; display:flex; flex-direction:column; min-height:0; position:relative; }
      .dcp-title-row { display:flex; align-items:center; justify-content:center; gap:16px; padding:4px 0; flex-shrink:0; }
      .dcp-title-row h2 { margin:0; font-size:1.3rem; color:#fff; font-weight:900; letter-spacing:4px; }
      .dcp-nav-btn { background:none; border:none; color:rgba(255,255,255,0.7); font-size:1.8rem; cursor:pointer; padding:0 8px; }
      .dcp-nav-btn:hover { color:#fff; }
      .dcp-map-wrap { flex:1; min-height:0; position:relative; overflow:hidden; border-radius:4px; margin:0 4px 4px; }
      .dcp-map-base { position:absolute; top:0; left:0; width:100%; height:100%; object-fit:cover; background:#1a2a1a; }
      .dcp-toolbar { position:absolute; top:8px; left:50%; transform:translateX(-50%); z-index:10; display:flex; gap:3px; background:rgba(0,0,0,0.55); padding:4px 8px; border-radius:8px; backdrop-filter:blur(4px); }
      .dcp-tool-btn { background:none; border:1px solid rgba(255,255,255,0.3); color:#fff; padding:3px 8px; border-radius:4px; cursor:pointer; font-size:0.65rem; display:flex; align-items:center; gap:3px; }
      .dcp-tool-btn:hover { background:rgba(255,255,255,0.15); }
      .dcp-tool-btn img { width:13px; height:13px; filter:brightness(0) invert(1); }
      .dcp-compass { position:absolute; top:8px; right:8px; z-index:10; width:55px; height:55px; }
      .dcp-legend-panel { width:180px; flex-shrink:0; background:#f5f0e8; overflow-y:auto; padding:8px; border-left:2px solid #ccc; }
      .dcp-legend-title { font-size:0.8rem; font-weight:900; color:#333; margin:8px 0 4px; border-bottom:1px solid #999; padding-bottom:2px; }
      .dcp-legend-grid { display:flex; flex-wrap:wrap; gap:4px; }
      .dcp-sym { width:32px; height:32px; display:flex; align-items:center; justify-content:center; border:1px solid #ccc; border-radius:3px; cursor:grab; background:#fff; font-size:0.7rem; }
      .dcp-sym:hover { border-color:#e53935; background:#fff5f5; }
      .dcp-sym svg { width:24px; height:24px; }
      .dcp-placed { position:absolute; user-select:none; }
      .dcp-placed:hover .dcp-handle { display:flex; }
      .dcp-placed-inner { width:100%; height:100%; display:flex; align-items:center; justify-content:center; }
      .dcp-placed-inner svg { width:100%; height:100%; }
      .dcp-placed-note { position:absolute; top:100%; left:50%; transform:translateX(-50%); margin-top:2px; min-width:40px; max-width:160px; padding:1px 4px; background:rgba(255,255,200,0.9); border:1px solid #999; border-radius:2px; font-size:11px; color:#000; text-align:center; white-space:nowrap; outline:none; }
      .dcp-placed-note[contenteditable="true"] { background:#fff; border-color:#e53935; cursor:text; }
      .dcp-placed-note:empty::before { content:attr(placeholder); color:#888; font-style:italic; opacity:0.6; }
      .dcp-handle { display:none; position:absolute; width:16px; height:16px; background:rgba(229,57,53,0.9); color:#fff; font-size:11px; align-items:center; justify-content:center; border-radius:50%; cursor:pointer; z-index:11; }
      .dcp-handle-resize { right:-8px; bottom:-8px; cursor:nwse-resize; }
      .dcp-handle-del { right:-8px; top:-8px; cursor:pointer; font-weight:bold; }
    </style>
    <div class="dcp-outer">
      <div class="dcp-map-area">
        <div class="dcp-title-row">
          <button class="dcp-nav-btn">❮</button>
          <h2>参与战斗作战决心图</h2>
          <button class="dcp-nav-btn">❯</button>
        </div>
        <div class="dcp-map-wrap">
          <img class="dcp-map-base" src="/static/images/日照机场.png" draggable="false" ondragstart="return false" style="user-select:none;-webkit-user-drag:none;">
          <div class="dcp-compass">
            <svg viewBox="0 0 60 60"><circle cx="30" cy="30" r="28" fill="rgba(0,0,0,0.5)" stroke="#fff" stroke-width="1.5"/>
            <polygon points="30,6 34,28 30,24 26,28" fill="#e53935"/><polygon points="30,54 34,32 30,36 26,32" fill="#fff"/>
            <text x="30" y="14" text-anchor="middle" fill="#fff" font-size="9" font-weight="bold">N</text></svg>
          </div>
        </div>
      </div>
      <div class="dcp-legend-panel">
        <div class="dcp-legend-title">反恐标号：</div>
        <div class="dcp-legend-grid">
          <div class="dcp-sym" draggable="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="#00c" stroke-width="2"/><line x1="4" y1="4" x2="20" y2="20" stroke="#00c" stroke-width="2"/><line x1="20" y1="4" x2="4" y2="20" stroke="#00c" stroke-width="2"/></svg></div>
          <div class="dcp-sym" draggable="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="#00c" stroke-width="2"/><line x1="12" y1="2" x2="12" y2="22" stroke="#00c" stroke-width="2"/></svg></div>
          <div class="dcp-sym" draggable="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="#00c" stroke-width="2"/><line x1="4" y1="4" x2="20" y2="20" stroke="#00c" stroke-width="2"/><line x1="20" y1="4" x2="4" y2="20" stroke="#00c" stroke-width="2"/><line x1="12" y1="2" x2="12" y2="22" stroke="#00c" stroke-width="2"/></svg></div>
          <div class="dcp-sym" draggable="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="none" stroke="#00c" stroke-width="2"/><path d="M12,2 L12,22 M8,6 L12,2 L16,6" stroke="#00c" stroke-width="2" fill="none"/></svg></div>
        </div>
        <div class="dcp-legend-title">处突标号：</div>
        <div class="dcp-legend-grid">
          <div class="dcp-sym" draggable="true"><svg viewBox="0 0 24 24"><path d="M4,20 L8,4 L12,16 L16,4 L20,20" stroke="#e53935" stroke-width="2" fill="none"/></svg></div>
          <div class="dcp-sym" draggable="true"><svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="12" fill="none" stroke="#00c" stroke-width="1.5" stroke-dasharray="3,2"/><line x1="12" y1="6" x2="12" y2="18" stroke="#00c" stroke-width="1.5"/></svg></div>
          <div class="dcp-sym" draggable="true"><svg viewBox="0 0 24 24"><line x1="12" y1="4" x2="12" y2="20" stroke="#e53935" stroke-width="2.5"/><line x1="8" y1="8" x2="12" y2="4" stroke="#e53935" stroke-width="2"/><line x1="16" y1="8" x2="12" y2="4" stroke="#e53935" stroke-width="2"/></svg></div>
          <div class="dcp-sym" draggable="true"><svg viewBox="0 0 24 24"><polygon points="12,3 22,20 2,20" fill="none" stroke="#e53935" stroke-width="2"/></svg></div>
          <div class="dcp-sym" draggable="true"><svg viewBox="0 0 24 24"><line x1="4" y1="12" x2="20" y2="12" stroke="#e53935" stroke-width="2"/><rect x="8" y="8" width="8" height="8" fill="none" stroke="#e53935" stroke-width="1.5"/></svg></div>
        </div>
        <div class="dcp-legend-title">抢险救援标号：</div>
        <div class="dcp-legend-grid">
          <div class="dcp-sym" draggable="true" style="font-size:0.6rem;color:#e53935;font-weight:900;border-color:#e53935">E</div>
          <div class="dcp-sym" draggable="true" style="font-size:0.6rem;color:#e53935;font-weight:900;border-color:#e53935">●+</div>
          <div class="dcp-sym" draggable="true" style="font-size:0.55rem;color:#333;font-weight:700">WS+</div>
          <div class="dcp-sym" draggable="true" style="font-size:0.5rem;color:#333;font-weight:700">SHG+</div>
          <div class="dcp-sym" draggable="true" style="font-size:0.55rem;color:#333;font-weight:700">JID+</div>
        </div>
        <div class="dcp-legend-title">常用标号：</div>
        <div class="dcp-legend-grid">
          <div class="dcp-sym" draggable="true"><svg viewBox="0 0 24 24"><path d="M4,4 L4,20 L14,20 M4,4 L14,4 L14,12" stroke="#e53935" stroke-width="2" fill="none"/></svg></div>
          <div class="dcp-sym" draggable="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" fill="none" stroke="#00c" stroke-width="2"/></svg></div>
          <div class="dcp-sym" draggable="true"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="10" ry="7" fill="none" stroke="#e53935" stroke-width="2"/></svg></div>
          <div class="dcp-sym" draggable="true"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="10" ry="7" fill="none" stroke="#e53935" stroke-width="2"/><line x1="6" y1="6" x2="18" y2="18" stroke="#e53935" stroke-width="1.5"/><line x1="18" y1="6" x2="6" y2="18" stroke="#e53935" stroke-width="1.5"/></svg></div>
          <div class="dcp-sym" draggable="true"><svg viewBox="0 0 24 24"><path d="M2,18 L12,4 L22,18" stroke="#e53935" stroke-width="2" fill="none"/><line x1="12" y1="4" x2="12" y2="18" stroke="#e53935" stroke-width="1.5"/></svg></div>
        </div>
      </div>
    </div>
  `;
  initDcpDragDrop();
}

function initDcpDragDrop() {
  const mapWrap = document.querySelector('.dcp-map-wrap');
  if (!mapWrap) return;
  // Click symbol to select, then click on map to place
  let selectedSym = null;
  document.querySelectorAll('.dcp-sym').forEach(sym => {
    sym.addEventListener('click', function() {
      document.querySelectorAll('.dcp-sym').forEach(s => s.style.outline='');
      this.style.outline = '2px solid #e53935';
      selectedSym = this.innerHTML;
    });
    // Drag support
    sym.addEventListener('dragstart', function(e) {
      e.dataTransfer.setData('text/html', this.innerHTML);
      selectedSym = this.innerHTML;
    });
  });
  // Drop on map
  mapWrap.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect='copy'; });
  mapWrap.addEventListener('drop', function(e) {
    e.preventDefault();
    const html = e.dataTransfer.getData('text/html');
    if (!html) return;
    placeDcpSymbol(mapWrap, e, html);
    selectedSym = null;
    document.querySelectorAll('.dcp-sym').forEach(s => s.style.outline='');
  });
  // Click on map to place selected symbol
  mapWrap.addEventListener('click', function(e) {
    if (!selectedSym) return;
    if (e.target.closest('.dcp-toolbar') || e.target.closest('.dcp-compass')) return;
    placeDcpSymbol(mapWrap, e, selectedSym);
    selectedSym = null;
    document.querySelectorAll('.dcp-sym').forEach(s => s.style.outline='');
  });
}

function placeDcpSymbol(container, e, html) {
  const rect = container.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;
  const el = document.createElement('div');
  el.className = 'dcp-placed';
  let size = 36;
  el.innerHTML = `
    <div class="dcp-placed-inner">${html}</div>
    <div class="dcp-placed-note" contenteditable="false" placeholder="双击添加备注"></div>
    <div class="dcp-handle dcp-handle-resize" title="拖动缩放">⤢</div>
    <div class="dcp-handle dcp-handle-del" title="删除">×</div>
  `;
  el.style.cssText = `position:absolute;z-index:8;width:${size}px;height:${size}px;cursor:move;`;
  el.style.left = (x - size/2) + 'px';
  el.style.top = (y - size/2) + 'px';
  container.appendChild(el);

  const inner = el.querySelector('.dcp-placed-inner');
  const note = el.querySelector('.dcp-placed-note');
  const resizeH = el.querySelector('.dcp-handle-resize');
  const delH = el.querySelector('.dcp-handle-del');

  // Drag move
  let dragging = false, ox, oy;
  el.addEventListener('mousedown', function(ev) {
    if (ev.target === resizeH || ev.target === delH || ev.target === note) return;
    ev.stopPropagation();
    ev.preventDefault();
    dragging = true;
    ox = ev.clientX - parseInt(el.style.left);
    oy = ev.clientY - parseInt(el.style.top);
    el.style.zIndex = '9';
  });
  const onDragMove = function(ev) {
    if (!dragging) return;
    el.style.left = (ev.clientX - ox) + 'px';
    el.style.top = (ev.clientY - oy) + 'px';
  };
  const onDragUp = function() { dragging = false; };
  document.addEventListener('mousemove', onDragMove);
  document.addEventListener('mouseup', onDragUp);

  // Resize via handle drag
  let resizing = false, startX, startY, startSize;
  resizeH.addEventListener('mousedown', function(ev) {
    ev.stopPropagation();
    ev.preventDefault();
    resizing = true;
    startX = ev.clientX; startY = ev.clientY; startSize = size;
  });
  const onResizeMove = function(ev) {
    if (!resizing) return;
    const d = Math.max(ev.clientX - startX, ev.clientY - startY);
    size = Math.max(16, Math.min(200, startSize + d));
    el.style.width = size + 'px';
    el.style.height = size + 'px';
  };
  const onResizeUp = function() { resizing = false; };
  document.addEventListener('mousemove', onResizeMove);
  document.addEventListener('mouseup', onResizeUp);

  // Mouse wheel resize
  el.addEventListener('wheel', function(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    size = Math.max(16, Math.min(200, size + (ev.deltaY < 0 ? 4 : -4)));
    el.style.width = size + 'px';
    el.style.height = size + 'px';
  }, { passive: false });

  // Double-click to edit note
  note.addEventListener('dblclick', function(ev) {
    ev.stopPropagation();
    note.setAttribute('contenteditable', 'true');
    note.focus();
  });
  note.addEventListener('blur', function() { note.setAttribute('contenteditable', 'false'); });
  note.addEventListener('mousedown', e => e.stopPropagation());

  // Cleanup: remove document-level listeners when symbol is removed
  function removeSymbol() {
    document.removeEventListener('mousemove', onDragMove);
    document.removeEventListener('mouseup', onDragUp);
    document.removeEventListener('mousemove', onResizeMove);
    document.removeEventListener('mouseup', onResizeUp);
    el.remove();
  }

  // Delete
  delH.addEventListener('click', function(ev) { ev.stopPropagation(); removeSymbol(); });
  el.addEventListener('contextmenu', function(ev) { ev.preventDefault(); removeSymbol(); });
}

// ===== Plan Page View (拟制作战计划 inline) =====
function renderPlanPageView() {
  const el = document.getElementById('decisionView');
  const docs = DATA.planDocuments || [];
  const rows = docs.map(doc => `
    <tr>
      <td>${doc.id}</td>
      <td>${doc.title}</td>
      <td>${doc.seat}</td>
      <td>${doc.time}</td>
      <td>${doc.count}</td>
      <td><span class="plan-status ${doc.status==='已接收'?'done':''}">${doc.status}</span></td>
      <td><label class="plan-upload-btn"><input type="file" style="display:none" onchange="planUploadFile(this,'${doc.id}')">上传</label></td>
    </tr>
  `).join('');
  el.innerHTML = `
    <style>
      .plan-wrap { flex:1; display:flex; flex-direction:column; min-height:0; overflow:hidden; }
      .plan-header { text-align:center; padding:10px 0 6px; flex-shrink:0; }
      .plan-header h2 { color:#fff; font-size:1.3rem; font-weight:900; letter-spacing:4px; margin:0; }
      .plan-body { flex:1; overflow:auto; padding:0 12px 12px; }
      .plan-tbl { width:100%; border-collapse:collapse; font-size:0.8rem; }
      .plan-tbl th { background:rgba(13,71,161,0.7); color:#ffd700; font-weight:bold; padding:10px 12px; text-align:center; border:1px solid rgba(255,255,255,0.2); }
      .plan-tbl td { padding:8px 12px; text-align:center; border:1px solid rgba(255,255,255,0.15); color:#e0e0e0; }
      .plan-tbl tr:hover td { background:rgba(255,255,255,0.08); }
      .plan-tbl tr:nth-child(even) td { background:rgba(255,255,255,0.03); }
      .plan-status { padding:2px 10px; border-radius:10px; font-size:0.7rem; background:rgba(255,193,7,0.3); color:#ffc107; }
      .plan-status.done { background:rgba(76,175,80,0.3); color:#4caf50; }
      .plan-upload-btn { display:inline-block; padding:3px 14px; background:rgba(33,150,243,0.3); border:1px solid rgba(33,150,243,0.5); color:#64b5f6; border-radius:4px; cursor:pointer; font-size:0.7rem; }
      .plan-upload-btn:hover { background:rgba(33,150,243,0.5); }
      .plan-add-btn { position:absolute; right:16px; top:50%; transform:translateY(-50%); padding:6px 16px; background:rgba(76,175,80,0.3); border:1px solid rgba(76,175,80,0.6); color:#4caf50; border-radius:4px; cursor:pointer; font-size:0.8rem; font-weight:bold; }
      .plan-add-btn:hover { background:rgba(76,175,80,0.5); }
      .plan-header { position:relative; }
      .plan-modal { position:absolute; inset:0; z-index:100; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.5); }
      .plan-modal-box { background:linear-gradient(135deg, #0d47a1, #1565c0); border:2px solid rgba(255,215,0,0.4); border-radius:8px; padding:30px 36px; min-width:380px; box-shadow:0 8px 32px rgba(0,0,0,0.5); }
      .plan-modal-box h3 { color:#ffd700; font-size:1.2rem; font-weight:900; letter-spacing:4px; text-align:center; margin-bottom:24px; }
      .plan-modal-field { display:flex; align-items:center; gap:12px; margin-bottom:18px; }
      .plan-modal-field label { color:#fff; font-weight:bold; font-size:0.95rem; width:80px; text-align:right; white-space:nowrap; }
      .plan-modal-field input { flex:1; padding:10px 14px; border-radius:4px; border:1px solid rgba(255,255,255,0.3); background:rgba(255,255,255,0.1); color:#fff; font-size:0.95rem; }
      .plan-modal-field input::placeholder { color:rgba(255,255,255,0.4); }
      .plan-modal-field input:focus, .plan-modal-field select:focus { border-color:rgba(255,215,0,0.6); outline:none; }
      .plan-modal-field select { flex:1; padding:10px 14px; border-radius:4px; border:1px solid rgba(255,255,255,0.3); background:rgba(255,255,255,0.1); color:#fff; font-size:0.95rem; }
      .plan-modal-btns { display:flex; justify-content:center; gap:16px; margin-top:24px; }
      .plan-modal-ok { padding:10px 32px; background:linear-gradient(135deg,#43a047,#2e7d32); color:#fff; font-weight:bold; font-size:0.95rem; border-radius:4px; border:none; cursor:pointer; letter-spacing:4px; }
      .plan-modal-ok:hover { filter:brightness(1.15); }
      .plan-modal-cancel { padding:10px 32px; background:linear-gradient(135deg,#546e7a,#455a64); color:#fff; font-weight:bold; font-size:0.95rem; border-radius:4px; border:none; cursor:pointer; letter-spacing:4px; }
      .plan-modal-cancel:hover { filter:brightness(1.15); }
    </style>
    <div class="plan-wrap">
      <div class="plan-header">
        <h2>拟制作战计划</h2>
        <button class="plan-add-btn" onclick="planAddRow()">+ 新增</button>
      </div>
      <div class="plan-body">
        <table class="plan-tbl">
          <thead><tr><th>序号</th><th>文书名称</th><th>席位</th><th>上报时间</th><th>份数</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div id="planAddModal" class="plan-modal" style="display:none">
        <div class="plan-modal-box">
          <h3>新增文书</h3>
          <div class="plan-modal-field"><label>文书名称</label><input id="planAddTitle" type="text" placeholder="请输入文书名称"></div>
          <div class="plan-modal-field"><label>席位</label><input id="planAddSeat" type="text" placeholder="请输入席位"></div>
          <div class="plan-modal-field"><label>上报时间</label><input id="planAddTime" type="text" placeholder="自动生成，可修改"></div>
          <div class="plan-modal-field"><label>份数</label><input id="planAddCount" type="number" value="1" min="1"></div>
          <div class="plan-modal-field"><label>状态</label><select id="planAddStatus"><option value="待接收">待接收</option><option value="已接收">已接收</option></select></div>
          <div class="plan-modal-btns">
            <button class="plan-modal-ok" onclick="planAddConfirm()">确 定</button>
            <button class="plan-modal-cancel" onclick="planAddCancel()">取 消</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function planAddRow() {
  document.getElementById('planAddModal').style.display = 'flex';
  document.getElementById('planAddTitle').value = '';
  document.getElementById('planAddSeat').value = '';
  const now = new Date();
  document.getElementById('planAddTime').value = `${now.getMonth()+1}月${now.getDate()}日${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
  document.getElementById('planAddCount').value = 1;
  document.getElementById('planAddStatus').value = '待接收';
  document.getElementById('planAddTitle').focus();
}
function planAddConfirm() {
  const title = document.getElementById('planAddTitle').value.trim();
  const seat = document.getElementById('planAddSeat').value.trim();
  const time = document.getElementById('planAddTime').value.trim();
  const count = parseInt(document.getElementById('planAddCount').value) || 1;
  const status = document.getElementById('planAddStatus').value;
  if (!title) { document.getElementById('planAddTitle').focus(); return; }
  const newId = String((DATA.planDocuments || []).length + 1).padStart(2, '0');
  DATA.planDocuments.push({ id: newId, title: title, seat: seat, time: time, count: count, status: status });
  localStorage.setItem('planDocuments', JSON.stringify(DATA.planDocuments));
  document.getElementById('planAddModal').style.display = 'none';
  renderPlanPageView();
}
function planAddCancel() {
  document.getElementById('planAddModal').style.display = 'none';
}

async function planUploadFile(input, docId) {
  const file = input.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('file', file);
  fd.append('title', docId);
  try {
    const res = await fetch('/api/upload', { method:'POST', body:fd });
    const data = await res.json();
    if (data.success) alert('上传成功');
    else alert(data.error || '上传失败');
  } catch { alert('上传失败'); }
}

// ===== Wargame Page View (实施作战推演 inline) =====
let wargameActiveStep = 0;
const wargameSteps = ['接到命令','判断情况','定下决心','部署兵力','组织协同','战斗实施','战斗转换','总结评估'];
const wargameStepDesc = [
  '接到上级命令，明确任务性质、作战对象、时限要求及协同关系，迅速启动应急响应机制。',
  '综合分析敌情、我情、地形及社会环境，研判敌可能行动方向及企图，为定下决心提供依据。',
  '在判断情况基础上，明确主要作战方向、基本战法和兵力部署方案，形成作战决心要点。',
  '根据作战决心，将兵力编组部署至各任务区域，明确各组任务、位置和行动时限。',
  '组织各作战力量协同动作，明确通信联络、火力支援、后勤保障等协同方法和信号。',
  '按照预定方案发起战斗行动，各力量协同配合，对目标实施封控、突击、捕歼等行动。',
  '根据战场态势变化，及时调整兵力部署和作战行动，实现攻防转换或任务转换。',
  '战斗结束后，组织战场清理、伤员救治、装备清点，总结经验教训并上报战果。',
];

function renderWargamePageView() {
  const el = document.getElementById('decisionView');
  const cards = [
    { title:'图上推演', image:'/static/images/图上推演.jpg' },
    { title:'沙盘推演', image:'/static/images/沙盘推演.jpg' },
    { title:'兵棋推演', image:'/static/images/兵棋推演.jpg' },
    { title:'对抗平台', image:'/static/images/对抗平台.jpg' }
  ];
  
  let cardsHtml = cards.map(card => `
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
      <img src="${card.image}" style="width:100%;height:200px;object-fit:cover;border-radius:4px">
      <div style="color:#ffd700;font-size:1.2rem;font-weight:bold;text-align:center">${card.title}</div>
    </div>
  `).join('');
  
  el.innerHTML = `
    <style>
      .wg-wrap { flex:1; display:flex; flex-direction:column; min-height:0; overflow:hidden; }
      .wg-header { text-align:center; padding:20px 0; flex-shrink:0; position:relative; }
      .wg-title-badge { display:inline-block; background:#ff6b35; color:#fff; padding:12px 32px; border-radius:50px; font-size:1.8rem; font-weight:900; letter-spacing:4px; box-shadow:0 4px 12px rgba(255,107,53,0.4); }
      .wg-grid { flex:1; display:grid; grid-template-columns:1fr 1fr; gap:24px; padding:24px; min-height:0; overflow:auto; }
      .wg-card { display:flex; flex-direction:column; align-items:center; gap:0; }
      .wg-card img { width:100%; height:400px; object-fit:cover; border-radius:4px; }
      .wg-card-title { display:none; }
    </style>
    <div class="wg-wrap">
      <div class="wg-header">
        <div class="wg-title-badge">作战推演</div>
      </div>
      <div class="wg-grid">
        ${cards.map(card => `
          <div class="wg-card">
            <img src="${card.image}" alt="${card.title}">
            <div class="wg-card-title">${card.title}</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ===== Shared Decision/Concept State =====
let decSections = null;
let decCurrentSection = 0;
let decAutoPlay = false;
let decIsRecording = false;
let decTypeTimer = null;
let decAudioCtx = null;
let decAudioStream = null;
let decScriptNode = null;
let decSpeechWs = null;
let decConfirmedText = '';
let decStoppingRecord = false;
let decRecordingSection = 0;

function initDecSections() {
  if (!decSections) {
    decSections = [
      {...DATA.decisionContent.direction, displayed:DATA.decisionContent.direction.content, done:true},
      {...DATA.decisionContent.intent, displayed:DATA.decisionContent.intent.content, done:true},
      {...DATA.decisionContent.tactics, displayed:DATA.decisionContent.tactics.content, done:true},
      {...DATA.decisionContent.steps, displayed:DATA.decisionContent.steps.content, done:true},
    ];
  }
}

function renderDecisionView() {
  initDecSections();
  const el = document.getElementById('decisionView');
  el.innerHTML = `
    <style>
      .dec-sec-text[contenteditable] { cursor:text; outline:none; min-height:20px; transition:background 0.2s; }
      .dec-sec-text[contenteditable]:focus { background:rgba(0,0,0,0.05); border-radius:4px; }
      .dec-sec-text[contenteditable]:empty::before { content:attr(placeholder); color:rgba(0,0,0,0.3); font-style:italic; }
      .dec-outer { display:flex; flex:1; min-height:0; overflow:hidden; gap:0; }
      .dec-left-panel { width:28%; flex-shrink:0; background:#1a1a2e; border-radius:12px; margin:4px; display:flex; flex-direction:column; justify-content:center; align-items:center; position:relative; overflow:hidden; }
      .dec-left-panel::before { content:''; position:absolute; top:0; left:0; right:0; bottom:0; background:linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%); }
      .dec-left-bar { position:relative; z-index:1; display:flex; flex-direction:column; align-items:center; gap:8px; padding:14px 20px 10px; background:rgba(0,0,0,0.45); border-radius:16px; width:80%; }
      .dec-bar-row { display:flex; align-items:center; gap:8px; }
      .dec-bar-btn { display:flex; flex-direction:column; align-items:center; gap:3px; background:none; border:none; color:rgba(255,255,255,0.95); cursor:pointer; font-size:0.7rem; padding:3px 6px; }
      .dec-bar-btn:hover { color:#ffd54f; }
      .dec-bar-btn .ico { width:20px; height:20px; filter:brightness(0) invert(1); }
      .dec-rec-circle { width:32px; height:32px; border-radius:50%; background:#2e7d32; border:3px solid rgba(255,255,255,0.8); cursor:pointer; flex-shrink:0; display:flex; align-items:center; justify-content:center; font-size:1rem; color:#fff; transition:all 0.3s; }
      .dec-rec-circle.recording { background:#e53935; }
      .dec-wave { display:none; align-items:center; gap:2px; height:26px; }
      .dec-wave.active { display:flex; }
      .dec-wave-bar { width:4px; background:#e53935; border-radius:2px; animation:decWave 0.6s ease-in-out infinite alternate; }
      @keyframes decWave { from { height:4px; } to { height:22px; } }
      .dec-right-area { flex:1; display:flex; flex-direction:column; min-height:0; overflow-y:auto; padding:0 4px; }
      .dec-section-row { display:flex; gap:8px; margin-bottom:4px; min-height:0; }
      .dec-section-content { flex:1; background:rgba(255,248,235,0.92); padding:6px 12px; border-radius:4px; display:flex; flex-direction:column; justify-content:center; }
      .dec-section-img { width:22%; flex-shrink:0; }
      .dec-section-img img { width:100%; height:100%; object-fit:cover; border-radius:3px; }
      .dec-sec-hd { color:#c62828; font-size:1.15rem; font-weight:900; text-align:center; margin:3px 0 3px 0; letter-spacing:4px; }
      .dec-sec-bd { color:#1a1a1a; font-size:0.8rem; line-height:1.7; text-indent:2em; margin:0; }
    </style>
    <!-- Title row -->
    <div style="display:flex;align-items:center;flex-shrink:0;padding:2px 0 4px 6px">
      <span style="font-size:2rem">🎙</span>
      <h2 style="margin:0 0 0 6px;font-size:1.8rem;color:#ffd54f;font-weight:900;letter-spacing:5px;text-shadow:0 2px 8px rgba(0,0,0,0.6)">语音录入系统</h2>
      <div style="flex:1"></div>
      <button class="btn-military" style="opacity:0;pointer-events:auto;font-size:0.7rem" onclick="decAutoDisplay()">智能生成</button>
      <button class="btn-military" style="opacity:0;pointer-events:auto;font-size:0.7rem" id="decRecordBtn" onclick="decToggleRecording()">语音录入</button>
    </div>
    <!-- Body: left panel + right content/images -->
    <div class="dec-outer">
      <div class="dec-left-panel">
        <div class="dec-left-bar">
          <div class="dec-bar-row">
            <div class="dec-wave">
              <div class="dec-wave-bar" style="animation-delay:0s"></div>
              <div class="dec-wave-bar" style="animation-delay:0.12s"></div>
              <div class="dec-wave-bar" style="animation-delay:0.24s"></div>
              <div class="dec-wave-bar" style="animation-delay:0.08s"></div>
              <div class="dec-wave-bar" style="animation-delay:0.2s"></div>
              <div class="dec-wave-bar" style="animation-delay:0.04s"></div>
              <div class="dec-wave-bar" style="animation-delay:0.16s"></div>
              <div class="dec-wave-bar" style="animation-delay:0.28s"></div>
            </div>
            <div class="dec-rec-circle" id="decRecCircle" onclick="decToggleRecording()">▶</div>
            <div class="dec-wave">
              <div class="dec-wave-bar" style="animation-delay:0.18s"></div>
              <div class="dec-wave-bar" style="animation-delay:0.06s"></div>
              <div class="dec-wave-bar" style="animation-delay:0.26s"></div>
              <div class="dec-wave-bar" style="animation-delay:0.1s"></div>
              <div class="dec-wave-bar" style="animation-delay:0.22s"></div>
              <div class="dec-wave-bar" style="animation-delay:0.02s"></div>
              <div class="dec-wave-bar" style="animation-delay:0.14s"></div>
              <div class="dec-wave-bar" style="animation-delay:0.3s"></div>
            </div>
          </div>
          <div class="dec-bar-row" style="gap:10px">
            <button class="dec-bar-btn"><img class="ico" src="/static/images/icons/icon_edit.png"><span>转文本</span></button>
            <button class="dec-bar-btn"><img class="ico" src="/static/images/icons/icon_share.png"><span>发言人</span></button>
            <button class="dec-bar-btn"><img class="ico" src="/static/images/icons/icon_pin.png"><span>标签</span></button>
            <button class="dec-bar-btn"><span style="font-size:1.2rem;font-weight:900;line-height:1">A</span><span>样式</span></button>
            <button class="dec-bar-btn"><span style="font-size:1rem;line-height:1">⋮</span><span>更多</span></button>
          </div>
        </div>
      </div>
      <div class="dec-right-area" id="decSectionContent"></div>
    </div>
    <div id="decRecordingIndicator" class="hidden" style="display:none"></div>
  `;
  renderDecContent();
}

function renderDecContent() {
  const container = document.getElementById('decSectionContent');
  if (!container) return;
  const order = [1, 0, 2, 3]; // 作战企图, 主要作战方向和目标, 基本战法, 作战步骤
  const imgs = ['/static/images/形成构想方案1.png','/static/images/形成构想方案2.png','/static/images/形成构想方案3.png','/static/images/形成构想方案4.png'];
  container.innerHTML = order.map((i, idx) => {
    const s = decSections[i];
    return `<div class="dec-section-row" style="flex:1">
      <div class="dec-section-content">
        <div class="dec-sec-hd">${s.title}</div>
        <div class="dec-sec-text dec-sec-bd" contenteditable="true" data-idx="${i}" oninput="decOnInput(this,${i})" onblur="decOnBlur(${i})" placeholder="点击此处输入内容…">${s.displayed}${i===decCurrentSection && !s.done && (decAutoPlay||decIsRecording) ? '<span style="border-right:2px solid #c62828;animation:blink 1s infinite"></span>' : ''}</div>
      </div>
      <div class="dec-section-img" style="cursor:pointer;position:relative" onclick="decPickImage(${idx})" title="点击更换图片">
        <img id="decImg${idx}" src="${imgs[idx]}">
        <div style="position:absolute;bottom:4px;right:4px;background:rgba(0,0,0,0.5);color:#fff;font-size:0.6rem;padding:2px 6px;border-radius:3px;pointer-events:none">更换</div>
      </div>
    </div>`;
  }).join('');
}

function decPickImage(idx) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = document.getElementById('decImg' + idx);
      if (img) img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  };
  input.click();
}

function decOnInput(el, idx) {
  const text = el.innerText;
  decSections[idx].displayed = text;
  decSections[idx].content = text;
  if (text.trim().length > 0) decSections[idx].done = true;
}

function decOnBlur(idx) {
  // no-op, content is saved via decOnInput
}

const decDisplayOrder = [1, 0, 2, 3]; // intent, direction, tactics, steps
let decTypeIdx = 0;

function decRenderActive() {
  if (currentView === 'decisionPage') renderDecPageContent();
  else renderDecContent();
}

function decAutoDisplay() {
  decAutoPlay = true;
  decSections.forEach(s => { s.displayed=''; s.done=false; });
  if (currentView === 'decisionPage') {
    decCurrentSection = 0;
    decTypeIdx = 0;
  } else {
    decTypeIdx = 0;
    decCurrentSection = decDisplayOrder[0];
  }
  decRenderActive();
  decTypeSection();
}

function decTypeSection() {
  if (decTypeTimer) clearInterval(decTypeTimer);
  if (currentView === 'decisionPage') {
    // Sequential order for decision page
    if (decCurrentSection >= decSections.length) return;
    const s = decSections[decCurrentSection];
    let i = 0;
    decTypeTimer = setInterval(() => {
      if (i < s.content.length) { s.displayed = s.content.slice(0,i+1); i++; decRenderActive(); }
      else {
        s.done = true; clearInterval(decTypeTimer);
        if (decCurrentSection < decSections.length-1) {
          decCurrentSection++;
          setTimeout(decTypeSection, 500);
        }
        decRenderActive();
      }
    }, 30);
  } else {
    // PPT order for concept view
    if (decTypeIdx >= decDisplayOrder.length) return;
    decCurrentSection = decDisplayOrder[decTypeIdx];
    const s = decSections[decCurrentSection];
    let i = 0;
    decTypeTimer = setInterval(() => {
      if (i < s.content.length) { s.displayed = s.content.slice(0,i+1); i++; decRenderActive(); }
      else {
        s.done = true; clearInterval(decTypeTimer);
        decTypeIdx++;
        if (decTypeIdx < decDisplayOrder.length) {
          decCurrentSection = decDisplayOrder[decTypeIdx];
          setTimeout(decTypeSection, 500);
        }
        decRenderActive();
      }
    }, 30);
  }
}

function decToggleRecording() {
  if (decIsRecording) { decStopRecording(); return; }
  
  // HTTPS/localhost is required for microphone access — check this FIRST
  // (in insecure contexts, navigator.mediaDevices is undefined entirely)
  const isSecure = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!isSecure && location.protocol !== 'file:') {
    alert('录音功能需要 HTTPS 环境。\n当前为 HTTP 连接，浏览器禁止访问麦克风。\n\n请通过 HTTPS 访问本站，或在本机 localhost 使用。');
    return;
  }
  
  // Check for getUserMedia support
  let hasGetUserMedia = false;
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    hasGetUserMedia = true;
  } else if (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia) {
    hasGetUserMedia = true;
  }
  
  if (!hasGetUserMedia) {
    alert('浏览器不支持录音，请使用 Chrome 或 Edge。');
    return;
  }
  const wsProto = location.protocol === 'https:' ? 'wss' : 'ws';
  decSpeechWs = new WebSocket(wsProto + '://' + location.host + '/ws/speech');
  decSpeechWs.binaryType = 'arraybuffer';
  decRecordingSection = decCurrentSection;
  decConfirmedText = decSections[decRecordingSection].displayed || '';

  decSpeechWs.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.error) { alert('语音识别错误：' + msg.error); decStopRecording(); return; }
    const s = decSections[decRecordingSection];
    if (msg.partial) {
      s.displayed = decConfirmedText + msg.text;
      const textEl = document.querySelector(`.dec-sec-text[data-idx="${decRecordingSection}"]`);
      if (textEl) textEl.innerHTML = decConfirmedText + '<span style="color:rgba(0,0,0,0.4)">' + msg.text + '</span>';
    } else {
      decConfirmedText += msg.text;
      s.displayed = decConfirmedText;
      s.content = decConfirmedText;
      const textEl = document.querySelector(`.dec-sec-text[data-idx="${decRecordingSection}"]`);
      if (textEl) textEl.innerText = decConfirmedText;
    }
  };
  decSpeechWs.onclose = () => { if (decIsRecording && !decStoppingRecord) decStopRecording(); };
  decSpeechWs.onerror = () => { if (!decStoppingRecord) { alert('WebSocket连接失败'); decStopRecording(); } };

  decSpeechWs.onopen = () => {
    navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1, echoCancellation: false, noiseSuppression: false } }).then(stream => {
      decAudioStream = stream;
      const AC = window.AudioContext || window.webkitAudioContext;
      decAudioCtx = new AC();
      const nativeSR = decAudioCtx.sampleRate;
      const targetSR = 16000;
      const source = decAudioCtx.createMediaStreamSource(stream);
      decScriptNode = decAudioCtx.createScriptProcessor(4096, 1, 1);
      decScriptNode.onaudioprocess = (e) => {
        if (!decSpeechWs || decSpeechWs.readyState !== 1) return;
        const float32 = e.inputBuffer.getChannelData(0);
        // Resample from native rate to 16000
        let samples;
        if (nativeSR === targetSR) {
          samples = float32;
        } else {
          const ratio = nativeSR / targetSR;
          const newLen = Math.round(float32.length / ratio);
          samples = new Float32Array(newLen);
          for (let i = 0; i < newLen; i++) {
            const srcIdx = i * ratio;
            const idx = Math.floor(srcIdx);
            const frac = srcIdx - idx;
            samples[i] = idx + 1 < float32.length ? float32[idx] * (1 - frac) + float32[idx + 1] * frac : float32[idx];
          }
        }
        const int16 = new Int16Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
          let s = Math.max(-1, Math.min(1, samples[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        decSpeechWs.send(int16.buffer);
      };
      source.connect(decScriptNode);
      decScriptNode.connect(decAudioCtx.destination);
      decIsRecording = true;
      document.getElementById('decRecordBtn').textContent = '⏹ 停止录音';
      document.getElementById('decRecordBtn').style.background = '#ff4444';
      document.getElementById('decRecordingIndicator').classList.remove('hidden');
      const vIcon = document.getElementById('decVoiceIcon');
      const vLabel = document.getElementById('decVoiceLabel');
      if (vIcon) { vIcon.textContent = '●'; vIcon.style.color = '#e53935'; }
      if (vLabel) vLabel.textContent = '关闭语音';
      const rc = document.getElementById('decRecCircle');
      if (rc) { rc.textContent = '■'; rc.classList.add('recording'); }
      document.querySelectorAll('.dec-wave').forEach(w => w.classList.add('active'));
      decRenderActive();
    }).catch(err => {
      alert('无法启动录音：' + err.message);
      if (decSpeechWs) decSpeechWs.close();
    });
  };
}

function decStopRecording() {
  decStoppingRecord = true;
  if (decScriptNode) { decScriptNode.disconnect(); decScriptNode = null; }
  if (decAudioCtx) { decAudioCtx.close(); decAudioCtx = null; }
  if (decAudioStream) { decAudioStream.getTracks().forEach(t => t.stop()); decAudioStream = null; }
  if (decSpeechWs) {
    try { if (decSpeechWs.readyState === 1) decSpeechWs.send('EOF'); } catch(e) {}
    setTimeout(() => { try { if (decSpeechWs) { decSpeechWs.close(); decSpeechWs = null; } } catch(e) {} decStoppingRecord = false; }, 1000);
  } else { decStoppingRecord = false; }
  decIsRecording = false;
  const s = decSections[decRecordingSection];
  if (s.displayed && s.displayed.trim()) {
    s.done = true;
    const next = decCurrentSection + 1;
    if (next < decSections.length) decCurrentSection = next;
  }
  const btn = document.getElementById('decRecordBtn');
  if (btn) { btn.textContent = '语音录入'; btn.style.background = ''; }
  const ind = document.getElementById('decRecordingIndicator');
  if (ind) ind.classList.add('hidden');
  const vIcon2 = document.getElementById('decVoiceIcon');
  const vLabel2 = document.getElementById('decVoiceLabel');
  if (vIcon2) { vIcon2.textContent = '▶'; vIcon2.style.color = '#4caf50'; }
  if (vLabel2) vLabel2.textContent = '开启语音';
  const rc2 = document.getElementById('decRecCircle');
  if (rc2) { rc2.textContent = '▶'; rc2.classList.remove('recording'); }
  document.querySelectorAll('.dec-wave').forEach(w => w.classList.remove('active'));
  decRenderActive();
}

// ===== Modal =====
function openModal() { document.getElementById('addModuleModal').classList.remove('hidden'); }
function closeModal() { document.getElementById('addModuleModal').classList.add('hidden'); }
function saveModule() {
  const name = document.getElementById('moduleName').value.trim();
  const content = document.getElementById('moduleContent').value.trim();
  if (!name) return;
  customModules.push({ id: 'mod_' + Date.now(), name, content });
  localStorage.setItem('customAnalysisModules', JSON.stringify(customModules));
  document.getElementById('moduleName').value = '';
  document.getElementById('moduleContent').value = '';
  closeModal();
  renderRightArea();
}
