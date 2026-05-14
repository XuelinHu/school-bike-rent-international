CREATE DATABASE IF NOT EXISTS student_bike_rental DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE student_bike_rental;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  email VARCHAR(120),
  phone VARCHAR(30),
  role ENUM('student','admin','staff') NOT NULL DEFAULT 'student',
  student_no VARCHAR(50),
  nationality VARCHAR(80),
  language VARCHAR(20) DEFAULT 'zh-CN',
  status ENUM('active','disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stations (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  name_zh VARCHAR(120) NOT NULL,
  name_en VARCHAR(120) NOT NULL,
  address_zh VARCHAR(255),
  address_en VARCHAR(255),
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  capacity INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bikes (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  bike_no VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(120),
  type VARCHAR(60),
  status ENUM('available','rented','maintenance','disabled') NOT NULL DEFAULT 'available',
  station_id BIGINT,
  hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 2.00,
  image_url VARCHAR(500),
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_bikes_station FOREIGN KEY (station_id) REFERENCES stations(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS rental_orders (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  order_no VARCHAR(80) NOT NULL UNIQUE,
  user_id BIGINT NOT NULL,
  bike_id BIGINT NOT NULL,
  start_time DATETIME NOT NULL,
  end_time DATETIME,
  duration_hours INT,
  hourly_rate DECIMAL(10,2) NOT NULL DEFAULT 2.00,
  total_amount DECIMAL(10,2) DEFAULT 0,
  status ENUM('renting','completed','cancelled') NOT NULL DEFAULT 'renting',
  start_station_id BIGINT,
  end_station_id BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_orders_bike FOREIGN KEY (bike_id) REFERENCES bikes(id),
  INDEX idx_orders_user_status (user_id, status)
);

CREATE TABLE IF NOT EXISTS maintenance_records (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  bike_id BIGINT NOT NULL,
  staff_id BIGINT,
  content TEXT NOT NULL,
  status ENUM('processing','finished') NOT NULL DEFAULT 'processing',
  start_time DATETIME,
  end_time DATETIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_maintenance_bike FOREIGN KEY (bike_id) REFERENCES bikes(id),
  CONSTRAINT fk_maintenance_staff FOREIGN KEY (staff_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  title_zh VARCHAR(200) NOT NULL,
  title_en VARCHAR(200) NOT NULL,
  content_zh TEXT NOT NULL,
  content_en TEXT NOT NULL,
  status ENUM('published','hidden') NOT NULL DEFAULT 'published',
  created_by BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_announcements_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);
