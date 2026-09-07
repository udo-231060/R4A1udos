package jp.ac.campus;

import java.util.*;
import java.util.concurrent.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:tests;DB_CLOSE_DELAY=-1"})
@AutoConfigureMockMvc
class ChatIntegrationTest {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate db;
    @Autowired ObjectMapper json;
    @Autowired ChatService chat;
    String a,b,c;

    @BeforeEach void setup() {
        db.update("DELETE FROM reports"); db.update("DELETE FROM messages"); db.update("DELETE FROM aliases");
        db.update("DELETE FROM conversations"); db.update("DELETE FROM accounts");
        a = seed("a"); b = seed("b"); c = seed("c");
    }
    String seed(String login) {
        String id = UUID.randomUUID().toString();
        db.update("INSERT INTO accounts(id,login,password,code) VALUES (?,?,?,?)",id,login,"not-a-real-password",UUID.randomUUID().toString().replace("-", "").toUpperCase());
        return id;
    }
    JsonNode parsed(String text) throws Exception { return json.readTree(text); }
    String send(String user,String room,String body,MockMultipartFile media) throws Exception {
        var req = multipart("/api/chat");
        req.param("room",room).param("body",body).with(user(user)).with(csrf());
        if (media != null) req.file(media);
        return parsed(mvc.perform(req).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString()).get("id").asText();
    }
    void profile(int level,String nickname) { chat.saveProfile(a,"登録名",nickname,level); }
    MockMultipartFile png() {
        return new MockMultipartFile("file","photo.png","image/png",Base64.getDecoder().decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6eT8AAAAASUVORK5CYII="));
    }
    @Test void anonymousAndCsrfRequestsAreRejected() throws Exception {
        mvc.perform(get("/api/chat")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/chat?action=profile").with(user(a)).contentType("application/json").content("{}"))
            .andExpect(status().isForbidden());
        mvc.perform(post("/api/register").contentType("application/json").content("{}"))
            .andExpect(status().isForbidden());
    }
    @Test void registrationLoginSessionAndLogout() throws Exception {
        mvc.perform(post("/api/register").with(csrf()).contentType("application/json")
            .content("{\"username\":\"student1\",\"password\":\"a-long-password-123\"}")).andExpect(status().isCreated());
        String encoded = db.queryForObject("SELECT password FROM accounts WHERE login='student1'",String.class);
        assertTrue(encoded.startsWith("$2")); assertNotEquals("a-long-password-123",encoded);
        mvc.perform(post("/api/login").with(csrf()).param("username","student1").param("password","incorrect")).andExpect(status().isUnauthorized());
        var result = mvc.perform(post("/api/login").with(csrf()).param("username","student1").param("password","a-long-password-123"))
            .andExpect(status().isNoContent()).andReturn();
        var session = (MockHttpSession)result.getRequest().getSession(false);
        mvc.perform(get("/api/chat?action=profile").session(session)).andExpect(status().isOk()).andExpect(jsonPath("$.level").value(1));
        mvc.perform(post("/api/logout").session(session).with(csrf())).andExpect(status().isNoContent());
        assertTrue(session.isInvalid());
    }
    @Test void registrationValidatesPasswordAndDuplicateLogin() throws Exception {
        mvc.perform(post("/api/register").with(csrf()).contentType("application/json")
            .content("{\"username\":\"日本語\",\"password\":\"a-long-password-123\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("ログインID")));
        mvc.perform(post("/api/register").with(csrf()).contentType("application/json")
            .content("{\"username\":\"student1\",\"password\":\"short\"}"))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("12文字以上")));
        String body = "{\"username\":\"student1\",\"password\":\"a-long-password-123\"}";
        mvc.perform(post("/api/register").with(csrf()).contentType("application/json").content(body)).andExpect(status().isCreated());
        mvc.perform(post("/api/register").with(csrf()).contentType("application/json").content(body)).andExpect(status().isConflict());
    }
    @Test void allAnonymityLevelsAndHistoricalNames() throws Exception {
        profile(0,"ニック"); send(a,"general","zero",null);
        profile(1,"ニック"); send(a,"general","one",null);
        profile(2,"変更後"); send(a,"general","two-a",null); send(a,"general","two-b",null);
        profile(3,"変更後"); send(a,"general","three-a",null); send(a,"general","three-b",null);
        Map<String,ChatService.Message> messages = new HashMap<>(); chat.messages(b,"general",false).forEach(m -> messages.put(m.body(),m));
        assertEquals("登録名",messages.get("zero").name()); assertEquals("ニック",messages.get("one").name());
        assertEquals(messages.get("two-a").name(),messages.get("two-b").name());
        assertNotEquals(messages.get("three-a").name(),messages.get("three-b").name());
        assertTrue(messages.get("three-a").name().startsWith("匿名・"));
    }
    @Test void invalidLevelsAndBlankNamesRejected() throws Exception {
        for (String level : List.of("-1","4","1.5","\"1\"","null"))
            mvc.perform(post("/api/chat?action=profile").with(user(a)).with(csrf()).contentType("application/json")
                .content("{\"registered\":\"名前\",\"nickname\":\"ニック\",\"level\":"+level+"}" )).andExpect(status().isBadRequest());
        assertThrows(ApiErrors.Problem.class,() -> chat.saveProfile(a,"","ニック",0));
        assertThrows(ApiErrors.Problem.class,() -> chat.saveProfile(a,"名前"," ",1));
    }
    @Test void privateRoomAndMediaRequireMembership() throws Exception {
        String room = chat.thread(a,chat.profile(b).code());
        String id = send(a,room,"private",png());
        mvc.perform(get("/api/chat").param("room",room).with(user(b))).andExpect(status().isOk()).andExpect(jsonPath("$[0].body").value("private"));
        mvc.perform(get("/api/chat").param("room",room).with(user(c))).andExpect(status().isForbidden());
        mvc.perform(get("/api/chat?action=media").param("id",id).with(user(c))).andExpect(status().isForbidden());
        mvc.perform(get("/api/chat?action=media").param("id",id).with(user(b))).andExpect(status().isOk()).andExpect(content().bytes(png().getBytes()));
        mvc.perform(multipart("/api/chat").param("room",room).param("body","intrude").with(user(c)).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(post("/api/chat?action=report").with(user(c)).with(csrf()).contentType("application/json").content("{\"id\":\""+id+"\"}"))
            .andExpect(status().isForbidden());
        assertTrue(chat.threads(c).isEmpty());
    }
    @Test void aliasesAreDifferentAcrossRooms() throws Exception {
        String room = chat.thread(a,chat.profile(b).code()); profile(2,"ニック");
        send(a,"general","public",null); send(a,room,"private",null);
        assertNotEquals(chat.messages(a,"general",false).getFirst().name(), chat.messages(a,room,false).getFirst().name());
    }
    @Test void publicResponseDoesNotExposeAccountOrBlob() throws Exception {
        send(a,"general","hello",png());
        String text = mvc.perform(get("/api/chat").with(user(b))).andExpect(status().isOk())
            .andExpect(jsonPath("$[0].author").doesNotExist()).andExpect(jsonPath("$[0].media").doesNotExist())
            .andExpect(jsonPath("$[0].mine").value(false)).andReturn().getResponse().getContentAsString();
        assertFalse(text.contains(a)); assertFalse(text.contains(chat.profile(a).code()));
    }
    @Test void mediaTypesSizesAndEmptyPostsAreValidated() throws Exception {
        mvc.perform(multipart("/api/chat").file(new MockMultipartFile("file","x.png","image/png","not an image at all".getBytes())).with(user(a)).with(csrf()))
            .andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/chat").file(new MockMultipartFile("file","x.svg","image/svg+xml","<svg/>".getBytes())).with(user(a)).with(csrf()))
            .andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/chat").file(new MockMultipartFile("file","x.png","image/png",new byte[8*1024*1024+1])).with(user(a)).with(csrf()))
            .andExpect(status().isPayloadTooLarge());
        mvc.perform(multipart("/api/chat").with(user(a)).with(csrf())).andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/chat").param("body","a".repeat(2001)).with(user(a)).with(csrf())).andExpect(status().isBadRequest());
    }
    @Test void shortsExcludePrivateVideosAndSupportRanges() throws Exception {
        byte[] bytes = new byte[24]; System.arraycopy("ftyp".getBytes(),0,bytes,4,4);
        var video = new MockMultipartFile("file","clip.mp4","video/mp4",bytes);
        String room = chat.thread(a,chat.profile(b).code());
        String id = send(a,"general","public video",video); send(a,room,"private video",video);
        assertEquals(1,chat.messages(c,"general",true).size());
        mvc.perform(get("/api/chat?action=media").param("id",id).header("Range","bytes=0-7").with(user(b)))
            .andExpect(status().isPartialContent()).andExpect(content().bytes(Arrays.copyOf(bytes,8)));
    }
    @Test void reportsAreIdempotent() throws Exception {
        String id = send(a,"general","reportable",null);
        chat.report(b,id); chat.report(b,id);
        assertEquals(1,db.queryForObject("SELECT COUNT(*) FROM reports",Integer.class));
    }
    @Test void concurrentConversationsResolveToSameRoom() throws Exception {
        try (var pool = Executors.newFixedThreadPool(2)) {
            String ac = chat.profile(a).code(), bc = chat.profile(b).code();
            var x = pool.submit(() -> chat.thread(a,bc)); var y = pool.submit(() -> chat.thread(b,ac));
            assertEquals(x.get(10,TimeUnit.SECONDS),y.get(10,TimeUnit.SECONDS));
            assertEquals(1,chat.threads(a).size());
        }
    }
    @Test void rateLimitRejectsTwentyFirstPost() throws Exception {
        for (int i=0;i<20;i++) chat.send(a,"general","post "+i,null);
        var error = assertThrows(ApiErrors.Problem.class,() -> chat.send(a,"general","extra",null));
        assertEquals(429,error.status);
    }
    @Test void returnsOnlyLatestHundredInChronologicalOrder() {
        for (int i=0;i<105;i++) db.update("INSERT INTO messages(id,room,author,display_name,anonymity,body,created) VALUES (?,?,?,?,?,?,?)",
            UUID.randomUUID().toString(),"general",a,"ニック",1,"post "+i,(long)i);
        var messages = chat.messages(b,"general",false);
        assertEquals(100,messages.size()); assertEquals("post 5",messages.getFirst().body()); assertEquals("post 104",messages.getLast().body());
    }
}
