-- Complex SQL Queries for Campus Carbon Tracker
-- Demonstrates advanced DBMS concepts: JOINs, Aggregations, Subqueries, Window Functions

-- 1. TOP 5 MOST CARBON-INTENSIVE BUILDINGS (Last Quarter)
-- Demonstrates: JOINs, Aggregation, Date Filtering, Ordering
SELECT 
    b.name AS building_name,
    b.primary_use,
    b.sq_footage,
    ROUND(SUM(ec.co2e_emitted)::numeric, 2) AS total_co2e_kg,
    ROUND((SUM(ec.co2e_emitted) / b.sq_footage)::numeric, 4) AS co2e_per_sqft,
    COUNT(ec.record_id) AS total_records
FROM buildings b
INNER JOIN energy_consumption ec ON b.building_id = ec.building_id
WHERE ec.date_time >= CURRENT_DATE - INTERVAL '3 months'
GROUP BY b.building_id, b.name, b.primary_use, b.sq_footage
ORDER BY total_co2e_kg DESC
LIMIT 5;

-- 2. CAMPUS CARBON FOOTPRINT BREAKDOWN BY SCOPE
-- Demonstrates: UNION, Aggregation, Complex Calculations
WITH scope_emissions AS (
    -- Scope 1 & 2: Energy Consumption
    SELECT 
        'Scope 1 & 2 (Energy)' AS emission_scope,
        SUM(co2e_emitted) AS total_co2e_kg,
        COUNT(*) AS record_count
    FROM energy_consumption
    WHERE date_time >= CURRENT_DATE - INTERVAL '1 year'
    
    UNION ALL
    
    -- Scope 3: Transportation
    SELECT 
        'Scope 3 (Transportation)' AS emission_scope,
        SUM(co2e_emitted) AS total_co2e_kg,
        COUNT(*) AS record_count
    FROM transportation_log
    WHERE date >= CURRENT_DATE - INTERVAL '1 year'
)
SELECT 
    emission_scope,
    ROUND(total_co2e_kg::numeric, 2) AS total_co2e_kg,
    ROUND((total_co2e_kg / SUM(total_co2e_kg) OVER()) * 100::numeric, 1) AS percentage,
    record_count
FROM scope_emissions
ORDER BY total_co2e_kg DESC;

-- 3. MONTHLY ENERGY CONSUMPTION TRENDS
-- Demonstrates: Window Functions, Date Functions, Aggregation
SELECT 
    DATE_TRUNC('month', ec.date_time) AS month,
    b.name AS building_name,
    SUM(ec.consumption_kwh) AS monthly_kwh,
    SUM(ec.co2e_emitted) AS monthly_co2e,
    LAG(SUM(ec.co2e_emitted)) OVER (
        PARTITION BY b.building_id 
        ORDER BY DATE_TRUNC('month', ec.date_time)
    ) AS previous_month_co2e,
    ROUND(
        ((SUM(ec.co2e_emitted) - LAG(SUM(ec.co2e_emitted)) OVER (
            PARTITION BY b.building_id 
            ORDER BY DATE_TRUNC('month', ec.date_time)
        )) / NULLIF(LAG(SUM(ec.co2e_emitted)) OVER (
            PARTITION BY b.building_id 
            ORDER BY DATE_TRUNC('month', ec.date_time)
        ), 0) * 100)::numeric, 2
    ) AS month_over_month_change_percent
FROM energy_consumption ec
INNER JOIN buildings b ON ec.building_id = b.building_id
WHERE ec.date_time >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', ec.date_time), b.building_id, b.name
ORDER BY month DESC, monthly_co2e DESC;

