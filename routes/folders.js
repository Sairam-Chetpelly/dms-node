const express = require('express');
const Folder = require('../models/Folder');
const Document = require('../models/Document');
const auth = require('../middleware/auth');

const router = express.Router();

router.post('/', auth, async (req, res) => {
  try {
    const { name, parent, departmentAccess } = req.body;
    console.log('Creating folder:', { name, parent, departmentAccess, owner: req.user._id });
    
    const folder = new Folder({
      name,
      parent: parent || null,
      owner: req.user._id,
      departmentAccess: departmentAccess || []
    });

    await folder.save();
    await folder.populate(['parent', 'owner', 'departmentAccess']);
    
    console.log('Folder created successfully:', folder);
    res.status(201).json(folder);
  } catch (error) {
    console.error('Error creating folder:', error);
    res.status(500).json({ message: error.message });
  }
});

// Helper function to check if user has access to folder
const hasAccessToFolder = (folder, user) => {
  if (user.role === 'admin' || user.role === 'manager') return true;
  if (folder.owner.toString() === user._id.toString()) return true;
  if (folder.sharedWith && folder.sharedWith.some(u => u.toString() === user._id.toString())) return true;
  if (folder.departmentAccess && folder.departmentAccess.some(d => d.toString() === user.department.toString())) return true;
  return false;
};

// Helper function to get all parent folder IDs
const getParentFolderIds = async (folderId) => {
  const parentIds = [];
  let currentFolder = await Folder.findById(folderId).select('parent');
  
  while (currentFolder && currentFolder.parent) {
    parentIds.push(currentFolder.parent);
    currentFolder = await Folder.findById(currentFolder.parent).select('parent');
  }
  
  return parentIds;
};

