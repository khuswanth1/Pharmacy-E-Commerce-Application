package com.pharmacy.auth.repo;

import java.util.List;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.pharmacy.auth.entity.AuthEvent;

@Repository
public interface AuthEventRepository extends JpaRepository<AuthEvent, String> {
    List<AuthEvent> findAllByOrderByOccurredAtDesc(Pageable page);
    List<AuthEvent> findByTypeOrderByOccurredAtDesc(AuthEvent.Type type, Pageable page);
    List<AuthEvent> findByUserIdOrderByOccurredAtDesc(String userId, Pageable page);
}
