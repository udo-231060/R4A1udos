package jp.ac.campus;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import static jp.ac.campus.ApiErrors.Problem;

@Service
public class ChatService {
    private final JdbcTemplate db;
    public ChatService(JdbcTemplate db) { this.db = db; }
    public record Profile(String registered, String nickname, int level, String code) {}
    public record Message(String id, String name, int level, String body, String mime, long created, boolean mine, String mediaUrl) {}
    public record ThreadView(String id, String title) {}
    public record Media(byte[] bytes, String mime) {}

    public Profile profile(String user) {
        return db.queryForObject("SELECT registered,nickname,anonymity,code FROM accounts WHERE id=?",
            (r,n) -> new Profile(r.getString(1),r.getString(2),r.getInt(3),r.getString(4)), user);
    }
    public void saveProfile(String user, String registered, String nickname, Integer level) {
        if (level == null || level < 0 || level > 3 || registered == null || nickname == null ||
            registered.length() > 40 || nickname.length() > 30 || nickname.isBlank() || (level == 0 && registered.isBlank()))
            throw new Problem(400, "名前と匿名レベルを確認してください。レベル0には登録名が必要です。");
        db.update("UPDATE accounts SET registered=?,nickname=?,anonymity=? WHERE id=?", registered.strip(), nickname.strip(), level, user);
    }
    public void assertRoom(String room, String user) {
        if ("general".equals(room)) return;
        if (room == null || room.length() > 36 || db.queryForObject(
            "SELECT COUNT(*) FROM conversations WHERE id=? AND (a=? OR b=?)", Integer.class, room, user, user) != 1)
            throw new Problem(403, "この会話は閲覧できません。");
    }
    public List<ThreadView> threads(String user) {
        return db.query("SELECT id FROM conversations WHERE a=? OR b=? ORDER BY created DESC",
            (r,n) -> new ThreadView(r.getString(1), "個人チャット・" + r.getString(1).substring(0,6).toUpperCase()), user, user);
    }
    @Transactional
    public String thread(String user, String code) {
        if (code == null || !code.strip().matches("(?i)[a-f0-9]{32}")) throw new Problem(400, "32文字の連絡コードを入力してください。");
        List<String> peers = db.query("SELECT id FROM accounts WHERE code=?", (r,n) -> r.getString(1), code.strip().toUpperCase());
        if (peers.isEmpty() || peers.getFirst().equals(user)) throw new Problem(400, "相手が見つからないか、自分のコードです。");
        String peer = peers.getFirst(), a = user.compareTo(peer) < 0 ? user : peer, b = a.equals(user) ? peer : user;
        // Consistent lock order prevents simultaneous A→B and B→A requests creating duplicate rooms.
        lockAccount(a);
        lockAccount(b);
        List<String> found = db.query("SELECT id FROM conversations WHERE a=? AND b=?", (r,n) -> r.getString(1), a, b);
        if (!found.isEmpty()) return found.getFirst();
        String id = UUID.randomUUID().toString();
        db.update("INSERT INTO conversations(id,a,b,created) VALUES (?,?,?,?)", id, a, b, System.currentTimeMillis());
        return id;
    }
    public List<Message> messages(String user, String room, boolean shorts) {
        if (shorts) room = "general";
        assertRoom(room,user);
        String sql = "SELECT id,display_name,anonymity,body,mime,created,author FROM messages WHERE room=?" +
            (shorts ? " AND mime LIKE 'video/%'" : "") + " ORDER BY created DESC,id DESC LIMIT 100";
        List<Message> found = db.query(sql, (r,n) -> new Message(r.getString("id"),r.getString("display_name"),r.getInt("anonymity"),
            r.getString("body"),r.getString("mime"),r.getLong("created"),user.equals(r.getString("author")),
            r.getString("mime") == null ? null : "/api/chat?action=media&id=" + r.getString("id")), room);
        if (!shorts) Collections.reverse(found);
        return found;
    }
    public Media media(String user, String id) {
        List<String> rooms = db.query("SELECT room FROM messages WHERE id=? AND mime IS NOT NULL", (r,n) -> r.getString(1), id);
        if (rooms.isEmpty()) throw new Problem(404, "ファイルが見つかりません。");
        assertRoom(rooms.getFirst(), user);
        return db.queryForObject("SELECT media,mime FROM messages WHERE id=?", (r,n) -> new Media(r.getBytes(1),r.getString(2)), id);
    }
    @Transactional
    public void report(String user, String id) {
        List<String> rooms = db.query("SELECT room FROM messages WHERE id=?", (r,n) -> r.getString(1), id);
        if (rooms.isEmpty()) throw new Problem(404, "投稿が見つかりません。");
        assertRoom(rooms.getFirst(),user);
        try {
            db.update("INSERT INTO reports(message_id,reporter,created) VALUES (?,?,?)", id,user,System.currentTimeMillis());
        } catch (org.springframework.dao.DuplicateKeyException ignored) {
            // Reporting the same message twice is intentionally idempotent.
        }
    }
    @Transactional
    public String send(String user, String room, String text, MultipartFile file) throws IOException {
        assertRoom(room,user);
        String body = text == null ? "" : text.strip();
        boolean attached = file != null && !file.isEmpty();
        if (body.length() > 2000 || (body.isEmpty() && !attached)) throw new Problem(400, "本文（2000文字以内）か添付ファイルを追加してください。");
        byte[] bytes = null;
        String mime = null;
        if (attached) {
            mime = file.getContentType();
            if (mime == null || !Set.of("image/jpeg","image/png","image/webp","video/mp4","video/webm").contains(mime))
                throw new Problem(400, "JPEG・PNG・WebP画像、MP4・WebM動画を選んでください。");
            int max = mime.startsWith("image/") ? 8 : 20;
            if (file.getSize() > max * 1024L * 1024L) throw new Problem(413, "画像は8MB、動画は20MB以内です。");
            bytes = file.getBytes();
            if (!validMedia(bytes,mime)) throw new Problem(400, "ファイル形式を確認できませんでした。");
        }
        lockAccount(user);
        long now = System.currentTimeMillis();
        if (db.queryForObject("SELECT COUNT(*) FROM messages WHERE author=? AND created>?", Integer.class,user,now-60000) >= 20)
            throw new Problem(429, "少し時間をおいて送信してください。");
        Profile profile = profile(user);
        String id = UUID.randomUUID().toString();
        String alias = "";
        if (profile.level() == 2) {
            List<String> aliases = db.query("SELECT label FROM aliases WHERE account_id=? AND room=?", (r,n) -> r.getString(1),user,room);
            if (aliases.isEmpty()) {
                alias = "メンバー・" + randomLabel();
                db.update("INSERT INTO aliases(account_id,room,label) VALUES (?,?,?)",user,room,alias);
            } else alias = aliases.getFirst();
        }
        String name = visibleName(profile,alias);
        db.update("INSERT INTO messages(id,room,author,display_name,anonymity,body,mime,media,created) VALUES (?,?,?,?,?,?,?,?,?)",
            id,room,user,name,profile.level(),body,mime,bytes,now);
        return id;
    }
    private void lockAccount(String user) {
        db.queryForObject("SELECT id FROM accounts WHERE id=? FOR UPDATE", String.class,user);
    }
    static String visibleName(Profile p, String alias) {
        return switch(p.level()) {
            case 0 -> { if (p.registered().isBlank()) throw new Problem(400,"登録名を入力してください。"); yield p.registered(); }
            case 1 -> p.nickname();
            case 2 -> alias;
            case 3 -> "匿名・" + randomLabel();
            default -> throw new Problem(400,"匿名レベルが不正です。");
        };
    }
    private static String randomLabel() { return UUID.randomUUID().toString().substring(0,8).toUpperCase(); }
    static boolean validMedia(byte[] h, String mime) {
        if (h.length < 12) return false;
        return switch(mime) {
            case "image/jpeg" -> (h[0]&255)==255 && (h[1]&255)==216 && (h[2]&255)==255;
            case "image/png" -> Arrays.equals(Arrays.copyOf(h,8),new byte[]{(byte)137,80,78,71,13,10,26,10});
            case "image/webp" -> ascii(h,0,4).equals("RIFF") && ascii(h,8,4).equals("WEBP");
            case "video/mp4" -> ascii(h,4,4).equals("ftyp");
            case "video/webm" -> (h[0]&255)==26 && (h[1]&255)==69 && (h[2]&255)==223 && (h[3]&255)==163;
            default -> false;
        };
    }
    private static String ascii(byte[] h,int start,int length) { return new String(h,start,length,StandardCharsets.US_ASCII); }
}
