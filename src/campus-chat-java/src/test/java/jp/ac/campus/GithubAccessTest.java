package jp.ac.campus;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class GithubAccessTest {
    @Test void onlyExplicitCollaboratorResponseGrantsAccess() {
        var builder = RestClient.builder().baseUrl("https://api.github.com");
        var server = MockRestServiceServer.bindTo(builder).build();
        var access = new GithubAccess(null, builder.build());
        for (var status : new HttpStatus[]{HttpStatus.NO_CONTENT, HttpStatus.OK,
                HttpStatus.NOT_FOUND, HttpStatus.FORBIDDEN, HttpStatus.UNAUTHORIZED, HttpStatus.SERVICE_UNAVAILABLE}) {
            server.expect(requestTo("https://api.github.com/repos/udo-231060/R4A1udos/collaborators/member"))
                .andExpect(header("Authorization", "Bearer token"))
                .andRespond(withStatus(status));
            assertEquals(status == HttpStatus.NO_CONTENT, access.allowed("token", "member"));
            server.verify(); server.reset();
        }
        assertFalse(access.allowed("token", "../other"));
        assertFalse(access.allowed(null, "member"));
    }
}
