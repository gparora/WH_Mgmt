const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const mrpTemplateRoutes = require('./routes/mrpTemplateRoute');
const dispatchRoutes = require('./routes/dispatchRoute');
require('dotenv').config();
require('./workers/pdfGenerationWorker');

const tenantMiddleware = require('./middleware/tenant');

const app = express();

// 1. Global Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' })); // Support for JSON payloads
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'UP', environment: process.env.NODE_ENV });
});



app.use('/api/v1', tenantMiddleware);
app.use('/api/v1/mrp-templates', mrpTemplateRoutes);
app.use('/api/v1/dispatch', dispatchRoutes);


app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'INTERNAL_ERROR', 
    message: 'An unexpected server error occurred.' 
  });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`WMS SaaS API running on port ${PORT}`);
  console.log(`Expecting PostgreSQL and Redis connections...`);
});