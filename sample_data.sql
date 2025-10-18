-- Sample Data for Campus Carbon Tracker
-- Demonstrates data insertion and realistic test scenarios

-- Insert sample buildings
INSERT INTO buildings (name, sq_footage, primary_use, location_gps) VALUES
('Engineering Building', 45000, 'Academic', POINT(40.7128, -74.0060)),
('Student Center', 32000, 'Student Services', POINT(40.7130, -74.0058)),
('Library', 28000, 'Academic', POINT(40.7125, -74.0062)),
('Science Hall', 38000, 'Academic', POINT(40.7132, -74.0055)),
('Administration Building', 15000, 'Administrative', POINT(40.7127, -74.0065)),
('Dormitory A', 55000, 'Residential', POINT(40.7135, -74.0050)),
('Dormitory B', 52000, 'Residential', POINT(40.7138, -74.0048)),
('Cafeteria', 18000, 'Dining', POINT(40.7129, -74.0059)),
('Gymnasium', 25000, 'Recreation', POINT(40.7124, -74.0067)),
('Research Center', 42000, 'Research', POINT(40.7133, -74.0053));

-- Insert sample users (passwords are hashed version of 'password123')
INSERT INTO users (email, password_hash, role, department, first_name, last_name) VALUES
('admin@university.edu', '$2b$10$rQZ8kJwQZ8kJwQZ8kJwQZOq', 'admin', 'IT Services', 'John', 'Administrator'),
('jane.doe@university.edu', '$2b$10$rQZ8kJwQZ8kJwQZ8kJwQZOq', 'user', 'Computer Science', 'Jane', 'Doe'),
('bob.smith@university.edu', '$2b$10$rQZ8kJwQZ8kJwQZ8kJwQZOq', 'user', 'Environmental Science', 'Bob', 'Smith'),
('alice.johnson@university.edu', '$2b$10$rQZ8kJwQZ8kJwQZ8kJwQZOq', 'user', 'Engineering', 'Alice', 'Johnson'),
('mike.wilson@university.edu', '$2b$10$rQZ8kJwQZ8kJwQZ8kJwQZOq', 'user', 'Biology', 'Mike', 'Wilson'),
('sarah.brown@university.edu', '$2b$10$rQZ8kJwQZ8kJwQZ8kJwQZOq', 'user', 'Chemistry', 'Sarah', 'Brown'),
('david.lee@university.edu', '$2b$10$rQZ8kJwQZ8kJwQZ8kJwQZOq', 'user', 'Physics', 'David', 'Lee'),
('emma.davis@university.edu', '$2b$10$rQZ8kJwQZ8kJwQZ8kJwQZOq', 'user', 'Mathematics', 'Emma', 'Davis'),
('chris.taylor@university.edu', '$2b$10$rQZ8kJwQZ8kJwQZ8kJwQZOq', 'user', 'Business', 'Chris', 'Taylor'),
('lisa.garcia@university.edu', '$2b$10$rQZ8kJwQZ8kJwQZ8kJwQZOq', 'user', 'Psychology', 'Lisa', 'Garcia');

-- Insert sample energy consumption data (last 6 months)
-- This demonstrates the relationship between buildings and energy consumption
WITH building_ids AS (
    SELECT building_id, name FROM buildings
),
date_series AS (
    SELECT generate_series(
        CURRENT_DATE - INTERVAL '6 months',
        CURRENT_DATE,
        INTERVAL '1 day'
    )::date as consumption_date
)
INSERT INTO energy_consumption (building_id, date_time, source, consumption_kwh)
SELECT 
    b.building_id,
    d.consumption_date + (INTERVAL '1 hour' * (8 + (random() * 12)::int)), -- Random hour between 8 AM and 8 PM
    sources.source,
    CASE 
        WHEN sources.source = 'electricity' THEN 
            CASE b.name
                WHEN 'Engineering Building' THEN 800 + (random() * 400)::numeric
                WHEN 'Student Center' THEN 600 + (random() * 300)::numeric
                WHEN 'Library' THEN 400 + (random() * 200)::numeric
                WHEN 'Science Hall' THEN 700 + (random() * 350)::numeric
                WHEN 'Administration Building' THEN 200 + (random() * 100)::numeric
                WHEN 'Dormitory A' THEN 900 + (random() * 450)::numeric
                WHEN 'Dormitory B' THEN 850 + (random() * 425)::numeric
                WHEN 'Cafeteria' THEN 500 + (random() * 250)::numeric
                WHEN 'Gymnasium' THEN 300 + (random() * 150)::numeric
                WHEN 'Research Center' THEN 750 + (random() * 375)::numeric
            END
        WHEN sources.source = 'gas' THEN 
            CASE b.name
                WHEN 'Engineering Building' THEN 200 + (random() * 100)::numeric
                WHEN 'Student Center' THEN 150 + (random() * 75)::numeric
                WHEN 'Library' THEN 100 + (random() * 50)::numeric
                WHEN 'Science Hall' THEN 180 + (random() * 90)::numeric
                WHEN 'Administration Building' THEN 80 + (random() * 40)::numeric
                WHEN 'Dormitory A' THEN 250 + (random() * 125)::numeric
                WHEN 'Dormitory B' THEN 240 + (random() * 120)::numeric
                WHEN 'Cafeteria' THEN 300 + (random() * 150)::numeric
                WHEN 'Gymnasium' THEN 120 + (random() * 60)::numeric
                WHEN 'Research Center' THEN 160 + (random() * 80)::numeric
            END
    END
