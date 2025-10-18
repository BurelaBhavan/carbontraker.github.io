const express = require('express');
const { query } = require('../config/database');
const { requireAdmin, optionalAuth } = require('../middleware/auth');
const { validateDateRange } = require('../middleware/validation');

const router = express.Router();

// Get comprehensive carbon footprint report
router.get('/carbon-footprint', optionalAuth, validateDateRange, async (req, res) => {
  try {
    const { start_date, end_date, format = 'json' } = req.query;
    
    // Default to last year if no dates provided
    const defaultStartDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const startDate = start_date || defaultStartDate;
    const endDate = end_date || new Date().toISOString().split('T')[0];

    // Get scope breakdown
    const scopeBreakdownResult = await query(`
      WITH scope_emissions AS (
        SELECT 
          'Scope 1 & 2 (Energy)' AS emission_scope,
          SUM(co2e_emitted) AS total_co2e_kg,
          COUNT(*) AS record_count,
          'energy' as data_source
        FROM energy_consumption
        WHERE DATE(date_time) BETWEEN $1 AND $2
        
        UNION ALL
        
        SELECT 
          'Scope 3 (Transportation)' AS emission_scope,
          SUM(co2e_emitted) AS total_co2e_kg,
          COUNT(*) AS record_count,
          'transportation' as data_source
        FROM transportation_log
        WHERE date BETWEEN $1 AND $2
      )
      SELECT 
        emission_scope,
        ROUND(total_co2e_kg::numeric, 2) AS total_co2e_kg,
        ROUND((total_co2e_kg / SUM(total_co2e_kg) OVER()) * 100::numeric, 1) AS percentage,
        record_count,
        data_source
      FROM scope_emissions
      ORDER BY total_co2e_kg DESC
    `, [startDate, endDate]);

    // Get building breakdown
    const buildingBreakdownResult = await query(`
      SELECT 
        b.name AS building_name,
        b.primary_use,
        b.sq_footage,
        ROUND(SUM(ec.co2e_emitted)::numeric, 2) AS total_co2e_kg,
        ROUND((SUM(ec.co2e_emitted) / b.sq_footage)::numeric, 4) AS co2e_per_sqft,
        COUNT(ec.record_id) AS total_records
      FROM buildings b
      INNER JOIN energy_consumption ec ON b.building_id = ec.building_id
      WHERE DATE(ec.date_time) BETWEEN $1 AND $2
      GROUP BY b.building_id, b.name, b.primary_use, b.sq_footage
      ORDER BY total_co2e_kg DESC
    `, [startDate, endDate]);

    // Get monthly trend
    const monthlyTrendResult = await query(`
      SELECT 
        DATE_TRUNC('month', date_time) AS month,
        SUM(co2e_emitted) AS monthly_co2e,
        'energy' as source
      FROM energy_consumption
      WHERE DATE(date_time) BETWEEN $1 AND $2
      GROUP BY DATE_TRUNC('month', date_time)
      
      UNION ALL
      
      SELECT 
        DATE_TRUNC('month', date::timestamp) AS month,
        SUM(co2e_emitted) AS monthly_co2e,
        'transportation' as source
      FROM transportation_log
      WHERE date BETWEEN $1 AND $2
      GROUP BY DATE_TRUNC('month', date::timestamp)
      
      ORDER BY month
    `, [startDate, endDate]);

    // Get energy source breakdown
    const energySourceResult = await query(`
      SELECT 
        source,
        COUNT(*) as record_count,
        SUM(consumption_kwh) as total_consumption_kwh,
        SUM(co2e_emitted) as total_co2e_kg,
        AVG(consumption_kwh) as avg_consumption_kwh
      FROM energy_consumption
      WHERE DATE(date_time) BETWEEN $1 AND $2
      GROUP BY source
      ORDER BY total_co2e_kg DESC
    `, [startDate, endDate]);

    // Get transportation mode breakdown
    const transportModeResult = await query(`
      SELECT 
        mode,
        COUNT(*) as trip_count,
        SUM(distance_km) as total_distance_km,
        SUM(co2e_emitted) as total_co2e_kg,
        AVG(distance_km) as avg_distance_km
      FROM transportation_log
      WHERE date BETWEEN $1 AND $2
      GROUP BY mode
      ORDER BY total_co2e_kg DESC
    `, [startDate, endDate]);

    // Calculate totals
    const totalCo2e = scopeBreakdownResult.rows.reduce((sum, row) => sum + parseFloat(row.total_co2e_kg), 0);
    const energyCo2e = scopeBreakdownResult.rows.find(row => row.data_source === 'energy')?.total_co2e_kg || 0;
    const transportCo2e = scopeBreakdownResult.rows.find(row => row.data_source === 'transportation')?.total_co2e_kg || 0;

    const report = {
      reportMetadata: {
        generatedAt: new Date().toISOString(),
        dateRange: { startDate, endDate },
        reportType: 'Carbon Footprint Analysis',
        totalCo2eKg: totalCo2e.toFixed(2),
        totalCo2eTonnes: (totalCo2e / 1000).toFixed(3)
      },
      executiveSummary: {
        totalEmissions: totalCo2e.toFixed(2),
        energyEmissions: parseFloat(energyCo2e).toFixed(2),
        transportationEmissions: parseFloat(transportCo2e).toFixed(2),
        topEmittingBuilding: buildingBreakdownResult.rows[0]?.building_name || 'N/A',
        totalBuildings: buildingBreakdownResult.rows.length,
        reportPeriodDays: Math.ceil((new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24))
      },
      scopeBreakdown: scopeBreakdownResult.rows.map(row => ({
        scope: row.emission_scope,
        totalCo2eKg: parseFloat(row.total_co2e_kg),
        percentage: parseFloat(row.percentage),
        recordCount: parseInt(row.record_count)
      })),
      buildingPerformance: buildingBreakdownResult.rows.map(row => ({
        buildingName: row.building_name,
        primaryUse: row.primary_use,
        sqFootage: parseInt(row.sq_footage),
        totalCo2eKg: parseFloat(row.total_co2e_kg),
        co2ePerSqft: parseFloat(row.co2e_per_sqft),
        totalRecords: parseInt(row.total_records)
      })),
      monthlyTrends: monthlyTrendResult.rows.map(row => ({
        month: row.month,
        co2eKg: parseFloat(row.monthly_co2e),
        source: row.source
      })),
      energySources: energySourceResult.rows.map(row => ({
        source: row.source,
        recordCount: parseInt(row.record_count),
        totalConsumptionKwh: parseFloat(row.total_consumption_kwh),
        totalCo2eKg: parseFloat(row.total_co2e_kg),
        avgConsumptionKwh: parseFloat(row.avg_consumption_kwh)
      })),
      transportationModes: transportModeResult.rows.map(row => ({
        mode: row.mode,
        tripCount: parseInt(row.trip_count),
        totalDistanceKm: parseFloat(row.total_distance_km),
        totalCo2eKg: parseFloat(row.total_co2e_kg),
        avgDistanceKm: parseFloat(row.avg_distance_km)
      }))
    };

    res.json(report);

  } catch (error) {
    console.error('Carbon footprint report error:', error);
    res.status(500).json({
      error: 'Failed to generate carbon footprint report',
      code: 'REPORT_GENERATION_ERROR'
    });
  }
});

