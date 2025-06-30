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
    const { startDate, endDate, vendorName, minValue, maxValue } = req.query;
    let query = { owner: req.user._id };

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
    
    res.json(invoices);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/export', auth, async (req, res) => {
  try {
    const { startDate, endDate, vendorName, minValue, maxValue } = req.query;
    let query = { owner: req.user._id };

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
        documentName: invoice.document.originalName
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