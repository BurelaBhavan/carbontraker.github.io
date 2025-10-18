const express = require('express');
const { query } = require('../config/database');
const { requireAdmin, optionalAuth } = require('../middleware/auth');
const { validateBuilding, validatePagination, validateUUID } = require('../middleware/validation');

const router = express.Router();

// Get all buildings (public)
router.get('/', optionalAuth, validatePagination, async (req, res) => {
  try {
    const { page = 1, limit = 20, primary_use } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let params = [];
    let paramIndex = 1;

    if (primary_use) {
      whereClause += ` AND primary_use = $${paramIndex}`;
      params.push(primary_use);
      paramIndex++;
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM buildings ${whereClause}`,
      params
    );

    // Get paginated results
    const buildingsResult = await query(
      `SELECT 
        building_id,
        name,
        sq_footage,
        primary_use,
        location_gps,
        created_at,
        updated_at
      FROM buildings
      ${whereClause}
      ORDER BY name
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      buildings: buildingsResult.rows.map(building => ({
        id: building.building_id,
        name: building.name,
        sqFootage: parseInt(building.sq_footage),
        primaryUse: building.primary_use,
        locationGps: building.location_gps,
        createdAt: building.created_at,
        updatedAt: building.updated_at
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
    console.error('Buildings fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch buildings',
      code: 'BUILDINGS_FETCH_ERROR'
    });
  }
});

// Get single building with performance data
router.get('/:buildingId', optionalAuth, validateUUID('buildingId'), async (req, res) => {
  try {
    const { buildingId } = req.params;

    // Get building details
    const buildingResult = await query(
      `SELECT 
        building_id,
        name,
        sq_footage,
        primary_use,
        location_gps,
        created_at,
        updated_at
      FROM buildings 
      WHERE building_id = $1`,
      [buildingId]
    );

    if (buildingResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Building not found',
        code: 'BUILDING_NOT_FOUND'
      });
    }

    const building = buildingResult.rows[0];

    // Get performance data (last 30 days)
    const performanceResult = await query(`
      SELECT 
        COUNT(ec.record_id) as total_records,
        SUM(ec.consumption_kwh) as total_consumption_kwh,
        SUM(ec.co2e_emitted) as total_co2e_emitted,
        AVG(ec.consumption_kwh) as avg_consumption_kwh,
        AVG(ec.co2e_emitted) as avg_co2e_emitted
      FROM energy_consumption ec
      WHERE ec.building_id = $1
      AND ec.date_time >= CURRENT_DATE - INTERVAL '30 days'
    `, [buildingId]);

    // Get recent consumption by source
    const sourceBreakdownResult = await query(`
      SELECT 
        ec.source,
        COUNT(ec.record_id) as record_count,
        SUM(ec.consumption_kwh) as total_consumption_kwh,
        SUM(ec.co2e_emitted) as total_co2e_emitted
      FROM energy_consumption ec
      WHERE ec.building_id = $1
      AND ec.date_time >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY ec.source
      ORDER BY total_co2e_emitted DESC
    `, [buildingId]);

    const performance = performanceResult.rows[0];

    res.json({
      building: {
        id: building.building_id,
        name: building.name,
        sqFootage: parseInt(building.sq_footage),
        primaryUse: building.primary_use,
        locationGps: building.location_gps,
        createdAt: building.created_at,
        updatedAt: building.updated_at
      },
      performance: {
        totalRecords: parseInt(performance.total_records) || 0,
        totalConsumptionKwh: parseFloat(performance.total_consumption_kwh) || 0,
        totalCo2eEmitted: parseFloat(performance.total_co2e_emitted) || 0,
        avgConsumptionKwh: parseFloat(performance.avg_consumption_kwh) || 0,
        avgCo2eEmitted: parseFloat(performance.avg_co2e_emitted) || 0,
        co2ePerSqft: building.sq_footage > 0 ? 
          (parseFloat(performance.total_co2e_emitted) || 0) / parseInt(building.sq_footage) : 0
      },
      sourceBreakdown: sourceBreakdownResult.rows.map(row => ({
        source: row.source,
        recordCount: parseInt(row.record_count),
        totalConsumptionKwh: parseFloat(row.total_consumption_kwh),
        totalCo2eEmitted: parseFloat(row.total_co2e_emitted)
      }))
    });

  } catch (error) {
    console.error('Building details fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch building details',
      code: 'BUILDING_DETAILS_ERROR'
    });
  }
});