-- 4. USER TRANSPORTATION PATTERNS AND RANKINGS
-- Demonstrates: Ranking, Percentiles, Complex Aggregations
WITH user_transport_stats AS (
    SELECT 
        u.user_id,
        u.first_name,
        u.last_name,
        u.department,
        COUNT(tl.trip_id) AS total_trips,
        SUM(tl.distance_km) AS total_distance_km,
        SUM(tl.co2e_emitted) AS total_co2e_kg,
        AVG(tl.distance_km) AS avg_trip_distance,
        STRING_AGG(DISTINCT tl.mode, ', ' ORDER BY tl.mode) AS transport_modes_used
    FROM users u
    LEFT JOIN transportation_log tl ON u.user_id = tl.user_id
    WHERE u.role = 'user' 
    AND (tl.date IS NULL OR tl.date >= CURRENT_DATE - INTERVAL '3 months')
    GROUP BY u.user_id, u.first_name, u.last_name, u.department
)
SELECT 
    first_name || ' ' || last_name AS full_name,
    department,
    total_trips,
    ROUND(total_distance_km::numeric, 1) AS total_distance_km,
    ROUND(total_co2e_kg::numeric, 2) AS total_co2e_kg,
    ROUND(avg_trip_distance::numeric, 1) AS avg_trip_distance_km,
    transport_modes_used,
    RANK() OVER (ORDER BY total_co2e_kg DESC) AS co2e_rank,
    ROUND(PERCENT_RANK() OVER (ORDER BY total_co2e_kg)::numeric * 100, 1) AS co2e_percentile
FROM user_transport_stats
WHERE total_trips > 0
ORDER BY total_co2e_kg DESC;

-- 5. BUILDING EFFICIENCY ANALYSIS
-- Demonstrates: Subqueries, Statistical Functions, Performance Metrics
WITH building_efficiency AS (
    SELECT 
        b.building_id,
        b.name,
        b.primary_use,
        b.sq_footage,
        AVG(ec.consumption_kwh) AS avg_daily_kwh,
        AVG(ec.co2e_emitted) AS avg_daily_co2e,
        STDDEV(ec.consumption_kwh) AS kwh_stddev,
        MIN(ec.consumption_kwh) AS min_kwh,
        MAX(ec.consumption_kwh) AS max_kwh
    FROM buildings b
    INNER JOIN energy_consumption ec ON b.building_id = ec.building_id
    WHERE ec.date_time >= CURRENT_DATE - INTERVAL '1 month'
    GROUP BY b.building_id, b.name, b.primary_use, b.sq_footage
),
efficiency_rankings AS (
    SELECT 
        *,
        (avg_daily_co2e / sq_footage) AS co2e_intensity,
        RANK() OVER (ORDER BY (avg_daily_co2e / sq_footage)) AS efficiency_rank,
        CASE 
            WHEN (avg_daily_co2e / sq_footage) < (
                SELECT PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY avg_daily_co2e / sq_footage) 
                FROM building_efficiency
            ) THEN 'Excellent'
            WHEN (avg_daily_co2e / sq_footage) < (
                SELECT PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY avg_daily_co2e / sq_footage) 
                FROM building_efficiency
            ) THEN 'Good'
            WHEN (avg_daily_co2e / sq_footage) < (
                SELECT PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY avg_daily_co2e / sq_footage) 
                FROM building_efficiency
            ) THEN 'Average'
            ELSE 'Needs Improvement'
        END AS efficiency_rating
    FROM building_efficiency
)
SELECT 
    name AS building_name,
    primary_use,
    sq_footage,
    ROUND(avg_daily_kwh::numeric, 1) AS avg_daily_kwh,
    ROUND(co2e_intensity::numeric, 6) AS co2e_per_sqft,
    efficiency_rank,
    efficiency_rating,
    ROUND(kwh_stddev::numeric, 1) AS consumption_variability
FROM efficiency_rankings
ORDER BY efficiency_rank;

-- 6. INITIATIVE EFFECTIVENESS ANALYSIS
-- Demonstrates: Conditional Aggregation, Date Calculations
SELECT 
    i.name AS initiative_name,
    i.status,
    i.target_reduction_tco2e,
    i.actual_reduction_tco2e,
    ROUND(
        (i.actual_reduction_tco2e / NULLIF(i.target_reduction_tco2e, 0) * 100)::numeric, 1
    ) AS achievement_percentage,
    CASE 
        WHEN i.end_date IS NULL THEN NULL
        ELSE EXTRACT(DAYS FROM (i.end_date - i.start_date))
    END AS planned_duration_days,
    CASE 
        WHEN i.status = 'completed' AND i.end_date IS NOT NULL THEN 
            EXTRACT(DAYS FROM (CURRENT_DATE - i.start_date))
        WHEN i.status = 'active' THEN 
            EXTRACT(DAYS FROM (CURRENT_DATE - i.start_date))
        ELSE NULL
    END AS actual_duration_days,
    u.first_name || ' ' || u.last_name AS created_by_name,
    i.created_at
