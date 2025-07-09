const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Get all users (for sharing)
router.get('/', auth, async (req, res) => {
  try {
    const users = await User.find({}, '-password')
      .populate('department')
      .sort({ name: 1 });
    
    // Format users for frontend compatibility
    const formattedUsers = users.map(user => ({
      ...user.toObject(),
      id: user._id.toString()
    }));
    
    res.json(formattedUsers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get user by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id, '-password')
      .populate('department');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({
      ...user.toObject(),
      id: user._id.toString()
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;