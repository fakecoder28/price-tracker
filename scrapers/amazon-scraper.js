const puppeteer = require('puppeteer');

// More comprehensive price selectors
const PRICE_SELECTORS = [
  '.a-price-whole',
  '.a-price .a-offscreen',
  '.a-price-symbol + .a-price-whole',
  '.a-price[data-a-color="price"] .a-offscreen',
  '#priceblock_ourprice',
  '#priceblock_dealprice',
  '.a-price-range .a-price .a-offscreen',
  '.a-box-group .a-price .a-offscreen',
  'span.a-price.a-text-price.a-size-medium.apexPriceToPay .a-offscreen',
  '.a-price.a-text-price.a-size-medium.apexPriceToPay .a-offscreen',
  '.a-price.a-text-price .a-offscreen',
  '.a-price-whole.a-color-price',
  'span[class*="a-price-whole"]',
  '[data-a-color="price"] .a-price-whole'
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
        '--disable-gpu',
        '--disable-blink-features=AutomationControlled',
        '--disable-features=VizDisplayCompositor'
      ]
    });
    
    const page = await browser.newPage();
    
    // More realistic browser simulation
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );
    
    await page.setViewport({ 
      width: 1920, 
      height: 1080,
      deviceScaleFactor: 1
    });
    
    // Set extra headers to look more like a real browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
    
    // Remove webdriver property
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
    });
    
    console.log(`Navigating to: ${url}`);
    
    // Navigate with longer timeout
    await page.goto(url, { 
      waitUntil: 'networkidle0', 
      timeout: 60000 
    });
    
    console.log('Page loaded, waiting for content...');
    
    // Wait longer for dynamic content
    await delay(5000);
    
    // Debug: Take screenshot to see what we're getting
    try {
      await page.screenshot({ path: '/tmp/amazon-debug.png' });
      console.log('Screenshot saved for debugging');
    } catch (e) {
      console.log('Could not save screenshot');
    }
    
    // Debug: Check page title to confirm we're on the right page
    const title = await page.title();
    console.log(`Page title: ${title}`);
    
    // Debug: Check if we're blocked or redirected
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('sorry') || title.includes('Sorry')) {
      throw new Error('Amazon blocked the request - got "Sorry" page');
    }
    
    let price = null;
    let rawPrice = null;
    
    // Method 1: Try specific selectors without waiting
    console.log('Trying specific selectors...');
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
              if (price > 0) {
                console.log(`✅ Extracted price: ${price}`);
                break;
              }
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    // Method 2: Generic price search
    if (!price) {
      console.log('Trying generic price search...');
      try {
        const priceElements = await page.$$eval('*', elements => {
          return elements
            .map(el => {
              const text = el.textContent?.trim();
              return {
                text: text,
                tagName: el.tagName,
                className: el.className,
                id: el.id
              };
            })
            .filter(item => item.text && /₹\s*[\d,]+/.test(item.text))
            .slice(0, 10); // Take first 10 matches for debugging
        });
        
        console.log(`Found ${priceElements.length} elements with ₹ symbols`);
        priceElements.forEach((el, i) => {
          console.log(`Price element ${i}: ${el.text} (${el.tagName}.${el.className})`);
        });
        
        for (const element of priceElements) {
          const match = element.text.match(/₹\s*([\d,]+)/);
          if (match) {
            const testPrice = parseFloat(match[1].replace(/,/g, ''));
            if (testPrice > 100 && testPrice < 100000) { // Reasonable price range
              price = testPrice;
              rawPrice = element.text;
              console.log(`✅ Found price with generic search: ${rawPrice}`);
              break;
            }
          }
        }
      } catch (e) {
        console.log('Generic price search failed:', e.message);
      }
    }
    
    // Method 3: Look for any number that might be a price
    if (!price) {
      console.log('Trying pattern-based search...');
      try {
        const pageContent = await page.content();
        
        // Look for various price patterns in the HTML
        const patterns = [
          /₹\s*([\d,]+)/g,
          /"price"[^>]*>(.*?₹\s*[\d,]+.*?)</g,
          /class="[^"]*price[^"]*"[^>]*>(.*?[\d,]+.*?)</g
        ];
        
        for (const pattern of patterns) {
          const matches = [...pageContent.matchAll(pattern)];
          console.log(`Pattern found ${matches.length} matches`);
          
          for (const match of matches) {
            const priceText = match[1] || match[0];
            const numberMatch = priceText.match(/[\d,]+/);
            if (numberMatch) {
              const testPrice = parseFloat(numberMatch[0].replace(/,/g, ''));
              if (testPrice > 500 && testPrice < 50000) { // Product price range
                price = testPrice;
                rawPrice = priceText;
                console.log(`✅ Found price with pattern: ${rawPrice}`);
                break;
              }
            }
          }
          if (price) break;
        }
      } catch (e) {
        console.log('Pattern search failed:', e.message);
      }
    }
    
    // Method 4: Last resort - look for any reasonable number
    if (!price) {
      console.log('Trying last resort - any reasonable number...');
      try {
        const numbers = await page.$$eval('*', elements => {
          return elements
            .map(el => el.textContent?.trim())
            .filter(text => text && /^\d{3,5}$/.test(text.replace(/,/g, '')))
            .map(text => parseInt(text.replace(/,/g, '')))
            .filter(num => num > 1000 && num < 20000) // Reasonable range for this product
            .slice(0, 3);
        });
        
        if (numbers.length > 0) {
          price = numbers[0];
          rawPrice = price.toString();
          console.log(`⚠️ Using fallback price: ${price} (this might not be accurate)`);
        }
      } catch (e) {
        console.log('Last resort failed:', e.message);
      }
    }
    
    if (!price) {
      // Save page HTML for debugging
      try {
        const html = await page.content();
        console.log('Page HTML length:', html.length);
        console.log('Page contains ₹:', html.includes('₹'));
        console.log('Page contains price:', html.toLowerCase().includes('price'));
      } catch (e) {
        console.log('Could not analyze HTML');
      }
      
      throw new Error('Price not found with any method. Amazon might be blocking the request.');
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
