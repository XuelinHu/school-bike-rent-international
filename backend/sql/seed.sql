INSERT INTO stations (name_zh, name_en, address_zh, address_en, latitude, longitude, capacity)
SELECT '主教学楼站', 'Main Building Station', '主教学楼东门', 'East gate of Main Building', 31.2304000, 121.4737000, 40
WHERE NOT EXISTS (SELECT 1 FROM stations WHERE name_en = 'Main Building Station')
UNION ALL
SELECT '国际学生公寓站', 'International Dormitory Station', '国际学生公寓入口', 'Entrance of International Dormitory', 31.2311000, 121.4750000, 30
WHERE NOT EXISTS (SELECT 1 FROM stations WHERE name_en = 'International Dormitory Station')
UNION ALL
SELECT '图书馆站', 'Library Station', '图书馆南广场', 'South square of Library', 31.2298000, 121.4729000, 35
WHERE NOT EXISTS (SELECT 1 FROM stations WHERE name_en = 'Library Station');

INSERT INTO bikes (bike_no, name, type, status, station_id, hourly_rate, image_url, description) VALUES
('BIKE-1001', 'Campus Bike 1001', 'standard', 'available', 1, 2.00, '', 'Standard campus rental bike'),
('BIKE-1002', 'Campus Bike 1002', 'standard', 'available', 1, 2.00, '', 'Standard campus rental bike'),
('BIKE-2001', 'City Bike 2001', 'city', 'available', 2, 3.00, '', 'Comfort city bike'),
('BIKE-3001', 'Maintenance Bike 3001', 'standard', 'maintenance', 3, 2.00, '', 'Bike waiting for maintenance')
ON DUPLICATE KEY UPDATE name=VALUES(name), status=VALUES(status);

INSERT INTO announcements (title_zh, title_en, content_zh, content_en, status, created_by)
SELECT '欢迎使用校园单车租赁系统', 'Welcome to Campus Bike Rental', '请遵守校园骑行规则，按时归还车辆。', 'Please follow campus riding rules and return bikes on time.', 'published', NULL
WHERE NOT EXISTS (SELECT 1 FROM announcements WHERE title_en = 'Welcome to Campus Bike Rental')
UNION ALL
SELECT '雨天骑行提醒', 'Rainy Day Riding Notice', '雨天路滑，请降低车速并注意安全。', 'Roads may be slippery on rainy days. Please slow down and ride safely.', 'published', NULL
WHERE NOT EXISTS (SELECT 1 FROM announcements WHERE title_en = 'Rainy Day Riding Notice');

-- 初始化用户请运行：npm run seed
-- admin/admin123456, student/student123456, staff/staff123456 会以 bcrypt hash 写入。
