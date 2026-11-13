(() => {
  const STORE_KEY = 'zhidian.knowledge.v1';
  const TAG_STORE_KEY = 'zhidian.knowledge.tags.v1';
  const TOMBSTONE_KEY = 'zhidian.knowledge.deleted.v1';
  const cloudConfig = window.ZHIDIAN_SUPABASE_CONFIG || {};
  let supabase = null;
  let supabaseLoadPromise = null;
  let answerToolsLoadPromise = null;
  const masteryLabels = { fuzzy: '不认识', partial: '模糊', known: '已掌握' };
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
  async function loadSupabaseClient() {
    if (supabase) return supabase;
    if (!cloudConfig.url || !cloudConfig.publishableKey) throw new Error('Supabase 配置缺失。');
    if (!supabaseLoadPromise) {
      supabaseLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
        script.async = true;
        const timeout = setTimeout(() => {
          script.remove();
          reject(new Error('云端组件加载超时。本机卡片仍可使用，请检查网络后重试。'));
        }, 9000);
        script.onload = () => {
          clearTimeout(timeout);
          if (!window.supabase?.createClient) { reject(new Error('云端组件无法启动。')); return; }
          try {
            supabase = window.supabase.createClient(cloudConfig.url, cloudConfig.publishableKey);
            resolve(supabase);
          } catch (error) { reject(error); }
        };
        script.onerror = () => {
          clearTimeout(timeout);
          reject(new Error('无法连接云端组件。本机卡片仍可使用，请检查网络后重试。'));
        };
        document.head.append(script);
      });
    }
    try { return await supabaseLoadPromise; }
    catch (error) { supabaseLoadPromise = null; throw error; }
  }
  let storageScope = '';
  let currentUser = null;
  let cloudSyncTimer = null;
  let cloudSyncRunning = false;
  let cloudSyncQueued = false;
  let cloudSyncDeclined = false;
  let declinedLocalImport = null;
  const storageKey = key => storageScope ? `${key}.user.${storageScope}` : key;
  function setSidebarOpen(isOpen) {
    const sidebar = $('#sidebar');
    const wasOpen = sidebar.classList.contains('open');
    sidebar.classList.toggle('open', isOpen);
    $('#sidebar-scrim').hidden = !isOpen;
    $('#mobile-menu').setAttribute('aria-expanded', String(isOpen));
    if (isOpen) $('#sidebar-close').focus();
    else if (wasOpen && innerWidth <= 640) $('#mobile-menu').focus();
  }
  let cards = loadCards();
  let customTags = loadTags();
  let expandedTags = new Set();
  let view = 'all';
  let selectedTag = '';
  let selectedMastery = 'all';
  let searchQuery = '';
  let activeCardId = null;
  let activeRelatedCards = [];
  let editorCardId = null;
  let editorInitialState = null;
  let selectedLinks = new Set();
  let newestFirst = true;
  let toastTimer;
  let modalScrollLockY = null;
  let contextCardId = null;
  let contextInvoker = null;
  let longPressTimer = null;
  let suppressCardClick = false;
  let roamHistory = [];
  let roamHistoryIndex = -1;

  function loadCards() {
    try {
      const raw = localStorage.getItem(storageKey(STORE_KEY));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.filter(card => card && card.id && typeof card.front === 'string' && typeof card.back === 'string').map(card => ({ ...card, tag: card.tag || '', mastery: masteryLabels[card.mastery] ? card.mastery : 'fuzzy', links: Array.isArray(card.links) ? card.links : [] }));
      }
    } catch (error) { console.warn('Could not read local knowledge base', error); }
    return structuredClone(seedCards);
  }
  function loadTags() {
    try {
      const parsed = JSON.parse(localStorage.getItem(storageKey(TAG_STORE_KEY)) || '[]');
      if (Array.isArray(parsed)) return [...new Set(parsed.filter(tag => typeof tag === 'string').map(tag => tag.trim()).filter(Boolean))];
    } catch (error) { console.warn('Could not read custom tags', error); }
    return [];
  }
  function setStorageNote(message) { $('#storage-note').textContent = message; }
  function saveCards() {
    localStorage.setItem(storageKey(STORE_KEY), JSON.stringify(cards));
    setStorageNote(currentUser ? '已保存到本机 · 正在同步云端' : '已保存到本机 · 登录后同步到云端');
    scheduleCloudSync();
  }
  function saveTags() {
    localStorage.setItem(storageKey(TAG_STORE_KEY), JSON.stringify(customTags));
    setStorageNote(currentUser ? '已保存到本机 · 正在同步云端' : '已保存到本机 · 登录后同步到云端');
    scheduleCloudSync();
  }
  window.addEventListener('storage', event => {
    if (event.key === storageKey(STORE_KEY) && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        if (!Array.isArray(parsed)) return;
        cards = normalizeCardDataset(parsed).cards;
        render();
        setStorageNote('已从其他标签页同步');
        scheduleCloudSync();
      } catch (error) { console.warn('Could not sync cards from another tab', error); }
    } else if (event.key === storageKey(TAG_STORE_KEY) && event.newValue) {
      try {
        const parsed = JSON.parse(event.newValue);
        if (!Array.isArray(parsed)) return;
        customTags = [...new Set(parsed.filter(tag => typeof tag === 'string').map(tag => tag.trim()).filter(Boolean))];
        render();
        setStorageNote('已从其他标签页同步');
        scheduleCloudSync();
      } catch (error) { console.warn('Could not sync tags from another tab', error); }
    }
  });
  function normalizeCardDataset(payload) {
    const incoming = Array.isArray(payload) ? payload : payload?.cards;
    if (!Array.isArray(incoming) || !incoming.every(card => card && typeof card.front === 'string' && typeof card.back === 'string')) throw new Error('卡片文件格式不正确');
    const importedTags = Array.isArray(payload?.tags) ? payload.tags.filter(tag => typeof tag === 'string').map(tag => tag.trim()).filter(Boolean) : [];
    const ids = new Set();
    const normalizedCards = incoming.map(card => {
      const id = card.id && !ids.has(card.id) ? card.id : `card-${crypto.randomUUID()}`;
      ids.add(id);
      return { id, front: card.front, back: card.back, tag: typeof card.tag === 'string' ? card.tag : '', mastery: masteryLabels[card.mastery] ? card.mastery : 'fuzzy', updatedAt: Number(card.updatedAt) || Date.now(), links: Array.isArray(card.links) ? card.links : [] };
    });
    const validIds = new Set(normalizedCards.map(card => card.id));
    normalizedCards.forEach(card => { card.links = [...new Set(card.links.filter(id => validIds.has(id) && id !== card.id))]; });
    return {
      cards: normalizedCards,
      tags: [...new Set([...importedTags, ...normalizedCards.map(card => card.tag.trim()).filter(Boolean)])]
    };
  }
  function setAccountState(message, isError = false) {
    const state = $('#account-state');
    state.textContent = message;
    state.dataset.error = String(isError);
  }
  function updateAccountUi() {
    const signedIn = Boolean(currentUser);
    $('#account-form').hidden = signedIn;
    $('#account-cloud-actions').hidden = !signedIn;
    $('#account-button').textContent = signedIn ? (currentUser.email?.[0]?.toUpperCase() || '✓') : '知';
    $('#account-button').title = signedIn ? `已登录：${currentUser.email}` : '账号与云端同步';
    if (signedIn && $('#account-state').dataset.error !== 'true') setAccountState(`已登录：${currentUser.email || '账号'} · 同步状态待确认`);
  }
  function readTombstones() {
    try {
      const value = JSON.parse(localStorage.getItem(storageKey(TOMBSTONE_KEY)) || '[]');
      return Array.isArray(value) ? value.filter(item => item && typeof item.id === 'string' && Number(item.deletedAt) > 0) : [];
    } catch { return []; }
  }
  function writeTombstones(items) { localStorage.setItem(storageKey(TOMBSTONE_KEY), JSON.stringify(items)); }
  function markCardDeleted(id) {
    const tombstones = readTombstones().filter(item => item.id !== id);
    tombstones.push({ id, deletedAt: Date.now() });
    writeTombstones(tombstones);
  }
  function scheduleCloudSync(delay = 700) {
    if (!supabase || !currentUser || cloudSyncDeclined) return;
    clearTimeout(cloudSyncTimer);
    cloudSyncTimer = setTimeout(() => syncCloud(), delay);
  }
  async function syncCloud({ legacyCards = null, legacyTags = null, initialLogin = false } = {}) {
    if (!supabase || !currentUser) return;
    if (cloudSyncRunning) { cloudSyncQueued = true; return; }
    cloudSyncRunning = true;
    const userId = currentUser.id;
    setAccountState('正在与云端同步…');
    try {
      const [cardResult, settingsResult] = await Promise.all([
        supabase.from('cards').select('card_id,card,updated_at,deleted_at').eq('user_id', userId),
        supabase.from('user_settings').select('custom_tags').eq('user_id', userId).maybeSingle()
      ]);
      if (cardResult.error) throw cardResult.error;
      if (settingsResult.error) throw settingsResult.error;
      if (currentUser?.id !== userId) return;
      const remoteRows = cardResult.data || [];
      let localCards = cards.slice();
      let localTags = customTags.slice();
      if (initialLogin && !remoteRows.length && Array.isArray(legacyCards) && legacyCards.length) {
        const importLocal = confirm(`这个账号的云端卡片库是空的。要把本机的 ${legacyCards.length} 张卡片导入云端吗？原有本机数据会保留。`);
        if (importLocal) {
          localCards = legacyCards;
          localTags = Array.isArray(legacyTags) ? legacyTags : [];
        } else {
          cloudSyncDeclined = true;
          declinedLocalImport = { cards: legacyCards, tags: legacyTags || [] };
          cards = [];
          customTags = [];
          localStorage.setItem(storageKey(STORE_KEY), JSON.stringify(cards));
          localStorage.setItem(storageKey(TAG_STORE_KEY), JSON.stringify(customTags));
          render();
          setAccountState('已登录 · 本机卡片未导入。可稍后点击“立即同步”重新选择。');
          return;
        }
      }
      const localTombstones = new Map(readTombstones().map(item => [item.id, Number(item.deletedAt)]));
      const merged = new Map();
      for (const row of remoteRows) {
        const card = row.card && typeof row.card === 'object' ? row.card : { id: row.card_id, front: '', back: '', tag: '', mastery: 'fuzzy', links: [] };
        const remoteDeletedAt = row.deleted_at ? Date.parse(row.deleted_at) : 0;
        const remoteAt = remoteDeletedAt || Number(card.updatedAt) || Date.parse(row.updated_at) || 0;
        merged.set(row.card_id, { card, timestamp: remoteAt, deletedAt: remoteDeletedAt });
      }
      for (const card of localCards) {
        const localDeletedAt = localTombstones.get(card.id) || 0;
        const localAt = localDeletedAt || Number(card.updatedAt) || Date.now();
        const prior = merged.get(card.id);
        if (!prior || localAt > prior.timestamp) merged.set(card.id, { card, timestamp: localAt, deletedAt: localDeletedAt });
      }
      for (const [id, deletedAt] of localTombstones) {
        const prior = merged.get(id);
        if (!prior || deletedAt > prior.timestamp) merged.set(id, { card: prior?.card || { id, front: '', back: '', tag: '', mastery: 'fuzzy', links: [] }, timestamp: deletedAt, deletedAt });
      }
      const finalRows = [...merged.entries()].map(([id, item]) => ({
        user_id: userId,
        card_id: id,
        card: { ...item.card, id },
        updated_at: new Date(item.timestamp || Date.now()).toISOString(),
        deleted_at: item.deletedAt ? new Date(item.deletedAt).toISOString() : null
      }));
      if (finalRows.length) {
        const { error } = await supabase.from('cards').upsert(finalRows, { onConflict: 'user_id,card_id' });
        if (error) throw error;
      }
      const cloudTags = Array.isArray(settingsResult.data?.custom_tags) ? settingsResult.data.custom_tags : [];
      const mergedTags = [...new Set([...localTags, ...cloudTags].filter(tag => typeof tag === 'string' && tag.trim()).map(tag => tag.trim()))];
      const { error: settingsError } = await supabase.from('user_settings').upsert({ user_id: userId, custom_tags: mergedTags, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (settingsError) throw settingsError;
      if (currentUser?.id !== userId) return;
      cards = [...merged.values()].filter(item => !item.deletedAt).map(item => item.card);
      customTags = mergedTags;
      declinedLocalImport = null;
      writeTombstones([...merged.entries()].filter(([, item]) => item.deletedAt).map(([id, item]) => ({ id, deletedAt: item.deletedAt })));
      localStorage.setItem(storageKey(STORE_KEY), JSON.stringify(cards));
      localStorage.setItem(storageKey(TAG_STORE_KEY), JSON.stringify(customTags));
      render();
      cloudSyncDeclined = false;
      setStorageNote('云端已同步 · 本机副本可离线使用');
      setAccountState(`已同步 · ${cards.length} 张卡片`);
    } catch (error) {
      console.warn('Cloud sync failed', error);
      const detail = String(error?.message || error || '未知错误');
      const schemaMissing = /relation .* does not exist|could not find the table|schema cache/i.test(detail);
      const message = schemaMissing ? '请先在 Supabase SQL Editor 运行项目中的 supabase/schema.sql。' : `同步失败：${detail}`;
      setAccountState(message, true);
      setStorageNote('本机副本已保存 · 云端暂不可用');
    } finally {
      cloudSyncRunning = false;
      if (cloudSyncQueued) {
        cloudSyncQueued = false;
        scheduleCloudSync(100);
      }
    }
  }
  async function handleAuthSession(session) {
    const user = session?.user || null;
    if (!user) {
      if (currentUser) {
        currentUser = null;
        storageScope = '';
        cloudSyncDeclined = false;
        declinedLocalImport = null;
        cards = loadCards();
        customTags = loadTags();
        render();
      }
      updateAccountUi();
      if (!currentUser) setAccountState('尚未登录 · 卡片保存在本机');
      return;
    }
    if (currentUser?.id === user.id) { currentUser = user; updateAccountUi(); return; }
    const guestCards = cards.slice();
    const guestTags = customTags.slice();
    currentUser = user;
    storageScope = user.id;
    cloudSyncDeclined = false;
    declinedLocalImport = null;
    const hasAccountCopy = localStorage.getItem(storageKey(STORE_KEY)) !== null;
    if (hasAccountCopy) {
      cards = loadCards();
      customTags = loadTags();
    } else {
      cards = [];
      customTags = [];
    }
    render();
    updateAccountUi();
    await syncCloud({ legacyCards: hasAccountCopy ? null : guestCards, legacyTags: hasAccountCopy ? null : guestTags, initialLogin: !hasAccountCopy });
  }
  async function initializeCloudAuth() {
    updateAccountUi();
    setAccountState('正在连接云端账号…');
    try {
      const client = await loadSupabaseClient();
      client.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => handleAuthSession(session), 0);
      });
    } catch (error) { setAccountState(error.message || '云端暂不可用，本机卡片仍可使用。', true); }
  }
  $('#account-button').addEventListener('click', () => openModal($('#account-modal')));
  $('#account-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const client = await loadSupabaseClient();
      const { error } = await client.auth.signInWithPassword({ email: $('#account-email').value.trim(), password: $('#account-password').value });
      if (error) setAccountState(error.message, true);
    } catch (error) { setAccountState(error.message || '云端暂不可用，请检查网络后重试。', true); }
  });
  $('#sign-up-button').addEventListener('click', async () => {
    const email = $('#account-email').value.trim();
    const password = $('#account-password').value;
    if (!email || password.length < 8) { setAccountState('请填写邮箱，并设置至少 8 位密码。', true); return; }
    try {
      const client = await loadSupabaseClient();
      const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href } });
      if (error) setAccountState(error.message, true);
      else if (!data.session) setAccountState('账号已创建。请查收确认邮件，再回到这里登录。');
      else setAccountState('账号已创建，正在准备同步…');
    } catch (error) { setAccountState(error.message || '云端暂不可用，请检查网络后重试。', true); }
  });
  $('#sync-now-button').addEventListener('click', () => {
    cloudSyncDeclined = false;
    if (declinedLocalImport) {
      const pending = declinedLocalImport;
      syncCloud({ legacyCards: pending.cards, legacyTags: pending.tags, initialLogin: true });
    } else syncCloud();
  });
  $('#sign-out-button').addEventListener('click', async () => {
    const { error } = await supabase?.auth.signOut() || { error: new Error('云端暂不可用。') };
    if (error) setAccountState(error.message, true);
    else { closeModal($('#account-modal')); notify('已退出登录，本机卡片仍保留'); }
  });
  window.addEventListener('online', () => scheduleCloudSync(150));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleCloudSync(150); });
  function tags() {
    const all = new Set();
    [...customTags, ...cards.map(card => card.tag.trim()).filter(Boolean)].forEach(tag => {
      const parts = tag.split('/').map(part => part.trim()).filter(Boolean);
      for (let index = 1; index <= parts.length; index += 1) all.add(parts.slice(0, index).join('/'));
    });
    return [...all].sort((a, b) => a.localeCompare(b, 'zh-Hans'));
  }
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
  function hasAnyConnection(card) {
    return connectedCount(card) > 0 || cards.some(other => other.id !== card.id && (other.links || []).includes(card.id));
  }
  function getVisibleCards() {
    const query = searchQuery.trim().toLocaleLowerCase();
    let list = cards.filter(card => {
      if (view === 'fuzzy' && card.mastery === 'known') return false;
      if (view === 'recent' && Date.now() - card.updatedAt > 1000 * 60 * 60 * 24 * 30) return false;
      if (view === 'untagged' && card.tag.trim()) return false;
      if (view === 'tagged' && !card.tag.trim()) return false;
      if (view === 'unlinked' && hasAnyConnection(card)) return false;
      if (view === 'linked' && !hasAnyConnection(card)) return false;
      if (selectedTag && card.tag !== selectedTag && !card.tag.startsWith(`${selectedTag}/`)) return false;
      if (selectedMastery !== 'all' && card.mastery !== selectedMastery) return false;
      if (query && !`${card.front}\n${card.back}\n${card.tag}`.toLocaleLowerCase().includes(query)) return false;
      return true;
    });
    return list.sort((a, b) => newestFirst ? b.updatedAt - a.updatedAt : a.front.localeCompare(b.front, 'zh-Hans'));
  }
  function renderStats() {
    const untagged = cards.filter(card => !card.tag.trim()).length;
    const unlinked = cards.filter(card => !hasAnyConnection(card)).length;
    $('#nav-total').textContent = cards.length;
    $('#nav-fuzzy').textContent = cards.filter(card => card.mastery !== 'known').length;
    $('#stat-cards').textContent = cards.length;
    $('#stat-untagged').textContent = untagged;
    $('#stat-unlinked').textContent = unlinked;
    $('#stat-tags').textContent = tags().length;
    $('#gap-untagged').textContent = untagged;
    $('#gap-unlinked').textContent = unlinked;
    renderTags();
    renderTagOptions();
  }
  function renderStatistics() {
    const total = cards.length || 1;
    const tagged = cards.filter(card => card.tag.trim()).length;
    const connected = cards.filter(hasAnyConnection).length;
    const mastery = ['known', 'partial', 'fuzzy'].map(key => ({ key, label: masteryLabels[key], count: cards.filter(card => card.mastery === key).length }));
    const summary = [
      { value: cards.length, label: '知识卡片', note: '持续积累的概念', action: 'all' },
      { value: `${Math.round(tagged / total * 100)}%`, label: '已分类', note: `${tagged} 张已有标签`, action: 'tagged' },
      { value: connected, label: '已连接卡片', note: '至少关联一张卡片', action: 'linked' },
      { value: tags().length, label: '标签主题', note: '包含多级子标签', action: '' }
    ];
    $('#stats-summary').innerHTML = summary.map(item => `<button class="stats-summary-card" ${item.action ? `data-open-view="${item.action}"` : 'data-open-tags'} type="button"><span class="summary-value">${item.value}</span><span class="summary-label">${item.label}</span><small>${item.note}</small></button>`).join('');
    $$('[data-open-view]', $('#stats-summary')).forEach(button => button.addEventListener('click', () => openView(button.dataset.openView)));
    $$('[data-open-tags]', $('#stats-summary')).forEach(button => button.addEventListener('click', () => { openView('all'); $('#manage-tags').focus(); }));

    const months = [];
    const now = new Date();
    for (let offset = 5; offset >= 0; offset -= 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      months.push({ year: date.getFullYear(), month: date.getMonth(), label: date.toLocaleDateString('zh-Hans', { month: 'short' }), count: 0 });
    }
    cards.forEach(card => {
      const date = new Date(Number(card.updatedAt) || 0);
      const bucket = months.find(month => month.year === date.getFullYear() && month.month === date.getMonth());
      if (bucket) bucket.count += 1;
    });
    const maxActivity = Math.max(1, ...months.map(month => month.count));
    $('#activity-chart').innerHTML = months.map(month => `<div class="activity-column" aria-label="${month.year}年${month.month + 1}月，${month.count}张卡片"><span class="activity-value">${month.count || ''}</span><div class="activity-track"><i style="height:${Math.max(4, month.count / maxActivity * 100)}%"></i></div><span class="activity-month">${month.label}</span></div>`).join('');

    $('#mastery-chart').innerHTML = mastery.map(item => `<button class="mastery-stat-row" data-master-filter="${item.key}" type="button"><span class="mastery-stat-label"><i class="mastery-dot mastery-dot-${item.key}"></i>${item.label}</span><span class="mastery-stat-track"><i class="mastery-stat-fill mastery-fill-${item.key}" style="width:${item.count / total * 100}%"></i></span><strong>${item.count}</strong></button>`).join('');

    const exactTagCounts = tags().map(tag => ({ tag, count: cards.filter(card => card.tag === tag).length })).filter(item => item.count).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, 'zh-Hans')).slice(0, 6);
    const maxTagCount = Math.max(1, ...exactTagCounts.map(item => item.count));
    $('#tag-stats-list').innerHTML = exactTagCounts.length ? exactTagCounts.map(item => `<button class="tag-stat-row" data-stat-tag="${escapeHtml(item.tag)}" type="button"><span class="tag-stat-name" title="${escapeHtml(item.tag)}">${escapeHtml(item.tag)}</span><span class="tag-stat-track"><i style="width:${item.count / maxTagCount * 100}%"></i></span><strong>${item.count}</strong></button>`).join('') : '<p class="stats-empty">添加标签后，这里会显示常用主题。</p>';

    $$('[data-master-filter]', $('#mastery-chart')).forEach(button => button.addEventListener('click', () => {
      selectedMastery = button.dataset.masterFilter;
      $$('.filter-tab').forEach(tab => tab.classList.toggle('selected', tab.dataset.mastery === selectedMastery));
      view = 'all'; selectedTag = ''; render();
    }));
    $$('[data-stat-tag]', $('#tag-stats-list')).forEach(button => button.addEventListener('click', () => {
      selectedTag = button.dataset.statTag; selectedMastery = 'all';
      $$('.filter-tab').forEach(tab => tab.classList.toggle('selected', tab.dataset.mastery === 'all'));
      view = 'all'; render();
    }));
  }
  function openView(nextView) {
    view = nextView;
    selectedTag = '';
    selectedMastery = 'all';
    $$('.filter-tab').forEach(tab => tab.classList.toggle('selected', tab.dataset.mastery === 'all'));
    render();
    if (innerWidth <= 640) setSidebarOpen(false);
  }
  function renderTags() {
    const host = $('#tag-list');
    const list = tags();
    const known = new Set(list);
    const children = new Map();
    list.forEach(tag => {
      const splitAt = tag.lastIndexOf('/');
      const parent = splitAt < 0 ? '' : tag.slice(0, splitAt);
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(tag);
    });
    const countFor = tag => cards.filter(card => card.tag === tag || card.tag.startsWith(`${tag}/`)).length;
    const renderBranch = (tag, depth = 0) => {
      const nested = (children.get(tag) || []).filter(child => known.has(child));
      const expanded = expandedTags.has(tag);
      const segments = tag.split('/');
      const label = segments[segments.length - 1];
      return `<div class="tag-node" style="--tag-depth:${depth}"><div class="tag-row-line">${nested.length ? `<button class="tag-expand" data-expand-tag="${escapeHtml(tag)}" aria-label="${expanded ? '折叠' : '展开'}${escapeHtml(label)}" aria-expanded="${expanded}">${expanded ? '⌄' : '›'}</button>` : '<span class="tag-expand-placeholder"></span>'}<button class="tag-row ${selectedTag === tag ? 'selected' : ''}" data-tag="${escapeHtml(tag)}"><span class="tag-color"></span><span class="tag-label" title="${escapeHtml(tag)}">${escapeHtml(label)}</span><span class="tag-size">${countFor(tag)}</span></button></div>${nested.length && expanded ? `<div class="tag-children">${nested.map(child => renderBranch(child, depth + 1)).join('')}</div>` : ''}</div>`;
    };
    host.innerHTML = list.length ? (children.get('') || []).map(tag => renderBranch(tag)).join('') : '<div class="no-relations" style="padding:4px 10px">还没有标签</div>';
    $$('[data-expand-tag]', host).forEach(button => button.addEventListener('click', () => {
      const tag = button.dataset.expandTag;
      if (expandedTags.has(tag)) expandedTags.delete(tag); else expandedTags.add(tag);
      renderTags();
    }));
    $$('.tag-row', host).forEach(button => button.addEventListener('click', () => { selectedTag = selectedTag === button.dataset.tag ? '' : button.dataset.tag; view = 'all'; syncNav(); render(); }));
  }
  function renderTagOptions() { $('#known-tags').innerHTML = tags().map(tag => `<option value="${escapeHtml(tag)}"></option>`).join(''); }
  function updateHeading() {
    const title = selectedTag ? selectedTag : view === 'stats' ? '统计' : view === 'roam' ? '漫游' : view === 'untagged' ? '未分类' : view === 'tagged' ? '已分类' : view === 'unlinked' ? '无关联' : view === 'linked' ? '已连接' : view === 'recent' ? '最近编辑' : view === 'fuzzy' ? '还不熟悉' : searchQuery ? '搜索结果' : '所有卡片';
    $('#breadcrumb-current').textContent = title;
    $('#library-title').textContent = title;
    $('#page-title').innerHTML = selectedTag ? `关于 <em>${escapeHtml(selectedTag)}</em>` : view === 'stats' ? '你的知识库，<em>正在生长。</em>' : view === 'roam' ? '随手翻开，<em>遇见一个想法。</em>' : view === 'untagged' ? '还没归类的，<em>知识线索。</em>' : view === 'tagged' ? '有标签的，<em>知识脉络。</em>' : view === 'unlinked' ? '尚未连接的，<em>独立想法。</em>' : view === 'linked' ? '已有联系的，<em>知识网络。</em>' : view === 'recent' ? '最近整理的，<em>继续连起来。</em>' : view === 'fuzzy' ? '还有些模糊，<em>慢慢想起来。</em>' : searchQuery ? '找到你的，<em>知识线索。</em>' : '把记得的，<em>连接起来。</em>';
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
    grid.innerHTML = list.map(card => `<article class="knowledge-card" tabindex="0" aria-label="卡片：${escapeHtml(card.front)}。按 Enter 打开，按 Shift+F10 查看操作" data-card-id="${escapeHtml(card.id)}">
      <div class="card-top"><span class="card-tag"><span class="card-tag-dot"></span>${escapeHtml(card.tag || '未分类')}</span><span class="mastery-pill mastery-${card.mastery}">${masteryLabels[card.mastery]}</span><button class="icon-button tiny card-more-button" type="button" aria-label="卡片操作：${escapeHtml(card.front)}" aria-haspopup="menu" title="卡片操作">⋯</button></div>
      <h3 class="card-title">${escapeHtml(card.front)}</h3>
      <div class="card-bottom"><span class="connection-indicator"><span class="connection-glyph">⌘</span>${connectedCount(card)} 个连接</span><span class="card-date">${relativeDate(card.updatedAt)}</span><span class="card-open-hint">↗</span></div>
    </article>`).join('');
    $$('.knowledge-card', grid).forEach(element => {
      const open = () => openDetail(element.dataset.cardId);
      element.addEventListener('click', event => {
        if (event.target.closest('.card-more-button')) return;
        if (suppressCardClick) { suppressCardClick = false; event.preventDefault(); return; }
        open();
      });
      element.addEventListener('keydown', event => {
        if (event.target !== element) return;
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
        else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault();
          const bounds = element.getBoundingClientRect();
          openCardContextMenu(element.dataset.cardId, bounds.left + bounds.width / 2, bounds.top + bounds.height / 2, element, true);
        }
      });
      element.querySelector('.card-more-button').addEventListener('click', event => {
        event.stopPropagation();
        const bounds = event.currentTarget.getBoundingClientRect();
        openCardContextMenu(element.dataset.cardId, bounds.right, bounds.bottom, event.currentTarget, true);
      });
      element.addEventListener('contextmenu', event => {
        event.preventDefault();
        openCardContextMenu(element.dataset.cardId, event.clientX, event.clientY, element, true);
      });
      element.addEventListener('pointerdown', event => {
        if (event.pointerType !== 'touch' || event.target.closest('button')) return;
        const cardId = element.dataset.cardId;
        const x = event.clientX;
        const y = event.clientY;
        clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
          suppressCardClick = true;
          openCardContextMenu(cardId, x, y, element, true);
          setTimeout(() => { suppressCardClick = false; }, 1200);
        }, 520);
      });
      element.addEventListener('pointermove', event => {
        if (event.pointerType !== 'touch' || !longPressTimer) return;
        if (Math.abs(event.movementX) + Math.abs(event.movementY) > 12) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(type => element.addEventListener(type, () => {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }));
    });
    $('#result-count').textContent = `${list.length} 个知识点`;
    $('#empty-state').hidden = list.length !== 0;
    grid.hidden = list.length === 0;
    const noData = cards.length === 0;
    $('#empty-title').textContent = noData ? '这里还没有知识卡片' : '没有找到匹配的卡片';
    $('#empty-copy').textContent = noData ? '从一个最近想起的概念开始，把它记下来。' : '试试其他关键词，或清除当前筛选条件。';
    $('#empty-create').hidden = !noData;
  }
  function openCardContextMenu(cardId, x, y, invoker, focusFirst = false) {
    if (!cards.some(card => card.id === cardId)) return;
    const menu = $('#card-context-menu');
    contextCardId = cardId;
    contextInvoker = invoker || null;
    menu.hidden = false;
    const margin = 8;
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(margin, Math.min(x, innerWidth - bounds.width - margin))}px`;
    menu.style.top = `${Math.max(margin, Math.min(y, innerHeight - bounds.height - margin))}px`;
    if (focusFirst) $('[data-context-action="edit"]', menu).focus();
  }
  function closeCardContextMenu(restoreFocus = false) {
    const menu = $('#card-context-menu');
    if (menu.hidden) return;
    menu.hidden = true;
    contextCardId = null;
    if (restoreFocus && contextInvoker?.isConnected) contextInvoker.focus();
    contextInvoker = null;
  }
  function syncNav() { $$('.nav-item').forEach(button => button.classList.toggle('active', button.dataset.view === view && !selectedTag)); }
  function render() {
    renderStats(); updateHeading();
    const statsOpen = view === 'stats';
    const roamOpen = view === 'roam';
    $('#stats-view').hidden = !statsOpen;
    $('#roam-view').hidden = !roamOpen;
    $('#library-section').hidden = statsOpen || roamOpen;
    $('#overview-strip').hidden = statsOpen || roamOpen;
    $('#welcome-row').hidden = statsOpen || roamOpen;
    if (statsOpen) renderStatistics();
    renderCards(); syncNav();
  }
  function openModal(element) {
    element.hidden = false;
    if (modalScrollLockY === null) {
      modalScrollLockY = window.scrollY;
      document.body.style.overflow = 'hidden';
      if (innerWidth <= 640) {
        document.body.style.position = 'fixed';
        document.body.style.top = `-${modalScrollLockY}px`;
        document.body.style.width = '100%';
      }
    }
  }
  function closeModal(element) {
    element.hidden = true;
    if ($$('.modal-backdrop').every(modal => modal.hidden) && modalScrollLockY !== null) {
      const scrollY = modalScrollLockY;
      modalScrollLockY = null;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.width = '';
      window.scrollTo(0, scrollY);
    }
  }
  function renderAnswerMarkup(source = '') {
    const lines = String(source).replace(/\r\n?/g, '\n').split('\n');
    const blocks = [];
    let paragraph = [];
    let codeLines = null;
    let fence = '';
    let language = '';
    const renderInline = text => text.split(/(`[^`\n]*`)/g).map(part => {
      if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      return escapeHtml(part).replace(/\n/g, '<br>');
    }).join('');
    const flushParagraph = () => {
      if (paragraph.length) blocks.push(`<p>${renderInline(paragraph.join('\n'))}</p>`);
      paragraph = [];
    };
    const flushCode = () => {
      const className = language ? ` class="language-${escapeHtml(language)}"` : '';
      blocks.push(`<pre><code${className}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      codeLines = null;
      fence = '';
      language = '';
    };
    lines.forEach(line => {
      if (codeLines) {
        const closing = line.trim().match(/^(`+|~+)\s*$/);
        if (closing && closing[1][0] === fence[0] && closing[1].length >= fence.length) flushCode();
        else codeLines.push(line);
        return;
      }
      const opening = line.match(/^\s*(`{3,}|~{3,})(.*)$/);
      if (opening) {
        flushParagraph();
        fence = opening[1];
        language = opening[2].trim().split(/\s+/, 1)[0]?.replace(/[^\w+-]/g, '') || '';
        codeLines = [];
        return;
      }
      if (!line.trim()) flushParagraph();
      else paragraph.push(line);
    });
    flushParagraph();
    if (codeLines) flushCode();
    return blocks.join('\n');
  }
  function renderMarkdownAnswer(source = '') {
    if (!window.marked?.parse || !window.DOMPurify?.sanitize) return renderAnswerMarkup(source);
    const formulas = [];
    const marker = `ZHIDIANMATH${crypto.randomUUID().replaceAll('-', '')}`;
    const markdown = String(source).replace(/\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^\n$]+?\$/g, formula => {
      const placeholder = `${marker}${formulas.length}END`;
      formulas.push({ placeholder, formula });
      return placeholder;
    }).replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
    let html = window.DOMPurify.sanitize(window.marked.parse(markdown, { gfm: true, breaks: true }));
    formulas.forEach(({ placeholder, formula }) => {
      html = html.replaceAll(placeholder, escapeHtml(formula));
    });
    return html;
  }
  function loadAnswerScript(src, integrity = '') {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.crossOrigin = 'anonymous';
      if (integrity) script.integrity = integrity;
      script.onload = resolve;
      script.onerror = () => reject(new Error('卡片排版组件暂不可用。'));
      document.head.append(script);
    });
  }
  function ensureAnswerTools() {
    if (window.marked?.parse && window.DOMPurify?.sanitize && window.renderMathInElement) return Promise.resolve();
    if (!answerToolsLoadPromise) {
      const stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.href = 'https://cdn.jsdelivr.net/npm/katex@0.19.1/dist/katex.min.css';
      stylesheet.integrity = 'sha384-WwGtaC6ywCHxA5cstpj/3+xIZvTez8dq2IcBQaXRkenHZ7FVVq1ZROtURwfbtTlG';
      stylesheet.crossOrigin = 'anonymous';
      document.head.append(stylesheet);
      answerToolsLoadPromise = Promise.all([
        window.marked?.parse ? Promise.resolve() : loadAnswerScript('https://cdn.jsdelivr.net/npm/marked@18.2.0/lib/marked.umd.js'),
        window.DOMPurify?.sanitize ? Promise.resolve() : loadAnswerScript('https://cdn.jsdelivr.net/npm/dompurify@3.4.17/dist/purify.min.js')
      ]).then(() => window.katex?.render ? undefined : loadAnswerScript('https://cdn.jsdelivr.net/npm/katex@0.19.1/dist/katex.min.js', 'sha384-a1WQdjRj162i159OYq041X6I4K8NenkrI09LlPmiHg0YOb7CR+wJOraXwK9abpnE'))
        .then(() => window.renderMathInElement ? undefined : loadAnswerScript('https://cdn.jsdelivr.net/npm/katex@0.19.1/dist/contrib/auto-render.min.js', 'sha384-bjyGPfbij8/NDKJhSGZNP/khQVgtHUE5exjm4Ydllo42FwIgYsdLO2lXGmRBf5Mz'))
        .catch(error => { answerToolsLoadPromise = null; throw error; });
    }
    return answerToolsLoadPromise;
  }
  function renderAnswerMath(element) {
    if (typeof window.renderMathInElement !== 'function') return;
    window.renderMathInElement(element, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '\\[', right: '\\]', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false }
      ],
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
      throwOnError: false
    });
  }
  function renderConnections(card) {
    activeRelatedCards = cards.filter(item => (card.links || []).includes(item.id));
    $$('.related-toggle-count').forEach(count => { count.textContent = activeRelatedCards.length; });
    $('#related-current-title').textContent = card.front;
    $('#related-modal-count').textContent = activeRelatedCards.length;
    $('#open-related-graph').hidden = activeRelatedCards.length === 0;
  }
  function renderRelatedCards() {
    const list = $('#related-card-list');
    list.innerHTML = activeRelatedCards.map(item => `<button class="related-result-card" data-related-id="${escapeHtml(item.id)}" type="button"><span class="related-result-meta"><span class="card-tag"><span class="card-tag-dot"></span>${escapeHtml(item.tag || '未分类')}</span><span class="mastery-pill mastery-${item.mastery}">${masteryLabels[item.mastery]}</span></span><strong>${escapeHtml(item.front)}</strong><span class="related-result-open">打开卡片 ↗</span></button>`).join('');
    list.hidden = activeRelatedCards.length === 0;
    $('#related-empty').hidden = activeRelatedCards.length > 0;
    $$('.related-result-card', list).forEach(button => button.addEventListener('click', () => {
      closeModal($('#related-modal'));
      openDetail(button.dataset.relatedId);
    }));
  }
  function graphLabelLines(value, maxChars) {
    const chars = Array.from(String(value || ''));
    const shown = chars.slice(0, maxChars * 2);
    if (chars.length > maxChars * 2) shown[shown.length - 1] = '…';
    return [shown.slice(0, maxChars).join(''), shown.slice(maxChars).join('')].filter(Boolean);
  }
  function renderLocalGraph(card, related) {
    const limit = 10;
    const nodes = related.slice(0, limit);
    const center = { x: 320, y: 210 };
    const radius = 148;
    const positions = nodes.map((item, index) => {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index) / Math.max(nodes.length, 1);
      return { card: item, x: center.x + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle) };
    });
    const edges = positions.map(node => `<line class="graph-edge" x1="${center.x}" y1="${center.y}" x2="${node.x}" y2="${node.y}" />`);
    for (let left = 0; left < positions.length; left += 1) {
      for (let right = left + 1; right < positions.length; right += 1) {
        const first = positions[left].card;
        const second = positions[right].card;
        if ((first.links || []).includes(second.id) || (second.links || []).includes(first.id)) {
          edges.push(`<line class="graph-edge graph-edge-related" x1="${positions[left].x}" y1="${positions[left].y}" x2="${positions[right].x}" y2="${positions[right].y}" />`);
        }
      }
    }
    const drawNode = (item, x, y, isCurrent = false) => {
      const lines = graphLabelLines(item.front, isCurrent ? 9 : 6);
      const text = lines.map((line, index) => `<tspan x="${x}" dy="${lines.length > 1 && index === 0 ? '-4' : index === 1 ? '15' : '0'}">${escapeHtml(line)}</tspan>`).join('');
      return `<g class="graph-node${isCurrent ? ' graph-node-current' : ''}" ${isCurrent ? '' : `tabindex="0" role="button" data-graph-card-id="${escapeHtml(item.id)}"`} aria-label="${isCurrent ? '当前卡片：' : '打开卡片：'}${escapeHtml(item.front)}"><title>${escapeHtml(item.front)}</title><circle cx="${x}" cy="${y}" r="${isCurrent ? 56 : 42}" /><text x="${x}" y="${y + (lines.length > 1 ? -3 : 4)}" text-anchor="middle">${text}</text></g>`;
    };
    const graph = $('#local-graph');
    graph.innerHTML = `<svg viewBox="0 0 640 420" role="img" aria-label="当前卡片与直接关联卡片的关系图">${edges.join('')}${positions.map(node => drawNode(node.card, node.x, node.y)).join('')}${drawNode(card, center.x, center.y, true)}</svg>`;
    $('#graph-note').hidden = related.length <= limit;
    $('#graph-note').textContent = related.length > limit ? `图中显示前 ${limit} 个直接关联；完整列表可在详情中展开。` : '';
    $$('.graph-node[data-graph-card-id]', graph).forEach(node => {
      const open = () => { closeModal($('#graph-modal')); if (!$('#related-modal').hidden) closeModal($('#related-modal')); openDetail(node.dataset.graphCardId); };
      node.addEventListener('click', open);
      node.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); } });
    });
  }
  function syncMasteryOptions(value) {
    $$('[data-mastery-option]').forEach(button => {
      const selected = button.dataset.masteryOption === value;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }
  function openDetail(id) {
    const card = cards.find(item => item.id === id);
    if (!card) return;
    activeCardId = id;
    $('#detail-tag').textContent = card.tag || '未分类';
    syncMasteryOptions(card.mastery);
    $('#detail-title').textContent = card.front;
    const answer = $('#detail-answer');
    answer.innerHTML = renderMarkdownAnswer(card.back);
    renderAnswerMath(answer);
    ensureAnswerTools().then(() => {
      if (activeCardId !== id || $('#detail-modal').hidden) return;
      answer.innerHTML = renderMarkdownAnswer(card.back);
      renderAnswerMath(answer);
    }).catch(error => console.info(error.message));
    $('#flashcard-front-face').hidden = false;
    $('#flashcard-back-face').hidden = true;
    $('#detail-flashcard').dataset.face = 'front';
    renderConnections(card);
    openModal($('#detail-modal'));
  }
  function getCardNavigationList() {
    if (view === 'roam') return roamHistory.map(id => cards.find(card => card.id === id)).filter(Boolean);
    const visible = getVisibleCards();
    if (visible.some(card => card.id === activeCardId)) return visible;
    return [...cards].sort((a, b) => newestFirst ? b.updatedAt - a.updatedAt : a.front.localeCompare(b.front, 'zh-Hans'));
  }
  function openRandomCard() {
    if (!cards.length) { notify('还没有卡片可以漫游'); return; }
    const candidates = cards.filter(card => card.id !== activeCardId);
    if (!candidates.length && roamHistoryIndex >= 0) { notify('目前只有这一张卡片'); return; }
    const pool = candidates.length ? candidates : cards;
    const card = pool[Math.floor(Math.random() * pool.length)];
    roamHistory = roamHistory.slice(0, roamHistoryIndex + 1);
    roamHistory.push(card.id);
    roamHistoryIndex = roamHistory.length - 1;
    openDetail(card.id);
  }
  function showPreviousCard() {
    if (view === 'roam') {
      if (roamHistoryIndex <= 0) return;
      roamHistoryIndex -= 1;
      openDetail(roamHistory[roamHistoryIndex]);
      return;
    }
    const list = getCardNavigationList();
    const index = list.findIndex(card => card.id === activeCardId);
    if (index > 0) openDetail(list[index - 1].id);
  }
  function showNextCard() {
    if (view === 'roam') {
      if (roamHistoryIndex < roamHistory.length - 1) {
        roamHistoryIndex += 1;
        openDetail(roamHistory[roamHistoryIndex]);
        return;
      }
      openRandomCard();
      return;
    }
    const list = getCardNavigationList();
    const index = list.findIndex(card => card.id === activeCardId);
    if (index >= 0 && index < list.length - 1) openDetail(list[index + 1].id);
  }
  function startRoam() {
    searchQuery = '';
    $('#search-input').value = '';
    selectedTag = '';
    selectedMastery = 'all';
    roamHistory = [];
    roamHistoryIndex = -1;
    $$('.filter-tab').forEach(tab => tab.classList.toggle('selected', tab.dataset.mastery === 'all'));
    openView('roam');
    openRandomCard();
  }
  $('#roam-random-card').addEventListener('click', () => cards.length ? openRandomCard() : openEditor());
  let cardSwipeStart = null;
  $('#detail-flashcard').addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || event.target.closest('button,a,input,textarea,select,[contenteditable="true"]')) return;
    cardSwipeStart = { x: event.clientX, y: event.clientY };
  });
  $('#detail-flashcard').addEventListener('pointerup', event => {
    if (event.pointerType !== 'touch' || !cardSwipeStart) return;
    const deltaX = event.clientX - cardSwipeStart.x;
    const deltaY = event.clientY - cardSwipeStart.y;
    cardSwipeStart = null;
    if (Math.abs(deltaX) < 55 || Math.abs(deltaX) < Math.abs(deltaY) * 1.25) return;
    event.preventDefault();
    if (deltaX < 0) showNextCard();
    else showPreviousCard();
  });
  $('#detail-flashcard').addEventListener('pointercancel', () => { cardSwipeStart = null; });
  $('#flip-card').addEventListener('click', () => {
    $('#flashcard-front-face').hidden = true;
    $('#flashcard-back-face').hidden = false;
    $('#detail-flashcard').dataset.face = 'back';
    $('#flip-card-back').focus();
  });
  $('#flip-card-back').addEventListener('click', () => {
    $('#flashcard-back-face').hidden = true;
    $('#flashcard-front-face').hidden = false;
    $('#detail-flashcard').dataset.face = 'front';
    $('#flip-card').focus();
  });
  function openEditor(id = null) {
    editorCardId = id;
    const card = cards.find(item => item.id === id);
    $('#editor-title').textContent = card ? '编辑知识卡片' : '新建知识卡片';
    $('#front-input').value = card?.front || '';
    $('#back-input').value = card?.back || '';
    $('#tag-input').value = card?.tag || (id ? '' : selectedTag);
    $('#mastery-input').value = card?.mastery || 'fuzzy';
    $('#relation-search').value = '';
    $('#form-error').textContent = '';
    selectedLinks = new Set((card?.links || []).filter(link => link !== id));
    renderRelationPicker();
    editorInitialState = currentEditorState();
    openModal($('#editor-modal'));
    setTimeout(() => $('#front-input').focus(), 60);
  }
  function currentEditorState() {
    return JSON.stringify({
      front: $('#front-input').value,
      back: $('#back-input').value,
      tag: $('#tag-input').value,
      mastery: $('#mastery-input').value,
      links: [...selectedLinks].sort()
    });
  }
  function requestCloseModal(backdrop) {
    if (!backdrop || backdrop.hidden) return false;
    if (backdrop.id === 'editor-modal' && editorInitialState !== null && currentEditorState() !== editorInitialState) {
      if (!confirm('有尚未保存的更改。确定放弃并关闭吗？')) return false;
    }
    closeModal(backdrop);
    if (backdrop.id === 'editor-modal') {
      editorCardId = null;
      editorInitialState = null;
    }
    return true;
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
        const wasAlreadyLinked = (card.links || []).includes(other.id) && (other.links || []).includes(card.id);
        card.links = [...new Set([...(card.links || []), other.id])];
        other.links = [...new Set([...(other.links || []), card.id])];
        if (!wasAlreadyLinked) other.updatedAt = Date.now();
      } else if (wasLinked) {
        card.links = (card.links || []).filter(id => id !== other.id);
        const oldLength = (other.links || []).length;
        other.links = (other.links || []).filter(id => id !== card.id);
        if (other.links.length !== oldLength) other.updatedAt = Date.now();
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
  function insertAtSelection(textarea, before, after = before, placeholder = '文字') {
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end) || placeholder;
    const insertion = `${before}${selected}${after}`;
    textarea.setRangeText(insertion, start, end, 'select');
    textarea.focus();
    textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
  }
  async function readImageForCard(file) {
    if (!/^image\/(png|jpeg|webp|gif)$/i.test(file.type)) throw new Error('请使用 PNG、JPEG、WebP 或 GIF 图片。');
    if (file.type === 'image/gif') {
      if (file.size > 300 * 1024) throw new Error('GIF 文件较大，请压缩到 300 KB 以下再插入。');
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('无法读取图片文件。'));
        reader.readAsDataURL(file);
      });
    }
    const source = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('无法读取图片文件。'));
      reader.readAsDataURL(file);
    });
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('图片格式无法识别。'));
      element.src = source;
    });
    const scale = Math.min(1, 1200 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    const compact = canvas.toDataURL('image/webp', 0.78);
    if (compact.length > 700_000) throw new Error('压缩后的图片仍较大。请缩小图片后重试，以免占满本机存储。');
    return compact;
  }
  async function insertImageFile(file, textarea = $('#back-input'), start = textarea.selectionStart, end = textarea.selectionEnd) {
    const dataUrl = await readImageForCard(file);
    const safeName = (file.name || '截图').replace(/[\\()[\]]/g, '').trim() || '截图';
    textarea.setRangeText(`![${safeName}](${dataUrl})`, start, end, 'end');
    textarea.focus();
    notify('图片已插入，保存卡片后会保存在本机');
  }
  $$('[data-insert-format]').forEach(button => button.addEventListener('click', () => {
    const formats = {
      bold: ['**', '**', '加粗文字'],
      italic: ['*', '*', '斜体文字'],
      highlight: ['==', '==', '高亮文字'],
      'inline-math': ['$ ', ' $', 'x^2'],
      'display-math': ['$$\n', '\n$$', 'x^2'],
      code: ['`', '`', '代码'],
      'code-block': ['```\n', '\n```', '代码']
    };
    const [before, after, placeholder] = formats[button.dataset.insertFormat];
    insertAtSelection($('#back-input'), before, after, placeholder);
  }));
  $('#insert-image').addEventListener('click', () => $('#image-file').click());
  $('#image-file').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    const button = $('#insert-image');
    button.disabled = true;
    try {
      await insertImageFile(file);
    } catch (error) { notify(error.message || '无法插入这张图片'); }
    finally { button.disabled = false; event.target.value = ''; }
  });
  $('#back-input').addEventListener('paste', async event => {
    const imageItem = [...(event.clipboardData?.items || [])].find(item => item.kind === 'file' && item.type.startsWith('image/'));
    const file = imageItem?.getAsFile();
    if (!file) return;
    event.preventDefault();
    const textarea = event.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    try { await insertImageFile(file, textarea, start, end); }
    catch (error) { notify(error.message || '无法插入剪贴板中的图片'); }
  });
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
    editorInitialState = null;
  }
  function deleteCard(id) {
    const card = cards.find(item => item.id === id);
    if (!card) return;
    if (!confirm(`删除「${card.front}」？相关卡片之间的连接也会移除。`)) return;
    markCardDeleted(id);
    cards = cards.filter(item => item.id !== id);
    cards.forEach(item => {
      const previousLength = (item.links || []).length;
      item.links = (item.links || []).filter(linkId => linkId !== id);
      if (item.links.length !== previousLength) item.updatedAt = Date.now();
    });
    if (activeCardId === id) closeModal($('#detail-modal'));
    saveCards(); render(); notify('卡片已删除');
  }
  function exportData() {
    const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), cards, tags: customTags }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = 'cards.json'; link.click(); URL.revokeObjectURL(url);
    setStorageNote('已导出 cards.json · 可作为本机备份');
    notify('cards.json 已导出');
  }
  async function importData(file) {
    try {
      const dataset = normalizeCardDataset(JSON.parse(await file.text()));
      const incomingIds = new Set(dataset.cards.map(card => card.id));
      cards.filter(card => !incomingIds.has(card.id)).forEach(card => markCardDeleted(card.id));
      cards = dataset.cards;
      customTags = dataset.tags;
      saveCards(); saveTags(); render(); notify(`已导入 ${cards.length} 张卡片`);
      setStorageNote(currentUser ? '已导入本机 · 正在同步云端' : '已导入本机 · 登录后同步到云端');
    } catch (error) { notify('无法导入：请选一个知点 JSON 备份文件'); }
    $('#import-file').value = '';
  }

  $$('.nav-item').forEach(button => button.addEventListener('click', () => button.dataset.view === 'roam' ? startRoam() : openView(button.dataset.view)));
  $$('[data-open-stats]').forEach(button => button.addEventListener('click', () => openView('stats')));
  $$('[data-open-view]').forEach(button => button.addEventListener('click', () => openView(button.dataset.openView)));
  $$('[data-open-tags]').forEach(button => button.addEventListener('click', () => { openView('all'); $('#manage-tags').focus(); }));
  $('#search-input').addEventListener('input', event => { searchQuery = event.target.value; if (searchQuery.trim() && view === 'stats') view = 'all'; render(); });
  $$('.filter-tab').forEach(button => button.addEventListener('click', () => { selectedMastery = button.dataset.mastery; $$('.filter-tab').forEach(tab => tab.classList.toggle('selected', tab === button)); render(); }));
  $('#new-card').addEventListener('click', () => openEditor());
  $('#stats-new-card').addEventListener('click', () => openEditor());
  $('#empty-create').addEventListener('click', () => openEditor());
  $$('[data-card-action="edit"]').forEach(button => button.addEventListener('click', () => { const id = activeCardId; closeModal($('#detail-modal')); openEditor(id); }));
  $$('[data-context-action="edit"]').forEach(button => button.addEventListener('click', () => {
    const id = contextCardId;
    closeCardContextMenu();
    if (id) openEditor(id);
  }));
  $$('[data-context-action="delete"]').forEach(button => button.addEventListener('click', () => {
    const id = contextCardId;
    closeCardContextMenu();
    if (id) deleteCard(id);
  }));
  document.addEventListener('click', event => {
    if (!$('#card-context-menu').hidden && !event.target.closest('#card-context-menu,.card-more-button')) closeCardContextMenu();
  });
  $$('[data-mastery-option]').forEach(button => button.addEventListener('click', () => {
    const card = cards.find(item => item.id === activeCardId);
    if (!card || card.mastery === button.dataset.masteryOption) return;
    card.mastery = button.dataset.masteryOption; card.updatedAt = Date.now();
    saveCards(); syncMasteryOptions(card.mastery); render(); notify('掌握程度已更新');
  }));
  $$('[data-toggle-related]').forEach(button => button.addEventListener('click', () => {
    renderRelatedCards();
    closeModal($('#detail-modal'));
    openModal($('#related-modal'));
  }));
  $('#open-related-graph').addEventListener('click', () => {
    const card = cards.find(item => item.id === activeCardId);
    if (!card || !activeRelatedCards.length) return;
    renderLocalGraph(card, activeRelatedCards);
    openModal($('#graph-modal'));
    requestAnimationFrame(() => {
      const graph = $('#local-graph');
      graph.scrollLeft = Math.max(0, (graph.scrollWidth - graph.clientWidth) / 2);
    });
  });
  $('#card-form').addEventListener('submit', saveEditor);
  $('#relation-search').addEventListener('input', renderRelationPicker);
  $$('.close-modal,[data-close]').forEach(button => button.addEventListener('click', () => requestCloseModal(button.closest('.modal-backdrop'))));
  $$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', event => { if (event.target === backdrop) requestCloseModal(backdrop); }));
  $('#sort-button').addEventListener('click', () => { newestFirst = !newestFirst; $('#sort-button').innerHTML = `<span>☷</span> ${newestFirst ? '最近更新' : '按名称'} <span class="sort-chevron">⌄</span>`; renderCards(); });
  function openTagCreator() {
    $('#tag-name-input').value = '';
    $('#tag-form-error').textContent = '';
    openModal($('#tag-modal'));
    setTimeout(() => $('#tag-name-input').focus(), 60);
  }
  function saveTag(event) {
    event.preventDefault();
    const input = $('#tag-name-input').value.trim().replace(/^#/, '');
    if (!input) { $('#tag-form-error').textContent = '请输入标签名称。'; return; }
    const parts = input.split('/').map(part => part.trim());
    if (parts.some(part => !part)) { $('#tag-form-error').textContent = '标签路径中每一级都需要填写名称。'; return; }
    if (parts.some(part => part.includes(','))) { $('#tag-form-error').textContent = '标签名称不能包含逗号。'; return; }
    const tag = parts.join('/');
    if (tags().includes(tag)) { $('#tag-form-error').textContent = '这个标签已经存在。'; return; }
    customTags.push(tag);
    for (let index = 1; index < parts.length; index += 1) expandedTags.add(parts.slice(0, index).join('/'));
    saveTags();
    closeModal($('#tag-modal'));
    render();
    notify(`标签路径「${tag}」已创建`);
  }
  $('#manage-tags').addEventListener('click', openTagCreator);
  $('#add-tag').addEventListener('click', openTagCreator);
  $('#tag-form').addEventListener('submit', saveTag);
  $('#export-data').addEventListener('click', exportData);
  $('#import-data').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', event => { if (event.target.files?.[0]) importData(event.target.files[0]); });
  $('#mobile-menu').addEventListener('click', () => setSidebarOpen(!$('#sidebar').classList.contains('open')));
  $('#sidebar-close').addEventListener('click', () => setSidebarOpen(false));
  $('#sidebar-scrim').addEventListener('click', () => setSidebarOpen(false));
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && !event.altKey && !$('#editor-modal').hidden && event.target === $('#back-input')) {
      const key = event.key.toLowerCase();
      const shortcuts = {
        'b:false': ['**', '**', '加粗文字'],
        'i:false': ['*', '*', '斜体文字'],
        'h:true': ['==', '==', '高亮文字'],
        'm:true': ['$ ', ' $', 'x^2'],
        'd:true': ['$$\n', '\n$$', 'x^2'],
        'e:false': ['`', '`', '代码'],
        'e:true': ['```\n', '\n```', '代码']
      };
      const format = shortcuts[`${key}:${event.shiftKey}`];
      if (format) { event.preventDefault(); insertAtSelection($('#back-input'), ...format); return; }
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#search-input').focus(); }
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && !$('#editor-modal').hidden) $('#card-form').requestSubmit();
    const typingTarget = event.target.closest('input,textarea,select,[contenteditable="true"]');
    if (!typingTarget && !$('#detail-modal').hidden && $('#editor-modal').hidden && $('#related-modal').hidden && $('#graph-modal').hidden && !event.altKey && !event.ctrlKey && !event.metaKey) {
      if (event.key === 'ArrowLeft') { event.preventDefault(); showPreviousCard(); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); showNextCard(); }
    }
    if (event.key === 'Escape') {
      if (!$('#card-context-menu').hidden) closeCardContextMenu(true);
      else {
        const visibleModals = $$('.modal-backdrop').filter(modal => !modal.hidden);
        visibleModals.sort((a, b) => Number(getComputedStyle(a).zIndex) - Number(getComputedStyle(b).zIndex));
        if (visibleModals.length) requestCloseModal(visibleModals[visibleModals.length - 1]);
      }
      setSidebarOpen(false);
    }
  });
  render();
  initializeCloudAuth();
})();
