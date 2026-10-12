-- Widen enum columns that Hibernate (ddl-auto: update) will not alter on its own.
-- Safe to re-run: MODIFY to a superset keeps every existing value.

-- Vendor and delivery-partner accounts (Role.ROLE_VENDOR, Role.ROLE_DELIVERY).
ALTER TABLE pharmacy_auth.user_roles
  MODIFY COLUMN `role` ENUM('ROLE_ADMIN','ROLE_DELIVERY','ROLE_PHARMACIST','ROLE_USER','ROLE_VENDOR') DEFAULT NULL;

-- Every OrderStatus value. PAID and FAILED were missing, so marking an order paid failed.
ALTER TABLE pharmacy_order.orders
  MODIFY COLUMN `status` ENUM('CANCELLED','CONFIRMED','CREATED','DELIVERED','FAILED','PACKED','PAID','SHIPPED') DEFAULT NULL;
