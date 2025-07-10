const express = require('express');
const InvoiceRecord = require('../models/InvoiceRecord');
const auth = require('../middleware/auth');
const ExcelJS = require('exceljs');

const router = express.Router();

router.post('/', auth, async (req, res) => {
  try {
    const { document, vendorName, invoiceDate, invoiceValue, invoiceQty } = req.body;
    
    const invoiceRecord = new InvoiceRecord({
      document,
      vendorName,
      invoiceDate,
      invoiceValue,
      invoiceQty,
      owner: req.user._id
    });

    await invoiceRecord.save();
    await invoiceRecord.populate(['document', 'owner']);
    
    res.status(201).json(invoiceRecord);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const { startDate, endDate, vendorName, minValue, maxValue, page, limit } = req.query;
    const Document = require('../models/Document');
    const Folder = require('../models/Folder');
    
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;
    
    // Get accessible documents based on user permissions
    let accessibleDocuments = [];
    
    if (req.user.role === 'admin' || req.user.role === 'manager') {
      // Admin/Manager can see all documents
      accessibleDocuments = await Document.find({}).select('_id');
    } else {
      // Get folders user has access to
      const accessibleFolders = await Folder.find({
        $or: [
          { owner: req.user._id },
          { departmentAccess: req.user.department },
          { sharedWith: req.user._id }
        ]
      }).select('_id');
      
      const folderIds = accessibleFolders.map(f => f._id);
      
      // Get documents user can access
      accessibleDocuments = await Document.find({
        $or: [
          { owner: req.user._id },
          { folder: { $in: folderIds } },
          { sharedWith: req.user._id }
        ]
      }).select('_id');
    }
    
    const documentIds = accessibleDocuments.map(d => d._id);
    
    // Build invoice query
    let query = { document: { $in: documentIds } };

    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate) query.invoiceDate.$lte = new Date(endDate);
    }

    if (vendorName) {
      query.vendorName = { $regex: vendorName, $options: 'i' };
    }

    if (minValue || maxValue) {
      query.invoiceValue = {};
      if (minValue) query.invoiceValue.$gte = parseFloat(minValue);
      if (maxValue) query.invoiceValue.$lte = parseFloat(maxValue);
    }

    const invoices = await InvoiceRecord.find(query)
      .populate(['document', 'owner'])
      .sort({ invoiceDate: -1 })
      .skip(skip)
      .limit(limitNum);
    
    const total = await InvoiceRecord.countDocuments(query);
    
    res.json({
      invoices,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/export', auth, async (req, res) => {
  try {
    const { startDate, endDate, vendorName, minValue, maxValue } = req.query;
    const Document = require('../models/Document');
    const Folder = require('../models/Folder');
    
    // Get accessible documents based on user permissions
    let accessibleDocuments = [];
    
    if (req.user.role === 'admin' || req.user.role === 'manager') {
      accessibleDocuments = await Document.find({}).select('_id');
    } else {
      const accessibleFolders = await Folder.find({
        $or: [
          { owner: req.user._id },
          { departmentAccess: req.user.department },
          { sharedWith: req.user._id }
        ]
      }).select('_id');
      
      const folderIds = accessibleFolders.map(f => f._id);
      
      accessibleDocuments = await Document.find({
        $or: [
          { owner: req.user._id },
          { folder: { $in: folderIds } },
          { sharedWith: req.user._id }
        ]
      }).select('_id');
    }
    
    const documentIds = accessibleDocuments.map(d => d._id);
    let query = { document: { $in: documentIds } };

    if (startDate || endDate) {
      query.invoiceDate = {};
      if (startDate) query.invoiceDate.$gte = new Date(startDate);
      if (endDate) query.invoiceDate.$lte = new Date(endDate);
    }

    if (vendorName) {
      query.vendorName = { $regex: vendorName, $options: 'i' };
    }

    if (minValue || maxValue) {
      query.invoiceValue = {};
      if (minValue) query.invoiceValue.$gte = parseFloat(minValue);
      if (maxValue) query.invoiceValue.$lte = parseFloat(maxValue);
    }

    const invoices = await InvoiceRecord.find(query)
      .populate(['document', 'owner'])
      .sort({ invoiceDate: -1 });

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Invoice Records');

    worksheet.columns = [
      { header: 'Vendor Name', key: 'vendorName', width: 20 },
      { header: 'Invoice Date', key: 'invoiceDate', width: 15 },
      { header: 'Invoice Value', key: 'invoiceValue', width: 15 },
      { header: 'Invoice Qty', key: 'invoiceQty', width: 15 },
      { header: 'Document Name', key: 'documentName', width: 30 }
    ];

    invoices.forEach(invoice => {
      worksheet.addRow({
        vendorName: invoice.vendorName,
        invoiceDate: invoice.invoiceDate.toDateString(),
        invoiceValue: invoice.invoiceValue,
        invoiceQty: invoice.invoiceQty,
        documentName: invoice.document?.originalName || 'Document not found'
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=invoice-records.xlsx');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;