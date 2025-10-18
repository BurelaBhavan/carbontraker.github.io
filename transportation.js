const express = require('express');
const { query, transaction } = require('../config/database');
const { requireUser, requireAdmin } = require('../middleware/auth');
const { validateTransportationLog, validateDateRange, validatePagination, validateUUID } = require('../middleware/validation');

const router = express.Router();

// Get user's transportation logs
router.get('/', requireUser, validateDateRange, validatePagination, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { start_date, end_date, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE tl.user_id = $1';
    let params = [userId];
    let paramIndex = 2;

    if (start_date) {
      whereClause += ` AND tl.date >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      whereClause += ` AND tl.date <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM transportation_log tl ${whereClause}`,
      params
    );

    // Get paginated results
    const logsResult = await query(
      `SELECT 
        tl.trip_id,
        tl.date,
        tl.mode,
        tl.distance_km,
        tl.co2e_emitted,
        tl.created_at
      FROM transportation_log tl
      ${whereClause}
      ORDER BY tl.date DESC, tl.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      logs: logsResult.rows.map(log => ({
        id: log.trip_id,
        date: log.date,
        mode: log.mode,
        distanceKm: parseFloat(log.distance_km),
        co2eEmitted: parseFloat(log.co2e_emitted),
        createdAt: log.created_at
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalRecords: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Transportation logs fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch transportation logs',
      code: 'TRANSPORT_FETCH_ERROR'
    });
  }
});

// Add new transportation log
router.post('/', requireUser, validateTransportationLog, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { date, mode, distance_km } = req.body;

    const result = await query(
      `INSERT INTO transportation_log (user_id, date, mode, distance_km) 
       VALUES ($1, $2, $3, $4) 
       RETURNING trip_id, date, mode, distance_km, co2e_emitted, created_at`,
      [userId, date, mode, distance_km]
    );

    const newLog = result.rows[0];

    res.status(201).json({
      message: 'Transportation log added successfully',
      log: {
        id: newLog.trip_id,
        date: newLog.date,
        mode: newLog.mode,
        distanceKm: parseFloat(newLog.distance_km),
        co2eEmitted: parseFloat(newLog.co2e_emitted),
        createdAt: newLog.created_at
      }
    });

  } catch (error) {
    console.error('Transportation log creation error:', error);
    res.status(500).json({
      error: 'Failed to add transportation log',
      code: 'TRANSPORT_CREATE_ERROR'
    });
  }
});

// Update transportation log
router.put('/:tripId', requireUser, validateUUID('tripId'), validateTransportationLog, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { tripId } = req.params;
    const { date, mode, distance_km } = req.body;

    // Check if the log belongs to the user
    const ownershipCheck = await query(
      'SELECT user_id FROM transportation_log WHERE trip_id = $1',
      [tripId]
    );

    if (ownershipCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'Transportation log not found',
        code: 'LOG_NOT_FOUND'
      });
    }

    if (ownershipCheck.rows[0].user_id !== userId) {
      return res.status(403).json({
        error: 'Not authorized to update this log',
        code: 'NOT_AUTHORIZED'
      });
    }

    const result = await query(
      `UPDATE transportation_log 
       SET date = $1, mode = $2, distance_km = $3
       WHERE trip_id = $4 AND user_id = $5
       RETURNING trip_id, date, mode, distance_km, co2e_emitted, created_at`,
      [date, mode, distance_km, tripId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Transportation log not found',
        code: 'LOG_NOT_FOUND'
      });
    }

    const updatedLog = result.rows[0];

    res.json({
      message: 'Transportation log updated successfully',
      log: {
        id: updatedLog.trip_id,
        date: updatedLog.date,
        mode: updatedLog.mode,
        distanceKm: parseFloat(updatedLog.distance_km),
        co2eEmitted: parseFloat(updatedLog.co2e_emitted),
        createdAt: updatedLog.created_at
      }
    });

  } catch (error) {
    console.error('Transportation log update error:', error);
    res.status(500).json({
      error: 'Failed to update transportation log',
      code: 'TRANSPORT_UPDATE_ERROR'
    });
  }
});

// Delete transportation log
router.delete('/:tripId', requireUser, validateUUID('tripId'), async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { tripId } = req.params;

    const result = await query(
      'DELETE FROM transportation_log WHERE trip_id = $1 AND user_id = $2 RETURNING trip_id',
      [tripId, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Transportation log not found or not authorized',
        code: 'LOG_NOT_FOUND'
      });
    }

    res.json({
      message: 'Transportation log deleted successfully'
    });

  } catch (error) {
    console.error('Transportation log deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete transportation log',
      code: 'TRANSPORT_DELETE_ERROR'
    });
  }
});

