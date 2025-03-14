const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const dynamoDB = new AWS.DynamoDB.DocumentClient();

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  try {
    const requestBody = JSON.parse(event.body);
    
    if (!requestBody.title) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Task title is required' })
      };
    }
    
    const taskId = uuidv4();
    const timestamp = new Date().toISOString();
    
    const task = {
      id: taskId,
      title: requestBody.title,
      description: requestBody.description || '',
      status: requestBody.status || 'PENDING',
      createdAt: timestamp,
      updatedAt: timestamp
    };
    
    const params = {
      TableName: process.env.TASKS_TABLE,
      Item: task
    };
    
    await dynamoDB.put(params).promise();
    
    return {
      statusCode: 201,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(task)
    };
  } catch (error) {
    console.error('Error creating task:', error);
    
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Failed to create task' })
    };
  }
};
