const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pdf = require('pdf-parse');
const Tesseract = require('tesseract.js');
const pdf2pic = require('pdf2pic');
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

// OCR function for scanned PDFs
async function extractTextWithOCR(pdfPath) {
  try {
    const convert = pdf2pic.fromPath(pdfPath, {
      density: 300,
      saveFilename: 'page',
      savePath: './uploads/temp/',
      format: 'png',
      width: 2000,
      height: 2000
    });
    
    if (!fs.existsSync('./uploads/temp/')) {
      fs.mkdirSync('./uploads/temp/', { recursive: true });
    }
    
    let extractedText = '';
    let pageNum = 1;
    
    while (true) {
      try {
        const result = await convert(pageNum);
        const { data: { text } } = await Tesseract.recognize(result.path, 'eng');
        extractedText += text + '\n';
        
        if (fs.existsSync(result.path)) {
          fs.unlinkSync(result.path);
        }
        
        pageNum++;
      } catch (pageError) {
        break;
      }
    }
    
    return extractedText || 'No text found in PDF';
  } catch (error) {
    console.log('OCR error:', error.message);
    return '';
  }
}

router.post('/upload', auth, upload.single('file'), async (req, res) => {
  try {
    const { folder, tags } = req.body;
    let content = '';
    
    // Extract PDF content if file is PDF
    if (req.file.mimetype === 'application/pdf') {
      try {
        const dataBuffer = fs.readFileSync(req.file.path);
        const data = await pdf(dataBuffer);
        content = data.text;
        
        // If no text extracted (scanned PDF), use OCR
        if (!content || content.trim().length < 50) {
          console.log('PDF appears to be scanned, using OCR...');
          content = await extractTextWithOCR(req.file.path);
        }
      } catch (pdfError) {
        console.log('PDF extraction failed, trying OCR:', pdfError.message);
        try {
          content = await extractTextWithOCR(req.file.path);
        } catch (ocrError) {
          console.log('OCR extraction failed:', ocrError.message);
        }
      }
    }
    
    const document = new Document({
      name: req.file.filename,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      folder: folder || null,
      tags: tags ? JSON.parse(tags) : [],
      owner: req.user._id,
      content: content
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
    // const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const document = await Document.findById(req.params.id);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // // Check if user owns the document or has shared access
    // if (document.owner.toString() !== decoded._id && 
    //     !document.sharedWith.includes(decoded._id)) {
    //   return res.status(403).json({ message: 'Access denied to this document' });
    // }

    res.sendFile(require('path').resolve(document.path));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Chatbot search endpoint
router.post('/chat', auth, async (req, res) => {
  try {
    const { query } = req.body;
    
    if (!query || query.trim().length === 0) {
      return res.status(400).json({ message: 'Query is required' });
    }

    // Search for PDFs containing the query text
    const documents = await Document.find({
      owner: req.user._id,
      mimeType: 'application/pdf',
      content: { $regex: query, $options: 'i' }
    }).populate(['folder', 'tags', 'owner']).sort({ createdAt: -1 });

    // Extract relevant snippets
    const results = documents.map(doc => {
      const content = doc.content;
      const queryIndex = content.toLowerCase().indexOf(query.toLowerCase());
      
      let snippet = '';
      if (queryIndex !== -1) {
        const start = Math.max(0, queryIndex - 100);
        const end = Math.min(content.length, queryIndex + query.length + 100);
        snippet = content.substring(start, end);
        if (start > 0) snippet = '...' + snippet;
        if (end < content.length) snippet = snippet + '...';
      }
      
      return {
        document: {
          _id: doc._id,
          originalName: doc.originalName,
          createdAt: doc.createdAt,
          folder: doc.folder
        },
        snippet: snippet
      };
    });

    const response = {
      query: query,
      results: results,
      message: results.length > 0 
        ? `Found ${results.length} PDF(s) containing "${query}"` 
        : `No PDFs found containing "${query}"`
    };

    res.json(response);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;