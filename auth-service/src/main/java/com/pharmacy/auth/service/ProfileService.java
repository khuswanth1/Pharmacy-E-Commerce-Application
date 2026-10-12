package com.pharmacy.auth.service;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.pharmacy.auth.dto.UpdateProfileRequest;
import com.pharmacy.auth.entity.User;
import com.pharmacy.auth.exception.ResourceNotFoundException;
import com.pharmacy.auth.repo.UserRepository;

@Service
public class ProfileService {

    private final UserRepository users;

    public ProfileService(UserRepository users) {
        this.users = users;
    }

    public User getById(String id) {
        return users.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
    }

    @Transactional
    public User update(String id, UpdateProfileRequest req) {
        User u = getById(id);
        if (req.name() != null && !req.name().isBlank()) {
            u.setName(req.name());
        }
        if (req.phone() != null) {
            u.setPhone(req.phone());
        }
        if (req.email() != null && !req.email().isBlank()) {
            u.setEmail(req.email());
        }
        if (req.address() != null) {
            u.setAddress(req.address());
        }
        if (req.geolocation() != null) {
            u.setGeolocation(req.geolocation());
        }
        if (req.gender() != null) {
            u.setGender(req.gender());
        }
        if (req.picture() != null) {
            if (req.picture().isBlank()) {
                u.setPicture(null);
            } else {
                u.setPicture(req.picture());
            }
        }
        return users.save(u);
    }
}
