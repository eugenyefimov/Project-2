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

// Mock UUID to have predictable IDs in tests
jest.mock('uuid', () => ({
  v4: jest.fn().mockReturnValue('test-uuid-1234')
}));

describe('createTask Lambda function', () => {
  let mockDynamoDBClient;
  
  beforeEach(() => {
    process.env.TASKS_TABLE = 'Tasks';
    jest.clearAllMocks();
    
    // Get reference to the mocked DynamoDB client
    mockDynamoDBClient = new AWS.DynamoDB.DocumentClient();
  });
  
  test('should create a task successfully', async () => {
    const event = {
      body: JSON.stringify({
        title: 'Test Task',
        description: 'This is a test task',
        status: 'PENDING'
      }),
      requestContext: {
        authorizer: {
          claims: {
            sub: 'user-123'
          }
        }
      }
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.title).toBe('Test Task');
    expect(body.description).toBe('This is a test task');
    expect(body.status).toBe('PENDING');
    expect(body.id).toBe('test-uuid-1234');
    expect(body.userId).toBe('user-123');
    expect(body.createdAt).toBeDefined();
    expect(body.updatedAt).toBeDefined();
    
    // Verify DynamoDB was called with correct parameters
    expect(mockDynamoDBClient.put).toHaveBeenCalledWith({
      TableName: 'Tasks',
      Item: expect.objectContaining({
        id: 'test-uuid-1234',
        title: 'Test Task',
        description: 'This is a test task',
        status: 'PENDING',
        userId: 'user-123'
      }),
      ConditionExpression: 'attribute_not_exists(id)'
    });
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
  
  test('should handle OPTIONS request for CORS', async () => {
    const event = {
      httpMethod: 'OPTIONS'
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(200);
    expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(response.headers['Access-Control-Allow-Methods']).toContain('POST');
  });
  
  test('should validate task title length', async () => {
    const event = {
      body: JSON.stringify({
        title: 'a'.repeat(101), // Title too long
        description: 'This is a test task'
      })
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Task title must be less than 100 characters');
  });
  
  test('should validate task description length', async () => {
    const event = {
      body: JSON.stringify({
        title: 'Test Task',
        description: 'a'.repeat(1001) // Description too long
      })
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Task description must be less than 1000 characters');
  });
  
  test('should validate task status', async () => {
    const event = {
      body: JSON.stringify({
        title: 'Test Task',
        status: 'INVALID_STATUS'
      })
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('Status must be one of:');
  });
  
  test('should handle DynamoDB errors', async () => {
    // Setup DynamoDB to throw an error
    mockDynamoDBClient.promise.mockRejectedValueOnce(new Error('DynamoDB error'));
    
    const event = {
      body: JSON.stringify({
        title: 'Test Task',
        description: 'This is a test task'
      })
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Failed to create task');
  });
  
  test('should handle ConditionalCheckFailedException', async () => {
    // Setup DynamoDB to throw a ConditionalCheckFailedException
    const error = new Error('Conditional check failed');
    error.name = 'ConditionalCheckFailedException';
    mockDynamoDBClient.promise.mockRejectedValueOnce(error);
    
    const event = {
      body: JSON.stringify({
        title: 'Test Task',
        description: 'This is a test task'
      })
    };
    
    const response = await handler(event);
    
    expect(response.statusCode).toBe(409);
    const body = JSON.parse(response.body);
    expect(body.error).toBe('Task with this ID already exists');
  });
});