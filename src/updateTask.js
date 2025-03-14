const AWS = require('aws-sdk');
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
  'Access-Control-Allow-Methods': 'PUT, OPTIONS',
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
  
  // Validate path parameters
  if (!event.pathParameters || !event.pathParameters.id) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Task ID is required' })
    };
  }
  
  const taskId = event.pathParameters.id;
  const userId = event.requestContext?.authorizer?.claims?.sub || 'anonymous';
  
  try {
    const requestBody = JSON.parse(event.body);
    
    // Validate input
    const validationError = validateTaskInput(requestBody);
    if (validationError) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: validationError })
      };
    }
    
    // Check if task exists
    const getParams = {
      TableName: process.env.TASKS_TABLE,
      Key: {
        id: taskId
      }
    };
    
    const taskResult = await dynamoDB.get(getParams).promise();
    
    if (!taskResult.Item) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Task not found' })
      };
    }
    
    // Check if user owns the task
    if (taskResult.Item.userId && taskResult.Item.userId !== userId && !event.requestContext?.authorizer?.claims?.isAdmin) {
      return {
        statusCode: 403,
        headers,
        body: JSON.stringify({ error: 'You do not have permission to update this task' })
      };
    }
    
    const timestamp = new Date().toISOString();
    
    // Build update expression
    let updateExpression = 'SET updatedAt = :updatedAt';
    const expressionAttributeValues = {
      ':updatedAt': timestamp,
      ':currentId': taskId // For condition check
    };
    
    const expressionAttributeNames = {
      '#status': 'status'
    };
    
    if (requestBody.title) {
      updateExpression += ', title = :title';
      expressionAttributeValues[':title'] = requestBody.title.trim();
    }
    
    if (requestBody.description !== undefined) {
      updateExpression += ', description = :description';
      expressionAttributeValues[':description'] = requestBody.description ? requestBody.description.trim() : '';
    }
    
    if (requestBody.status) {
      updateExpression += ', #status = :status';
      expressionAttributeValues[':status'] = requestBody.status;
    }
    
    if (requestBody.priority) {
      updateExpression += ', priority = :priority';
      expressionAttributeValues[':priority'] = requestBody.priority;
    }
    
    if (requestBody.dueDate) {
      updateExpression += ', dueDate = :dueDate';
      expressionAttributeValues[':dueDate'] = requestBody.dueDate;
    }
    
    const updateParams = {
      TableName: process.env.TASKS_TABLE,
      Key: {
        id: taskId
      },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ExpressionAttributeNames: expressionAttributeNames,
      ConditionExpression: 'id = :currentId', // Ensure task still exists
      ReturnValues: 'ALL_NEW'
    };
    
    const result = await dynamoDB.update(updateParams).promise();
    
    // Log successful update
    console.log(`Task updated successfully: ${taskId}`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(result.Attributes)
    };
  } catch (error) {
    console.error('Error updating task:', error);
    
    // Handle specific error types
    if (error.name === 'ConditionalCheckFailedException') {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Task no longer exists' })
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
        error: 'Failed to update task',
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
  if (!taskData || Object.keys(taskData).length === 0) {
    return 'No update data provided';
  }
  
  if (taskData.title && taskData.title.trim().length === 0) {
    return 'Task title cannot be empty';
  }
  
  if (taskData.title && taskData.title.trim().length > 100) {
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
