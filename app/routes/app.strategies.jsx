import db from "../db.server";
import {
  useLoaderData,
  useSubmit,
  useActionData,
  useNavigation,
} from "react-router";
import { useState } from "react";
import {
  Page,
  Card,
  Text,
  BlockStack,
  InlineStack,
  Badge,
  Button,
  Banner,
  DataTable,
  TextField,
  Select,
  Checkbox,
  Divider,
} from "@shopify/polaris";

import { authenticate } from "../shopify.server";

function safeJsonParse(value, fallback = []) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function humanRule(rule) {
  const labels = {
    inventory_high_low: "Inventory: High to Low",
    inventory_low_high: "Inventory: Low to High",
    price_high_low: "Price: High to Low",
    price_low_high: "Price: Low to High",
    newest_first: "Newest First",
    oldest_first: "Oldest First",
    title_az: "Title A-Z",
    title_za: "Title Z-A",
    randomize: "Randomize",
  };

  return labels[rule] || rule;
}

function humanSchedule(schedule) {
  const labels = {
    manual: "Manual only",
    daily: "Daily",
    hourly: "Hourly",
  };

  return labels[schedule] || schedule;
}

function formatDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function getNextRunDate(schedule) {
  const now = new Date();

  if (schedule === "hourly") {
    now.setHours(now.getHours() + 1);
    return now;
  }

  if (schedule === "daily") {
    now.setDate(now.getDate() + 1);
    return now;
  }

  return null;
}

