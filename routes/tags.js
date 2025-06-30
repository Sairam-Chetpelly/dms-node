const express = require('express');
const Tag = require('../models/Tag');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/', auth, async (req, res) => {
  try {
    const { name, color } = req.body;
    
    const tag = new Tag({
      name,
      color: color || '#007bff',
      owner: req.user._id
    });

    await tag.save();
    res.status(201).json(tag);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const tags = await Tag.find({ owner: req.user._id }).sort({ name: 1 });
    res.json(tags);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { name, color } = req.body;
    
    const tag = await Tag.findByIdAndUpdate(
      req.params.id,
      { name, color },
      { new: true }
    );
    
    res.json(tag);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await Tag.findByIdAndDelete(req.params.id);
    res.json({ message: 'Tag deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;