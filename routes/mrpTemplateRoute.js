const express = require('express');
const router = express.Router();
const {createTemplate,listTemplates} = require('../controllers/mrpTemplateController');
const tenantMiddleware = require('../middleware/tenant'); 

router.use(tenantMiddleware);

router.post('/create', createTemplate,tenantMiddleware);
router.get('/list', listTemplates,tenantMiddleware);

module.exports = router;