FROM building_ids b
CROSS JOIN date_series d
CROSS JOIN (VALUES ('electricity'), ('gas')) AS sources(source)
WHERE random() > 0.1; -- Skip some records to make data more realistic

-- Insert sample transportation logs
WITH user_ids AS (
    SELECT user_id FROM users WHERE role = 'user'
),
date_series AS (
    SELECT generate_series(
        CURRENT_DATE - INTERVAL '3 months',
        CURRENT_DATE,
        INTERVAL '1 day'
    )::date as trip_date
)
INSERT INTO transportation_log (user_id, date, mode, distance_km)
SELECT 
    u.user_id,
    d.trip_date,
    modes.mode,
    CASE modes.mode
        WHEN 'car' THEN 5 + (random() * 25)::numeric
        WHEN 'bus' THEN 8 + (random() * 15)::numeric
        WHEN 'bike' THEN 2 + (random() * 8)::numeric
        WHEN 'walk' THEN 0.5 + (random() * 3)::numeric
        WHEN 'metro' THEN 12 + (random() * 20)::numeric
        WHEN 'train' THEN 25 + (random() * 50)::numeric
        WHEN 'air' THEN 200 + (random() * 800)::numeric
    END
FROM user_ids u
CROSS JOIN date_series d
CROSS JOIN (
    VALUES 
        ('car', 0.3),
        ('bus', 0.25),
        ('bike', 0.2),
        ('walk', 0.15),
        ('metro', 0.08),
        ('train', 0.015),
        ('air', 0.005)
) AS modes(mode, probability)
WHERE random() < modes.probability
AND random() > 0.7; -- Only create trips for some days

-- Insert sample initiatives
INSERT INTO initiatives (name, description, target_reduction_tco2e, actual_reduction_tco2e, status, start_date, end_date, created_by) VALUES
(
    'LED Lighting Upgrade',
    'Replace all fluorescent lighting with energy-efficient LED bulbs across campus buildings',
    15.5,
    12.3,
    'completed',
    '2024-01-15',
    '2024-06-30',
    (SELECT user_id FROM users WHERE role = 'admin' LIMIT 1)
),
(
    'Solar Panel Installation',
    'Install solar panels on rooftops of major academic buildings to reduce grid electricity dependency',
    45.2,
    0,
    'active',
    '2024-07-01',
    '2025-03-31',
    (SELECT user_id FROM users WHERE role = 'admin' LIMIT 1)
),
(
    'Campus Bike Share Program',
    'Implement a bike sharing system to reduce car usage for short-distance campus travel',
    8.7,
    2.1,
    'active',
    '2024-09-01',
    '2025-05-31',
    (SELECT user_id FROM users WHERE role = 'admin' LIMIT 1)
),
(
    'Smart HVAC System',
    'Upgrade heating and cooling systems with smart controls and improved insulation',
    25.8,
    0,
    'planned',
    '2025-01-15',
    '2025-12-31',
    (SELECT user_id FROM users WHERE role = 'admin' LIMIT 1)
),
(
    'Green Transportation Incentives',
    'Provide incentives for students and staff to use public transportation and carpooling',
    12.4,
    0,
    'planned',
    '2025-02-01',
    '2025-12-31',
    (SELECT user_id FROM users WHERE role = 'admin' LIMIT 1)
),
(
    'Waste Reduction Program',
    'Implement comprehensive recycling and composting programs to reduce waste-related emissions',
    6.3,
    1.8,
    'active',
    '2024-08-15',
    '2025-08-14',
    (SELECT user_id FROM users WHERE role = 'admin' LIMIT 1)
),
(
    'Energy Monitoring Dashboard',
    'Deploy real-time energy monitoring systems in all buildings for better consumption tracking',
    5.2,
    5.2,
    'completed',
    '2024-03-01',
    '2024-08-31',
    (SELECT user_id FROM users WHERE role = 'admin' LIMIT 1)
);

-- Create some additional sample data for demonstration purposes

-- Add more recent energy consumption data for current month
INSERT INTO energy_consumption (building_id, date_time, source, consumption_kwh)
SELECT 
    building_id,
    CURRENT_TIMESTAMP - (INTERVAL '1 hour' * generate_series(1, 24 * 7)), -- Last week hourly data
    'electricity',
    CASE name
        WHEN 'Engineering Building' THEN 900 + (random() * 200)::numeric
        WHEN 'Student Center' THEN 650 + (random() * 150)::numeric
        WHEN 'Library' THEN 450 + (random() * 100)::numeric
        WHEN 'Science Hall' THEN 750 + (random() * 175)::numeric
        WHEN 'Administration Building' THEN 220 + (random() * 50)::numeric
        WHEN 'Dormitory A' THEN 950 + (random() * 225)::numeric
        WHEN 'Dormitory B' THEN 900 + (random() * 200)::numeric
        WHEN 'Cafeteria' THEN 550 + (random() * 125)::numeric
        WHEN 'Gymnasium' THEN 320 + (random() * 75)::numeric
        WHEN 'Research Center' THEN 800 + (random() * 180)::numeric
    END
FROM buildings;

-- Add some recent transportation data
INSERT INTO transportation_log (user_id, date, mode, distance_km)
SELECT 
    user_id,
    CURRENT_DATE - (generate_series(0, 6)), -- Last week
    (ARRAY['car', 'bus', 'bike', 'walk', 'metro'])[floor(random() * 5 + 1)],
    2 + (random() * 20)::numeric
FROM users 
WHERE role = 'user'
AND random() > 0.3;
