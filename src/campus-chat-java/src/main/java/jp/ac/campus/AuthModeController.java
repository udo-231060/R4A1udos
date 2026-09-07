package jp.ac.campus;

import java.util.Map;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.web.bind.annotation.*;

@RestController
public class AuthModeController {
    private final Environment env;
    AuthModeController(Environment env) { this.env = env; }
    @GetMapping("/api/auth-mode") Map<String,Boolean> mode() {
        return Map.of("github", env.acceptsProfiles(Profiles.of("github")));
    }
}
