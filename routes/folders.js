const express = require('express');
const Folder = require('../models/Folder');
const Document = require('../models/Document');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/', auth, async (req, res) => {
  try {
    const { name, parent } = req.body;
    
    const folder = new Folder({
      name,
      parent: parent || null,
      owner: req.user._id
    });

    await folder.save();
    await folder.populate(['parent', 'owner']);
    
    res.status(201).json(folder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const { parent } = req.query;
    let query = { owner: req.user._id };
    
    if (parent) {
      query.parent = parent === 'null' ? null : parent;
    }

    const folders = await Folder.find(query)
      .populate(['parent', 'owner'])
      .sort({ name: 1 });
    
    res.json(folders);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const folder = await Folder.findById(req.params.id)
      .populate(['parent', 'owner']);
    
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }
    
    res.json(folder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { name } = req.body;
    
    const folder = await Folder.findByIdAndUpdate(
      req.params.id,
      { name },
      { new: true }
    ).populate(['parent', 'owner']);
    
    res.json(folder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const folder = await Folder.findById(req.params.id);
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }

    // Check if folder has subfolders or documents
    const subfolders = await Folder.find({ parent: req.params.id });
    const documents = await Document.find({ folder: req.params.id });
    
    if (subfolders.length > 0 || documents.length > 0) {
      return res.status(400).json({ message: 'Cannot delete folder with contents' });
    }

    await Folder.findByIdAndDelete(req.params.id);
    res.json({ message: 'Folder deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;