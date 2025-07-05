import puppeteer from 'puppeteer';
import { promises as fs  } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  minInterval: 10 * 60 * 1000,
  maxInterval: 15 * 60 * 1000,
  dataFile: path.join(__dirname, 'stock_data.json'),
  logFile: path.join(__dirname, 'stock_scraper.log'),
  maxRetries: 3,
  retryDelay: 5000,
};



class StockDataManager {
  constructor() {
    this.currentData = [];
    this.isRunning = false;
    this.timeoutId = null;
  }

  // Load existing data from file
  async loadExistingData() {
    try {
      const data = await fs.readFile(CONFIG.dataFile, 'utf-8');
      const parsedData = JSON.parse(data);
      this.currentData = parsedData.data || parsedData; // Handle both old and new format
      this.log(`📂 Loaded ${this.currentData.length} existing records`);
    } catch (error) {
      if (error.code === 'ENOENT') {
        this.log('📂 No existing data file found, starting fresh');
        this.currentData = [];
      } else {
        this.log(`❌ Error loading existing data: ${error.message}`);
        this.currentData = [];
      }
    }
  }

  // Save data to file
  async saveData(data) {
    try {
      const dataToSave = {
        lastUpdated: new Date().toISOString(),
        recordCount: data.length,
        data: data
      };
      
      await fs.writeFile(CONFIG.dataFile, JSON.stringify(dataToSave, null, 2));
      this.log(`💾 Saved ${data.length} records to ${CONFIG.dataFile}`);
    } catch (error) {
      this.log(`❌ Error saving data: ${error.message}`);
    }
  }

  // Compare two data sets to detect changes
  detectChanges(oldData, newData) {
    const changes = {
      added: [],
      updated: [],
      removed: []
    };

    // Create lookup maps for efficient comparison
    const oldMap = new Map(oldData.map(item => [item.stockName, item]));
    const newMap = new Map(newData.map(item => [item.stockName, item]));

    // Find added and updated items
    for (const [stockName, newItem] of newMap) {
      const oldItem = oldMap.get(stockName);
      if (!oldItem) {
        changes.added.push(newItem);
      } else if (this.hasDataChanged(oldItem, newItem)) {
        changes.updated.push({
          stockName,
          old: oldItem,
          new: newItem
        });
      }
    }

    // Find removed items
    for (const [stockName, oldItem] of oldMap) {
      if (!newMap.has(stockName)) {
        changes.removed.push(oldItem);
      }
    }

    return changes;
  }

  // Check if data has changed between two items
  hasDataChanged(oldItem, newItem) {
    return oldItem.threeDigits !== newItem.threeDigits ||
           oldItem.twoDigits !== newItem.twoDigits ||
           oldItem.countryCode !== newItem.countryCode;
  }

  // Log messages with timestamp
  async log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    
    console.log(logMessage);
    