export async function loader({ request }) {
  const { admin, session } = await authenticate.admin(request);

  const collectionsResponse = await admin.graphql(`
    query GetCollectionsForStrategies {
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
    where: {
      shop: session.shop,
    },
    orderBy: {
      createdAt: "desc",
    },
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

  return {
    collections,
    savedRules,
    executionLogs,
  };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create_rule") {
    const ruleName = String(formData.get("ruleName") || "").trim();
    const rule = String(formData.get("rule") || "inventory_high_low");
    const schedule = String(formData.get("schedule") || "manual");
    const collectionIds = formData.getAll("collectionIds");

    if (!ruleName) {
      return { ok: false, message: "Strategy name is required." };
    }

    if (!collectionIds.length) {
      return { ok: false, message: "Select at least one collection." };
    }

    const existingRule = await db.sortingRule.findFirst({
      where: {
        shop: session.shop,
        name: ruleName,
      },
    });

    if (existingRule) {
      return { ok: false, message: "A strategy with this name already exists." };
    }

    await db.sortingRule.create({
      data: {
        shop: session.shop,
        name: ruleName,
        rule,
        collectionIds: JSON.stringify(collectionIds),
        schedule,
        isActive: schedule !== "manual",
        nextRunAt: getNextRunDate(schedule),
      },
    });

    return { ok: true, message: "Strategy created successfully." };
  }

  const ruleId = Number(formData.get("ruleId"));

  if (!ruleId) {
    return {
      ok: false,
      message: "Rule ID is required.",
    };
  }

  const savedRule = await db.sortingRule.findFirst({
    where: {
      id: ruleId,
      shop: session.shop,
    },
  });

  if (!savedRule) {
    return {
      ok: false,
      message: "Rule not found.",
    };
  }

  if (intent === "toggle_rule") {
    const nextActiveState = !savedRule.isActive;

    await db.sortingRule.update({
      where: {
        id: savedRule.id,
      },
      data: {
        isActive: nextActiveState,
        nextRunAt: nextActiveState
          ? getNextRunDate(savedRule.schedule)
          : null,
      },
    });

    return {
      ok: true,
      message: nextActiveState ? "Strategy activated." : "Strategy paused.",
    };
  }

  if (intent === "delete_rule") {
    await db.sortingRule.delete({
      where: {
        id: savedRule.id,
      },
    });

    return {
      ok: true,
      message: "Strategy deleted.",
    };
  }

  return {
    ok: false,
    message: "Invalid action.",
  };
}

export default function StrategiesPage() {
  const { collections, savedRules, executionLogs } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();

  const isWorking = navigation.state === "submitting";

  const [ruleName, setRuleName] = useState("");
  const [rule, setRule] = useState("inventory_high_low");
  const [schedule, setSchedule] = useState("manual");
  const [selectedCollectionIds, setSelectedCollectionIds] = useState([]);

  const ruleOptions = [
    { label: "Inventory: High to Low", value: "inventory_high_low" },
    { label: "Inventory: Low to High", value: "inventory_low_high" },
    { label: "Price: High to Low", value: "price_high_low" },
    { label: "Price: Low to High", value: "price_low_high" },
    { label: "Newest Products First", value: "newest_first" },
    { label: "Oldest Products First", value: "oldest_first" },
    { label: "Title: A to Z", value: "title_az" },
    { label: "Title: Z to A", value: "title_za" },
    { label: "Randomize Products", value: "randomize" },
  ];

  const scheduleOptions = [
    { label: "Manual only", value: "manual" },
    { label: "Daily", value: "daily" },
    { label: "Hourly", value: "hourly" },
  ];

  function toggleCollection(collectionId) {
    setSelectedCollectionIds((current) => {
      if (current.includes(collectionId)) {
        return current.filter((id) => id !== collectionId);
      }

      return [...current, collectionId];
    });
  }

  function createStrategy() {
    const formData = new FormData();

    formData.set("intent", "create_rule");
    formData.set("ruleName", ruleName);
    formData.set("rule", rule);
    formData.set("schedule", schedule);

    selectedCollectionIds.forEach((collectionId) => {
      formData.append("collectionIds", collectionId);
    });

    submit(formData, { method: "post" });

    setRuleName("");
    setSelectedCollectionIds([]);
  }

  function toggleRule(ruleId) {
    const formData = new FormData();

    formData.set("intent", "toggle_rule");
    formData.set("ruleId", String(ruleId));

    submit(formData, { method: "post" });
  }

  function deleteRule(ruleId) {
    const confirmed = window.confirm(
      "Delete this strategy? This cannot be undone.",
    );

    if (!confirmed) return;

    const formData = new FormData();

    formData.set("intent", "delete_rule");
    formData.set("ruleId", String(ruleId));

    submit(formData, { method: "post" });
  }

  const logRows = executionLogs.map((log) => [
    log.sortingRule?.name || "Deleted strategy",
    log.status,
    log.message,
    formatDate(log.startedAt),
    log.completedAt ? formatDate(log.completedAt) : "Running",
  ]);

  return (
    <Page
      title="Strategies"
      subtitle="Create reusable sorting strategies and assign them to collections"
      fullWidth
    >
      <BlockStack gap="400">
        {actionData ? (
          <Banner
            tone={actionData.ok ? "success" : "critical"}
            title="Strategy update"
          >
            <p>{actionData.message}</p>
          </Banner>
        ) : null}

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <Text as="h2" variant="headingMd">
                  Create Strategy
                </Text>

                <Text as="p" tone="subdued">
                  Save a rule once and let SortPilot run it for one or more collections.
                </Text>
              </BlockStack>

              <Badge tone="info">Automation</Badge>
            </InlineStack>

            <InlineStack gap="400" blockAlign="end" wrap>
              <div style={{ minWidth: 260, flex: "1 1 260px" }}>
                <TextField
                  label="Strategy name"
                  value={ruleName}
                  onChange={setRuleName}
                  placeholder="Example: High inventory first"
                  autoComplete="off"
                />
              </div>

              <div style={{ minWidth: 240 }}>
                <Select
                  label="Sorting rule"
                  options={ruleOptions}
                  value={rule}
                  onChange={setRule}
                />
              </div>

              <div style={{ minWidth: 180 }}>
                <Select
                  label="Schedule"
                  options={scheduleOptions}
                  value={schedule}
                  onChange={setSchedule}
                />
              </div>
            </InlineStack>

            <Divider />

            <BlockStack gap="200">
              <InlineStack align="space-between" blockAlign="center">
                <Text as="h3" variant="headingSm">
                  Collections
                </Text>

                <Badge>{selectedCollectionIds.length} selected</Badge>
              </InlineStack>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 12,
                }}
              >
                {collections.map((collection) => (
                  <div
                    key={collection.id}
                    style={{
                      padding: 12,
                      border: "1px solid #e3e3e3",
                      borderRadius: 10,
                      background: "#fff",
                    }}
                  >
                    <Checkbox
                      label={`${collection.title} (${collection.productsCount} products)`}
                      checked={selectedCollectionIds.includes(collection.id)}
                      onChange={() => toggleCollection(collection.id)}
                    />
                  </div>
                ))}
              </div>
            </BlockStack>

            <InlineStack align="end">
              <Button
                variant="primary"
                loading={isWorking}
                disabled={!ruleName || selectedCollectionIds.length === 0 || isWorking}
                onClick={createStrategy}
              >
                Create strategy
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <Text as="h2" variant="headingMd">
                  Saved Strategies
                </Text>

                <Text as="p" tone="subdued">
                  These strategies control scheduled collection sorting.
                </Text>
              </BlockStack>

              <Badge>{savedRules.length} saved</Badge>
            </InlineStack>

            {savedRules.length === 0 ? (
              <Text as="p" tone="subdued">
                No strategies saved yet. Create your first strategy above.
              </Text>
            ) : (
              <BlockStack gap="200">
                {savedRules.map((savedRule) => {
                  const collectionIds = safeJsonParse(savedRule.collectionIds, []);

                  return (
                    <Card key={savedRule.id} background="bg-surface-secondary">
                      <BlockStack gap="250">
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="050">
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="h3" variant="headingSm">
                                {savedRule.name}
                              </Text>

                              <Badge tone={savedRule.isActive ? "success" : "warning"}>
                                {savedRule.isActive ? "Active" : "Paused"}
                              </Badge>
                            </InlineStack>

                            <Text as="p" tone="subdued">
                              {humanRule(savedRule.rule)} · {humanSchedule(savedRule.schedule)}
                            </Text>
                          </BlockStack>

                          <button
                            type="button"
                            onClick={() => toggleRule(savedRule.id)}
                            disabled={isWorking}
                            style={{
                              width: 46,
                              height: 26,
                              borderRadius: 999,
                              border: "none",
                              padding: 2,
                              background: savedRule.isActive ? "#303030" : "#d1d5db",
                              cursor: "pointer",
                            }}
                          >
                            <span
                              style={{
                                display: "block",
                                width: 22,
                                height: 22,
                                borderRadius: "50%",
                                background: "#fff",
                                transform: savedRule.isActive
                                  ? "translateX(20px)"
                                  : "translateX(0)",
                                transition: "transform 140ms ease",
                              }}
                            />
                          </button>
                        </InlineStack>

                        <InlineStack gap="200" wrap>
                          <Badge>Collections: {collectionIds.length}</Badge>
                          <Badge>Last run: {formatDate(savedRule.lastRunAt)}</Badge>
                          <Badge>Next run: {formatDate(savedRule.nextRunAt)}</Badge>
                        </InlineStack>

                        <InlineStack gap="200">
                          <Button
                            size="slim"
                            onClick={() => toggleRule(savedRule.id)}
                            disabled={isWorking}
                          >
                            {savedRule.isActive ? "Pause" : "Activate"}
                          </Button>

                          <Button
                            size="slim"
                            tone="critical"
                            onClick={() => deleteRule(savedRule.id)}
                            disabled={isWorking}
                          >
                            Delete
                          </Button>
                        </InlineStack>
                      </BlockStack>
                    </Card>
                  );
                })}
              </BlockStack>
            )}
          </BlockStack>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="050">
                <Text as="h2" variant="headingMd">
                  Recent Automation Runs
                </Text>

                <Text as="p" tone="subdued">
                  Latest execution history for scheduled sorting.
                </Text>
              </BlockStack>

              <Badge>{executionLogs.length} logs</Badge>
            </InlineStack>

            {executionLogs.length > 0 ? (
              <DataTable
                columnContentTypes={["text", "text", "text", "text", "text"]}
                headings={["Strategy", "Status", "Message", "Started", "Completed"]}
                rows={logRows}
              />
            ) : (
              <Text as="p" tone="subdued">
                No automation logs yet.
              </Text>
            )}
          </BlockStack>
        </Card>
      </BlockStack>
    </Page>
  );
}
