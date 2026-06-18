// src/routes/admin.js - Admin Dashboard Routes (maintaining original /api/admin/* structure)
const express = require("express");
const router = express.Router();
const { query, body } = require("express-validator");
const { adminAuth: protect, authorizeAdminRoute } = require("../middleware/auth");

// Import admin functions from various controllers
const {
  getAdminRecentBookings,
  getAdminBookings,
  getBookingById,
  createBooking,
  updateBooking,
  updateBookingStatus,
  deleteBooking,
  getBookingStatistics,
} = require("../controllers/bookingController");


const {
  getDashboardStats,
  getDbStats,
  getAllCars,
  // getAllCollections, // Function doesn't exist
  getLocations,
  adminLogin,
  createAdmin,
} = require("../controllers/adminController");

const {
  getAdminCars,
  getAdminCarDetails,
  createAdminCar,
  updateAdminCar,
  deleteAdminCar,
  updateCarStatus,
  getCarScheduledPricing,
  addCarScheduledPricing,
  deleteCarScheduledPricing,
  updateCarInventory,
} = require("../controllers/carController");

const {
  getAdminNews,
  getAdminNewsDetails,
  createAdminNews,
  updateAdminNews,
  deleteAdminNews,
  updateNewsStatus,
} = require("../controllers/contentController");

const {
  getAdminBlogs,
  getAdminBlog,
  createBlog,
  updateBlog,
  deleteBlog,
  toggleFeatured,
  updateBlogStatus,
} = require("../controllers/blogController");

const {
  getCurrentRates,
  getRateHistory,
  updateExchangeRates,
  initializeDefaultRates,
} = require("../controllers/exchangeRateController");

const {
  createTransfer,
  updateTransfer,
  deleteTransfer,
  getAdminTransfers
} = require("../controllers/transferController");

/**
 * @swagger
 * tags:
 *   name: Admin
 *   description: Admin dashboard and management endpoints
 */

// Apply auth middleware to all admin routes
router.use(protect);

// Enforce per-resource authorization on every admin route. `protect` only proves
// a valid token; authorizeAdminRoute enforces what the authenticated admin is
// actually permitted to do (role/permission), and fails closed for unmapped routes.
router.use(authorizeAdminRoute);

// ===== DASHBOARD ROUTES =====

// Get admin dashboard statistics
router.get("/dashboard/stats", getDashboardStats);

// Get recent bookings for admin dashboard
router.get(
  "/dashboard/recent-bookings",
  [
    query("limit")
      .optional()
      .isInt({ min: 1, max: 20 })
      .withMessage("Limit must be between 1 and 20"),
  ],
  getAdminRecentBookings
);

// ===== BOOKING MANAGEMENT ROUTES =====

