(() => {
  const STORE_KEY = 'zhidian.knowledge.v1';
  const masteryLabels = { fuzzy: '模糊', partial: '部分掌握', known: '已掌握' };
  const seedCards = [
    { id: 'seed-bayes', front: '贝叶斯定理在回答什么问题？', back: '它描述如何根据新证据更新一个假设的可信度。\n\nP(A|B) = P(B|A) × P(A) / P(B)', tag: '统计学', mastery: 'partial', links: ['seed-base-rate'], updatedAt: Date.now() - 1000 * 60 * 28 },
    { id: 'seed-base-rate', front: '什么是基率忽视？', back: '人在判断某个事件时，过度关注具体线索，却低估它在总体中的基础发生概率。\n\n诊断测试中的假阳性，是理解基率作用的经典例子。', tag: '认知科学', mastery: 'fuzzy', links: ['seed-bayes', 'seed-working-memory'], updatedAt: Date.now() - 1000 * 60 * 60 * 4 },
    { id: 'seed-working-memory', front: '工作记忆和短时记忆有什么区别？', back: '短时记忆强调信息暂时保持；工作记忆还包含对信息进行操作的过程。\n\n例如心算时，一边记住数字，一边执行加法。', tag: '认知科学', mastery: 'partial', links: ['seed-base-rate'], updatedAt: Date.now() - 1000 * 60 * 60 * 22 },
    { id: 'seed-entropy', front: '信息论中的熵，直觉上表示什么？', back: '熵衡量一个随机变量的不确定性。可能结果越多、概率越均匀，不确定性通常越高。\n\nH(X) = −Σ p(x) log₂ p(x)', tag: '信息论', mastery: 'known', links: [], updatedAt: Date.now() - 1000 * 60 * 60 * 30 },
    { id: 'seed-feedback', front: '为什么及时反馈有助于学习？', back: '反馈让学习者比较自己的预测与实际结果，从差异中修正理解。\n\n如果只看答案而没有先做预测，往往难以发现自己原先的误解。', tag: '学习方法', mastery: 'fuzzy', links: ['seed-working-memory'], updatedAt: Date.now() - 1000 * 60 * 60 * 45 },
    { id: 'seed-attention', front: '注意力切换为什么会带来成本？', back: '切换任务时，心智需要重新激活目标、规则和上下文。前一个任务的残留注意也可能干扰当前任务。', tag: '认知科学', mastery: 'partial', links: ['seed-working-memory'], updatedAt: Date.now() - 1000 * 60 * 60 * 70 }
  ];
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  let cards = loadCards();
  let view = 'all';
  let selectedTag = '';
  let selectedMastery = 'all';
  let searchQuery = '';
  let activeCardId = null;
  let editorCardId = null;
  let selectedLinks = new Set();
  let newestFirst = true;
  let toastTimer;

  function loadCards() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter(card => card && card.id && typeof card.front === 'string' && typeof card.back === 'string').map(card => ({ ...card, tag: card.tag || '', mastery: masteryLabels[card.mastery] ? card.mastery : 'fuzzy', links: Array.isArray(card.links) ? card.links : [] }));
      }
    } catch (error) { console.warn('Could not read local knowledge base', error); }
    return structuredClone(seedCards);
  }
  function saveCards() { localStorage.setItem(STORE_KEY, JSON.stringify(cards)); }
  function tags() { return [...new Set(cards.map(card => card.tag.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-Hans')); }
  function connectedCount(card) { return new Set((card.links || []).filter(id => cards.some(item => item.id === id))).size; }
  function relativeDate(time) {
    const minutes = Math.max(1, Math.floor((Date.now() - time) / 60000));
    if (minutes < 60) return `${minutes} 分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} 天前`;
    return new Date(time).toLocaleDateString('zh-Hans', { month: 'numeric', day: 'numeric' });
  }
  function getVisibleCards() {
    const query = searchQuery.trim().toLocaleLowerCase();
    let list = cards.filter(card => {
      if (view === 'fuzzy' && card.mastery === 'known') return false;
      if (view === 'recent' && Date.now() - card.updatedAt > 1000 * 60 * 60 * 24 * 30) return false;
      if (selectedTag && card.tag !== selectedTag) return false;
      if (selectedMastery !== 'all' && card.mastery !== selectedMastery) return false;
      if (query && !`${card.front}\n${card.back}\n${card.tag}`.toLocaleLowerCase().includes(query)) return false;
      return true;
    });
    return list.sort((a, b) => newestFirst ? b.updatedAt - a.updatedAt : a.front.localeCompare(b.front, 'zh-Hans'));
  }
  function renderStats() {
    $('#nav-total').textContent = cards.length;
    $('#nav-fuzzy').textContent = cards.filter(card => card.mastery !== 'known').length;
    $('#stat-cards').textContent = cards.length;
    $('#stat-links').textContent = cards.reduce((sum, card) => sum + connectedCount(card), 0) / 2;
    $('#stat-tags').textContent = tags().length;
    renderTags();
    renderTagOptions();
  }
  function renderTags() {
    const host = $('#tag-list');
    const list = tags();
    host.innerHTML = list.length ? list.map(tag => `<button class="tag-row ${selectedTag === tag ? 'selected' : ''}" data-tag="${escapeHtml(tag)}"><span class="tag-color"></span><span>${escapeHtml(tag)}</span><span class="tag-size">${cards.filter(card => card.tag === tag).length}</span></button>`).join('') : '<div class="no-relations" style="padding:4px 10px">还没有标签</div>';
    $$('.tag-row', host).forEach(button => button.addEventListener('click', () => { selectedTag = selectedTag === button.dataset.tag ? '' : button.dataset.tag; view = 'all'; syncNav(); render(); }));
  }
  function renderTagOptions() { $('#known-tags').innerHTML = tags().map(tag => `<option value="${escapeHtml(tag)}"></option>`).join(''); }
  function updateHeading() {
    const title = selectedTag ? selectedTag : view === 'recent' ? '最近编辑' : view === 'fuzzy' ? '还不熟悉' : searchQuery ? '搜索结果' : '所有卡片';
    $('#breadcrumb-current').textContent = title;
    $('#library-title').textContent = title;
    $('#page-title').innerHTML = selectedTag ? `关于 <em>${escapeHtml(selectedTag)}</em>` : view === 'recent' ? '最近整理的，<em>继续连起来。</em>' : view === 'fuzzy' ? '还有些模糊，<em>慢慢想起来。</em>' : searchQuery ? '找到你的，<em>知识线索。</em>' : '把记得的，<em>连接起来。</em>';
    const chips = [];
    if (selectedTag) chips.push(`<span class="active-chip">标签：${escapeHtml(selectedTag)} <button data-clear="tag" aria-label="清除标签">×</button></span>`);
    if (selectedMastery !== 'all') chips.push(`<span class="active-chip">掌握程度：${masteryLabels[selectedMastery]} <button data-clear="mastery" aria-label="清除掌握程度">×</button></span>`);
    if (searchQuery) chips.push(`<span class="active-chip">搜索：${escapeHtml(searchQuery)} <button data-clear="search" aria-label="清除搜索">×</button></span>`);
    const row = $('#active-filter-row');
    row.hidden = !chips.length;
    row.innerHTML = chips.join('');
    $$('[data-clear]', row).forEach(button => button.addEventListener('click', () => {
      if (button.dataset.clear === 'tag') selectedTag = '';
      if (button.dataset.clear === 'mastery') { selectedMastery = 'all'; $$('.filter-tab').forEach(tab => tab.classList.toggle('selected', tab.dataset.mastery === 'all')); }
      if (button.dataset.clear === 'search') { searchQuery = ''; $('#search-input').value = ''; }
      render();
    }));
  }
  function renderCards() {
    const list = getVisibleCards();
    const grid = $('#card-grid');
    grid.innerHTML = list.map(card => `<article class="knowledge-card" tabindex="0" role="button" aria-label="打开卡片：${escapeHtml(card.front)}" data-card-id="${escapeHtml(card.id)}">
      <div class="card-top"><span class="card-tag"><span class="card-tag-dot"></span>${escapeHtml(card.tag || '未分类')}</span><span class="mastery-pill mastery-${card.mastery}">${masteryLabels[card.mastery]}</span></div>
      <h3 class="card-title">${escapeHtml(card.front)}</h3><p class="card-answer">${escapeHtml(card.back)}</p>
      <div class="card-bottom"><span class="connection-indicator"><span class="connection-glyph">⌘</span>${connectedCount(card)} 个连接</span><span class="card-date">${relativeDate(card.updatedAt)}</span><span class="card-open-hint">↗</span></div>
    </article>`).join('');
    $$('.knowledge-card', grid).forEach(element => {
      const open = () => openDetail(element.dataset.cardId);
      element.addEventListener('click', open);
      element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    });
    $('#result-count').textContent = `${list.length} 个知识点`;
    $('#empty-state').hidden = list.length !== 0;
    grid.hidden = list.length === 0;
    const noData = cards.length === 0;
    $('#empty-title').textContent = noData ? '这里还没有知识卡片' : '没有找到匹配的卡片';
    $('#empty-copy').textContent = noData ? '从一个最近想起的概念开始，把它记下来。' : '试试其他关键词，或清除当前筛选条件。';
    $('#empty-create').hidden = !noData;
  }
  function syncNav() { $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view && !selectedTag)); }
  function render() { renderStats(); updateHeading(); renderCards(); syncNav(); }
  function openModal(element) { element.hidden = false; document.body.style.overflow = 'hidden'; }
  function closeModal(element) { element.hidden = true; if ($('#detail-modal').hidden && $('#editor-modal').hidden) document.body.style.overflow = ''; }
  function openDetail(id) {
    const card = cards.find(item => item.id === id);
    if (!card) return;
    activeCardId = id;
    $('#detail-tag').textContent = card.tag || '未分类';
    $('#detail-mastery').textContent = masteryLabels[card.mastery];
    $('#detail-mastery').className = `mastery-pill mastery-${card.mastery}`;
    $('#detail-title').textContent = card.front;
    $('#detail-answer').textContent = card.back;
    $('#detail-mastery-select').value = card.mastery;
    const related = cards.filter(item => (card.links || []).includes(item.id));
    $('#connection-count').textContent = related.length;
    $('#detail-connections').innerHTML = related.length ? related.map(item => `<button class="connection-item" data-related-id="${escapeHtml(item.id)}"><span class="relation-arrow">↗</span><span>${escapeHtml(item.front)}</span><span class="connection-tag">${escapeHtml(item.tag || '未分类')}</span></button>`).join('') : '<div class="no-connection-copy">还没有连接的卡片，从编辑中添加一条知识线索。</div>';
    $$('.connection-item', $('#detail-connections')).forEach(button => button.addEventListener('click', () => openDetail(button.dataset.relatedId)));
    openModal($('#detail-modal'));
  }
  function openEditor(id = null) {
    editorCardId = id;
    const card = cards.find(item => item.id === id);
    $('#editor-title').textContent = card ? '编辑知识卡片' : '新建知识卡片';
    $('#front-input').value = card?.front || '';
    $('#back-input').value = card?.back || '';
    $('#tag-input').value = card?.tag || '';
    $('#mastery-input').value = card?.mastery || 'fuzzy';
    $('#relation-search').value = '';
    $('#form-error').textContent = '';
    selectedLinks = new Set((card?.links || []).filter(link => link !== id));
    renderRelationPicker();
    openModal($('#editor-modal'));
    setTimeout(() => $('#front-input').focus(), 60);
  }
  function renderRelationPicker() {
    const currentId = editorCardId;
    const query = $('#relation-search').value.trim().toLocaleLowerCase();
    const candidates = cards.filter(card => card.id !== currentId && `${card.front} ${card.tag}`.toLocaleLowerCase().includes(query));
    $('#relation-picker').innerHTML = candidates.length ? candidates.map(card => `<label class="relation-option"><input type="checkbox" value="${escapeHtml(card.id)}" ${selectedLinks.has(card.id) ? 'checked' : ''}><span>${escapeHtml(card.front)}</span><span class="option-tag">${escapeHtml(card.tag || '未分类')}</span></label>`).join('') : '<div class="no-relations">没有找到其他卡片</div>';
    $$('input[type="checkbox"]', $('#relation-picker')).forEach(input => input.addEventListener('change', () => { input.checked ? selectedLinks.add(input.value) : selectedLinks.delete(input.value); renderSelectedLinks(); }));
    renderSelectedLinks();
  }
  function renderSelectedLinks() {
    $('#selected-relations').innerHTML = [...selectedLinks].map(id => cards.find(card => card.id === id)).filter(Boolean).map(card => `<span>${escapeHtml(card.front)}</span>`).join('');
  }
  function updateCardLinks(card, linkIds) {
    const wanted = new Set(linkIds.filter(id => id !== card.id && cards.some(item => item.id === id)));
    const previous = new Set(card.links || []);
    for (const other of cards) {
      if (other.id === card.id) continue;
      const wasLinked = previous.has(other.id) || (other.links || []).includes(card.id);
      const shouldLink = wanted.has(other.id);
      if (shouldLink) {
        card.links = [...new Set([...(card.links || []), other.id])];
        other.links = [...new Set([...(other.links || []), card.id])];
      } else if (wasLinked) {
        card.links = (card.links || []).filter(id => id !== other.id);
        other.links = (other.links || []).filter(id => id !== card.id);
      }
    }
  }
  function notify(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
  }
  function saveEditor(event) {
    event.preventDefault();
    const front = $('#front-input').value.trim();
    const back = $('#back-input').value.trim();
    const tag = $('#tag-input').value.trim().replace(/^#/, '');
    if (!front || !back) { $('#form-error').textContent = '请填写正面提示和反面解释。'; return; }
    if (tag.includes(',')) { $('#form-error').textContent = '第一版每张卡片只使用一个主题标签。'; return; }
    const now = Date.now();
    let card = cards.find(item => item.id === editorCardId);
    if (card) Object.assign(card, { front, back, tag, mastery: $('#mastery-input').value, updatedAt: now });
    else { card = { id: `card-${crypto.randomUUID()}`, front, back, tag, mastery: $('#mastery-input').value, links: [], updatedAt: now }; cards.unshift(card); }
    updateCardLinks(card, [...selectedLinks]);
    saveCards();
    closeModal($('#editor-modal'));
    closeModal($('#detail-modal'));
    render();
    notify(editorCardId ? '卡片已更新' : '卡片已保存');
    editorCardId = null;
  }
  function deleteActiveCard() {
    const card = cards.find(item => item.id === activeCardId);
    if (!card) return;
    if (!confirm(`删除「${card.front}」？相关卡片之间的连接也会移除。`)) return;
    cards = cards.filter(item => item.id !== activeCardId);
    cards.forEach(item => { item.links = (item.links || []).filter(id => id !== activeCardId); });
    saveCards(); closeModal($('#detail-modal')); render(); notify('卡片已删除');
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), cards }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `zhidian-knowledge-${new Date().toISOString().slice(0, 10)}.json`; link.click(); URL.revokeObjectURL(url);
    notify('知识库备份已导出');
  }
  async function importData(file) {
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = Array.isArray(parsed) ? parsed : parsed.cards;
      if (!Array.isArray(incoming) || !incoming.every(card => card && typeof card.front === 'string' && typeof card.back === 'string')) throw new Error('格式不正确');
      const ids = new Set();
      cards = incoming.map(card => {
        const id = card.id && !ids.has(card.id) ? card.id : `card-${crypto.randomUUID()}`;
        ids.add(id);
        return { id, front: card.front, back: card.back, tag: typeof card.tag === 'string' ? card.tag : '', mastery: masteryLabels[card.mastery] ? card.mastery : 'fuzzy', updatedAt: Number(card.updatedAt) || Date.now(), links: Array.isArray(card.links) ? card.links : [] };
      });
      const validIds = new Set(cards.map(card => card.id));
      cards.forEach(card => { card.links = [...new Set(card.links.filter(id => validIds.has(id) && id !== card.id))]; });
      saveCards(); render(); notify(`已导入 ${cards.length} 张卡片`);
    } catch (error) { notify('无法导入：请选一个知点 JSON 备份文件'); }
    $('#import-file').value = '';
  }

  $$('.nav-item').forEach(button => button.addEventListener('click', () => { view = button.dataset.view; selectedTag = ''; render(); if (innerWidth <= 640) $('#sidebar').classList.remove('open'); }));
  $$('.filter-tab').forEach(button => button.addEventListener('click', () => { selectedMastery = button.dataset.mastery; $$('.filter-tab').forEach(tab => tab.classList.toggle('selected', tab === button)); render(); }));
  $('#search-input').addEventListener('input', event => { searchQuery = event.target.value; render(); });
  $('#new-card').addEventListener('click', () => openEditor());
  $('#empty-create').addEventListener('click', () => openEditor());
  $('#edit-card').addEventListener('click', () => { const id = activeCardId; closeModal($('#detail-modal')); openEditor(id); });
  $('#delete-card').addEventListener('click', deleteActiveCard);
  $('#detail-mastery-select').addEventListener('change', event => { const card = cards.find(item => item.id === activeCardId); if (!card) return; card.mastery = event.target.value; card.updatedAt = Date.now(); saveCards(); render(); openDetail(card.id); notify('掌握程度已更新'); });
  $('#card-form').addEventListener('submit', saveEditor);
  $('#relation-search').addEventListener('input', renderRelationPicker);
  $$('.close-modal,[data-close]').forEach(button => button.addEventListener('click', () => { closeModal(button.closest('.modal-backdrop')); if (button.closest('#editor-modal')) editorCardId = null; }));
  $$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) { closeModal(backdrop); if (backdrop.id === 'editor-modal') editorCardId = null; } }));
  $('#sort-button').addEventListener('click', () => { newestFirst = !newestFirst; $('#sort-button').innerHTML = `<span>☷</span> ${newestFirst ? '最近更新' : '按名称'} <span class="sort-chevron">⌄</span>`; renderCards(); });
  function createTaggedCard() { openEditor(); $('#tag-input').focus(); }
  $('#add-tag').addEventListener('click', createTaggedCard);
  $('#manage-tags').addEventListener('click', createTaggedCard);
  $('#export-data').addEventListener('click', exportData);
  $('#import-data').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', event => { if (event.target.files?.[0]) importData(event.target.files[0]); });
  $('#mobile-menu').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#search-input').focus(); }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !$('#editor-modal').hidden) $('#card-form').requestSubmit();
    if (event.key === 'Escape') { $$('.modal-backdrop').forEach(modal => { if (!modal.hidden) closeModal(modal); }); $('#sidebar').classList.remove('open'); }
  });
  render();
})();
