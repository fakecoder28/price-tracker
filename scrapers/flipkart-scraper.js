const puppeteer = require('puppeteer');

// Flipkart price selectors (they use different classes)
const PRICE_SELECTORS = [
  '._1_WHN1',
  '._30jeq3._16Jk6d',
  '._3I9_wc._2p6lqe',
  '.notranslate._1_WHN1',
  '._25b18c .notranslate', 
  '._1vC4OE',
  '._3qQ9m1',
  '._16Jk6d',
  '.CEmiEU .Nx9bqj',
  '._2rQ-NK'
];

// Product name selectors
const NAME_SELECTORS = [
  '.B_NuCI',
  '._35KyD6',
  '.yhZ0Tl',
  '.x-product-title-label',
  '._2V5EHH'
];

// Custom delay function
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrape(url) {
  let browser;
  try {
    console.log(`Starting Flipkart scraper for: ${url}`);
    
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
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set realistic browser properties
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );
    
    await page.setViewport({ 
      width: 1366, 
      height: 768,
      deviceScaleFactor: 1
    });
    
    // Set headers to look legitimate
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
    
    // Remove automation indicators
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined,
      });
      delete navigator.__proto__.webdriver;
    });
    
    console.log('Navigating to Flipkart...');
    
    // Navigate to the page
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 45000 
    });
    
    console.log('Page loaded, waiting for content...');
    
    // Wait for dynamic content to load
    await delay(3000);
    
    // Check for access denied or blocked pages
    const title = await page.title();
    const currentUrl = page.url();
    
    console.log(`Page title: ${title}`);
    console.log(`Current URL: ${currentUrl}`);
    
    if (title.includes('Access Denied') || title.includes('Blocked') || currentUrl.includes('blocked')) {
      throw new Error('Flipkart blocked the request');
    }
    
    let price = null;
    let rawPrice = null;
    let productName = null;
    
    // Method 1: Try specific price selectors
    console.log('Trying Flipkart price selectors...');
    for (const selector of PRICE_SELECTORS) {
      try {
        const element = await page.$(selector);
        if (element) {
          rawPrice = await page.evaluate(el => el.textContent.trim(), element);
          console.log(`Found price with selector ${selector}: ${rawPrice}`);
          
          if (rawPrice) {
            // Extract numeric price (handle ₹2,999 format)
            const match = rawPrice.match(/[\d,]+/);
            if (match) {
              price = parseFloat(match[0].replace(/,/g, ''));
              if (price > 0) {
                console.log(`✅ Successfully extracted price: ₹${price}`);
                break;
              }
            }
          }
        }
      } catch (e) {
        console.log(`Selector ${selector} failed: ${e.message}`);
        continue;
      }
    }
    
    // Method 2: Get product name
    console.log('Extracting product name...');
    for (const selector of NAME_SELECTORS) {
      try {
        const element = await page.$(selector);
        if (element) {
          productName = await page.evaluate(el => el.textContent.trim(), element);
          if (productName && productName.length > 5) {
            console.log(`✅ Found product name: ${productName}`);
            break;
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    // Method 3: Fallback - search for any price in page content
    if (!price) {
      console.log('Trying fallback price search...');
      try {
        // Look for price patterns in the page
        const priceElements = await page.$$eval('*', elements => {
          return elements
            .map(el => {
              const text = el.textContent?.trim();
              return {
                text: text,
                tagName: el.tagName,
                className: el.className
              };
            })
            .filter(item => item.text && /₹\s*[\d,]+/.test(item.text))
            .slice(0, 5); // Take first 5 matches
        });
        
        console.log(`Found ${priceElements.length} elements with ₹ symbols`);
        priceElements.forEach((el, i) => {
          console.log(`Price element ${i}: ${el.text}`);
        });
        
        for (const element of priceElements) {
          const match = element.text.match(/₹\s*([\d,]+)/);
          if (match) {
            const testPrice = parseFloat(match[1].replace(/,/g, ''));
            if (testPrice > 100 && testPrice < 50000) { // Reasonable range for kitchen appliance
              price = testPrice;
              rawPrice = element.text;
              console.log(`✅ Found price with fallback search: ${rawPrice}`);
              break;
            }
          }
        }
      } catch (e) {
        console.log('Fallback price search failed:', e.message);
      }
    }
    
    // Method 4: Last resort - look in page HTML
    if (!price) {
      console.log('Trying HTML content search...');
      try {
        const pageContent = await page.content();
        
        // Look for price patterns in HTML
        const pricePatterns = [
          /₹\s*([\d,]+)/g,
          /"price"[^>]*>(.*?₹\s*[\d,]+.*?)</g,
          /class="[^"]*price[^"]*"[^>]*>(.*?[\d,]+.*?)</g
        ];
        
        for (const pattern of pricePatterns) {
          const matches = [...pageContent.matchAll(pattern)];
          console.log(`Pattern found ${matches.length} matches`);
          
          for (const match of matches) {
            const priceText = match[1] || match[0];
            const numberMatch = priceText.match(/[\d,]+/);
            if (numberMatch) {
              const testPrice = parseFloat(numberMatch[0].replace(/,/g, ''));
              if (testPrice > 1000 && testPrice < 20000) { // Kitchen appliance range
                price = testPrice;
                rawPrice = priceText;
                console.log(`✅ Found price with HTML search: ${rawPrice}`);
                break;
              }
            }
          }
          if (price) break;
        }
      } catch (e) {
        console.log('HTML search failed:', e.message);
      }
    }
    
    if (!price) {
      // Debug information
      try {
        await page.screenshot({ path: '/tmp/flipkart-debug.png' });
        const html = await page.content();
        console.log('Page HTML length:', html.length);
        console.log('Contains ₹:', html.includes('₹'));
        console.log('Contains price:', html.toLowerCase().includes('price'));
        
        // Log some page structure for debugging
        const pageStructure = await page.$$eval('*', elements => {
          return elements
            .slice(0, 10)
            .map(el => ({
              tag: el.tagName,
              class: el.className,
              text: el.textContent?.trim()?.substring(0, 50)
            }));
        });
        console.log('Page structure sample:', pageStructure);
        
      } catch (e) {
        console.log('Could not generate debug info');
      }
      
      throw new Error('Price not found with any method. Product page structure may have changed.');
    }
    
    return {
      success: true,
      price: price,
      currency: 'INR',
      rawPrice: rawPrice,
      productName: productName || 'Flipkart Product'
    };
    
  } catch (error) {
    console.error('Flipkart scraper error:', error.message);
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
