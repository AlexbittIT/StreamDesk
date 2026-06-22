package com.streamdesk.show;

import com.streamdesk.config.ApiException;
import com.streamdesk.show.dto.MarkerRequest;
import com.streamdesk.show.dto.ProfileRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;

/**
 * Логика шоу — профили участников и маркеры по таймкоду (перенос /api/events/.../participant-profiles
 * и /markers из backend/routes.ts).
 */
@Service
public class ShowService {

    private final ShowParticipantProfileRepository profileRepository;
    private final ShowMarkerRepository markerRepository;

    public ShowService(ShowParticipantProfileRepository profileRepository,
                       ShowMarkerRepository markerRepository) {
        this.profileRepository = profileRepository;
        this.markerRepository = markerRepository;
    }

    // --- participant profiles ---

    public List<ShowParticipantProfile> getProfiles(String eventId) {
        return profileRepository.findByEventIdOrderByOrderAscCreatedAtAsc(eventId);
    }

    @Transactional
    public ShowParticipantProfile createProfile(String eventId, ProfileRequest req) {
        if (isBlank(req.name())) {
            throw ApiException.badRequest("Name is required");
        }
        ShowParticipantProfile profile = new ShowParticipantProfile();
        profile.setEventId(eventId);
        profile.setName(req.name());
        profile.setRole(req.role());
        profile.setPhoto(req.photo());
        profile.setBio(req.bio());
        profile.setContacts(req.contacts() != null ? req.contacts() : new HashMap<>());
        profile.setExtra(req.extra() != null ? req.extra() : new HashMap<>());
        profile.setOrder(req.order() != null ? req.order() : 0);
        return profileRepository.save(profile);
    }

    @Transactional
    public ShowParticipantProfile updateProfile(String id, ProfileRequest req) {
        ShowParticipantProfile profile = profileRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Profile not found"));
        if (req.name() != null) {
            profile.setName(req.name());
        }
        if (req.role() != null) {
            profile.setRole(req.role());
        }
        if (req.photo() != null) {
            profile.setPhoto(req.photo());
        }
        if (req.bio() != null) {
            profile.setBio(req.bio());
        }
        if (req.contacts() != null) {
            profile.setContacts(req.contacts());
        }
        if (req.extra() != null) {
            profile.setExtra(req.extra());
        }
        if (req.order() != null) {
            profile.setOrder(req.order());
        }
        profile.setUpdatedAt(Instant.now());
        return profileRepository.save(profile);
    }

    @Transactional
    public void deleteProfile(String id) {
        if (!profileRepository.existsById(id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Profile not found");
        }
        profileRepository.deleteById(id);
    }

    // --- markers ---

    public List<ShowMarker> getMarkers(String eventId) {
        return markerRepository.findByEventIdOrderByTimecodeAscCreatedAtAsc(eventId);
    }

    @Transactional
    public ShowMarker createMarker(String eventId, MarkerRequest req, String editorId) {
        if (isBlank(req.timecode()) || isBlank(req.type())) {
            throw ApiException.badRequest("Timecode and type are required");
        }
        ShowMarker marker = new ShowMarker();
        marker.setEventId(eventId);
        marker.setTimecode(req.timecode());
        marker.setType(req.type());
        marker.setValue(isBlank(req.value()) ? null : req.value());
        marker.setNote(isBlank(req.note()) ? null : req.note());
        marker.setEditorId(editorId);
        return markerRepository.save(marker);
    }

    @Transactional
    public ShowMarker updateMarker(String id, MarkerRequest req) {
        ShowMarker marker = markerRepository.findById(id)
                .orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "Marker not found"));
        if (req.timecode() != null) {
            marker.setTimecode(req.timecode());
        }
        if (req.type() != null) {
            marker.setType(req.type());
        }
        if (req.value() != null) {
            marker.setValue(req.value());
        }
        if (req.note() != null) {
            marker.setNote(req.note());
        }
        return markerRepository.save(marker);
    }

    @Transactional
    public void deleteMarker(String id) {
        if (!markerRepository.existsById(id)) {
            throw new ApiException(HttpStatus.NOT_FOUND, "Marker not found");
        }
        markerRepository.deleteById(id);
    }

    private static boolean isBlank(String s) {
        return s == null || s.isBlank();
    }
}
