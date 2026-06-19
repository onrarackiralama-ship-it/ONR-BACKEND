// src/models/Admin.js - Complete PostgreSQL Admin Model
const { DataTypes, Op } = require("sequelize");
const bcrypt = require("bcryptjs");
const { sequelize } = require("../config/database");

const Admin = sequelize.define(
  "Admin",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    username: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    firstName: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    lastName: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    role: {
      type: DataTypes.ENUM("super_admin", "admin", "manager", "editor"),
      defaultValue: "admin",
    },
    avatar: {
      type: DataTypes.JSONB,
      defaultValue: null,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    emailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    lastLoginIP: {
      type: DataTypes.STRING,
      allowNull: true,
      field: "last_login_ip",
    },
    loginAttempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    lockUntil: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    passwordResetToken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    passwordResetExpires: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    emailVerificationToken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    permissions: {
      type: DataTypes.JSONB,
      defaultValue: [],
    },
    preferences: {
      type: DataTypes.JSONB,
      defaultValue: {
        language: "tr",
        timezone: "Europe/Istanbul",
        dateFormat: "DD/MM/YYYY",
        theme: "light",
        notifications: {
          email: true,
          browser: true,
          newBookings: true,
          messages: true,
        },
      },
    },
    activity: {
      type: DataTypes.JSONB,
      defaultValue: {
        totalLogins: 0,
        lastActions: [],
      },
    },
  },
  {
    tableName: "admins",
    underscored: true,
    timestamps: true,
    hooks: {
      // Hash password before creating admin
      beforeCreate: async (admin) => {
        if (admin.password) {
          const salt = await bcrypt.genSalt(12);
          admin.password = await bcrypt.hash(admin.password, salt);
        }
      },
      // Hash password before updating admin
      beforeUpdate: async (admin) => {
        if (admin.changed("password")) {
          const salt = await bcrypt.genSalt(12);
          admin.password = await bcrypt.hash(admin.password, salt);
        }
      },
    },
  }
);

// INSTANCE METHODS

// Compare password method
Admin.prototype.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    console.error("❌ Error comparing password:", error);
    return false;
  }
};

// Get full name
Admin.prototype.getFullName = function () {
  return `${this.firstName} ${this.lastName}`.trim();
};

// Check if account is locked
Admin.prototype.isLocked = function () {
  return this.lockUntil && this.lockUntil > new Date();
};

// Handle successful login
Admin.prototype.handleSuccessfulLogin = async function (ip, userAgent) {
  this.loginAttempts = 0;
  this.lockUntil = null;
  this.lastLogin = new Date();
  this.lastLoginIP = ip;

  // Update activity
  if (!this.activity) {
    this.activity = { totalLogins: 0, lastActions: [] };
  }

  this.activity.totalLogins = (this.activity.totalLogins || 0) + 1;

  return this.save();
};

// Handle failed login
Admin.prototype.handleFailedLogin = async function () {
  this.loginAttempts = (this.loginAttempts || 0) + 1;

  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts >= 5) {
    this.lockUntil = new Date(Date.now() + 2 * 60 * 60 * 1000);
  }

  return this.save();
};

// Check permission
Admin.prototype.hasPermission = function (module, action) {
  if (this.role === "super_admin") return true;

  if (!this.permissions || !Array.isArray(this.permissions)) {
    return false;
  }

  const modulePermission = this.permissions.find(
    (perm) => perm.module === module
  );
  if (!modulePermission) return false;

  return modulePermission.actions && modulePermission.actions.includes(action);
};

// Log activity
Admin.prototype.logActivity = async function (
  action,
  module,
  description,
  req = null
) {
  const activityEntry = {
    action,
    module,
    description,
    timestamp: new Date(),
    ip: req ? req.ip || req.connection?.remoteAddress : null,
    userAgent: req ? req.get("User-Agent") : null,
  };

  if (!this.activity) this.activity = { totalLogins: 0, lastActions: [] };
  if (!this.activity.lastActions) this.activity.lastActions = [];

  this.activity.lastActions.unshift(activityEntry);

  // Keep only last 50 activities
  if (this.activity.lastActions.length > 50) {
    this.activity.lastActions = this.activity.lastActions.slice(0, 50);
  }

  return this.save();
};

// Override toJSON to exclude sensitive data
Admin.prototype.toJSON = function () {
  const values = Object.assign({}, this.get());
  delete values.password;
  delete values.passwordResetToken;
  delete values.emailVerificationToken;

  // Add computed properties
  values.fullName = this.getFullName();
  values.isLocked = this.isLocked();

  return values;
};

// STATIC METHODS

