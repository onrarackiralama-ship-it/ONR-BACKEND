// src/models/ExchangeRate.js - Exchange Rate Management Model (PostgreSQL)
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ExchangeRate = sequelize.define('ExchangeRate', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  
  // Base currency (always TRY in our system)
  baseCurrency: {
    type: DataTypes.STRING(3),
    defaultValue: "TRY",
    allowNull: false,
    validate: {
      isIn: [["TRY"]]
    }
  },
  
  // Exchange rates relative to TRY
  rates: {
    type: DataTypes.JSONB,
    defaultValue: {
      TRY: 1,
      EUR: 0.03,
      USD: 0.035
    },
    allowNull: false,
    validate: {
      isValidRates(value) {
        if (!value.TRY || !value.EUR || !value.USD) {
          throw new Error('All currency rates (TRY, EUR, USD) are required');
        }
        if (value.TRY !== 1) {
          throw new Error('Base currency TRY must equal 1');
        }
      }
    }
  },
  
  // When this rate was fetched/updated
  fetchedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  
  // Source of the exchange rate
  source: {
    type: DataTypes.STRING(50),
    defaultValue: "manual",
    allowNull: false
  },
  
  // Whether this is the active/current rate
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    allowNull: false
  }
}, {
  tableName: 'exchange_rates',
  // index fields must be the real (snake_case) column names — see cars.js note
  indexes: [
    { fields: ['base_currency'] },
    { fields: ['is_active'] },
    { fields: ['fetched_at'] }
  ]
});

// Instance method to get rate for specific currency
ExchangeRate.prototype.getRate = function(currency) {
  return this.rates[currency] || 1;
};

// Instance method to convert amount between currencies
ExchangeRate.prototype.convertAmount = function(amount, fromCurrency, toCurrency) {
  const fromRate = this.getRate(fromCurrency);
  const toRate = this.getRate(toCurrency);
  
  // Convert to base currency first, then to target currency
  return (amount / fromRate) * toRate;
};

// Static method to get current active rates
ExchangeRate.getCurrentRates = async function() {
  const activeRate = await this.findOne({
    where: { isActive: true },
    order: [['fetchedAt', 'DESC']]
  });
  
  if (!activeRate) {
    // Create default rates if none exist
    return await this.create({
      baseCurrency: 'TRY',
      rates: {
        TRY: 1,
        EUR: 0.03,
        USD: 0.035
      },
      source: 'default',
      isActive: true
    });
  }
  
  return activeRate;
};

module.exports = ExchangeRate;