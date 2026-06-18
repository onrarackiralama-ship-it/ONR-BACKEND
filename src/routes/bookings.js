// src/routes/bookings.js - Booking Routes
const express = require("express");
const router = express.Router();
const { body, query } = require("express-validator");
const { adminAuth: protect, authorizeAdminRoute } = require("../middleware/auth");

// Import booking functions from bookingController
const {
  createBooking,
  getAdminBookings,
  updateBookingStatus,
  getAdminRecentBookings,
} = require("../controllers/bookingController");

/**
 * @swagger
 * tags:
 *   name: Bookings
 *   description: Booking management endpoints
 */

// ===== PUBLIC BOOKING ROUTES =====

// Create booking (requires authentication)
router.post(
  "/",
  protect,
  [
    body("carId")
      .notEmpty()
      .isUUID()
      .withMessage("Valid car ID is required"),
    body("pickupLocation")
      .notEmpty()
      .withMessage("Pickup location is required"),
    body("dropoffLocation")
      .notEmpty()
      .withMessage("Dropoff location is required"),
    body("pickupDate")
      .notEmpty()
      .isISO8601()
      .withMessage("Valid pickup date is required"),
    body("pickupTime")
      .notEmpty()
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage("Valid pickup time is required (HH:MM format)"),
    body("returnDate")
      .notEmpty()
      .isISO8601()
      .withMessage("Valid return date is required"),
    body("returnTime")
      .notEmpty()
      .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage("Valid return time is required (HH:MM format)"),
    body("customerInfo.name")
      .optional()
      .isLength({ min: 2 })
      .withMessage("Customer name must be at least 2 characters"),
    body("customerInfo.email")
      .optional()
      .isEmail()
      .withMessage("Valid email is required"),
    body("customerInfo.phone")
      .optional()
      .isMobilePhone()
      .withMessage("Valid phone number is required"),
  ],
  createBooking
);

// ===== ADMIN BOOKING MANAGEMENT ROUTES =====
// All admin routes require authentication AND authorization (role/permission).
router.use("/admin", protect, authorizeAdminRoute);

// Get all bookings for admin management
router.get(
  "/admin",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    query("status")
      .optional()
      .isIn(["Pending", "Active", "Completed", "Cancelled"])
      .withMessage("Invalid booking status"),
    query("search")
      .optional()
      .isLength({ min: 1 })
      .withMessage("Search query cannot be empty"),
  ],
  getAdminBookings
);

// Update booking status
router.put(
  "/admin/:id/status",
  [
    body("status")
      .notEmpty()
      .isIn(["Pending", "Active", "Completed", "Cancelled"])
      .withMessage("Valid booking status is required"),
  ],
  updateBookingStatus
);

// Get recent bookings for admin dashboard
router.get(
  "/admin/dashboard/recent",
  [
    query("limit")
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage("Limit must be between 1 and 20"),
  ],
  getAdminRecentBookings
);

module.exports = router;
