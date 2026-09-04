'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Sidebar,
  SidebarProvider,
  SidebarContent,
  SidebarHeader,
  SidebarFooter,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  MessageCircle,
  Hash,
  Film,
  Settings,
  Send,
  Paperclip,
  ShieldCheck,
  X,
  Copy,
  ArrowLeft,
} from 'lucide-react';
import { levels, validLevel } from '@/lib/privacy';
type Profile = {
  registered: string;
  nickname: string;
  level: number;
  code: string;
};
type Message = {
  id: string;
  name: string;
  level: number;
  body: string;
  mime: string | null;
  created: number;
  mine: boolean;
  mediaUrl: string | null;
};
type Thread = { id: string; title: string };
async function api<T = unknown>(action: string, body?: unknown): Promise<T> {
  const r = await fetch('/api/chat?' + action, {
    method: body ? 'POST' : 'GET',
    headers:
      body && !(body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : undefined,
    body:
      body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const data = (await r.json()) as T & { error?: string };
  if (!r.ok)
    throw new Error(
      r.status === 401
        ? 'ログインが必要です。'
        : data.error || '接続できませんでした。',
    );
  return data;
}
export default function CampusChat() {
  const [view, setView] = useState('general'),
    [room, setRoom] = useState('general'),
    [messages, setMessages] = useState<Message[]>([]),
    [threads, setThreads] = useState<Thread[]>([]),
    [profile, setProfile] = useState<Profile | null>(null),
    [draftProfile, setDraftProfile] = useState<Profile>({
      registered: '',
      nickname: 'キャンパスメンバー',
      level: 1,
      code: '',
    }),
    [text, setText] = useState(''),
    [file, setFile] = useState<File | null>(null),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [status, setStatus] = useState('');
  const upload = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let alive = true;
    api<Profile>('action=profile')
      .then((p) => {
        if (alive) {
          setProfile(p);
          setDraftProfile(p);
        }
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    setError('');
    setStatus('');
    setFile(null);
    setText('');
    if (view === 'settings') return;
    let alive = true;
    let inFlight = false;
    setMessages([]);
    setLoading(true);
    async function refresh() {
      if (inFlight) return;
      inFlight = true;
      try {
        if (view === 'inbox') {
          const t = await api<Thread[]>('action=threads');
          if (alive) setThreads(t);
        } else {
          const m = await api<Message[]>(
            view === 'shorts'
              ? 'action=shorts'
              : 'room=' + encodeURIComponent(room),
          );
          if (alive) setMessages(m);
        }
        if (alive) setError('');
      } catch (e) {
        if (alive) setError((e as Error).message);
      } finally {
        inFlight = false;
        if (alive) setLoading(false);
      }
    }
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [view, room]);
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context) return;
    const lifetime = new AbortController();
    try {
      Promise.resolve(
        context.registerTool(
          {
            name: 'stage_anonymity_level',
            description:
              '匿名設定画面を開いてレベルを選択する。保存はせず、利用者が保存ボタンで確定する。',
            inputSchema: {
              type: 'object',
              properties: {
                level: { type: 'integer', minimum: 0, maximum: 3 },
              },
              required: ['level'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false },
            execute: (input: unknown) => {
              const level = (input as { level?: unknown })?.level;
              if (!validLevel(level))
                throw new Error('0〜3を指定してください。');
              setView('settings');
              setDraftProfile((p) => ({ ...p, level }));
              return { staged: true, level, saved: false };
            },
          },
          { signal: lifetime.signal },
        ),
      ).catch(() => {});
    } catch {}
    return () => lifetime.abort();
  }, []);
  function navigate(next: string) {
    setView(next);
    if (next === 'general' || next === 'shorts') setRoom('general');
    setError('');
    setStatus('');
  }
  async function send() {
    if (busy || !profile) return;
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.set('room', room);
      form.set('body', text);
      if (file) form.set('file', file);
      await api('action=send', form);
      setText('');
      setFile(null);
      if (upload.current) upload.current.value = '';
      setMessages(await api<Message[]>('room=' + encodeURIComponent(room)));
      setStatus('送信しました。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await api('action=profile', draftProfile);
      setProfile({ ...draftProfile });
      setStatus('保存しました。次の投稿から反映されます。');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function startThread() {
    setBusy(true);
    setError('');
    try {
      const t = await api<{ id: string }>('action=thread', { code });
      setRoom(t.id);
      setView('dm');
      setCode('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function report(id: string) {
    setError('');
    try {
      await api('action=report', { id });
      setStatus(
        '通報を記録しました。試作版では管理担当への通知はまだ行われません。',
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function copyCode() {
    try {
      await navigator.clipboard.writeText(profile?.code || '');
      setStatus('連絡コードをコピーしました。');
    } catch {
      setStatus(
        'コピーできませんでした。表示されたコードを選択してコピーしてください。',
      );
    }
  }
  const title =
    view === 'settings'
      ? 'プロフィール・匿名設定'
      : view === 'inbox'
        ? '個人チャット'
        : view === 'dm'
          ? '個人チャット・' + room.slice(0, 6).toUpperCase()
          : view === 'shorts'
            ? 'ショート動画'
            : '# 全体チャット';
  const nav = (id: string, label: string, icon: React.ReactNode) => (
    <button
      className={'nav-item ' + (view === id ? 'active' : '')}
      onClick={() => navigate(id)}
    >
      {icon}
      {label}
    </button>
  );
  const preview =
    draftProfile.level === 0
      ? draftProfile.registered || '登録名を入力してください'
      : draftProfile.level === 1
        ? draftProfile.nickname
        : draftProfile.level === 2
          ? 'メンバー・A1B2C3D4'
          : '匿名・投稿ごとに変わります';
  const feedback = (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
          {error === 'ログインが必要です。' && (
            <>
              {' '}
              <a href="/signin-with-chatgpt?return_to=%2F" target="_top">
                ログインする
              </a>
            </>
          )}
        </p>
      )}
      <p className="status-line" role="status">
        {status}
      </p>
    </>
  );
  const renderMessage = (m: Message) => (
    <article className="message" key={m.id}>
      <span className="avatar" aria-hidden="true">
        {m.level >= 2 ? '?' : m.name.slice(0, 1)}
      </span>
      <div className="message-content">
        <div className="message-meta">
          <strong>{m.name}</strong>
          {m.mine && <small>自分</small>}
          <small>Lv.{m.level}</small>
          <time dateTime={new Date(m.created).toISOString()}>
            {new Date(m.created).toLocaleString('ja-JP', {
              month: 'numeric',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </div>
        <p className="message-text">{m.body}</p>
        {m.mediaUrl &&
          (m.mime?.startsWith('video/') ? (
            <video
              className="message-media"
              controls
              preload="metadata"
              playsInline
              src={m.mediaUrl}
              aria-label={m.body || '投稿された動画'}
            />
          ) : (
            <img
              className="message-media"
              loading="lazy"
              src={m.mediaUrl}
              alt={m.body || '添付画像'}
            />
          ))}
        {!m.mine && (
          <div className="message-actions">
            <button className="text-button" onClick={() => report(m.id)}>
              この投稿を通報
            </button>
          </div>
        )}
      </div>
    </article>
  );
  return (
    <SidebarProvider>
      <Sidebar>
        <SidebarHeader>
          <div className="brand">
            <span>C</span>
            <div>
              Campus Chat<small>R4A1udos / 卒業研究</small>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <div className="nav-label">キャンパス</div>
          {nav('general', '全体チャット', <Hash size={20} />)}
          {nav('shorts', 'ショート動画', <Film size={20} />)}
          <div className="nav-label">メッセージ</div>
          {nav('inbox', '個人チャット', <MessageCircle size={20} />)}
        </SidebarContent>
        <SidebarFooter>
          {nav('settings', 'プロフィール・匿名設定', <Settings size={20} />)}
          <div className="sidebar-note">自分らしい距離感で、つながろう。</div>
        </SidebarFooter>
      </Sidebar>
      <main className="workspace">
        <header className="topbar">
          <SidebarTrigger />
          <div>
            <h1>{title}</h1>
            <p>
              {view === 'dm'
                ? '参加者だけが閲覧できます'
                : view === 'settings'
                  ? '名前の見せ方を、自分で選ぶ'
                  : '学校のみんなと話せる場所'}
            </p>
          </div>
          <span className="pill">研究試作</span>
        </header>
        {view === 'settings' ? (
          <section className="settings-view">
            <h2>会話するときの、あなたの名前。</h2>
            <p className="subtle">
              表示名と匿名レベルは、新しい投稿から反映されます。
            </p>
            <div className="card">
              <label className="field-label" htmlFor="registered">
                登録名（レベル0で公開）
              </label>
              <input
                id="registered"
                className="text-input"
                value={draftProfile.registered}
                maxLength={40}
                placeholder="例：山田 太郎"
                onChange={(e) =>
                  setDraftProfile({
                    ...draftProfile,
                    registered: e.target.value,
                  })
                }
              />
              <label className="field-label" htmlFor="nickname">
                ニックネーム（レベル1で公開）
              </label>
              <input
                id="nickname"
                className="text-input"
                value={draftProfile.nickname}
                maxLength={30}
                onChange={(e) =>
                  setDraftProfile({ ...draftProfile, nickname: e.target.value })
                }
              />
              <h3 className="field-label">匿名レベル</h3>
              <RadioGroup
                value={draftProfile.level}
                onValueChange={(v) => {
                  if (validLevel(v))
                    setDraftProfile({ ...draftProfile, level: v });
                }}
                aria-label="匿名レベル"
              >
                {levels.map((l, i) => (
                  <label
                    key={i}
                    className={
                      'level-option ' +
                      (draftProfile.level === i ? 'selected' : '')
                    }
                  >
                    <RadioGroupItem value={i} />
                    <span className="level-number">{i}</span>
                    <span>
                      <strong>{l.title}</strong>
                      <small>{l.description}</small>
                    </span>
                  </label>
                ))}
              </RadioGroup>
              <div className="preview-name">
                <small>次の投稿の表示イメージ</small>
                <p>
                  <strong>{preview}</strong>
                </p>
              </div>
              <p className="subtle">
                個人チャットでは、匿名でも同じ会話相手だと分かります。本文や画像・動画に含まれる情報は匿名化されません。運営側には投稿とアカウントの対応が保存されます。
              </p>
              <div className="save-row">
                <button
                  className="primary"
                  disabled={busy || !profile}
                  onClick={save}
                >
                  {busy ? '保存中…' : '設定を保存'}
                </button>
              </div>
              {feedback}
            </div>
          </section>
        ) : view === 'inbox' ? (
          <section className="settings-view">
            <h2>個人チャットをはじめる</h2>
            <p className="subtle">
              相手から連絡コードを教えてもらって、会話を始めましょう。
            </p>
            <div className="card">
              <label htmlFor="contact-code" className="field-label">
                相手の連絡コード
              </label>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void startThread();
                }}
              >
                <input
                  id="contact-code"
                  className="text-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="32文字の連絡コード"
                  maxLength={32}
                />
                <button
                  className="primary"
                  disabled={!code.trim() || busy || !profile}
                >
                  会話をはじめる
                </button>
              </form>
              <label htmlFor="my-code" className="field-label">
                自分の連絡コード
              </label>
              <div className="inline-form">
                <input
                  id="my-code"
                  className="text-input"
                  readOnly
                  value={profile?.code || ''}
                />
                <button
                  className="icon-button"
                  disabled={!profile}
                  onClick={copyCode}
                  aria-label="連絡コードをコピー"
                >
                  <Copy size={20} />
                </button>
              </div>
              <p className="subtle">
                コードは会話したい相手だけに教えてください。
              </p>
            </div>
            {feedback}
            <div className="dm-list">
              {loading ? (
                <p>会話を読み込んでいます…</p>
              ) : threads.length ? (
                threads.map((t) => (
                  <button
                    key={t.id}
                    className="dm-row"
                    onClick={() => {
                      setRoom(t.id);
                      setView('dm');
                    }}
                  >
                    <MessageCircle size={18} />
                    {t.title}
                  </button>
                ))
              ) : (
                <p className="subtle">まだ個人チャットはありません。</p>
              )}
            </div>
          </section>
        ) : view === 'shorts' ? (
          <section>
            <div className="conversation">
              <div className="welcome">
                <span className="eyebrow">CAMPUS SHORTS</span>
                <h2>キャンパスの一瞬を、シェア。</h2>
                <p>全体チャットに投稿された動画がここに並びます。</p>
                <button className="primary" onClick={() => navigate('general')}>
                  <Paperclip size={18} />
                  全体チャットで動画を投稿
                </button>
              </div>
              {feedback}
            </div>
            {loading ? (
              <div className="empty-chat">動画を読み込んでいます…</div>
            ) : messages.length ? (
              <div className="shorts-grid">
                {messages.map((m) => (
                  <article className="short-card" key={m.id}>
                    <video
                      controls
                      playsInline
                      preload="metadata"
                      src={m.mediaUrl || undefined}
                      aria-label={m.body || 'ショート動画'}
                    />
                    <strong>{m.name}</strong>
                    <p>{m.body}</p>
                    {!m.mine && (
                      <button
                        className="text-button"
                        onClick={() => report(m.id)}
                      >
                        この投稿を通報
                      </button>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="empty-chat">
                <Film size={36} />
                <h3>まだ動画はありません</h3>
                <p>最初の動画を全体チャットに投稿してみよう。</p>
              </div>
            )}
          </section>
        ) : (
          <div className="workspace-body">
            <section className="conversation">
              {view === 'dm' ? (
                <div className="welcome">
                  <button
                    className="text-button"
                    onClick={() => navigate('inbox')}
                  >
                    <ArrowLeft size={18} />
                    会話一覧に戻る
                  </button>
                  <h2>ふたりの会話</h2>
                  <p>この会話と添付ファイルは、参加者だけが閲覧できます。</p>
                </div>
              ) : (
                <div className="welcome">
                  <span className="eyebrow">CAMPUS LOUNGE</span>
                  <h2>ここから、会話がはじまる。</h2>
                  <p>授業のこと、放課後のこと。気軽に話してみよう。</p>
                </div>
              )}
              {loading ? (
                <div className="empty-chat">メッセージを読み込んでいます…</div>
              ) : messages.length ? (
                <div className="message-list">
                  {messages.map(renderMessage)}
                </div>
              ) : (
                <div className="empty-chat">
                  <MessageCircle size={36} />
                  <h3>最初のメッセージを待っています</h3>
                  <p>画像やショート動画も一緒に投稿できます。</p>
                </div>
              )}
              {feedback}
              <form
                className="composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <textarea
                  aria-label="メッセージ"
                  placeholder={
                    view === 'dm'
                      ? '相手にメッセージを書く…'
                      : 'みんなにメッセージを書く…'
                  }
                  value={text}
                  maxLength={2000}
                  onChange={(e) => setText(e.target.value)}
                  disabled={busy}
                />
                {file && (
                  <div className="file-caption">
                    {file.name}
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => {
                        setFile(null);
                        if (upload.current) upload.current.value = '';
                      }}
                      aria-label="添付を取り消す"
                    >
                      <X size={18} />
                    </button>
                  </div>
                )}
                <input
                  ref={upload}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                  hidden
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    const max = f.type.startsWith('image/') ? 8 : 20;
                    if (f.size > max * 1024 * 1024) {
                      setError('画像は8MB、動画は20MB以内にしてください。');
                      e.target.value = '';
                      return;
                    }
                    setFile(f);
                    setError('');
                  }}
                />
                <div className="composer-bottom">
                  <button
                    type="button"
                    className="icon-button"
                    onClick={() => upload.current?.click()}
                    disabled={busy || !profile}
                    aria-label="画像・動画を添付"
                  >
                    <Paperclip size={20} />
                  </button>
                  <span>
                    Lv.{profile?.level ?? 1} ·{' '}
                    {levels[profile?.level ?? 1].title}
                  </span>
                  <button
                    className="primary"
                    type="submit"
                    disabled={busy || !profile || (!text.trim() && !file)}
                  >
                    <Send size={18} />
                    {busy ? '送信中…' : '送信'}
                  </button>
                </div>
                <p className="subtle" style={{ fontSize: 12, marginTop: 12 }}>
                  画像8MB・動画20MBまで / 最新100件を5秒ごとに更新
                </p>
              </form>
            </section>
            <aside className="context">
              <ShieldCheck size={28} />
              <h2>名前の見せ方は、あなたが選ぶ。</h2>
              <p>設定から匿名レベルを0〜3で選べます。</p>
              <div className="level-list">
                {levels.map((l, i) => (
                  <p key={i}>
                    <b>{i}</b>
                    {l.title}
                  </p>
                ))}
              </div>
              <button className="primary" onClick={() => navigate('settings')}>
                匿名設定を開く
              </button>
              <p style={{ marginTop: 28 }}>
                研究試作版です。学校の在籍確認は導入前に追加します。
              </p>
            </aside>
          </div>
        )}
      </main>
    </SidebarProvider>
  );
}
