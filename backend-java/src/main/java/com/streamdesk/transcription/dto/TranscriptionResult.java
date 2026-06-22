package com.streamdesk.transcription.dto;

import java.util.List;

/**
 * Результат транскрипции — порт TranscriptionResult из backend/services/whisper-x-client.ts.
 * Используется WhisperXClient и (далее) генератором документов.
 */
public class TranscriptionResult {

    private String text = "";
    private List<Segment> segments;
    private String language;
    private List<String> speakers;
    private Integer speakerCount;

    public String getText() {
        return text;
    }

    public void setText(String text) {
        this.text = text;
    }

    public List<Segment> getSegments() {
        return segments;
    }

    public void setSegments(List<Segment> segments) {
        this.segments = segments;
    }

    public String getLanguage() {
        return language;
    }

    public void setLanguage(String language) {
        this.language = language;
    }

    public List<String> getSpeakers() {
        return speakers;
    }

    public void setSpeakers(List<String> speakers) {
        this.speakers = speakers;
    }

    public Integer getSpeakerCount() {
        return speakerCount;
    }

    public void setSpeakerCount(Integer speakerCount) {
        this.speakerCount = speakerCount;
    }

    /** Сегмент транскрипции (фраза с таймкодом и опциональным спикером). */
    public static class Segment {
        private double start;
        private double end;
        private String text;
        private String speaker;       // ID спикера, например "SPEAKER_00"
        private String speakerLabel;  // человекочитаемый лейбл, например "Спикер 1"

        public double getStart() {
            return start;
        }

        public void setStart(double start) {
            this.start = start;
        }

        public double getEnd() {
            return end;
        }

        public void setEnd(double end) {
            this.end = end;
        }

        public String getText() {
            return text;
        }

        public void setText(String text) {
            this.text = text;
        }

        public String getSpeaker() {
            return speaker;
        }

        public void setSpeaker(String speaker) {
            this.speaker = speaker;
        }

        public String getSpeakerLabel() {
            return speakerLabel;
        }

        public void setSpeakerLabel(String speakerLabel) {
            this.speakerLabel = speakerLabel;
        }
    }
}
