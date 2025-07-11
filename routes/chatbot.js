const express = require('express');
const User = require('../models/User');
const Document = require('../models/Document');
const auth = require('../middleware/auth');
const axios = require('axios');
const DocumentContent = require('../models/DocumentContent');
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Website content knowledge base
const WEBSITE_CONTENT = `
Documents Management System - A document management system with features:
- Upload, view, download, delete documents
- Folder organization with hierarchical structures
- Search and filter documents
- File tagging with colors
- User authentication and security
- Drag & drop upload interface
- Built with React.js, Node.js, MongoDB
- API endpoints for documents, folders, tags, authentication
`;

// Enhanced keyword extraction
const extractKeywords = (query) => {
  const stopWords = ['who', 'is', 'what', 'where', 'when', 'how', 'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'about', 'tell', 'me', 'can', 'you', 'please', 'find', 'show', 'get'];
  
  // Extract potential names (capitalized words)
  const namePattern = /\b[A-Z][a-z]+\b/g;
  const names = query.match(namePattern) || [];
  
  // Extract regular keywords
  const words = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.includes(word));
  
  // Combine names and keywords, prioritize names
  const allKeywords = [...names, ...words]
    .filter((word, index, arr) => arr.indexOf(word.toLowerCase()) === index)
    .slice(0, 8);
  
  return allKeywords;
};

// Search database for relevant information including document content
const searchDatabase = async (keywords) => {
  const results = { users: [], documents: [], documentContent: [] };
  
  if (keywords.length === 0) return results;
  
  try {
    // Enhanced user search
    const userSearchConditions = [];
    
    keywords.forEach(keyword => {
      userSearchConditions.push(
        { name: { $regex: keyword, $options: 'i' } },
        { email: { $regex: keyword, $options: 'i' } },
        { role: { $regex: keyword, $options: 'i' } }
      );
    });
    
    if (userSearchConditions.length > 0) {
      results.users = await User.find({ $or: userSearchConditions })
        .populate('department', 'displayName description')
        .select('name email role department createdAt')
        .sort({ createdAt: -1 })
        .limit(10);
    }

    // Enhanced document search (metadata)
    const docSearchConditions = [];
    
    keywords.forEach(keyword => {
      docSearchConditions.push(
        { originalName: { $regex: keyword, $options: 'i' } },
        { mimeType: { $regex: keyword, $options: 'i' } }
      );
    });
    
    if (docSearchConditions.length > 0) {
      results.documents = await Document.find({ $or: docSearchConditions })
        .populate('folder', 'name')
        .select('originalName mimeType tags createdAt folder size')
        .sort({ createdAt: -1 })
        .limit(10);
    }

    // Search document content
    const contentSearchConditions = [];
    
    keywords.forEach(keyword => {
      contentSearchConditions.push(
        { content: { $regex: keyword, $options: 'i' } }
      );
    });
    
    if (contentSearchConditions.length > 0) {
      results.documentContent = await Document.find({ $or: contentSearchConditions })
        .populate('folder', 'name')
        .select('originalName mimeType content createdAt folder')
        .sort({ createdAt: -1 })
        .limit(5);
    }

  } catch (error) {
    console.error('Database search error:', error);
  }
  
  return results;
};

// Search documents by content from Document collection
async function searchDocumentContent(query, userId) {
  try {
    const documents = await Document.find({
      owner: userId,
      content: { $regex: query, $options: 'i' }
    }).select('_id originalName content').limit(5);

    return documents.map(doc => ({
      documentId: doc._id,
      content: doc.content,
      document: [{ _id: doc._id, originalName: doc.originalName }]
    }));
  } catch (error) {
    console.error('Document search error:', error);
    return [];
  }
}

// Available AI models
const AI_MODELS = {
  'gemini-pro': {
    name: 'Gemini Pro',
    provider: 'vertex',
    model: 'gemini-1.5-pro'
  },
  'gemini-flash': {
    name: 'Gemini Flash',
    provider: 'vertex',
    model: 'gemini-1.5-flash'
  },
  'openrouter-gemma': {
    name: 'Gemma 2 9B',
    provider: 'openrouter',
    model: 'google/gemma-2-9b-it:free'
  }
};

