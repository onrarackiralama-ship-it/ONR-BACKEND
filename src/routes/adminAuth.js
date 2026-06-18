// src/routes/adminAuth.js - Admin Authentication Routes
console.log('🔧 adminAuth.js module loaded');
const express = require('express');
const router = express.Router();
const {
  adminLogin,
  adminRegister,
  getAdminProfile,
  updateAdminProfile,
  changePassword
} = require('../controllers/adminAuthController');
const { adminAuth, requireRole, authorizeAdminRoute } = require('../middleware/auth');
const { logUIInteraction } = require('../config/logger');
const { Car } = require('../models');

/**
 * @swagger
 * components:
 *   schemas:
 *     Admin:
 *       type: object
 *       required:
 *         - username
 *         - email
 *         - password
 *         - firstName
 *         - lastName
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           description: Admin UUID
 *         username:
 *           type: string
 *           description: Admin username
 *         email:
 *           type: string
 *           format: email
 *           description: Admin email
 *         firstName:
 *           type: string
 *           description: Admin first name
 *         lastName:
 *           type: string
 *           description: Admin last name
 *         role:
 *           type: string
 *           enum: [super_admin, admin, manager, editor]
 *           description: Admin role
 *         isActive:
 *           type: boolean
 *           description: Admin account status
 *         lastLogin:
 *           type: string
 *           format: date-time
 *           description: Last login timestamp
 */

/**
 * @swagger
 * /api/auth/admin/login:
 *   post:
 *     summary: Admin login
 *     tags: [Admin Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 description: Username or email
 *               password:
 *                 type: string
 *                 description: Admin password
 *     responses:
 *       200:
 *         description: Login successful
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
 *                     admin:
 *                       $ref: '#/components/schemas/Admin'
 *                     token:
 *                       type: string
 *       401:
 *         description: Authentication failed
 *       423:
 *         description: Account locked
 */
router.post('/admin/login', adminLogin);

/**
 * @swagger
 * /api/admin/register:
 *   post:
 *     summary: Register new admin (Super Admin only)
 *     tags: [Admin Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [admin, manager, editor]
 *                 default: admin
 *     responses:
 *       201:
 *         description: Admin created successfully
 *       403:
 *         description: Permission denied
 *       409:
 *         description: Admin already exists
 */
router.post('/register', adminAuth, requireRole('super_admin'), adminRegister);

/**
 * @swagger
 * /api/auth/admin/me:
 *   get:
 *     summary: Get current admin profile
 *     tags: [Admin Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Admin profile retrieved successfully
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
 *                     admin:
 *                       $ref: '#/components/schemas/Admin'
 */
router.get('/admin/me', adminAuth, getAdminProfile);

/**
 * @swagger
 * /api/auth/admin/profile:
 *   put:
 *     summary: Update admin profile
 *     tags: [Admin Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               phone:
 *                 type: string
 *               preferences:
 *                 type: object
 *     responses:
 *       200:
 *         description: Profile updated successfully
 */
router.put('/admin/profile', adminAuth, updateAdminProfile);

/**
 * @swagger
 * /api/auth/admin/change-password:
 *   put:
 *     summary: Change admin password
 *     tags: [Admin Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - currentPassword
 *               - newPassword
 *             properties:
 *               currentPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Invalid current password
 */
router.put('/admin/change-password', adminAuth, changePassword);

// Admin Cars Management Routes (added for proper route priority)
/**
 * @swagger
 * /api/admin/cars:
 *   get:
 *     summary: Get all cars for admin
 *     tags: [Admin Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 12
 *     responses:
 *       200:
 *         description: Cars retrieved successfully
 */
// Authorization guard for the duplicate admin data routes below (/cars, /blogs,
// /bookings, /dashboard). These mirror the canonical /api/admin/* endpoints
// (admin.js) and are NOT used by either frontend; the guard ensures they can't be
// a privilege-escalation path. Scoped by path so it never touches login, register,
// profile, change-password, or log-navigation. (Safe to delete with these routes
// once the old rental-front is retired at cutover.)
router.use(["/cars", "/blogs", "/bookings", "/dashboard"], adminAuth, authorizeAdminRoute);

