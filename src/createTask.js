const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Initialize DynamoDB client with automatic retries and timeout
const dynamoDB = new AWS.DynamoDB.DocumentClient({
  maxRetries: 3,
  httpOptions: {
    timeout: 5000
  }
});

// Common response headers
const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key'
};

// Valid task statuses
const VALID_STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  // Handle preflight OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: ''
    };
  }
  
  try {
    const requestBody = JSON.parse(event.body);
    
    // Input validation
    const validationError = validateTaskInput(requestBody);
    if (validationError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: validationError })
      };
    }
    
    const taskId = uuidv4();
    const timestamp = new Date().toISOString();
    const userId = event.requestContext?.authorizer?.claims?.sub || 'anonymous';
    
    const task = {
      id: taskId,
      userId,
      title: requestBody.title.trim(),
      description: requestBody.description ? requestBody.description.trim() : '',
      status: requestBody.status || 'PENDING',
      priority: requestBody.priority || 'MEDIUM',
      dueDate: requestBody.dueDate || null,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    
    const params = {
      TableName: process.env.TASKS_TABLE,
      Item: task,
      // Ensure idempotency with conditional expression
      ConditionExpression: 'attribute_not_exists(id)'
    };
    
    await dynamoDB.put(params).promise();
    
    // Log successful task creation
    console.log(`Task created successfully: ${taskId}`);
    
    return {
      statusCode: 201,
      headers,
      body: JSON.stringify(task)
    };
  } catch (error) {
    console.error('Error creating task:', error);
    
    // Handle specific error types
    if (error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 409,
        headers,
        body: JSON.stringify({ error: 'Task with this ID already exists' })
      };
    }
    
    if (error.name === 'ValidationException') {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid input data' })
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to create task',
        requestId: event.requestContext?.requestId
      })
    };
  }
};

/**
 * Validates task input data
 * @param {Object} taskData - The task data to validate
 * @returns {string|null} - Error message or null if valid
 */
function validateTaskInput(taskData) {
  if (!taskData) {
    return 'Request body is required';
  }
  
  if (!taskData.title || taskData.title.trim().length === 0) {
    return 'Task title is required';
  }
  
  if (taskData.title.trim().length > 100) {
    return 'Task title must be less than 100 characters';
  }
  
  if (taskData.description && taskData.description.length > 1000) {
    return 'Task description must be less than 1000 characters';
  }
  
  if (taskData.status && !VALID_STATUSES.includes(taskData.status)) {
    return `Status must be one of: ${VALID_STATUSES.join(', ')}`;
  }
  
  if (taskData.priority && !['LOW', 'MEDIUM', 'HIGH'].includes(taskData.priority)) {
    return 'Priority must be one of: LOW, MEDIUM, HIGH';
  }
  
  if (taskData.dueDate && isNaN(Date.parse(taskData.dueDate))) {
    return 'Due date must be a valid date';
  }
  
  return null;
}
