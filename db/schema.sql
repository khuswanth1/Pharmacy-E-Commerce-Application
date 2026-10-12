-- Pharmacy app: MySQL schema for all five service databases (structure only, no data).
-- Each microservice owns one database. Hibernate (ddl-auto: update) also creates missing
-- tables and columns on startup, but it never changes existing columns, so enum
-- changes need a script in db/migrations/.
--
-- Load on a fresh server:   mysql -u root -p < db/schema.sql
-- Then apply migrations:    mysql -u root -p < db/migrations/<file>.sql

-- ---------------------------------------------------------------- pharmacy_auth
CREATE DATABASE IF NOT EXISTS `pharmacy_auth` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `pharmacy_auth`;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `auth_events` (
  `id` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `method` varchar(20) NOT NULL,
  `name` varchar(255) DEFAULT NULL,
  `occurred_at` datetime(6) NOT NULL,
  `role` varchar(255) DEFAULT NULL,
  `type` varchar(20) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_auth_events_at` (`occurred_at`),
  KEY `idx_auth_events_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `users` (
  `id` varchar(255) NOT NULL,
  `address` varchar(1000) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `email` varchar(255) NOT NULL,
  `enabled` bit(1) NOT NULL,
  `gender` enum('FEMALE','MALE','OTHER') DEFAULT NULL,
  `geolocation` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `password` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `picture` longtext,
  `provider` enum('GOOGLE','LOCAL') NOT NULL,
  `provider_id` varchar(255) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `wallet_balance` double NOT NULL,
  `partner_status` enum('APPROVED','PENDING','REJECTED','SUSPENDED') DEFAULT NULL,
  `last_login_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UK6dotkott2kjsp8vw4d0m25fb7` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `user_roles` (
  `user_id` varchar(255) NOT NULL,
  `role` enum('ROLE_ADMIN','ROLE_DELIVERY','ROLE_PHARMACIST','ROLE_USER','ROLE_VENDOR') DEFAULT NULL,
  KEY `FKhfh9dx7w3ubf1co1vdev94g3f` (`user_id`),
  CONSTRAINT `FKhfh9dx7w3ubf1co1vdev94g3f` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `user_addresses` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `building` varchar(255) DEFAULT NULL,
  `flat` varchar(255) DEFAULT NULL,
  `full_text` varchar(1000) DEFAULT NULL,
  `landmark` varchar(255) DEFAULT NULL,
  `lat` double DEFAULT NULL,
  `lng` double DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `is_primary` bit(1) DEFAULT NULL,
  `receiver_name` varchar(255) DEFAULT NULL,
  `type_tag` varchar(255) DEFAULT NULL,
  `user_id` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `partner_profiles` (
  `user_id` varchar(255) NOT NULL,
  `business_address` varchar(1000) DEFAULT NULL,
  `business_name` varchar(255) DEFAULT NULL,
  `city` varchar(255) DEFAULT NULL,
  `created_at` datetime(6) NOT NULL,
  `driving_license_number` varchar(255) DEFAULT NULL,
  `drug_license_number` varchar(255) DEFAULT NULL,
  `gstin` varchar(255) DEFAULT NULL,
  `online` bit(1) NOT NULL,
  `partner_role` enum('ROLE_ADMIN','ROLE_DELIVERY','ROLE_PHARMACIST','ROLE_USER','ROLE_VENDOR') NOT NULL,
  `pincode` varchar(255) DEFAULT NULL,
  `review_note` varchar(500) DEFAULT NULL,
  `reviewed_at` datetime(6) DEFAULT NULL,
  `vehicle_number` varchar(255) DEFAULT NULL,
  `vehicle_type` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `prescriptions` (
  `id` varchar(255) NOT NULL,
  `filename` varchar(255) DEFAULT NULL,
  `image_data` text,
  `uploaded_at` datetime(6) NOT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------- pharmacy_product
CREATE DATABASE IF NOT EXISTS `pharmacy_product` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `pharmacy_product`;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `category` (
  `id` varchar(255) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `slug` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `product` (
  `id` varchar(255) NOT NULL,
  `description` varchar(2000) DEFAULT NULL,
  `image_url` varchar(255) DEFAULT NULL,
  `mrp` decimal(38,2) DEFAULT NULL,
  `name` varchar(255) DEFAULT NULL,
  `prescription_required` bit(1) NOT NULL,
  `selling_price` decimal(38,2) DEFAULT NULL,
  `stock` int NOT NULL,
  `category_id` varchar(255) DEFAULT NULL,
  `brand` varchar(255) DEFAULT NULL,
  `composition` varchar(1000) DEFAULT NULL,
  `manufacturer` varchar(255) DEFAULT NULL,
  `pack_size` varchar(255) DEFAULT NULL,
  `rating` double DEFAULT NULL,
  `sub_type` varchar(255) DEFAULT NULL,
  `vendor_id` varchar(255) DEFAULT NULL,
  `vendor_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `lab_test_bookings` (
  `id` varchar(255) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `patient_name` varchar(255) DEFAULT NULL,
  `patient_phone` varchar(255) DEFAULT NULL,
  `price` double DEFAULT NULL,
  `selected_date` varchar(255) DEFAULT NULL,
  `selected_slot` varchar(255) DEFAULT NULL,
  `status` varchar(255) DEFAULT NULL,
  `test_name` varchar(255) DEFAULT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `payment_mode` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------- pharmacy_cart
CREATE DATABASE IF NOT EXISTS `pharmacy_cart` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `pharmacy_cart`;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `cart` (
  `id` varchar(255) NOT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `cart_item` (
  `cart_id` varchar(255) NOT NULL,
  `price` decimal(38,2) DEFAULT NULL,
  `product_id` varchar(255) DEFAULT NULL,
  `product_name` varchar(255) DEFAULT NULL,
  `quantity` int DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  KEY `FK1uobyhgl1wvgt1jpccia8xxs3` (`cart_id`),
  CONSTRAINT `FK1uobyhgl1wvgt1jpccia8xxs3` FOREIGN KEY (`cart_id`) REFERENCES `cart` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `coupons` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `active` bit(1) DEFAULT NULL,
  `code` varchar(255) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `discount_percentage` double NOT NULL,
  `expiry_date` datetime(6) DEFAULT NULL,
  `max_discount_amount` double NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UKeplt0kkm9yf2of2lnx6c1oy9b` (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `wishlist_items` (
  `id` varchar(255) NOT NULL,
  `added_at` datetime(6) DEFAULT NULL,
  `category` varchar(255) DEFAULT NULL,
  `cost` decimal(38,2) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `list_name` varchar(255) DEFAULT NULL,
  `price` decimal(38,2) DEFAULT NULL,
  `product_id` varchar(255) DEFAULT NULL,
  `product_name` varchar(255) DEFAULT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------- pharmacy_order
CREATE DATABASE IF NOT EXISTS `pharmacy_order` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `pharmacy_order`;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `orders` (
  `id` varchar(255) NOT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `status` enum('CANCELLED','CONFIRMED','CREATED','DELIVERED','FAILED','PACKED','PAID','SHIPPED') DEFAULT NULL,
  `total_amount` decimal(38,2) DEFAULT NULL,
  `user_id` varchar(255) DEFAULT NULL,
  `arrived_at` datetime(6) DEFAULT NULL,
  `delivery_address` varchar(255) DEFAULT NULL,
  `delivery_time_mins` varchar(255) DEFAULT NULL,
  `receiver_name` varchar(255) DEFAULT NULL,
  `receiver_phone` varchar(255) DEFAULT NULL,
  `address` varchar(1000) DEFAULT NULL,
  `delivery_instructions` varchar(1000) DEFAULT NULL,
  `phone_number` varchar(255) DEFAULT NULL,
  `accepted_at` datetime(6) DEFAULT NULL,
  `cancel_reason` varchar(500) DEFAULT NULL,
  `delivered_at` datetime(6) DEFAULT NULL,
  `delivery_otp` varchar(255) DEFAULT NULL,
  `delivery_partner_id` varchar(255) DEFAULT NULL,
  `delivery_partner_name` varchar(255) DEFAULT NULL,
  `delivery_partner_phone` varchar(255) DEFAULT NULL,
  `packed_at` datetime(6) DEFAULT NULL,
  `picked_up_at` datetime(6) DEFAULT NULL,
  `rider_lat` double DEFAULT NULL,
  `rider_lng` double DEFAULT NULL,
  `rider_location_at` datetime(6) DEFAULT NULL,
  `vendor_id` varchar(255) DEFAULT NULL,
  `vendor_name` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `order_item` (
  `id` varchar(255) NOT NULL,
  `price` decimal(38,2) DEFAULT NULL,
  `product_id` varchar(255) DEFAULT NULL,
  `product_name` varchar(255) DEFAULT NULL,
  `quantity` int NOT NULL,
  `image_key` varchar(255) DEFAULT NULL,
  `manufacturer` varchar(255) DEFAULT NULL,
  `original_price` decimal(38,2) DEFAULT NULL,
  `unit` varchar(255) DEFAULT NULL,
  `order_id` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `FKt4dc2r9nbvbujrljv3e23iibt` (`order_id`),
  CONSTRAINT `FKt4dc2r9nbvbujrljv3e23iibt` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `user_prescriptions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `image_url` longtext NOT NULL,
  `uploaded_at` datetime(6) NOT NULL,
  `user_id` varchar(255) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- ---------------------------------------------------------------- pharmacy_payment
CREATE DATABASE IF NOT EXISTS `pharmacy_payment` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `pharmacy_payment`;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE IF NOT EXISTS `payments` (
  `id` varchar(255) NOT NULL,
  `amount` decimal(38,2) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  `currency` varchar(255) DEFAULT NULL,
  `order_id` varchar(255) DEFAULT NULL,
  `payment_method` varchar(255) DEFAULT NULL,
  `payment_status` enum('FAILED','PENDING','REFUNDED','SUCCESS') DEFAULT NULL,
  `razorpay_order_id` varchar(255) DEFAULT NULL,
  `razorpay_payment_id` varchar(255) DEFAULT NULL,
  `razorpay_signature` varchar(255) DEFAULT NULL,
  `updated_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
