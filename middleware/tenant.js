const db = require('../config/db');
const redis = require('../config/redis');


async function tenantMiddleware(req, res, next) {
  // In production, Nginx sets this based on the subdomain (e.g., aurora.warehouseops.com)
  // For local testing, we can pass it manually in headers or use a default.
  const slug = req.headers['x-tenant-slug'] || process.env.DEFAULT_TENANT_SLUG;
  
  if (!slug) {
    return res.status(400).json({ error: 'Missing tenant context. X-Tenant-Slug header required.' });
  }

  try {
    const cacheKey = `tenant:slug:${slug}`;
    let tenant = await redis.get(cacheKey);

    if (!tenant) {
      tenant = await db('tenants')
        .where({ slug: slug, is_active: true })
        .first();

      if (!tenant) {
        return res.status(404).json({ error: 'Tenant not found or inactive' });
      }

      await redis.set(cacheKey, JSON.stringify(tenant), 'EX', 300);
    } else {
      tenant = JSON.parse(tenant);
    }

    req.context = { 
      tenantId: tenant.id, 
      tenant 
    };
    
    next();
  } catch (error) {
    console.error('Tenant resolution error:', error);
    res.status(500).json({ error: 'Internal server error during tenant resolution' });
  }
}

module.exports = tenantMiddleware;