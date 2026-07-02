const db = require('../config/db');
const { ulid } = require('ulid');

exports.createTemplate = async (req, res) => {
  const tenantId = req.context.tenantId;
  const userId = req.session?.user?.id || null;
  const { 
    name, brand_name, address_line1, address_line2, 
    city, pincode, cust_care_number, support_hours, is_default 
  } = req.body;

  if (!name || !brand_name || !address_line1 || !cust_care_number || !support_hours) {
    return res.status(400).json({ error: 'Missing required template fields' });
  }

  try {
    const templateId = `tpl_${ulid().toLowerCase()}`;

    await db.transaction(async (trx) => {
      if (is_default) {
        await trx('mrp_templates')
          .where({ tenant_id: tenantId, is_default: true, is_active: true })
          .update({ is_default: false, updated_at: db.fn.now() });
      }

      await trx('mrp_templates').insert({
        id: templateId,
        tenant_id: tenantId,
        name,
        brand_name,
        address_line1,
        address_line2,
        city,
        pincode,
        cust_care_number,
        support_hours,
        is_default: is_default || false,
        created_by: userId,
        created_at: db.fn.now(),
        updated_at: db.fn.now()
      });
    });

    return res.status(201).json({
      message: 'MRP Template created successfully',
      id: templateId
    });

  } catch (error) {
    console.error('Error creating MRP template:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: error.message });
  }
};

exports.listTemplates = async (req, res) => {
  const tenantId = req.context.tenantId;

  try {
    const templates = await db('mrp_templates')
      .where({ tenant_id: tenantId, is_active: true })
      .orderBy('is_default', 'desc')
      .orderBy('created_at', 'desc');

    return res.status(200).json({ data: templates });
  } catch (error) {
    console.error('Error listing MRP templates:', error);
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
  }
};