// src/routes/cars.js - Araç Routes
const express = require("express");
const {
  getAllCars,
  getFeaturedCars,
  getCar,
  searchCars,
  getCarsByCategory,
  getFilters,
  createAdminCar,
  updateAdminCar,
  deleteAdminCar,
  uploadCarImages,
  deleteCarImage,
  updateCarStatus,
  updateCarOrder,
  bulkUpdateCars,
  getCarStatistics,
  getSimilarCars,
  getPopularCars,
  generateWhatsAppLink,
  exportCars,
  getFilteredCars,
  getFilterOptions,
  toggleCarLike,
  checkCarAvailability,
} = require("../controllers/carController");

// Car routes with full functionality - all functions are properly implemented

// Import locations from adminController
const { getLocations } = require("../controllers/adminController");

const { upload } = require("../utils/cloudinary");
const {
  adminAuth: protect,
  requireRole: restrictTo,
  authorizeAdminRoute,
} = require("../middleware/auth");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: Cars
 *   description: Car management endpoints
 */

/**
 * @swagger
 * /api/cars:
 *   get:
 *     summary: Get all cars with filters
 *     tags: [Cars]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of cars per page
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Car category
 *       - in: query
 *         name: brand
 *         schema:
 *           type: string
 *         description: Car brand
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Minimum daily price
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum daily price
 *     responses:
 *       200:
 *         description: List of cars with pagination
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Car'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 */

/**
 * @swagger
 * /api/cars/featured:
 *   get:
 *     summary: Get featured cars
 *     tags: [Cars]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Number of featured cars to return
 *     responses:
 *       200:
 *         description: List of featured cars
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Car'
 */

/**
 * @swagger
 * /api/cars/{id}:
 *   get:
 *     summary: Get car by ID or slug
 *     tags: [Cars]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Car ID or slug
 *     responses:
 *       200:
 *         description: Car details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Car'
 *       404:
 *         description: Car not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

/**
 * @swagger
 * /api/cars:
 *   post:
 *     summary: Create a new car (Admin only)
 *     tags: [Cars]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Car'
 *     responses:
 *       201:
 *         description: Car created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/Success'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/Car'
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */

// Public routes
router.get("/", getAllCars);
router.get("/featured", getFeaturedCars);
router.get("/popular", getPopularCars);
router.get("/filters", getFilters);
router.post("/search", searchCars);
router.get("/category/:category", getCarsByCategory);
router.get("/:id", getCar);
router.get("/:id/similar", getSimilarCars);
router.get("/:id/whatsapp", generateWhatsAppLink);

// ===== ADDITIONAL CAR ROUTES FROM ALLAPIS =====

// Advanced filtering routes
router.get("/filtered", getFilteredCars);
router.get("/filter-options", getFilterOptions);

// Get single car details by ID or slug (alternative endpoint)
router.get("/details/:id", getCar);

// Car interaction routes
router.get("/:carId/availability", checkCarAvailability);
router.post("/:carId/toggle-like", protect, toggleCarLike);

// Get all locations
router.get("/locations", getLocations);

// Protected routes (Admin only). These legacy /api/cars admin endpoints duplicate
// /api/admin/cars (which the app actually uses) and were previously exposed with NO
// authentication at all. Guard them with protect + authorizeAdminRoute so they can't
// serve as an unauthenticated backdoor. Safe to delete once the old rental-front is
// retired at cutover, since the app talks exclusively to /api/admin/cars.

// Admin car management
router.post("/", protect, authorizeAdminRoute, createAdminCar);
router.put("/:id", protect, authorizeAdminRoute, updateAdminCar);
router.delete("/:id", protect, authorizeAdminRoute, deleteAdminCar);

// Image management
router.post("/:id/images", protect, authorizeAdminRoute, upload.single("image"), uploadCarImages);
router.delete("/:id/images/:imageId", protect, authorizeAdminRoute, deleteCarImage);

// Status and order management
router.patch("/:id/status", protect, authorizeAdminRoute, updateCarStatus);
router.patch("/:id/order", protect, authorizeAdminRoute, updateCarOrder);
router.patch("/bulk", protect, authorizeAdminRoute, bulkUpdateCars);

// Statistics and export
router.get("/admin/stats", protect, authorizeAdminRoute, getCarStatistics);
router.get("/admin/export", protect, authorizeAdminRoute, exportCars);

// ===== ADVANCED ADMIN CAR ROUTES =====
// All admin car management routes are fully functional and implemented

module.exports = router;
