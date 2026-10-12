package com.pharmacy.product.entity;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import jakarta.persistence.*;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;

@Entity
public class Product {
    @Id @GeneratedValue(strategy = GenerationType.UUID)
    private String id;
    private String name;
    @Column(length = 2000)
    private String description;
    private BigDecimal mrp;
    private BigDecimal sellingPrice;
    private String imageUrl;
    private boolean prescriptionRequired;
    private int stock;

    @ManyToOne(fetch = FetchType.LAZY)
    @JsonIgnore
    private Category category;

    private String subType;
    private Double rating;
    private String manufacturer;
    private String packSize;
    private String brand;
    @Column(length = 1000)
    private String composition;

    /** Vendor who listed the product; null for the store's own catalogue. */
    private String vendorId;
    private String vendorName;

    public String getId() { return id; }
    public String getVendorId() { return vendorId; }
    public void setVendorId(String vendorId) { this.vendorId = vendorId; }
    public String getVendorName() { return vendorName; }
    public void setVendorName(String vendorName) { this.vendorName = vendorName; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public BigDecimal getMrp() { return mrp; }
    public void setMrp(BigDecimal mrp) { this.mrp = mrp; }
    public BigDecimal getSellingPrice() { return sellingPrice; }
    public void setSellingPrice(BigDecimal sellingPrice) { this.sellingPrice = sellingPrice; }
    public String getImageUrl() { return imageUrl; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    public boolean isPrescriptionRequired() { return prescriptionRequired; }
    public void setPrescriptionRequired(boolean prescriptionRequired) { this.prescriptionRequired = prescriptionRequired; }
    public int getStock() { return stock; }
    public void setStock(int stock) { this.stock = stock; }

    @JsonIgnore
    public Category getCategory() { return category; }
    public void setCategory(Category category) { this.category = category; }

    public String getSubType() { return subType; }
    public void setSubType(String subType) { this.subType = subType; }
    public Double getRating() { return rating; }
    public void setRating(Double rating) { this.rating = rating; }
    public String getManufacturer() { return manufacturer; }
    public void setManufacturer(String manufacturer) { this.manufacturer = manufacturer; }
    public String getPackSize() { return packSize; }
    public void setPackSize(String packSize) { this.packSize = packSize; }
    public String getBrand() { return brand; }
    public void setBrand(String brand) { this.brand = brand; }
    public String getComposition() { return composition; }
    public void setComposition(String composition) { this.composition = composition; }

    // CUSTOM JSON SERIALIZATION PROPERTIES FOR FRONTEND MATCHING

    @JsonProperty("final_price")
    public BigDecimal getFinalPrice() {
        return sellingPrice;
    }

    @JsonProperty("cost")
    public BigDecimal getCost() {
        return mrp;
    }

    @JsonProperty("discount")
    public double getDiscount() {
        if (mrp != null && sellingPrice != null && mrp.doubleValue() > 0) {
            double diff = mrp.doubleValue() - sellingPrice.doubleValue();
            return Math.max(0.0, (diff / mrp.doubleValue()) * 100.0);
        }
        return 0.0;
    }

    @JsonProperty("images")
    public List<String> getImagesList() {
        List<String> list = new ArrayList<>();
        if (imageUrl != null && !imageUrl.isEmpty()) {
            list.add(imageUrl);
        } else {
            // default placeholder if empty
            list.add("https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=400&q=80");
        }
        return list;
    }

    @JsonProperty("trueCategorySlug")
    public String getTrueCategorySlug() {
        return category != null ? category.getSlug() : null;
    }

    @JsonProperty("category")
    public String getCategorySlug() {
        return category != null ? category.getSlug() : null;
    }

    @JsonProperty("categorySlug")
    public String getCategorySlugForProp() {
        return category != null ? category.getSlug() : null;
    }

    @JsonProperty("highlights")
    public Map<String, String> getHighlights() {
        Map<String, String> map = new HashMap<>();
        map.put("pack_size", packSize != null ? packSize : "1 strip");
        map.put("product_type", subType != null ? subType : "Tablet");
        map.put("brand", brand != null ? brand : (manufacturer != null ? manufacturer : "Generic"));
        map.put("composition", composition != null ? composition : "Standard Formulation");
        return map;
    }
}
