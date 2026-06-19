// src/middleware/security.js - Comprehensive Security Middleware
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { JSDOM } = require("jsdom");
const DOMPurify = require("dompurify");
const validator = require("express-validator");

// Initialize DOMPurify with JSDOM
const window = new JSDOM("").window;
const purify = DOMPurify(window);

// Fields whose value is intentionally rich HTML (rendered via set:html on the
// public site — e.g. the blog post body). These get a WHITELIST sanitize that
// keeps formatting but strips scripts/handlers, instead of the strip-all policy
// applied to every other field. Strip-all here would (a) destroy WYSIWYG
// formatting and (b) was the only thing incidentally preventing stored XSS —
// this whitelist makes the protection explicit and intentional.
const RICH_HTML_FIELDS = new Set(["content"]);

const RICH_HTML_CONFIG = {
  ALLOWED_TAGS: [
    "p", "br", "hr", "span", "strong", "b", "em", "i", "u", "s",
    "h1", "h2", "h3", "h4", "h5", "h6",
    "ul", "ol", "li", "blockquote", "code", "pre", "a", "img",
  ],
  ALLOWED_ATTR: ["href", "title", "target", "rel", "src", "alt"],
  // Belt-and-suspenders on top of the tag/attr whitelist (DOMPurify also blocks
  // javascript:/data: script URIs by default):
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input"],
  FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "style"],
};

const STRICT_CONFIG = { ALLOWED_TAGS: [], ALLOWED_ATTR: [] };

/**
 * Input Sanitization Middleware
 * Sanitizes all string inputs to prevent XSS attacks
 */