// Call Google Vertex AI with API key
async function callVertexAI(messages, model = 'gemini-1.5-flash', maxTokens = 300) {
  const response = await axios.post('https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent', {
    contents: messages.filter(m => m.role !== 'system').map(msg => ({
      parts: [{ text: msg.content }],
      role: msg.role === 'user' ? 'user' : 'model'
    })),
    generationConfig: {
      maxOutputTokens: maxTokens,
      temperature: 0.7
    },
    systemInstruction: messages.find(m => m.role === 'system') ? {
      parts: [{ text: messages.find(m => m.role === 'system').content }]
    } : undefined
  }, {
    headers: {
      'Content-Type': 'application/json'
    },
    params: {
      key: process.env.GOOGLE_API_KEY
    }
  });
  
  return response.data.candidates[0].content.parts[0].text;
}

// Call OpenRouter API
async function callOpenRouter(messages, model = 'google/gemma-2-9b-it:free', maxTokens = 300) {
  const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
    model,
    messages,
    max_tokens: maxTokens,
    temperature: 0.7
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.BACKEND_URL || 'http://localhost:5000',
      'X-Title': 'Document Management Chatbot'
    }
  });
  return response.data.choices[0].message.content;
}



// Helper function to get skills based on role
const getSkillsFromRole = (role) => {
  const roleSkills = {
    'admin': 'They handle system administration and user management.',
    'manager': 'They oversee team operations and project management.',
    'employee': 'They contribute to various projects and tasks.',
    'developer': 'They work on software development and programming.',
    'designer': 'They handle UI/UX design and creative work.'
  };
  
  return roleSkills[role.toLowerCase()] || 'They work in the organization.';
};

