package com.pharmacy.product.service;

import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.pharmacy.product.dto.ProductForm;
import com.pharmacy.product.entity.Category;
import com.pharmacy.product.entity.Product;
import com.pharmacy.product.repo.CategoryRepository;
import com.pharmacy.product.repo.ProductRepository;

@Service
public class ProductService {
    private static final Logger log = LoggerFactory.getLogger(ProductService.class);
    private final ProductRepository productRepo;
    private final CategoryRepository categoryRepo;

    public ProductService(ProductRepository productRepo, CategoryRepository categoryRepo) {
        this.productRepo = productRepo;
        this.categoryRepo = categoryRepo;
    }

    public Product get(String productId) {
        return productRepo.findById(productId)
                .orElseThrow(() -> new IllegalArgumentException("Product not found: " + productId));
    }

    /** Creates a product. {@code vendorId} is null when an admin adds to the store's own catalogue. */
    @Transactional
    public Product create(ProductForm form, String vendorId) {
        if (form.name() == null || form.name().isBlank()) {
            throw new IllegalArgumentException("Product name is required");
        }
        if (form.sellingPrice() == null || form.sellingPrice().signum() <= 0) {
            throw new IllegalArgumentException("Selling price must be greater than zero");
        }
        Product p = new Product();
        p.setVendorId(vendorId);
        p.setRating(4.0);
        apply(p, form);
        if (p.getMrp() == null) {
            p.setMrp(p.getSellingPrice());
        }
        return productRepo.save(p);
    }

    /** Edits a product. Vendors may only edit their own; pass {@code vendorId = null} for admin edits. */
    @Transactional
    public Product update(String productId, ProductForm form, String vendorId) {
        Product p = get(productId);
        if (vendorId != null && !vendorId.equals(p.getVendorId())) {
            throw new IllegalArgumentException("You can only edit products your store listed");
        }
        apply(p, form);
        return productRepo.save(p);
    }

    @Transactional
    public void delete(String productId, String vendorId) {
        Product p = get(productId);
        if (vendorId != null && !vendorId.equals(p.getVendorId())) {
            throw new IllegalArgumentException("You can only remove products your store listed");
        }
        productRepo.delete(p);
    }

    public List<Product> byVendor(String vendorId) {
        return productRepo.findByVendorIdOrderByNameAsc(vendorId);
    }

    public List<Product> lowStock(int threshold) {
        return productRepo.findByStockLessThanEqualOrderByStockAsc(threshold);
    }

    private void apply(Product p, ProductForm f) {
        if (f.name() != null && !f.name().isBlank()) p.setName(f.name().trim());
        if (f.description() != null) p.setDescription(f.description());
        if (f.mrp() != null) p.setMrp(f.mrp());
        if (f.sellingPrice() != null) p.setSellingPrice(f.sellingPrice());
        if (f.imageUrl() != null) p.setImageUrl(f.imageUrl());
        if (f.prescriptionRequired() != null) p.setPrescriptionRequired(f.prescriptionRequired());
        if (f.stock() != null) {
            if (f.stock() < 0) throw new IllegalArgumentException("Stock cannot be negative");
            p.setStock(f.stock());
        }
        if (f.subType() != null) p.setSubType(f.subType());
        if (f.manufacturer() != null) p.setManufacturer(f.manufacturer());
        if (f.packSize() != null) p.setPackSize(f.packSize());
        if (f.brand() != null) p.setBrand(f.brand());
        if (f.composition() != null) p.setComposition(f.composition());
        if (f.vendorName() != null) p.setVendorName(f.vendorName());
        if (f.categorySlug() != null && !f.categorySlug().isBlank()) {
            Category c = categoryRepo.findBySlugIgnoreCase(f.categorySlug());
            if (c == null) throw new IllegalArgumentException("Unknown category: " + f.categorySlug());
            p.setCategory(c);
        }
        if (p.getMrp() != null && p.getSellingPrice() != null && p.getSellingPrice().compareTo(p.getMrp()) > 0) {
            throw new IllegalArgumentException("Selling price cannot be more than MRP");
        }
    }

    @Transactional
    public void reduceStock(String productId, int quantity) {
        if (quantity <= 0) {
            throw new IllegalArgumentException("Quantity must be greater than zero");
        }

        Product product = productRepo.findById(productId)
                .orElseThrow(() -> new IllegalArgumentException("Product not found: " + productId));

        log.info("Stock Before | product={} stock={}", product.getName(), product.getStock());

        if (product.getStock() < quantity) {
            throw new IllegalArgumentException("Insufficient stock for product " + product.getName() + 
                ". Available: " + product.getStock() + ", Requested: " + quantity);
        }

        int stockAfter = product.getStock() - quantity;
        product.setStock(stockAfter);
        
        // Save the updated entity
        productRepo.save(product);

        log.info("Stock After | product={} stock={}", product.getName(), stockAfter);
    }
}
