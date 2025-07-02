const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true },
  path: { type: String, required: true },
  folder: { type: mongoose.Schema.Types.ObjectId, ref: 'Folder', default: null },
  tags: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tag' }],
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  isStarred: { type: Boolean, default: false },
  isShared: { type: Boolean, default: false },
  sharedWith: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  permissions: {
    read: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    write: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    delete: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
  },
  content: { type: String, default: '' },
  content: { type: String, default: '' }
}, {
  timestamps: true
});

module.exports = mongoose.model('Document', documentSchema);