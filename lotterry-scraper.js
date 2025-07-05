import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
  minInterval: 10 * 60 * 1000, // 10 minutes
  maxInterval: 15 * 60 * 1000, // 15 minutes
  dataFile: path.join(__dirname, 'latest_lottery_record.json'),
  logFile: path.join(__dirname, 'lottery_scraper.log'),
  maxRetries: 3,
  retryDelay: 5000,
};

class LotteryManager {
  constructor() {
    this.currentData = [];
    this.isRunning = false;
    this.timeoutId = null;
  }

  // Load existing data from file
  async loadExistingData() {
    try {
      const content = await fs.readFile(CONFIG.dataFile, 'utf-8');
      const parsedData = JSON.parse(content);
      this.currentData = parsedData.data || parsedData; // Handle both old and new format
      this.log(`📂 Loaded ${this.currentData.length} existing lottery records`);
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.log('📂 No existing data file found, starting fresh');
        this.currentData = [];
      } else {
        this.log(`❌ Error loading existing data: ${err.message}`);
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
      
      await fs.writeFile(CONFIG.dataFile, JSON.stringify(dataToSave, null, 2), 'utf-8');
      this.log(`💾 Saved ${data.length} records to ${CONFIG.dataFile}`);
    } catch (err) {
      this.log(`❌ Error saving data: ${err.message}`);
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
    const oldMap = new Map(oldData.map(item => [item.date, item]));
    const newMap = new Map(newData.map(item => [item.date, item]));

    // Find added and updated items
    for (const [date, newItem] of newMap) {
      const oldItem = oldMap.get(date);
      if (!oldItem) {
        changes.added.push(newItem);
      } else if (this.hasDataChanged(oldItem, newItem)) {
        changes.updated.push({
          date,
          old: oldItem,
          new: newItem
        });
      }
    }

    // Find removed items
    for (const [date, oldItem] of oldMap) {
      if (!newMap.has(date)) {
        changes.removed.push(oldItem);
      }
    }

    return changes;
  }

  // Check if lottery data has changed between two items
  hasDataChanged(oldItem, newItem) {
    return !this.arePrizesEqual(oldItem.prizes, newItem.prizes);
  }

  // Compare prizes for equality
  arePrizesEqual(p1, p2) {
    return (
      p1.firstPrize === p2.firstPrize &&
      p1.three_front === p2.three_front &&
      p1.three_end === p2.three_end &&
      p1.two_end === p2.two_end
    );
  }

  // Log messages with timestamp
  async log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    
    console.log(logMessage);
    
    try {
      await fs.appendFile(CONFIG.logFile, logMessage + '\n');
    } catch (err) {
      console.error('Failed to write to log file:', err);
    }
  }

  // Get current lottery ID based on date
  getCurrentLottoId() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const buddhistYear = now.getFullYear() + 543;
    return `${day}${month}${buddhistYear}`;
  }

  // Fetch lottery data from API
  async fetchLottoData() {
    const lottoId = this.getCurrentLottoId();
    this.log(`🌐 Fetching latest lottery data for ${lottoId}...`);

    const response = await fetch(`https://lotto.api.rayriffy.com/latest`);
    if (!response.ok) {
      this.log(`⚠️ No data found (HTTP ${response.status})`);
      return null;
    }

    const data = await response.json();
    const result = data.response;

    if (!result || !result.prizes || result.prizes.length === 0) {
      this.log('⚠️ Incomplete or missing prize data.');
      return null;
    }

    const drawDate = result.drawDate || new Date().toISOString();

    const prizes = {
      firstPrize: result.prizes[0]?.number || null,
      three_front: result.runningNumbers?.[0]?.number || null,
      three_end: result.runningNumbers?.[1]?.number || null,
      two_end: result.runningNumbers?.[2]?.number || null
    };

    return { 
      date: drawDate, 
      prizes,
      lastUpdated: new Date().toISOString()
    };
  }

  // Extract lottery data with retry logic
  async extractWithRetry() {
    for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
      try {
        this.log(`🔄 Extraction attempt ${attempt}/${CONFIG.maxRetries}`);
        const result = await this.fetchLottoData();
        
        if (result) {
          this.log(`🎯 Successfully extracted lottery data for ${result.date}`);
          return [result]; // Return as array to match the pattern
        }
      } catch (error) {
        this.log(`❌ Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt === CONFIG.maxRetries) {
          throw error;
        }
        
        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, CONFIG.retryDelay));
      }
    }
    
    this.log('❌ All retry attempts failed.');
    return null;
  }

  // Process new data and detect changes
  async processNewData(newData) {
    if (!newData || newData.length === 0) {
      this.log('⚠️ No new data to process');
      return { added: [], updated: [], removed: [] };
    }

    const changes = this.detectChanges(this.currentData, newData);
    
    if (changes.added.length > 0) {
      this.log(`🆕 Added ${changes.added.length} new lottery records:`);
      changes.added.forEach(record => {
        this.log(`   + ${record.date}: First Prize ${record.prizes.firstPrize}`);
      });
    }

    if (changes.updated.length > 0) {
      this.log(`🔄 Updated ${changes.updated.length} lottery records:`);
      changes.updated.forEach(change => {
        this.log(`   ~ ${change.date}: Prizes updated`);
        this.log(`     Old: ${change.old.prizes.firstPrize} | New: ${change.new.prizes.firstPrize}`);
      });
    }

    if (changes.removed.length > 0) {
      this.log(`❌ Removed ${changes.removed.length} lottery records:`);
      changes.removed.forEach(record => {
        this.log(`   - ${record.date}: ${record.prizes.firstPrize}`);
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
      this.log('🚀 Starting lottery checking cycle...');
      
      const newData = await this.extractWithRetry();
      await this.processNewData(newData);
      
      this.log('✅ Lottery checking cycle completed successfully');
      
    } catch (error) {
      this.log(`❌ Lottery checking cycle failed: ${error.message}`);
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
    this.log('🌟 Starting lottery data scheduler...');
    
    // Load existing data
    await this.loadExistingData();
    
    // Run initial check
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
const lotteryManager = new LotteryManager();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  lotteryManager.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  lotteryManager.stop();
  process.exit(0);
});

// Export the instance as default
export default lotteryManager;