// AI response function with enhanced database search
async function generateAIResponse(query, userId, selectedModel = 'gemini-flash') {
  // First extract keywords and search database
  const keywords = extractKeywords(query);
  const dbResults = await searchDatabase(keywords);
  
  // If we found users, documents, or content in database, create AI response
  if (dbResults.users.length > 0 || dbResults.documents.length > 0 || dbResults.documentContent.length > 0) {
    let contextData = '';
    
    if (dbResults.users.length > 0) {
      contextData += 'Users found:\n';
      dbResults.users.forEach(user => {
        contextData += `- ${user.name}: ${user.role} in ${user.department?.displayName || 'Unknown'} department (${user.email})\n`;
      });
    }
    
    if (dbResults.documents.length > 0) {
      contextData += 'Documents found:\n';
      dbResults.documents.forEach(doc => {
        contextData += `- ${doc.originalName} (${doc.mimeType}) - Created: ${new Date(doc.createdAt).toLocaleDateString()}\n`;
      });
    }
    
    if (dbResults.documentContent.length > 0) {
      contextData += 'Document Content found:\n';
      dbResults.documentContent.forEach(doc => {
        const snippet = doc.content ? doc.content.substring(0, 200) + '...' : 'No content preview';
        contextData += `- ${doc.originalName}: ${snippet}\n`;
      });
    }
    
    const messages = [
      {
        role: 'system',
        content: `You are a helpful AI assistant in a document management system. Answer naturally and conversationally based on the database information provided. If asking about a person, mention their role, department, and relevant details. Be friendly and informative.`
      },
      {
        role: 'user',
        content: `Question: ${query}\n\nDatabase Information:\n${contextData}`
      }
    ];

    // Try AI API first
    try {
      const modelConfig = AI_MODELS[selectedModel];
      if (modelConfig) {
        let aiResponse;
        if (modelConfig.provider === 'vertex' && process.env.GOOGLE_API_KEY) {
          aiResponse = await callVertexAI(messages, modelConfig.model, 300);
        } else if (modelConfig.provider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
          aiResponse = await callOpenRouter(messages, modelConfig.model, 300);
        }
        if (aiResponse) return aiResponse;
      }
    } catch (error) {
      console.error('AI API error:', error);
    }
    
    // Fallback response with database data
    if (dbResults.users.length > 0) {
      const user = dbResults.users[0];
      const skills = getSkillsFromRole(user.role);
      return `${user.name} is a ${user.role} in the ${user.department?.displayName || 'system'} department. ${skills} You can reach them at ${user.email}.`;
    }
    
    if (dbResults.documentContent.length > 0) {
      const contentDoc = dbResults.documentContent[0];
      const snippet = contentDoc.content ? contentDoc.content.substring(0, 300) : 'No content available';
      return `I found relevant information in the document "${contentDoc.originalName}". Here's what I found: ${snippet}... Would you like me to search for more specific information?`;
    }
    
    if (dbResults.documents.length > 0) {
      const docCount = dbResults.documents.length;
      const docTypes = [...new Set(dbResults.documents.map(d => d.mimeType.split('/')[1]))].join(', ');
      const recentDocs = dbResults.documents.slice(0, 3).map(d => d.originalName).join(', ');
      return `I found ${docCount} document(s) related to your query. These include ${docTypes} files. Recent documents: ${recentDocs}. Would you like me to help you find something specific?`;
    }
  }
  const lowerQuery = query.toLowerCase();
  
  // Search in document content first
  const documentResults = await searchDocumentContent(query, userId);
  
  if (documentResults.length > 0) {
    const contextData = documentResults.map(result => {
      const docName = result.document[0]?.originalName || 'Unknown';
      const snippet = result.content.substring(0, 500);
      return `Document: ${docName}\nContent: ${snippet}`;
    }).join('\n\n');

    const messages = [
      {
        role: 'system',
        content: `You are a helpful assistant for a document management system. Answer the user's question based on the following document content. Provide specific information from the documents and mention which document contains the information.`
      },
      {
        role: 'user',
        content: `Question: ${query}\n\nDocument Content:\n${contextData}`
      }
    ];

    // Use AI API
    let aiResponse;
    try {
      const modelConfig = AI_MODELS[selectedModel];
      if (modelConfig) {
        if (modelConfig.provider === 'vertex' && process.env.GOOGLE_API_KEY) {
          aiResponse = await callVertexAI(messages, modelConfig.model, 300);
        } else if (modelConfig.provider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
          aiResponse = await callOpenRouter(messages, modelConfig.model, 300);
        }
      }
    } catch (error) {
      console.error('AI API error:', error.response?.data || error.message);
    }

    if (aiResponse) {
      // Add download links
      aiResponse += '\n\n**Related Documents:**\n';
      documentResults.forEach((result, index) => {
        const docName = result.document[0]?.originalName || 'Unknown';
        const docId = result.document[0]?._id;
        aiResponse += `${index + 1}. <a href="${process.env.BACKEND_URL || 'http://localhost:5000'}/api/documents/${docId}/download" target="_blank">${docName}</a>\n`;
      });
      return aiResponse;
    }
    
    // Fallback response if AI APIs fail
    let response = "I found relevant documents:\n\n";
    documentResults.forEach((result, index) => {
      const docName = result.document[0]?.originalName || 'Unknown';
      const docId = result.document[0]?._id;
      const snippet = result.content.substring(0, 200) + '...';
      response += `${index + 1}. **${docName}**\n`;
      response += `Content: ${snippet}\n`;
      response += `<a href="${process.env.BACKEND_URL || 'http://localhost:5000'}/api/documents/${docId}/download" target="_blank">Download Document</a>\n\n`;
    });
    return response;
  }
  
  // Check if query is related to website content
  const websiteKeywords = ['document', 'upload', 'folder', 'tag', 'search', 'file', 'feature', 'api', 'login', 'register', 'help', 'how', 'website', 'use', 'what', 'system', 'management', 'secure', 'security', 'safe', 'visible', 'see', 'access', 'private', 'share', 'sharing', 'user', 'users', 'work'];
  const isRelated = websiteKeywords.some(keyword => lowerQuery.includes(keyword));
  
  // if (!isRelated) {
  //   return "I can only help with questions about our document management system features and functionality.";
  // }

  // Try AI APIs for general queries
  const messages = [
    {
      role: 'system',
      content: `You are a helpful assistant for a document management system. Only answer questions related to the following features: ${WEBSITE_CONTENT}. Keep responses concise and helpful.`
    },
    {
      role: 'user',
      content: query
    }
  ];

  // Try AI APIs for general queries
  try {
    const modelConfig = AI_MODELS[selectedModel];
    if (modelConfig) {
      if (modelConfig.provider === 'vertex' && process.env.GOOGLE_API_KEY) {
        return await callVertexAI(messages, modelConfig.model, 150);
      } else if (modelConfig.provider === 'openrouter' && process.env.OPENROUTER_API_KEY) {
        return await callOpenRouter(messages, modelConfig.model, 150);
      }
    }
  } catch (error) {
    console.error('AI API error:', error.response?.data || error.message);
  }

  // Fallback responses
  if (lowerQuery.includes('upload')) {
    return "You can upload documents using the upload button or drag-and-drop interface. Supported file types include PDFs, images, and common document formats.";
  }
  if (lowerQuery.includes('folder')) {
    return "Create hierarchical folder structures to organize your documents. Use the sidebar to create, navigate, and manage folders.";
  }
  if (lowerQuery.includes('search')) {
    return "Use the search bar to find documents by name. You can also filter by starred, shared status, or browse by folders.";
  }
  if (lowerQuery.includes('tag')) {
    return "Organize documents with colored tags. Create custom tags and assign them to documents for better categorization.";
  }
  if (lowerQuery.includes('api')) {
    return "Our API includes endpoints for authentication (/api/auth), documents (/api/documents), folders (/api/folders), and tags (/api/tags).";
  }
  if (lowerQuery.includes('login') || lowerQuery.includes('register')) {
    return "Use the login page to access your account or register for a new account. Authentication is required to access the document management features.";
  }
  if (lowerQuery.includes('website') || lowerQuery.includes('use') || lowerQuery.includes('what')) {
    return "This is a document management system. You can upload, organize, and manage your files with features like hierarchical folders, colored tags, search functionality, and secure user authentication. It helps you keep all your documents organized in one place with easy access and sharing capabilities.";
  }
  if (lowerQuery.includes('visible') || lowerQuery.includes('see') || lowerQuery.includes('access') || lowerQuery.includes('private')) {
    return "Your uploaded files are completely private and secure. Only you can see and access your documents. Other users cannot view your files unless you explicitly share them. Each user has their own private document space.";
  }
  if (lowerQuery.includes('secure') || lowerQuery.includes('security') || lowerQuery.includes('safe')) {
    return "Yes, this system is secure. We use JWT authentication, password hashing with bcryptjs, and all documents are stored privately per user. Your files are protected and only accessible to you unless you choose to share them.";
  }
  if (lowerQuery.includes('share') || lowerQuery.includes('sharing')) {
    return "You can share documents with other users if you choose to. By default, all your files are private. You can use the share feature to give specific users access to your documents with different permission levels (read, write, delete).";
  }
  
  if (lowerQuery.includes('help') || lowerQuery.includes('how') || lowerQuery.includes('work')) {
    return "Here's how to use our document management system:\n\n1. **Upload**: Click the Upload button or drag & drop files\n2. **Organize**: Create folders to organize your documents\n3. **Search**: Use the search bar to find specific files\n4. **Tags**: Add colored tags to categorize documents\n5. **Share**: Share documents with other users if needed\n6. **Security**: All your files are private by default\n\nWhat would you like to learn more about?";
  }
  
  return "Our document management system helps you upload, organize, and manage files with features like folders, tags, search, and secure authentication. What specific feature would you like to know about?";
}

