const { Queue } = require('bullmq');
const redis = require('./redis'); 


const dispatchIngestionQueue = new Queue('dispatch-ingestion', { 
  connection: redis 
});
const pdfGenerationQueue = new Queue('pdf-generation-queue', { connection: redis });

module.exports = { dispatchIngestionQueue, pdfGenerationQueue };