FROM initiatives i
LEFT JOIN users u ON i.created_by = u.user_id
ORDER BY 
    CASE i.status 
        WHEN 'active' THEN 1 
        WHEN 'completed' THEN 2 
        WHEN 'planned' THEN 3 
        ELSE 4 
    END,
    i.created_at DESC;

-- 7. DAILY CARBON FOOTPRINT DASHBOARD QUERY
-- Demonstrates: Multiple JOINs, Date Functions, Real-time Analytics
WITH daily_summary AS (
    SELECT 
        CURRENT_DATE as report_date,
        
        -- Today's energy emissions
        (SELECT COALESCE(SUM(co2e_emitted), 0) 
         FROM energy_consumption 
         WHERE DATE(date_time) = CURRENT_DATE) AS today_energy_co2e,
        
        -- Today's transport emissions
        (SELECT COALESCE(SUM(co2e_emitted), 0) 
         FROM transportation_log 
         WHERE date = CURRENT_DATE) AS today_transport_co2e,
        
        -- Yesterday's total for comparison
        (SELECT COALESCE(SUM(co2e_emitted), 0) 
         FROM energy_consumption 
         WHERE DATE(date_time) = CURRENT_DATE - 1) +
        (SELECT COALESCE(SUM(co2e_emitted), 0) 
         FROM transportation_log 
         WHERE date = CURRENT_DATE - 1) AS yesterday_total_co2e,
        
        -- Monthly average
        (SELECT AVG(daily_total) FROM (
            SELECT DATE(date_time) as day, SUM(co2e_emitted) as daily_total
            FROM energy_consumption 
            WHERE date_time >= CURRENT_DATE - INTERVAL '30 days'
            GROUP BY DATE(date_time)
        ) monthly_avg) AS monthly_avg_co2e
)
SELECT 
    report_date,
    ROUND(today_energy_co2e::numeric, 2) AS today_energy_co2e_kg,
    ROUND(today_transport_co2e::numeric, 2) AS today_transport_co2e_kg,
    ROUND((today_energy_co2e + today_transport_co2e)::numeric, 2) AS today_total_co2e_kg,
    ROUND(yesterday_total_co2e::numeric, 2) AS yesterday_total_co2e_kg,
    ROUND(monthly_avg_co2e::numeric, 2) AS monthly_avg_co2e_kg,
    ROUND(
        (((today_energy_co2e + today_transport_co2e) - yesterday_total_co2e) / 
         NULLIF(yesterday_total_co2e, 0) * 100)::numeric, 1
    ) AS day_over_day_change_percent,
    ROUND(
        (((today_energy_co2e + today_transport_co2e) - monthly_avg_co2e) / 
         NULLIF(monthly_avg_co2e, 0) * 100)::numeric, 1
    ) AS vs_monthly_avg_percent
FROM daily_summary;

-- 8. PEAK CONSUMPTION ANALYSIS
-- Demonstrates: Window Functions, Time-based Analysis
WITH hourly_consumption AS (
    SELECT 
        b.name AS building_name,
        EXTRACT(HOUR FROM ec.date_time) AS hour_of_day,
        AVG(ec.consumption_kwh) AS avg_hourly_kwh,
        AVG(ec.co2e_emitted) AS avg_hourly_co2e
    FROM energy_consumption ec
    INNER JOIN buildings b ON ec.building_id = b.building_id
    WHERE ec.date_time >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY b.name, EXTRACT(HOUR FROM ec.date_time)
),
peak_hours AS (
    SELECT 
        building_name,
        hour_of_day,
        avg_hourly_kwh,
        avg_hourly_co2e,
        RANK() OVER (PARTITION BY building_name ORDER BY avg_hourly_kwh DESC) as consumption_rank
    FROM hourly_consumption
)
SELECT 
    building_name,
    hour_of_day || ':00' AS peak_hour,
    ROUND(avg_hourly_kwh::numeric, 1) AS peak_kwh,
    ROUND(avg_hourly_co2e::numeric, 3) AS peak_co2e_kg
FROM peak_hours
WHERE consumption_rank <= 3
ORDER BY building_name, consumption_rank;