// Get top carbon-intensive buildings report (demonstrates complex query)
router.get('/top-buildings', requireAdmin, validateDateRange, async (req, res) => {
  try {
    const { start_date, end_date, limit = 10 } = req.query;
    
    // Default to last quarter if no dates provided
    const defaultStartDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const startDate = start_date || defaultStartDate;
    const endDate = end_date || new Date().toISOString().split('T')[0];

    // This uses the complex query from our DBMS demonstration
    const topBuildingsResult = await query(`
      SELECT 
        b.name AS building_name,
        b.primary_use,
        b.sq_footage,
        ROUND(SUM(ec.co2e_emitted)::numeric, 2) AS total_co2e_kg,
        ROUND((SUM(ec.co2e_emitted) / b.sq_footage)::numeric, 4) AS co2e_per_sqft,
        COUNT(ec.record_id) AS total_records,
        ROUND(AVG(ec.consumption_kwh)::numeric, 2) AS avg_consumption_kwh,
        ROUND(SUM(ec.consumption_kwh)::numeric, 2) AS total_consumption_kwh
      FROM buildings b
      INNER JOIN energy_consumption ec ON b.building_id = ec.building_id
      WHERE DATE(ec.date_time) BETWEEN $1 AND $2
      GROUP BY b.building_id, b.name, b.primary_use, b.sq_footage
      ORDER BY total_co2e_kg DESC
      LIMIT $3
    `, [startDate, endDate, limit]);

    // Get comparison with campus average
    const campusAverageResult = await query(`
      SELECT 
        AVG(building_totals.total_co2e) as campus_avg_co2e,
        AVG(building_totals.co2e_per_sqft) as campus_avg_intensity
      FROM (
        SELECT 
          b.building_id,
          SUM(ec.co2e_emitted) as total_co2e,
          SUM(ec.co2e_emitted) / b.sq_footage as co2e_per_sqft
        FROM buildings b
        INNER JOIN energy_consumption ec ON b.building_id = ec.building_id
        WHERE DATE(ec.date_time) BETWEEN $1 AND $2
        GROUP BY b.building_id, b.sq_footage
      ) building_totals
    `, [startDate, endDate]);

    const campusAvg = campusAverageResult.rows[0];

    res.json({
      reportMetadata: {
        generatedAt: new Date().toISOString(),
        dateRange: { startDate, endDate },
        reportType: 'Top Carbon-Intensive Buildings',
        sqlQuery: 'Complex JOIN with aggregation and ranking - see /database/complex_queries.sql',
        limit: parseInt(limit)
      },
      campusAverages: {
        avgCo2ePerBuilding: parseFloat(campusAvg.campus_avg_co2e || 0).toFixed(2),
        avgCo2eIntensity: parseFloat(campusAvg.campus_avg_intensity || 0).toFixed(4)
      },
      topBuildings: topBuildingsResult.rows.map((building, index) => ({
        rank: index + 1,
        buildingName: building.building_name,
        primaryUse: building.primary_use,
        sqFootage: parseInt(building.sq_footage),
        totalCo2eKg: parseFloat(building.total_co2e_kg),
        co2ePerSqft: parseFloat(building.co2e_per_sqft),
        totalRecords: parseInt(building.total_records),
        avgConsumptionKwh: parseFloat(building.avg_consumption_kwh),
        totalConsumptionKwh: parseFloat(building.total_consumption_kwh),
        vsAveragePercent: campusAvg.campus_avg_co2e > 0 ? 
          (((parseFloat(building.total_co2e_kg) / parseFloat(campusAvg.campus_avg_co2e)) - 1) * 100).toFixed(1) : 
          null
      }))
    });

  } catch (error) {
    console.error('Top buildings report error:', error);
    res.status(500).json({
      error: 'Failed to generate top buildings report',
      code: 'TOP_BUILDINGS_ERROR'
    });
  }
});

