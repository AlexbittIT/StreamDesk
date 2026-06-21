package com.streamdesk.show;

import com.streamdesk.show.dto.OtisRequest;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * REST-контроллер настроек эфира ОТИС — перенос /api/otis из backend/routes.ts.
 */
@RestController
@RequestMapping("/api/otis")
public class OtisController {

    private final OtisService otisService;

    public OtisController(OtisService otisService) {
        this.otisService = otisService;
    }

    @GetMapping
    public Object get() {
        return otisService.get();
    }

    @PutMapping
    public OtisStreamSettings update(@RequestBody OtisRequest req) {
        return otisService.upsert(req);
    }
}
