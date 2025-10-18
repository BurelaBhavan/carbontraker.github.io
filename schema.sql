-- Campus Carbon Tracker Database Schema
-- Demonstrates DBMS concepts: Normalization (3NF), Relationships, Constraints, Indexing

-- Enable UUID extension for PostgreSQL
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop tables if they exist (for development)
DROP TABLE IF EXISTS transportation_log CASCADE;
DROP TABLE IF EXISTS energy_consumption CASCADE;
DROP TABLE IF EXISTS initiatives CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS buildings CASCADE;

-- BUILDINGS Table (Campus Infrastructure)
-- Demonstrates: Primary Key, Data Types, Constraints
CREATE TABLE buildings (
    building_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    sq_footage INTEGER NOT NULL CHECK (sq_footage > 0),
    primary_use VARCHAR(50) NOT NULL,
    location_gps POINT, -- PostgreSQL geometric type for GPS coordinates
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- USERS Table (Students/Staff Authentication)
-- Demonstrates: User Authentication, Indexing, Unique Constraints
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'user', 'guest')),
    department VARCHAR(100),
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index on email for fast login queries
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ENERGY_CONSUMPTION Table (Scope 1 & 2 Data)
-- Demonstrates: Foreign Key, Referential Integrity, Calculated Fields
CREATE TABLE energy_consumption (
    record_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    building_id UUID NOT NULL,
    date_time TIMESTAMP NOT NULL,
    source VARCHAR(20) NOT NULL CHECK (source IN ('electricity', 'gas', 'fuel', 'steam')),
    consumption_kwh DECIMAL(10,2) NOT NULL CHECK (consumption_kwh >= 0),
    co2e_emitted DECIMAL(10,4) GENERATED ALWAYS AS (
        CASE 
            WHEN source = 'electricity' THEN consumption_kwh * 0.0004 -- kg CO2e per kWh
            WHEN source = 'gas' THEN consumption_kwh * 0.0002
            WHEN source = 'fuel' THEN consumption_kwh * 0.0003
            WHEN source = 'steam' THEN consumption_kwh * 0.0001
            ELSE 0
        END
    ) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Key Constraint
    CONSTRAINT fk_energy_building 
        FOREIGN KEY (building_id) 
        REFERENCES buildings(building_id) 
        ON DELETE CASCADE
);

-- Create indexes for performance on frequently queried columns
CREATE INDEX idx_energy_building_id ON energy_consumption(building_id);
CREATE INDEX idx_energy_date_time ON energy_consumption(date_time);
CREATE INDEX idx_energy_source ON energy_consumption(source);

-- TRANSPORTATION_LOG Table (Scope 3 Data)
-- Demonstrates: Data Insertion & Transaction, User-submitted data
CREATE TABLE transportation_log (
    trip_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    date DATE NOT NULL,
    mode VARCHAR(20) NOT NULL CHECK (mode IN ('car', 'bus', 'bike', 'walk', 'air', 'train', 'metro')),
    distance_km DECIMAL(8,2) NOT NULL CHECK (distance_km >= 0),
    co2e_emitted DECIMAL(8,4) GENERATED ALWAYS AS (
        CASE 
            WHEN mode = 'car' THEN distance_km * 0.21 -- kg CO2e per km
            WHEN mode = 'bus' THEN distance_km * 0.08
            WHEN mode = 'air' THEN distance_km * 0.25
            WHEN mode = 'train' THEN distance_km * 0.04
            WHEN mode = 'metro' THEN distance_km * 0.03
            WHEN mode IN ('bike', 'walk') THEN 0
            ELSE distance_km * 0.15
        END
    ) STORED,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Key Constraint
    CONSTRAINT fk_transport_user 
        FOREIGN KEY (user_id) 
        REFERENCES users(user_id) 
        ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX idx_transport_user_id ON transportation_log(user_id);
CREATE INDEX idx_transport_date ON transportation_log(date);
CREATE INDEX idx_transport_mode ON transportation_log(mode);

-- INITIATIVES Table (Reduction Projects)
-- Demonstrates: Data Aggregation for Reporting, Status tracking
CREATE TABLE initiatives (
    initiative_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    target_reduction_tco2e DECIMAL(10,2) CHECK (target_reduction_tco2e >= 0),
    actual_reduction_tco2e DECIMAL(10,2) DEFAULT 0 CHECK (actual_reduction_tco2e >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'active', 'completed', 'cancelled')),
    start_date DATE,
    end_date DATE,
    created_by UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign Key to track who created the initiative
    CONSTRAINT fk_initiative_creator 
        FOREIGN KEY (created_by) 
        REFERENCES users(user_id) 
        ON DELETE SET NULL,
    
    -- Check constraint to ensure end_date is after start_date
    CONSTRAINT chk_initiative_dates 
        CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);

-- Create indexes
CREATE INDEX idx_initiatives_status ON initiatives(status);
CREATE INDEX idx_initiatives_created_by ON initiatives(created_by);

-- Create triggers to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers to tables
CREATE TRIGGER update_buildings_updated_at 
    BEFORE UPDATE ON buildings 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_initiatives_updated_at 
    BEFORE UPDATE ON initiatives 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Views for common queries (Demonstrates Advanced SQL)

-- Campus Overview View (for public dashboard)
CREATE VIEW campus_overview AS
SELECT 
    (SELECT COUNT(*) FROM buildings) as total_buildings,
    (SELECT COALESCE(SUM(co2e_emitted), 0) FROM energy_consumption 
     WHERE date_time >= CURRENT_DATE - INTERVAL '1 year') as annual_energy_co2e,
    (SELECT COALESCE(SUM(co2e_emitted), 0) FROM transportation_log 
     WHERE date >= CURRENT_DATE - INTERVAL '1 year') as annual_transport_co2e,
    (SELECT COUNT(*) FROM initiatives WHERE status = 'active') as active_initiatives;

-- Building Performance View (for admin reporting)
CREATE VIEW building_performance AS
SELECT 
    b.building_id,
    b.name,
    b.sq_footage,
    b.primary_use,
    COALESCE(SUM(ec.co2e_emitted), 0) as total_co2e,
    COALESCE(SUM(ec.consumption_kwh), 0) as total_consumption_kwh,
    COALESCE(SUM(ec.co2e_emitted) / NULLIF(b.sq_footage, 0), 0) as co2e_per_sqft
FROM buildings b
LEFT JOIN energy_consumption ec ON b.building_id = ec.building_id
GROUP BY b.building_id, b.name, b.sq_footage, b.primary_use;

-- User Carbon Footprint View
CREATE VIEW user_footprint AS
SELECT 
    u.user_id,
    u.email,
    u.first_name,
    u.last_name,
    u.department,
    COALESCE(SUM(tl.co2e_emitted), 0) as total_transport_co2e,
    COUNT(tl.trip_id) as total_trips
FROM users u
LEFT JOIN transportation_log tl ON u.user_id = tl.user_id
WHERE u.role = 'user'
GROUP BY u.user_id, u.email, u.first_name, u.last_name, u.department;
