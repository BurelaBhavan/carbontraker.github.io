const express = require('express');
const { query } = require('../config/database');
const { optionalAuth, requireUser, requireAdmin } = require('../middleware/auth');
const { validateDateRange } = require('../middleware/validation');

const router = express.Router();

// Public Campus Overview Dashboard
router.get('/public', optionalAuth, async (req, res) => {
  try {
    // Get campus overview data using the view we created
    const overviewResult = await query('SELECT * FROM campus_overview');
    const overview = overviewResult.rows[0];

    // Get emissions breakdown by scope
    const scopeBreakdownResult = await query(`
      WITH scope_emissions AS (
        SELECT 
          'Scope 1 & 2 (Energy)' AS emission_scope,
          SUM(co2e_emitted) AS total_co2e_kg,
          COUNT(*) AS record_count
        FROM energy_consumption
        WHERE date_time >= CURRENT_DATE - INTERVAL '1 year'
        
        UNION ALL
        
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
      ORDER BY total_co2e_kg DESC
    `);

    // Get active initiatives
    const initiativesResult = await query(`
      SELECT 
        initiative_id,
        name,
        description,
        target_reduction_tco2e,
        actual_reduction_tco2e,
        status,
        start_date,
        end_date
      FROM initiatives 
      WHERE status = 'active'
      ORDER BY target_reduction_tco2e DESC
      LIMIT 5
    `);

    // Get monthly trend (last 6 months)
    const trendResult = await query(`
      SELECT 
        DATE_TRUNC('month', date_time) AS month,
        SUM(co2e_emitted) AS monthly_co2e
      FROM energy_consumption
      WHERE date_time >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', date_time)
      ORDER BY month
    `);

    res.json({
      overview: {
        totalBuildings: overview.total_buildings,
        annualEnergyCo2e: parseFloat(overview.annual_energy_co2e) || 0,
        annualTransportCo2e: parseFloat(overview.annual_transport_co2e) || 0,
        totalAnnualCo2e: (parseFloat(overview.annual_energy_co2e) || 0) + (parseFloat(overview.annual_transport_co2e) || 0),
        activeInitiatives: overview.active_initiatives
      },
      scopeBreakdown: scopeBreakdownResult.rows,
      activeInitiatives: initiativesResult.rows,
      monthlyTrend: trendResult.rows.map(row => ({
        month: row.month,
        co2e: parseFloat(row.monthly_co2e) || 0
      }))
    });

  } catch (error) {
    console.error('Public dashboard error:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard data',
      code: 'DASHBOARD_ERROR'
    });
  }
});

