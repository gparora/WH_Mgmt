const { Queue } = require('bullmq');
const redis = require('./redis'); 

const dispatchIngestionQueue = new Queue('dispatch-ingestion', { 
  connection: redis 
});

module.exports = { dispatchIngestionQueue };