import {
  AppError,
  db,
  files,
  identity,
  profile,
  assertRoom,
  aliasFor,
  mutationOrigin,
  json,
} from '@/lib/server';
import { publicMessage, validLevel, visibleName } from '@/lib/privacy';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const user = await identity();
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    if (action === 'profile') {
      const p = await profile(user);
      return json({
        registered: p.registered,
        nickname: p.nickname,
        level: p.level,
        code: p.code,
      });
    }
    if (action === 'threads') {
      const r = await db()
        .prepare(
          'SELECT id,created FROM conversations WHERE a=? OR b=? ORDER BY created DESC',
        )
        .bind(user, user)
        .all();
      return json(
        r.results.map((r) => ({
          id: r.id,
          title: '個人チャット・' + String(r.id).slice(0, 6).toUpperCase(),
        })),
      );
    }
    if (action === 'media') {
      const row = await db()
        .prepare('SELECT * FROM messages WHERE id=?')
        .bind(url.searchParams.get('id') || '')
        .first();
      if (!row || !row.media)
        throw new AppError('ファイルが見つかりません。', 404);
      await assertRoom(String(row.room), user);
      const object = await files().get(String(row.media));
      if (!object) throw new AppError('ファイルが見つかりません。', 404);
      return new Response(object.body, {
        headers: {
          'Content-Type': String(row.mime),
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
          'Content-Disposition': 'inline',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        },
      });
    }
    const room =
      action === 'shorts'
        ? 'general'
        : url.searchParams.get('room') || 'general';
    await assertRoom(room, user);
    const r =
      action === 'shorts'
        ? await db()
            .prepare(
              "SELECT * FROM messages WHERE room='general' AND mime LIKE 'video/%' ORDER BY created DESC LIMIT 100",
            )
            .all()
        : await db()
            .prepare(
              'SELECT * FROM (SELECT * FROM messages WHERE room=? ORDER BY created DESC LIMIT 100) ORDER BY created ASC',
            )
            .bind(room)
            .all();
    return json(r.results.map((r) => publicMessage(r, user)));
  } catch (e) {
    return failure(e);
  }
}
export async function POST(req: Request) {
  try {
    mutationOrigin(req);
    const user = await identity();
    const p = await profile(user);
    const action = new URL(req.url).searchParams.get('action');
    if (action === 'profile') {
      const b = (await req.json()) as Record<string, unknown>;
      if (
        !validLevel(b.level) ||
        typeof b.registered !== 'string' ||
        typeof b.nickname !== 'string' ||
        b.registered.length > 40 ||
        b.nickname.trim().length < 1 ||
        b.nickname.length > 30
      )
        throw new AppError('名前と匿名レベルを確認してください。');
      if (b.level === 0 && !b.registered.trim())
        throw new AppError('レベル0では登録名を入力してください。');
      await db()
        .prepare(
          'UPDATE profiles SET registered=?,nickname=?,level=? WHERE id=?',
        )
        .bind(b.registered.trim(), b.nickname.trim(), b.level, user)
        .run();
      return json({ ok: true });
    }
    if (action === 'thread') {
      const body = (await req.json()) as { code?: unknown };
      if (
        typeof body.code !== 'string' ||
        !/^([A-F0-9]{32})$/.test(body.code.trim().toUpperCase())
      )
        throw new AppError('相手の連絡コードを確認してください。');
      const peer = await db()
        .prepare('SELECT id FROM profiles WHERE code=?')
        .bind(body.code.trim().toUpperCase())
        .first<{ id: string }>();
      if (!peer || peer.id === user)
        throw new AppError('相手が見つからないか、自分のコードです。');
      const [a, b] = [user, peer.id].sort();
      await db()
        .prepare(
          'INSERT OR IGNORE INTO conversations(id,a,b,created) VALUES (?,?,?,?)',
        )
        .bind(crypto.randomUUID(), a, b, Date.now())
        .run();
      const row = await db()
        .prepare('SELECT id FROM conversations WHERE a=? AND b=?')
        .bind(a, b)
        .first();
      return json(row);
    }
    if (action === 'report') {
      const body = (await req.json()) as { id?: unknown };
      if (typeof body.id !== 'string')
        throw new AppError('投稿を選んでください。');
      const row = await db()
        .prepare('SELECT room FROM messages WHERE id=?')
        .bind(body.id)
        .first<{ room: string }>();
      if (!row) throw new AppError('投稿が見つかりません。', 404);
      await assertRoom(row.room, user);
      await db()
        .prepare(
          'INSERT OR IGNORE INTO reports(id,message,reporter,created) VALUES (?,?,?,?)',
        )
        .bind(crypto.randomUUID(), body.id, user, Date.now())
        .run();
      return json({ ok: true });
    }
    const length = Number(req.headers.get('content-length') || '0');
    if (length > 21 * 1024 * 1024)
      throw new AppError('添付は20MB以内にしてください。', 413);
    const reader = req.body?.getReader();
    const parts: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        total += chunk.value.byteLength;
        if (total > 21 * 1024 * 1024) {
          await reader.cancel();
          throw new AppError('添付は20MB以内にしてください。', 413);
        }
        parts.push(chunk.value);
      }
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    const form = await new Response(bytes, {
      headers: { 'Content-Type': req.headers.get('content-type') || '' },
    }).formData();
    const room = String(form.get('room') || 'general');
    await assertRoom(room, user);
    const body = String(form.get('body') || '').trim();
    const file = form.get('file');
    if (body.length > 2000)
      throw new AppError('メッセージは2000文字以内です。');
    if (!body && !(file instanceof File && file.size > 0))
      throw new AppError('本文か添付ファイルを追加してください。');
    const recent = await db()
      .prepare(
        'SELECT COUNT(*) AS n FROM messages WHERE author=? AND created>?',
      )
      .bind(user, Date.now() - 60000)
      .first<{ n: number }>();
    if ((recent?.n || 0) >= 20)
      throw new AppError('少し時間をおいて送信してください。', 429);
    const id = crypto.randomUUID();
    const name = visibleName(p, await aliasFor(user, room), id);
    let media: string | null = null;
    let mime: string | null = null;
    if (file instanceof File && file.size > 0) {
      const allowed = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'video/mp4',
        'video/webm',
      ];
      if (!allowed.includes(file.type))
        throw new AppError(
          'JPEG・PNG・WebP画像、MP4・WebM動画を選んでください。',
        );
      const max = file.type.startsWith('image/') ? 8 : 20;
      if (file.size > max * 1024 * 1024)
        throw new AppError('画像は8MB、動画は20MB以内です。');
      const h = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const s = (a: number, b: number) => String.fromCharCode(...h.slice(a, b));
      const valid =
        file.type === 'image/jpeg'
          ? h[0] === 255 && h[1] === 216 && h[2] === 255
          : file.type === 'image/png'
            ? h[0] === 137 && s(1, 4) === 'PNG'
            : file.type === 'image/webp'
              ? s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP'
              : file.type === 'video/mp4'
                ? s(4, 8) === 'ftyp'
                : h[0] === 26 && h[1] === 69 && h[2] === 223 && h[3] === 163;
      if (!valid) throw new AppError('ファイル形式を確認できませんでした。');
      media = 'uploads/' + crypto.randomUUID();
      mime = file.type;
      await files().put(media, file.stream(), {
        httpMetadata: { contentType: mime },
      });
    }
    try {
      await db()
        .prepare(
          'INSERT INTO messages(id,room,author,name,level,body,media,mime,created) VALUES (?,?,?,?,?,?,?,?,?)',
        )
        .bind(id, room, user, name, p.level, body, media, mime, Date.now())
        .run();
    } catch (e) {
      if (media) await files().delete(media);
      throw e;
    }
    return json({ id }, 201);
  } catch (e) {
    return failure(e);
  }
}
function failure(e: unknown) {
  if (e instanceof AppError) return json({ error: e.message }, e.status);
  console.error('Chat request failed', e instanceof Error ? e.name : 'unknown');
  return json(
    { error: '処理できませんでした。少し時間をおいて再試行してください。' },
    500,
  );
}
