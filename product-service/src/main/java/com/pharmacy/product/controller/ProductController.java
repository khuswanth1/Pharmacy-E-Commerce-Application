package com.pharmacy.product.controller;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.web.bind.annotation.*;

import com.pharmacy.common.ApiResponse;
import com.pharmacy.product.entity.Category;
import com.pharmacy.product.entity.Product;
import com.pharmacy.product.entity.LabTestBooking;
import com.pharmacy.product.repo.CategoryRepository;
import com.pharmacy.product.repo.ProductRepository;
import com.pharmacy.product.repo.LabTestBookingRepository;
import com.pharmacy.product.service.ProductService;

@RestController
@RequestMapping("/api/products")
public class ProductController {
    private final ProductRepository products;
    private final CategoryRepository categories;
    private final ProductService productService;
    private final LabTestBookingRepository labTestBookingRepository;

    public ProductController(ProductRepository products, CategoryRepository categories, ProductService productService, LabTestBookingRepository labTestBookingRepository) {
        this.products = products;
        this.categories = categories;
        this.productService = productService;
        this.labTestBookingRepository = labTestBookingRepository;
    }

    @GetMapping
    public ApiResponse<List<Product>> all(@RequestParam(required = false) String q) {
        return ApiResponse.ok("Products", q == null ? products.findAll() : products.findByNameContainingIgnoreCase(q));
    }

    @GetMapping("/all")
    public ApiResponse<List<Product>> allProducts() {
        return ApiResponse.ok("All Products", products.findAll());
    }

    @GetMapping("/top-rated")
    public ApiResponse<List<Product>> topRated() {
        return ApiResponse.ok("Top Rated Products", products.findByRatingGreaterThanEqual(4.5));
    }

    @GetMapping("/search")
    public ApiResponse<List<Product>> search(@RequestParam String q) {
        return ApiResponse.ok("Search results", products.findByNameContainingIgnoreCase(q));
    }

    @GetMapping("/category/{slug}")
    public ApiResponse<Map<String, List<Product>>> byCategorySlug(@PathVariable String slug) {
        Category category = categories.findBySlugIgnoreCase(slug);
        if (category == null) {
            return ApiResponse.ok("Category not found", Map.of());
        }

        List<Product> categoryProducts = products.findByCategory(category);
        Map<String, List<Product>> grouped = new HashMap<>();

        // Group by subType
        for (Product p : categoryProducts) {
            if (p.getSubType() != null && !p.getSubType().isEmpty()) {
                grouped.computeIfAbsent(p.getSubType(), k -> new ArrayList<>()).add(p);
            }
        }

        // Add top_rated under this category
        List<Product> topRated = categoryProducts.stream()
            .filter(p -> p.getRating() != null && p.getRating() >= 4.5)
            .collect(Collectors.toList());
        grouped.put("top_rated", topRated);

        // Add recommendations under this category
        List<Product> recommendations = categoryProducts.stream()
            .limit(10)
            .collect(Collectors.toList());
        grouped.put("recommendations", recommendations);

        return ApiResponse.ok("Category products grouped by sub-type", grouped);
    }

    @PostMapping("/update-stock")
    public ApiResponse<?> updateStock(@RequestBody Map<String, Object> reqBody) {
        String orderId = String.valueOf(reqBody.get("orderId"));
        // Call order-service directly on its port (8084) to get order items
        org.springframework.web.client.RestTemplate restTemplate = new org.springframework.web.client.RestTemplate();
        try {
            String url = "http://localhost:8084/api/orders/detail/" + orderId;
            
            // Invoke the order-service API
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restTemplate.getForObject(url, Map.class);
            if (response == null || !Boolean.TRUE.equals(response.get("success"))) {
                throw new IllegalArgumentException("Failed to retrieve order: " + orderId);
            }
            
            @SuppressWarnings("unchecked")
            Map<String, Object> orderData = (Map<String, Object>) response.get("data");
            if (orderData == null) {
                throw new IllegalArgumentException("Order data is null for order: " + orderId);
            }

            @SuppressWarnings("unchecked")
            List<Map<String, Object>> items = (List<Map<String, Object>>) orderData.get("items");
            if (items != null) {
                // Loop items and decrement stock
                for (Map<String, Object> item : items) {
                    String productId = String.valueOf(item.get("productId"));
                    int quantity = ((Number) item.get("quantity")).intValue();
                    productService.reduceStock(productId, quantity);
                }
            }
            
            Map<String, Object> result = new HashMap<>();
            result.put("success", true);
            result.put("inventoryUpdated", true);
            return ApiResponse.ok("Inventory updated successfully", result);
        } catch (Exception ex) {
            throw new IllegalArgumentException("Failed to update inventory stock: " + ex.getMessage());
        }
    }

    @GetMapping("/{id}")
    public ApiResponse<Product> byId(@PathVariable String id) {
        return ApiResponse.ok("Product", products.findById(id).orElseThrow(() -> new IllegalArgumentException("Product not found")));
    }

    // Creating products and categories is admin-only: see PartnerProductController (/api/products/admin).

    // @GetMapping("/lab-bookings")
    // public ApiResponse<List<LabTestBooking>> getAllLabBookings() {
    //     return ApiResponse.ok("All Lab Bookings", labTestBookingRepository.findAll());
    // }

    // @PostMapping("/lab-bookings")
    // public ApiResponse<LabTestBooking> createLabBooking(@RequestBody LabTestBooking booking) {
    //     return ApiResponse.ok("Lab Booking created successfully", labTestBookingRepository.save(booking));
    // }

    // @GetMapping("/lab-bookings/user/{userId}")
    // public ApiResponse<List<LabTestBooking>> getLabBookingsByUserId(@PathVariable String userId) {
    //     return ApiResponse.ok("User Lab Bookings", labTestBookingRepository.findByUserId(userId));
    // }
}