    try {
      await fs.appendFile(CONFIG.logFile, logMessage + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error);
    }
  }

  // Extract stock data (your original function with minor modifications)
  async extractStockResults() {
    const url = 'https://www.lotto432k.com/';
    let browser;

    try {
      browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const page = await browser.newPage();
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
      await page.waitForSelector('div.card', { timeout: 30000 });

      // Try to wait for table data specifically
      try {
        await page.waitForFunction(() => {
          const cards = document.querySelectorAll('div.card');
          for (let card of cards) {
            const headerText = card.querySelector('.card-header')?.textContent || '';
            if (headerText.includes('หวยหุ้นต่างประเทศ')) {
              const tbody = card.querySelector('tbody');
              const rows = tbody?.querySelectorAll('tr') || [];
              return rows.length > 0;
            }
          }
          return false;
        }, { timeout: 15000 });
      } catch (waitError) {
        this.log('⚠️ Timeout waiting for table data, proceeding anyway...');
      }

      // Extract data using page.evaluate
      const results = await page.evaluate(() => {
        const cards = document.querySelectorAll('div.card');
        let targetCard = null;

        // Find the target card
        for (let card of cards) {
          const headerText = card.querySelector('.card-header')?.textContent || '';
          if (headerText.includes('หวยหุ้นต่างประเทศ')) {
            targetCard = card;
            break;
          }
        }

        if (!targetCard) return [];

        const table = targetCard.querySelector('table');
        if (!table) return [];

        const tbody = table.querySelector('tbody');
        const rows = tbody ? tbody.querySelectorAll('tr') : table.querySelectorAll('tr');

        const results = [];

        rows.forEach((row) => {
          const cells = row.querySelectorAll('td');

          if (cells.length < 4) return;

          const flagIcon = row.querySelector('.flag-icon');
          const flagClass = flagIcon ? flagIcon.className : '';
          const countryCode = flagClass.includes('flag-icon-')
            ? flagClass.split('flag-icon-')[1].split(' ')[0]
            : '';

          const stockData = {
            countryCode,
            stockName: cells[1].textContent.trim(),
            threeDigits: cells[2].textContent.trim(),
            twoDigits: cells[3].textContent.trim(),
            lastUpdated: new Date().toISOString()
          };

          if (stockData.stockName && stockData.stockName !== '') {
            results.push(stockData);
          }
        });

        return results;
      });

      await browser.close();
      return results;

    } catch (error) {
      if (browser) {
        await browser.close();
      }
      throw error;
    }
  }

  // Extract with retry logic
  async extractWithRetry() {
    for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
      try {
        this.log(`🔄 Extraction attempt ${attempt}/${CONFIG.maxRetries}`);
        const results = await this.extractStockResults();
        
        // Return all results without filtering
        this.log(`📊 Extracted ${results.length} total results`);
        return results;

      } catch (error) {
        this.log(`❌ Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt === CONFIG.maxRetries) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
      }
    }
  }

  // Process new data and detect changes
  async processNewData(newData) {
    const changes = this.detectChanges(this.currentData, newData);
    
    if (changes.added.length > 0) {
      this.log(`🆕 Added ${changes.added.length} new stocks:`);
      changes.added.forEach(stock => {
        this.log(`   + ${stock.stockName}: ${stock.threeDigits}/${stock.twoDigits}`);
      });
    }

    if (changes.updated.length > 0) {
      this.log(`🔄 Updated ${changes.updated.length} stocks:`);
      changes.updated.forEach(change => {
        this.log(`   ~ ${change.stockName}: ${change.old.threeDigits}/${change.old.twoDigits} → ${change.new.threeDigits}/${change.new.twoDigits}`);
      });
    }

    if (changes.removed.length > 0) {
      this.log(`❌ Removed ${changes.removed.length} stocks:`);
      changes.removed.forEach(stock => {
        this.log(`   - ${stock.stockName}: ${stock.threeDigits}/${stock.twoDigits}`);
      });
    }

    const totalChanges = changes.added.length + changes.updated.length + changes.removed.length;
    
    if (totalChanges > 0) {
      this.currentData = newData;
      await this.saveData(newData);
      this.log(`✅ Data updated with ${totalChanges} changes`);
    } else {
      this.log('📊 No changes detected, data unchanged');
    }

    return changes;
  }

  // Get random interval between min and max
  getRandomInterval() {
    return Math.floor(Math.random() * (CONFIG.maxInterval - CONFIG.minInterval + 1)) + CONFIG.minInterval;
  }

  // Main scraping cycle
  async runScrapingCycle() {
    try {
      this.log('🚀 Starting scraping cycle...');
      
      const newData = await this.extractWithRetry();
      await this.processNewData(newData);
      
      this.log('✅ Scraping cycle completed successfully');
      
    } catch (error) {
      this.log(`❌ Scraping cycle failed: ${error.message}`);
    }
  }

  // Schedule next run
  scheduleNextRun() {
    if (!this.isRunning) return;

    const interval = this.getRandomInterval();
    const nextRun = new Date(Date.now() + interval);
    
    this.log(`⏰ Next run scheduled in ${Math.round(interval / 60000)} minutes (at ${nextRun.toLocaleTimeString()})`);
    
    this.timeoutId = setTimeout(async () => {
      if (this.isRunning) {
        await this.runScrapingCycle();
        this.scheduleNextRun();
      }
    }, interval);
  }

  // Start the scheduler
  async start() {
    if (this.isRunning) {
      this.log('⚠️ Scheduler is already running');
      return;
    }

    this.isRunning = true;
    this.log('🌟 Starting stock data scraper scheduler...');
    
    // Load existing data
    await this.loadExistingData();
    
    // Run initial scraping
    await this.runScrapingCycle();
    
    // Schedule next runs
    this.scheduleNextRun();
    
    this.log('✅ Scheduler started successfully');
  }

  // Stop the scheduler
  stop() {
    if (!this.isRunning) {
      this.log('⚠️ Scheduler is not running');
      return;
    }

    this.isRunning = false;
    
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    
    this.log('🛑 Scheduler stopped');
  }

  // Get current status
  getStatus() {
    return {
      isRunning: this.isRunning,
      recordCount: this.currentData.length,
      lastUpdated: this.currentData.length > 0 ? this.currentData[0]?.lastUpdated : null
    };
  }

  // Get current data
  getCurrentData() {
    return this.currentData;
  }
}

// Create and export instance
const stockManager = new StockDataManager();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  stockManager.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  stockManager.stop();
  process.exit(0);
});



// Export the instance as default
export default stockManager;