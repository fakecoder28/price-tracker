// Updated amazon-scraper.js with mobile URL approach
const puppeteer = require('puppeteer');

function convertToMobileURL(url) {
  // Convert to mobile Amazon which has less bot detection
  return url.replace('www.amazon.in', 'm.amazon.in');
}

async function scrape(url) {
  let browser;
  try {
    // Try mobile version first
    const mobileUrl = convertToMobileURL(url);
    console.log(`Trying mobile URL: ${mobileUrl}`);
    
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15'
      ]
    });
    
    const page = await browser.newPage();
    
    // Simulate mobile device
    await page.setUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1'
    );
    
    await page.setViewport({ 
      width: 375, 
      height: 667,
      isMobile: true,
      hasTouch: true
    });
    
    await page.goto(mobileUrl, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    // Mobile Amazon selectors
    const mobilePriceSelectors = [
      '.a-price-whole',
      '.a-price',
      '[data-automation-id="list-price"]',
      '.a-color-price',
      '#price_inside_buybox'
    ];
    
    // Try mobile selectors
    for (const selector of mobilePriceSelectors) {
      const element = await page.$(selector);
      if (element) {
        const rawPrice = await page.evaluate(el => el.textContent.trim(), element);
        const match = rawPrice.match(/[\d,]+/);
        if (match) {
          const price = parseFloat(match[0].replace(/,/g, ''));
          if (price > 0) {
            return {
              success: true,
              price: price,
              currency: 'INR',
              rawPrice: rawPrice
            };
          }
        }
      }
    }
    
    throw new Error('Price not found on mobile version');
    
  } catch (error) {
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
