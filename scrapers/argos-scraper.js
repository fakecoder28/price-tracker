const puppeteer = require('puppeteer');

const PRICE_SELECTORS = [
  '.price',
  '.product-price',
  '[data-price]',
  '.money',
  '.amount',
  '.price-box .price',
  '.product-detail-price',
  '.current-price',
  '.product__price',
  '.price-current'
];

// Custom delay function
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrape(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1366, height: 768 });
    
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    // Wait for any dynamic loading using custom delay
    await delay(3000);
    
    let price = null;
    let rawPrice = null;
    
    // Try specific selectors first
    for (const selector of PRICE_SELECTORS) {
      try {
        const element = await page.$(selector);
        if (element) {
          rawPrice = await page.evaluate(el => el.textContent.trim(), element);
          console.log(`Found price with selector ${selector}: ${rawPrice}`);
          
          if (rawPrice) {
            const match = rawPrice.match(/[\d,]+(?:\.\d{2})?/);
            if (match) {
              price = parseFloat(match[0].replace(/,/g, ''));
              if (price > 0) break;
            }
          }
        }
      } catch (e) {
        console.log(`Selector ${selector} failed: ${e.message}`);
        continue;
      }
    }
    
    // Fallback: Look for price patterns in page content
    if (!price) {
      try {
        // Get page content and search for price patterns
        const pageContent = await page.content();
        
        // Look for various price patterns
        const pricePatterns = [
          /₹\s*([\d,]+)/g,
          /INR\s*([\d,]+)/g,
          /Rs\.?\s*([\d,]+)/g,
          /"price"[^>]*>.*?([\d,]+)/g
        ];
        
        for (const pattern of pricePatterns) {
          const matches = [...pageContent.matchAll(pattern)];
          for (const match of matches) {
            const testPrice = parseFloat(match[1].replace(/,/g, ''));
            if (testPrice > 1000 && testPrice < 100000) { // Reasonable range for watches
              price = testPrice;
              rawPrice = match[0];
              console.log(`Found price with pattern search: ${rawPrice}`);
              break;
            }
          }
          if (price) break;
        }
      } catch (e) {
        console.log('Pattern search failed:', e.message);
      }
    }
    
    if (!price) {
      throw new Error('Price not found with any method');
    }
    
    return {
      success: true,
      price: price,
      currency: 'INR',
      rawPrice: rawPrice
    };
    
  } catch (error) {
    console.error('Argos scraper error:', error.message);
    return {
      success: false,
      error: error.message
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = { scrape };