router.get('/', auth, async (req, res) => {
  try {
    const { parent } = req.query;
    
    if (req.user.role === 'admin' || req.user.role === 'manager') {
      // Admin/Manager sees all folders
      let query = {};
      if (parent) {
        query.parent = parent === 'null' ? null : parent;
      }
      
      const folders = await Folder.find(query)
        .populate(['parent', 'owner', 'sharedWith', 'departmentAccess'])
        .sort({ name: 1 });
      
      return res.json(folders.map(folder => ({
        ...folder.toObject(),
        hasAccess: true,
        canViewContent: true
      })));
    }
    
    // Get all folders user has direct access to
    const directAccessFolders = await Folder.find({
      $or: [
        { owner: req.user._id },
        { departmentAccess: req.user.department },
        { sharedWith: req.user._id }
      ]
    }).populate(['parent', 'owner', 'sharedWith', 'departmentAccess']);
    
    const directAccessIds = new Set(directAccessFolders.map(f => f._id.toString()));
    
    // Get all parent folder IDs that should be visible
    const parentFolderIds = new Set();
    for (const folder of directAccessFolders) {
      const parents = await getParentFolderIds(folder._id);
      parents.forEach(id => parentFolderIds.add(id.toString()));
    }
    
    // Get parent folders that should be visible but not accessible
    const parentFolders = await Folder.find({
      _id: { $in: Array.from(parentFolderIds) }
    }).populate(['parent', 'owner', 'sharedWith', 'departmentAccess']);
    
    // Combine accessible and parent folders
    const allFolders = [...directAccessFolders, ...parentFolders];
    const uniqueFolders = allFolders.filter((folder, index, self) => 
      index === self.findIndex(f => f._id.toString() === folder._id.toString())
    );
    
    // Filter by parent if specified
    let filteredFolders = uniqueFolders;
    if (parent) {
      const parentId = parent === 'null' ? null : parent;
      filteredFolders = uniqueFolders.filter(folder => {
        if (parentId === null) {
          return folder.parent === null;
        }
        return folder.parent && folder.parent._id.toString() === parentId;
      });
    }
    
    // Add access information to each folder
    const foldersWithAccess = filteredFolders.map(folder => {
      const folderId = folder._id.toString();
      const hasDirectAccess = directAccessIds.has(folderId);
      return {
        ...folder.toObject(),
        hasAccess: true, // All folders in this list should be visible
        canViewContent: hasDirectAccess
      };
    }).sort((a, b) => a.name.localeCompare(b.name));
    
    res.json(foldersWithAccess);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const folder = await Folder.findById(req.params.id)
      .populate(['parent', 'owner', 'sharedWith', 'departmentAccess']);
    
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }
    
    const hasDirectAccess = hasAccessToFolder(folder, req.user);
    
    res.json({
      ...folder.toObject(),
      hasAccess: hasDirectAccess,
      canViewContent: hasDirectAccess
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get folder contents (documents and subfolders) with access control
router.get('/:id/contents', auth, async (req, res) => {
  try {
    const folder = await Folder.findById(req.params.id)
      .populate(['parent', 'owner', 'sharedWith', 'departmentAccess']);
    
    if (!folder) {
      return res.status(404).json({ message: 'Folder not found' });
    }
    
    const hasDirectAccess = hasAccessToFolder(folder, req.user);
    
    if (!hasDirectAccess) {
      return res.status(403).json({ 
        message: 'Access denied to folder contents',
        canViewFolder: true,
        canViewContent: false
      });
    }
    
    // Get subfolders
    const subfolders = await Folder.find({ parent: req.params.id })
      .populate(['parent', 'owner', 'sharedWith', 'departmentAccess'])
      .sort({ name: 1 });
    
    // Get documents
    const documents = await Document.find({ folder: req.params.id })
      .populate(['uploadedBy', 'folder'])
      .sort({ originalName: 1 });
    
    // Add access information to subfolders
    const subfoldersWithAccess = subfolders.map(subfolder => {
      const hasSubfolderAccess = hasAccessToFolder(subfolder, req.user);
      return {
        ...subfolder.toObject(),
        hasAccess: hasSubfolderAccess,
        canViewContent: hasSubfolderAccess
      };
    });
    
    res.json({
      folder: {
        ...folder.toObject(),
        hasAccess: true,
        canViewContent: true
      },
      subfolders: subfoldersWithAccess,
      documents
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { name, departmentAccess } = req.body;
    
    const updateData = { name };
    if (req.user.role === 'admin' || req.user.role === 'manager') {
      updateData.departmentAccess = departmentAccess;
    }
    
    const folder = await Folder.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    ).populate(['parent', 'owner']);
    
    res.json(folder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Share folder with departments
router.put('/:id/share-department', auth, async (req, res) => {
  try {
    const { departments } = req.body;
    
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Only admin and managers can share folders with departments' });
    }
    
    const folder = await Folder.findByIdAndUpdate(
      req.params.id,
      { departmentAccess: departments },
      { new: true }
    ).populate(['parent', 'owner']);
    
    res.json(folder);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Share folder with specific users
router.put('/:id/share-users', auth, async (req, res) => {
  try {
    const { userIds } = req.body;
    
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      return res.status(403).json({ message: 'Only admin and managers can share folders with users' });
    }
    
    const folder = await Folder.findByIdAndUpdate(
      req.params.id,
      { 
        isShared: userIds.length > 0,
        sharedWith: userIds 
      },
      { new: true }
    ).populate(['parent', 'owner', 'sharedWith']);
    
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

// Get folder hierarchy with access information
router.get('/hierarchy', auth, async (req, res) => {
  try {
    // Get all folders
    const allFolders = await Folder.find({})
      .populate(['parent', 'owner', 'sharedWith', 'departmentAccess'])
      .sort({ name: 1 });
    
    // For non-admin users, determine which folders they can access
    let accessibleFolderIds = new Set();
    let parentFolderIds = new Set();
    
    if (req.user.role !== 'admin' && req.user.role !== 'manager') {
      // Find folders user has direct access to
      const directAccessFolders = allFolders.filter(folder => 
        hasAccessToFolder(folder, req.user)
      );
      
      directAccessFolders.forEach(folder => {
        accessibleFolderIds.add(folder._id.toString());
      });
      
      // Find all parent folders that should be visible
      for (const folder of directAccessFolders) {
        const parents = await getParentFolderIds(folder._id);
        parents.forEach(id => parentFolderIds.add(id.toString()));
      }
    }
    
    // Build hierarchy tree
    const buildTree = (parentId = null) => {
      return allFolders
        .filter(folder => {
          const folderParentId = folder.parent ? folder.parent._id.toString() : null;
          return folderParentId === parentId;
        })
        .map(folder => {
          const folderId = folder._id.toString();
          let hasAccess = true;
          let canViewContent = true;
          
          if (req.user.role !== 'admin' && req.user.role !== 'manager') {
            hasAccess = accessibleFolderIds.has(folderId) || parentFolderIds.has(folderId);
            canViewContent = accessibleFolderIds.has(folderId);
          }
          
          return {
            ...folder.toObject(),
            hasAccess,
            canViewContent,
            children: buildTree(folderId)
          };
        })
        .filter(folder => {
          // Only show folders user has some level of access to
          if (req.user.role === 'admin' || req.user.role === 'manager') return true;
          return folder.hasAccess;
        });
    };
    
    const hierarchy = buildTree();
    res.json(hierarchy);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;