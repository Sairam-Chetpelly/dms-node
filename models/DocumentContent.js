const mongoose = require('mongoose');

const documentContentSchema = new mongoose.Schema({
  documentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true
  },
  content: {
    type: String,
    required: true
  },
  extractedAt: {
    type: Date,
    default: Date.now
  }
});

documentContentSchema.index({ documentId: 1 });
documentContentSchema.index({ content: 'text' });

module.exports = mongoose.model('DocumentContent', documentContentSchema);