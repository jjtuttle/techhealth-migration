import * as cdk from "aws-cdk-lib";
import { Stack, StackProps } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import * as iam from "aws-cdk-lib/aws-iam";

import { Construct } from "constructs";

export class Project2Stack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props?: StackProps) {
    super(scope, id, props);

    // Create a VPC with 2 AZs - 1 public and 1 private per AZ.
    const vpc = new ec2.Vpc(this, "MigrationVPC", {
      maxAzs: 2,
      subnetConfiguration: [
        {
          // AZ Public subnets.
          cidrMask: 24,
          name: "publicSubnet",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          // AZ Private Subnets.
          cidrMask: 24,
          name: "privateSubnet",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    }); // VPC

    // Security Group - for EC2 (Allows SSH & App(HTTP) traffic).
    const ec2SecurityGroup = new ec2.SecurityGroup(this, "EC2SecurityGroup", {
      vpc,
      allowAllOutbound: true,
      description: "Security Group for EC2 instances",
    });
    // Add SSH & HTTP ports o the instances.
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(22),
      "Allow SSH"
    );
    ec2SecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(80),
      "Allow HTTP"
    );

    // Security Group fro RDS - (Allows traffic from EC2).
    const rdsSecurityGroup = new ec2.SecurityGroup(this, "rdsSecurityGroup", {
      vpc,
      allowAllOutbound: true,
      description: "Security Group for RDS instance.",
    });
    // Add DB Port.
    rdsSecurityGroup.addIngressRule(
      ec2SecurityGroup,
      ec2.Port.tcp(3306),
      "Allow MySQL from EC2"
    );

    // IAM Role for EC2 Instances.
    const ec2Role = new iam.Role(this, "EC2IAMRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazon.com"),
    });
    // Manage policy
    ec2Role.addManagedPolicy(
      iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore")
    );

    // Launch EC2 in public subnet.
    const ec2Instance = new ec2.Instance(this, "MigrationEC2", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T3,
        ec2.InstanceSize.MICRO
      ),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      securityGroup: ec2SecurityGroup,
      role: ec2Role,
    });

    // Create RDSInstance in private subnet.
    new rds.DatabaseInstance(this, "MigrationDB", {
      engine: rds.DatabaseInstanceEngine.mysql({
        version: rds.MysqlEngineVersion.VER_8_0,
      }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [rdsSecurityGroup],
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.BURSTABLE3,
        ec2.InstanceSize.MICRO
      ),
      allocatedStorage: 20,
      removalPolicy: cdk.RemovalPolicy.DESTROY, // **** WARNING: **** Deletes DBon removal of Stack!
    });
  }
}
