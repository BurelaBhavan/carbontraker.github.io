const { body, param, query, validationResult } = require('express-validator');

// Handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// User registration validation
const validateUserRegistration = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  body('firstName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters'),
  body('lastName')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters'),
  body('department')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Department must be less than 100 characters'),
  handleValidationErrors
];

// User login validation
const validateUserLogin = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required'),
  handleValidationErrors
];

// Transportation log validation
const validateTransportationLog = [
  body('date')
    .isISO8601()
    .toDate()
    .withMessage('Valid date is required (YYYY-MM-DD format)'),
  body('mode')
    .isIn(['car', 'bus', 'bike', 'walk', 'air', 'train', 'metro'])
    .withMessage('Invalid transportation mode'),
  body('distance_km')
    .isFloat({ min: 0, max: 10000 })
    .withMessage('Distance must be a positive number less than 10,000 km'),
  handleValidationErrors
];

// Energy consumption validation
const validateEnergyConsumption = [
  body('building_id')
    .isUUID()
    .withMessage('Valid building ID is required'),
  body('date_time')
    .isISO8601()
    .toDate()
    .withMessage('Valid date and time is required'),
  body('source')
    .isIn(['electricity', 'gas', 'fuel', 'steam'])
    .withMessage('Invalid energy source'),
  body('consumption_kwh')
    .isFloat({ min: 0, max: 1000000 })
    .withMessage('Consumption must be a positive number'),
  handleValidationErrors
];

// Initiative validation
const validateInitiative = [
  body('name')
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Initiative name must be between 3 and 200 characters'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('target_reduction_tco2e')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Target reduction must be a positive number'),
  body('status')
    .optional()
    .isIn(['planned', 'active', 'completed', 'cancelled'])
    .withMessage('Invalid status'),
  body('start_date')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Valid start date is required'),
  body('end_date')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Valid end date is required'),
  handleValidationErrors
];

// Building validation
const validateBuilding = [
  body('name')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Building name must be between 2 and 100 characters'),
  body('sq_footage')
    .isInt({ min: 1, max: 10000000 })
    .withMessage('Square footage must be a positive integer'),
  body('primary_use')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Primary use must be between 2 and 50 characters'),
  body('location_gps')
    .optional()
    .matches(/^POINT\(-?\d+\.?\d*\s+-?\d+\.?\d*\)$/)
    .withMessage('Invalid GPS coordinates format (use POINT(longitude latitude))'),
  handleValidationErrors
];

// Query parameter validation
const validateDateRange = [
  query('start_date')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Valid start date is required (YYYY-MM-DD format)'),
  query('end_date')
    .optional()
    .isISO8601()
    .toDate()
    .withMessage('Valid end date is required (YYYY-MM-DD format)'),
  handleValidationErrors
];

// Pagination validation
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  handleValidationErrors
];

// UUID parameter validation
const validateUUID = (paramName) => [
  param(paramName)
    .isUUID()
    .withMessage(`${paramName} must be a valid UUID`),
  handleValidationErrors
];

module.exports = {
  validateUserRegistration,
  validateUserLogin,
  validateTransportationLog,
  validateEnergyConsumption,
  validateInitiative,
  validateBuilding,
  validateDateRange,
  validatePagination,
  validateUUID,
  handleValidationErrors
};
