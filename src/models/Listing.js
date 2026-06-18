// src/models/Listing.js - Car Listing Model for PostgreSQL
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Listing = sequelize.define('Listing', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(200),
    allowNull: false,
    validate: {
      notEmpty: { msg: 'Title is required' },
      len: { args: [5, 200], msg: 'Title must be between 5-200 characters' }
    }
  },
  slug: {
    type: DataTypes.STRING(250),
    allowNull: false,
    unique: {
      msg: 'Slug must be unique'
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
    validate: {
      len: { args: [0, 5000], msg: 'Description cannot exceed 5000 characters' }
    }
  },
  
  // Car Details
  brand: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      notEmpty: { msg: 'Brand is required' }
    }
  },
  model: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      notEmpty: { msg: 'Model is required' }
    }
  },
  year: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: { args: 1980, msg: 'Year must be after 1980' },
      max: { args: new Date().getFullYear() + 1, msg: 'Year cannot be in the future' }
    }
  },
  category: {
    type: DataTypes.ENUM('Ekonomik', 'Orta Sınıf', 'Üst Sınıf', 'SUV', 'Geniş', 'Lüks'),
    allowNull: false,
    defaultValue: 'Ekonomik'
  },
  
  // Technical Specs
  fuelType: {
    type: DataTypes.ENUM('Benzin', 'Dizel', 'Benzin+LPG', 'Elektrikli', 'Hibrit'),
    allowNull: false,
    defaultValue: 'Benzin'
  },
  transmission: {
    type: DataTypes.ENUM('Manuel', 'Yarı Otomatik', 'Otomatik'),
    allowNull: false,
    defaultValue: 'Manuel'
  },
  bodyType: {
    type: DataTypes.STRING(50),
    allowNull: false,
    defaultValue: 'Sedan'
  },
  seats: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 5,
    validate: {
      min: { args: 2, msg: 'Seats cannot be less than 2' },
      max: { args: 50, msg: 'Seats cannot be more than 50' }
    }
  },
  doors: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 4,
    validate: {
      min: { args: 2, msg: 'Doors cannot be less than 2' },
      max: { args: 6, msg: 'Doors cannot be more than 6' }
    }
  },
  
  // Images - PostgreSQL JSONB for flexible image storage
  images: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {
      main: null, // { url: 'cloudinary_url', publicId: 'public_id', filename: 'original_filename' }
      gallery: [] // Array of image objects
    },
    validate: {
      isValidImageStructure(value) {
        if (value && typeof value === 'object') {
          // Validate main image structure
          if (value.main && (!value.main.url || !value.main.publicId)) {
            throw new Error('Main image must have url and publicId');
          }
          // Validate gallery images
          if (value.gallery && Array.isArray(value.gallery)) {
            for (let img of value.gallery) {
              if (!img.url || !img.publicId) {
                throw new Error('Gallery images must have url and publicId');
              }
            }
          }
        }
      }
    }
  },
  
  // Pricing
  pricing: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: {
      daily: 0,
      weekly: 0,
      monthly: 0,
      currency: 'TRY'
    },
    validate: {
      isValidPricing(value) {
        if (!value || !value.daily || value.daily <= 0) {
          throw new Error('Daily price is required and must be positive');
        }
      }
    }
  },
  
  // Availability & Status
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'maintenance', 'booked'),
    allowNull: false,
    defaultValue: 'active'
  },
  featured: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  
  // Inventory
  totalUnits: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    validate: {
      min: { args: 0, msg: 'Total units cannot be negative' }
    }
  },
  availableUnits: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
    validate: {
      min: { args: 0, msg: 'Available units cannot be negative' }
    }
  },
  
  // Requirements
  minDriverAge: {
    type: DataTypes.INTEGER,
    defaultValue: 21,
    validate: {
      min: { args: 18, msg: 'Minimum driver age cannot be less than 18' }
    }
  },
  minLicenseYear: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    validate: {
      min: { args: 0, msg: 'Minimum license year cannot be negative' }
    }
  },
  
  // Contact Info
  whatsappNumber: {
    type: DataTypes.STRING(20),
    defaultValue: process.env.DEFAULT_WHATSAPP || '+905366039907'
  },
  
  // SEO
  metaDescription: {
    type: DataTypes.STRING(160),
    allowNull: true
  },
  keywords: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  
  // Statistics
  stats: {
    type: DataTypes.JSONB,
    defaultValue: {
      viewCount: 0,
      reservationCount: 0,
      rating: {
        average: 0,
        count: 0
      }
    }
  },
  
  // Foreign Key
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'admins',
      key: 'id'
    },
    onDelete: 'CASCADE'
  }
}, {
  tableName: 'listings',
  // index fields must be the real (snake_case) column names — see cars.js note
  indexes: [
    { fields: ['user_id'] },
    { fields: ['status'] },
    { fields: ['featured'] },
    { fields: ['brand', 'model'] },
    { fields: ['category'] },
    { fields: ['slug'] },
    { fields: ['pricing'], using: 'gin' }, // JSONB index
    { fields: ['images'], using: 'gin' } // JSONB index
  ],
  hooks: {
    beforeSave: async (listing) => {
      // Generate slug if not exists or title changed
      if (listing.changed('title') || !listing.slug) {
        const baseSlug = listing.title
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '-')
          .replace(/-+/g, '-')
          .replace(/^-|-$/g, '');
        
        const timestamp = Date.now().toString(36);
        listing.slug = `${baseSlug}-${timestamp}`;
      }
      
      // Auto-calculate weekly/monthly prices if not set
      if (listing.pricing && listing.pricing.daily) {
        if (!listing.pricing.weekly) {
          listing.pricing.weekly = listing.pricing.daily * 6;
        }
        if (!listing.pricing.monthly) {
          listing.pricing.monthly = listing.pricing.daily * 25;
        }
      }
    }
  }
});

// Instance methods
Listing.prototype.incrementViewCount = async function() {
  this.stats.viewCount += 1;
  await this.save();
  return this;
};

Listing.prototype.getMainImage = function() {
  return this.images?.main?.url || null;
};

Listing.prototype.getGalleryImages = function() {
  return this.images?.gallery || [];
};

Listing.prototype.getFormattedPrice = function(period = 'daily') {
  const currencySymbols = {
    TRY: '₺',
    USD: '$',
    EUR: '€'
  };
  
  const price = this.pricing[period];
  const symbol = currencySymbols[this.pricing.currency] || '₺';
  const periodText = period === 'daily' ? 'gün' : period === 'weekly' ? 'hafta' : 'ay';
  
  return `${symbol}${price}/${periodText}`;
};

module.exports = Listing;