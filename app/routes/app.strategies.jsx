import db from "../db.server";
import {
  useLoaderData,
  useSubmit,
  useActionData,
  useNavigation,
} from "react-router";
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
  const { session } = await authenticate.admin(request);

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
    savedRules,
    executionLogs,
  };
}

export async function action({ request }) {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const intent = formData.get("intent");
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
      message: nextActiveState
        ? "Strategy activated."
        : "Strategy paused.",
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
  const { savedRules, executionLogs } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();

  const isWorking = navigation.state === "submitting";

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
      subtitle="Manage saved sorting strategies and automation schedules"
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
                  Saved Strategies
                </Text>

                <Text as="p" tone="subdued">
                  These rules control how collections are sorted automatically.
                </Text>
              </BlockStack>

              <Badge>{savedRules.length} saved</Badge>
            </InlineStack>

            {savedRules.length === 0 ? (
              <Text as="p" tone="subdued">
                No strategies saved yet. Create one from the Collections page.
              </Text>
            ) : (
              <BlockStack gap="200">
                {savedRules.map((savedRule) => {
                  const collectionIds = safeJsonParse(
                    savedRule.collectionIds,
                    [],
                  );

                  return (
                    <Card key={savedRule.id} background="bg-surface-secondary">
                      <BlockStack gap="250">
                        <InlineStack align="space-between" blockAlign="center">
                          <BlockStack gap="050">
                            <InlineStack gap="200" blockAlign="center">
                              <Text as="h3" variant="headingSm">
                                {savedRule.name}
                              </Text>

                              <Badge
                                tone={
                                  savedRule.isActive ? "success" : "warning"
                                }
                              >
                                {savedRule.isActive ? "Active" : "Paused"}
                              </Badge>
                            </InlineStack>

                            <Text as="p" tone="subdued">
                              {humanRule(savedRule.rule)} ·{" "}
                              {humanSchedule(savedRule.schedule)}
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
                              background: savedRule.isActive
                                ? "#303030"
                                : "#d1d5db",
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
                columnContentTypes={[
                  "text",
                  "text",
                  "text",
                  "text",
                  "text",
                ]}
                headings={[
                  "Strategy",
                  "Status",
                  "Message",
                  "Started",
                  "Completed",
                ]}
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