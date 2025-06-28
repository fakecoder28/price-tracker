const puppeteer = require('puppeteer');

const PRICE_SELECTORS = [
  '.price',
  '.product-price',
  '[data-price]',
  '.money',
  '.amount'
];

async function scrape(url) {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    let price = null;
    let rawPrice = null;
    
    for (const selector of PRICE_SELECTORS) {
      try {
        const element = await page.$(selector);
        if (element) {
          rawPrice = await page.evaluate(el => el.textContent.trim(), element);
          if (rawPrice) {
            const match = rawPrice.match(/[\d,]+/);
            if (match) {
              price = parseInt(match[0].replace(/,/g, ''));
              break;
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    if (!price) {
      throw new Error('Price not found on page');
    }
    
    return {
      success: true,
      price: price,
      currency: 'INR',
      rawPrice: rawPrice
    };
    
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
