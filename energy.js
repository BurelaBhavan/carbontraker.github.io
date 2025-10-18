const express = require('express');
const { query } = require('../config/database');
const { requireAdmin, optionalAuth } = require('../middleware/auth');
const { validateEnergyConsumption, validateDateRange, validatePagination, validateUUID } = require('../middleware/validation');

const router = express.Router();

// Get energy consumption data (public with optional auth for more details)
router.get('/', optionalAuth, validateDateRange, validatePagination, async (req, res) => {
  try {
    const { building_id, source, start_date, end_date, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let params = [];
    let paramIndex = 1;

    if (building_id) {
      whereClause += ` AND ec.building_id = $${paramIndex}`;
      params.push(building_id);
      paramIndex++;
    }

    if (source) {
      whereClause += ` AND ec.source = $${paramIndex}`;
      params.push(source);
      paramIndex++;
    }

    if (start_date) {
      whereClause += ` AND DATE(ec.date_time) >= $${paramIndex}`;
      params.push(start_date);
      paramIndex++;
    }

    if (end_date) {
      whereClause += ` AND DATE(ec.date_time) <= $${paramIndex}`;
      params.push(end_date);
      paramIndex++;
    }

    // Limit data for non-admin users
    if (!req.user || req.user.role !== 'admin') {
      whereClause += ` AND ec.date_time >= CURRENT_DATE - INTERVAL '30 days'`;
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total 
       FROM energy_consumption ec
       INNER JOIN buildings b ON ec.building_id = b.building_id
       ${whereClause}`,
      params
    );

    // Get paginated results
    const consumptionResult = await query(
      `SELECT 
        ec.record_id,
        ec.date_time,
        ec.source,
        ec.consumption_kwh,
        ec.co2e_emitted,
        b.name as building_name,
        b.primary_use,
        b.sq_footage
      FROM energy_consumption ec
      INNER JOIN buildings b ON ec.building_id = b.building_id
      ${whereClause}
      ORDER BY ec.date_time DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      consumption: consumptionResult.rows.map(record => ({
        id: record.record_id,
        dateTime: record.date_time,
        source: record.source,
        consumptionKwh: parseFloat(record.consumption_kwh),
        co2eEmitted: parseFloat(record.co2e_emitted),
        building: {
          name: record.building_name,
          primaryUse: record.primary_use,
          sqFootage: parseInt(record.sq_footage)
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
    console.error('Energy consumption fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch energy consumption data',
      code: 'ENERGY_FETCH_ERROR'
    });
  }
});

// Add new energy consumption record (admin only)
router.post('/', requireAdmin, validateEnergyConsumption, async (req, res) => {
  try {
    const { building_id, date_time, source, consumption_kwh } = req.body;

    const result = await query(
      `INSERT INTO energy_consumption (building_id, date_time, source, consumption_kwh) 
       VALUES ($1, $2, $3, $4) 
       RETURNING record_id, building_id, date_time, source, consumption_kwh, co2e_emitted, created_at`,
      [building_id, date_time, source, consumption_kwh]
    );

    const newRecord = result.rows[0];

    // Get building info for response
    const buildingResult = await query(
      'SELECT name, primary_use FROM buildings WHERE building_id = $1',
      [building_id]
    );

    res.status(201).json({
      message: 'Energy consumption record added successfully',
      record: {
        id: newRecord.record_id,
        buildingId: newRecord.building_id,
        dateTime: newRecord.date_time,
        source: newRecord.source,
        consumptionKwh: parseFloat(newRecord.consumption_kwh),
        co2eEmitted: parseFloat(newRecord.co2e_emitted),
        createdAt: newRecord.created_at,
        building: buildingResult.rows[0] || null
      }
    });

  } catch (error) {
    console.error('Energy consumption creation error:', error);
    res.status(500).json({
      error: 'Failed to add energy consumption record',
      code: 'ENERGY_CREATE_ERROR'
    });
  }
});

// Update energy consumption record (admin only)
router.put('/:recordId', requireAdmin, validateUUID('recordId'), validateEnergyConsumption, async (req, res) => {
  try {
    const { recordId } = req.params;
    const { building_id, date_time, source, consumption_kwh } = req.body;

    const result = await query(
      `UPDATE energy_consumption 
       SET building_id = $1, date_time = $2, source = $3, consumption_kwh = $4
       WHERE record_id = $5
       RETURNING record_id, building_id, date_time, source, consumption_kwh, co2e_emitted, created_at`,
      [building_id, date_time, source, consumption_kwh, recordId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Energy consumption record not found',
        code: 'RECORD_NOT_FOUND'
      });
    }

    const updatedRecord = result.rows[0];

    // Get building info for response
    const buildingResult = await query(
      'SELECT name, primary_use FROM buildings WHERE building_id = $1',
      [building_id]
    );

    res.json({
      message: 'Energy consumption record updated successfully',
      record: {
        id: updatedRecord.record_id,
        buildingId: updatedRecord.building_id,
        dateTime: updatedRecord.date_time,
        source: updatedRecord.source,
        consumptionKwh: parseFloat(updatedRecord.consumption_kwh),
        co2eEmitted: parseFloat(updatedRecord.co2e_emitted),
        createdAt: updatedRecord.created_at,
        building: buildingResult.rows[0] || null
      }
    });

  } catch (error) {
    console.error('Energy consumption update error:', error);
    res.status(500).json({
      error: 'Failed to update energy consumption record',
      code: 'ENERGY_UPDATE_ERROR'
    });
  }
});

// Delete energy consumption record (admin only)
router.delete('/:recordId', requireAdmin, validateUUID('recordId'), async (req, res) => {
  try {
    const { recordId } = req.params;

    const result = await query(
      'DELETE FROM energy_consumption WHERE record_id = $1 RETURNING record_id',
      [recordId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Energy consumption record not found',
        code: 'RECORD_NOT_FOUND'
      });
    }

    res.json({
      message: 'Energy consumption record deleted successfully'
    });

  } catch (error) {
    console.error('Energy consumption deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete energy consumption record',
      code: 'ENERGY_DELETE_ERROR'
    });
  }
});

// Get energy consumption summary by building
router.get('/summary/buildings', optionalAuth, validateDateRange, async (req, res) => {
  try {
    const { start_date, end_date, source } = req.query;
    
    // Default to last 30 days for non-admin users
    const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const startDate = start_date || defaultStartDate;
    const endDate = end_date || new Date().toISOString().split('T')[0];

    let whereClause = 'WHERE DATE(ec.date_time) BETWEEN $1 AND $2';
    let params = [startDate, endDate];
    let paramIndex = 3;

    if (source) {
      whereClause += ` AND ec.source = $${paramIndex}`;
      params.push(source);
      paramIndex++;
    }

    // Limit data for non-admin users
    if (!req.user || req.user.role !== 'admin') {
      whereClause += ' AND ec.date_time >= CURRENT_DATE - INTERVAL \'30 days\'';
    }

    const summaryResult = await query(`
      SELECT 
        b.building_id,
        b.name as building_name,
        b.primary_use,
        b.sq_footage,
        COUNT(ec.record_id) as total_records,
        SUM(ec.consumption_kwh) as total_consumption_kwh,
        SUM(ec.co2e_emitted) as total_co2e_emitted,
        AVG(ec.consumption_kwh) as avg_consumption_kwh,
        AVG(ec.co2e_emitted) as avg_co2e_emitted,
        SUM(ec.co2e_emitted) / b.sq_footage as co2e_per_sqft
      FROM buildings b
      LEFT JOIN energy_consumption ec ON b.building_id = ec.building_id AND ${whereClause.replace('WHERE ', '')}
      GROUP BY b.building_id, b.name, b.primary_use, b.sq_footage
      ORDER BY total_co2e_emitted DESC NULLS LAST
    `, params);

    res.json({
      dateRange: { startDate, endDate },
      source: source || 'all',
      buildings: summaryResult.rows.map(row => ({
        buildingId: row.building_id,
        buildingName: row.building_name,
        primaryUse: row.primary_use,
        sqFootage: parseInt(row.sq_footage),
        totalRecords: parseInt(row.total_records) || 0,
        totalConsumptionKwh: parseFloat(row.total_consumption_kwh) || 0,
        totalCo2eEmitted: parseFloat(row.total_co2e_emitted) || 0,
        avgConsumptionKwh: parseFloat(row.avg_consumption_kwh) || 0,
        avgCo2eEmitted: parseFloat(row.avg_co2e_emitted) || 0,
        co2ePerSqft: parseFloat(row.co2e_per_sqft) || 0
      }))
    });

  } catch (error) {
    console.error('Energy summary error:', error);
    res.status(500).json({
      error: 'Failed to fetch energy consumption summary',
      code: 'ENERGY_SUMMARY_ERROR'
    });
  }
});

// Get energy consumption trends
router.get('/trends', optionalAuth, validateDateRange, async (req, res) => {
  try {
    const { building_id, source, period = 'daily', start_date, end_date } = req.query;
    
    // Default date range
    const defaultStartDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const startDate = start_date || defaultStartDate;
    const endDate = end_date || new Date().toISOString().split('T')[0];

    let dateGrouping;
    switch (period) {
      case 'hourly':
        dateGrouping = "DATE_TRUNC('hour', ec.date_time)";
        break;
      case 'weekly':
        dateGrouping = "DATE_TRUNC('week', ec.date_time)";
        break;
      case 'monthly':
        dateGrouping = "DATE_TRUNC('month', ec.date_time)";
        break;
      default:
        dateGrouping = "DATE_TRUNC('day', ec.date_time)";
    }

    let whereClause = 'WHERE DATE(ec.date_time) BETWEEN $1 AND $2';
    let params = [startDate, endDate];
    let paramIndex = 3;

    if (building_id) {
      whereClause += ` AND ec.building_id = $${paramIndex}`;
      params.push(building_id);
      paramIndex++;
    }

    if (source) {
      whereClause += ` AND ec.source = $${paramIndex}`;
      params.push(source);
      paramIndex++;
    }

    // Limit data for non-admin users
    if (!req.user || req.user.role !== 'admin') {
      whereClause += ' AND ec.date_time >= CURRENT_DATE - INTERVAL \'30 days\'';
    }

    const trendsResult = await query(`
      SELECT 
        ${dateGrouping} as period,
        COUNT(ec.record_id) as record_count,
        SUM(ec.consumption_kwh) as total_consumption_kwh,
        SUM(ec.co2e_emitted) as total_co2e_emitted,
        AVG(ec.consumption_kwh) as avg_consumption_kwh,
        AVG(ec.co2e_emitted) as avg_co2e_emitted
      FROM energy_consumption ec
      ${whereClause}
      GROUP BY ${dateGrouping}
      ORDER BY period
    `, params);

    res.json({
      dateRange: { startDate, endDate },
      period,
      buildingId: building_id || null,
      source: source || 'all',
      trends: trendsResult.rows.map(row => ({
        period: row.period,
        recordCount: parseInt(row.record_count),
        totalConsumptionKwh: parseFloat(row.total_consumption_kwh),
        totalCo2eEmitted: parseFloat(row.total_co2e_emitted),
        avgConsumptionKwh: parseFloat(row.avg_consumption_kwh),
        avgCo2eEmitted: parseFloat(row.avg_co2e_emitted)
      }))
    });

  } catch (error) {
    console.error('Energy trends error:', error);
    res.status(500).json({
      error: 'Failed to fetch energy consumption trends',
      code: 'ENERGY_TRENDS_ERROR'
    });
  }
});

// Get peak consumption analysis (admin only)
router.get('/analysis/peaks', requireAdmin, async (req, res) => {
  try {
    const { building_id, days = 30 } = req.query;

    let whereClause = 'WHERE ec.date_time >= CURRENT_DATE - INTERVAL $1';
    let params = [`${days} days`];
    let paramIndex = 2;

    if (building_id) {
      whereClause += ` AND ec.building_id = $${paramIndex}`;
      params.push(building_id);
      paramIndex++;
    }

    const peakAnalysisResult = await query(`
      WITH hourly_consumption AS (
        SELECT 
          b.name AS building_name,
          EXTRACT(HOUR FROM ec.date_time) AS hour_of_day,
          AVG(ec.consumption_kwh) AS avg_hourly_kwh,
          AVG(ec.co2e_emitted) AS avg_hourly_co2e
        FROM energy_consumption ec
        INNER JOIN buildings b ON ec.building_id = b.building_id
        ${whereClause}
        GROUP BY b.building_id, b.name, EXTRACT(HOUR FROM ec.date_time)
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
      ORDER BY building_name, consumption_rank
    `, params);

    res.json({
      period: `${days} days`,
      buildingId: building_id || 'all',
      peakHours: peakAnalysisResult.rows
    });

  } catch (error) {
    console.error('Peak analysis error:', error);
    res.status(500).json({
      error: 'Failed to fetch peak consumption analysis',
      code: 'PEAK_ANALYSIS_ERROR'
    });
  }
});

module.exports = router;
