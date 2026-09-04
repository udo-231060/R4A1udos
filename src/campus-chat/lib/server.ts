import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { canReadRoom } from './privacy';
export type Profile = {
  id: string;
  registered: string;
  nickname: string;
  level: number;
  code: string;
};
export function db() {
  return (env as unknown as { DB: D1Database }).DB;
}
export function files() {
  return (env as unknown as { FILES: R2Bucket }).FILES;
}
export class AppError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function identity() {
  const user = await getChatGPTUser();
  if (!user) throw new AppError('ログインすると利用できます。', 401);
  return user.userId;
}
export async function profile(id: string) {
  let p = await db()
    .prepare('SELECT * FROM profiles WHERE id=?')
    .bind(id)
    .first<Profile>();
  if (!p) {
    await db()
      .prepare('INSERT OR IGNORE INTO profiles(id,code) VALUES (?,?)')
      .bind(id, crypto.randomUUID().replaceAll('-', '').toUpperCase())
      .run();
    p = await db()
      .prepare('SELECT * FROM profiles WHERE id=?')
      .bind(id)
      .first<Profile>();
  }
  return p!;
}
export async function assertRoom(room: string, id: string) {
  if (!room || room.length > 64)
    throw new AppError('会話が見つかりません。', 404);
  const pair =
    room === 'general'
      ? null
      : await db()
          .prepare('SELECT a,b FROM conversations WHERE id=?')
          .bind(room)
          .first<{ a: string; b: string }>();
  if (!canReadRoom(room, id, pair))
    throw new AppError('この会話は閲覧できません。', 403);
}
export async function aliasFor(user: string, room: string) {
  await db()
    .prepare(
      'INSERT OR IGNORE INTO aliases(id,user,room,label) VALUES (?,?,?,?)',
    )
    .bind(
      crypto.randomUUID(),
      user,
      room,
      'メンバー・' + crypto.randomUUID().slice(0, 8).toUpperCase(),
    )
    .run();
  return (await db()
    .prepare('SELECT label FROM aliases WHERE user=? AND room=?')
    .bind(user, room)
    .first<{ label: string }>())!.label;
}
export function mutationOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (origin !== new URL(req.url).origin)
    throw new AppError('この操作はアプリの画面から行ってください。', 403);
}
export function json(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