// Add new building (admin only)
router.post('/', requireAdmin, validateBuilding, async (req, res) => {
  try {
    const { name, sq_footage, primary_use, location_gps } = req.body;

    // Check if building name already exists
    const existingBuilding = await query(
      'SELECT building_id FROM buildings WHERE name = $1',
      [name]
    );

    if (existingBuilding.rows.length > 0) {
      return res.status(409).json({
        error: 'Building with this name already exists',
        code: 'BUILDING_EXISTS'
      });
    }

    const result = await query(
      `INSERT INTO buildings (name, sq_footage, primary_use, location_gps) 
       VALUES ($1, $2, $3, $4) 
       RETURNING building_id, name, sq_footage, primary_use, location_gps, created_at`,
      [name, sq_footage, primary_use, location_gps || null]
    );

    const newBuilding = result.rows[0];

    res.status(201).json({
      message: 'Building added successfully',
      building: {
        id: newBuilding.building_id,
        name: newBuilding.name,
        sqFootage: parseInt(newBuilding.sq_footage),
        primaryUse: newBuilding.primary_use,
        locationGps: newBuilding.location_gps,
        createdAt: newBuilding.created_at
      }
    });

  } catch (error) {
    console.error('Building creation error:', error);
    res.status(500).json({
      error: 'Failed to add building',
      code: 'BUILDING_CREATE_ERROR'
    });
  }
});

// Update building (admin only)
router.put('/:buildingId', requireAdmin, validateUUID('buildingId'), validateBuilding, async (req, res) => {
  try {
    const { buildingId } = req.params;
    const { name, sq_footage, primary_use, location_gps } = req.body;

    // Check if another building has the same name
    const existingBuilding = await query(
      'SELECT building_id FROM buildings WHERE name = $1 AND building_id != $2',
      [name, buildingId]
    );

    if (existingBuilding.rows.length > 0) {
      return res.status(409).json({
        error: 'Another building with this name already exists',
        code: 'BUILDING_NAME_EXISTS'
      });
    }

    const result = await query(
      `UPDATE buildings 
       SET name = $1, sq_footage = $2, primary_use = $3, location_gps = $4, updated_at = CURRENT_TIMESTAMP
       WHERE building_id = $5
       RETURNING building_id, name, sq_footage, primary_use, location_gps, created_at, updated_at`,
      [name, sq_footage, primary_use, location_gps || null, buildingId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Building not found',
        code: 'BUILDING_NOT_FOUND'
      });
    }

    const updatedBuilding = result.rows[0];

    res.json({
      message: 'Building updated successfully',
      building: {
        id: updatedBuilding.building_id,
        name: updatedBuilding.name,
        sqFootage: parseInt(updatedBuilding.sq_footage),
        primaryUse: updatedBuilding.primary_use,
        locationGps: updatedBuilding.location_gps,
        createdAt: updatedBuilding.created_at,
        updatedAt: updatedBuilding.updated_at
      }
    });

  } catch (error) {
    console.error('Building update error:', error);
    res.status(500).json({
      error: 'Failed to update building',
      code: 'BUILDING_UPDATE_ERROR'
    });
  }
});

// Delete building (admin only)
router.delete('/:buildingId', requireAdmin, validateUUID('buildingId'), async (req, res) => {
  try {
    const { buildingId } = req.params;

    // Check if building has energy consumption records
    const consumptionCheck = await query(
      'SELECT COUNT(*) as count FROM energy_consumption WHERE building_id = $1',
      [buildingId]
    );

    const hasConsumptionData = parseInt(consumptionCheck.rows[0].count) > 0;

    if (hasConsumptionData) {
      return res.status(400).json({
        error: 'Cannot delete building with existing energy consumption data',
        code: 'BUILDING_HAS_DATA',
        details: 'Please delete all energy consumption records for this building first'
      });
    }

    const result = await query(
      'DELETE FROM buildings WHERE building_id = $1 RETURNING building_id, name',
      [buildingId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Building not found',
        code: 'BUILDING_NOT_FOUND'
      });
    }

    res.json({
      message: 'Building deleted successfully',
      deletedBuilding: {
        id: result.rows[0].building_id,
        name: result.rows[0].name
      }
    });

  } catch (error) {
    console.error('Building deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete building',
      code: 'BUILDING_DELETE_ERROR'
    });
  }
});

