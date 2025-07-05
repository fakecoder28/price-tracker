const puppeteer = require('puppeteer');

const PRICE_SELECTORS = [
  '.a-price-whole',
  '.a-price .a-offscreen',
  '#priceblock_ourprice',
  '#priceblock_dealprice',
  '.a-price-range .a-price .a-offscreen',
  '.a-box-group .a-price .a-offscreen',
  'span.a-price.a-text-price.a-size-medium.apexPriceToPay .a-offscreen'
];

// Custom delay function to replace waitForTimeout
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
    
    // Set user agent and viewport
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    await page.setViewport({ width: 1366, height: 768 });
    
    // Navigate to page
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 30000 
    });
    
    // Wait for dynamic content using custom delay
    await delay(2000);
    
    let price = null;
    let rawPrice = null;
    
    // Try each selector
    for (const selector of PRICE_SELECTORS) {
      try {
        // Wait for selector to appear
        await page.waitForSelector(selector, { timeout: 5000 });
        const element = await page.$(selector);
        if (element) {
          rawPrice = await page.evaluate(el => el.textContent.trim(), element);
          console.log(`Found price with selector ${selector}: ${rawPrice}`);
          
          if (rawPrice) {
            // Extract numeric price (handle both ₹2,999 and 2,999 formats)
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
    
    // If no specific selectors worked, try a more general approach
    if (!price) {
      try {
        // Look for any element containing price-like text
        const priceElements = await page.$$eval('*', elements => {
          return elements
            .map(el => el.textContent?.trim())
            .filter(text => text && /₹[\d,]+/.test(text))
            .slice(0, 5); // Take first 5 matches
        });
        
        for (const priceText of priceElements) {
          const match = priceText.match(/₹([\d,]+)/);
          if (match) {
            const testPrice = parseFloat(match[1].replace(/,/g, ''));
            if (testPrice > 100 && testPrice < 100000) { // Reasonable price range
              price = testPrice;
              rawPrice = priceText;
              console.log(`Found price with general search: ${rawPrice}`);
              break;
            }
          }
        }
      } catch (e) {
        console.log('General price search failed:', e.message);
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
    console.error('Amazon scraper error:', error.message);
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