// User Personal Dashboard
router.get('/user', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Get user's personal footprint
    const personalFootprintResult = await query(`
      SELECT 
        COUNT(tl.trip_id) as total_trips,
        COALESCE(SUM(tl.distance_km), 0) as total_distance_km,
        COALESCE(SUM(tl.co2e_emitted), 0) as total_co2e_kg,
        COALESCE(AVG(tl.distance_km), 0) as avg_trip_distance
      FROM transportation_log tl
      WHERE tl.user_id = $1
      AND tl.date >= CURRENT_DATE - INTERVAL '3 months'
    `, [userId]);

    // Get campus average for comparison
    const campusAverageResult = await query(`
      SELECT 
        AVG(user_totals.total_co2e) as campus_avg_co2e
      FROM (
        SELECT 
          tl.user_id,
          SUM(tl.co2e_emitted) as total_co2e
        FROM transportation_log tl
        INNER JOIN users u ON tl.user_id = u.user_id
        WHERE u.role = 'user'
        AND tl.date >= CURRENT_DATE - INTERVAL '3 months'
        GROUP BY tl.user_id
      ) user_totals
    `);

    // Get user's monthly trend
    const monthlyTrendResult = await query(`
      SELECT 
        DATE_TRUNC('month', tl.date) AS month,
        SUM(tl.co2e_emitted) AS monthly_co2e,
        COUNT(tl.trip_id) AS monthly_trips
      FROM transportation_log tl
      WHERE tl.user_id = $1
      AND tl.date >= CURRENT_DATE - INTERVAL '6 months'
      GROUP BY DATE_TRUNC('month', tl.date)
      ORDER BY month
    `, [userId]);

    // Get transportation mode breakdown
    const modeBreakdownResult = await query(`
      SELECT 
        tl.mode,
        COUNT(tl.trip_id) as trip_count,
        SUM(tl.distance_km) as total_distance,
        SUM(tl.co2e_emitted) as total_co2e
      FROM transportation_log tl
      WHERE tl.user_id = $1
      AND tl.date >= CURRENT_DATE - INTERVAL '3 months'
      GROUP BY tl.mode
      ORDER BY total_co2e DESC
    `, [userId]);

    const personalFootprint = personalFootprintResult.rows[0];
    const campusAverage = campusAverageResult.rows[0];

    res.json({
      personalFootprint: {
        totalTrips: parseInt(personalFootprint.total_trips),
        totalDistanceKm: parseFloat(personalFootprint.total_distance_km),
        totalCo2eKg: parseFloat(personalFootprint.total_co2e_kg),
        avgTripDistance: parseFloat(personalFootprint.avg_trip_distance)
      },
      comparison: {
        userCo2e: parseFloat(personalFootprint.total_co2e_kg),
        campusAvgCo2e: parseFloat(campusAverage.campus_avg_co2e) || 0,
        percentageVsAverage: campusAverage.campus_avg_co2e ? 
          ((parseFloat(personalFootprint.total_co2e_kg) / parseFloat(campusAverage.campus_avg_co2e)) * 100 - 100).toFixed(1) : 
          null
      },
      monthlyTrend: monthlyTrendResult.rows.map(row => ({
        month: row.month,
        co2e: parseFloat(row.monthly_co2e) || 0,
        trips: parseInt(row.monthly_trips)
      })),
      modeBreakdown: modeBreakdownResult.rows.map(row => ({
        mode: row.mode,
        tripCount: parseInt(row.trip_count),
        totalDistance: parseFloat(row.total_distance),
        totalCo2e: parseFloat(row.total_co2e)
      }))
    });

  } catch (error) {
    console.error('User dashboard error:', error);
    res.status(500).json({
      error: 'Failed to fetch user dashboard data',
      code: 'USER_DASHBOARD_ERROR'
    });
  }
});

