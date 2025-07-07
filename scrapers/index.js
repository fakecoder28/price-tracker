const fs = require('fs');
const path = require('path');
const amazonScraper = require('./amazon-scraper');
const argosScraper = require('./argos-scraper');
const flipkartScraper = require('./flipkart-scraper');
const agodaScraper = require('./agoda-scraper');
const { savePrice, loadProducts, delay } = require('./utils');



// In the scrapePrice function, add this case:
async function scrapePrice(product) {
  try {
    console.log(`\n=== Scraping: ${product.name} ===`);
    console.log(`URL: ${product.url}`);
    
    let result;
    if (product.site === 'amazon.in') {
      result = await amazonScraper.scrape(product.url);
    } else if (product.site === 'argoswatch.in') {
      result = await argosScraper.scrape(product.url);
    } else if (product.site === 'agoda.com') {
      result = await agodaScraper.scrape(product.url, product.roomType || "Deluxe King Pool View");
    } else if (product.site === 'flipkart.com') {
      result = await flipkartScraper.scrape(product.url);
    } else {
      throw new Error(`Unsupported site: ${product.site}`);
    }

    if (result.success) {
      console.log(`✅ Success: Found price ${result.price} ${result.currency}`);
      await savePrice(product.id, {
        date: new Date().toISOString().split('T')[0],
        price: result.price,
        currency: result.currency || 'INR',
        status: 'success',
        rawData: result.rawPrice
      });
      product.status = 'active';
      product.lastError = null;
      product.lastUpdated = new Date().toISOString();
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error(`❌ Error scraping ${product.name}:`, error.message);
    product.status = 'error';
    product.lastError = error.message;
    product.lastUpdated = new Date().toISOString();
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
    console.log('🚀 Starting price scraper...');
    
    const products = loadProducts();
    console.log(`📦 Found ${products.length} products to scrape`);
    
    if (products.length === 0) {
      console.log('⚠️  No products found to scrape');
      return;
    }
    
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      console.log(`\n📊 Progress: ${i + 1}/${products.length}`);
      
      await scrapePrice(product);
      
      // Add delay between requests to be respectful
      if (i < products.length - 1) {
        const delayTime = Math.random() * 3000 + 2000; // 2-5 seconds
        console.log(`⏳ Waiting ${Math.round(delayTime/1000)}s before next request...`);
        await delay(delayTime);
      }
    }
    
    // Save updated products.json
    const dataPath = path.join(__dirname, '../data/products.json');
    fs.writeFileSync(dataPath, JSON.stringify({ products }, null, 2));
    
    console.log('\n✅ Scraping completed successfully');
    
    // Summary
    const activeCount = products.filter(p => p.status === 'active').length;
    const errorCount = products.filter(p => p.status === 'error').length;
    console.log(`📈 Summary: ${activeCount} successful, ${errorCount} failed`);
    
  } catch (error) {
    console.error('💥 Scraping failed:', error);
    process.exit(1);
  }
}

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

main();