// Get all bookings for admin management
router.get(
  "/bookings",
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

// Get single booking by ID
router.get("/bookings/:id", getBookingById);

// Create new booking (admin only)
router.post(
  "/bookings",
  [
    body("carId")
      .notEmpty()
      .isUUID(4)
      .withMessage("Valid car ID is required"),
    body("drivers")
      .isArray({ min: 1 })
      .withMessage("At least one driver is required"),
    body("drivers.*.name")
      .notEmpty()
      .isLength({ min: 2, max: 100 })
      .withMessage("Driver name must be between 2 and 100 characters"),
    body("drivers.*.surname")
      .notEmpty()
      .isLength({ min: 2, max: 100 })
      .withMessage("Driver surname must be between 2 and 100 characters"),
    body("drivers.*.phoneNumber")
      .notEmpty()
      .isMobilePhone()
      .withMessage("Valid phone number is required"),
    body("pickupLocation")
      .notEmpty()
      .isLength({ min: 5, max: 200 })
      .withMessage("Pickup location must be between 5 and 200 characters"),
    body("dropoffLocation")
      .notEmpty()
      .isLength({ min: 5, max: 200 })
      .withMessage("Dropoff location must be between 5 and 200 characters"),
    body("pickupTime")
      .notEmpty()
      .isISO8601()
      .withMessage("Valid pickup time is required"),
    body("dropoffTime")
      .notEmpty()
      .isISO8601()
      .withMessage("Valid dropoff time is required"),
  ],
  createBooking
);

// Update existing booking
router.put(
  "/bookings/:id",
  [
    body("drivers")
      .optional()
      .isArray({ min: 1 })
      .withMessage("At least one driver is required"),
    body("drivers.*.name")
      .optional()
      .isLength({ min: 2, max: 100 })
      .withMessage("Driver name must be between 2 and 100 characters"),
    body("drivers.*.surname")
      .optional()
      .isLength({ min: 2, max: 100 })
      .withMessage("Driver surname must be between 2 and 100 characters"),
    body("drivers.*.phoneNumber")
      .optional()
      .isMobilePhone()
      .withMessage("Valid phone number is required"),
    body("pickupLocation")
      .optional()
      .isLength({ min: 5, max: 200 })
      .withMessage("Pickup location must be between 5 and 200 characters"),
    body("dropoffLocation")
      .optional()
      .isLength({ min: 5, max: 200 })
      .withMessage("Dropoff location must be between 5 and 200 characters"),
    body("pickupTime")
      .optional()
      .isISO8601()
      .withMessage("Valid pickup time is required"),
    body("dropoffTime")
      .optional()
      .isISO8601()
      .withMessage("Valid dropoff time is required"),
  ],
  updateBooking
);

// Update booking status
router.put(
  "/bookings/:id/status",
  [
    body("status")
      .notEmpty()
      .isIn(["Pending", "Active", "Completed", "Cancelled"])
      .withMessage("Valid booking status is required"),
  ],
  updateBookingStatus
);

// Delete booking
router.delete("/bookings/:id", deleteBooking);

// Get booking statistics
router.get("/bookings/statistics", getBookingStatistics);

// ===== CAR MANAGEMENT ROUTES =====

// Get all cars for admin with pagination and search
router.get(
  "/cars",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
    query("search")
      .optional()
      .isLength({ min: 1 })
      .withMessage("Search query cannot be empty"),
    query("status")
      .optional()
      .isIn(["Available", "Rented", "Maintenance", "Out of Service"])
      .withMessage("Invalid status"),
  ],
  getAdminCars
);

// Get single car for admin editing
router.get("/cars/:id", getAdminCarDetails);

// Create new car
router.post(
  "/cars",
  [
    body("title")
      .notEmpty()
      .isLength({ min: 2, max: 200 })
      .withMessage("Car title must be between 2 and 200 characters"),
    body("pricing.daily")
      .notEmpty()
      .isFloat({ min: 0 })
      .withMessage("Daily price is required and must be a positive number"),
    body("category")
      .optional()
      .isIn([
        "Ekonomik",
        "Orta Sınıf", 
        "Üst Sınıf",
        "SUV",
        "Geniş",
        "Lüks",
      ])
      .withMessage("Invalid car category"),
    body("status")
      .optional()
      .isBoolean()
      .withMessage("Status must be a boolean"),
    body("seats")
      .optional()
      .isInt({ min: 1, max: 12 })
      .withMessage("Seats must be between 1 and 12"),
    body("doors")
      .optional()
      .isInt({ min: 2, max: 5 })
      .withMessage("Doors must be between 2 and 5"),
    body("year")
      .optional()
      .isInt({ min: 1990, max: new Date().getFullYear() + 1 })
      .withMessage("Invalid year"),
    body("transmission")
      .optional()
      .isIn(["Otomatik", "Manuel", "Yarı Otomatik"])
      .withMessage("Invalid transmission type"),
    body("fuelType")
      .optional()
      .isIn(["Benzin", "Dizel", "Elektrikli", "Hibrit"])
      .withMessage("Invalid fuel type"),
    body("features")
      .optional()
      .isArray()
      .withMessage("Features must be an array"),
  ],
  createAdminCar
);

