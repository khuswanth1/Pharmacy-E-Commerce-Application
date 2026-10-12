package com.pharmacy.product.repo;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import com.pharmacy.product.entity.Category;
import com.pharmacy.product.entity.Product;

public interface ProductRepository extends JpaRepository<Product, String> {
    List<Product> findByNameContainingIgnoreCase(String q);
    List<Product> findByCategory(Category category);
    List<Product> findByRatingGreaterThanEqual(double rating);
    List<Product> findByVendorIdOrderByNameAsc(String vendorId);
    List<Product> findByStockLessThanEqualOrderByStockAsc(int stock);
}