// Get user transportation patterns report (admin only)
router.get('/user-patterns', requireAdmin, validateDateRange, async (req, res) => {
  try {
    const { start_date, end_date, department, limit = 20 } = req.query;
    
    // Default to last 3 months
    const defaultStartDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const startDate = start_date || defaultStartDate;
    const endDate = end_date || new Date().toISOString().split('T')[0];

    let whereClause = 'WHERE tl.date BETWEEN $1 AND $2';
    let params = [startDate, endDate];
    let paramIndex = 3;

    if (department) {
      whereClause += ` AND u.department = $${paramIndex}`;
      params.push(department);
      paramIndex++;
    }

    // Get user transportation patterns with ranking
    const userPatternsResult = await query(`
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
        INNER JOIN transportation_log tl ON u.user_id = tl.user_id
        ${whereClause}
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
      ORDER BY total_co2e_kg DESC
      LIMIT $${paramIndex}
    `, [...params, limit]);

    // Get department summary
    const departmentSummaryResult = await query(`
      SELECT 
        u.department,
        COUNT(DISTINCT u.user_id) as user_count,
        COUNT(tl.trip_id) as total_trips,
        SUM(tl.distance_km) as total_distance_km,
        SUM(tl.co2e_emitted) as total_co2e_kg,
        AVG(tl.co2e_emitted) as avg_co2e_per_user
      FROM users u
      INNER JOIN transportation_log tl ON u.user_id = tl.user_id
      WHERE tl.date BETWEEN $1 AND $2
      GROUP BY u.department
      ORDER BY total_co2e_kg DESC
    `, [startDate, endDate]);

    res.json({
      reportMetadata: {
        generatedAt: new Date().toISOString(),
        dateRange: { startDate, endDate },
        reportType: 'User Transportation Patterns',
        department: department || 'All Departments',
        limit: parseInt(limit)
      },
      departmentSummary: departmentSummaryResult.rows.map(row => ({
        department: row.department,
        userCount: parseInt(row.user_count),
        totalTrips: parseInt(row.total_trips),
        totalDistanceKm: parseFloat(row.total_distance_km),
        totalCo2eKg: parseFloat(row.total_co2e_kg),
        avgCo2ePerUser: parseFloat(row.avg_co2e_per_user)
      })),
      userPatterns: userPatternsResult.rows.map(row => ({
        fullName: row.full_name,
        department: row.department,
        totalTrips: parseInt(row.total_trips),
        totalDistanceKm: parseFloat(row.total_distance_km),
        totalCo2eKg: parseFloat(row.total_co2e_kg),
        avgTripDistanceKm: parseFloat(row.avg_trip_distance_km),
        transportModesUsed: row.transport_modes_used,
        co2eRank: parseInt(row.co2e_rank),
        co2ePercentile: parseFloat(row.co2e_percentile)
      }))
    });

  } catch (error) {
    console.error('User patterns report error:', error);
    res.status(500).json({
      error: 'Failed to generate user patterns report',
      code: 'USER_PATTERNS_ERROR'
    });
  }
});

