package com.streamdesk.chat;

import com.streamdesk.chat.dto.CompletionRequest;
import com.streamdesk.chat.dto.MessageRequest;
import com.streamdesk.chat.dto.SessionRequest;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

/**
 * REST-контроллер чата — перенос /api/chat/* из backend/routes.ts. Пути сохранены.
 */
@RestController
@RequestMapping("/api/chat")
public class ChatController {

    private final ChatService chatService;

    public ChatController(ChatService chatService) {
        this.chatService = chatService;
    }

    // POST /api/chat/completions — прокси к локальной модели
    @PostMapping("/completions")
    public Map<String, Object> completions(@RequestBody CompletionRequest req) {
        return chatService.completions(req);
    }

    // GET /api/chat/sessions?userId=
    @GetMapping("/sessions")
    public List<ChatSession> sessions(@RequestParam(required = false) String userId) {
        return chatService.getSessions(userId);
    }

    // POST /api/chat/sessions
    @PostMapping("/sessions")
    public ChatSession createSession(@RequestBody SessionRequest req) {
        return chatService.createSession(req);
    }

    // DELETE /api/chat/sessions/{id}?userId=
    @DeleteMapping("/sessions/{id}")
    public Map<String, Boolean> deleteSession(@PathVariable String id,
                                              @RequestParam(required = false) String userId) {
        chatService.deleteSession(id, userId);
        return Map.of("success", true);
    }

    // GET /api/chat/sessions/{id}/messages?userId=
    @GetMapping("/sessions/{id}/messages")
    public List<ChatMessage> messages(@PathVariable String id,
                                      @RequestParam(required = false) String userId) {
        return chatService.getMessages(id, userId);
    }

    // POST /api/chat/sessions/{id}/messages
    @PostMapping("/sessions/{id}/messages")
    public ChatMessage createMessage(@PathVariable String id, @RequestBody MessageRequest req) {
        return chatService.createMessage(id, req);
    }

    // POST /api/chat/upload (multipart: file + userId + sessionId)
    @PostMapping("/upload")
    public Map<String, Object> upload(@RequestParam(required = false) String userId,
                                      @RequestParam(required = false) String sessionId,
                                      @RequestParam(value = "file", required = false) MultipartFile file) {
        return chatService.uploadFile(userId, sessionId, file);
    }
}
