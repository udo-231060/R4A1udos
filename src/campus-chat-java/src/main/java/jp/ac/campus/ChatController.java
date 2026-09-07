package jp.ac.campus;

import java.io.IOException;
import java.security.Principal;
import java.util.Map;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/chat")
public class ChatController {
    private final ChatService chat;
    public ChatController(ChatService chat) { this.chat = chat; }
    @GetMapping
    Object get(Principal user, @RequestParam(defaultValue="messages") String action,
               @RequestParam(defaultValue="general") String room, @RequestParam(defaultValue="") String id) {
        return switch(action) {
            case "profile" -> chat.profile(user.getName());
            case "threads" -> chat.threads(user.getName());
            case "messages", "shorts" -> chat.messages(user.getName(),room,action.equals("shorts"));
            case "media" -> {
                ChatService.Media media = chat.media(user.getName(),id);
                // Resource handling also supports HTTP Range for seeking in video.
                yield ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType(media.mime()))
                    .header("Content-Disposition","inline").body(new ByteArrayResource(media.bytes()));
            }
            default -> throw new ApiErrors.Problem(400,"操作が見つかりません。");
        };
    }
    public record ProfileInput(String registered,String nickname,Integer level) {}
    @PostMapping(params="action=profile")
    Map<String,Boolean> profile(Principal user,@RequestBody ProfileInput p) {
        chat.saveProfile(user.getName(),p.registered(),p.nickname(),p.level()); return Map.of("ok",true);
    }
    @PostMapping(params="action=thread")
    Map<String,String> thread(Principal user,@RequestBody Map<String,String> body) {
        return Map.of("id",chat.thread(user.getName(),body.get("code")));
    }
    @PostMapping(params="action=report")
    Map<String,Boolean> report(Principal user,@RequestBody Map<String,String> body) {
        chat.report(user.getName(),body.get("id")); return Map.of("ok",true);
    }
    @PostMapping(consumes=MediaType.MULTIPART_FORM_DATA_VALUE, params="!action")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String,String> send(Principal user,@RequestParam(defaultValue="general") String room,
                           @RequestParam(defaultValue="") String body,@RequestParam(required=false) MultipartFile file) throws IOException {
        return Map.of("id",chat.send(user.getName(),room,body,file));
    }
}