// Update existing car
router.put(
  "/cars/:id",
  [
    body("title")
      .optional()
      .isLength({ min: 2, max: 200 })
      .withMessage("Car title must be between 2 and 200 characters"),
    body("pricing.daily")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("Daily price must be a positive number"),
    body("category")
      .optional()
      .isIn([
        "Ekonomik",
        "Orta Sınıf",
        "Üst Sınıf", 
        "SUV",
        "Geniş",
        "Lüks",
      ])
      .withMessage("Invalid car category"),
    body("status")
      .optional()
      .isBoolean()
      .withMessage("Status must be a boolean"),
    body("seats")
      .optional()
      .isInt({ min: 1, max: 12 })
      .withMessage("Seats must be between 1 and 12"),
    body("doors")
      .optional()
      .isInt({ min: 2, max: 5 })
      .withMessage("Doors must be between 2 and 5"),
    body("year")
      .optional()
      .isInt({ min: 1990, max: new Date().getFullYear() + 1 })
      .withMessage("Invalid year"),
    body("transmission")
      .optional()
      .isIn(["Otomatik", "Manuel", "Yarı Otomatik"])
      .withMessage("Invalid transmission type"),
    body("fuelType")
      .optional()
      .isIn(["Benzin", "Dizel", "Elektrikli", "Hibrit"])
      .withMessage("Invalid fuel type"),
    body("features")
      .optional()
      .isArray()
      .withMessage("Features must be an array"),
  ],
  updateAdminCar
);

// Update car status
router.patch(
  "/cars/:id/status",
  [
    body("status")
      .notEmpty()
      .isIn(["active", "inactive", "maintenance"])
      .withMessage("Status must be active, inactive, or maintenance"),
  ],
  (req, res, next) => {
    // Convert to updateCarStatus format for the controller
    req.body = { status: req.body.status };
    updateCarStatus(req, res, next);
  }
);

// Delete car
router.delete("/cars/:id", deleteAdminCar);

// Get scheduled pricing for a car
router.get("/cars/:id/scheduled-pricing", getCarScheduledPricing);

// Add scheduled pricing for a car
router.post(
  "/cars/:id/scheduled-pricing",
  [
    body("name")
      .notEmpty()
      .isLength({ min: 2, max: 100 })
      .withMessage("Pricing name must be between 2 and 100 characters"),
    body("startDate")
      .notEmpty()
      .isISO8601()
      .withMessage("Valid start date is required"),
    body("endDate")
      .notEmpty()
      .isISO8601()
      .withMessage("Valid end date is required"),
    body("prices.USD")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("USD price must be a positive number"),
    body("prices.EUR")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("EUR price must be a positive number"),
    body("prices.TRY")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("TRY price must be a positive number"),
  ],
  addCarScheduledPricing
);

// Delete scheduled pricing for a car
router.delete("/cars/:id/scheduled-pricing/:pricingId", deleteCarScheduledPricing);

// Update car inventory
router.put(
  "/cars/:id/inventory",
  [
    body("totalUnits")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Total units must be a non-negative integer"),
    body("rentedUnits")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Rented units must be a non-negative integer"),
    body("maintenanceUnits")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Maintenance units must be a non-negative integer"),
    body("outOfServiceUnits")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Out of service units must be a non-negative integer"),
  ],
  updateCarInventory
);


// ===== NEWS MANAGEMENT ROUTES =====

// Get all news articles for admin management
router.get(
  "/news",
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
      .isIn(["published", "draft", "archived"])
      .withMessage("Invalid article status"),
    query("search")
      .optional()
      .isLength({ min: 1 })
      .withMessage("Search query cannot be empty"),
  ],
  getAdminNews
);

// Get single news article for admin editing
router.get("/news/:id", getAdminNewsDetails);

// Create new news article
router.post(
  "/news",
  [
    body("title")
      .notEmpty()
      .isLength({ min: 5, max: 200 })
      .withMessage("Title must be between 5 and 200 characters"),
    body("content")
      .notEmpty()
      .isLength({ min: 50 })
      .withMessage("Content must be at least 50 characters"),
    body("excerpt")
      .optional()
      .isLength({ max: 300 })
      .withMessage("Excerpt must be less than 300 characters"),
    body("image").optional().isURL().withMessage("Image must be a valid URL"),
    body("tags").optional().isArray().withMessage("Tags must be an array"),
    body("author")
      .optional()
      .isLength({ min: 2, max: 100 })
      .withMessage("Author name must be between 2 and 100 characters"),
    body("status")
      .optional()
      .isIn(["draft", "published", "archived"])
      .withMessage("Invalid article status"),
    body("featured")
      .optional()
      .isBoolean()
      .withMessage("Featured must be a boolean"),
  ],
  createAdminNews
);