// Admin Dashboard
router.get('/admin', requireAdmin, validateDateRange, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    
    // Default to last 30 days if no date range provided
    const startDate = start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = end_date || new Date().toISOString().split('T')[0];

    // Get top 5 carbon-intensive buildings
    const topBuildingsResult = await query(`
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
      LIMIT 5
    `, [startDate, endDate]);

    // Get daily summary for the period
    const dailySummaryResult = await query(`
      SELECT 
        DATE(ec.date_time) as date,
        SUM(ec.co2e_emitted) as daily_energy_co2e,
        COUNT(DISTINCT ec.building_id) as active_buildings
      FROM energy_consumption ec
      WHERE DATE(ec.date_time) BETWEEN $1 AND $2
      GROUP BY DATE(ec.date_time)
      ORDER BY date DESC
      LIMIT 30
    `, [startDate, endDate]);

    // Get user activity summary
    const userActivityResult = await query(`
      SELECT 
        COUNT(DISTINCT u.user_id) as total_users,
        COUNT(DISTINCT tl.user_id) as active_users,
        COUNT(tl.trip_id) as total_trips,
        SUM(tl.co2e_emitted) as total_transport_co2e
      FROM users u
      LEFT JOIN transportation_log tl ON u.user_id = tl.user_id 
        AND tl.date BETWEEN $1 AND $2
      WHERE u.role = 'user'
    `, [startDate, endDate]);

    // Get initiative progress
    const initiativeProgressResult = await query(`
      SELECT 
        COUNT(*) as total_initiatives,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_initiatives,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_initiatives,
        COALESCE(SUM(target_reduction_tco2e), 0) as total_target_reduction,
        COALESCE(SUM(actual_reduction_tco2e), 0) as total_actual_reduction
      FROM initiatives
    `);

    // Get building performance overview
    const buildingPerformanceResult = await query(`
      SELECT * FROM building_performance 
      ORDER BY total_co2e DESC
      LIMIT 10
    `);

    const userActivity = userActivityResult.rows[0];
    const initiativeProgress = initiativeProgressResult.rows[0];

    res.json({
      dateRange: { startDate, endDate },
      topBuildings: topBuildingsResult.rows,
      dailySummary: dailySummaryResult.rows.map(row => ({
        date: row.date,
        energyCo2e: parseFloat(row.daily_energy_co2e) || 0,
        activeBuildings: parseInt(row.active_buildings)
      })),
      userActivity: {
        totalUsers: parseInt(userActivity.total_users),
        activeUsers: parseInt(userActivity.active_users),
        totalTrips: parseInt(userActivity.total_trips) || 0,
        totalTransportCo2e: parseFloat(userActivity.total_transport_co2e) || 0
      },
      initiativeProgress: {
        totalInitiatives: parseInt(initiativeProgress.total_initiatives),
        activeInitiatives: parseInt(initiativeProgress.active_initiatives),
        completedInitiatives: parseInt(initiativeProgress.completed_initiatives),
        totalTargetReduction: parseFloat(initiativeProgress.total_target_reduction) || 0,
        totalActualReduction: parseFloat(initiativeProgress.total_actual_reduction) || 0,
        achievementRate: initiativeProgress.total_target_reduction > 0 ? 
          ((parseFloat(initiativeProgress.total_actual_reduction) / parseFloat(initiativeProgress.total_target_reduction)) * 100).toFixed(1) : 
          '0'
      },
      buildingPerformance: buildingPerformanceResult.rows.map(row => ({
        buildingId: row.building_id,
        name: row.name,
        sqFootage: parseInt(row.sq_footage),
        primaryUse: row.primary_use,
        totalCo2e: parseFloat(row.total_co2e) || 0,
        totalConsumption: parseFloat(row.total_consumption_kwh) || 0,
        co2ePerSqft: parseFloat(row.co2e_per_sqft) || 0
      }))
    });

  } catch (error) {
    console.error('Admin dashboard error:', error);
    res.status(500).json({
      error: 'Failed to fetch admin dashboard data',
      code: 'ADMIN_DASHBOARD_ERROR'
    });
  }
});

// Real-time dashboard data (for live updates)
router.get('/realtime', optionalAuth, async (req, res) => {
  try {
    // Get today's data
    const todayResult = await query(`
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
         WHERE date = CURRENT_DATE - 1) AS yesterday_total_co2e
    `);

    const todayData = todayResult.rows[0];
    const todayTotal = parseFloat(todayData.today_energy_co2e) + parseFloat(todayData.today_transport_co2e);
    const yesterdayTotal = parseFloat(todayData.yesterday_total_co2e);

    res.json({
      reportDate: todayData.report_date,
      today: {
        energyCo2e: parseFloat(todayData.today_energy_co2e),
        transportCo2e: parseFloat(todayData.today_transport_co2e),
        totalCo2e: todayTotal
      },
      comparison: {
        yesterdayTotal: yesterdayTotal,
        changePercent: yesterdayTotal > 0 ? 
          (((todayTotal - yesterdayTotal) / yesterdayTotal) * 100).toFixed(1) : 
          null
      },
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Realtime dashboard error:', error);
    res.status(500).json({
      error: 'Failed to fetch realtime data',
      code: 'REALTIME_ERROR'
    });
  }
});

module.exports = router;
