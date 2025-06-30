const mongoose = require('mongoose');

const invoiceRecordSchema = new mongoose.Schema({
  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    required: true
  },
  vendorName: {
    type: String,
    required: true
  },
  invoiceDate: {
    type: Date,
    required: true
  },
  invoiceValue: {
    type: Number,
    required: true
  },
  invoiceQty: {
    type: Number,
    required: true
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('InvoiceRecord', invoiceRecordSchema);