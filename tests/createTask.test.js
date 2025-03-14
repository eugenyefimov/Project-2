const { handler } = require('../src/createTask');
const AWS = require('aws-sdk');

// Mock DynamoDB
jest.mock('aws-sdk', () => {
  const mDynamoDBDocumentClient = {
    put: jest.fn().mockReturnThis(),
    promise: jest.fn().mockResolvedValue({})
  };
  
  const mDynamoDB = {
    DocumentClient: jest.fn(() => mDynamoDBDocumentClient)
  };
  
  return {
    DynamoDB: mDynamoDB
  };
});

describe('createTask Lambda function', () => {
  beforeEach(() => {
    process.env.TASKS_TABLE = 'Tasks';
    jest.clearAllMocks();
  });
  
  test('should create a task successfully', async () => {
    const event = {
      body: JSON.stringify({
        title: 'Test Task',
        description: 'This is a test task',
        status: 'PENDING'
      })
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.title).toBe('Test Task');
    expect(body.description).toBe('This is a test task');
    expect(body.status).toBe('PENDING');
    expect(body.id).toBeDefined();
  });
  
  test('should return 400 if title is missing', async () => {
    const event = {
      body: JSON.stringify({
        description: 'This is a test task without a title'
      })
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Task title is required');
  });
});