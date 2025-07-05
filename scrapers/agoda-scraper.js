const puppeteer = require('puppeteer');

// Agoda price selectors (they change frequently, so we have multiple options)
const PRICE_SELECTORS = [
  '[data-selenium="display-price-room"]',
  '.PropertyPriceSection__Value',
  '.PriceDisplay__Value',
  '[data-selenium="hotel-rooms-room-price"]',
  '.room-price-section .currency',
  '.PropertyPriceSection .currency',
  '.Price__Value',
  '.price-display',
  '[class*="Price"] [class*="Value"]',
  '.price .currency'
];

const ROOM_SELECTORS = [
  '[data-selenium="hotel-rooms-room-name"]',
  '.RoomGridRow__RoomName',
  '.RoomName',
  '.room-type-name',
  '.PropertyRoomRow__RoomName'
];

// Custom delay function
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Generate dynamic URL with dates
function generateAgodaURL(baseUrl, daysFromToday = 7) {
  const checkIn = new Date();
  checkIn.setDate(checkIn.getDate() + daysFromToday);
  
  const checkOut = new Date(checkIn);
  checkOut.setDate(checkOut.getDate() + 1); // 1 night stay
  
  const formatDate = (date) => {
    return date.toISOString().split('T')[0]; // YYYY-MM-DD format
  };
  
  const checkInStr = formatDate(checkIn);
  const checkOutStr = formatDate(checkOut);
  
  // Update URL parameters
  let url = baseUrl;
  url = url.replace(/checkIn=[^&]*/, `checkIn=${checkInStr}`);
  
  // Add checkout date if not present
  if (!url.includes('checkOut=')) {
    url += `&checkOut=${checkOutStr}`;
  } else {
    url = url.replace(/checkOut=[^&]*/, `checkOut=${checkOutStr}`);
  }
  
  // Ensure other parameters are set correctly
  url = url.replace(/adults=[^&]*/, 'adults=1');
  url = url.replace(/children=[^&]*/, 'children=0');
  url = url.replace(/rooms=[^&]*/, 'rooms=1');
  url = url.replace(/los=[^&]*/, 'los=1');
  
  return url;
}

