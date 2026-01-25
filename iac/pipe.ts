import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

/**
 * EventBridge Pipe Component
 *
 * Purpose: Connect DynamoDB Streams to EventBridge Bus
 *
 * This custom component creates an EventBridge Pipe that:
 * 1. Reads from DynamoDB Stream (source)
 * 2. Filters records based on criteria
 * 3. Transforms records to EventBridge events
 * 4. Publishes to EventBridge Bus (target)
 */

export interface EventBridgePipeArgs {
  /**
   * Name of the pipe resource
   */
  name: string;

  /**
   * ARN of the DynamoDB Stream (source)
   * Example: arn:aws:dynamodb:us-east-1:123456789012:table/Bots/stream/2024-01-01T00:00:00.000
   */
  sourceArn: pulumi.Input<string>;

  /**
   * ARN of the EventBridge Bus (target)
   * Example: arn:aws:events:us-east-1:123456789012:event-bus/TradingEvents
   */
  targetArn: pulumi.Input<string>;

  /**
   * Filter pattern to select which DynamoDB records to process
   * Only records matching this pattern will be sent to EventBridge
   */
  filterPattern?: string;
}

/**
 * Custom EventBridge Pipe Component
 *
 * Creates the necessary IAM roles and EventBridge Pipe resource
 * to connect DynamoDB Streams to EventBridge Bus
 */
export class EventBridgePipe extends pulumi.ComponentResource {
  /**
   * The EventBridge Pipe resource
   */
  public readonly pipe: aws.pipes.Pipe;

  /**
   * IAM role used by the pipe to read from source and write to target
   */
  public readonly role: aws.iam.Role;

  constructor(
    args: EventBridgePipeArgs,
    opts?: pulumi.ComponentResourceOptions,
  ) {
    super("custom:aws:EventBridgePipe", args.name, {}, opts);

    /**
     * IAM Role for EventBridge Pipe
     *
     * This role allows the pipe to:
     * 1. Read from DynamoDB Stream (source)
     * 2. Write to EventBridge Bus (target)
     */
    this.role = new aws.iam.Role(
      `${args.name}-role`,
      {
        assumeRolePolicy: JSON.stringify({
          Version: "2012-10-17",
          Statement: [
            {
              Effect: "Allow",
              Principal: {
                Service: "pipes.amazonaws.com",
              },
              Action: "sts:AssumeRole",
            },
          ],
        }),
      },
      { parent: this },
    );

    /**
     * IAM Policy: Allow reading from DynamoDB Stream
     *
     * Permissions:
     * - DescribeStream: Get stream metadata
     * - GetRecords: Read stream records
     * - GetShardIterator: Navigate stream shards
     */
    const sourcePolicy = new aws.iam.RolePolicy(
      `${args.name}-source-policy`,
      {
        role: this.role.id,
        policy: pulumi.interpolate`{
          "Version": "2012-10-17",
          "Statement": [
            {
              "Effect": "Allow",
              "Action": [
                "dynamodb:DescribeStream",
                "dynamodb:GetRecords",
                "dynamodb:GetShardIterator",
                "dynamodb:ListStreams"
              ],
              "Resource": "${args.sourceArn}"
            }
          ]
        }`,
      },
      { parent: this },
    );

    /**
     * IAM Policy: Allow writing to EventBridge Bus
     *
     * Permissions:
     * - PutEvents: Publish events to the bus
     */
    const targetPolicy = new aws.iam.RolePolicy(
      `${args.name}-target-policy`,
      {
        role: this.role.id,
        policy: pulumi.interpolate`{
          "Version": "2012-10-17",
          "Statement": [
            {
              "Effect": "Allow",
              "Action": [
                "events:PutEvents"
              ],
              "Resource": "${args.targetArn}"
            }
          ]
        }`,
      },
      { parent: this },
    );

    /**
     * EventBridge Pipe Resource
     *
     * Connects DynamoDB Stream to EventBridge Bus with:
     * - Filtering: Only process CONFIG items
     * - Batching: Process up to 10 records at once
     * - Transformation: Convert DynamoDB records to EventBridge events
     */
    this.pipe = new aws.pipes.Pipe(
      args.name,
      {
        roleArn: this.role.arn,

        // Source: DynamoDB Stream
        source: args.sourceArn,
        sourceParameters: {
          dynamodbStreamParameters: {
            // Start from the latest position in the stream
            startingPosition: "LATEST",

            // Process up to 10 records per batch for efficiency
            batchSize: 10,

            // Maximum time to wait before processing a partial batch
            maximumBatchingWindowInSeconds: 1,
          },

          // Filter: Only process records where SK = "CONFIG"
          // This prevents processing STATE and ORDER updates
          filterCriteria: args.filterPattern
            ? {
                filters: [
                  {
                    pattern: args.filterPattern,
                  },
                ],
              }
            : undefined,
        },

        // Target: EventBridge Bus
        target: args.targetArn,
        targetParameters: {

          // Transform DynamoDB record to EventBridge event format
          inputTemplate: JSON.stringify({
            // Extract bot ID from partition key
            botId: "<$.dynamodb.Keys.PK.S>",

            // Include new configuration values
            newConfig: "<$.dynamodb.NewImage>",

            // Include old configuration values (for MODIFY events)
            oldConfig: "<$.dynamodb.OldImage>",

            // Event timestamp
            timestamp: "<$.dynamodb.ApproximateCreationDateTime>",
          }),
        },
      },
      {
        parent: this,
        dependsOn: [sourcePolicy, targetPolicy],
      },
    );

    this.registerOutputs({
      pipeArn: this.pipe.arn,
      roleArn: this.role.arn,
    });
  }
}
