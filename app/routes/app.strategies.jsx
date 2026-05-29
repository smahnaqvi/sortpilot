import db from "../db.server";
import {
  useLoaderData,
  useSubmit,
  useActionData,
  useNavigation,
} from "react-router";
import { useMemo, useState } from "react";
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
  Divider,
  IndexTable,
  Pagination,
  EmptyState,
} from "@shopify/polaris";

import { getCurrentPlan } from "../models/plans.server";
import { getPlanFeatures } from "../models/plan-features";

import { authenticate } from "../shopify.server";

const PAGE_SIZE = 25;

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
  const currentPlan = await getCurrentPlan(admin);
  const features = getPlanFeatures(currentPlan.name);

  const collectionsResponse = await admin.graphql(`
    query GetCollectionsForStrategies {
      collections(first: 250) {
        edges {
          node {
            id
            title
            handle
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
      handle: edge.node.handle,
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
    currentPlan,
    features,
  };
}

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);
  const currentPlan = await getCurrentPlan(admin);
  const features = getPlanFeatures(currentPlan.name);

  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "create_rule") {
    if (!features.savedStrategies) {
      return {
        ok: false,
        message: "Saved strategies are available on the Scale plan and higher.",
      };
    }

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
  const { collections, savedRules, executionLogs, currentPlan, features } = useLoaderData();
  const actionData = useActionData();
  const navigation = useNavigation();
  const submit = useSubmit();

  const isWorking = navigation.state === "submitting";

  const [ruleName, setRuleName] = useState("");
  const [rule, setRule] = useState("inventory_high_low");
  const [schedule, setSchedule] = useState("manual");
  const [selectedCollectionIds, setSelectedCollectionIds] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);

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

  const filterOptions = [
    { label: "All collections", value: "all" },
    { label: "Manual only", value: "manual" },
    { label: "Not manual", value: "not_manual" },
  ];

  const filteredCollections = useMemo(() => {
    return collections.filter((collection) => {
      const searchText = `${collection.title} ${collection.handle || ""}`.toLowerCase();
      const matchesQuery = !query || searchText.includes(query.toLowerCase());
      const isManual = collection.sortOrder === "MANUAL";

      const matchesFilter =
        filter === "all" ||
        (filter === "manual" && isManual) ||
        (filter === "not_manual" && !isManual);

      return matchesQuery && matchesFilter;
    });
  }, [collections, filter, query]);

  const totalPages = Math.max(1, Math.ceil(filteredCollections.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pagedCollections = filteredCollections.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  const pagedCollectionIds = pagedCollections.map((collection) => collection.id);

  const allVisibleSelected =
    pagedCollectionIds.length > 0 &&
    pagedCollectionIds.every((id) => selectedCollectionIds.includes(id));

  const someVisibleSelected =
    pagedCollectionIds.some((id) => selectedCollectionIds.includes(id)) &&
    !allVisibleSelected;

  function toggleCollection(collectionId) {
    setSelectedCollectionIds((current) => {
      if (current.includes(collectionId)) {
        return current.filter((id) => id !== collectionId);
      }

      return [...current, collectionId];
    });
  }

  function toggleSelectVisible() {
    setSelectedCollectionIds((current) => {
      if (allVisibleSelected) {
        return current.filter((id) => !pagedCollectionIds.includes(id));
      }

      return Array.from(new Set([...current, ...pagedCollectionIds]));
    });
  }

  function clearSelectedCollections() {
    setSelectedCollectionIds([]);
  }

  function selectAllFilteredCollections() {
    setSelectedCollectionIds(filteredCollections.map((collection) => collection.id));
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

        {!features.savedStrategies ? (
          <Banner tone="warning" title="Saved strategies are available on Scale and higher">
            <p>Your current plan is {currentPlan.name}. Upgrade to create reusable strategies and scheduled automation.</p>
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
                  Choose a rule, schedule, and assign it to one or many collections.
                </Text>
              </BlockStack>

              <Badge tone="info">{selectedCollectionIds.length} selected</Badge>
            </InlineStack>

            <InlineStack gap="400" blockAlign="end" wrap>
              <div style={{ minWidth: 260, flex: "1 1 260px" }}>
                <TextField
                  label="Strategy name"
                  value={ruleName}
                  onChange={setRuleName}
                  disabled={!features.savedStrategies}
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
                  disabled={!features.savedStrategies}
                />
              </div>

              <div style={{ minWidth: 180 }}>
                <Select
                  label="Schedule"
                  options={scheduleOptions}
                  value={schedule}
                  onChange={setSchedule}
                  disabled={!features.savedStrategies}
                />
              </div>
            </InlineStack>

            <Divider />

            <Card padding="0">
              <div style={{ padding: "16px" }}>
                <InlineStack gap="400" blockAlign="end" wrap>
                  <div style={{ minWidth: 300, flex: "1 1 320px" }}>
                    <TextField
                      label="Search collections"
                      value={query}
                      onChange={(value) => {
                        setQuery(value);
                        setPage(1);
                      }}
                      placeholder="Search by collection title or handle"
                      autoComplete="off"
                      clearButton
                      onClearButtonClick={() => setQuery("")}
                    />
                  </div>

                  <div style={{ minWidth: 220 }}>
                    <Select
                      label="Filter"
                      options={filterOptions}
                      value={filter}
                      onChange={(value) => {
                        setFilter(value);
                        setPage(1);
                      }}
                    />
                  </div>

                  <InlineStack gap="200">
                    <Button onClick={selectAllFilteredCollections}>
                      Select all filtered
                    </Button>

                    <Button onClick={clearSelectedCollections}>
                      Clear
                    </Button>
                  </InlineStack>
                </InlineStack>
              </div>

              <IndexTable
                resourceName={{ singular: "collection", plural: "collections" }}
                itemCount={filteredCollections.length}
                selectable={false}
                headings={[
                  {
                    title: (
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        ref={(input) => {
                          if (input) input.indeterminate = someVisibleSelected;
                        }}
                        onChange={toggleSelectVisible}
                        aria-label="Select visible collections"
                        style={{ width: 16, height: 16 }}
                      />
                    ),
                  },
                  { title: "Collection" },
                  { title: "Products" },
                  { title: "Sort order" },
                ]}
              >
                {pagedCollections.map((collection, index) => {
                  const selected = selectedCollectionIds.includes(collection.id);
                  const manual = collection.sortOrder === "MANUAL";

                  return (
                    <IndexTable.Row
                      id={collection.id}
                      key={collection.id}
                      position={index}
                    >
                      <IndexTable.Cell>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => {
                            event.stopPropagation();
                            toggleCollection(collection.id);
                          }}
                          onClick={(event) => event.stopPropagation()}
                          aria-label={`Select ${collection.title}`}
                          style={{ width: 16, height: 16 }}
                        />
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <Text as="span" fontWeight="semibold">
                          {collection.title}
                        </Text>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        <Text as="span">{collection.productsCount}</Text>
                      </IndexTable.Cell>

                      <IndexTable.Cell>
                        {manual ? (
                          <Badge tone="success">Manual</Badge>
                        ) : (
                          <Badge tone="warning">Not manual</Badge>
                        )}
                      </IndexTable.Cell>
                    </IndexTable.Row>
                  );
                })}
              </IndexTable>

              {filteredCollections.length === 0 ? (
                <div style={{ padding: 24 }}>
                  <EmptyState
                    heading="No collections match your filters"
                    image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                  >
                    <p>Try changing the search or filter.</p>
                  </EmptyState>
                </div>
              ) : null}

              <div style={{ padding: "12px 16px", borderTop: "1px solid #ebebeb" }}>
                <InlineStack align="space-between" blockAlign="center">
                  <Text as="p" tone="subdued">
                    Showing {pagedCollections.length} of {filteredCollections.length} collections
                  </Text>

                  <Pagination
                    hasPrevious={currentPage > 1}
                    onPrevious={() => setPage((value) => Math.max(1, value - 1))}
                    hasNext={currentPage < totalPages}
                    onNext={() => setPage((value) => Math.min(totalPages, value + 1))}
                  />
                </InlineStack>
              </div>
            </Card>

            <InlineStack align="end">
              <Button
                variant="primary"
                loading={isWorking}
                disabled={!features.savedStrategies || !ruleName || selectedCollectionIds.length === 0 || isWorking}
                onClick={createStrategy}
              >
                Create strategy
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>
        {features.analytics && (
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
        )}

        {features.analytics && (
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
        )}
      </BlockStack>
    </Page>
  );
}
