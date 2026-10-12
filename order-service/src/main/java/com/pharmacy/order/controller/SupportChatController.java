package com.pharmacy.order.controller;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import com.pharmacy.common.ApiResponse;
import com.pharmacy.order.service.SupportChatService;

/**
 * "Get Help" chat for signed-in customers. /api/orders is public at the gateway, but the gateway
 * only sets X-User-Id from a valid token (and strips any the client sends), so requiring the
 * header here keeps the chat — and the API key behind it — to logged-in users.
 */
@RestController
@RequestMapping("/api/orders/support")
public class SupportChatController {
    private final SupportChatService chat;

    public SupportChatController(SupportChatService chat) {
        this.chat = chat;
    }

    /** Body: { messages: [{ role: "user" | "assistant", content }] }. Returns { reply }. */
    @PostMapping("/chat")
    public ApiResponse<Map<String, String>> chat(@RequestHeader("X-User-Id") String userId,
                                                 @RequestBody Map<String, List<Map<String, Object>>> body) {
        return ApiResponse.ok("Reply", Map.of("reply", chat.reply(userId, body == null ? null : body.get("messages"))));
    }
}