// Find admin by login (username or email)
Admin.findByLogin = async function (login) {
  try {
    if (!login) {
      throw new Error("Login parameter is required");
    }

    console.log("🔍 Finding admin by login:", login);

    const admin = await this.findOne({
      where: {
        [Op.or]: [
          { username: login.toLowerCase() },
          { email: login.toLowerCase() },
        ],
        isActive: true,
      },
    });

    console.log("🔍 Admin found:", admin ? "Yes" : "No");
    return admin;
  } catch (error) {
    console.error("❌ Error in findByLogin:", error);
    throw error;
  }
};

// Create default admin if none exists
Admin.createDefaultAdmin = async function () {
  try {
    const adminCount = await this.count();

    if (adminCount === 0) {
      // No hardcoded default password. The first admin is seeded only when
      // ADMIN_SEED_PASSWORD is provided; otherwise seeding is skipped so we never
      // create a known-credential super_admin.
      const seedPassword = process.env.ADMIN_SEED_PASSWORD;
      if (!seedPassword) {
        console.warn(
          "⚠️  No admins exist and ADMIN_SEED_PASSWORD is not set — skipping default admin seed."
        );
        return null;
      }

      console.log("🔄 Creating default admin user...");

      const defaultAdmin = await this.create({
        username: process.env.ADMIN_SEED_USERNAME || "admin",
        email: process.env.ADMIN_SEED_EMAIL || "admin@onrcarrental.com",
        password: seedPassword,
        firstName: "System",
        lastName: "Administrator",
        role: "super_admin",
        isActive: true,
        emailVerified: true,
        permissions: [
          {
            module: "cars",
            actions: ["create", "read", "update", "delete", "export"],
          },
          {
            module: "locations",
            actions: ["create", "read", "update", "delete", "export"],
          },
          {
            module: "bookings",
            actions: ["create", "read", "update", "delete", "export"],
          },
          {
            module: "content",
            actions: ["create", "read", "update", "delete"],
          },
          {
            module: "settings",
            actions: ["create", "read", "update", "delete"],
          },
          {
            module: "admin",
            actions: ["create", "read", "update", "delete"],
          },
        ],
      });

      console.log(
        `✅ Default admin created (username: ${defaultAdmin.username}). Password set from ADMIN_SEED_PASSWORD.`
      );

      return defaultAdmin;
    }

    console.log("✅ Admin users already exist in database");
    return null;
  } catch (error) {
    console.error("❌ Error creating default admin:", error);
    throw error;
  }
};

// Get default permissions for role
Admin.getDefaultPermissions = function (role) {
  const permissionSets = {
    super_admin: [
      {
        module: "cars",
        actions: ["create", "read", "update", "delete", "export"],
      },
      {
        module: "locations",
        actions: ["create", "read", "update", "delete", "export"],
      },
      {
        module: "bookings",
        actions: ["create", "read", "update", "delete", "export"],
      },
      { module: "content", actions: ["create", "read", "update", "delete"] },
      { module: "settings", actions: ["create", "read", "update", "delete"] },
      { module: "admin", actions: ["create", "read", "update", "delete"] },
    ],
    admin: [
      { module: "cars", actions: ["create", "read", "update", "delete"] },
      { module: "locations", actions: ["create", "read", "update", "delete"] },
      { module: "bookings", actions: ["create", "read", "update", "delete"] },
      { module: "content", actions: ["create", "read", "update", "delete"] },
    ],
    manager: [
      { module: "cars", actions: ["read", "update"] },
      { module: "locations", actions: ["read", "update"] },
      { module: "bookings", actions: ["read", "update"] },
      { module: "content", actions: ["read", "update"] },
    ],
    editor: [
      { module: "content", actions: ["create", "read", "update"] },
      { module: "cars", actions: ["read"] },
      { module: "bookings", actions: ["read"] },
    ],
  };

  return permissionSets[role] || [];
};

// Setup database and create default admin
Admin.setupDatabase = async function () {
  try {
    console.log("🔄 Setting up Admin model...");

    // Sync model with database
    await this.sync({ alter: true });
    console.log("✅ Admin model synchronized with database");

    // Create default admin if needed
    await this.createDefaultAdmin();

    console.log("🎉 Admin model setup completed!");
    return true;
  } catch (error) {
    console.error("❌ Admin model setup failed:", error);
    throw error;
  }
};

// ASSOCIATIONS
Admin.associate = function (models) {
  if (models.Car) {
    Admin.hasMany(models.Car, {
      foreignKey: "userId",
      as: "cars",
      onDelete: "CASCADE",
    });
  }

  if (models.Blog) {
    Admin.hasMany(models.Blog, {
      foreignKey: "userId",
      as: "blogs",
      onDelete: "CASCADE",
    });
  }

  if (models.Listing) {
    Admin.hasMany(models.Listing, {
      foreignKey: "userId",
      as: "listings",
      onDelete: "CASCADE",
    });
  }
};

module.exports = Admin;