// Update existing news article
router.put(
  "/news/:id",
  [
    body("title")
      .optional()
      .isLength({ min: 5, max: 200 })
      .withMessage("Title must be between 5 and 200 characters"),
    body("content")
      .optional()
      .isLength({ min: 50 })
      .withMessage("Content must be at least 50 characters"),
    body("excerpt")
      .optional()
      .isLength({ max: 300 })
      .withMessage("Excerpt must be less than 300 characters"),
    body("image").optional().isURL().withMessage("Image must be a valid URL"),
    body("tags").optional().isArray().withMessage("Tags must be an array"),
    body("author")
      .optional()
      .isLength({ min: 2, max: 100 })
      .withMessage("Author name must be between 2 and 100 characters"),
    body("status")
      .optional()
      .isIn(["draft", "published", "archived"])
      .withMessage("Invalid article status"),
    body("featured")
      .optional()
      .isBoolean()
      .withMessage("Featured must be a boolean"),
  ],
  updateAdminNews
);

// Delete news article
router.delete("/news/:id", deleteAdminNews);

// Update news article publication status
router.patch(
  "/news/:id/publish",
  [
    body("status")
      .notEmpty()
      .isIn(["published", "draft", "archived"])
      .withMessage("Valid article status is required"),
  ],
  updateNewsStatus
);

// ===== DATABASE MONITORING ROUTES =====

// Get database statistics
router.get("/database/stats", getDbStats);

// Get all cars from database
router.get("/database/cars", getAllCars);

// Get all documents from a specific collection
// router.get("/database/collections/:collectionName", getAllCollections); // Function doesn't exist

// ===== BLOG ROUTES =====

// Get all blogs for admin (including drafts)
router.get(
  "/blogs",
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
      .custom((value) => {
        if (!value || value === '') return true; // Allow empty string
        return ["draft", "published", "archived"].includes(value);
      })
      .withMessage("Invalid status"),
    query("category")
      .optional()
      .custom((value) => {
        if (!value || value === '') return true; // Allow empty string
        return typeof value === 'string';
      })
      .withMessage("Category must be a string"),
    query("search")
      .optional()
      .custom((value) => {
        if (!value || value === '') return true; // Allow empty string
        return typeof value === 'string' && value.trim().length >= 1;
      })
      .withMessage("Search query cannot be empty"),
  ],
  getAdminBlogs
);

// Get single blog for admin editing
router.get("/blogs/:id", getAdminBlog);

// Create new blog post
router.post(
  "/blogs",
  // TEMPORARILY DISABLED VALIDATION FOR DEBUGGING
  // [
  //   body("title")
  //     .notEmpty()
  //     .isLength({ min: 5, max: 200 })
  //     .withMessage("Title must be between 5 and 200 characters"),
  //   body("excerpt")
  //     .optional()
  //     .isLength({ min: 10, max: 300 })
  //     .withMessage("Excerpt must be between 10 and 300 characters"),
  //   body("content")
  //     .notEmpty()
  //     .isLength({ min: 50 })
  //     .withMessage("Content must be at least 50 characters"),
  //   body("category")
  //     .optional()
  //     .isIn([
  //       "Car Reviews",
  //       "Travel Tips",
  //       "Maintenance",
  //       "Insurance",
  //       "Road Safety",
  //       "Car Tech",
  //       "Company News",
  //       "Industry News",
  //     ])
  //     .withMessage("Invalid category"),
  //   body("status")
  //     .optional()
  //     .isIn(["draft", "published", "archived"])
  //     .withMessage("Invalid status"),
  //   body("featured")
  //     .optional()
  //     .isBoolean()
  //     .withMessage("Featured must be a boolean"),
  //   body("tags")
  //     .optional()
  //     .isArray()
  //     .withMessage("Tags must be an array"),
  // ],
  createBlog
);

// Update blog post
router.put(
  "/blogs/:id",
  [
    body("title")
      .optional()
      .isLength({ min: 5, max: 200 })
      .withMessage("Title must be between 5 and 200 characters"),
    body("excerpt")
      .optional()
      .isLength({ min: 10, max: 300 })
      .withMessage("Excerpt must be between 10 and 300 characters"),
    body("content")
      .optional()
      .isLength({ min: 50 })
      .withMessage("Content must be at least 50 characters"),
    body("category")
      .optional()
      .isIn([
        "Car Reviews",
        "Travel Tips",
        "Maintenance",
        "Insurance",
        "Road Safety",
        "Car Tech",
        "Company News",
        "Industry News",
      ])
      .withMessage("Invalid category"),
    body("status")
      .optional()
      .isIn(["draft", "published", "archived"])
      .withMessage("Invalid status"),
    body("featured")
      .optional()
      .isBoolean()
      .withMessage("Featured must be a boolean"),
    body("tags")
      .optional()
      .isArray()
      .withMessage("Tags must be an array"),
  ],
  updateBlog
);

