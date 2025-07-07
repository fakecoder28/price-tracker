const puppeteer = require('puppeteer');

// Updated Flipkart price selectors (comprehensive list)
const PRICE_SELECTORS = [
  // Current Flipkart selectors (2024-2025)
  '._1_WHN1',
  '._30jeq3._16Jk6d', 
  '._3I9_wc._2p6lqe',
  '.Nx9bqj.CxhGGd',
  '._25b18c',
  '._1vC4OE',
  '._3qQ9m1',
  '._16Jk6d',
  '.CEmiEU .Nx9bqj',
  '._2rQ-NK',
  
  // Generic price patterns
  '[data-testid="price"]',
  '[class*="price"]',
  '[class*="Price"]',
  '.notranslate',
  
  // Backup selectors
  'span:contains("₹")',
  'div:contains("₹")',
  '*[class*="currency"]'
];

// Custom delay function
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to extract all potential prices from page
async function extractAllPrices(page) {
  try {
    // Get all elements that might contain prices
    const allPrices = await page.evaluate(() => {
      const priceElements = [];
      
      // Method 1: Look for elements with ₹ symbol
      const elementsWithRupee = Array.from(document.querySelectorAll('*')).filter(el => {
        return el.textContent && el.textContent.includes('₹') && el.children.length === 0;
      });
      
      elementsWithRupee.forEach(el => {
        priceElements.push({
          text: el.textContent.trim(),
          className: el.className,
          tagName: el.tagName,
          method: 'rupee_symbol'
        });
      });
      
      // Method 2: Look for elements with price-like classes
      const priceClassSelectors = [
        '[class*="price"]', '[class*="Price"]', '[class*="amount"]', 
        '[class*="cost"]', '[class*="rate"]', '.notranslate'
      ];
      
      priceClassSelectors.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            const text = el.textContent?.trim();
            if (text && /[\d,]+/.test(text)) {
              priceElements.push({
                text: text,
                className: el.className,
                tagName: el.tagName,
                selector: selector,
                method: 'price_class'
              });
            }
          });
        } catch (e) {
          // Ignore selector errors
        }
      });
      
      // Method 3: Look for number patterns that could be prices
      const allTextElements = Array.from(document.querySelectorAll('*')).filter(el => {
        const text = el.textContent?.trim();
        return text && /^\d{1,2}[,.]?\d{3,5}$/.test(text.replace(/[₹,\s]/g, '')) && el.children.length === 0;
      });
      
      allTextElements.forEach(el => {
        priceElements.push({
          text: el.textContent.trim(),
          className: el.className,
          tagName: el.tagName,
          method: 'number_pattern'
        });
      });
      
      return priceElements;
    });
    
    return allPrices;
  } catch (error) {
    console.log('Error extracting prices:', error.message);
    return [];
  }
}

// Function to validate and extract price from text
function extractPrice(text) {
  if (!text) return null;
  
  // Remove common non-price text
  const excludePatterns = [
    /delivery|shipping|rating|review|star|off|discount|save|seller|warranty|emi|exchange/i
  ];
  
  for (const pattern of excludePatterns) {
    if (pattern.test(text)) return null;
  }
  
  // Extract numeric value
  const priceMatch = text.match(/[\d,]+/);
  if (!priceMatch) return null;
  
  const price = parseFloat(priceMatch[0].replace(/,/g, ''));
  
  // Validate price range for kitchen appliances
  if (price >= 500 && price <= 50000) {
    return price;
  }
  
  return null;
}

