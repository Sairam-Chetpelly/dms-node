const mongoose = require('mongoose');

const folderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  parent: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isShared: { type: Boolean, default: false },
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  departmentAccess: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Department' }],
  permissions: {
    read: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    write: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    delete: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Folder', folderSchema);