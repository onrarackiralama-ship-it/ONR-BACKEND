// src/middleware/auth.js - Admin Authentication Middleware
const jwt = require("jsonwebtoken");
const Admin = require("../models/Admin");

// Admin auth middleware
const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'No token provided'
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const admin = await Admin.findByPk(decoded.id);
    if (!admin || !admin.isActive) {
      return res.status(401).json({
        error: 'Access denied',
        message: 'Invalid token or inactive account'
      });
    }

    // Check if account is locked
    if (admin.lockUntil && admin.lockUntil > new Date()) {
      return res.status(423).json({
        error: 'Account locked',
        message: 'Account is temporarily locked'
      });
    }

    req.admin = admin;
    next();
  } catch (error) {
    console.error('❌ Auth middleware error:', error);
    res.status(401).json({
      error: 'Access denied',
      message: 'Invalid token'
    });
  }
};

// Permission middleware
const requirePermission = (module, action) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please login first'
      });
    }

    if (!req.admin.hasPermission(module, action)) {
      return res.status(403).json({
        error: 'Permission denied',
        message: `You don't have permission to ${action} ${module}`
      });
    }

    next();
  };
};

// Role middleware
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'Please login first'
      });
    }

    if (!roles.includes(req.admin.role)) {
      return res.status(403).json({
        error: 'Role required',
        message: `This action requires one of these roles: ${roles.join(', ')}`
      });
    }

    next();
  };
};

// Declarative authorization for the admin router (see routes/admin.js).
// `adminAuth`/`protect` only proves a valid, active token (authentication).
// This middleware enforces WHAT that admin may do (authorization): it maps the
// request's resource segment -> permission module and the HTTP method -> action,
// then enforces req.admin.hasPermission(module, action). It FAILS CLOSED — any
// route whose resource segment or method isn't mapped below is denied (403)
// rather than implicitly allowed.
const MODULE_BY_SEGMENT = {
  dashboard: "bookings",        // read-only aggregate of booking/car stats
  bookings: "bookings",
  cars: "cars",
  listings: "cars",             // public car listings; admin mutations reuse the cars module
  transfers: "cars",            // transfers reuse the cars module (no dedicated module in the permission model yet)
  news: "content",
  blogs: "content",
  locations: "locations",
  database: "settings",         // DB monitoring is sensitive -> settings (super_admin only)
  "exchange-rates": "settings",
};

const ACTION_BY_METHOD = {
  GET: "read",
  HEAD: "read",
  POST: "create",
  PUT: "update",
  PATCH: "update",
  DELETE: "delete",
};

const authorizeAdminRoute = (req, res, next) => {
  if (!req.admin) {
    return res.status(401).json({
      error: "Authentication required",
      message: "Please login first",
    });
  }

  // Mount-agnostic: scan path segments for the first that maps to a module,
  // so this works regardless of where the router is mounted.
  const segment = req.path
    .split("/")
    .filter(Boolean)
    .find((s) => MODULE_BY_SEGMENT[s]);
  const permModule = segment ? MODULE_BY_SEGMENT[segment] : null;
  const action = ACTION_BY_METHOD[req.method] || null;

  if (!permModule || !action || !req.admin.hasPermission(permModule, action)) {
    return res.status(403).json({
      error: "Permission denied",
      message: `You don't have permission to ${action || "access"} ${permModule || "this resource"}`,
    });
  }

  next();
};

module.exports = {
  adminAuth,
  requirePermission,
  requireRole,
  authorizeAdminRoute,
  // Backward compatibility
  auth: adminAuth
};