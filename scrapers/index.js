const fs = require('fs');
const path = require('path');
const amazonScraper = require('./amazon-scraper');
const argosScraper = require('./argos-scraper');
const { savePrice, loadProducts, delay } = require('./utils');

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'
];

async function scrapePrice(product) {
  try {
    console.log(`Scraping: ${product.name}`);
    
    let result;
    if (product.site === 'amazon.in') {
      result = await amazonScraper.scrape(product.url);
    } else if (product.site === 'argoswatch.in') {
      result = await argosScraper.scrape(product.url);
    } else {
      throw new Error(`Unsupported site: ${product.site}`);
    }
    
    if (result.success) {
      await savePrice(product.id, {
        date: new Date().toISOString().split('T')[0],
        price: result.price,
        currency: result.currency || 'INR',
        status: 'success',
        rawData: result.rawPrice
      });
      
      // Update product status
      product.status = 'active';
      product.lastError = null;
    } else {
      throw new Error(result.error);
    }
    
  } catch (error) {
    console.error(`Error scraping ${product.name}:`, error.message);
    
    // Update product with error status
    product.status = 'error';
    product.lastError = error.message;
    
    await savePrice(product.id, {
      date: new Date().toISOString().split('T')[0],
      price: null,
      currency: null,
      status: 'error',
      error: error.message
    });
  }
}

async function main() {
  try {
    const products = loadProducts();
    console.log(`Found ${products.length} products to scrape`);
    
    for (const product of products) {
      await scrapePrice(product);
      await delay(Math.random() * 3000 + 2000); // 2-5 second delay
    }
    
    // Save updated products.json
    fs.writeFileSync(
      path.join(__dirname, '../data/products.json'),
      JSON.stringify({ products }, null, 2)
    );
    
    console.log('Scraping completed successfully');
  } catch (error) {
    console.error('Scraping failed:', error);
    process.exit(1);
  }
}

main();