// Get initiative effectiveness report
router.get('/initiative-effectiveness', optionalAuth, async (req, res) => {
  try {
    const effectivenessResult = await query(`
      SELECT 
        i.initiative_id,
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
        i.created_at,
        i.start_date,
        i.end_date
      FROM initiatives i
      LEFT JOIN users u ON i.created_by = u.user_id
      ORDER BY 
        CASE i.status 
          WHEN 'active' THEN 1 
          WHEN 'completed' THEN 2 
          WHEN 'planned' THEN 3 
          ELSE 4 
        END,
        achievement_percentage DESC NULLS LAST
    `);

    // Calculate summary statistics
    const summaryResult = await query(`
      SELECT 
        COUNT(*) as total_initiatives,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
        SUM(target_reduction_tco2e) as total_target,
        SUM(actual_reduction_tco2e) as total_actual,
        AVG(CASE WHEN target_reduction_tco2e > 0 THEN 
          (actual_reduction_tco2e / target_reduction_tco2e * 100) 
        END) as avg_achievement_rate
      FROM initiatives
      WHERE status IN ('active', 'completed')
    `);

    const summary = summaryResult.rows[0];

    res.json({
      reportMetadata: {
        generatedAt: new Date().toISOString(),
        reportType: 'Initiative Effectiveness Analysis'
      },
      summary: {
        totalInitiatives: parseInt(summary.total_initiatives),
        completedInitiatives: parseInt(summary.completed_count),
        activeInitiatives: parseInt(summary.active_count),
        totalTargetReduction: parseFloat(summary.total_target || 0),
        totalActualReduction: parseFloat(summary.total_actual || 0),
        overallAchievementRate: parseFloat(summary.avg_achievement_rate || 0).toFixed(1),
        totalImpact: parseFloat(summary.total_actual || 0).toFixed(2)
      },
      initiatives: effectivenessResult.rows.map(row => ({
        id: row.initiative_id,
        name: row.initiative_name,
        status: row.status,
        targetReduction: parseFloat(row.target_reduction_tco2e || 0),
        actualReduction: parseFloat(row.actual_reduction_tco2e || 0),
        achievementPercentage: parseFloat(row.achievement_percentage || 0),
        plannedDurationDays: row.planned_duration_days ? parseInt(row.planned_duration_days) : null,
        actualDurationDays: row.actual_duration_days ? parseInt(row.actual_duration_days) : null,
        createdBy: row.created_by_name,
        createdAt: row.created_at,
        startDate: row.start_date,
        endDate: row.end_date,
        effectivenessRating: row.achievement_percentage >= 100 ? 'Excellent' :
                            row.achievement_percentage >= 75 ? 'Good' :
                            row.achievement_percentage >= 50 ? 'Fair' : 'Needs Improvement'
      }))
    });

  } catch (error) {
    console.error('Initiative effectiveness report error:', error);
    res.status(500).json({
      error: 'Failed to generate initiative effectiveness report',
      code: 'INITIATIVE_EFFECTIVENESS_ERROR'
    });
  }
});

