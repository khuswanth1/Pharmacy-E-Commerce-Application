package com.pharmacy.product.dto;

import java.math.BigDecimal;

/** Create / edit payload used by the vendor and admin product screens. Null fields are left unchanged on edit. */
public record ProductForm(
        String name,
        String description,
        BigDecimal mrp,
        BigDecimal sellingPrice,
        String imageUrl,
        Boolean prescriptionRequired,
        Integer stock,
        String categorySlug,
        String subType,
        String manufacturer,
        String packSize,
        String brand,
        String composition,
        String vendorName
) {}