// Add new route for database-aware queries
router.post('/query', auth, async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || message.trim().length === 0) {
      return res.status(400).json({ message: 'Query message is required' });
    }

    // Extract keywords from user query
    const keywords = extractKeywords(message);
    
    // Search database for relevant information
    const retrievedData = await searchDatabase(keywords);
    
    // Generate AI response with database context
    const aiResponse = await generateAIResponse(message, req.user._id);
    
    res.json({
      query: message,
      keywords,
      response: aiResponse,
      dataFound: {
        users: retrievedData.users.length,
        documents: retrievedData.documents.length,
        documentContent: retrievedData.documentContent.length
      }
    });

  } catch (error) {
    console.error('Chatbot query error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// Get available AI models
router.get('/models', (req, res) => {
  const models = Object.entries(AI_MODELS).map(([key, config]) => ({
    id: key,
    name: config.name,
    provider: config.provider
  }));
  res.json({ models });
});

router.post('/chat', auth, async (req, res) => {
  try {
    console.log('Chatbot request received:', req.body);
    const { message, model = 'gemini-flash' } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    console.log('Processing message:', message, 'with model:', model);
    const response = await generateAIResponse(message, req.user._id, model);
    console.log('AI response:', response);
    
    res.json({
      query: message,
      response,
      model,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;