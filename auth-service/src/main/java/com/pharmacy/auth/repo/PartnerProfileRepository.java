package com.pharmacy.auth.repo;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import com.pharmacy.auth.entity.PartnerProfile;
import com.pharmacy.common.Role;

@Repository
public interface PartnerProfileRepository extends JpaRepository<PartnerProfile, String> {
    List<PartnerProfile> findByPartnerRoleOrderByCreatedAtDesc(Role partnerRole);
    List<PartnerProfile> findAllByOrderByCreatedAtDesc();
}