async function scrape(baseUrl, targetRoomType = "Deluxe King Pool View") {
  let browser;
  try {
    // Generate URL with current dates (7 days from today)
    const url = generateAgodaURL(baseUrl, 7);
    console.log(`Generated URL with dynamic dates: ${url}`);
    
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
        '--disable-blink-features=AutomationControlled'
      ]
    });
    
    const page = await browser.newPage();
    
    // Set realistic browser properties
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    );
    
    await page.setViewport({ 
      width: 1920, 
      height: 1080,
      deviceScaleFactor: 1
    });
    
    // Set headers to look more legitimate
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
    
    console.log(`Navigating to Agoda...`);
    
    // Navigate to the page
    await page.goto(url, { 
      waitUntil: 'networkidle2', 
      timeout: 60000 
    });
    
    console.log('Page loaded, waiting for room data...');
    
    // Wait for the page to fully load
    await delay(5000);
    
    // Check if we got blocked or redirected
    const currentUrl = page.url();
    const title = await page.title();
    console.log(`Current URL: ${currentUrl}`);
    console.log(`Page title: ${title}`);
    
    if (title.includes('Access Denied') || title.includes('Blocked')) {
      throw new Error('Agoda blocked the request');
    }
    
    // Look for the specific room type first
    let roomPrice = null;
    let roomName = null;
    let rawPrice = null;
    
    console.log(`Looking for room type: ${targetRoomType}`);
    
    // Method 1: Find specific room type and its price
    try {
      const rooms = await page.$$eval('[data-selenium="hotel-rooms-room-row"], .RoomGridRow, .PropertyRoomRow', rows => {
        return rows.map(row => {
          const nameEl = row.querySelector('[data-selenium="hotel-rooms-room-name"], .RoomGridRow__RoomName, .RoomName, .room-type-name, .PropertyRoomRow__RoomName');
          const priceEl = row.querySelector('[data-selenium="display-price-room"], .PropertyPriceSection__Value, .PriceDisplay__Value, [data-selenium="hotel-rooms-room-price"], .room-price-section .currency, .PropertyPriceSection .currency, .Price__Value, .price-display');
          
          return {
            name: nameEl ? nameEl.textContent.trim() : '',
            price: priceEl ? priceEl.textContent.trim() : '',
            html: row.innerHTML.substring(0, 200) // For debugging
          };
        });
      });
      
      console.log(`Found ${rooms.length} room types:`);
      rooms.forEach((room, i) => {
        console.log(`Room ${i + 1}: ${room.name} - ${room.price}`);
      });
      
      // Find the target room type
      const targetRoom = rooms.find(room => 
        room.name.toLowerCase().includes(targetRoomType.toLowerCase()) ||
        room.name.toLowerCase().includes('deluxe') ||
        room.name.toLowerCase().includes('king') ||
        room.name.toLowerCase().includes('pool')
      );
      
      if (targetRoom && targetRoom.price) {
        roomName = targetRoom.name;
        rawPrice = targetRoom.price;
        
        // Extract numeric price
        const match = rawPrice.match(/[\d,]+/);
        if (match) {
          roomPrice = parseFloat(match[0].replace(/,/g, ''));
          console.log(`✅ Found target room: ${roomName} - ₹${roomPrice}`);
        }
      }
    } catch (e) {
      console.log('Specific room search failed:', e.message);
    }
    
    // Method 2: General price search if specific room not found
    if (!roomPrice) {
      console.log('Trying general price search...');
      try {
        for (const selector of PRICE_SELECTORS) {
          const elements = await page.$$(selector);
          for (const element of elements) {
            const priceText = await page.evaluate(el => el.textContent.trim(), element);
            console.log(`Found price element: ${priceText}`);
            
            const match = priceText.match(/[\d,]+/);
            if (match) {
              const testPrice = parseFloat(match[0].replace(/,/g, ''));
              if (testPrice > 1000 && testPrice < 50000) { // Reasonable hotel price range
                roomPrice = testPrice;
                rawPrice = priceText;
                roomName = "Room (type not specified)";
                console.log(`✅ Found price with general search: ₹${roomPrice}`);
                break;
              }
            }
          }
          if (roomPrice) break;
        }
      } catch (e) {
        console.log('General price search failed:', e.message);
      }
    }
    
    // Method 3: Look for any price in page content
    if (!roomPrice) {
      console.log('Trying content-based price search...');
      try {
        const pageContent = await page.content();
        
        // Look for price patterns
        const pricePatterns = [
          /₹\s*([\d,]+)/g,
          /INR\s*([\d,]+)/g,
          /"price"[^>]*>(.*?[\d,]+.*?)</g
        ];
        
        for (const pattern of pricePatterns) {
          const matches = [...pageContent.matchAll(pattern)];
          console.log(`Pattern found ${matches.length} price matches`);
          
          for (const match of matches) {
            const priceText = match[1] || match[0];
            const numberMatch = priceText.match(/[\d,]+/);
            if (numberMatch) {
              const testPrice = parseFloat(numberMatch[0].replace(/,/g, ''));
              if (testPrice > 2000 && testPrice < 30000) { // Hotel price range
                roomPrice = testPrice;
                rawPrice = priceText;
                roomName = "Room (extracted from content)";
                console.log(`✅ Found price in content: ₹${roomPrice}`);
                break;
              }
            }
          }
          if (roomPrice) break;
        }
      } catch (e) {
        console.log('Content search failed:', e.message);
      }
    }
    
    if (!roomPrice) {
      // Debug: Save screenshot and HTML for analysis
      try {
        await page.screenshot({ path: '/tmp/agoda-debug.png' });
        const html = await page.content();
        console.log('HTML length:', html.length);
        console.log('Contains ₹:', html.includes('₹'));
        console.log('Contains INR:', html.includes('INR'));
      } catch (e) {
        console.log('Could not save debug info');
      }
      
      throw new Error(`Price not found for ${targetRoomType}. Check if room type exists or dates are available.`);
    }
    
    return {
      success: true,
      price: roomPrice,
      currency: 'INR',
      rawPrice: rawPrice,
      roomType: roomName,
      checkInDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days from today
      nights: 1
    };
    
  } catch (error) {
    console.error('Agoda scraper error:', error.message);
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
