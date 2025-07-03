const express = require('express');
const auth = require('../middleware/auth');
const axios = require('axios');
const Document = require('../models/Document');
const DocumentContent = require('../models/DocumentContent');
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Website content knowledge base
const WEBSITE_CONTENT = `
Odoo Documents Clone - A document management system with features:
- Upload, view, download, delete documents
- Folder organization with hierarchical structures
- Search and filter documents
- File tagging with colors
- User authentication and security
- Drag & drop upload interface
- Built with React.js, Node.js, MongoDB
- API endpoints for documents, folders, tags, authentication
`;

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

// AI response function with document search
async function generateAIResponse(query, userId) {
  const lowerQuery = query.toLowerCase();
  
  // Search in document content first
  const documentResults = await searchDocumentContent(query, userId);
  
  if (documentResults.length > 0) {
    // Use OpenAI to generate response with document context
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
      try {
        const contextData = documentResults.map(result => {
          const docName = result.document[0]?.originalName || 'Unknown';
          const snippet = result.content.substring(0, 500);
          return `Document: ${docName}\nContent: ${snippet}`;
        }).join('\n\n');

        const response = await axios.post('https://api.openai.com/v1/chat/completions', {
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: `You are a helpful assistant for a document management system. Answer the user's question based on the following document content. Provide specific information from the documents and mention which document contains the information.`
            },
            {
              role: 'user',
              content: `Question: ${query}\n\nDocument Content:\n${contextData}`
            }
          ],
          max_tokens: 300,
          temperature: 0.7
        }, {
          headers: {
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        });

        let aiResponse = response.data.choices[0].message.content;
        
        // Add download links
        aiResponse += '\n\n**Related Documents:**\n';
        documentResults.forEach((result, index) => {
          const docName = result.document[0]?.originalName || 'Unknown';
          const docId = result.document[0]?._id;
          aiResponse += `${index + 1}. <a href="http://localhost:5000/api/documents/${docId}/download" target="_blank">${docName}</a>\n`;
        });
        
        return aiResponse;
      } catch (error) {
        console.error('OpenAI API error:', error);
      }
    }
    
    // Fallback response
    let response = "I found relevant documents:\n\n";
    documentResults.forEach((result, index) => {
      const docName = result.document[0]?.originalName || 'Unknown';
      const docId = result.document[0]?._id;
      const snippet = result.content.substring(0, 200) + '...';
      response += `${index + 1}. **${docName}**\n`;
      response += `Content: ${snippet}\n`;
      response += `<a href="http://localhost:5000/api/documents/${docId}/download" target="_blank">Download Document</a>\n\n`;
    });
    return response;
  }
  
  // Check if query is related to website content
  const websiteKeywords = ['document', 'upload', 'folder', 'tag', 'search', 'file', 'odoo', 'feature', 'api', 'login', 'register', 'help', 'how', 'website', 'use', 'what', 'system', 'management', 'secure', 'security', 'safe', 'visible', 'see', 'access', 'private', 'share', 'sharing', 'user', 'users', 'work'];
  const isRelated = websiteKeywords.some(keyword => lowerQuery.includes(keyword));
  
  if (!isRelated) {
    return "I can only help with questions about our document management system features and functionality.";
  }

  // Try OpenAI first if API key is available
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'your_openai_api_key_here') {
    try {
      const response = await axios.post('https://api.openai.com/v1/chat/completions', {
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are a helpful assistant for a document management system. Only answer questions related to the following features: ${WEBSITE_CONTENT}. Keep responses concise and helpful.`
          },
          {
            role: 'user',
            content: query
          }
        ],
        max_tokens: 150,
        temperature: 0.7
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('OpenAI API error:', error.response?.data || error.message);
    }
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
    return "This is a document management system similar to Odoo Documents. You can upload, organize, and manage your files with features like hierarchical folders, colored tags, search functionality, and secure user authentication. It helps you keep all your documents organized in one place with easy access and sharing capabilities.";
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

router.post('/chat', auth, async (req, res) => {
  try {
    console.log('Chatbot request received:', req.body);
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }
    
    console.log('Processing message:', message);
    const response = await generateAIResponse(message, req.user._id);
    console.log('AI response:', response);
    
    res.json({
      query: message,
      response,
      timestamp: new Date()
    });
  } catch (error) {
    console.error('Chatbot error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;