async function scrape(url) {
  let browser;
  try {
    console.log(`Starting enhanced Flipkart scraper for: ${url}`);
    
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
    
    // Enhanced user agent
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );
    
    await page.setViewport({ 
      width: 1920, 
      height: 1080,
      deviceScaleFactor: 1
    });
    
    // Additional headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9,hi;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1'
    });
    
    // Remove automation signals
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
      delete navigator.__proto__.webdriver;
    });
    
    console.log('Navigating to Flipkart...');
    
    // Navigate with longer timeout
    await page.goto(url, { 
      waitUntil: 'networkidle0', 
      timeout: 60000 
    });
    
    console.log('Page loaded, waiting for dynamic content...');
    
    // Wait for content to fully load
    await delay(5000);
    
    // Check page status
    const title = await page.title();
    const currentUrl = page.url();
    
    console.log(`Page title: ${title}`);
    console.log(`Current URL: ${currentUrl}`);
    
    // Check for blocks or errors
    if (title.includes('Access Denied') || 
        title.includes('Blocked') || 
        title.includes('Error') ||
        currentUrl.includes('blocked') ||
        currentUrl.includes('error')) {
      throw new Error('Flipkart blocked the request or page error');
    }
    
    let price = null;
    let rawPrice = null;
    
    // Method 1: Try traditional selectors first
    console.log('Method 1: Trying traditional price selectors...');
    for (const selector of PRICE_SELECTORS) {
      try {
        const elements = await page.$$(selector);
        for (const element of elements) {
          const text = await page.evaluate(el => el.textContent?.trim(), element);
          console.log(`Selector ${selector}: "${text}"`);
          
          const extractedPrice = extractPrice(text);
          if (extractedPrice) {
            price = extractedPrice;
            rawPrice = text;
            console.log(`✅ Found price with selector ${selector}: ₹${price}`);
            break;
          }
        }
        if (price) break;
      } catch (e) {
        continue;
      }
    }
    
    // Method 2: Extract all potential prices and analyze
    if (!price) {
      console.log('Method 2: Extracting all potential prices...');
      const allPrices = await extractAllPrices(page);
      
      console.log(`Found ${allPrices.length} potential price elements:`);
      allPrices.forEach((item, i) => {
        console.log(`${i + 1}. ${item.method}: "${item.text}" (${item.tagName}.${item.className})`);
      });
      
      // Analyze extracted prices
      const validPrices = [];
      allPrices.forEach(item => {
        const extractedPrice = extractPrice(item.text);
        if (extractedPrice) {
          validPrices.push({
            price: extractedPrice,
            raw: item.text,
            confidence: item.method === 'rupee_symbol' ? 3 : item.method === 'price_class' ? 2 : 1
          });
        }
      });
      
      if (validPrices.length > 0) {
        // Sort by confidence and pick the best one
        validPrices.sort((a, b) => b.confidence - a.confidence);
        const bestPrice = validPrices[0];
        price = bestPrice.price;
        rawPrice = bestPrice.raw;
        console.log(`✅ Found price with extraction method: ₹${price} from "${rawPrice}"`);
      }
    }
    
    // Method 3: Screenshot and HTML analysis for debugging
    if (!price) {
      console.log('Method 3: Generating debug information...');
      try {
        // Take screenshot
        await page.screenshot({ 
          path: '/tmp/flipkart-debug.png',
          fullPage: false
        });
        console.log('Screenshot saved for debugging');
        
        // Get page info
        const pageInfo = await page.evaluate(() => {
          return {
            title: document.title,
            bodyText: document.body.textContent.substring(0, 500),
            hasRupeeSymbol: document.body.textContent.includes('₹'),
            elementCount: document.querySelectorAll('*').length,
            priceElements: document.querySelectorAll('[class*="price"], [class*="Price"]').length
          };
        });
        
        console.log('Page analysis:', pageInfo);
        
        // Look for any number that might be a price
        const bodyText = pageInfo.bodyText;
        const numberMatches = [...bodyText.matchAll(/(\d{1,2}[,.]?\d{3,5})/g)];
        console.log('Found numbers in page:', numberMatches.map(m => m[1]).slice(0, 10));
        
      } catch (e) {
        console.log('Could not generate debug info:', e.message);
      }
    }
    
    if (!price) {
      throw new Error(`Price not found. Page may have changed structure or product may be unavailable. Title: "${title}"`);
    }
    
    return {
      success: true,
      price: price,
      currency: 'INR',
      rawPrice: rawPrice
    };
    
  } catch (error) {
    console.error('Enhanced Flipkart scraper error:', error.message);
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