// Delete blog post
router.delete("/blogs/:id", deleteBlog);

// Toggle blog featured status
router.patch("/blogs/:id/featured", toggleFeatured);

// Update blog status
router.patch(
  "/blogs/:id/status",
  [
    body("status")
      .notEmpty()
      .isIn(["draft", "published", "archived"])
      .withMessage("Status must be draft, published, or archived"),
  ],
  updateBlogStatus
);

// ===== EXCHANGE RATES MANAGEMENT ROUTES =====

// Get current exchange rates
router.get("/exchange-rates", getCurrentRates);

// Get exchange rate history
router.get(
  "/exchange-rates/history",
  [
    query("page")
      .optional()
      .isInt({ min: 1 })
      .withMessage("Page must be a positive integer"),
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage("Limit must be between 1 and 100"),
  ],
  getRateHistory
);

// Update exchange rates manually
router.put(
  "/exchange-rates",
  [
    body("rates")
      .notEmpty()
      .isObject()
      .withMessage("Exchange rates object is required"),
    body("rates.EUR")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("EUR rate must be a positive number"),
    body("rates.USD")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("USD rate must be a positive number"),
    body("rates.TRY")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("TRY rate must be a positive number"),
    body("updateNotes")
      .optional()
      .isLength({ max: 500 })
      .withMessage("Update notes must be less than 500 characters"),
  ],
  updateExchangeRates
);

// Initialize exchange rates (if needed)
router.post("/exchange-rates/initialize", initializeDefaultRates);

// ===== LOCATION ROUTES =====

// Get all locations
router.get("/locations", getLocations);

// ===== TRANSFER ZONES MANAGEMENT ROUTES =====

// Get all transfer zones for admin (includes inactive)
router.get("/transfers", getAdminTransfers);

// Create new transfer zone
router.post(
  "/transfers",
  [
    body("zoneName")
      .notEmpty()
      .isLength({ min: 2, max: 100 })
      .withMessage("Zone name must be between 2 and 100 characters"),
    body("description")
      .optional()
      .isLength({ max: 1000 })
      .withMessage("Description must be less than 1000 characters"),
    body("pricing.capacity_1_4")
      .notEmpty()
      .isFloat({ min: 0 })
      .withMessage("1-4 passenger capacity pricing is required and must be a positive number"),
    body("pricing.capacity_1_6")
      .notEmpty()
      .isFloat({ min: 0 })
      .withMessage("1-6 passenger capacity pricing is required and must be a positive number"),
    body("pricing.capacity_1_16")
      .notEmpty()
      .isFloat({ min: 0 })
      .withMessage("1-16 passenger capacity pricing is required and must be a positive number"),
    body("displayOrder")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Display order must be a non-negative integer"),
  ],
  createTransfer
);

// Update existing transfer zone
router.put(
  "/transfers/:id",
  [
    body("zoneName")
      .optional()
      .isLength({ min: 2, max: 100 })
      .withMessage("Zone name must be between 2 and 100 characters"),
    body("description")
      .optional()
      .isLength({ max: 1000 })
      .withMessage("Description must be less than 1000 characters"),
    body("pricing.capacity_1_4")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("1-4 passenger capacity pricing must be a positive number"),
    body("pricing.capacity_1_6")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("1-6 passenger capacity pricing must be a positive number"),
    body("pricing.capacity_1_16")
      .optional()
      .isFloat({ min: 0 })
      .withMessage("1-16 passenger capacity pricing must be a positive number"),
    body("displayOrder")
      .optional()
      .isInt({ min: 0 })
      .withMessage("Display order must be a non-negative integer"),
    body("status")
      .optional()
      .isIn(["active", "inactive"])
      .withMessage("Status must be active or inactive"),
  ],
  updateTransfer
);

// Delete transfer zone
router.delete("/transfers/:id", deleteTransfer);

module.exports = router;