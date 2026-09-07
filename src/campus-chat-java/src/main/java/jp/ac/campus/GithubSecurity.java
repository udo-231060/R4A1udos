package jp.ac.campus;

import java.util.HashMap;
import java.util.List;
import org.springframework.context.annotation.*;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.client.*;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.client.userinfo.DefaultOAuth2UserService;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.core.user.DefaultOAuth2User;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.access.intercept.AuthorizationFilter;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;

@Configuration
@Profile("github")
public class GithubSecurity {
    @Bean SecurityFilterChain githubFilterChain(HttpSecurity http, GithubAccess access,
            OAuth2AuthorizedClientService clients) throws Exception {
        var userService = new DefaultOAuth2UserService();
        http.authorizeHttpRequests(a -> a
            .requestMatchers("/api/register", "/api/login").denyAll()
            .requestMatchers("/", "/index.html", "/app.js", "/app.css", "/favicon.svg",
                "/api/auth-mode", "/api/csrf", "/oauth2/**", "/login/**", "/error").permitAll()
            .anyRequest().authenticated());
        http.oauth2Login(o -> o.userInfoEndpoint(u -> u.userService(request -> {
            var user = userService.loadUser(request);
            String login = user.getAttribute("login");
            if (!access.allowed(request.getAccessToken().getTokenValue(), login))
                throw new OAuth2AuthenticationException(new OAuth2Error("access_denied"));
            var attributes = new HashMap<String,Object>(user.getAttributes());
            attributes.put("account_id", access.account(String.valueOf(attributes.get("id"))));
            return new DefaultOAuth2User(List.of(new SimpleGrantedAuthority("ROLE_STUDENT")),
                attributes, "account_id");
        })).defaultSuccessUrl("/", true).failureUrl("/?github=denied"));
        http.logout(l -> l.logoutUrl("/api/logout").logoutSuccessHandler((req,res,a) -> res.setStatus(204)));
        http.exceptionHandling(e -> e.authenticationEntryPoint((req,res,ex) -> res.sendError(401)));
        // Recheck on each data request, including media; errors and expired tokens fail closed.
        http.addFilterBefore(new OncePerRequestFilter() {
            @Override protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res,
                    FilterChain chain) throws ServletException, IOException {
                if (req.getRequestURI().substring(req.getContextPath().length()).startsWith("/api/chat")) {
                    var authentication = SecurityContextHolder.getContext().getAuthentication();
                    if (!(authentication instanceof OAuth2AuthenticationToken oauth)) {
                        res.sendError(401); return;
                    }
                    OAuth2AuthorizedClient client = clients.loadAuthorizedClient(
                        oauth.getAuthorizedClientRegistrationId(), oauth.getName());
                    if (client == null || !access.allowed(client.getAccessToken().getTokenValue(),
                            oauth.getPrincipal().getAttribute("login"))) {
                        SecurityContextHolder.clearContext();
                        if (req.getSession(false) != null) req.getSession(false).invalidate();
                        res.sendError(401); return;
                    }
                }
                chain.doFilter(req,res);
            }
        }, AuthorizationFilter.class);
        http.headers(h -> h.contentSecurityPolicy(c -> c.policyDirectives(
            "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; media-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")));
        return http.build();
    }
}
