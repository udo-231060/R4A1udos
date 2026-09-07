const $ = (id) => document.getElementById(id);
const levels = [
  ['登録名', '設定した登録名を表示します。'],
  ['ニックネーム', '同じニックネームで会話できます。'],
  ['会話ごとの仮名', '会話ごとに別の仮名が付きます。'],
  ['投稿ごとの匿名', '投稿するたびに別の匿名名になります。'],
];
let profile = null, view = 'general', room = 'general', csrf = null, generation = 0, refreshing = false;
const drafts = new Map();
const messageCache = new Map();

function feedback(text, error = false) {
  $('feedback').textContent = text;
  $('feedback').className = error ? 'notice error' : 'notice';
  $('feedback').hidden = !text;
}
async function token() {
  const response = await fetch('/api/csrf', { cache: 'no-store' });
  if (!response.ok) throw new Error('接続できませんでした。再読み込みしてください。');
  csrf = await response.json();
}
async function api(path, { method = 'GET', body, json } = {}) {
  const headers = {};
  if (method !== 'GET') {
    if (!csrf) await token();
    headers[csrf.headerName] = csrf.token;
  }
  if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  const response = await fetch(path, { method, headers, body, cache: 'no-store' });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    if (response.status === 401 && path !== '/api/login') {
      profile = null; messageCache.clear(); drafts.clear(); display();
    }
    throw new Error(result.error && !result.status ? result.error :
      response.status === 401 ? 'ログインID・パスワードを確認してログインしてください。' :
      response.status === 403 ? '操作を許可できません。再読み込みしてログインし直してください。' :
      response.status === 413 ? '画像は8MB、動画は20MB以内です。' : '処理できませんでした。もう一度お試しください。');
  }
  return response.status === 204 ? null : response.json();
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
async function withForm(form, job) {
  if (form.dataset.busy) return;
  form.dataset.busy = 'true';
  const buttons = [...form.querySelectorAll('button')];
  buttons.forEach(b => { b.disabled = true; });
  try { await job(); } catch (e) { feedback(e.message, true); }
  finally { delete form.dataset.busy; buttons.forEach(b => { b.disabled = false; }); }
}
function display() {
  generation++;
  const authenticated = !!profile;
  $('auth').hidden = authenticated;
  $('logout').hidden = !authenticated;
  for (const name of ['chat','shorts','inbox','settings']) $(name + '-view').hidden = true;
  const names = { general: '# 全体チャット', dm: '個人チャット', shorts: 'ショート動画', inbox: '個人チャット', settings: 'プロフィール・匿名設定' };
  $('title').textContent = names[view];
  $('subtitle').textContent = view === 'dm' ? '参加者だけが閲覧できます' : '学校のみんなと話せる場所';
  document.querySelectorAll('.nav-item[data-view]').forEach(b => {
    b.classList.toggle('active', b.dataset.view === (view === 'dm' ? 'inbox' : view));
    if (b.classList.contains('active')) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  if (!authenticated) { $('messages').replaceChildren(); $('shorts').replaceChildren(); $('threads').replaceChildren(); return; }
  $('current-level').textContent = `Lv.${profile.level} · ${levels[profile.level][0]}`;
  if (view === 'general' || view === 'dm') {
    $('chat-view').hidden = false;
    $('welcome-title').textContent = view === 'dm' ? 'ふたりの会話' : 'ここから、会話がはじまる。';
    $('welcome-description').textContent = view === 'dm' ? 'この会話と添付ファイルは、参加者だけが閲覧できます。' : '授業のこと、放課後のこと。気軽に話してみよう。';
    $('messages').replaceChildren(element('p','読み込んでいます…','empty-chat'));
    $('message-body').value = drafts.get(room) || '';
  } else $(view + '-view').hidden = false;
  $('my-code').value = profile.code;
  if (view === 'settings') {
    $('registered').value = profile.registered;
    $('nickname').value = profile.nickname;
    document.querySelector(`input[name="level"][value="${profile.level}"]`).checked = true;
    preview();
  }
}
async function navigate(next, id = 'general') {
  if (view === 'general' || view === 'dm') drafts.set(room,$('message-body').value);
  view = next; room = id;
  $('attachment').value = '';
  feedback('');
  document.body.classList.remove('menu-open'); $('menu').setAttribute('aria-expanded','false');
  display();
  await refresh(true);
}
function postNode(m, short = false) {
  const article = element('article',undefined,short ? 'short-card' : `message-row ${m.mine ? 'mine' : ''}`);
  const bubble = element('div',undefined,'message-bubble');
  const meta = element('div',undefined,'message-meta');
  meta.append(element('strong',m.name), element('span',`Lv.${m.level} · ${new Date(m.created).toLocaleString('ja-JP')}`));
  bubble.append(meta);
  if (m.body) bubble.append(element('p',m.body,'message-text'));
  if (m.mediaUrl) {
    const media = element(m.mime.startsWith('video/') ? 'video' : 'img');
    media.src = m.mediaUrl;
    if (media.tagName === 'VIDEO') { media.controls = true; media.playsInline = true; media.preload = 'metadata'; media.setAttribute('aria-label',m.body || 'ショート動画'); }
    else { media.alt = m.body || '投稿された画像'; media.loading = 'lazy'; }
    bubble.append(media);
  }
  if (!m.mine) {
    const report = element('button','この投稿を通報','text-button');
    report.type = 'button';
    report.addEventListener('click',async () => {
      report.disabled = true;
      try { await api('/api/chat?action=report',{method:'POST',json:{id:m.id}}); feedback('通報を記録しました。研究試作では管理者への通知はまだ行われません。'); }
      catch(e) { feedback(e.message,true); }
      finally { report.disabled = false; }
    });
    bubble.append(report);
  }
  article.append(bubble); return article;
}
async function refresh(force = false) {
  if (!profile || view === 'settings' || (refreshing && !force)) return;
  const requestGeneration = generation, requestView = view, requestRoom = room;
  refreshing = true;
  try {
    const path = requestView === 'inbox' ? '/api/chat?action=threads' : requestView === 'shorts' ? '/api/chat?action=shorts' : `/api/chat?room=${encodeURIComponent(requestRoom)}`;
    const rows = await api(path);
    if (requestGeneration !== generation || !profile) return;
    const cacheKey = requestView + ':' + requestRoom, signature = JSON.stringify(rows);
    if (!force && messageCache.get(cacheKey) === signature) return;
    messageCache.set(cacheKey,signature);
    if (requestView === 'inbox') {
      $('threads').replaceChildren(...rows.map(t => {
        const b = element('button',t.title,'dm-row'); b.addEventListener('click',() => navigate('dm',t.id)); return b;
      }));
      if (!rows.length) $('threads').append(element('p','まだ個人チャットはありません。','subtle'));
    } else {
      const target = $(requestView === 'shorts' ? 'shorts' : 'messages');
      // Keep existing media nodes during polling so playback and focus survive new posts.
      const existing = new Map([...target.children].filter(n => n.dataset.id).map(n => [n.dataset.id,n]));
      const nodes = rows.map(m => { const node = existing.get(m.id) || postNode(m,requestView === 'shorts'); node.dataset.id = m.id; return node; });
      for (const node of [...target.children]) if (!nodes.includes(node)) node.remove();
      nodes.forEach((node,i) => { if (target.children[i] !== node) target.insertBefore(node,target.children[i] || null); });
      if (!rows.length) target.replaceChildren(element('p',requestView === 'shorts' ? 'まだ動画はありません。' : '最初のメッセージを待っています。','empty-chat'));
    }
  } catch (e) { if (requestGeneration === generation) feedback(e.message,true); }
  finally { refreshing = false; }
}
function preview() {
  const level = Number(document.querySelector('input[name="level"]:checked')?.value ?? 1);
  $('preview-name').textContent = [ $('registered').value || '登録名を入力してください', $('nickname').value || 'ニックネームを入力してください', 'メンバー・XXXXXXXX', '匿名・XXXXXXXX' ][level];
  $('registered').required = level === 0;
  document.querySelectorAll('.level-option').forEach(label => label.classList.toggle('selected',label.querySelector('input').checked));
}
levels.forEach(([title,description],i) => {
  const label = element('label',undefined,'level-option');
  const radio = element('input'); radio.type = 'radio'; radio.name = 'level'; radio.value = i;
  const words = element('span'); words.append(element('strong',title),element('small',description));
  label.append(radio,element('span',String(i),'level-number'),words); $('levels').append(label);
});
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click',() => navigate(b.dataset.view)));
$('menu').addEventListener('click',() => $('menu').setAttribute('aria-expanded',String(document.body.classList.toggle('menu-open'))));
$('profile-form').addEventListener('input',preview);
$('profile-form').addEventListener('submit',e => {
  e.preventDefault(); withForm(e.currentTarget,async () => {
    const input = {registered:$('registered').value,nickname:$('nickname').value,level:Number(document.querySelector('input[name="level"]:checked').value)};
    await api('/api/chat?action=profile',{method:'POST',json:input});
    profile = await api('/api/chat?action=profile'); $('current-level').textContent = `Lv.${profile.level} · ${levels[profile.level][0]}`;
    feedback('設定を保存しました。新しい投稿から反映されます。');
  });
});
$('auth-form').addEventListener('submit',e => {
  e.preventDefault(); const intent = e.submitter?.value || 'login';
  withForm(e.currentTarget,async () => {
    const username = $('username').value.trim(), password = $('password').value;
    $('username').value = username;
    if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username)) {
      $('username').focus();
      throw new Error('ログインIDは半角英数字・_・-の3〜32文字で入力してください。例：student01。日本語・メールアドレス・空白は使えません。');
    }
    if (!password) { $('password').focus(); throw new Error('パスワードを入力してください。'); }
    if (intent === 'register') {
      if (password.length < 12) { $('password').focus(); throw new Error('新規登録のパスワードは12文字以上にしてください（現在' + password.length + '文字）。'); }
      if (new TextEncoder().encode(password).length > 72) { $('password').focus(); throw new Error('パスワードが長すぎます。半角文字なら72文字以内、日本語なら24文字以内を目安にしてください。'); }
      await token();
      await api('/api/register',{method:'POST',json:{username,password}});
    }
    await api('/api/login',{method:'POST',body:new URLSearchParams({username,password})});
    $('password').value = ''; await token(); profile = await api('/api/chat?action=profile');
    feedback(''); display(); await refresh(true);
  });
});
$('logout').addEventListener('click',async () => {
  try { await api('/api/logout',{method:'POST'}); profile = null; csrf = null; drafts.clear(); messageCache.clear(); $('message-body').value = ''; $('attachment').value = ''; display(); await token(); feedback('ログアウトしました。'); }
  catch(e) { feedback(e.message,true); }
});
$('composer').addEventListener('submit',e => {
  e.preventDefault();
  withForm(e.currentTarget,async () => {
    const sentRoom = room, sentText = $('message-body').value, file = $('attachment').files[0];
    if (!sentText.trim() && !file) throw new Error('本文か添付ファイルを追加してください。');
    if (file && file.size > (file.type.startsWith('image/') ? 8 : 20)*1024*1024) throw new Error('画像は8MB、動画は20MB以内です。');
    const form = new FormData(); form.set('room',sentRoom); form.set('body',sentText); if (file) form.set('file',file);
    await api('/api/chat',{method:'POST',body:form});
    if (room === sentRoom) { if ($('message-body').value === sentText) $('message-body').value = ''; $('attachment').value = ''; }
    drafts.delete(sentRoom); feedback('送信しました。'); await refresh(true);
  });
});
$('clear-file').addEventListener('click',() => { $('attachment').value = ''; });
$('thread-form').addEventListener('submit',e => {
  e.preventDefault(); withForm(e.currentTarget,async () => { const result = await api('/api/chat?action=thread',{method:'POST',json:{code:$('contact-code').value}}); await navigate('dm',result.id); });
});
$('copy-code').addEventListener('click',async () => {
  try { await navigator.clipboard.writeText(profile.code); feedback('連絡コードをコピーしました。'); }
  catch { $('my-code').select(); feedback('連絡コードを選択しました。コピーしてください。'); }
});
if (navigator.modelContext?.registerTool) {
  navigator.modelContext.registerTool({name:'stage_anonymity_level',description:'匿名設定画面を開いてレベルを選択する。保存は利用者が行う。',inputSchema:{type:'object',properties:{level:{type:'integer',minimum:0,maximum:3}},required:['level'],additionalProperties:false},execute:async ({level}) => {
    if (!profile || !Number.isInteger(level) || level < 0 || level > 3) throw new Error('ログインと匿名レベルを確認してください。');
    await navigate('settings'); document.querySelector(`input[name="level"][value="${level}"]`).checked = true; preview();
    return {content:[{type:'text',text:'匿名レベルを選択しました。保存は利用者が設定を保存ボタンで確定します。'}]};
  }});
}
try {
  const mode = await api('/api/auth-mode');
  if (mode.github) {
    $('auth-form').hidden = true;
    $('auth').querySelector('.subtle').textContent = 'R4A1udosの所有者・参加済みの共同編集者だけが利用できます。';
    const login = element('a', 'GitHubでログイン', 'primary');
    login.href = '/oauth2/authorization/github';
    $('auth').append(login);
    if (new URLSearchParams(location.search).has('github'))
      feedback('GitHubの共同編集者であることを確認できませんでした。招待の承認とアプリへの許可を確認してください。', true);
  }
  await token(); profile = await api('/api/chat?action=profile'); display(); await refresh(true);
}
catch(e) { display(); if (!e.message.includes('ログイン')) feedback(e.message,true); }
setInterval(() => { if (!document.hidden) refresh(); },5000);