// Get daily carbon footprint summary (real-time dashboard data)
router.get('/daily-summary', optionalAuth, async (req, res) => {
  try {
    const { date } = req.query;
    const targetDate = date || new Date().toISOString().split('T')[0];

    const dailySummaryResult = await query(`
      SELECT 
        $1::date as report_date,
        
        -- Today's energy emissions
        (SELECT COALESCE(SUM(co2e_emitted), 0) 
         FROM energy_consumption 
         WHERE DATE(date_time) = $1::date) AS energy_co2e,
        
        -- Today's transport emissions
        (SELECT COALESCE(SUM(co2e_emitted), 0) 
         FROM transportation_log 
         WHERE date = $1::date) AS transport_co2e,
        
        -- Previous day for comparison
        (SELECT COALESCE(SUM(co2e_emitted), 0) 
         FROM energy_consumption 
         WHERE DATE(date_time) = $1::date - 1) +
        (SELECT COALESCE(SUM(co2e_emitted), 0) 
         FROM transportation_log 
         WHERE date = $1::date - 1) AS previous_day_total,
        
        -- Monthly average for comparison
        (SELECT AVG(daily_total) FROM (
          SELECT DATE(date_time) as day, SUM(co2e_emitted) as daily_total
          FROM energy_consumption 
          WHERE date_time >= $1::date - INTERVAL '30 days'
          AND date_time < $1::date
          GROUP BY DATE(date_time)
        ) monthly_data) AS monthly_avg_co2e,
        
        -- Active buildings count
        (SELECT COUNT(DISTINCT building_id)
         FROM energy_consumption
         WHERE DATE(date_time) = $1::date) AS active_buildings,
         
        -- Active users count
        (SELECT COUNT(DISTINCT user_id)
         FROM transportation_log
         WHERE date = $1::date) AS active_users
    `, [targetDate]);

    const summary = dailySummaryResult.rows[0];
    const totalCo2e = parseFloat(summary.energy_co2e) + parseFloat(summary.transport_co2e);
    const previousDayTotal = parseFloat(summary.previous_day_total);
    const monthlyAvg = parseFloat(summary.monthly_avg_co2e || 0);

    res.json({
      reportDate: summary.report_date,
      totalCo2eKg: totalCo2e.toFixed(2),
      breakdown: {
        energyCo2eKg: parseFloat(summary.energy_co2e).toFixed(2),
        transportCo2eKg: parseFloat(summary.transport_co2e).toFixed(2)
      },
      comparisons: {
        previousDayTotal: previousDayTotal.toFixed(2),
        monthlyAverage: monthlyAvg.toFixed(2),
        dayOverDayChange: previousDayTotal > 0 ? 
          (((totalCo2e - previousDayTotal) / previousDayTotal) * 100).toFixed(1) : null,
        vsMonthlyAverage: monthlyAvg > 0 ? 
          (((totalCo2e - monthlyAvg) / monthlyAvg) * 100).toFixed(1) : null
      },
      activity: {
        activeBuildings: parseInt(summary.active_buildings || 0),
        activeUsers: parseInt(summary.active_users || 0)
      },
      generatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('Daily summary report error:', error);
    res.status(500).json({
      error: 'Failed to generate daily summary report',
      code: 'DAILY_SUMMARY_ERROR'
    });
  }
});

module.exports = router;
