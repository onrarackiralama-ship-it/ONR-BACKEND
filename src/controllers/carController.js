// src/controllers/carController.js - Araç Controller'ı
const Car = require("../models/cars");
const Location = require("../models/Location");
const { uploadImage, deleteImage } = require("../utils/cloudinary");
const { uploadImageLocally, deleteImageLocally } = require("../utils/localFileUpload");

// Simple function to check if today falls within seasonal pricing
const getEffectivePricing = (car) => {
  // Ensure currency is always EUR for base pricing
  const basePricing = {
    ...car.pricing,
    currency: car.pricing.currency === 'TRY' ? 'EUR' : car.pricing.currency
  };
  
  if (!car.seasonalPricing || car.seasonalPricing.length === 0) {
    return basePricing;
  }
  
  const today = new Date();
  
  for (const season of car.seasonalPricing) {
    if (!season.startDate || !season.endDate) continue;
    
    // Parse Turkish date format DD/MM/YYYY
    const [startDay, startMonth, startYear] = season.startDate.split('/');
    const [endDay, endMonth, endYear] = season.endDate.split('/');
    
    const startDate = new Date(startYear, startMonth - 1, startDay);
    const endDate = new Date(endYear, endMonth - 1, endDay);
    
    console.log(`📅 Checking seasonal pricing "${season.name}":`, {
      today: today.toDateString(),
      startDate: startDate.toDateString(), 
      endDate: endDate.toDateString(),
      isInRange: today >= startDate && today <= endDate
    });
    
    if (today >= startDate && today <= endDate) {
      console.log(`🎯 Using seasonal pricing: ${season.name}`);
      return {
        daily: parseFloat(season.daily) || basePricing.daily,
        weekly: parseFloat(season.weekly) || basePricing.weekly,
        monthly: parseFloat(season.monthly) || basePricing.monthly,
        currency: basePricing.currency, // Use EUR currency
        seasonalName: season.name,
        seasonalPeriod: `${season.startDate} - ${season.endDate}`
      };
    }
  }
  
  console.log('📅 Using base pricing');
  return basePricing;
};

