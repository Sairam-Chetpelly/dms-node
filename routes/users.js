const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const users = await User.find({}, 'name email').sort({ name: 1 });
    console.log('Users found:', users);
    const formattedUsers = users.map(user => ({
      id: user._id.toString(),
      name: user.name,
      email: user.email
    }));
    res.json(formattedUsers);
  } catch (error) {
    console.error('Error in users route:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;