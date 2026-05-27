import db from "../db.server";
import { useLoaderData } from "react-router";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  DataTable,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

  const collectionsResponse = await admin.graphql(`
    query GetCollections {
      collections(first: 100) {
        edges {
          node {
            id
            title
            sortOrder
            productsCount {
              count
            }
          }
        }
      }
    }
  `);

  const collectionsData = await collectionsResponse.json();

  const collections =
    collectionsData?.data?.collections?.edges?.map((edge) => ({
      id: edge.node.id,
      title: edge.node.title,
      sortOrder: edge.node.sortOrder,
      productsCount: edge.node.productsCount?.count || 0,
    })) || [];

  const savedRules = await db.sortingRule.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
  });

  const executionLogs = await db.ruleExecutionLog.findMany({
    where: {
      sortingRule: {
        shop: session.shop,
      },
    },
    include: {
      sortingRule: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 20,
  });

  const totalCollections = collections.length;
  const manualCollections = collections.filter(
    (collection) => collection.sortOrder === "MANUAL",
  ).length;

  const totalProducts = collections.reduce(
    (sum, collection) => sum + collection.productsCount,
    0,
  );

  const activeRules = savedRules.filter((rule) => rule.isActive).length;
  const totalRuns = executionLogs.length;
  const successfulRuns = executionLogs.filter(
    (log) => log.status === "success",
  ).length;
  const partialRuns = executionLogs.filter(
    (log) => log.status === "partial",
  ).length;
  const failedRuns = executionLogs.filter(
    (log) => log.status === "failed",
  ).length;

  return {
    totalCollections,
    manualCollections,
    totalProducts,
    savedRulesCount: savedRules.length,
    activeRules,
    totalRuns,
    successfulRuns,
    partialRuns,
    failedRuns,
    executionLogs,
  };
}

export default function AnalyticsPage() {
  const {
    totalCollections,
    manualCollections,
    totalProducts,
    savedRulesCount,
    activeRules,
    totalRuns,
    successfulRuns,
    partialRuns,
    failedRuns,
    executionLogs,
  } = useLoaderData();

  const logRows = executionLogs.map((log) => [
    log.sortingRule?.name || "Deleted strategy",
    log.status,
    log.message,
    formatDate(log.startedAt),
  ]);

  return (
    <Page
      title="Analytics"
      subtitle="Basic sorting activity and collection health"
      fullWidth
    >
      <BlockStack gap="400">
        <InlineStack gap="400" wrap>
          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued">Total collections</Text>
              <Text as="h2" variant="headingLg">{totalCollections}</Text>
              <Badge tone="success">{manualCollections} manual</Badge>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued">Products in collections</Text>
              <Text as="h2" variant="headingLg">{totalProducts}</Text>
              <Badge tone="info">catalog coverage</Badge>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued">Saved strategies</Text>
              <Text as="h2" variant="headingLg">{savedRulesCount}</Text>
              <Badge tone="success">{activeRules} active</Badge>
            </BlockStack>
          </Card>

          <Card>
            <BlockStack gap="100">
              <Text as="p" tone="subdued">Automation runs</Text>
              <Text as="h2" variant="headingLg">{totalRuns}</Text>
              <Badge tone="success">{successfulRuns} successful</Badge>
            </BlockStack>
          </Card>
        </InlineStack>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between">
              <Text as="h2" variant="headingMd">
                Run summary
              </Text>
              <Badge tone="info">Live data</Badge>
            </InlineStack>

            <DataTable
              columnContentTypes={["text", "numeric"]}
              headings={["Metric", "Count"]}
              rows={[
                ["Successful runs", successfulRuns],
                ["Partial runs", partialRuns],
                ["Failed runs", failedRuns],
                ["Manual-sort ready collections", manualCollections],
              ]}
            />
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <Text as="h2" variant="headingMd">
              Recent automation activity
            </Text>

            {executionLogs.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "text", "text", "text"]}
                headings={["Strategy", "Status", "Message", "Started"]}
                rows={logRows}
              />
            ) : (
              <Text as="p" tone="subdued">
                No automation activity yet. Run a saved strategy to start collecting analytics.
              </Text>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}