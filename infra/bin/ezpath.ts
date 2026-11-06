#!/usr/bin/env node
import "source-map-support/register";
import { App } from "aws-cdk-lib";
import { EzPathRoutingStack } from "../lib/ezpath-routing-stack";

const app = new App();
const region = app.node.tryGetContext("region") ?? process.env.EZPATH_AWS_REGION ?? "ap-south-1";

new EzPathRoutingStack(app, "EzPathRoutingStack", {
  description: "EzPath routing API and versioned graph infrastructure",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region,
  },
});
