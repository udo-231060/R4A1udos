INSERT OR IGNORE INTO profiles(id,code) VALUES ('fixture-peer','ABCDEF0123456789ABCDEF0123456789');
INSERT OR IGNORE INTO conversations(id,a,b,created) VALUES ('fixture-private','fixture-other-a','fixture-other-b',1);
INSERT OR IGNORE INTO messages(id,room,author,name,level,body,media,mime,created) VALUES ('fixture-private-media','fixture-private','fixture-other-a','匿名',3,'','nonexistent-private-object','image/png',1);