// Get transportation statistics for user
router.get('/stats', requireUser, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { period = '3months' } = req.query;

    let interval;
    switch (period) {
      case '1month':
        interval = '1 month';
        break;
      case '6months':
        interval = '6 months';
        break;
      case '1year':
        interval = '1 year';
        break;
      default:
        interval = '3 months';
    }

    // Get overall stats
    const overallStatsResult = await query(`
      SELECT 
        COUNT(tl.trip_id) as total_trips,
        COALESCE(SUM(tl.distance_km), 0) as total_distance_km,
        COALESCE(SUM(tl.co2e_emitted), 0) as total_co2e_kg,
        COALESCE(AVG(tl.distance_km), 0) as avg_trip_distance
      FROM transportation_log tl
      WHERE tl.user_id = $1
      AND tl.date >= CURRENT_DATE - INTERVAL '${interval}'
    `, [userId]);

    // Get mode breakdown
    const modeBreakdownResult = await query(`
      SELECT 
        tl.mode,
        COUNT(tl.trip_id) as trip_count,
        SUM(tl.distance_km) as total_distance,
        SUM(tl.co2e_emitted) as total_co2e,
        AVG(tl.distance_km) as avg_distance
      FROM transportation_log tl
      WHERE tl.user_id = $1
      AND tl.date >= CURRENT_DATE - INTERVAL '${interval}'
      GROUP BY tl.mode
      ORDER BY total_co2e DESC
    `, [userId]);

    // Get weekly trend
    const weeklyTrendResult = await query(`
      SELECT 
        DATE_TRUNC('week', tl.date) AS week,
        COUNT(tl.trip_id) as weekly_trips,
        SUM(tl.distance_km) as weekly_distance,
        SUM(tl.co2e_emitted) as weekly_co2e
      FROM transportation_log tl
      WHERE tl.user_id = $1
      AND tl.date >= CURRENT_DATE - INTERVAL '${interval}'
      GROUP BY DATE_TRUNC('week', tl.date)
      ORDER BY week
    `, [userId]);

    const overallStats = overallStatsResult.rows[0];

    res.json({
      period,
      overallStats: {
        totalTrips: parseInt(overallStats.total_trips),
        totalDistanceKm: parseFloat(overallStats.total_distance_km),
        totalCo2eKg: parseFloat(overallStats.total_co2e_kg),
        avgTripDistance: parseFloat(overallStats.avg_trip_distance)
      },
      modeBreakdown: modeBreakdownResult.rows.map(row => ({
        mode: row.mode,
        tripCount: parseInt(row.trip_count),
        totalDistance: parseFloat(row.total_distance),
        totalCo2e: parseFloat(row.total_co2e),
        avgDistance: parseFloat(row.avg_distance)
      })),
      weeklyTrend: weeklyTrendResult.rows.map(row => ({
        week: row.week,
        trips: parseInt(row.weekly_trips),
        distance: parseFloat(row.weekly_distance),
        co2e: parseFloat(row.weekly_co2e)
      }))
    });

  } catch (error) {
    console.error('Transportation stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch transportation statistics',
      code: 'TRANSPORT_STATS_ERROR'
    });
  }
});

// Admin: Get all transportation logs with filters
router.get('/admin/all', requireAdmin, validateDateRange, validatePagination, async (req, res) => {
  try {
    const { start_date, end_date, mode, department, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let params = [];
    let paramIndex = 1;

    if (start_date) {
      whereClause += ` AND tl.date >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      whereClause += ` AND tl.date <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    if (mode) {
      whereClause += ` AND tl.mode = $${paramIndex}`;
      params.push(mode);
      paramIndex++;
    }

    if (department) {
      whereClause += ` AND u.department = $${paramIndex}`;
      params.push(department);
      paramIndex++;
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total 
       FROM transportation_log tl
       INNER JOIN users u ON tl.user_id = u.user_id
       ${whereClause}`,
      params
    );

    // Get paginated results
    const logsResult = await query(
      `SELECT 
        tl.trip_id,
        tl.date,
        tl.mode,
        tl.distance_km,
        tl.co2e_emitted,
        tl.created_at,
        u.first_name,
        u.last_name,
        u.email,
        u.department
      FROM transportation_log tl
      INNER JOIN users u ON tl.user_id = u.user_id
      ${whereClause}
      ORDER BY tl.date DESC, tl.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      logs: logsResult.rows.map(log => ({
        id: log.trip_id,
        date: log.date,
        mode: log.mode,
        distanceKm: parseFloat(log.distance_km),
        co2eEmitted: parseFloat(log.co2e_emitted),
        createdAt: log.created_at,
        user: {
          name: `${log.first_name} ${log.last_name}`,
          email: log.email,
          department: log.department
        }
      })),
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalRecords: total,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Admin transportation logs error:', error);
    res.status(500).json({
      error: 'Failed to fetch transportation logs',
      code: 'ADMIN_TRANSPORT_ERROR'
    });
  }
});

module.exports = router;
