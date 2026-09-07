package jp.ac.campus;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;
import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

@Service
@Profile("github")
public class GithubAccess {
    private final RestClient client;
    private final JdbcTemplate db;
    @org.springframework.beans.factory.annotation.Autowired
    public GithubAccess(JdbcTemplate db) {
        this.db = db;
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(5));
        client = RestClient.builder().baseUrl("https://api.github.com")
            .requestFactory(factory).defaultHeader("Accept", "application/vnd.github+json")
            .defaultHeader("X-GitHub-Api-Version", "2022-11-28").build();
    }
    GithubAccess(JdbcTemplate db, RestClient client) { this.db = db; this.client = client; }
    // A successful public repository GET does not establish membership.
    public boolean allowed(String token, String login) {
        if (token == null || login == null || !login.matches("[a-zA-Z0-9-]{1,39}")) return false;
        try {
            return client.get().uri("/repos/udo-231060/R4A1udos/collaborators/{login}", login)
                .headers(h -> h.setBearerAuth(token)).retrieve().toBodilessEntity()
                .getStatusCode().value() == 204;
        } catch (RuntimeException e) { return false; }
    }
    @Transactional
    public synchronized String account(String githubId) {
        if (githubId == null || !githubId.matches("[0-9]{1,20}"))
            throw new IllegalArgumentException("Invalid GitHub identity");
        var existing = db.query("SELECT account_id FROM github_accounts WHERE github_id=?",
            (r,n) -> r.getString(1), githubId);
        if (!existing.isEmpty()) return existing.getFirst();
        String id = UUID.randomUUID().toString();
        // Never link an old account by a user-supplied login or nickname.
        db.update("INSERT INTO accounts(id,login,password,code) VALUES (?,?,?,?)", id,
            "gh:" + githubId, "!", UUID.randomUUID().toString().replace("-", "").toUpperCase());
        db.update("INSERT INTO github_accounts(github_id,account_id) VALUES (?,?)", githubId, id);
        return id;
    }
}