const sanitizeInput = (req, res, next) => {
  try {
    // Recursively sanitize. `key` is the property name this string came from,
    // so rich-HTML fields (RICH_HTML_FIELDS) get a formatting-preserving
    // whitelist while every other string is stripped of all markup.
    const sanitizeObject = (obj, key) => {
      if (obj === null || obj === undefined) return obj;

      if (typeof obj === "string") {
        const cfg =
          key && RICH_HTML_FIELDS.has(key) ? RICH_HTML_CONFIG : STRICT_CONFIG;
        return purify.sanitize(obj, cfg);
      }

      if (Array.isArray(obj)) {
        return obj.map((v) => sanitizeObject(v, key));
      }

      if (typeof obj === "object") {
        const sanitized = {};
        for (const [k, value] of Object.entries(obj)) {
          sanitized[k] = sanitizeObject(value, k);
        }
        return sanitized;
      }

      return obj;
    };

    // Sanitize request body
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }

    // Sanitize query parameters
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }

    // Sanitize URL parameters
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }

    next();
  } catch (error) {
    console.error("Error in sanitization middleware:", error);
    return res.status(500).json({
      success: false,
      error: "Input sanitization failed",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

/**
 * Enhanced JSON Error Handling Middleware
 * Handles malformed JSON gracefully
 */
const jsonErrorHandler = (err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    console.error("Malformed JSON detected:", err.message);
    return res.status(400).json({
      success: false,
      error: "Invalid JSON format",
      message: "Request body contains malformed JSON",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  }
  next(err);
};

/**
 * SQL Injection Protection Middleware
 * Detects and blocks potential SQL injection attempts
 */
const sqlInjectionProtection = (req, res, next) => {
  const sqlInjectionPatterns = [
    // More targeted SQL injection patterns
    /('.*(\bor\b|\band\b).*'|'.*=.*')/i,
    /;\s*(drop|delete|insert|update|select)\s+/i,
    /drop\s+table/i,
    /select\s+.+\s+from/i,
    /insert\s+into/i,
    /update\s+.+\s+set/i,
    /delete\s+from/i,
    /union\s+select/i,
    /exec\s*\(/i,
    /execute\s*\(/i,
    /'.*--/i,
    /\/\*.*\*\//i,
    /\bxp_\w+/i,
    /\bsp_\w+/i,
    /-{2,}/i, // SQL comment
  ];

  const checkForSQLInjection = (obj) => {
    if (typeof obj === "string") {
      return sqlInjectionPatterns.some((pattern) => pattern.test(obj));
    }

    if (Array.isArray(obj)) {
      return obj.some(checkForSQLInjection);
    }

    if (typeof obj === "object" && obj !== null) {
      return Object.values(obj).some(checkForSQLInjection);
    }

    return false;
  };

  try {
    // Check all request data for SQL injection patterns
    const inputs = [req.body, req.query, req.params].filter(Boolean);

    for (const input of inputs) {
      if (checkForSQLInjection(input)) {
        console.warn("Potential SQL injection attempt blocked:", {
          ip: req.ip,
          userAgent: req.get("User-Agent"),
          path: req.path,
          method: req.method,
          suspiciousInput: JSON.stringify(input).substring(0, 200),
        });

        return res.status(400).json({
          success: false,
          error: "Invalid input detected",
          message: "Request contains potentially harmful characters",
        });
      }
    }

    next();
  } catch (error) {
    console.error("Error in SQL injection protection:", error);
    return res.status(500).json({
      success: false,
      error: "Security validation failed",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Internal server error",
    });
  }
};

/**
 * Rate Limiting Configurations
 */
const createRateLimit = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: {
      success: false,
      error: "Too many requests",
      message,
      retryAfter: Math.ceil(windowMs / 1000),
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      console.warn("Rate limit exceeded:", {
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        path: req.path,
        method: req.method,
      });

      res.status(429).json({
        success: false,
        error: "Too many requests",
        message: message,
        retryAfter: Math.ceil(windowMs / 1000),
      });
    },
  });
};

// Different rate limits for different endpoints
const rateLimits = {
  // General API rate limit
  general: createRateLimit(
    15 * 60 * 1000,
    1000,
    "Too many requests from this IP, please try again in 15 minutes"
  ),

  // Strict rate limit for authentication endpoints
  auth: createRateLimit(
    15 * 60 * 1000,
    150,
    "Too many authentication attempts, please try again in 15 minutes"
  ),

  // Moderate rate limit for admin endpoints
  admin: createRateLimit(
    15 * 60 * 1000,
    5000,
    "Too many admin requests, please try again in 15 minutes"
  ),

  // Stricter rate limit for upload endpoints
  upload: createRateLimit(
    15 * 60 * 1000,
    100,
    "Too many upload requests, please try again in 15 minutes"
  ),

  // Very strict rate limit for booking creation
  booking: createRateLimit(
    15 * 60 * 1000,
    200,
    "Too many booking requests, please try again in 15 minutes"
  ),
};

/**
 * Security Headers Configuration using Helmet
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: [
        "'self'",
        "data:",
        "https://res.cloudinary.com",
        "https://*.cloudinary.com",
      ],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  frameguard: { action: "deny" },
  xssFilter: true,
  referrerPolicy: { policy: "same-origin" },
});

/**
 * Request Size Limitation Middleware
 */
const requestSizeLimit = (req, res, next) => {
  const maxSize = 10 * 1024 * 1024; // 10MB

  if (
    req.headers["content-length"] &&
    parseInt(req.headers["content-length"]) > maxSize
  ) {
    return res.status(413).json({
      success: false,
      error: "Request too large",
      message: "Request body exceeds maximum allowed size of 10MB",
    });
  }

  next();
};

/**
 * User Agent Validation Middleware
 */
const userAgentValidation = (req, res, next) => {
  const userAgent = req.get("User-Agent");

  if (!userAgent || userAgent.length < 10) {
    console.warn("Suspicious request with invalid User-Agent:", {
      ip: req.ip,
      userAgent: userAgent,
      path: req.path,
      method: req.method,
    });

    return res.status(400).json({
      success: false,
      error: "Invalid request",
      message: "Invalid or missing User-Agent header",
    });
  }

  next();
};

/**
 * Path Traversal Protection Middleware
 */
const pathTraversalProtection = (req, res, next) => {
  const suspiciousPatterns = [
    /\.\./,
    /\0/,
    /%2e%2e/i,
    /%2f/i,
    /%5c/i,
    /\\.\\/,
    /\.\.\\/,
    /\.\.%2f/i,
    /\.\.%5c/i,
  ];

  const checkPath = (path) => {
    return suspiciousPatterns.some((pattern) => pattern.test(path));
  };

  if (checkPath(req.url) || checkPath(req.path)) {
    console.warn("Path traversal attempt blocked:", {
      ip: req.ip,
      userAgent: req.get("User-Agent"),
      path: req.path,
      url: req.url,
      method: req.method,
    });

    return res.status(400).json({
      success: false,
      error: "Invalid path",
      message: "Path contains potentially harmful characters",
    });
  }

  next();
};

/**
 * Complete Security Middleware Stack
 */
const applySecurity = (app) => {
  // Apply security headers first
  app.use(securityHeaders);

  // Request size limitation
  app.use(requestSizeLimit);

  // Path traversal protection
  app.use(pathTraversalProtection);

  // User agent validation (only in production)
  if (process.env.NODE_ENV === "production") {
    app.use(userAgentValidation);
  }

  // General rate limiting
  app.use(rateLimits.general);

  // SQL injection protection
  app.use(sqlInjectionProtection);

  // Input sanitization
  app.use(sanitizeInput);

  // JSON error handling (should be added after express.json())
  app.use(jsonErrorHandler);
};

module.exports = {
  sanitizeInput,
  jsonErrorHandler,
  sqlInjectionProtection,
  rateLimits,
  securityHeaders,
  requestSizeLimit,
  userAgentValidation,
  pathTraversalProtection,
  applySecurity,
  purify, // Export for use in controllers if needed
};
