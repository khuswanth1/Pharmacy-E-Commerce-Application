package com.pharmacy.product.controller;

import java.util.List;

import org.springframework.web.bind.annotation.*;

import com.pharmacy.common.ApiResponse;
import com.pharmacy.product.dto.ProductForm;
import com.pharmacy.product.entity.Category;
import com.pharmacy.product.entity.Product;
import com.pharmacy.product.repo.CategoryRepository;
import com.pharmacy.product.repo.ProductRepository;
import com.pharmacy.product.service.ProductService;

/**
 * Catalogue management for vendors (/api/products/vendor, own products only) and
 * admins (/api/products/admin, every product). The gateway enforces the role and
 * sets X-User-Id.
 */
@RestController
@RequestMapping("/api/products")
public class PartnerProductController {
    private final ProductService productService;
    private final ProductRepository products;
    private final CategoryRepository categories;

    public PartnerProductController(ProductService productService, ProductRepository products,
                                    CategoryRepository categories) {
        this.productService = productService;
        this.products = products;
        this.categories = categories;
    }

    @GetMapping("/categories/list")
    public ApiResponse<List<Category>> categoryList() {
        return ApiResponse.ok("Categories", categories.findAll());
    }

    // ---------------------------------------------------------------- Vendor

    @GetMapping("/vendor/mine")
    public ApiResponse<List<Product>> mine(@RequestHeader("X-User-Id") String vendorId) {
        return ApiResponse.ok("Your products", productService.byVendor(vendorId));
    }

    @PostMapping("/vendor")
    public ApiResponse<Product> vendorCreate(@RequestHeader("X-User-Id") String vendorId,
                                             @RequestBody ProductForm form) {
        return ApiResponse.ok("Product listed", productService.create(form, vendorId));
    }

    @PutMapping("/vendor/{id}")
    public ApiResponse<Product> vendorUpdate(@RequestHeader("X-User-Id") String vendorId,
                                             @PathVariable String id, @RequestBody ProductForm form) {
        return ApiResponse.ok("Product updated", productService.update(id, form, vendorId));
    }

    @DeleteMapping("/vendor/{id}")
    public ApiResponse<Void> vendorDelete(@RequestHeader("X-User-Id") String vendorId, @PathVariable String id) {
        productService.delete(id, vendorId);
        return ApiResponse.ok("Product removed", null);
    }

    // ----------------------------------------------------------------- Admin

    @GetMapping("/admin/all")
    public ApiResponse<List<Product>> adminAll() {
        return ApiResponse.ok("All products", products.findAll());
    }

    @GetMapping("/admin/low-stock")
    public ApiResponse<List<Product>> lowStock(@RequestParam(defaultValue = "10") int threshold) {
        return ApiResponse.ok("Low stock", productService.lowStock(threshold));
    }

    @PostMapping("/admin/categories")
    public ApiResponse<Category> adminCreateCategory(@RequestBody Category c) {
        return ApiResponse.ok("Category created", categories.save(c));
    }

    @PostMapping("/admin")
    public ApiResponse<Product> adminCreate(@RequestBody ProductForm form) {
        return ApiResponse.ok("Product created", productService.create(form, null));
    }

    @PutMapping("/admin/{id}")
    public ApiResponse<Product> adminUpdate(@PathVariable String id, @RequestBody ProductForm form) {
        return ApiResponse.ok("Product updated", productService.update(id, form, null));
    }

    @DeleteMapping("/admin/{id}")
    public ApiResponse<Void> adminDelete(@PathVariable String id) {
        productService.delete(id, null);
        return ApiResponse.ok("Product removed", null);
    }
}