router.get('/cars', adminAuth, async (req, res) => {
  const { page = 1, limit = 12 } = req.query;
  
  // Log UI interaction
  if (req.admin && req.admin.id) {
    logUIInteraction('view_cars', req.admin.id, 'cars_management', {
      page: parseInt(page),
      limit: parseInt(limit),
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  }
  
  // Fetch real car data from database
  try {
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Fetch cars from database
    const cars = await Car.sequelize.query(
      'SELECT * FROM cars ORDER BY created_at DESC LIMIT ? OFFSET ?',
      {
        replacements: [parseInt(limit), offset],
        type: Car.sequelize.QueryTypes.SELECT
      }
    );
    
    const countResult = await Car.sequelize.query(
      'SELECT COUNT(*) as count FROM cars',
      {
        type: Car.sequelize.QueryTypes.SELECT
      }
    );
    
    const count = parseInt(countResult[0].count);
    const totalPages = Math.ceil(count / parseInt(limit));
    
    res.json({
      success: true,
      data: {
        cars: cars,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: count,
          itemsPerPage: parseInt(limit),
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        }
      }
    });
  } catch (error) {
    console.error('❌ Failed to fetch cars:', error);
    res.status(500).json({
      error: 'Failed to fetch cars',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/admin/cars/{id}:
 *   get:
 *     summary: Get car by ID
 *     tags: [Admin Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Car retrieved successfully
 */
router.get('/cars/:id', adminAuth, async (req, res) => {
  const { id } = req.params;
  
  // Log UI interaction
  if (req.admin && req.admin.id) {
    logUIInteraction('view_car_details', req.admin.id, 'cars_management', {
      carId: id,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  }
  
  try {
    // Fetch real car from database
    const car = await Car.sequelize.query(
      'SELECT * FROM cars WHERE id = ? LIMIT 1',
      {
        replacements: [id],
        type: Car.sequelize.QueryTypes.SELECT
      }
    );
    
    if (!car || car.length === 0) {
      return res.status(404).json({
        error: 'Car not found',
        message: 'No car found with the provided ID'
      });
    }
    
    res.json({
      success: true,
      data: {
        car: car[0]
      }
    });
  } catch (error) {
    console.error('❌ Failed to fetch car:', error);
    res.status(500).json({
      error: 'Failed to fetch car',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/admin/cars:
 *   post:
 *     summary: Create new car
 *     tags: [Admin Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *               brand:
 *                 type: string
 *               model:
 *                 type: string
 *               year:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Car created successfully
 */
router.post('/cars', adminAuth, async (req, res) => {
  console.log('🚗 Car creation endpoint hit!');
  console.log('📨 Request body:', req.body);
  console.log('👤 Admin user:', req.admin ? req.admin.id : 'NO ADMIN');
  
  try {
    // Log UI interaction
    if (req.admin && req.admin.id) {
      logUIInteraction('create_car', req.admin.id, 'cars_management', {
        carData: { title: req.body.title, brand: req.body.brand, model: req.body.model },
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
    }
    
    // Prepare data for database
    const title = req.body.title || 'Default Car Title';
    const brand = req.body.brand || 'Unknown';
    const model = req.body.model || 'Model';
    
    // Ensure title meets minimum length requirement (5-200 chars)
    const validTitle = title.length >= 5 ? title : `${title} - Car`;
    
    // Generate slug from title
    const baseSlug = validTitle
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    const timestamp = Date.now().toString(36);
    const slug = `${baseSlug}-${timestamp}`;
    
    const carData = {
      title: validTitle,
      slug: slug,
      brand: brand,
      model: model,
      year: parseInt(req.body.year) || new Date().getFullYear(),
      category: req.body.category || 'Ekonomik',
      fuelType: req.body.fuelType || req.body.fuel_type || 'Benzin',
      transmission: req.body.transmission || 'Manuel',
      bodyType: req.body.bodyType || req.body.body_type || 'Sedan',
      seats: Math.max(parseInt(req.body.seats) || 5, 2),
      doors: Math.max(parseInt(req.body.doors) || 4, 2),
      engineCapacity: req.body.engineCapacity || req.body.engine_capacity || null,
      description: req.body.description || '',
      mainImage: req.body.mainImage || req.body.images?.main || null,
      gallery: req.body.gallery || req.body.images?.gallery || [],
      pricing: {
        daily: Math.max(parseFloat(req.body.pricing?.daily || req.body.dailyRate || req.body.daily) || 100, 1),
        weekly: Math.max(parseFloat(req.body.pricing?.weekly || req.body.weeklyRate) || 0, 0),
        monthly: Math.max(parseFloat(req.body.pricing?.monthly || req.body.monthlyRate) || 0, 0),
        currency: req.body.pricing?.currency || req.body.currency || 'EUR'
      },
      status: (req.body.status === 'active' || req.body.status === true) ? 'active' : 'inactive',
      featured: req.body.featured || false,
      userId: req.admin.id
    };
    
    // Create car in database
    const newCar = await Car.create(carData);
    
    res.json({
      success: true,
      message: 'Car created successfully',
      data: {
        car: newCar
      }
    });
  } catch (error) {
    console.error('❌ Failed to create car:', error);
    res.status(500).json({
      error: 'Failed to create car',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/admin/cars/{id}:
 *   put:
 *     summary: Update car
 *     tags: [Admin Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Car updated successfully
 */
router.put('/cars/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the car first
    const car = await Car.findByPk(id);
    if (!car) {
      return res.status(404).json({
        error: 'Car not found',
        message: 'No car found with the provided ID'
      });
    }
    
    // Check if user owns this car or is admin
    if (car.userId !== req.admin.id && req.admin.role !== 'super_admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only edit your own cars'
      });
    }
    
    // Prepare update data
    const updateData = {
      title: req.body.title,
      brand: req.body.brand,
      model: req.body.model,
      year: req.body.year,
      category: req.body.category,
      fuelType: req.body.fuelType,
      transmission: req.body.transmission,
      bodyType: req.body.bodyType,
      seats: req.body.seats,
      doors: req.body.doors,
      engineCapacity: req.body.engineCapacity,
      description: req.body.description,
      mainImage: req.body.mainImage || req.body.images?.main,
      gallery: req.body.gallery || req.body.images?.gallery,
      pricing: {
        daily: parseFloat(req.body.pricing?.daily) || car.pricing.daily,
        weekly: parseFloat(req.body.pricing?.weekly) || car.pricing.weekly,
        monthly: parseFloat(req.body.pricing?.monthly) || car.pricing.monthly,
        currency: req.body.pricing?.currency || car.pricing.currency
      },
      status: req.body.status ? 'active' : 'inactive',
      featured: req.body.featured || false
    };
    
    // Update car in database
    await car.update(updateData);
    
    res.json({
      success: true,
      message: 'Car updated successfully',
      data: {
        car: car
      }
    });
  } catch (error) {
    console.error('❌ Failed to update car:', error);
    res.status(500).json({
      error: 'Failed to update car',
      message: error.message
    });
  }
});

/**
 * @swagger
 * /api/admin/cars/{id}:
 *   delete:
 *     summary: Delete car
 *     tags: [Admin Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Car deleted successfully
 */
router.delete('/cars/:id', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Find the car first
    const car = await Car.findByPk(id);
    if (!car) {
      return res.status(404).json({
        error: 'Car not found',
        message: 'No car found with the provided ID'
      });
    }
    
    // Check if user owns this car or is admin
    if (car.userId !== req.admin.id && req.admin.role !== 'super_admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete your own cars'
      });
    }
    
    // Delete the car from database
    await car.destroy();
    
    res.json({
      success: true,
      message: 'Car deleted successfully',
      data: { id }
    });
  } catch (error) {
    console.error('❌ Failed to delete car:', error);
    res.status(500).json({
      error: 'Failed to delete car',
      message: error.message
    });
  }
});

// Update car status
/**
 * @swagger
 * /api/admin/cars/{id}/status:
 *   patch:
 *     summary: Update car status (active/inactive)
 *     tags: [Admin Cars]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Car ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [active, inactive]
 *                 description: New status for the car
 *     responses:
 *       200:
 *         description: Car status updated successfully
 *       403:
 *         description: Access denied
 *       404:
 *         description: Car not found
 */
router.patch('/cars/:id/status', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Validate status
    if (!status || !['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: 'Status must be either "active" or "inactive"'
      });
    }
    
    // Find the car first
    const car = await Car.findByPk(id);
    if (!car) {
      return res.status(404).json({
        error: 'Car not found',
        message: 'No car found with the provided ID'
      });
    }
    
    // Check if user owns this car or is admin
    if (car.userId !== req.admin.id && req.admin.role !== 'super_admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update status of your own cars'
      });
    }
    
    // Update the car status
    await car.update({ status });
    
    res.json({
      success: true,
      message: `Car status updated to ${status}`,
      data: {
        id: car.id,
        status: car.status
      }
    });
  } catch (error) {
    console.error('❌ Failed to update car status:', error);
    res.status(500).json({
      error: 'Failed to update car status',
      message: error.message
    });
  }
});

// Admin Blogs Management Routes  
/**
 * @swagger
 * /api/admin/blogs:
 *   get:
 *     summary: Get all blogs for admin
 *     tags: [Admin Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: Blogs retrieved successfully
 */
router.get('/blogs', adminAuth, async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  
  // Log UI interaction
  if (req.admin && req.admin.id) {
    logUIInteraction('view_blogs', req.admin.id, 'blog_management', {
      page: parseInt(page),
      limit: parseInt(limit),
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  }
  
  res.json({
    success: true,
    data: {
      blogs: [],
      pagination: {
        currentPage: parseInt(page),
        totalPages: 0,
        totalItems: 0,
        itemsPerPage: parseInt(limit),
        hasNextPage: false,
        hasPrevPage: false
      }
    }
  });
});

// Blog featured toggle
router.patch('/blogs/:id/featured', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Since we don't have a real blog system yet, return success for now
    res.json({
      success: true,
      message: 'Blog featured status updated successfully',
      data: {
        id: id,
        featured: true
      }
    });
  } catch (error) {
    console.error('❌ Failed to toggle blog featured:', error);
    res.status(500).json({
      error: 'Failed to update featured status',
      message: error.message
    });
  }
});

// Blog status update
router.patch('/blogs/:id/status', adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    // Since we don't have a real blog system yet, return success for now
    res.json({
      success: true,
      message: 'Blog status updated successfully',
      data: {
        id: id,
        status: status
      }
    });
  } catch (error) {
    console.error('❌ Failed to update blog status:', error);
    res.status(500).json({
      error: 'Failed to update status',
      message: error.message
    });
  }
});

// DISABLED: This route conflicts with proper admin blog routes in /admin/blogs
/*
router.post('/blogs', adminAuth, async (req, res) => {
  try {
    // Log UI interaction
    if (req.admin && req.admin.id) {
      logUIInteraction('create_blog', req.admin.id, 'blog_management', {
        blogData: { title: req.body.title, category: req.body.category },
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
    }
    
    // Create blog data structure (since we don't have PostgreSQL blog table yet)
    const newBlog = {
      id: Date.now().toString(),
      title: req.body.title || 'New Blog Post',
      slug: (req.body.title || 'new-blog-post').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-'),
      excerpt: req.body.excerpt || '',
      content: req.body.content || '',
      featuredImage: req.body.featuredImage || { url: '', alt: '', publicId: '' },
      author: {
        name: req.admin.firstName + ' ' + req.admin.lastName || 'Admin',
        avatar: req.admin.avatar || ''
      },
      category: req.body.category || 'General',
      tags: req.body.tags || [],
      status: req.body.status || 'published',
      featured: req.body.featured || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    res.json({
      success: true,
      message: 'Blog created successfully',
      data: {
        blog: newBlog
      }
    });
  } catch (error) {
    console.error('❌ Failed to create blog:', error);
    res.status(500).json({
      error: 'Failed to create blog',
      message: error.message
    });
  }
});
*/

router.get('/blogs/:id', adminAuth, async (req, res) => {
  const { id } = req.params;
  res.json({
    success: true,
    data: {
      blog: {
        id: id,
        title: 'Sample Blog Post',
        slug: 'sample-blog-post',
        excerpt: 'This is a sample blog post',
        content: 'This is the content of the sample blog post.',
        featuredImage: {
          url: '',
          alt: 'Sample image',
          publicId: ''
        },
        author: {
          name: 'Admin',
          avatar: ''
        },
        category: 'General',
        tags: ['sample'],
        status: 'published',
        featured: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    }
  });
});

router.put('/blogs/:id', adminAuth, async (req, res) => {
  const { id } = req.params;
  const updatedBlog = {
    id: id,
    ...req.body,
    updatedAt: new Date().toISOString()
  };
  
  res.json({
    success: true,
    message: 'Blog updated successfully',
    data: {
      blog: updatedBlog
    }
  });
});

router.delete('/blogs/:id', adminAuth, async (req, res) => {
  const { id } = req.params;
  res.json({
    success: true,
    message: 'Blog deleted successfully',
    data: { id }
  });
});

// Admin Bookings Management Routes
router.get('/bookings', adminAuth, async (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  
  // Log UI interaction
  if (req.admin && req.admin.id) {
    logUIInteraction('view_bookings', req.admin.id, 'bookings_management', {
      page: parseInt(page),
      limit: parseInt(limit),
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  }
  
  res.json({
    success: true,
    data: {
      bookings: [],
      pagination: {
        currentPage: parseInt(page),
        totalPages: 0,
        totalItems: 0,
        itemsPerPage: parseInt(limit),
        hasNextPage: false,
        hasPrevPage: false
      }
    }
  });
});

// Admin Dashboard Stats
router.get('/dashboard/stats', adminAuth, async (req, res) => {
  // Log UI interaction
  if (req.admin && req.admin.id) {
    logUIInteraction('view_dashboard', req.admin.id, 'dashboard', {
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  }
  
  try {
    // Fetch real statistics from database
    const totalCarsResult = await Car.sequelize.query(
      'SELECT COUNT(*) as count FROM cars',
      { type: Car.sequelize.QueryTypes.SELECT }
    );
    
    const activeCarsResult = await Car.sequelize.query(
      'SELECT COUNT(*) as count FROM cars WHERE status = ?',
      { 
        replacements: ['active'],
        type: Car.sequelize.QueryTypes.SELECT 
      }
    );
    
    const totalCars = parseInt(totalCarsResult[0].count);
    const activeCars = parseInt(activeCarsResult[0].count);
    
    res.json({
      success: true,
      data: {
        totalCars,
        activeCars,
        totalBookings: 0,
        pendingBookings: 0,
        completedBookings: 0,
        totalRevenue: 0,
        monthlyRevenue: 0,
        recentBookings: []
      }
    });
  } catch (error) {
    console.error('❌ Failed to fetch dashboard stats:', error);
    res.status(500).json({
      error: 'Failed to fetch dashboard statistics',
      message: error.message
    });
  }
});

// Navigation logging endpoint
router.post('/log-navigation', adminAuth, async (req, res) => {
  const { section, timestamp } = req.body;
  
  // Log UI navigation
  if (req.admin && req.admin.id) {
    logUIInteraction('navigate_section', req.admin.id, section, {
      timestamp,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      sessionDuration: req.headers['session-duration'] || null
    });
  }
  
  res.json({
    success: true,
    message: 'Navigation logged successfully'
  });
});

module.exports = router;