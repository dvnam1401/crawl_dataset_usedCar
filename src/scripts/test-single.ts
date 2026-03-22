import { chromium } from 'playwright';
import { vehicleDetailCrawler } from '../services/vehicle-detail-crawler';
import { storageManager } from '../services/storage-manager';
import { imageDownloader } from '../services/image-downloader';
import { logger } from '../utils/logger';

async function testSingleVehicle() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: npx ts-node src/scripts/test-single.ts <vehicle_url>');
    process.exit(1);
  }

  // Extract listing_id from the URL (e.g. ...-aidxc23414158 -> 23414158)
  const match = url.match(/-aidxc(\d+)/);
  if (!match) {
    console.error('Invalid URL format. Cannot find listing ID (e.g. -aidxc123456).');
    process.exit(1);
  }
  const listingId = match[1];

  console.log(`Starting test crawl for listing ID: ${listingId}`);
  console.log(`URL: ${url}`);

  const browser = await chromium.launch({ headless: false }); // Open browser to see what happens
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1. Extract data
    console.log('\n--- Extracting Data ---');
    const { info, imageUrls, descriptionHash } = await vehicleDetailCrawler.extractVehicleData(page, url);
    console.log('Vehicle Info:', JSON.stringify(info, null, 2));
    console.log(`Found ${imageUrls.length} images.`);
    console.log(`Description Hash: ${descriptionHash}`);

    // 2. Setup storage
    console.log('\n--- Saving Data ---');
    const { vehicleFolder, imageFolder } = storageManager.createVehicleFolder(listingId);

    // 3. Download images
    const downloadedImages = await imageDownloader.downloadImagesSequentially(imageUrls, imageFolder, listingId);
    
    // 4. Build JSON
    const vehicleData = {
      listing_id: listingId,
      category_id: 0, // Dummy for test
      subcategory_id: 0, // Dummy for test
      vehicle_info: info,
      source_url: url,
      images: downloadedImages,
      image_count: downloadedImages.length,
      description_hash: descriptionHash,
      crawled_at: new Date().toISOString()
    };

    // 5. Save
    storageManager.saveVehicleData(vehicleData);
    console.log(`\n✅ Successfully crawled and saved vehicle to: data/vehicles/${listingId}/`);
    
  } catch (error) {
    console.error('Test failed:', error);
  } finally {
    await browser.close();
  }
}

testSingleVehicle();
