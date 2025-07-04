const mongoose = require('mongoose');
const Department = require('../models/Department');
require('dotenv').config();

const departments = [
  { name: 'hr', displayName: 'Human Resources', description: 'Manages employee relations and policies' },
  { name: 'finance', displayName: 'Finance', description: 'Handles financial operations and accounting' },
  { name: 'it', displayName: 'Information Technology', description: 'Manages technology infrastructure and support' },
  { name: 'marketing', displayName: 'Marketing', description: 'Handles marketing and promotional activities' },
  { name: 'operations', displayName: 'Operations', description: 'Manages day-to-day business operations' }
];

async function createDepartments() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Drop the entire collection to remove old indexes
    try {
      await mongoose.connection.db.dropCollection('departments');
      console.log('Dropped departments collection');
    } catch (error) {
      console.log('Collection does not exist, continuing...');
    }

    for (const deptData of departments) {
      const department = new Department(deptData);
      await department.save();
      console.log(`Created department: ${department.displayName}`);
    }

    console.log('All departments created successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Error creating departments:', error);
    process.exit(1);
  }
}

createDepartments();