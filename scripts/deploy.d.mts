export declare const DEPLOY_STEPS: readonly string[];
export declare const DEPLOY_ENVIRONMENTS: Readonly<
  Record<string, Readonly<{ releaseDir: string; pm2Name: string; healthUrl: string }>>
>;

export interface DeployStep {
  step: string;
  argv: string[] | null;
  display: string;
}

export declare function pm2ProcessExistsFromDescribe(
  name: string,
  result: {
    status: number | null;
    stdout?: string;
    stderr?: string;
    error?: Error;
  },
): boolean;
export declare function getEnvConfig(envName: string): {
  releaseDir: string;
  pm2Name: string;
  healthUrl: string;
};
export declare function buildDeployPlan(envName: string): DeployStep[];
export declare function stripSqlComments(sql: string): string;
export declare function findDestructiveStatements(sql: string): string[];
export declare function parseAppliedMigrations(output: string): string[];
export declare function findPendingMigrations(
  localNames: string[],
  appliedNames: string[],
): string[];
export declare function findMissingMigrationSql(
  localNames: string[],
  hasSql: (name: string) => boolean,
): string[];
export declare function auditPendingMigrations(
  pendingNames: string[],
  readSql: (name: string) => string,
  acknowledgedNames?: string[],
): Array<{ name: string; codes: string[] }>;
export declare function selfCheck(): void;
