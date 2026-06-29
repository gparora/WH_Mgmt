const { dispatchIngestionQueue } = require('../config/queues');
const db = require('../config/db');
const { ulid } = require('ulid');

exports.uploadDispatchReport = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const tenantId = req.context.tenantId; 
    const { report_type, operational_date, site_code } = req.body;

    const job = await dispatchIngestionQueue.add('process-excel', {
      tenantId,
      userId: req.session?.user?.id || null, 
      filePath: req.file.path,
      originalFilename: req.file.originalname,
      reportType: report_type,
      operationalDate: operational_date,
      siteCode: site_code
    });

    return res.status(202).json({
      message: 'File uploaded successfully. Processing started in background.',
      jobId: job.id
    });
  } catch (error) {
    console.error('Upload error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

exports.processScan = async (req, res) => {
  const tenantId = req.context.tenantId;
  const { awb, scan_station, device_id } = req.body;
  const userId = req.session?.user?.id || null;

  if (!awb) {
    return res.status(400).json({ error: 'Tracking ID (awb) is required' });
  }

  try {
    const response = await db.transaction(async (trx) => {
      
      // 1. Locate the order
      const order = await trx('dispatch_orders')
        .where({ tenant_id: tenantId, awb: awb.trim() })
        .first();

      if (!order) {
        return {
          success: false,
          status: 404,
          error: 'ORDER_NOT_FOUND',
          message: `No order found for Tracking ID: ${awb}`
        };
      }

      // 2. Prevent duplicate states
      if (order.status === 'ready_for_dispatch') {
        return {
          success: false,
          status: 409,
          error: 'ALREADY_SCANNED',
          message: `Order ${awb} has already been scanned and is ready for dispatch.`
        };
      }

      if (order.status === 'dispatched') {
        return {
          success: false,
          status: 409,
          error: 'ORDER_DISPATCHED',
          message: `Order ${awb} has already left the facility.`
        };
      }

      // 3. Perform the status transition (Updates status, ready_at, and updated_at)
      await trx('dispatch_orders')
        .where({ id: order.id, tenant_id: tenantId })
        .update({
          status: 'ready_for_dispatch',
          ready_at: db.fn.now(),
          updated_at: db.fn.now()
        });

      // 4. Log the scan using exactly the columns in dispatch_scans
    await trx('dispatch_scans').insert({
        tenant_id: tenantId,
        order_id: order.id,
        awb: order.awb,
        scan_type: 'DISPATCH',
        user_id: userId,
        details: JSON.stringify({
          scan_station: scan_station || 'DEFAULT_STATION',
          device_id: device_id || 'UNKNOWN_DEVICE'
        }),
        created_at: db.fn.now()
      });

      return {
        success: true,
        status: 200,
        data: {
          order_id: order.order_id,
          awb: order.awb,
          new_status: 'ready_for_dispatch'
        }
      };
    });

    if (!response.success) {
      return res.status(response.status).json({ 
        error: response.error, 
        message: response.message 
      });
    }

    return res.status(200).json({
      message: 'Scan processed successfully. Package verified for dispatch.',
      details: response.data
    });

  } catch (error) {
    console.error('Scanning processing exception:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};