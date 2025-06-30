const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Document = require('../models/Document');
const auth = require('../middleware/auth');

const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    const { folder, tags } = req.body;
    
    const document = new Document({
      name: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      folder: folder || null,
      tags: tags ? JSON.parse(tags) : [],
      owner: req.user._id
    });

    await document.save();
    await document.populate(['folder', 'tags', 'owner']);
    
    res.status(201).json(document);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const { folder, starred, shared, search, invoices } = req.query;
    let query = {};

    if (shared === 'true') {
      query = { sharedWith: req.user._id };
    } else if (req.query.mydrives === 'true') {
      query = { owner: req.user._id, folder: null, isShared: false };
    } else if (invoices === 'true') {
      const InvoiceRecord = require('../models/InvoiceRecord');
      const invoiceRecords = await InvoiceRecord.find({ owner: req.user._id }).populate('document');
      return res.json(invoiceRecords.map(record => record.document));
    } else {
      query = { owner: req.user._id };
    }

    if (folder) query.folder = folder === 'null' ? null : folder;
    if (starred === 'true') query.isStarred = true;
    if (search) query.originalName = { $regex: search, $options: 'i' };

    const documents = await Document.find(query)
      .populate(['folder', 'tags', 'owner', 'sharedWith', 'permissions.read', 'permissions.write', 'permissions.delete'])
      .sort({ createdAt: -1 });
    
    res.json(documents);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id)
      .populate(['folder', 'tags', 'owner']);
    
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }
    
    res.json(document);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id/star', auth, async (req, res) => {
  try {
    const document = await Document.findByIdAndUpdate(
      req.params.id,
      { isStarred: req.body.starred },
      { new: true }
    ).populate(['folder', 'tags', 'owner']);
    
    res.json(document);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id/share', auth, async (req, res) => {
  try {
    const { userIds, permissions } = req.body;
    const document = await Document.findByIdAndUpdate(
      req.params.id,
      {
        isShared: userIds.length > 0,
        sharedWith: userIds,
        permissions: {
          read: permissions.read || [],
          write: permissions.write || [],
          delete: permissions.delete || []
        }
      },
      { new: true }
    ).populate(['folder', 'tags', 'owner', 'sharedWith']);
    
    res.json(document);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    if (fs.existsSync(document.path)) {
      fs.unlinkSync(document.path);
    }

    await Document.findByIdAndDelete(req.params.id);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/download', auth, async (req, res) => {
  try {
    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.download(document.path, document.originalName);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id/view', async (req, res) => {
  try {
    const token = req.query.token || req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Access denied' });
    }

    const jwt = require('jsonwebtoken');
    jwt.verify(token, process.env.JWT_SECRET);

    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.sendFile(require('path').resolve(document.path));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;