const express = require('express');
const { query } = require('../config/database');
const { requireAdmin, requireUser, optionalAuth } = require('../middleware/auth');
const { validateInitiative, validatePagination, validateUUID } = require('../middleware/validation');

const router = express.Router();

// Get all initiatives (public with optional auth for more details)
router.get('/', optionalAuth, validatePagination, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    let params = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND i.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    // Get total count
    const countResult = await query(
      `SELECT COUNT(*) as total FROM initiatives i ${whereClause}`,
      params
    );

    // Get paginated results
    const initiativesResult = await query(
      `SELECT 
        i.initiative_id,
        i.name,
        i.description,
        i.target_reduction_tco2e,
        i.actual_reduction_tco2e,
        i.status,
        i.start_date,
        i.end_date,
        i.created_at,
        i.updated_at,
        u.first_name,
        u.last_name,
        u.email
      FROM initiatives i
      LEFT JOIN users u ON i.created_by = u.user_id
      ${whereClause}
      ORDER BY 
        CASE i.status 
          WHEN 'active' THEN 1 
          WHEN 'planned' THEN 2 
          WHEN 'completed' THEN 3 
          ELSE 4 
        END,
        i.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limit);

    res.json({
      initiatives: initiativesResult.rows.map(initiative => ({
        id: initiative.initiative_id,
        name: initiative.name,
        description: initiative.description,
        targetReductionTco2e: parseFloat(initiative.target_reduction_tco2e) || 0,
        actualReductionTco2e: parseFloat(initiative.actual_reduction_tco2e) || 0,
        achievementRate: initiative.target_reduction_tco2e > 0 ? 
          ((parseFloat(initiative.actual_reduction_tco2e) / parseFloat(initiative.target_reduction_tco2e)) * 100).toFixed(1) : 
          '0',
        status: initiative.status,
        startDate: initiative.start_date,
        endDate: initiative.end_date,
        createdAt: initiative.created_at,
        updatedAt: initiative.updated_at,
        createdBy: initiative.first_name ? {
          name: `${initiative.first_name} ${initiative.last_name}`,
          email: req.user && req.user.role === 'admin' ? initiative.email : null
        } : null
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
    console.error('Initiatives fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch initiatives',
      code: 'INITIATIVES_FETCH_ERROR'
    });
  }
});

// Get single initiative
router.get('/:initiativeId', optionalAuth, validateUUID('initiativeId'), async (req, res) => {
  try {
    const { initiativeId } = req.params;

    const initiativeResult = await query(
      `SELECT 
        i.initiative_id,
        i.name,
        i.description,
        i.target_reduction_tco2e,
        i.actual_reduction_tco2e,
        i.status,
        i.start_date,
        i.end_date,
        i.created_at,
        i.updated_at,
        u.first_name,
        u.last_name,
        u.email
      FROM initiatives i
      LEFT JOIN users u ON i.created_by = u.user_id
      WHERE i.initiative_id = $1`,
      [initiativeId]
    );

    if (initiativeResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Initiative not found',
        code: 'INITIATIVE_NOT_FOUND'
      });
    }

    const initiative = initiativeResult.rows[0];

    res.json({
      initiative: {
        id: initiative.initiative_id,
        name: initiative.name,
        description: initiative.description,
        targetReductionTco2e: parseFloat(initiative.target_reduction_tco2e) || 0,
        actualReductionTco2e: parseFloat(initiative.actual_reduction_tco2e) || 0,
        achievementRate: initiative.target_reduction_tco2e > 0 ? 
          ((parseFloat(initiative.actual_reduction_tco2e) / parseFloat(initiative.target_reduction_tco2e)) * 100).toFixed(1) : 
          '0',
        status: initiative.status,
        startDate: initiative.start_date,
        endDate: initiative.end_date,
        createdAt: initiative.created_at,
        updatedAt: initiative.updated_at,
        createdBy: initiative.first_name ? {
          name: `${initiative.first_name} ${initiative.last_name}`,
          email: req.user && req.user.role === 'admin' ? initiative.email : null
        } : null
      }
    });

  } catch (error) {
    console.error('Initiative details fetch error:', error);
    res.status(500).json({
      error: 'Failed to fetch initiative details',
      code: 'INITIATIVE_DETAILS_ERROR'
    });
  }
});

// Create new initiative (users can suggest, admins can create directly)
router.post('/', requireUser, validateInitiative, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const userRole = req.user.role;
    const { name, description, target_reduction_tco2e, start_date, end_date } = req.body;

    // Users can only suggest initiatives (status: planned), admins can create active ones
    const status = userRole === 'admin' ? (req.body.status || 'planned') : 'planned';

    const result = await query(
      `INSERT INTO initiatives (name, description, target_reduction_tco2e, status, start_date, end_date, created_by) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) 
       RETURNING initiative_id, name, description, target_reduction_tco2e, status, start_date, end_date, created_at`,
      [name, description, target_reduction_tco2e, status, start_date, end_date, userId]
    );

    const newInitiative = result.rows[0];

    res.status(201).json({
      message: userRole === 'admin' ? 'Initiative created successfully' : 'Initiative suggestion submitted successfully',
      initiative: {
        id: newInitiative.initiative_id,
        name: newInitiative.name,
        description: newInitiative.description,
        targetReductionTco2e: parseFloat(newInitiative.target_reduction_tco2e) || 0,
        status: newInitiative.status,
        startDate: newInitiative.start_date,
        endDate: newInitiative.end_date,
        createdAt: newInitiative.created_at
      }
    });

  } catch (error) {
    console.error('Initiative creation error:', error);
    res.status(500).json({
      error: 'Failed to create initiative',
      code: 'INITIATIVE_CREATE_ERROR'
    });
  }
});

// Update initiative (admin only)
router.put('/:initiativeId', requireAdmin, validateUUID('initiativeId'), validateInitiative, async (req, res) => {
  try {
    const { initiativeId } = req.params;
    const { name, description, target_reduction_tco2e, actual_reduction_tco2e, status, start_date, end_date } = req.body;

    const result = await query(
      `UPDATE initiatives 
       SET name = $1, description = $2, target_reduction_tco2e = $3, actual_reduction_tco2e = $4, 
           status = $5, start_date = $6, end_date = $7, updated_at = CURRENT_TIMESTAMP
       WHERE initiative_id = $8
       RETURNING initiative_id, name, description, target_reduction_tco2e, actual_reduction_tco2e, 
                 status, start_date, end_date, created_at, updated_at`,
      [name, description, target_reduction_tco2e, actual_reduction_tco2e || 0, status, start_date, end_date, initiativeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Initiative not found',
        code: 'INITIATIVE_NOT_FOUND'
      });
    }

    const updatedInitiative = result.rows[0];

    res.json({
      message: 'Initiative updated successfully',
      initiative: {
        id: updatedInitiative.initiative_id,
        name: updatedInitiative.name,
        description: updatedInitiative.description,
        targetReductionTco2e: parseFloat(updatedInitiative.target_reduction_tco2e) || 0,
        actualReductionTco2e: parseFloat(updatedInitiative.actual_reduction_tco2e) || 0,
        achievementRate: updatedInitiative.target_reduction_tco2e > 0 ? 
          ((parseFloat(updatedInitiative.actual_reduction_tco2e) / parseFloat(updatedInitiative.target_reduction_tco2e)) * 100).toFixed(1) : 
          '0',
        status: updatedInitiative.status,
        startDate: updatedInitiative.start_date,
        endDate: updatedInitiative.end_date,
        createdAt: updatedInitiative.created_at,
        updatedAt: updatedInitiative.updated_at
      }
    });

  } catch (error) {
    console.error('Initiative update error:', error);
    res.status(500).json({
      error: 'Failed to update initiative',
      code: 'INITIATIVE_UPDATE_ERROR'
    });
  }
});

// Delete initiative (admin only)
router.delete('/:initiativeId', requireAdmin, validateUUID('initiativeId'), async (req, res) => {
  try {
    const { initiativeId } = req.params;

    const result = await query(
      'DELETE FROM initiatives WHERE initiative_id = $1 RETURNING initiative_id, name',
      [initiativeId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Initiative not found',
        code: 'INITIATIVE_NOT_FOUND'
      });
    }

    res.json({
      message: 'Initiative deleted successfully',
      deletedInitiative: {
        id: result.rows[0].initiative_id,
        name: result.rows[0].name
      }
    });

  } catch (error) {
    console.error('Initiative deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete initiative',
      code: 'INITIATIVE_DELETE_ERROR'
    });
  }
});

// Get initiative statistics
router.get('/stats/overview', optionalAuth, async (req, res) => {
  try {
    const overviewResult = await query(`
      SELECT 
        COUNT(*) as total_initiatives,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_initiatives,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_initiatives,
        COUNT(CASE WHEN status = 'planned' THEN 1 END) as planned_initiatives,
        COALESCE(SUM(target_reduction_tco2e), 0) as total_target_reduction,
        COALESCE(SUM(actual_reduction_tco2e), 0) as total_actual_reduction,
        COALESCE(AVG(target_reduction_tco2e), 0) as avg_target_reduction,
        COALESCE(AVG(actual_reduction_tco2e), 0) as avg_actual_reduction
      FROM initiatives
    `);

    const overview = overviewResult.rows[0];
    const totalTarget = parseFloat(overview.total_target_reduction);
    const totalActual = parseFloat(overview.total_actual_reduction);

    // Get top performing initiatives
    const topInitiativesResult = await query(`
      SELECT 
        initiative_id,
        name,
        target_reduction_tco2e,
        actual_reduction_tco2e,
        status,
        CASE 
          WHEN target_reduction_tco2e > 0 THEN 
            (actual_reduction_tco2e / target_reduction_tco2e) * 100
          ELSE 0
        END as achievement_rate
      FROM initiatives
      WHERE status IN ('active', 'completed')
      AND target_reduction_tco2e > 0
      ORDER BY achievement_rate DESC
      LIMIT 5
    `);

    res.json({
      overview: {
        totalInitiatives: parseInt(overview.total_initiatives),
        activeInitiatives: parseInt(overview.active_initiatives),
        completedInitiatives: parseInt(overview.completed_initiatives),
        plannedInitiatives: parseInt(overview.planned_initiatives),
        totalTargetReduction: totalTarget,
        totalActualReduction: totalActual,
        overallAchievementRate: totalTarget > 0 ? ((totalActual / totalTarget) * 100).toFixed(1) : '0',
        avgTargetReduction: parseFloat(overview.avg_target_reduction),
        avgActualReduction: parseFloat(overview.avg_actual_reduction)
      },
      topPerformingInitiatives: topInitiativesResult.rows.map(initiative => ({
        id: initiative.initiative_id,
        name: initiative.name,
        targetReduction: parseFloat(initiative.target_reduction_tco2e),
        actualReduction: parseFloat(initiative.actual_reduction_tco2e),
        status: initiative.status,
        achievementRate: parseFloat(initiative.achievement_rate).toFixed(1)
      }))
    });

  } catch (error) {
    console.error('Initiative stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch initiative statistics',
      code: 'INITIATIVE_STATS_ERROR'
    });
  }
});

// Get initiatives by status breakdown
router.get('/stats/status-breakdown', optionalAuth, async (req, res) => {
  try {
    const statusBreakdownResult = await query(`
      SELECT 
        status,
        COUNT(*) as count,
        COALESCE(SUM(target_reduction_tco2e), 0) as total_target,
        COALESCE(SUM(actual_reduction_tco2e), 0) as total_actual,
        COALESCE(AVG(target_reduction_tco2e), 0) as avg_target,
        COALESCE(AVG(actual_reduction_tco2e), 0) as avg_actual
      FROM initiatives
      GROUP BY status
      ORDER BY 
        CASE status 
          WHEN 'active' THEN 1 
          WHEN 'planned' THEN 2 
          WHEN 'completed' THEN 3 
          ELSE 4 
        END
    `);

    res.json({
      statusBreakdown: statusBreakdownResult.rows.map(row => ({
        status: row.status,
        count: parseInt(row.count),
        totalTarget: parseFloat(row.total_target),
        totalActual: parseFloat(row.total_actual),
        avgTarget: parseFloat(row.avg_target),
        avgActual: parseFloat(row.avg_actual),
        achievementRate: row.total_target > 0 ? 
          ((parseFloat(row.total_actual) / parseFloat(row.total_target)) * 100).toFixed(1) : 
          '0'
      }))
    });

  } catch (error) {
    console.error('Status breakdown error:', error);
    res.status(500).json({
      error: 'Failed to fetch status breakdown',
      code: 'STATUS_BREAKDOWN_ERROR'
    });
  }
});

// Update initiative progress (admin only)
router.patch('/:initiativeId/progress', requireAdmin, validateUUID('initiativeId'), async (req, res) => {
  try {
    const { initiativeId } = req.params;
    const { actual_reduction_tco2e, status } = req.body;

    // Validate input
    if (actual_reduction_tco2e !== undefined && (isNaN(actual_reduction_tco2e) || actual_reduction_tco2e < 0)) {
      return res.status(400).json({
        error: 'Actual reduction must be a non-negative number',
        code: 'INVALID_REDUCTION_VALUE'
      });
    }

    if (status && !['planned', 'active', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status value',
        code: 'INVALID_STATUS'
      });
    }

    let updateFields = [];
    let params = [];
    let paramIndex = 1;

    if (actual_reduction_tco2e !== undefined) {
      updateFields.push(`actual_reduction_tco2e = $${paramIndex}`);
      params.push(actual_reduction_tco2e);
      paramIndex++;
    }

    if (status) {
      updateFields.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        error: 'No valid fields to update',
        code: 'NO_UPDATE_FIELDS'
      });
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(initiativeId);

    const result = await query(
      `UPDATE initiatives 
       SET ${updateFields.join(', ')}
       WHERE initiative_id = $${paramIndex}
       RETURNING initiative_id, name, target_reduction_tco2e, actual_reduction_tco2e, status, updated_at`,
      params
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Initiative not found',
        code: 'INITIATIVE_NOT_FOUND'
      });
    }

    const updatedInitiative = result.rows[0];

    res.json({
      message: 'Initiative progress updated successfully',
      initiative: {
        id: updatedInitiative.initiative_id,
        name: updatedInitiative.name,
        targetReduction: parseFloat(updatedInitiative.target_reduction_tco2e) || 0,
        actualReduction: parseFloat(updatedInitiative.actual_reduction_tco2e) || 0,
        achievementRate: updatedInitiative.target_reduction_tco2e > 0 ? 
          ((parseFloat(updatedInitiative.actual_reduction_tco2e) / parseFloat(updatedInitiative.target_reduction_tco2e)) * 100).toFixed(1) : 
          '0',
        status: updatedInitiative.status,
        updatedAt: updatedInitiative.updated_at
      }
    });

  } catch (error) {
    console.error('Initiative progress update error:', error);
    res.status(500).json({
      error: 'Failed to update initiative progress',
      code: 'PROGRESS_UPDATE_ERROR'
    });
  }
});

module.exports = router;
