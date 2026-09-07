package jp.ac.campus;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
public class AuthController {
    private final JdbcTemplate db;
    private final PasswordEncoder passwords;
    AuthController(JdbcTemplate db, PasswordEncoder passwords) { this.db = db; this.passwords = passwords; }
    public record Registration(@NotNull(message="ログインIDを入力してください。")
                               @Pattern(regexp="[a-zA-Z0-9_-]{3,32}", message="ログインIDは半角英数字・_・-の3〜32文字で入力してください。日本語・メールアドレス・空白は使えません。") String username,
                               @NotNull(message="パスワードを入力してください。")
                               @Size(min=12,max=72, message="新規登録のパスワードは12文字以上、72文字以内で入力してください。") String password) {}
    @GetMapping("/api/csrf") Map<String,String> csrf(CsrfToken token) {
        return Map.of("token", token.getToken(), "headerName", token.getHeaderName());
    }
    @PostMapping("/api/register") @ResponseStatus(org.springframework.http.HttpStatus.CREATED)
    Map<String,Boolean> register(@Valid @RequestBody Registration input) {
        if (input.password().getBytes(StandardCharsets.UTF_8).length > 72)
            throw new ApiErrors.Problem(400, "パスワードはUTF-8で72バイト以内にしてください。");
        try {
            db.update("INSERT INTO accounts(id,login,password,code) VALUES (?,?,?,?)",
                UUID.randomUUID().toString(), input.username(), passwords.encode(input.password()),
                UUID.randomUUID().toString().replace("-", "").toUpperCase());
        } catch (DuplicateKeyException e) { throw new ApiErrors.Problem(409, "このログインIDは使用されています。"); }
        return Map.of("ok", true);
    }
}
