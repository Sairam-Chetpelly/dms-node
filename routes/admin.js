const express = require('express');
const User = require('../models/User');
const Department = require('../models/Department');
const auth = require('../middleware/auth');

const router = express.Router();

// Admin middleware
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// Employee CRUD
router.get('/employees', auth, adminOnly, async (req, res) => {
  try {
    const employees = await User.find({}).populate('department').select('-password').sort({ createdAt: -1 });
    res.json(employees);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/employees', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, password, role, department } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = new User({ name, email, password, role, department });
    await user.save();
    
    const userResponse = user.toObject();
    delete userResponse.password;
    
    res.status(201).json(userResponse);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/employees/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, email, role, department } = req.body;
    
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, role, department },
      { new: true }
    ).populate('department').select('-password');
    
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/employees/:id', auth, adminOnly, async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Department CRUD
router.get('/departments', async (req, res) => {
  try {
    const departments = await Department.find({ isActive: true }).sort({ displayName: 1 });
    const departmentStats = await Promise.all(
      departments.map(async (dept) => {
        const count = await User.countDocuments({ department: dept._id });
        return { ...dept.toObject(), employeeCount: count };
      })
    );
    res.json(departmentStats);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/departments', auth, adminOnly, async (req, res) => {
  try {
    const { name, displayName, description } = req.body;
    
    const existingDept = await Department.findOne({ name: name.toLowerCase() });
    if (existingDept) {
      return res.status(400).json({ message: 'Department already exists' });
    }

    const department = new Department({ 
      name: name.toLowerCase(), 
      displayName, 
      description 
    });
    await department.save();
    
    res.status(201).json(department);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/departments/:id', auth, adminOnly, async (req, res) => {
  try {
    const { displayName, description, isActive } = req.body;
    
    const department = await Department.findByIdAndUpdate(
      req.params.id,
      { displayName, description, isActive },
      { new: true }
    );
    
    if (!department) {
      return res.status(404).json({ message: 'Department not found' });
    }
    
    res.json(department);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/departments/:id', auth, adminOnly, async (req, res) => {
  try {
    const employeeCount = await User.countDocuments({ department: req.params.id });
    if (employeeCount > 0) {
      return res.status(400).json({ message: 'Cannot delete department with employees' });
    }

    await Department.findByIdAndDelete(req.params.id);
    res.json({ message: 'Department deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;