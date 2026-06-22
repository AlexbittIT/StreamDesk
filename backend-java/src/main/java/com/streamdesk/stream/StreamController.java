package com.streamdesk.stream;

import com.streamdesk.auth.AuthenticatedUser;
import com.streamdesk.company.CompanyService;
import com.streamdesk.stream.dto.StreamRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * REST-контроллер трансляций — перенос /api/streams из backend/routes.ts. Пути сохранены.
 */
@RestController
@RequestMapping("/api/streams")
public class StreamController {

    private final StreamService streamService;
    private final CompanyService companyService;

    public StreamController(StreamService streamService, CompanyService companyService) {
        this.streamService = streamService;
        this.companyService = companyService;
    }

    // GET /api/streams  (опц. ?active=true | ?userId=)
    @GetMapping
    public List<Stream> list(@AuthenticationPrincipal AuthenticatedUser user,
                             @RequestParam(required = false) String active,
                             @RequestParam(required = false) String userId) {
        // Как в Express: без доступа к рабочему пространству отдаём пустой список.
        if (!companyService.hasWorkspaceAccess(user)) {
            return List.of();
        }
        return streamService.listStreams(active, userId);
    }

    // POST /api/streams
    @PostMapping
    public Stream create(@RequestBody StreamRequest req) {
        return streamService.createStream(req);
    }

    // PUT /api/streams/{id}
    @PutMapping("/{id}")
    public Stream update(@PathVariable String id, @RequestBody StreamRequest req) {
        return streamService.updateStream(id, req);
    }
}
