// import puppeteer from 'puppeteer';
// import { writeFile, readFile } from 'fs/promises';
// import path from 'path';
// import { fileURLToPath } from 'url';
import stockManager from './stock-scraper.js';
import lotteryManager from './lotterry-scraper.js';

await Promise.all([
  stockManager.start(),
  lotteryManager.start()
]);


// const FILE_PATH = 'latest_lottery_record.json';

// function arePrizesEqual(p1, p2) {
//   return (
//     p1.firstPrize === p2.firstPrize &&
//     p1.three_front === p2.three_front &&
//     p1.three_end === p2.three_end &&
//     p1.two_end === p2.two_end
//   );
// }

// function getCurrentLottoId() {
//   const now = new Date();

//   // Day and month with leading zeros
//   const day = String(now.getDate()).padStart(2, '0');
//   const month = String(now.getMonth() + 1).padStart(2, '0');

//   // Convert to Buddhist year (Gregorian + 543)
//   const buddhistYear = now.getFullYear() + 543;

//   // Format as DDMMYYYY (e.g., "01072568")
//   return `${day}${month}${buddhistYear}`;
// }

// async function getLotteryNumber() {
//   const lottoId = getCurrentLottoId();
//   console.log(`Selected date for lottery: ${lottoId}`)
//   const url = `https://lotto.api.rayriffy.com/lotto/${lottoId}`;
//   console.log(url);
//   try {
//     const res = await fetch(url);
//     if (!res.ok) {
//       console.log(`No data found for lotto ID: ${lottoId} (HTTP ${res.status})`);
//       return; // Stop here, don't add record
//     }

//     const data = await res.json();

//     // If data.response or prizes missing, treat as no result
//     if (!data.response || !data.response.prizes || data.response.prizes.length === 0) {
//       console.log('No lottery results found in response.');
//       return; // Stop here, don't add record
//     }

//     const drawDate = data.response.drawDate;  // Use API date if available

//     if (!drawDate) {
//       console.log('Draw date missing from API response.');
//       return; // Stop here, don't add record
//     }

//     const newPrizes = {
//       firstPrize: data.response.prizes[0].number,
//       three_front: data.response.runningNumbers[0].number,
//       three_end: data.response.runningNumbers[1].number,
//       two_end: data.response.runningNumbers[2].number,
//     };

//     let existingRecords = [];

//     try {
//       const fileData = await readFile(FILE_PATH, 'utf-8');
//       existingRecords = JSON.parse(fileData);
//     } catch (err) {
//       if (err.code !== 'ENOENT') throw err;
//       console.log('No existing records, will create new file.');
//     }

//     const recordIndex = existingRecords.findIndex(record => record.date === drawDate);

//     if (recordIndex !== -1) {
//       if (arePrizesEqual(existingRecords[recordIndex].prizes, newPrizes)) {
//         console.log('Record with this draw date and prizes already exists. Skipping save.');
//         return;
//       } else {
//         existingRecords[recordIndex].prizes = newPrizes;
//         console.log('Record with same draw date but different prizes found. Updating record.');
//       }
//     } else {
//       existingRecords.push({
//         date: drawDate,
//         prizes: newPrizes,
//       });
//       console.log('New record added.');
//     }

//     await writeFile(FILE_PATH, JSON.stringify(existingRecords, null, 2), 'utf-8');
//   } catch (error) {
//     console.error('Error:', error);
//   }
// }