// Get building performance comparison
router.get('/analysis/performance', optionalAuth, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const performanceResult = await query(`
      SELECT 
        b.building_id,
        b.name,
        b.primary_use,
        b.sq_footage,
        COALESCE(SUM(ec.co2e_emitted), 0) as total_co2e,
        COALESCE(SUM(ec.consumption_kwh), 0) as total_consumption_kwh,
        COALESCE(SUM(ec.co2e_emitted) / NULLIF(b.sq_footage, 0), 0) as co2e_per_sqft,
        COUNT(ec.record_id) as record_count,
        RANK() OVER (ORDER BY COALESCE(SUM(ec.co2e_emitted), 0) DESC) as emission_rank,
        RANK() OVER (ORDER BY COALESCE(SUM(ec.co2e_emitted) / NULLIF(b.sq_footage, 0), 0) DESC) as efficiency_rank
      FROM buildings b
      LEFT JOIN energy_consumption ec ON b.building_id = ec.building_id 
        AND ec.date_time >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY b.building_id, b.name, b.primary_use, b.sq_footage
      ORDER BY total_co2e DESC
    `);

    // Calculate percentiles for efficiency rating
    const buildings = performanceResult.rows;
    const totalBuildings = buildings.length;

    const buildingsWithRatings = buildings.map((building, index) => {
      let efficiencyRating;
      const percentile = (totalBuildings - building.efficiency_rank + 1) / totalBuildings;
      
      if (percentile >= 0.75) efficiencyRating = 'Excellent';
      else if (percentile >= 0.5) efficiencyRating = 'Good';
      else if (percentile >= 0.25) efficiencyRating = 'Average';
      else efficiencyRating = 'Needs Improvement';

      return {
        buildingId: building.building_id,
        name: building.name,
        primaryUse: building.primary_use,
        sqFootage: parseInt(building.sq_footage),
        totalCo2e: parseFloat(building.total_co2e),
        totalConsumptionKwh: parseFloat(building.total_consumption_kwh),
        co2ePerSqft: parseFloat(building.co2e_per_sqft),
        recordCount: parseInt(building.record_count),
        emissionRank: parseInt(building.emission_rank),
        efficiencyRank: parseInt(building.efficiency_rank),
        efficiencyRating
      };
    });

    res.json({
      period: `${days} days`,
      totalBuildings,
      buildings: buildingsWithRatings
    });

  } catch (error) {
    console.error('Building performance analysis error:', error);
    res.status(500).json({
      error: 'Failed to fetch building performance analysis',
      code: 'PERFORMANCE_ANALYSIS_ERROR'
    });
  }
});

// Get building types summary
router.get('/summary/types', optionalAuth, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const typeSummaryResult = await query(`
      SELECT 
        b.primary_use,
        COUNT(b.building_id) as building_count,
        SUM(b.sq_footage) as total_sq_footage,
        AVG(b.sq_footage) as avg_sq_footage,
        COALESCE(SUM(ec.co2e_emitted), 0) as total_co2e,
        COALESCE(AVG(ec.co2e_emitted), 0) as avg_co2e_per_record,
        COALESCE(SUM(ec.consumption_kwh), 0) as total_consumption_kwh
      FROM buildings b
      LEFT JOIN energy_consumption ec ON b.building_id = ec.building_id 
        AND ec.date_time >= CURRENT_DATE - INTERVAL '${days} days'
      GROUP BY b.primary_use
      ORDER BY total_co2e DESC
    `);

    res.json({
      period: `${days} days`,
      buildingTypes: typeSummaryResult.rows.map(row => ({
        primaryUse: row.primary_use,
        buildingCount: parseInt(row.building_count),
        totalSqFootage: parseInt(row.total_sq_footage),
        avgSqFootage: parseFloat(row.avg_sq_footage),
        totalCo2e: parseFloat(row.total_co2e),
        avgCo2ePerRecord: parseFloat(row.avg_co2e_per_record),
        totalConsumptionKwh: parseFloat(row.total_consumption_kwh),
        co2ePerSqft: row.total_sq_footage > 0 ? 
          parseFloat(row.total_co2e) / parseInt(row.total_sq_footage) : 0
      }))
    });

  } catch (error) {
    console.error('Building types summary error:', error);
    res.status(500).json({
      error: 'Failed to fetch building types summary',
      code: 'TYPES_SUMMARY_ERROR'
    });
  }
});

module.exports = router;
