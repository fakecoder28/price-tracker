const fs = require('fs');
const path = require('path');

function loadProducts() {
  try {
    const productsPath = path.join(__dirname, '../data/products.json');
    if (fs.existsSync(productsPath)) {
      const data = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
      return data.products || [];
    }
  } catch (error) {
    console.error('Error loading products:', error);
  }
  return [];
}

async function savePrice(productId, priceData) {
  const pricesDir = path.join(__dirname, '../data/prices');
  if (!fs.existsSync(pricesDir)) {
    fs.mkdirSync(pricesDir, { recursive: true });
  }
  
  const filePath = path.join(pricesDir, `${productId}.json`);
  
  let priceHistory = { productId, prices: [] };
  if (fs.existsSync(filePath)) {
    priceHistory = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }
  
  // Add new price
  priceHistory.prices.push(priceData);
  
  // Keep only last 60 days
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  priceHistory.prices = priceHistory.prices.filter(p => 
    new Date(p.date) >= sixtyDaysAgo
  );
  
  fs.writeFileSync(filePath, JSON.stringify(priceHistory, null, 2));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { loadProducts, savePrice, delay };
