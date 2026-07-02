const { Worker } = require('bullmq');
const puppeteer = require('puppeteer');
const handlebars = require('handlebars');
const path = require('path');
const fs = require('fs');
const db = require('../config/db');
const redis = require('../config/redis');

// The exact HTML layout matching your physical 4x6 shipping labels
const labelTemplateSource = `
<!DOCTYPE html>
<html>
<head>
  <style>
    @page { size: 4in 6in; margin: 0; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; margin: 0; padding: 15px; font-size: 12px; }
    .label-page { page-break-after: always; height: 100%; display: flex; flex-direction: column; }
    .brand { font-size: 18px; font-weight: bold; margin: 5px 0; }
    .awb-code { font-size: 16px; font-weight: bold; margin: 5px 0; }
    .divider { border-top: 1px solid #000; margin: 8px 0; }
    .address-block { font-size: 10px; line-height: 1.3; }
    .item-title { font-size: 13px; font-weight: bold; margin-bottom: 5px; }
    .sku-block { font-size: 11px; margin-top: auto; padding-bottom: 10px; }
  </style>
</head>
<body>
  {{#each orders}}
  <div class="label-page">
    <div>SKU: {{this.sku}}</div>
    <div class="brand">{{../template.brand_name}}</div>
    <div>MRP: {{this.mrp}}</div>
    <div class="awb-code">{{this.awb}}</div>
    <div>Mfd: {{../currentMonthYear}}</div>
    
    <div class="divider"></div>
    
    <div class="address-block">
      Address: {{../template.address_line1}}{{#if ../template.address_line2}}, {{../template.address_line2}}{{/if}}, {{../template.city}} - {{../template.pincode}}<br>
      Cust Care No: {{../template.cust_care_number}} &nbsp; Support Hours: {{../template.support_hours}}
    </div>
    
    <div class="divider"></div>
    
    <div class="item-title">{{this.item_title}}</div>
    
    <div class="sku-block">
      <div>{{this.sku}}</div>
      <div>{{this.asin}}</div>
    </div>
  </div>
  {{/each}}
</body>
</html>
`;

const compiledTemplate = handlebars.compile(labelTemplateSource);

const pdfWorker = new Worker('pdf-generation-queue', async (job) => {
  const { tenantId, batchId, orderIds } = job.data;
  console.log(`[PDF Worker] Starting print job for Tenant: ${tenantId}`);

  try {
    // 1. Fetch the active MRP Template for this tenant
    const template = await db('mrp_templates')
      .where({ tenant_id: tenantId, is_default: true, is_active: true })
      .first();

    if (!template) {
      throw new Error(`No default MRP template found for tenant ${tenantId}`);
    }

    // 2. Fetch the orders (falling back to mock item data if you don't have an order_items table yet)
    const orders = await db('dispatch_orders')
      .whereIn('id', orderIds)
      .andWhere('tenant_id', tenantId);

    // Map orders to include dummy item data for the template if needed
    const mappedOrders = orders.map(order => ({
      awb: order.awb,
      sku: 'VMU59-SLVR', // Mocked until order_items table is linked
      asin: 'B07YYFQ2RZ',
      mrp: '1999',
      item_title: '12" Undershelf Storage Basket Under Cabinet Storage Organizer (3 Pcs, Silver)'
    }));

    // 3. Generate HTML
    const currentMonthYear = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const htmlContent = compiledTemplate({
      template,
      orders: mappedOrders,
      currentMonthYear
    });

    // 4. Spin up Puppeteer to generate the PDF
    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();
    await page.setContent(htmlContent, { waitUntil: 'networkidle0' });

    // Ensure the uploads/pdfs directory exists
    const pdfDir = path.join(__dirname, '..', 'uploads', 'pdfs');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
    }

    const filename = `Batch_${batchId || 'Single'}_Labels_${Date.now()}.pdf`;
    const filePath = path.join(pdfDir, filename);

    // Print to exactly 4x6 inches
    await page.pdf({
      path: filePath,
      width: '4in',
      height: '6in',
      printBackground: true
    });

    await browser.close();

    // 5. Update Database Status to MRP_GENERATED
    await db('dispatch_orders')
      .whereIn('id', orderIds)
      .update({
        status: 'MRP_GENERATED',
        updated_at: db.fn.now()
      });

    console.log(`[PDF Worker] Successfully generated PDF: ${filename}`);
    return { success: true, fileUrl: `/uploads/pdfs/${filename}` };

  } catch (error) {
    console.error('[PDF Worker] Failed to generate PDF:', error);
    throw error;
  }
}, { connection: redis  });

pdfWorker.on('failed', (job, err) => {
  console.error(`[PDF Worker] Job ${job.id} failed:`, err.message);
});

module.exports = pdfWorker;