// @desc    Get all cars with filters
// @route   GET /api/cars
// @access  Public
exports.getAllCars = async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 12;
    const offset = (page - 1) * limit;

    // Build where conditions based on query parameters
    const where = { status: 'active' };
    
    if (req.query.category) {
      where.category = req.query.category;
    }
    if (req.query.brand) {
      where.brand = req.query.brand;
    }
    if (req.query.minPrice || req.query.maxPrice) {
      where.pricing = {};
      if (req.query.minPrice) where.pricing.daily = { $gte: Number(req.query.minPrice) };
      if (req.query.maxPrice) where.pricing.daily = { $lte: Number(req.query.maxPrice) };
    }

    // Get cars with pagination
    const { count, rows: cars } = await Car.findAndCountAll({
      where,
      limit,
      offset,
      order: [['featured', 'DESC'], ['created_at', 'DESC']]
    });

    const totalPages = Math.ceil(count / limit);

    // Apply seasonal pricing to each car
    const carsWithSeasonalPricing = cars.map(car => {
      const carData = car.toJSON();
      const effectivePricing = getEffectivePricing(carData);
      
      return {
        ...carData,
        effectivePricing,
        basePricing: carData.pricing
      };
    });

    res.json({
      success: true,
      data: carsWithSeasonalPricing,
      pagination: {
        page,
        limit,
        totalPages,
        totalCars: count,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Get popular cars (most viewed)
// @route   GET /api/cars/popular
// @access  Public
exports.getPopularCars = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 6;

    const cars = await Car.find({ status: true })
      .populate("availableLocations", "name city")
      .sort({ "stats.viewCount": -1, featured: -1 })
      .limit(limit);

    res.json({
      success: true,
      data: cars,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Generate WhatsApp link for car
// @route   GET /api/cars/:id/whatsapp
// @access  Public
exports.generateWhatsAppLink = async (req, res) => {
  try {
    const car = await Car.findByPk(req.params.id);

    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    const { pickupDate, returnDate, location, message } = req.query;

    let customMessage = message || car.whatsappMessage;

    if (pickupDate && returnDate) {
      customMessage += `\n\nRental Details:\n- Pickup: ${pickupDate}\n- Return: ${returnDate}`;
      if (location) {
        customMessage += `\n- Location: ${location}`;
      }
    }

    const encodedMessage = encodeURIComponent(customMessage);
    const cleanNumber = car.whatsappNumber.replace(/[^0-9]/g, "");
    const whatsappUrl = `https://wa.me/${cleanNumber}?text=${encodedMessage}`;

    res.json({
      success: true,
      data: {
        whatsappUrl,
        phone: car.whatsappNumber,
        message: customMessage,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Export cars data
// @route   GET /api/cars/export
// @access  Private/Admin
exports.exportCars = async (req, res) => {
  try {
    const { format = "json" } = req.query;

    const cars = await Car.find().populate("availableLocations", "name city");

    if (format === "csv") {
      // CSV export
      const csvFields = [
        "title",
        "brand",
        "model",
        "year",
        "category",
        "fuelType",
        "transmission",
        "pricing.daily",
        "status",
        "featured",
      ];

      let csvContent = csvFields.join(",") + "\n";

      cars.forEach((car) => {
        const row = csvFields.map((field) => {
          const value = field.includes(".")
            ? field.split(".").reduce((obj, key) => obj[key], car)
            : car[field];
          return `"${value || ""}"`;
        });
        csvContent += row.join(",") + "\n";
      });

      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", "attachment; filename=cars.csv");
      res.send(csvContent);
    } else {
      // JSON export
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Content-Disposition", "attachment; filename=cars.json");
      res.json({
        success: true,
        data: cars,
        exportedAt: new Date().toISOString(),
        totalRecords: cars.length,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Create new car (Admin only)
// @route   POST /api/cars
// @access  Private/Admin
exports.createCar = async (req, res) => {
  try {
    const carData = { ...req.body };
    // Mass-assignment guard: identity/audit columns can't be set from the body.
    ["id", "user_id", "userId", "createdAt", "updatedAt", "created_at", "updated_at"].forEach(
      (f) => delete carData[f]
    );
    const car = new Car(carData);
    await car.save();

    res.status(201).json({
      success: true,
      data: car,
      message: "Car created successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Update car (Admin only)
// @route   PUT /api/cars/:id
// @access  Private/Admin
exports.updateCar = async (req, res) => {
  try {
    const car = await Car.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    res.json({
      success: true,
      data: car,
      message: "Car updated successfully",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Delete car (Admin only)
// @route   DELETE /api/cars/:id
// @access  Private/Admin
exports.deleteCar = async (req, res) => {
  try {
    const car = await Car.findByPk(req.params.id);

    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    // Delete images from Cloudinary/local storage
    if (car.mainImage && car.mainImage.publicId) {
      await deleteImage(car.mainImage.publicId);
    }

    if (car.gallery && car.gallery.length > 0) {
      for (const image of car.gallery) {
        if (image.publicId) {
          await deleteImage(image.publicId);
        }
      }
    }

    await car.destroy();

    res.json({
      success: true,
      message: "Car deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Upload car images
// @route   POST /api/cars/:id/images
// @access  Private/Admin
exports.uploadCarImages = async (req, res) => {
  try {
    const car = await Car.findByPk(req.params.id);

    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    const { imageType } = req.body; // 'main' or 'gallery'

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No image file provided",
      });
    }

    // Check if Cloudinary is configured
    const isCloudinaryConfigured = process.env.CLOUDINARY_CLOUD_NAME && 
                                   process.env.CLOUDINARY_CLOUD_NAME !== 'your_cloud_name_here';
    
    let uploadResult;
    if (isCloudinaryConfigured) {
      console.log('📤 Uploading car image to Cloudinary...');
      try {
        uploadResult = await uploadImage(req.file.buffer, {
          original_filename: req.file.originalname,
          folder: `rentaly/cars/${car._id}`
        });
      } catch (cloudError) {
        console.log('⚠️ Cloudinary upload failed, falling back to local storage...');
        uploadResult = await uploadImageLocally(req.file.buffer, req.file.originalname);
      }
    } else {
      console.log('📤 Uploading car image locally (Cloudinary not configured)...');
      uploadResult = await uploadImageLocally(req.file.buffer, req.file.originalname);
    }

    const imageData = {
      url: uploadResult.url,
      publicId: uploadResult.publicId,
      filename: req.file.originalname,
    };

    if (imageType === "main") {
      // Delete old main image if exists
      if (car.mainImage && car.mainImage.publicId) {
        await deleteImage(car.mainImage.publicId);
      }
      car.mainImage = imageData;
    } else {
      // Add to gallery
      if (!car.gallery) {
        car.gallery = [];
      }
      car.gallery.push({
        ...imageData,
        order: car.gallery.length,
        id: Date.now(), // Simple ID for gallery images
      });
    }

    await car.save();

    res.json({
      success: true,
      data: imageData,
      message: "Image uploaded successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Delete car image
// @route   DELETE /api/cars/:id/images/:imageId
// @access  Private/Admin
exports.deleteCarImage = async (req, res) => {
  try {
    const car = await Car.findByPk(req.params.id);

    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    const { imageId } = req.params;
    const { imageType } = req.query; // 'main' or 'gallery'

    if (imageType === "main") {
      if (car.mainImage && car.mainImage.publicId) {
        await deleteImage(car.mainImage.publicId);
        car.mainImage = null;
      }
    } else {
      const imageIndex = car.gallery.findIndex(
        (img) => img.id.toString() === imageId || img.publicId === imageId
      );

      if (imageIndex > -1) {
        const image = car.gallery[imageIndex];
        if (image.publicId) {
          await deleteImage(image.publicId);
        }
        car.gallery.splice(imageIndex, 1);
      }
    }

    await car.save();

    res.json({
      success: true,
      message: "Image deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Update car status
// @route   PATCH /api/cars/:id/status
// @access  Private/Admin
const updateCarStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    console.log(`🔄 Updating car ${id} status to:`, status);

    // Find existing car
    const car = await Car.findByPk(id);
    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    // Update the status
    await car.update({ status });

    console.log(`✅ Car ${id} status updated to:`, status);

    res.json({
      success: true,
      data: car,
      message: `Car status updated to ${status} successfully`,
    });
  } catch (error) {
    console.error("Error in updateCarStatus:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Update car order
// @route   PATCH /api/cars/:id/order
// @access  Private/Admin
exports.updateCarOrder = async (req, res) => {
  try {
    const { order } = req.body;

    const car = await Car.findByIdAndUpdate(
      req.params.id,
      { order },
      { new: true }
    );

    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    res.json({
      success: true,
      data: car,
      message: "Car order updated successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Bulk update cars
// @route   PATCH /api/cars/bulk
// @access  Private/Admin
exports.bulkUpdateCars = async (req, res) => {
  try {
    const { carIds, updates } = req.body;

    if (!carIds || !Array.isArray(carIds) || carIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Car IDs are required",
      });
    }

    const result = await Car.updateMany({ _id: { $in: carIds } }, updates, {
      runValidators: true,
    });

    res.json({
      success: true,
      data: {
        matchedCount: result.matchedCount,
        modifiedCount: result.modifiedCount,
      },
      message: `${result.modifiedCount} cars updated successfully`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Get car statistics
// @route   GET /api/cars/stats
// @access  Private/Admin
exports.getCarStatistics = async (req, res) => {
  try {
    const stats = await Car.aggregate([
      {
        $group: {
          _id: null,
          totalCars: { $sum: 1 },
          activeCars: {
            $sum: { $cond: [{ $eq: ["$status", true] }, 1, 0] },
          },
          featuredCars: {
            $sum: { $cond: [{ $eq: ["$featured", true] }, 1, 0] },
          },
          avgPrice: { $avg: "$pricing.daily" },
          totalViews: { $sum: "$stats.viewCount" },
        },
      },
    ]);

    const categoryStats = await Car.aggregate([
      { $match: { status: true } },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          avgPrice: { $avg: "$pricing.daily" },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const brandStats = await Car.aggregate([
      { $match: { status: true } },
      {
        $group: {
          _id: "$brand",
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    res.json({
      success: true,
      data: {
        overview: stats[0] || {},
        categories: categoryStats,
        topBrands: brandStats,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Get similar cars
// @route   GET /api/cars/:id/similar
// @access  Public
exports.getSimilarCars = async (req, res) => {
  try {
    const car = await Car.findByPk(req.params.id);

    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    const limit = Number(req.query.limit) || 4;

    // Find similar cars based on category, price range, or brand
    const priceRange = car.pricing.daily * 0.3; // 30% price variance

    const similarCars = await Car.find({
      _id: { $ne: car._id },
      status: true,
      $or: [
        { category: car.category },
        { brand: car.brand },
        {
          "pricing.daily": {
            $gte: car.pricing.daily - priceRange,
            $lte: car.pricing.daily + priceRange,
          },
        },
      ],
    })
      .populate("availableLocations", "name city")
      .sort({ featured: -1, "stats.rating.average": -1 })
      .limit(limit);

    res.json({
      success: true,
      data: similarCars,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Get featured cars
// @route   GET /api/cars/featured
// @access  Public
exports.getFeaturedCars = async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 6;

    const cars = await Car.find({
      status: true,
      featured: true,
    })
      .populate("availableLocations", "name city")
      .sort({ order: 1, createdAt: -1 })
      .limit(limit);

    res.json({
      success: true,
      data: cars,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Get single car
// @route   GET /api/cars/:id
// @access  Public
exports.getCar = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Try to find by ID first, then by slug
    let car = await Car.findOne({
      where: {
        id: id,
        status: 'active'
      }
    });

    // If not found by ID, try by slug
    if (!car) {
      car = await Car.findOne({
        where: {
          slug: id,
          status: 'active'
        }
      });
    }

    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    // Apply seasonal pricing
    const carData = car.toJSON();
    const effectivePricing = getEffectivePricing(carData);
    
    const finalCarData = {
      ...carData,
      effectivePricing,
      basePricing: carData.pricing
    };

    res.json({
      success: true,
      data: finalCarData,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Search cars with availability
// @route   POST /api/cars/search
// @access  Public
exports.searchCars = async (req, res) => {
  try {
    const { pickupDate, returnDate, location } = req.body;

    let query = { ...req.query };

    // Add location filter if provided
    if (location) {
      query.location = location;
    }

    // Build where conditions for search
    const where = { status: 'active' };
    
    if (query.category) where.category = query.category;
    if (query.brand) where.brand = query.brand;
    if (location) where.location = location;
    
    const cars = await Car.findAll({ where });

    // Filter by availability if dates provided
    let availableCars = cars;
    if (pickupDate && returnDate) {
      // Here you would check against booking/reservation system
      // For now, return all cars
      availableCars = cars;
    }

    res.json({
      success: true,
      data: availableCars,
      searchParams: {
        pickupDate,
        returnDate,
        location,
        ...query,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Get cars by category
// @route   GET /api/cars/category/:category
// @access  Public
exports.getCarsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const limit = Number(req.query.limit) || 12;
    const page = Number(req.query.page) || 1;
    const skip = (page - 1) * limit;

    const cars = await Car.find({
      category: category,
      status: true,
    })
      .populate("availableLocations", "name city")
      .sort({ featured: -1, order: 1 })
      .skip(skip)
      .limit(limit);

    const total = await Car.countDocuments({
      category: category,
      status: true,
    });

    res.json({
      success: true,
      data: cars,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// @desc    Get available filters
// @route   GET /api/cars/filters
// @access  Public
exports.getFilters = async (req, res) => {
  try {
    const filters = await Car.getFilters();

    res.json({
      success: true,
      data: filters,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// ===== ADDITIONAL CAR FUNCTIONS FROM allApis.js =====

/**
 * @swagger
 * /api/cars/filtered:
 *   get:
 *     summary: Get filtered cars with pagination (from allApis.js)
 *     tags: [Cars]
 *     parameters:
 *       - in: query
 *         name: vehicleType
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: Vehicle types to filter by
 *       - in: query
 *         name: carBodyType
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: Car body types to filter by
 *       - in: query
 *         name: carSeats
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: Number of seats to filter by
 *       - in: query
 *         name: engineCapacity
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: Engine capacity ranges to filter by
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: number
 *         description: Minimum price filter
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: number
 *         description: Maximum price filter
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 12
 *         description: Items per page
 *     responses:
 *       200:
 *         description: Filtered cars retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     cars:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Car'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 */
const getFilteredCars = async (req, res) => {
  try {
    const {
      vehicleType,
      carBodyType,
      carSeats,
      engineCapacity,
      minPrice,
      maxPrice,
      page = 1,
      limit = 12,
    } = req.query;

    // Build filter object
    let filter = { status: true }; // Only active cars

    // Vehicle type filter (map to category)
    if (vehicleType && vehicleType.length > 0) {
      const vehicleTypes = Array.isArray(vehicleType)
        ? vehicleType
        : [vehicleType];
      const categoryMap = {
        Car: ["Ekonomik", "Orta Sınıf", "Üst Sınıf"],
        Van: ["Geniş"],
        Minibus: ["Geniş"],
        Prestige: ["Lüks"],
      };

      const mappedCategories = vehicleTypes.flatMap(
        (type) => categoryMap[type] || []
      );
      if (mappedCategories.length > 0) {
        filter.category = { $in: mappedCategories };
      }
    }

    // Car body type filter
    if (carBodyType && carBodyType.length > 0) {
      const bodyTypes = Array.isArray(carBodyType)
        ? carBodyType
        : [carBodyType];
      filter.bodyType = { $in: bodyTypes };
    }

    // Car seats filter
    if (carSeats && carSeats.length > 0) {
      const seatRanges = Array.isArray(carSeats) ? carSeats : [carSeats];
      const seatFilters = [];

      seatRanges.forEach((range) => {
        switch (range) {
          case "2 seats":
            seatFilters.push({ seats: 2 });
            break;
          case "4 seats":
            seatFilters.push({ seats: 4 });
            break;
          case "6 seats":
            seatFilters.push({ seats: 6 });
            break;
          case "6+ seats":
            seatFilters.push({ seats: { $gte: 6 } });
            break;
        }
      });

      if (seatFilters.length > 0) {
        filter.$or = seatFilters;
      }
    }

    // Engine capacity filter
    if (engineCapacity && engineCapacity.length > 0) {
      const capacities = Array.isArray(engineCapacity)
        ? engineCapacity
        : [engineCapacity];
      const capacityFilters = [];

      capacities.forEach((capacity) => {
        switch (capacity) {
          case "1000 - 2000":
            capacityFilters.push({
              engineCapacity: { $gte: 1000, $lte: 2000 },
            });
            break;
          case "2000 - 4000":
            capacityFilters.push({
              engineCapacity: { $gte: 2000, $lte: 4000 },
            });
            break;
          case "4000 - 6000":
            capacityFilters.push({
              engineCapacity: { $gte: 4000, $lte: 6000 },
            });
            break;
          case "6000+":
            capacityFilters.push({ engineCapacity: { $gte: 6000 } });
            break;
        }
      });

      if (capacityFilters.length > 0) {
        if (filter.$or) {
          filter.$and = [{ $or: filter.$or }, { $or: capacityFilters }];
          delete filter.$or;
        } else {
          filter.$or = capacityFilters;
        }
      }
    }

    // Price range filter
    if (minPrice || maxPrice) {
      filter["pricing.daily"] = {};
      if (minPrice) filter["pricing.daily"].$gte = parseFloat(minPrice);
      if (maxPrice) filter["pricing.daily"].$lte = parseFloat(maxPrice);
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Get cars with pagination
    const cars = await Car.find(filter)
      .select(
        "title brand model year category fuelType transmission pricing images status featured whatsappNumber slug seats bodyType engineCapacity"
      )
      .sort({ featured: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Get total count for pagination
    const totalCars = await Car.countDocuments(filter);
    const totalPages = Math.ceil(totalCars / limitNum);

    // Transform cars to match frontend format
    const transformedCars = cars.map((car) => ({
      id: car._id,
      name: car.title,
      image: car.images?.main?.url || "/placeholder-car.jpg",
      rating: 4.5, // Default rating - could be calculated from reviews
      reviews: Math.floor(Math.random() * 100) + 10, // Mock reviews count
      seats: car.seats || 5,
      transmission: car.transmission || "Automatic",
      doors: 4, // Default doors
      type: car.bodyType || car.category,
      dailyRate: car.pricing?.daily || 0,
      liked: false, // Would need user context to determine
      brand: car.brand,
      model: car.model,
      year: car.year,
      category: car.category,
      fuelType: car.fuelType,
      featured: car.featured,
      whatsappNumber: car.whatsappNumber,
      slug: car.slug,
    }));

    res.status(200).json({
      success: true,
      data: {
        cars: transformedCars,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalPages,
          totalCars,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error in getFilteredCars:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch cars",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

/**
 * @swagger
 * /api/cars/filter-options:
 *   get:
 *     summary: Get all available filter options (from allApis.js)
 *     tags: [Cars]
 *     responses:
 *       200:
 *         description: Filter options retrieved successfully
 */
const getFilterOptions = async (req, res) => {
  try {
    // Static filter options as defined in frontend
    const filterOptions = {
      vehicleTypes: ["Car", "Van", "Minibus", "Prestige"],
      carBodyTypes: [
        "Convertible",
        "Coupe",
        "Exotic Cars",
        "Hatchback",
        "Minivan",
        "Truck",
        "Sedan",
        "Sports Car",
        "Station Wagon",
        "SUV",
      ],
      carSeats: ["2 seats", "4 seats", "6 seats", "6+ seats"],
      engineCapacities: ["1000 - 2000", "2000 - 4000", "4000 - 6000", "6000+"],
      priceRange: {
        min: 0,
        max: 2000,
      },
    };

    // Optionally get dynamic price range from database
    const priceStats = await Car.aggregate([
      { $match: { status: true } },
      {
        $group: {
          _id: null,
          minPrice: { $min: "$pricing.daily" },
          maxPrice: { $max: "$pricing.daily" },
        },
      },
    ]);

    if (priceStats.length > 0) {
      filterOptions.priceRange = {
        min: Math.floor(priceStats[0].minPrice || 0),
        max: Math.ceil(priceStats[0].maxPrice || 2000),
      };
    }

    res.status(200).json({ success: true, data: filterOptions });
  } catch (error) {
    console.error("Error in getFilterOptions:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch filter options",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

/**
 * @swagger
 * /api/cars/{carId}/toggle-like:
 *   post:
 *     summary: Toggle like status for a car
 *     tags: [Cars]
 *     parameters:
 *       - in: path
 *         name: carId
 *         required: true
 *         schema:
 *           type: string
 *         description: Car ID
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Like status toggled successfully
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Car not found
 */
const toggleCarLike = async (req, res) => {
  try {
    const { carId } = req.params;
    const userId = req.admin?.id || req.admin?._id; // Auth middleware sets req.admin

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: "Authentication required",
      });
    }

    // Check if car exists
    const car = await Car.findById(carId);
    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    // For now, just return success with mock data
    // In a real implementation, you'd have a UserFavorites model
    const liked = Math.random() > 0.5; // Mock toggle
    const likesCount = Math.floor(Math.random() * 50) + 1; // Mock count

    res.status(200).json({
      success: true,
      data: {
        liked,
        likesCount,
      },
      message: liked ? "Car added to favorites" : "Car removed from favorites",
    });
  } catch (error) {
    console.error("Error in toggleCarLike:", error);
    res.status(500).json({
      success: false,
      error: "Failed to toggle like status",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

/**
 * @swagger
 * /api/cars/{carId}/availability:
 *   get:
 *     summary: Check car availability for specific dates
 *     tags: [Cars]
 *     parameters:
 *       - in: path
 *         name: carId
 *         required: true
 *         schema:
 *           type: string
 *         description: Car ID
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for availability check
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for availability check
 *     responses:
 *       200:
 *         description: Availability checked successfully
 *       404:
 *         description: Car not found
 */
const checkCarAvailability = async (req, res) => {
  try {
    const { carId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        error: "Start date and end date are required",
      });
    }

    // Check if car exists
    const car = await Car.findById(carId);
    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    // In a real implementation, you would check against existing bookings
    // For now, we'll return mock availability data
    const available = Math.random() > 0.3; // 70% chance of being available
    const unavailableDates = available
      ? []
      : ["2024-01-15", "2024-01-16", "2024-01-17"];

    res.status(200).json({
      success: true,
      data: {
        available,
        unavailableDates,
        carId,
        checkedPeriod: {
          startDate,
          endDate,
        },
      },
    });
  } catch (error) {
    console.error("Error in checkCarAvailability:", error);
    res.status(500).json({
      success: false,
      error: "Failed to check availability",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

// ===== ADMIN CAR MANAGEMENT FUNCTIONS =====

/**
 * @swagger
 * /api/admin/cars:
 *   get:
 *     summary: Get all cars for admin management with pagination
 *     tags: [Admin - Cars]
 *     security:
 *       - bearerAuth: []
 */
const getAdminCars = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;

    // Build Sequelize where object
    const where = {};

    // Search filter using Sequelize Op.or
    if (search) {
      const { Op } = require('sequelize');
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { brand: { [Op.iLike]: `%${search}%` } },
        { model: { [Op.iLike]: `%${search}%` } },
      ];
    }

    // Status filter
    if (status) {
      where.status = status;
    }

    // Pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const offset = (pageNum - 1) * limitNum;

    console.log("🔄 getAdminCars query parameters:", {
      where: JSON.stringify(where),
      limitNum,
      offset,
      pageNum
    });

    // Get cars with pagination using Sequelize
    console.log("🚀 About to call Car.findAndCountAll...");
    const { count: totalCars, rows: cars } = await Car.findAndCountAll({
      where,
      limit: limitNum,
      offset,
      order: [['created_at', 'DESC']],
      attributes: [
        'id', 'title', 'brand', 'model', 'year', 'category', 'fuelType', 
        'transmission', 'pricing', 'mainImage', 'gallery', 'status', 'featured', 
        'slug', 'seats', 'doors', 'engineCapacity', 'description', 'features'
      ]
    });
    console.log(`✅ Car.findAndCountAll completed successfully: ${totalCars} cars found`);

    const totalPages = Math.ceil(totalCars / limitNum);

    // Transform cars for admin interface
    const transformedCars = cars.map((car) => ({
      id: car.id, // Sequelize uses 'id' not '_id'
      title: car.title, // Keep original title for booking form
      name: car.title,
      type: car.category || "SUV", 
      status: car.status === "active" ? "Available" : "Unavailable", // Map ENUM to display text
      pricing: {
        daily: car.pricing?.daily || 0,
        weekly: car.pricing?.weekly || 0,
        monthly: car.pricing?.monthly || 0,
        currency: car.pricing?.currency || 'EUR'
      },
      basePrice: {
        USD: car.pricing?.daily?.toString() || "0",
        EUR: car.pricing?.daily?.toString() || "0",
        TRY: car.pricing?.daily?.toString() || "0",
      },
      image: car.mainImage?.url || "/placeholder-car.jpg",
      seats: car.seats || 5,
      transmission: car.transmission || "Automatic",
      fuelType: car.fuelType || "Petrol",
      year: car.year || new Date().getFullYear(),
      engineCapacity: car.engineCapacity || "",
      doors: car.doors || 4,
      description: car.description || "",
      features: car.features || [], // Handle both string and object features
      createdAt: car.createdAt || new Date(),
      slug: car.slug,
    }));

    res.status(200).json({
      success: true,
      data: {
        cars: transformedCars,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalPages,
          totalCars,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
      },
    });
  } catch (error) {
    console.error("Error in getAdminCars:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      error: "Failed to fetch cars",
      message: error.message, // Always show the actual error for debugging
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// Helper function to map car type to category
const mapTypeToCategory = (type) => {
  const typeMap = {
    "Sedan": "Orta Sınıf",
    "SUV": "SUV", 
    "Hatchback": "Ekonomik",
    "Sports Car": "Lüks",
    "Convertible": "Lüks",
    "Truck": "Geniş",
    "Exotic Cars": "Lüks"
  };
  return typeMap[type] || "Orta Sınıf";
};

/**
 * @swagger
 * /api/admin/cars/{id}:
 *   get:
 *     summary: Get single car for admin editing
 *     tags: [Admin - Cars]
 *     security:
 *       - bearerAuth: []
 */
const getAdminCarDetails = async (req, res) => {
  try {
    const { id } = req.params;

    let car;
    if (id === "new") {
      // Return empty car template for new car creation
      return res.status(200).json({
        success: true,
        data: {
          id: null,
          title: "",
          brand: "",
          model: "",
          year: new Date().getFullYear(),
          category: "Lüks",
          fuelType: "Benzin",
          transmission: "Otomatik",
          pricing: {
            daily: "",
            weekly: "",
            monthly: "",
          },
          images: {
            main: {
              url: "",
            },
            gallery: [],
          },
          status: true,
          featured: false,
          features: [],
          description: "",
          seats: "",
          doors: "",
          engineCapacity: "",
        },
      });
    }

    // Find existing car
    car = await Car.findByPk(id, {
      raw: true,
    });

    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    // Transform car data for admin editing - FIXED: use same format as public API
    const transformedCar = {
      id: car.id,
      title: car.title || "",
      brand: car.brand || "",
      model: car.model || "",
      year: car.year || new Date().getFullYear(),
      category: car.category || "Lüks",
      fuelType: car.fuelType || "Benzin", 
      transmission: car.transmission || "Otomatik",
      pricing: {
        daily: car.pricing?.daily?.toString() || "",
        weekly: car.pricing?.weekly?.toString() || "",
        monthly: car.pricing?.monthly?.toString() || "",
      },
      mainImage: car.mainImage || null, // FIXED: direct field like public API
      gallery: car.gallery || [], // FIXED: direct field like public API
      seasonalPricing: car.seasonalPricing || [], // FIXED: Add seasonal pricing
      status: car.status !== undefined ? car.status : true,
      featured: car.featured || false,
      features: car.features || [],
      description: car.description || "",
      seats: car.seats?.toString() || "",
      doors: car.doors?.toString() || "",
      engineCapacity: car.engineCapacity || "",
    };

    res.status(200).json({ success: true, data: transformedCar });
  } catch (error) {
    console.error("Error in getAdminCarDetails:", error);
    res.status(500).json({
      success: false,
      error: "Failed to fetch car details",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

/**
 * @swagger
 * /api/admin/cars:
 *   post:
 *     summary: Create new car
 *     tags: [Admin - Cars]
 *     security:
 *       - bearerAuth: []
 */
const createAdminCar = async (req, res) => {
  console.log("🚨 === CREATE CAR CONTROLLER HIT ===");
  console.log("🚨 Request method:", req.method);
  console.log("🚨 Request URL:", req.url);
  console.log("🚨 Request body:", JSON.stringify(req.body, null, 2));

  try {
    const {
      title,
      brand,
      model,
      year,
      category,
      fuelType,
      transmission,
      pricing,
      mainImage,
      gallery,
      status,
      featured,
      features,
      description,
      seats,
      doors,
      engineCapacity,
      bodyType,
    } = req.body;

    // Validate required fields (like blog does)
    if (!title || !pricing?.daily) {
      return res.status(400).json({
        success: false,
        error: "Car title and daily price are required",
      });
    }

    // Get admin user ID (like blog does)
    const userId = req.admin?.id || req.user?.id || null;

    // Generate unique slug from title (like blog does)
    const baseSlug = title
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "");
    
    // Add timestamp to ensure uniqueness
    const timestamp = Date.now().toString(36);
    const finalSlug = `${baseSlug}-${timestamp}`;

    // Handle mainImage exactly like blog handles featuredImage
    const imageData = mainImage?.url ? {
      url: mainImage.url,
      alt: mainImage.alt || `${brand} ${model}`,
      publicId: mainImage.publicId || ''
    } : null;

    // Simple car data object (like blog does)
    const carData = {
      title: title.trim(),
      brand: brand || "BMW",
      model: model || "Model",
      year: year || new Date().getFullYear(),
      category: category || "Lüks",
      bodyType: bodyType || "Sedan",
      fuelType: fuelType || "Benzin",
      transmission: transmission || "Otomatik",
      seats: seats ? parseInt(seats) : 5,
      doors: doors ? parseInt(doors) : 4,
      engineCapacity: engineCapacity ? parseInt(engineCapacity) : null,
      description: description || "",
      slug: finalSlug,
      pricing: {
        daily: parseFloat(pricing.daily),
        weekly: parseFloat(pricing.weekly) || parseFloat(pricing.daily) * 7,
        monthly: parseFloat(pricing.monthly) || parseFloat(pricing.daily) * 30,
        currency: "TRY",
      },
      mainImage: imageData,
      gallery: gallery || [],
      features: features || [],
      status: status ? "active" : "inactive",
      featured: Boolean(featured),
      userId,
    };

    console.log("🔄 Processing car data:", {
      title,
      brand,
      status: carData.status,
      featured: carData.featured,
      hasMainImage: !!imageData,
      featuresCount: features?.length || 0,
    });

    // Save to database (like blog does)
    console.log("🚀 About to call Car.create...");
    const newCar = await Car.create(carData);
    console.log("✅ Car.create completed successfully");

    res.status(201).json({
      success: true,
      data: newCar,
      message: "Car created successfully",
    });
  } catch (error) {
    console.error("Error in createAdminCar:", error);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      error: "Failed to create car",
      message: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

/**
 * @swagger
 * /api/admin/cars/{id}:
 *   put:
 *     summary: Update existing car
 *     tags: [Admin - Cars]
 *     security:
 *       - bearerAuth: []
 */
const updateAdminCar = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    // Mass-assignment guard: never let identity/audit columns be set from the body.
    ["id", "user_id", "userId", "createdAt", "updatedAt", "created_at", "updated_at"].forEach(
      (f) => delete updateData[f]
    );

    console.log("🔄 Updating car:", id, "with data:", updateData);

    // Find existing car (like blog does)
    const car = await Car.findByPk(id);
    if (!car) {
      console.log("❌ Car not found for update:", id);
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    // Handle mainImage exactly like blog handles featuredImage
    if (updateData.mainImage?.url) {
      updateData.mainImage = {
        url: updateData.mainImage.url,
        alt: updateData.mainImage.alt || `${car.brand} ${car.model}`,
        publicId: updateData.mainImage.publicId || ''
      };
    }

    // Clean up update data (like blog does)
    if (updateData.title) {
      updateData.title = updateData.title.trim();
      // Update slug if title changed
      updateData.slug = updateData.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "");
    }

    // Handle numeric fields
    if (updateData.year) updateData.year = parseInt(updateData.year);
    if (updateData.seats) updateData.seats = parseInt(updateData.seats);
    if (updateData.doors) updateData.doors = parseInt(updateData.doors);
    if (updateData.engineCapacity) updateData.engineCapacity = parseInt(updateData.engineCapacity);

    // Handle pricing
    if (updateData.pricing) {
      updateData.pricing = {
        daily: parseFloat(updateData.pricing.daily),
        weekly: parseFloat(updateData.pricing.weekly) || parseFloat(updateData.pricing.daily) * 7,
        monthly: parseFloat(updateData.pricing.monthly) || parseFloat(updateData.pricing.daily) * 30,
        currency: updateData.pricing.currency || "TRY",
      };
    }

    // Handle status conversion
    if (updateData.status !== undefined) {
      updateData.status = updateData.status ? "active" : "inactive";
    }

    // Update car in database (like blog does)
    await car.update(updateData);

    console.log("✅ Car updated successfully");

    res.json({
      success: true,
      data: car,
      message: "Car updated successfully",
    });
  } catch (error) {
    console.error("Error in updateAdminCar:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update car",
      message: error.message,
    });
  }
};

/**
 * @swagger
 * /api/admin/cars/{id}:
 *   delete:
 *     summary: Delete car
 *     tags: [Admin - Cars]
 *     security:
 *       - bearerAuth: []
 */
const deleteAdminCar = async (req, res) => {
  try {
    const { id } = req.params;

    // Find existing car
    const car = await Car.findByPk(id);
    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    // Delete images from Cloudinary if they exist
    try {
      if (car.mainImage?.publicId) {
        await deleteImage(car.mainImage.publicId);
      }

      if (car.gallery && car.gallery.length > 0) {
        for (const image of car.gallery) {
          if (image.publicId) {
            await deleteImage(image.publicId);
          }
        }
      }
    } catch (imageError) {
      console.warn("Error deleting images from Cloudinary:", imageError);
      // Continue with car deletion even if image deletion fails
    }

    // Delete the car
    await car.destroy();

    res.status(200).json({
      success: true,
      message: "Car deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteAdminCar:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete car",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

/**
 * @swagger
 * /api/admin/cars/{id}/scheduled-pricing:
 *   get:
 *     summary: Get scheduled pricing for a car
 *     tags: [Admin - Cars]
 *     security:
 *       - bearerAuth: []
 */
const getCarScheduledPricing = async (req, res) => {
  try {
    const { id } = req.params;

    const car = await Car.findById(id).select('scheduledPricing');
    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    res.status(200).json({
      success: true,
      data: car.scheduledPricing || [],
    });
  } catch (error) {
    console.error("Error in getCarScheduledPricing:", error);
    res.status(500).json({
      success: false,
      error: "Failed to get scheduled pricing",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

/**
 * @swagger
 * /api/admin/cars/{id}/scheduled-pricing:
 *   post:
 *     summary: Add scheduled pricing for a car
 *     tags: [Admin - Cars]
 *     security:
 *       - bearerAuth: []
 */
const addCarScheduledPricing = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, startDate, endDate, prices } = req.body;

    const car = await Car.findById(id);
    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    const newPricing = {
      name,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      prices: {
        USD: prices?.USD || 0,
        EUR: prices?.EUR || 0,
        TRY: prices?.TRY || 0,
      },
      createdAt: new Date(),
    };

    if (!car.scheduledPricing) {
      car.scheduledPricing = [];
    }
    car.scheduledPricing.push(newPricing);
    await car.save();

    res.status(201).json({
      success: true,
      data: newPricing,
      message: "Scheduled pricing added successfully",
    });
  } catch (error) {
    console.error("Error in addCarScheduledPricing:", error);
    res.status(500).json({
      success: false,
      error: "Failed to add scheduled pricing",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

/**
 * @swagger
 * /api/admin/cars/{id}/scheduled-pricing/{pricingId}:
 *   delete:
 *     summary: Delete scheduled pricing for a car
 *     tags: [Admin - Cars]
 *     security:
 *       - bearerAuth: []
 */
const deleteCarScheduledPricing = async (req, res) => {
  try {
    const { id, pricingId } = req.params;

    const car = await Car.findById(id);
    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    if (!car.scheduledPricing) {
      return res.status(404).json({
        success: false,
        error: "Scheduled pricing not found",
      });
    }

    const pricingIndex = car.scheduledPricing.findIndex(
      (pricing) => pricing._id.toString() === pricingId
    );

    if (pricingIndex === -1) {
      return res.status(404).json({
        success: false,
        error: "Scheduled pricing not found",
      });
    }

    car.scheduledPricing.splice(pricingIndex, 1);
    await car.save();

    res.status(200).json({
      success: true,
      message: "Scheduled pricing deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteCarScheduledPricing:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete scheduled pricing",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

/**
 * @swagger
 * /api/admin/cars/{id}/inventory:
 *   put:
 *     summary: Update car inventory
 *     tags: [Admin - Cars]
 *     security:
 *       - bearerAuth: []
 */
const updateCarInventory = async (req, res) => {
  try {
    const { id } = req.params;
    const { totalUnits, rentedUnits, maintenanceUnits, outOfServiceUnits } = req.body;

    const car = await Car.findById(id);
    if (!car) {
      return res.status(404).json({
        success: false,
        error: "Car not found",
      });
    }

    const updateData = {};
    if (totalUnits !== undefined) updateData['inventory.totalUnits'] = parseInt(totalUnits);
    if (rentedUnits !== undefined) updateData['inventory.rentedUnits'] = parseInt(rentedUnits);
    if (maintenanceUnits !== undefined) updateData['inventory.maintenanceUnits'] = parseInt(maintenanceUnits);
    if (outOfServiceUnits !== undefined) updateData['inventory.outOfServiceUnits'] = parseInt(outOfServiceUnits);

    const updatedCar = await Car.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: updatedCar.inventory,
      message: "Car inventory updated successfully",
    });
  } catch (error) {
    console.error("Error in updateCarInventory:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update car inventory",
      message:
        process.env.NODE_ENV === "development"
          ? error.message
          : "Something went wrong",
    });
  }
};

// Add the other admin functions as exports
exports.getFilteredCars = getFilteredCars;
exports.getFilterOptions = getFilterOptions;
exports.toggleCarLike = toggleCarLike;
exports.checkCarAvailability = checkCarAvailability;
exports.getAdminCars = getAdminCars;
exports.getAdminCarDetails = getAdminCarDetails;
exports.createAdminCar = createAdminCar;
exports.updateAdminCar = updateAdminCar;
exports.updateCarStatus = updateCarStatus;
exports.deleteAdminCar = deleteAdminCar;
exports.getCarScheduledPricing = getCarScheduledPricing;
exports.addCarScheduledPricing = addCarScheduledPricing;
exports.deleteCarScheduledPricing = deleteCarScheduledPricing;
exports.updateCarInventory = updateCarInventory;
