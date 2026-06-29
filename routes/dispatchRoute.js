const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { uploadDispatchReport,processScan } = require('../controllers/dispatchController');
const tenantMiddleware = require('../middleware/tenant');
// const { isAuthenticated, requirePermission } = require('../middleware/auth'); // Add your auth middleware later

const router = express.Router();

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const upload = multer({ 
  dest: UPLOADS_DIR,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit as per your API Spec
});

// In production, NEED to add isAuthenticated and requirePermission('dispatch.import') here
console.log("tenantMiddleware is:", typeof tenantMiddleware);
console.log("processScan is:", typeof processScan);
router.post('/import', upload.single('file'), uploadDispatchReport);
router.post('/scan', tenantMiddleware, processScan);

module.exports = router;