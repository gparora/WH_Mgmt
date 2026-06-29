// workers/dispatchIngestionWorker.js
const { Worker } = require('bullmq');
const xlsx = require('xlsx');
const fs = require('fs');
const { ulid } = require('ulid');
const db = require('../config/db');
const redis = require('../config/redis');

// Helper to normalize strings
function cleanText(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
}

// 1. Initialize the Worker
const dispatchWorker = new Worker('dispatch-ingestion', async (job) => {
  const { 
    tenantId, 
    userId, 
    filePath, 
    originalFilename, 
    reportType, 
    operationalDate, 
    siteCode 
  } = job.data;

  console.log(`[JOB ${job.id}] Started processing for tenant: ${tenantId}`);

  try {
    // 2. Parse the Excel File
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: null });

    console.log(`[JOB ${job.id}] Parsed ${rows.length} rows from ${originalFilename}`);

    // 3. Open a Database Transaction
    // If anything fails inside this block, the entire batch is rolled back safely.
    await db.transaction(async (trx) => {
      
      const batchId = ulid();
      
      // Create the upload batch record
      await trx('dispatch_batches').insert({
        id: batchId,
        tenant_id: tenantId,
        report_type: reportType,
        operational_date: operationalDate,
        site_code: siteCode,
        original_filename: originalFilename,
        source_row_count: rows.length,
        uploaded_by: userId
      });

      let importedOrderCount = 0;
      let importedLineCount = 0;

      // Group rows by AWB to handle multi-item orders properly
      const groupedOrders = new Map();

      for (const row of rows) {
        // Amazon column names can vary slightly, adjust these aliases as needed
        const awb = cleanText(row['Tracking ID'] || row['AWB'] || row['tracking_id']);
        const orderId = cleanText(row['Order ID'] || row['amazon_order_id']);
        const asin = cleanText(row['ASIN'] || row['asin']);
        const sku = cleanText(row['SKU'] || row['merchant_sku']);
        const title = cleanText(row['Item Title'] || row['product_title']);
        const quantity = Number(row['Quantity']) || 1;

        if (!awb) continue;

        if (!groupedOrders.has(awb)) {
          groupedOrders.set(awb, {
            awb,
            orderId,
            lines: []
          });
        }
        
        groupedOrders.get(awb).lines.push({ asin, sku, title, quantity });
      }

      // Process the grouped orders
      for (const [awb, orderData] of groupedOrders.entries()) {
        
        // Prevent duplicates: Check if AWB already exists for this tenant
        const existingOrder = await trx('dispatch_orders')
          .where({ tenant_id: tenantId, awb: awb })
          .first();

        let currentOrderId;

        if (!existingOrder) {
          currentOrderId = ulid();
          await trx('dispatch_orders').insert({
            id: currentOrderId,
            tenant_id: tenantId,
            batch_id: batchId,
            awb: awb,
            order_id: orderData.orderId,
            report_type: reportType,
            site_code: siteCode,
            operational_date: operationalDate,
            status: 'pending_dispatch'
          });
          importedOrderCount++;
        } else {
          // If order exists, we skip creating it, but you could choose to append lines here
          currentOrderId = existingOrder.id;
          continue; 
        }

        // Insert all line items for this order
        const lineInserts = orderData.lines.map(line => ({
          id: ulid(),
          tenant_id: tenantId,
          order_id: currentOrderId,
          asin: line.asin,
          sku: line.sku,
          product_title: line.title,
          quantity: line.quantity
        }));

        if (lineInserts.length > 0) {
          await trx('dispatch_lines').insert(lineInserts);
          importedLineCount += lineInserts.length;
        }
      }

      // Update the batch with final success counts
      await trx('dispatch_batches')
        .where({ id: batchId, tenant_id: tenantId })
        .update({ 
          imported_order_count: importedOrderCount 
        });

      console.log(`[JOB ${job.id}] Successfully imported ${importedOrderCount} orders and ${importedLineCount} items.`);
    });

  } catch (error) {
    console.error(`[JOB ${job.id}] Failed:`, error.message);
    throw error; // Rethrowing tells BullMQ to mark the job as FAILED
  } finally {
    // 4. Cleanup: Always delete the temporary Excel file from the server
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`[JOB ${job.id}] Cleaned up temp file: ${filePath}`);
    }
  }
}, { connection: redis });

// Event Listeners for logging
dispatchWorker.on('completed', (job) => {
  console.log(`[WORKER] Job ${job.id} completed successfully.`);
});

dispatchWorker.on('failed', (job, err) => {
  console.error(`[WORKER] Job ${job.id} failed with error: ${err.message}`);
});

console.log('[WORKER] Dispatch Ingestion Worker is running and listening to queue...');