package jp.ac.campus;

import java.util.UUID;
import java.time.Instant;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.oauth2.client.*;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.core.OAuth2AccessToken;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:githubtests;DB_CLOSE_DELAY=-1",
    "GITHUB_CLIENT_ID=test", "GITHUB_CLIENT_SECRET=test", "PUBLIC_BASE_URL=https://example.test"})
@ActiveProfiles("github")
@AutoConfigureMockMvc
class GithubSecurityTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ClientRegistrationRepository registrations;
    @MockitoBean GithubAccess access;
    @MockitoBean OAuth2AuthorizedClientService clients;

    @Test void passwordAndAnonymousCannotBypassGithub() throws Exception {
        mvc.perform(get("/api/chat?action=profile")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/chat?action=media&id=anything").with(user("local-user")))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/register").with(csrf()).with(user("local-user"))
            .contentType("application/json").content("{\"username\":\"newuser\",\"password\":\"long-password\"}"))
            .andExpect(status().isForbidden());
        mvc.perform(post("/api/login").with(csrf()).with(user("local-user")))
            .andExpect(status().isForbidden());
    }
    @Test void membershipRevocationDeniesExistingSession() throws Exception {
        String id = UUID.randomUUID().toString();
        db.update("INSERT INTO accounts(id,login,password,code) VALUES (?,?,?,?)", id,
            "test:"+id.substring(0,8), "!", id.replace("-", ""));
        var registration = registrations.findByRegistrationId("github");
        var token = new OAuth2AccessToken(OAuth2AccessToken.TokenType.BEARER, "test-token",
            Instant.now(), Instant.now().plusSeconds(3600));
        when(clients.loadAuthorizedClient("github", id)).thenReturn(new OAuth2AuthorizedClient(registration,id,token));
        when(access.allowed("test-token", "member")).thenReturn(true, false);
        var login = oauth2Login().clientRegistration(registration)
            .oauth2User(new org.springframework.security.oauth2.core.user.DefaultOAuth2User(
                java.util.List.of(new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_STUDENT")),
                java.util.Map.of("account_id",id,"login","member"),"account_id"));
        mvc.perform(get("/api/chat?action=profile").with(login)).andExpect(status().isOk());
        mvc.perform(get("/api/chat?action=profile").with(login)).andExpect(status().isUnauthorized());
    }
    @Test void modeAndOauthEntryAreAvailable() throws Exception {
        mvc.perform(get("/api/auth-mode")).andExpect(jsonPath("$.github").value(true));
        mvc.perform(get("/oauth2/authorization/github")).andExpect(status().is3xxRedirection());
    }
}
