import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';
export const profiles = sqliteTable('profiles', {
  id: text('id').primaryKey(),
  registered: text('registered').notNull().default(''),
  nickname: text('nickname').notNull().default('キャンパスメンバー'),
  level: integer('level').notNull().default(1),
  code: text('code').notNull().unique(),
});
export const conversations = sqliteTable(
  'conversations',
  {
    id: text('id').primaryKey(),
    a: text('a').notNull(),
    b: text('b').notNull(),
    created: integer('created').notNull(),
  },
  (t) => [uniqueIndex('conversation_pair').on(t.a, t.b)],
);
export const aliases = sqliteTable(
  'aliases',
  {
    id: text('id').primaryKey(),
    user: text('user').notNull(),
    room: text('room').notNull(),
    label: text('label').notNull(),
  },
  (t) => [uniqueIndex('alias_user_room').on(t.user, t.room)],
);
export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    room: text('room').notNull(),
    author: text('author').notNull(),
    name: text('name').notNull(),
    level: integer('level').notNull(),
    body: text('body').notNull(),
    media: text('media'),
    mime: text('mime'),
    created: integer('created').notNull(),
  },
  (t) => [
    index('messages_room_time').on(t.room, t.created),
    index('messages_author_time').on(t.author, t.created),
  ],
);
export const reports = sqliteTable(
  'reports',
  {
    id: text('id').primaryKey(),
    message: text('message').notNull(),
    reporter: text('reporter').notNull(),
    created: integer('created').notNull(),
  },
  (t) => [uniqueIndex('report_once').on(t.message, t.reporter)],
);
