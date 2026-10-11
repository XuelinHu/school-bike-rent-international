INSERT INTO stations (name_zh, name_en, address_zh, address_en, latitude, longitude, capacity)
SELECT seed.name_zh, seed.name_en, seed.address_zh, seed.address_en, seed.latitude, seed.longitude, seed.capacity
FROM (VALUES
  ('主教学楼站', 'Main Building Station', '主教学楼东门', 'East gate of Main Building', 31.2304000, 121.4737000, 40),
  ('国际学生公寓站', 'International Dormitory Station', '国际学生公寓入口', 'Entrance of International Dormitory', 31.2311000, 121.4750000, 30),
  ('图书馆站', 'Library Station', '图书馆南广场', 'South square of Library', 31.2298000, 121.4729000, 35)
) AS seed(name_zh, name_en, address_zh, address_en, latitude, longitude, capacity)
WHERE NOT EXISTS (SELECT 1 FROM stations existing WHERE existing.name_en = seed.name_en);

INSERT INTO bikes (bike_no, name, type, status, station_id, hourly_rate, image_url, description)
SELECT seed.bike_no, seed.name, seed.type, seed.status, stations.id, seed.hourly_rate, '', seed.description
FROM (VALUES
  ('BIKE-1001', 'Campus Bike 1001', 'standard', 'available', 'Main Building Station', 2.00, 'Standard campus rental bike'),
  ('BIKE-1002', 'Campus Bike 1002', 'standard', 'available', 'Main Building Station', 2.00, 'Standard campus rental bike'),
  ('BIKE-2001', 'City Bike 2001', 'city', 'available', 'International Dormitory Station', 3.00, 'Comfort city bike'),
  ('BIKE-3001', 'Maintenance Bike 3001', 'standard', 'maintenance', 'Library Station', 2.00, 'Bike waiting for maintenance')
) AS seed(bike_no, name, type, status, station_name, hourly_rate, description)
LEFT JOIN stations ON stations.name_en = seed.station_name
ON CONFLICT (bike_no) DO UPDATE SET name = EXCLUDED.name, status = EXCLUDED.status;

INSERT INTO announcements (title_zh, title_en, content_zh, content_en, status, created_by)
SELECT seed.title_zh, seed.title_en, seed.content_zh, seed.content_en, 'published', NULL
FROM (VALUES
  ('欢迎使用校园单车租赁系统', 'Welcome to Campus Bike Rental', '请遵守校园骑行规则，按时归还车辆。', 'Please follow campus riding rules and return bikes on time.'),
  ('雨天骑行提醒', 'Rainy Day Riding Notice', '雨天路滑，请降低车速并注意安全。', 'Roads may be slippery on rainy days. Please slow down and ride safely.')
) AS seed(title_zh, title_en, content_zh, content_en)
WHERE NOT EXISTS (SELECT 1 FROM announcements existing WHERE existing.title_en = seed.title_en);
