package com.streamdesk.notification.email;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/**
 * Best-effort отправка email-дублей уведомлений. Без MAIL_HOST письма не уходят —
 * ошибку только логируем (как NotificationService.notify), чтобы сбой почты
 * не ломал основную операцию (например, простановку статуса зоны).
 */
@Service
public class EmailService {

    private static final Logger log = LoggerFactory.getLogger(EmailService.class);

    private final JavaMailSender mailSender;
    private final String from;
    private final boolean configured;

    public EmailService(JavaMailSender mailSender,
                        @Value("${spring.mail.host:}") String mailHost,
                        @Value("${app.mail.from}") String from) {
        this.mailSender = mailSender;
        this.from = from;
        this.configured = mailHost != null && !mailHost.isBlank();
    }

    public boolean isConfigured() {
        return configured;
    }

    public void send(String to, String subject, String body) {
        if (!configured || to == null || to.isBlank()) {
            return;
        }
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(to);
            message.setSubject(subject);
            message.setText(body);
            mailSender.send(message);
        } catch (Exception e) {
            log.warn("[Email] Не удалось отправить письмо на {}: {}", to, e.getMessage());
        }
    }
}
