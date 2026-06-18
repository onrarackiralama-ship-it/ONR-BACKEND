// src/routes/listings.js - Listing Routes
const express = require('express');
const router = express.Router();
const {
  createListing,
  getListings,
  getListing,
  updateListing,
  deleteListing,
  getListingFilters
} = require('../controllers/listingController');
const { uploadConfigs, handleUploadError } = require('../middleware/upload');
const { adminAuth, authorizeAdminRoute } = require('../middleware/auth');

/**
 * @swagger
 * components:
 *   schemas:
 *     Listing:
 *       type: object
 *       required:
 *         - title
 *         - brand
 *         - model
 *         - year
 *         - pricing
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Unique identifier
 *         title:
 *           type: string
 *           description: Listing title
 *         slug:
 *           type: string
 *           description: URL-friendly identifier
 *         description:
 *           type: string
 *           description: Detailed description
 *         brand:
 *           type: string
 *           description: Car brand
 *         model:
 *           type: string
 *           description: Car model
 *         year:
 *           type: integer
 *           description: Manufacturing year
 *         category:
 *           type: string
 *           enum: [Ekonomik, Orta Sınıf, Üst Sınıf, SUV, Geniş, Lüks]
 *         fuelType:
 *           type: string
 *           enum: [Benzin, Dizel, Benzin+LPG, Elektrikli, Hibrit]
 *         transmission:
 *           type: string
 *           enum: [Manuel, Yarı Otomatik, Otomatik]
 *         pricing:
 *           type: object
 *           properties:
 *             daily:
 *               type: number
 *             weekly:
 *               type: number
 *             monthly:
 *               type: number
 *             currency:
 *               type: string
 *         images:
 *           type: object
 *           properties:
 *             main:
 *               type: object
 *             gallery:
 *               type: array
 *               items:
 *                 type: object
 */

/**
 * @swagger
 * /api/listings:
 *   get:
 *     summary: Get all listings with optional filters
 *     tags: [Listings]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 12
 *         description: Number of items per page
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Filter by category
 *       - in: query
 *         name: brand
 *         schema:
 *           type: string
 *         description: Filter by brand
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
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in title, description, brand, model
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, price, title]
 *           default: createdAt
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [ASC, DESC]
 *           default: DESC
 *         description: Sort order
 *     responses:
 *       200:
 *         description: List of listings with pagination
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     listings:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Listing'
 *                     pagination:
 *                       type: object
 */
router.get('/', getListings);

/**
 * @swagger
 * /api/listings/filters:
 *   get:
 *     summary: Get available filter options
 *     tags: [Listings]
 *     responses:
 *       200:
 *         description: Available filter options
 */
router.get('/filters', getListingFilters);

/**
 * @swagger
 * /api/listings/{id}:
 *   get:
 *     summary: Get single listing by ID or slug
 *     tags: [Listings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Listing ID (UUID) or slug
 *     responses:
 *       200:
 *         description: Single listing details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Listing'
 *       404:
 *         description: Listing not found
 */
router.get('/:id', getListing);

/**
 * @swagger
 * /api/listings:
 *   post:
 *     summary: Create new listing
 *     tags: [Listings]
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     parameters:
 *       - in: formData
 *         name: title
 *         type: string
 *         required: true
 *       - in: formData
 *         name: brand
 *         type: string
 *         required: true
 *       - in: formData
 *         name: model
 *         type: string
 *         required: true
 *       - in: formData
 *         name: year
 *         type: integer
 *         required: true
 *       - in: formData
 *         name: pricing
 *         type: string
 *         required: true
 *         description: JSON string of pricing object
 *       - in: formData
 *         name: mainImage
 *         type: file
 *         description: Main listing image
 *       - in: formData
 *         name: galleryImages
 *         type: file
 *         description: Gallery images (multiple files)
 *     responses:
 *       201:
 *         description: Listing created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post('/', adminAuth, authorizeAdminRoute, uploadConfigs.mixed, createListing);

/**
 * @swagger
 * /api/listings/{id}:
 *   put:
 *     summary: Update existing listing
 *     tags: [Listings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Listing ID
 *     consumes:
 *       - multipart/form-data
 *     responses:
 *       200:
 *         description: Listing updated successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Listing not found
 */
router.put('/:id', adminAuth, authorizeAdminRoute, uploadConfigs.mixed, updateListing);

/**
 * @swagger
 * /api/listings/{id}:
 *   delete:
 *     summary: Delete listing
 *     tags: [Listings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Listing ID
 *     responses:
 *       200:
 *         description: Listing deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Listing not found
 */
router.delete('/:id', adminAuth, authorizeAdminRoute, deleteListing);

// Error handling middleware
router.use(handleUploadError);

module.exports = router;