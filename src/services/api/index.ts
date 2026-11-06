import { ApiClient } from './client';
import { DemoApiAdapter, demoApiAdapter } from './demoAdapter';
import { AwsApiClient } from './awsClient';
import { isDemoMode } from '../../config/runtime';

let activeClient: ApiClient;

if (isDemoMode) {
  activeClient = demoApiAdapter;
} else {
  activeClient = new AwsApiClient();
}

export function getApiClient(): ApiClient {
  return activeClient;
}

export { demoApiAdapter, DemoApiAdapter, AwsApiClient };
export { isDemoMode } from '../../config/runtime';
export * from './client';

