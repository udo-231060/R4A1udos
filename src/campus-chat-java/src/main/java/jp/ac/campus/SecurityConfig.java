package jp.ac.campus;

import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class SecurityConfig {
    @Bean PasswordEncoder passwordEncoder() { return new BCryptPasswordEncoder(12); }

    @Bean UserDetailsService users(JdbcTemplate db) {
        return login -> {
            List<UserDetails> users = db.query("SELECT id,password FROM accounts WHERE login=?",
                (r, i) -> User.withUsername(r.getString("id")).password(r.getString("password")).roles("STUDENT").build(), login);
            if (users.isEmpty()) throw new UsernameNotFoundException("アカウントが見つかりません。");
            return users.getFirst();
        };
    }

    @Bean SecurityFilterChain security(HttpSecurity http) throws Exception {
        // CSRF remains enabled. The browser obtains a session-bound token from /api/csrf.
        http.authorizeHttpRequests(a -> a
            .requestMatchers("/", "/index.html", "/app.js", "/app.css", "/favicon.svg", "/api/csrf", "/api/register", "/error").permitAll()
            .anyRequest().authenticated());
        http.formLogin(f -> f.loginProcessingUrl("/api/login")
            .successHandler((req,res,auth) -> res.setStatus(204))
            .failureHandler((req,res,e) -> res.sendError(401)));
        http.logout(l -> l.logoutUrl("/api/logout").logoutSuccessHandler((req,res,auth) -> res.setStatus(204)));
        http.exceptionHandling(e -> e.authenticationEntryPoint((req,res,ex) -> res.sendError(401)));
        http.headers(h -> h.contentSecurityPolicy(c -> c.policyDirectives(
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")));
        return http.build();
    }
}
