export const levels = [
  { title: '登録名', description: '設定した登録名を表示します。' },
  { title: 'ニックネーム', description: '同じニックネームで会話できます。' },
  { title: '会話ごとの仮名', description: '会話ごとに別の仮名が付きます。' },
  {
    title: '投稿ごとの匿名',
    description: '投稿するたびに別の匿名名になります。',
  },
];
export function validLevel(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 3
  );
}
export function visibleName(
  profile: { registered: string; nickname: string; level: number },
  alias: string,
  postId: string,
) {
  if (!validLevel(profile.level)) throw new Error('匿名レベルが不正です。');
  if (profile.level === 0) {
    if (!profile.registered.trim())
      throw new Error('レベル0では登録名を入力してください。');
    return profile.registered;
  }
  if (profile.level === 1) return profile.nickname;
  if (profile.level === 2) return alias;
  return '匿名・' + postId.replaceAll('-', '').slice(0, 8).toUpperCase();
}
export function publicMessage(row: Record<string, unknown>, viewer: string) {
  return {
    id: row.id,
    name: row.name,
    level: row.level,
    body: row.body,
    mime: row.mime,
    created: row.created,
    mine: row.author === viewer,
    mediaUrl: row.media
      ? '/api/chat?action=media&id=' + encodeURIComponent(String(row.id))
      : null,
  };
}
export function canReadRoom(
  room: string,
  viewer: string,
  pair: { a: string; b: string } | null,
) {
  return (
    room === 'general' || (!!pair && (pair.a === viewer || pair.b === viewer))
  );
}
