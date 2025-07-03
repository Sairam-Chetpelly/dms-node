const pdf = require('pdf-parse');
const fs = require('fs');
const DocumentContent = require('../models/DocumentContent');

async function extractPDFContent(filePath, documentId) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    
    // Save extracted content to database
    await DocumentContent.findOneAndUpdate(
      { documentId },
      { 
        documentId,
        content: data.text,
        extractedAt: new Date()
      },
      { upsert: true }
    );
    
    console.log(`PDF content extracted for document ${documentId}`);
    return data.text;
  } catch (error) {
    console.error('PDF extraction error:', error);
    return null;
  }
}

module.exports = { extractPDFContent };