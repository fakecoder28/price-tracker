const puppeteer = require('puppeteer');

const PRICE_SELECTORS = [
  '.price',
  '.product-price',
  '[data-price]',
  '.money',
  '.amount',
  '.price-box .price',
  '.product-detail-price',
  '.current-price'
];

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
    
    await page.waitForTimeout(3000); // Wait for any dynamic loading
    
    let price = null;
    let rawPrice = null;
    
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
    
    if (!price) {
      await page.screenshot({ path: '/tmp/debug.png' });
      throw new Error('Price not found with any selector');
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
