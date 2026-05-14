import bcrypt from 'bcryptjs';
import { pool, tx } from '../config/db.js';

const demoUsers = [
  ['admin', 'admin123456', '系统管理员', 'admin', 'admin@example.local', '13800000000', null, 'China'],
  ['student', 'student123456', '张同学', 'student', 'student@example.local', '13800000001', 'S20260001', 'China'],
  ['staff', 'staff123456', '维修人员', 'staff', 'staff@example.local', '13800000002', null, 'China'],
  ['lihua', 'student123456', '李华', 'student', 'lihua@example.local', '13800000003', 'S20260002', 'China'],
  ['emma', 'student123456', 'Emma Smith', 'student', 'emma@example.local', '13800000004', 'S20260003', 'United Kingdom'],
  ['akiko', 'student123456', 'Akiko Tanaka', 'student', 'akiko@example.local', '13800000005', 'S20260004', 'Japan']
];

const stations = [
  ['主教学楼站', 'Main Building Station', '主教学楼东门', 'East gate of Main Building', 31.2304, 121.4737, 40],
  ['国际学生公寓站', 'International Dormitory Station', '国际学生公寓入口', 'Entrance of International Dormitory', 31.2311, 121.4750, 30],
  ['图书馆站', 'Library Station', '图书馆南广场', 'South square of Library', 31.2298, 121.4729, 35],
  ['体育馆站', 'Gymnasium Station', '体育馆北侧', 'North side of Gymnasium', 31.2287, 121.4718, 26],
  ['实验楼站', 'Laboratory Building Station', '实验楼西门', 'West gate of Laboratory Building', 31.2320, 121.4762, 22]
];

const bikes = [
  ['BIKE-1001', 'Campus Bike 1001', 'standard', 'available', 1, 2, '标准校园单车'],
  ['BIKE-1002', 'Campus Bike 1002', 'standard', 'available', 1, 2, '标准校园单车'],
  ['BIKE-1003', 'Campus Bike 1003', 'standard', 'available', 1, 2, '标准校园单车'],
  ['BIKE-2001', 'City Bike 2001', 'city', 'available', 2, 3, '舒适城市通勤车'],
  ['BIKE-2002', 'City Bike 2002', 'city', 'available', 2, 3, '舒适城市通勤车'],
  ['BIKE-3001', 'Maintenance Bike 3001', 'standard', 'maintenance', 3, 2, '待维护车辆'],
  ['BIKE-4001', 'Sport Bike 4001', 'sport', 'available', 4, 4, '轻量运动单车'],
  ['BIKE-5001', 'Campus Bike 5001', 'standard', 'disabled', 5, 2, '停用测试车辆']
];

await tx(async (conn) => {
  for (const [username, password, name, role, email, phone, studentNo, nationality] of demoUsers) {
    const hash = await bcrypt.hash(password, 10);
    await conn.execute(
      `INSERT INTO users (username,password,name,email,phone,role,student_no,nationality,language,status)
       VALUES (?,?,?,?,?,?,?,?, 'zh-CN', 'active')
       ON DUPLICATE KEY UPDATE password=VALUES(password), name=VALUES(name), email=VALUES(email), phone=VALUES(phone),
       role=VALUES(role), student_no=VALUES(student_no), nationality=VALUES(nationality), status='active'`,
      [username, hash, name, email, phone, role, studentNo, nationality]
    );
  }

  for (const station of stations) {
    await conn.execute(
      `INSERT INTO stations (name_zh,name_en,address_zh,address_en,latitude,longitude,capacity)
       SELECT ?,?,?,?,?,?,?
       WHERE NOT EXISTS (SELECT 1 FROM stations WHERE name_en=?)`,
      [...station, station[1]]
    );
  }

  for (const [bikeNo, name, type, status, stationId, rate, description] of bikes) {
    await conn.execute(
      `INSERT INTO bikes (bike_no,name,type,status,station_id,hourly_rate,image_url,description)
       VALUES (?,?,?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), type=VALUES(type), status=VALUES(status), station_id=VALUES(station_id),
       hourly_rate=VALUES(hourly_rate), description=VALUES(description)`,
      [bikeNo, name, type, status, stationId, rate, '', description]
    );
  }

  await conn.execute(
    `INSERT INTO maintenance_records (bike_id, staff_id, content, status, start_time)
     SELECT b.id, u.id, '刹车系统检查与车铃更换', 'processing', DATE_SUB(NOW(), INTERVAL 2 HOUR)
     FROM bikes b JOIN users u ON u.username='staff'
     WHERE b.bike_no='BIKE-3001'
       AND NOT EXISTS (SELECT 1 FROM maintenance_records m WHERE m.bike_id=b.id AND m.status='processing')`
  );

  await conn.execute(
    `INSERT INTO rental_orders (order_no,user_id,bike_id,start_time,end_time,duration_hours,hourly_rate,total_amount,status,start_station_id,end_station_id)
     SELECT 'RO-DEMO-001', u.id, b.id, DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR), 2, b.hourly_rate, b.hourly_rate * 2, 'completed', 1, 2
     FROM users u JOIN bikes b ON b.bike_no='BIKE-1002'
     WHERE u.username='student'
       AND NOT EXISTS (SELECT 1 FROM rental_orders WHERE order_no='RO-DEMO-001')`
  );

  await conn.execute(
    `INSERT INTO rental_orders (order_no,user_id,bike_id,start_time,end_time,duration_hours,hourly_rate,total_amount,status,start_station_id,end_station_id)
     SELECT 'RO-DEMO-002', u.id, b.id, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 22 HOUR), 2, b.hourly_rate, b.hourly_rate * 2, 'completed', 2, 3
     FROM users u JOIN bikes b ON b.bike_no='BIKE-2001'
     WHERE u.username='emma'
       AND NOT EXISTS (SELECT 1 FROM rental_orders WHERE order_no='RO-DEMO-002')`
  );

  await conn.execute(
    `INSERT INTO announcements (title_zh,title_en,content_zh,content_en,status,created_by)
     SELECT '国际学生骑行安全周', 'International Student Cycling Safety Week',
            '本周将在主教学楼站开展骑行安全宣传，请同学们合理规划用车时间。',
            'A cycling safety campaign will be held at the Main Building Station this week. Please plan your rentals accordingly.',
            'published', u.id
     FROM users u
     WHERE u.username='admin'
       AND NOT EXISTS (SELECT 1 FROM announcements WHERE title_en='International Student Cycling Safety Week')`
  );
});

console.log('Demo data seeded.');
await pool.end();
