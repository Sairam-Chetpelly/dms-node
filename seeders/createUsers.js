const mongoose = require('mongoose');
const User = require('../models/User');
const Department = require('../models/Department');
require('dotenv').config();

const users = [
  {
    name: 'Admin User',
    email: 'admin@company.com',
    password: 'admin123',
    role: 'admin',
    departmentName: 'it'
  },
  {
    name: 'HR Manager',
    email: 'hr.manager@company.com',
    password: 'manager123',
    role: 'manager',
    departmentName: 'hr'
  },
  {
    name: 'Finance Manager',
    email: 'finance.manager@company.com',
    password: 'manager123',
    role: 'manager',
    departmentName: 'finance'
  },
  {
    name: 'HR Employee',
    email: 'hr.employee@company.com',
    password: 'employee123',
    role: 'employee',
    departmentName: 'hr'
  },
  {
    name: 'Finance Employee',
    email: 'finance.employee@company.com',
    password: 'employee123',
    role: 'employee',
    departmentName: 'finance'
  },
  {
    name: 'IT Employee',
    email: 'it.employee@company.com',
    password: 'employee123',
    role: 'employee',
    departmentName: 'it'
  }
];

async function createUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing users
    await User.deleteMany({});
    console.log('Cleared existing users');

    // Create new users
    for (const userData of users) {
      const department = await Department.findOne({ name: userData.departmentName });
      if (!department) {
        console.error(`Department ${userData.departmentName} not found`);
        continue;
      }
      
      const user = new User({
        name: userData.name,
        email: userData.email,
        password: userData.password,
        role: userData.role,
        department: department._id
      });
      await user.save();
      console.log(`Created user: ${user.name} (${user.role} - ${userData.departmentName})`);
    }

    console.log('All users created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error creating users:', error);
    process.exit(1);
  }
}

createUsers();